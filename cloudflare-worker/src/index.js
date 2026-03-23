/**
 * Nosana Fleet Dashboard — Cloudflare Worker  v0.01.9
 * Receives host status from monitors, serves a dashboard, and sends
 * Web Push alerts when hosts go down or become stale.
 *
 * Alert levels: critical, warning, info (recovery)
 * In-page Web Audio tones via SW-to-page messaging
 */

import { sendPushNotification, generateVapidKeys } from './push.js';

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

const STALE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes
const TOKEN_RE = /^\/d\/([A-Za-z0-9_-]+)/;

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function htmlResponse(html, status = 200) {
  return new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html;charset=UTF-8' },
  });
}

/* ------------------------------------------------------------------ */
/*  Alert classification                                              */
/* ------------------------------------------------------------------ */

/**
 * Classify an alert into critical / warning / info.
 *
 * @param {object} opts
 * @param {number} opts.m         - machine flag (1=up, 0=down)
 * @param {number} opts.c         - container flag
 * @param {number} opts.n         - node flag
 * @param {boolean} opts.stale    - host has not reported in 5+ min
 * @param {boolean} opts.recovery - host was down/stale but now all checks pass
 * @returns {'critical'|'warning'|'info'}
 */
function classifyAlert({ m, c, n, stale = false, recovery = false }) {
  if (recovery) return 'info';
  if (Number(m) === 0 || stale) return 'critical';
  if (Number(c) === 0 || Number(n) === 0) return 'warning';
  return 'info';
}

/**
 * Build a title string for the given alert level.
 */
function alertTitle(level) {
  if (level === 'critical') return '\u{1F6A8} CRITICAL';
  if (level === 'warning') return '\u{26A0}\u{FE0F} WARNING';
  return '\u{2705} Recovered';
}

/* ------------------------------------------------------------------ */
/*  Push delivery                                                     */
/* ------------------------------------------------------------------ */

/**
 * Send push alerts to every subscriber for a given token.
 * Automatically prunes expired/invalid subscriptions (404 / 410).
 */
async function sendAlerts(token, message, env) {
  const subsKey = `subs:${token}`;
  const raw = await env.PUSH_SUBS.get(subsKey);
  if (!raw) return;

  let subs;
  try {
    subs = JSON.parse(raw);
  } catch {
    return;
  }
  if (!Array.isArray(subs) || subs.length === 0) return;

  const vapidKeys = {
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
  };

  const kept = [];

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        const res = await sendPushNotification(sub, message, vapidKeys);
        if (res && (res.status === 404 || res.status === 410)) {
          // subscription expired — drop it
          return;
        }
        kept.push(sub);
      } catch {
        // Network error — keep the subscription for next attempt
        kept.push(sub);
      }
    }),
  );

  if (kept.length !== subs.length) {
    await env.PUSH_SUBS.put(subsKey, JSON.stringify(kept));
  }
}

/* ------------------------------------------------------------------ */
/*  Route: POST /d/TOKEN  — ingest host status                       */
/* ------------------------------------------------------------------ */

async function handleStatusPost(token, request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }

  const { host, m, c, n, q } = body;
  if (!host) return jsonResponse({ error: 'Missing host' }, 400);

  // Read existing data for this token
  const raw = await env.FLEET_DATA.get(token);
  const data = raw ? JSON.parse(raw) : {};

  // Capture previous state for recovery detection
  const prev = data[host] || null;
  const wasDown =
    prev &&
    (prev.alerted === true ||
      Number(prev.m) === 0 ||
      Number(prev.c) === 0 ||
      Number(prev.n) === 0);

  const allUpNow =
    Number(m) === 1 && Number(c) === 1 && Number(n) === 1;

  const isDown = Number(m) === 0 || Number(c) === 0 || Number(n) === 0;

  // Update host entry
  data[host] = {
    m: m ?? 0,
    c: c ?? 0,
    n: n ?? 0,
    q: q ?? '',
    seen: Date.now(),
    alerted: isDown, // keep alerted true while any metric is down
  };

  await env.FLEET_DATA.put(token, JSON.stringify(data));

  // --- Recovery alert ---
  if (wasDown && allUpNow) {
    const level = 'info';
    const payload = JSON.stringify({
      title: alertTitle(level),
      body: `\u{1F7E2} ${host}: all checks passed — recovered`,
      level,
      url: `/d/${token}`,
    });
    await sendAlerts(token, payload, env);
  }

  // --- Down alert ---
  if (isDown) {
    const parts = [];
    if (Number(m) === 0) parts.push('machine DOWN');
    if (Number(c) === 0) parts.push('container DOWN');
    if (Number(n) === 0) parts.push('node DOWN');

    const level = classifyAlert({ m, c, n });
    const icon = level === 'critical' ? '\u{1F534}' : '\u{1F7E1}';
    const payload = JSON.stringify({
      title: alertTitle(level),
      body: `${icon} ${host}: ${parts.join(', ')}`,
      level,
      url: `/d/${token}`,
    });

    await sendAlerts(token, payload, env);
  }

  return jsonResponse({ ok: true });
}

/* ------------------------------------------------------------------ */
/*  Route: GET /d/TOKEN  — serve dashboard HTML                      */
/* ------------------------------------------------------------------ */

async function handleDashboardGet(token, env) {
  const raw = await env.FLEET_DATA.get(token);
  const data = raw ? JSON.parse(raw) : {};
  const vapidPublicKey = env.VAPID_PUBLIC_KEY || '';

  const hosts = Object.entries(data).sort(([a], [b]) => a.localeCompare(b));

  const now = Date.now();

  function indicator(val, seen) {
    const stale = now - seen > STALE_THRESHOLD_MS;
    if (stale) return '\u{2753}';
    if (Number(val) === 0) return '\u{274C}';
    return '\u{1F7E2}';
  }

  function seenAgo(ts) {
    const diff = Math.round((now - ts) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  }

  const rows = hosts
    .map(
      ([name, h]) => `
      <tr data-host="${name}" data-n="${h.n}" data-q="${h.q}" data-seen="${h.seen}">
        <td class="host">${name}</td>
        <td>${indicator(h.n, h.seen)}</td>
        <td class="q">${h.q || '-'}</td>
        <td class="seen">${seenAgo(h.seen)}</td>
      </tr>`,
    )
    .join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="theme-color" content="#111111">
  <link rel="manifest" href="/d/${token}/manifest.json">
  <link rel="icon" href="/icon-192.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/icon-192.svg">
  <title>Nosana Fleet</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,monospace;
         background:#111;color:#e0e0e0;padding:12px;font-size:14px}
    h1{font-size:18px;margin-bottom:8px;color:#fff}
    .legend{font-size:11px;color:#888;margin-bottom:12px}
    table{width:100%;border-collapse:collapse}
    th,td{padding:6px 8px;text-align:center;border-bottom:1px solid #2a2a2a;width:1%;white-space:nowrap}
    th{color:#aaa;font-size:10px;text-transform:uppercase;cursor:pointer;user-select:none;
       padding:6px 8px;vertical-align:bottom}
    th:not(:first-child){height:80px;position:relative}
    th:not(:first-child) div{position:absolute;bottom:-6px;left:calc(50% - 5px);transform:rotate(-90deg);transform-origin:0 0;white-space:nowrap}
    th:first-child div{padding:0}
    th:hover{color:#fff}
    th.sorted-asc::after{content:" \\25B2";font-size:9px}
    th.sorted-desc::after{content:" \\25BC";font-size:9px}
    td.host{text-align:left;font-weight:600;color:#fff}
    td.q{font-size:12px;color:#ccc}
    td.seen{font-size:11px;color:#888}
    .actions{margin:16px 0}
    .btn-row{display:flex;gap:8px;flex-wrap:wrap}
    button{background:#16a34a;color:#fff;border:none;padding:10px 16px;
           border-radius:6px;font-size:13px;cursor:pointer;flex:1;min-width:120px}
    button:hover{background:#15803d}
    button.on{background:#dc2626}
    button.on:hover{background:#b91c1c}
    .status-msg{font-size:12px;color:#888;margin-top:4px}
    .hint{font-size:11px;color:#f59e0b;margin-top:8px;line-height:1.5}
    .hint a{color:#60a5fa}
    .empty{text-align:center;padding:32px;color:#666}
    @media(max-width:400px){th,td{padding:4px 4px;font-size:12px}}
  </style>
</head>
<body>
  <h1>Nosana Fleet</h1>
  <div class="legend">Tap column header to sort</div>
  ${
    hosts.length === 0
      ? '<div class="empty">No host data yet. Waiting for monitors...</div>'
      : `<table id="fleet">
    <thead>
      <tr>
        <th data-col="host" data-type="string"><div>Host</div></th>
        <th data-col="n" data-type="num"><div>Node</div></th>
        <th data-col="q" data-type="string"><div>Queue</div></th>
        <th data-col="seen" data-type="num"><div>Seen</div></th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>`
  }

  <div class="actions">
    <div class="btn-row">
      <button id="pushBtn">Enable Push</button>
      <button id="soundBtn">Enable Sound</button>
      <button id="installBtn" style="display:none">Install App</button>
    </div>
    <div class="status-msg" id="statusMsg"></div>
  </div>

  <script>
    const TOKEN = ${JSON.stringify(token)};
    const VAPID_PUBLIC_KEY = ${JSON.stringify(vapidPublicKey)};

    /* ---- Sortable columns ---- */
    (function() {
      const table = document.getElementById('fleet');
      if (!table) return;
      const headers = table.querySelectorAll('th');
      let currentSort = null;
      let sortDir = 1;

      headers.forEach((th, idx) => {
        th.addEventListener('click', () => {
          const type = th.dataset.type;
          const col = th.dataset.col;

          if (currentSort === col) {
            sortDir *= -1;
          } else {
            currentSort = col;
            sortDir = 1;
          }

          headers.forEach(h => h.classList.remove('sorted-asc', 'sorted-desc'));
          th.classList.add(sortDir === 1 ? 'sorted-asc' : 'sorted-desc');

          const tbody = table.querySelector('tbody');
          const rows = Array.from(tbody.querySelectorAll('tr'));

          rows.sort((a, b) => {
            let va, vb;
            if (col === 'host') {
              va = a.dataset.host;
              vb = b.dataset.host;
            } else if (col === 'seen') {
              va = Number(a.dataset.seen);
              vb = Number(b.dataset.seen);
            } else if (col === 'q') {
              va = a.dataset.q;
              vb = b.dataset.q;
            } else {
              va = Number(a.dataset[col]);
              vb = Number(b.dataset[col]);
            }

            if (type === 'num') return (va - vb) * sortDir;
            return String(va).localeCompare(String(vb)) * sortDir;
          });

          rows.forEach(r => tbody.appendChild(r));
        });
      });
    })();

    /* ---- Web Audio tone generator ---- */
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    let audioCtx = null;

    function ensureAudioCtx() {
      if (!audioCtx) audioCtx = new AudioCtx();
      return audioCtx;
    }

    function playTone(type) {
      const ctx = ensureAudioCtx();
      const now = ctx.currentTime;

      if (type === 'critical') {
        // Urgent alarm: 3 descending tones, repeated
        for (let r = 0; r < 3; r++) {
          const offset = r * 0.8;
          [880, 660, 440].forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'square';
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.3, now + offset + i * 0.2);
            gain.gain.exponentialRampToValueAtTime(0.01, now + offset + i * 0.2 + 0.18);
            osc.connect(gain).connect(ctx.destination);
            osc.start(now + offset + i * 0.2);
            osc.stop(now + offset + i * 0.2 + 0.2);
          });
        }
      } else if (type === 'warning') {
        // Double beep
        [0, 0.3].forEach(offset => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = 740;
          gain.gain.setValueAtTime(0.25, now + offset);
          gain.gain.exponentialRampToValueAtTime(0.01, now + offset + 0.2);
          osc.connect(gain).connect(ctx.destination);
          osc.start(now + offset);
          osc.stop(now + offset + 0.25);
        });
      } else {
        // Soft ascending chime
        [523, 659].forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = freq;
          gain.gain.setValueAtTime(0.15, now + i * 0.2);
          gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.2 + 0.3);
          osc.connect(gain).connect(ctx.destination);
          osc.start(now + i * 0.2);
          osc.stop(now + i * 0.2 + 0.35);
        });
      }
    }

    /* ---- SW message listener (in-page audio) ---- */
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'nosana-alert' && pageSoundEnabled) {
          playTone(event.data.level || 'warning');
        }
      });
    }

    /* ---- Push subscription ---- */
    const pushBtn = document.getElementById('pushBtn');
    const soundBtn = document.getElementById('soundBtn');
    const msg = document.getElementById('statusMsg');

    function urlBase64ToUint8Array(base64String) {
      const padding = '='.repeat((4 - base64String.length % 4) % 4);
      const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
      const raw = atob(base64);
      const arr = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
      return arr;
    }

    function setPushEnabled() {
      pushBtn.textContent = 'Disable Push';
      pushBtn.classList.add('on');
    }
    function setPushDisabled() {
      pushBtn.textContent = 'Enable Push';
      pushBtn.classList.remove('on');
    }

    async function enableAlerts() {
      pushBtn.disabled = true;
      msg.textContent = 'Registering service worker...';
      try {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
          const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
          const isStandalone = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;
          if (isIOS && !isStandalone) {
            msg.innerHTML = '<span class="hint">iOS requires this page to be a home screen app:<br>' +
              '1. Tap the <b>Share</b> button (box with arrow)<br>' +
              '2. Scroll down and tap <b>"Add to Home Screen"</b><br>' +
              '3. Open from the home screen icon<br>' +
              '4. Then tap Enable Push</span>';
          } else {
            const ua = navigator.userAgent;
            const isBrave = navigator.brave && navigator.brave.isBrave;
            if (isBrave || /Brave/.test(ua)) {
              msg.innerHTML = '<span class="hint">Brave blocks push by default.<br>' +
                'Go to <b>brave://settings/privacy</b> and enable<br>' +
                '<b>"Use Google services for push messaging"</b>, then reload.</span>';
            } else {
              msg.innerHTML = '<span class="hint">Push not supported in this browser.<br>' +
                'Works out of the box in: Chrome, Firefox, Edge, Opera.</span>';
            }
          }
          pushBtn.disabled = false;
          return;
        }
        const reg = await navigator.serviceWorker.register('/sw.js');
        await navigator.serviceWorker.ready;
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          msg.textContent = 'Notification permission denied.';
          pushBtn.disabled = false;
          return;
        }
        msg.textContent = 'Subscribing...';
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
        const res = await fetch('/d/' + TOKEN + '/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sub.toJSON()),
        });
        if (!res.ok) throw new Error('Subscribe failed: ' + res.status);
        setPushEnabled();
        msg.textContent = '';
      } catch (err) {
        msg.textContent = 'Error: ' + err.message;
        setPushDisabled();
      }
      pushBtn.disabled = false;
    }

    async function disableAlerts() {
      pushBtn.disabled = true;
      msg.textContent = 'Unsubscribing...';
      try {
        const reg = await navigator.serviceWorker.getRegistration('/sw.js');
        if (reg) {
          const sub = await reg.pushManager.getSubscription();
          if (sub) {
            await fetch('/d/' + TOKEN + '/unsubscribe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ endpoint: sub.endpoint }),
            });
            await sub.unsubscribe();
          }
        }
        setPushDisabled();
        msg.textContent = '';
      } catch (err) {
        msg.textContent = 'Error: ' + err.message;
      }
      pushBtn.disabled = false;
    }

    pushBtn.addEventListener('click', () => {
      if (pushBtn.classList.contains('on')) disableAlerts();
      else enableAlerts();
    });

    /* ---- Page Sound toggle ---- */
    let pageSoundEnabled = localStorage.getItem('nosana-page-sound') === 'on';

    function setSoundEnabled() {
      soundBtn.textContent = 'Disable Sound';
      soundBtn.classList.add('on');
      pageSoundEnabled = true;
      localStorage.setItem('nosana-page-sound', 'on');
    }
    function setSoundDisabled() {
      soundBtn.textContent = 'Enable Sound';
      soundBtn.classList.remove('on');
      pageSoundEnabled = false;
      localStorage.setItem('nosana-page-sound', 'off');
    }

    soundBtn.addEventListener('click', () => {
      if (pageSoundEnabled) {
        setSoundDisabled();
      } else {
        // Ensure AudioContext is created inside a user gesture
        ensureAudioCtx();
        setSoundEnabled();
      }
    });

    // Restore sound state on load
    if (pageSoundEnabled) setSoundEnabled();

    /* ---- Check existing push subscription ---- */
    (async function() {
      try {
        if ('serviceWorker' in navigator) {
          const reg = await navigator.serviceWorker.getRegistration('/sw.js');
          if (reg) {
            const sub = await reg.pushManager.getSubscription();
            if (sub) setPushEnabled();
          }
        }
      } catch {}
    })();

    /* ---- Install prompt (Android/Desktop) ---- */
    let deferredPrompt = null;
    const installBtn = document.getElementById('installBtn');
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      installBtn.style.display = '';
    });
    installBtn.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      const result = await deferredPrompt.userChoice;
      if (result.outcome === 'accepted') {
        installBtn.style.display = 'none';
      }
      deferredPrompt = null;
    });
    window.addEventListener('appinstalled', () => {
      installBtn.style.display = 'none';
    });

    /* ---- Auto-refresh ---- */
    setTimeout(() => location.reload(), 60000);
  </script>
</body>
</html>`;

  return htmlResponse(html);
}

/* ------------------------------------------------------------------ */
/*  Route: GET /sw.js  — serve Service Worker                        */
/* ------------------------------------------------------------------ */

const SERVICE_WORKER_JS = `
self.addEventListener('push', (event) => {
  let data = { title: 'Nosana Alert', body: 'Status change detected', level: 'warning' };
  try {
    if (event.data) data = event.data.json();
  } catch (e) {
    data.body = 'Alert received (parse error)';
  }

  const level = data.level || 'warning';

  // Vibration patterns per level
  const vibrationMap = {
    critical: [500, 200, 500, 200, 500],
    warning:  [200, 100, 200],
    info:     [100],
  };

  // Tag prefixes per level
  const tagPrefix = {
    critical: 'nosana-crit-',
    warning:  'nosana-warn-',
    info:     'nosana-info-',
  };

  const options = {
    body: data.body,
    tag: (tagPrefix[level] || 'nosana-') + Date.now(),
    renotify: true,
    requireInteraction: level === 'critical',
    vibrate: vibrationMap[level] || vibrationMap.warning,
    data: { url: data.url || '/', level: level },
  };

  // Try to forward alert data to a focused dashboard tab for in-page audio
  const messageClients = self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    .then((windowClients) => {
      for (const client of windowClients) {
        client.postMessage({
          type: 'nosana-alert',
          level: level,
          title: data.title,
          body: data.body,
        });
      }
    })
    .catch(() => {});

  event.waitUntil(
    messageClients.then(() => self.registration.showNotification(data.title, options))
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(url) && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
`;

/* ------------------------------------------------------------------ */
/*  Route: POST /d/TOKEN/subscribe                                   */
/* ------------------------------------------------------------------ */

async function handleSubscribe(token, request, env) {
  let sub;
  try {
    sub = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }

  if (!sub || !sub.endpoint) {
    return jsonResponse({ error: 'Missing endpoint' }, 400);
  }

  const subsKey = `subs:${token}`;
  const raw = await env.PUSH_SUBS.get(subsKey);
  let subs = [];
  try {
    subs = raw ? JSON.parse(raw) : [];
  } catch {
    subs = [];
  }

  // Deduplicate by endpoint
  const exists = subs.some((s) => s.endpoint === sub.endpoint);
  if (!exists) {
    subs.push(sub);
    await env.PUSH_SUBS.put(subsKey, JSON.stringify(subs));
  }

  return jsonResponse({ ok: true });
}

/* ------------------------------------------------------------------ */
/*  Route: POST /d/TOKEN/unsubscribe                                 */
/* ------------------------------------------------------------------ */

async function handleUnsubscribe(token, request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }

  if (!body || !body.endpoint) {
    return jsonResponse({ error: 'Missing endpoint' }, 400);
  }

  const subsKey = `subs:${token}`;
  const raw = await env.PUSH_SUBS.get(subsKey);
  let subs = [];
  try {
    subs = raw ? JSON.parse(raw) : [];
  } catch {
    subs = [];
  }

  subs = subs.filter((s) => s.endpoint !== body.endpoint);
  await env.PUSH_SUBS.put(subsKey, JSON.stringify(subs));

  return jsonResponse({ ok: true });
}

/* ------------------------------------------------------------------ */
/*  Router                                                            */
/* ------------------------------------------------------------------ */

async function handleRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  // GET /d/TOKEN/manifest.json
  const manifestMatch = path.match(/^\/d\/([A-Za-z0-9_-]+)\/manifest\.json$/);
  if (manifestMatch && method === 'GET') {
    const manifest = {
      name: 'Nosana Fleet',
      short_name: 'Fleet',
      start_url: `/d/${manifestMatch[1]}`,
      display: 'standalone',
      background_color: '#111111',
      theme_color: '#111111',
      description: 'Nosana GPU fleet monitoring dashboard',
      icons: [
        { src: '/icon-192.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any maskable' },
        { src: '/icon-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any maskable' },
      ],
    };
    return new Response(JSON.stringify(manifest), {
      headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'public, max-age=86400' },
    });
  }

  // GET /icon-*.svg — simple SVG icon
  if (/^\/icon-\d+\.svg$/.test(path) && method === 'GET') {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
      <rect width="512" height="512" rx="64" fill="#111"/>
      <text x="256" y="320" font-size="280" text-anchor="middle" fill="#16a34a" font-family="sans-serif" font-weight="bold">N</text>
    </svg>`;
    return new Response(svg, {
      headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' },
    });
  }

  // GET /sw.js
  if (path === '/sw.js' && method === 'GET') {
    return new Response(SERVICE_WORKER_JS, {
      headers: {
        'Content-Type': 'application/javascript',
        'Service-Worker-Allowed': '/',
        'Cache-Control': 'no-cache',
      },
    });
  }

  // GET / — landing
  if (path === '/' && method === 'GET') {
    return new Response('Nosana Fleet Dashboard - Use /d/YOUR_TOKEN', {
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  // Match /d/TOKEN routes
  const tokenMatch = path.match(TOKEN_RE);
  if (!tokenMatch) {
    return jsonResponse({ error: 'Not found' }, 404);
  }

  const token = tokenMatch[1];
  const subPath = path.slice(`/d/${token}`.length);

  // POST /d/TOKEN/subscribe
  if (subPath === '/subscribe' && method === 'POST') {
    return handleSubscribe(token, request, env);
  }

  // POST /d/TOKEN/unsubscribe
  if (subPath === '/unsubscribe' && method === 'POST') {
    return handleUnsubscribe(token, request, env);
  }

  // POST /d/TOKEN — ingest status
  if (subPath === '' && method === 'POST') {
    return handleStatusPost(token, request, env);
  }

  // GET /d/TOKEN — dashboard
  if (subPath === '' && method === 'GET') {
    return handleDashboardGet(token, env);
  }

  return jsonResponse({ error: 'Not found' }, 404);
}

/* ------------------------------------------------------------------ */
/*  Scheduled handler — detect stale hosts                           */
/* ------------------------------------------------------------------ */

async function handleScheduled(env) {
  const now = Date.now();

  // List all keys in FLEET_DATA
  let cursor = null;
  const allKeys = [];

  do {
    const list = await env.FLEET_DATA.list({ cursor });
    allKeys.push(...list.keys);
    cursor = list.list_complete ? null : list.cursor;
  } while (cursor);

  for (const key of allKeys) {
    const token = key.name;
    const raw = await env.FLEET_DATA.get(token);
    if (!raw) continue;

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      continue;
    }

    let changed = false;

    for (const [hostName, host] of Object.entries(data)) {
      const age = now - host.seen;
      const wasUp =
        Number(host.m) === 1 &&
        Number(host.c) === 1 &&
        Number(host.n) === 1;

      if (age > STALE_THRESHOLD_MS && wasUp && !host.alerted) {
        // Newly stale — send critical alert
        const level = classifyAlert({ m: host.m, c: host.c, n: host.n, stale: true });
        const payload = JSON.stringify({
          title: alertTitle(level),
          body: `\u{2753} ${hostName}: OFFLINE (no data for 30m)`,
          level,
          url: `/d/${token}`,
        });

        await sendAlerts(token, payload, env);

        data[hostName].alerted = true;
        changed = true;
      }
    }

    if (changed) {
      await env.FLEET_DATA.put(token, JSON.stringify(data));
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Export                                                            */
/* ------------------------------------------------------------------ */

export default {
  async fetch(request, env, ctx) {
    try {
      return await handleRequest(request, env);
    } catch (err) {
      return jsonResponse({ error: 'Internal error', detail: err.message }, 500);
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(handleScheduled(env));
  },
};
