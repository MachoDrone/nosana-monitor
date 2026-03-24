/**
 * Nosana Fleet Dashboard — Cloudflare Worker  v0.02.0
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
function classifyAlert({ n, stale = false, recovery = false }) {
  if (recovery) return 'info';
  if (stale) return 'critical';
  if (Number(n) === 0) return 'warning';
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

  const { host, n, q, state, nodeAddress, version, dl, ul, ping, disk, gpu, tier, ram, gpuId, rewards, jobStart, jobTimeout, queueTotal, marketSlug, marketAddress } = body;
  if (!host) return jsonResponse({ error: 'Missing host' }, 400);

  // Read existing data for this token
  const raw = await env.FLEET_DATA.get(token);
  const data = raw ? JSON.parse(raw) : {};

  // Capture previous state for recovery detection
  const prev = data[host] || null;
  const wasDown = prev && (prev.alerted === true || Number(prev.n) === 0);
  const allUpNow = Number(n) === 1;
  const isDown = Number(n) === 0;

  // Update host entry
  data[host] = {
    n: n ?? 0,
    q: q ?? '',
    state: state ?? '',
    nodeAddress: nodeAddress ?? '',
    version: version ?? '',
    dl: dl ?? '',
    ul: ul ?? '',
    ping: ping ?? '',
    disk: disk ?? '',
    gpu: gpu ?? '',
    tier: tier ?? '',
    ram: ram ?? '',
    gpuId: gpuId ?? '',
    jobStart: jobStart ?? 0,
    jobTimeout: jobTimeout ?? 0,
    queueTotal: queueTotal ?? '',
    rewards: rewards ?? '',
    marketSlug: marketSlug || (prev && prev.marketSlug) || '',
    marketAddress: marketAddress || (prev && prev.marketAddress) || '',
    seen: Date.now(),
    alerted: isDown,
  };

  await env.FLEET_DATA.put(token, JSON.stringify(data));

  // Register token for cron processing (avoids expensive list() calls)
  const tokenListRaw = await env.FLEET_DATA.get('_tokens');
  const tokenSet = new Set(tokenListRaw ? JSON.parse(tokenListRaw) : []);
  if (!tokenSet.has(token)) {
    tokenSet.add(token);
    await env.FLEET_DATA.put('_tokens', JSON.stringify([...tokenSet]));
  }

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
    if (Number(n) === 0) parts.push('node DOWN');

    const level = classifyAlert({ n });
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
  const totalHosts = hosts.length;
  const completeHosts = hosts.filter(([, h]) => h.tier && h.dl && h.ping).length;

  const now = Date.now();

  function tap(label, content) {
    return '<span class="tap" data-label="' + label + '">' + content + '</span>';
  }

  function indicator(val, seen) {
    const stale = now - seen > STALE_THRESHOLD_MS;
    if (stale) return tap('STALE', '\u{2753}');
    if (Number(val) === 0) return tap('DOWN', '\u{274C}');
    return tap('UP', '\u{1F7E2}');
  }

  function tierIndicator(t) {
    if (!t) return '-';
    const ch = t.charAt(0).toUpperCase();
    const label = ch === 'P' ? 'PREMIUM' : ch === 'C' ? 'COMMUNITY' : t;
    if (ch === 'P') return tap(label, '<span style="color:#4ade80">' + ch + '</span>');
    if (ch === 'C') return tap(label, '<span style="color:#16a34a">' + ch + '</span>');
    return tap(label, '<span style="color:#ef4444">' + ch + '</span>');
  }

  function stateIndicator(s) {
    if (!s) return '-';
    const st = String(s).toUpperCase();
    if (st === 'RUNNING') return tap('RUNNING', '\u{1F535}');
    if (st === 'QUEUED') return tap('QUEUED', '<span style="color:#4ade80;font-weight:600">Q</span>');
    if (st === 'RESTARTING') return tap('RESTARTING', '\u{1F7E0}');
    return tap(st, st.charAt(0));
  }

  function fmtDuration(secs) {
    if (!secs || secs <= 0) return '0m';
    const d = Math.floor(secs / 86400);
    const h = Math.floor((secs % 86400) / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const parts = [];
    if (d > 0) parts.push(d + 'd');
    if (h > 0) parts.push(h + 'h');
    if (m > 0) parts.push(m + 'm');
    return parts.length ? parts.join(' ') : '0m';
  }

  function jobDuration(h) {
    if (!h.jobStart || !h.jobTimeout || Number(h.jobTimeout) === 0) return '-';
    const elapsed = Math.max(0, Math.floor(now / 1000) - Number(h.jobStart));
    const max = Number(h.jobTimeout);
    const pct = Math.min(100, Math.round((elapsed / max) * 100));
    const bar = '<span class="dur-bar"><span class="dur-fill" style="width:' + pct + '%"></span></span>';
    const text = fmtDuration(elapsed) + ' / ' + fmtDuration(max);
    return '<span class="dur-mode dur-m-bar">' + tap(text, bar) + '</span><span class="dur-mode dur-m-text">' + text + '</span>';
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
      <tr data-host="${name}" data-node="${h.nodeAddress || ''}" data-n="${h.n}" data-state="${h.state || ''}" data-q="${h.q}" data-seen="${h.seen}">
        <td class="host">${name}</td>
        <td class="node-addr">${h.nodeAddress ? `<a href="https://explore.nosana.com/hosts/${h.nodeAddress}" target="_blank">${h.nodeAddress.slice(0, 5)}</a>` : '-'}</td>
        <td>${tierIndicator(h.tier)}</td>
        <td>${indicator(h.n, h.seen)}</td>
        <td>${stateIndicator(h.state)}</td>
        <td class="dur">${jobDuration(h)}</td>
        <td class="q">${h.q && h.q !== '-' ? h.q + (h.queueTotal ? '/' + h.queueTotal : '') : '-'}</td>
        <td class="seen" data-sort="${h.seen ? Math.round((now - h.seen) / 1000) : 99999}">${seenAgo(h.seen)}</td>
        <td class="rewards">${h.rewards && h.nodeAddress ? '<a href="https://host.nosana.com/' + h.nodeAddress + '" target="_blank">' + Math.round(Number(h.rewards)) + '</a>' : h.rewards ? String(Math.round(Number(h.rewards))) : '-'}</td>
        <td class="ram">${h.ram ? Math.round(Number(h.ram) / 1024) : '-'}</td>
        <td class="disk">${h.disk || '-'}</td>
        <td class="ver">${h.version || '-'}</td>
        <td class="dl">${h.dl ? tap('single-stream speed', String(Math.round(Number(h.dl)))) : '-'}</td>
        <td class="ul">${h.ul ? tap('single-stream speed', String(Math.round(Number(h.ul)))) : '-'}</td>
        <td class="ping">${h.ping ? Math.round(Number(h.ping)) : '-'}</td>
        <td class="gpu" data-host="${name}"><span class="gpu-mode gpu-m-full">${h.marketSlug || h.gpu || '-'}</span><span class="gpu-mode gpu-m-dot">${(h.marketSlug || h.gpu || '').slice(0, 2) || '-'}</span></td>
        <td class="gpuid">${h.gpuId !== undefined && h.gpuId !== '' ? h.gpuId : '-'}</td>
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
    html,body{overscroll-behavior-y:contain}
    @keyframes barPulse{0%{opacity:1}70%{opacity:1}100%{opacity:0.15}}
    .bar-complete #gatherFill{animation:barPulse 2.5s ease-out forwards}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,monospace;
         background:#111;color:#e0e0e0;padding:12px;font-size:14px}
    h1{font-size:18px;margin-bottom:8px;color:#fff}
    .legend{font-size:11px;color:#888;margin-bottom:12px}
    table{width:100%;border-collapse:collapse}
    th,td{padding:6px 8px;text-align:center;border-bottom:1px solid #2a2a2a;width:1%;white-space:nowrap}
    th{color:#aaa;font-size:10px;cursor:pointer;user-select:none;
       padding:6px 8px;vertical-align:bottom}
    th:not(:first-child){height:80px;position:relative}
    th:not(:first-child) div{position:absolute;bottom:2px;left:calc(50% - 5px);transform:rotate(-90deg);transform-origin:0 0;white-space:nowrap}
    th:first-child div{padding:0}
    th:hover{color:#fff}
    th .sort-arrow{font-size:8px;color:#4ade80}
    th:not(:first-child) .sort-arrow{font-size:6px}
    td.host{text-align:left;font-weight:600;color:#fff}
    td.node-addr a{color:#60a5fa;text-decoration:none}
    td.node-addr a:hover{text-decoration:underline}
    td.rewards a{color:#15803d;text-decoration:none;font-weight:600}
    td.rewards a:hover{text-decoration:underline}
    td.q{font-size:12px;color:#ccc}
    td.seen,td.ver,td.dl,td.ul,td.ping,td.disk,td.gpu,td.ram,td.gpuid,td.rewards,td.dur{font-size:11px;color:#888}
    .actions{margin:16px 0}
    .btn-row{display:flex;gap:8px;flex-wrap:wrap}
    button{background:#16a34a;color:#fff;border:none;padding:8px 14px;
           border-radius:6px;font-size:12px;cursor:pointer}
    button:hover{background:#15803d}
    button.on{background:#111;color:#15803d;border:1px solid #15803d}
    button.on:hover{background:#1a1a1a}
    .status-msg{font-size:12px;color:#888;margin-top:4px}
    .hint{font-size:11px;color:#f59e0b;margin-top:8px;line-height:1.5}
    .hint a{color:#60a5fa}
    .empty{text-align:center;padding:32px;color:#666}
    .dur-bar{display:inline-block;width:30px;height:8px;background:#333;border-radius:4px;vertical-align:middle}
    .dur-fill{display:block;height:100%;background:#4ade80;border-radius:4px}
    .dur-m-text{display:none}
    body.dur-text .dur-m-bar{display:none}
    body.dur-text .dur-m-text{display:inline}
    .dur-toggle,.gpu-toggle{cursor:pointer;font-size:12px}
    .gpu-m-dot{display:none}
    body.gpu-compact .gpu-m-full{display:none}
    body.gpu-compact .gpu-m-dot{display:inline}
    .tap{cursor:pointer;position:relative}
    .tap .tip{position:absolute;bottom:100%;left:50%;transform:translateX(-50%);
      background:#333;color:#fff;font-size:10px;padding:2px 6px;border-radius:3px;
      white-space:nowrap;pointer-events:none;opacity:0;transition:opacity 0.2s}
    .tap .tip.show{opacity:1}
    @media(max-width:400px){th,td{padding:4px 4px;font-size:12px}}
  </style>
</head>
<body>
  <div style="display:flex;justify-content:space-between;align-items:center">
    <h1>Nosana Fleet <span style="font-size:13px;color:#15803d;font-weight:400">— ${hosts.length}</span></h1>
    <span style="font-size:14px">
      <span id="refreshBtn" style="cursor:pointer" title="Refresh dashboard">\u{1F504}</span>
      <span id="purgeBtn" style="cursor:pointer;margin-left:8px" title="Purge stale hosts">\u{267B}\u{FE0F}</span>
    </span>
  </div>
  <div class="legend">Tap column header to sort <span id="sortReset" style="cursor:pointer">\u{1F191}</span></div>
  ${totalHosts > 0 ? `
  <div id="gatherBar" class="tap" data-label="${completeHosts < totalHosts ? 'Gathering data from nodes... ' + completeHosts + '/' + totalHosts : 'All ' + totalHosts + ' nodes reporting'}" style="margin-bottom:8px">
    <div style="background:#222;border-radius:4px;height:4px;overflow:hidden">
      <div id="gatherFill" style="width:${Math.round((completeHosts / totalHosts) * 100)}%;height:100%;background:#4ade80;border-radius:4px;transition:width 0.5s"></div>
    </div>
    ${completeHosts < totalHosts ? '<div style="font-size:10px;color:#666;margin-top:2px">Gathering data from nodes\u{2026}</div>' : ''}
  </div>` : ''}
  ${
    hosts.length === 0
      ? '<div class="empty">No host data yet. Waiting for monitors...</div>'
      : `<table id="fleet">
    <thead>
      <tr>
        <th data-col="host" data-type="string"><div>PC</div></th>
        <th data-col="node" data-type="string"><div>Node</div></th>
        <th data-col="tier" data-type="string"><div>Status</div></th>
        <th data-col="n" data-type="num"><div>Unknown</div></th>
        <th data-col="state" data-type="string"><div>State</div></th>
        <th data-col="dur" data-type="string"><div>Duration <span class="dur-toggle" id="durToggle">\u{1F504}</span></div></th>
        <th data-col="q" data-type="string"><div>Queued</div></th>
        <th data-col="seen" data-type="num"><div>Heartbeat</div></th>
        <th data-col="rewards" data-type="num"><div>Rewards</div></th>
        <th data-col="ram" data-type="num"><div>RAM</div></th>
        <th data-col="disk" data-type="num"><div>Disk</div></th>
        <th data-col="ver" data-type="string"><div>Ver</div></th>
        <th data-col="dl" data-type="num"><div>DL</div></th>
        <th data-col="ul" data-type="num"><div>UL</div></th>
        <th data-col="ping" data-type="num"><div>Ping</div></th>
        <th data-col="gpu" data-type="string"><div>Market <span class="gpu-toggle" id="gpuToggle">\u{1F504}</span></div></th>
        <th data-col="gpuid" data-type="num"><div>GPU ID</div></th>
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
      <button id="fastBtn" class="on">Fast Mode</button>
      <select id="fastTimeout" style="background:#222;color:#15803d;border:1px solid #15803d;border-radius:6px;padding:6px 8px;font-size:12px">
        <option value="10">10 min</option>
        <option value="15" selected>15 min</option>
        <option value="20">20 min</option>
        <option value="30">30 min</option>
      </select>
      <span id="fastInfo" style="cursor:pointer;font-size:14px;color:#888" title="Info">\u{24D8}</span>
      <button id="installBtn" class="on" style="display:none">Install App</button>
    </div>
    <div id="fastStatus" style="font-size:11px;color:#666;margin-top:4px;display:none"></div>
    <div class="status-msg" id="statusMsg"></div>
    <div id="fastHint" style="display:none" class="hint">
      <b>Kiosk mode</b> (default): refreshes every ${totalHosts <= 10 ? '30s' : totalHosts <= 100 ? '60s' : '120s'} \u{2014} safe for always-on displays.<br>
      <b>Fast mode</b>: refreshes every 30s for quick monitoring, then reverts to kiosk.<br>
      Both modes pause when the tab is in the background to save API calls.<br>
      Each refresh counts toward a daily limit of 100K (free tier).
    </div>
    <div id="installHint" style="display:none" class="hint">
      <b>Install App</b> adds a desktop/home screen shortcut that opens in its own window.<br>
      \u{2705} Chrome, Edge (Windows, macOS, Linux, Android)<br>
      \u{26A0}\u{FE0F} iOS Safari: use Share \u{2192} "Add to Home Screen" instead<br>
      \u{274C} Firefox, Brave, Safari macOS: not supported
    </div>
  </div>

  <script>
    const TOKEN = ${JSON.stringify(token)};
    const VAPID_PUBLIC_KEY = ${JSON.stringify(vapidPublicKey)};

    /* ---- Purge stale hosts ---- */
    (function() {
      const btn = document.getElementById('purgeBtn');
      if (!btn) return;
      btn.addEventListener('click', async () => {
        const rows = document.querySelectorAll('#fleet tbody tr');
        const stale = [];
        rows.forEach(r => {
          const name = r.dataset.host;
          const n = r.dataset.n;
          const state = r.dataset.state;
          if (!n || n === '0' || !state) stale.push(name);
        });
        const msg = stale.length
          ? 'Remove ' + stale.length + ' offline/stale host(s)?\\n\\n' + stale.join(', ') + '\\n\\nThis removes hosts with no active heartbeat. Active hosts are not affected.'
          : 'No abandoned hosts to remove. All hosts are reporting.';
        if (!stale.length) { alert(msg); return; }
        if (!confirm(msg)) return;
        try {
          const res = await fetch('/d/' + TOKEN + '/purge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hosts: stale })
          });
          if (res.ok) location.reload();
        } catch {}
      });
    })();

    /* ---- Duration toggle ---- */
    (function() {
      const mode = localStorage.getItem('nosana-dur-mode') || 'bar';
      if (mode === 'text') document.body.classList.add('dur-text');
      const tog = document.getElementById('durToggle');
      if (tog) tog.addEventListener('click', (e) => {
        e.stopPropagation();
        document.body.classList.toggle('dur-text');
        const cur = document.body.classList.contains('dur-text') ? 'text' : 'bar';
        localStorage.setItem('nosana-dur-mode', cur);
      });
    })();

    /* ---- GPU toggle ---- */
    (function() {
      const mode = localStorage.getItem('nosana-gpu-mode') || 'full';
      if (mode === 'compact') document.body.classList.add('gpu-compact');
      const tog = document.getElementById('gpuToggle');
      if (tog) tog.addEventListener('click', (e) => {
        e.stopPropagation();
        document.body.classList.toggle('gpu-compact');
        const cur = document.body.classList.contains('gpu-compact') ? 'compact' : 'full';
        localStorage.setItem('nosana-gpu-mode', cur);
      });
    })();

    /* ---- Market slug click-to-refresh ---- */
    document.querySelectorAll('td.gpu .gpu-m-full').forEach(el => {
      el.style.cursor = 'pointer';
      el.addEventListener('click', async (e) => {
        e.stopPropagation();
        const host = el.closest('td').dataset.host;
        if (!host) return;
        const ok = confirm('Refresh market slug?\\n\\nAuto-updates daily. Manual refresh uses one API call.');
        if (!ok) return;
        el.textContent = '...';
        try {
          const res = await fetch('/d/' + TOKEN + '/refresh-market/' + encodeURIComponent(host), { method: 'POST' });
          const data = await res.json();
          if (data.slug) { el.textContent = data.slug; }
          else { el.textContent = 'error'; setTimeout(() => location.reload(), 1500); }
        } catch { el.textContent = 'error'; setTimeout(() => location.reload(), 1500); }
      });
    });

    /* ---- Tap tooltips ---- */
    document.addEventListener('click', (e) => {
      const tap = e.target.closest('.tap');
      if (!tap) return;
      let tip = tap.querySelector('.tip');
      if (tip) { tip.remove(); return; }
      document.querySelectorAll('.tip').forEach(t => t.remove());
      tip = document.createElement('span');
      tip.className = 'tip show';
      tip.textContent = tap.dataset.label;
      tap.appendChild(tip);
      setTimeout(() => { if (tip.parentNode) tip.remove(); }, 1500);
    });

    /* ---- Sortable columns ---- */
    (function() {
      const table = document.getElementById('fleet');
      if (!table) return;
      const headers = table.querySelectorAll('th');
      let currentSort = 'host';
      let sortDir = 1;

      function clearArrows() {
        headers.forEach(h => {
          const arrow = h.querySelector('.sort-arrow');
          if (arrow) arrow.remove();
        });
      }

      function addArrow(th, dir) {
        clearArrows();
        const arrow = document.createElement('span');
        arrow.className = 'sort-arrow';
        const isRotated = th !== headers[0];
        const div = th.querySelector('div');
        if (isRotated) {
          arrow.textContent = dir === 1 ? '\\u25C0 ' : '\\u25B6 ';
          if (div) div.insertBefore(arrow, div.firstChild);
          else th.insertBefore(arrow, th.firstChild);
        } else {
          arrow.textContent = dir === 1 ? ' \\u25B2' : ' \\u25BC';
          if (div) div.appendChild(arrow);
          else th.appendChild(arrow);
        }
      }

      function resetSort() {
        currentSort = 'host';
        sortDir = 1;
        addArrow(headers[0], sortDir);
        const tbody = table.querySelector('tbody');
        const rows = Array.from(tbody.querySelectorAll('tr'));
        rows.sort((a, b) => (a.children[0] ? a.children[0].textContent.trim() : '').localeCompare(b.children[0] ? b.children[0].textContent.trim() : ''));
        rows.forEach(r => tbody.appendChild(r));
      }

      const resetBtn = document.getElementById('sortReset');
      if (resetBtn) resetBtn.addEventListener('click', resetSort);

      // Show default sort arrow on load
      addArrow(headers[0], 1);

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

          addArrow(th, sortDir);

          const tbody = table.querySelector('tbody');
          const rows = Array.from(tbody.querySelectorAll('tr'));

          rows.sort((a, b) => {
            const tdA = a.children[idx];
            const tdB = b.children[idx];
            const cellA = tdA ? tdA.textContent.trim() : '';
            const cellB = tdB ? tdB.textContent.trim() : '';
            if (type === 'num') {
              const na = parseFloat((tdA && tdA.dataset.sort) || cellA) || 0;
              const nb = parseFloat((tdB && tdB.dataset.sort) || cellB) || 0;
              return (na - nb) * sortDir;
            }
            return cellA.localeCompare(cellB) * sortDir;
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
      document.getElementById('installHint').style.display = '';
    });
    installBtn.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      const result = await deferredPrompt.userChoice;
      if (result.outcome === 'accepted') {
        installBtn.style.display = 'none';
        document.getElementById('installHint').style.display = 'none';
      }
      deferredPrompt = null;
    });
    window.addEventListener('appinstalled', () => {
      installBtn.style.display = 'none';
      document.getElementById('installHint').style.display = 'none';
    });

    /* ---- Cache + controlled refresh ---- */
    (function() {
      const cacheKey = 'nosana-fleet-cache-' + TOKEN;
      const loadTime = Date.now();

      // Save current page to localStorage
      localStorage.setItem(cacheKey, JSON.stringify({ ts: loadTime }));

      // Progress bar pulse when all data is complete
      const complete = ${completeHosts};
      const total = ${totalHosts};
      function replayPulse() {
        const fill = document.getElementById('gatherFill');
        if (!fill) return;
        document.body.classList.remove('bar-complete');
        fill.style.width = '0%';
        void fill.offsetWidth; // force reflow
        fill.style.width = Math.round((complete / total) * 100) + '%';
        setTimeout(() => document.body.classList.add('bar-complete'), 50);
      }
      if (complete >= total && total > 0) {
        document.body.classList.add('bar-complete');
      }
      const gatherBar = document.getElementById('gatherBar');
      if (gatherBar) gatherBar.addEventListener('click', (e) => {
        if (complete >= total) replayPulse();
      });

      // Kiosk/Fast mode auto-refresh with visibility awareness
      const kioskInterval = ${totalHosts <= 10 ? 30 : totalHosts <= 100 ? 60 : 120};
      const fastInterval = 30;
      let isFast = false;
      let fastExpiry = 0;
      let refreshTimer = null;

      const fastBtn = document.getElementById('fastBtn');
      const fastTimeout = document.getElementById('fastTimeout');
      const fastStatus = document.getElementById('fastStatus');
      const fastInfo = document.getElementById('fastInfo');
      const fastHint = document.getElementById('fastHint');
      const refreshBtn = document.getElementById('refreshBtn');
      const gatherFill = document.getElementById('gatherFill');

      // Restore fast mode if active from before refresh
      const savedFast = localStorage.getItem('nosana-fast-expiry');
      if (savedFast && Number(savedFast) > Date.now()) {
        isFast = true;
        fastExpiry = Number(savedFast);
        fastBtn.textContent = 'Kiosk Mode';
        fastBtn.classList.remove('on');
      }

      function currentInterval() { return isFast ? fastInterval : kioskInterval; }

      function updateStatus() {
        if (isFast) {
          const left = Math.max(0, Math.round((fastExpiry - Date.now()) / 60000));
          fastStatus.textContent = 'Fast mode: ' + left + 'm remaining \u{2022} refresh ' + fastInterval + 's';
          fastStatus.style.display = '';
          if (Date.now() >= fastExpiry) {
            isFast = false;
            fastExpiry = 0;
            localStorage.removeItem('nosana-fast-expiry');
            fastBtn.textContent = 'Fast Mode';
            fastBtn.classList.add('on');
            fastStatus.textContent = 'Kiosk mode: refresh ' + kioskInterval + 's';
            scheduleRefresh();
          }
        } else {
          fastStatus.textContent = 'Kiosk mode: refresh ' + kioskInterval + 's';
          fastStatus.style.display = '';
        }
      }

      function scheduleRefresh() {
        if (refreshTimer) clearInterval(refreshTimer);
        const intv = currentInterval();
        let elapsed = 0;
        refreshTimer = setInterval(() => {
          if (document.hidden) return; // pause when not visible
          elapsed++;
          // Animate progress bar as countdown
          if (gatherFill && complete >= total) {
            const pct = Math.max(0, 100 - Math.round((elapsed / intv) * 100));
            gatherFill.style.width = pct + '%';
            gatherFill.style.transition = 'width 1s linear';
          }
          updateStatus();
          if (elapsed >= intv) {
            location.reload();
          }
        }, 1000);
      }

      fastBtn.addEventListener('click', () => {
        if (isFast) {
          // Switch to kiosk
          isFast = false;
          fastExpiry = 0;
          localStorage.removeItem('nosana-fast-expiry');
          fastBtn.textContent = 'Fast Mode';
          fastBtn.classList.add('on');
        } else {
          // Switch to fast
          const mins = Number(fastTimeout.value) || 15;
          isFast = true;
          fastExpiry = Date.now() + mins * 60000;
          localStorage.setItem('nosana-fast-expiry', String(fastExpiry));
          fastBtn.textContent = 'Kiosk Mode';
          fastBtn.classList.remove('on');
        }
        updateStatus();
        scheduleRefresh();
      });

      if (fastInfo) fastInfo.addEventListener('click', () => {
        fastHint.style.display = fastHint.style.display === 'none' ? '' : 'none';
      });

      // Manual refresh button
      if (refreshBtn) refreshBtn.addEventListener('click', () => {
        location.reload();
      });

      // Intercept F5 / Ctrl+R — just reload (auto-refresh handles pacing)
      window.addEventListener('keydown', (e) => {
        if (e.key === 'F5' || (e.ctrlKey && e.key === 'r')) {
          if (e.shiftKey) return;
          e.preventDefault();
          location.reload();
        }
      });

      // Start auto-refresh
      updateStatus();
      scheduleRefresh();
    })();
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

/* ------------------------------------------------------------------ */
/*  Route: POST /d/TOKEN/purge — remove stale hosts                  */
/* ------------------------------------------------------------------ */

async function handlePurge(token, request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'Invalid JSON' }, 400); }
  const { hosts } = body;
  if (!Array.isArray(hosts) || hosts.length === 0) return jsonResponse({ error: 'No hosts specified' }, 400);

  const raw = await env.FLEET_DATA.get(token);
  if (!raw) return jsonResponse({ error: 'No data' }, 404);
  const data = JSON.parse(raw);

  let removed = 0;
  for (const h of hosts) {
    if (data[h]) { delete data[h]; removed++; }
  }

  await env.FLEET_DATA.put(token, JSON.stringify(data));
  return jsonResponse({ ok: true, removed });
}

/* ------------------------------------------------------------------ */
/*  Route: POST /d/TOKEN/refresh-market/HOST — refresh market slug    */
/* ------------------------------------------------------------------ */

async function handleRefreshMarket(token, host, env) {
  const raw = await env.FLEET_DATA.get(token);
  if (!raw) return jsonResponse({ error: 'No data' }, 404);
  const data = JSON.parse(raw);
  const h = data[host];
  if (!h || !h.marketAddress) return jsonResponse({ error: 'No market address for host' }, 404);

  try {
    const res = await fetch(`https://dashboard.k8s.prd.nos.ci/api/markets/${h.marketAddress}/`);
    if (!res.ok) return jsonResponse({ error: 'Market API error' }, 502);
    const market = await res.json();
    h.marketSlug = market.slug || h.marketSlug;
    data[host] = h;
    await env.FLEET_DATA.put(token, JSON.stringify(data));
    return jsonResponse({ ok: true, slug: h.marketSlug });
  } catch {
    return jsonResponse({ error: 'Failed to fetch market' }, 502);
  }
}

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

  // POST /d/TOKEN/purge — remove stale hosts
  if (subPath === '/purge' && method === 'POST') {
    return handlePurge(token, request, env);
  }

  // POST /d/TOKEN/refresh-market/HOST — manually refresh market slug
  const marketMatch = subPath.match(/^\/refresh-market\/(.+)$/);
  if (marketMatch && method === 'POST') {
    return handleRefreshMarket(token, marketMatch[1], env);
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

  // Get known tokens from a simple KV key instead of listing all keys
  const tokenList = await env.FLEET_DATA.get('_tokens');
  const tokens = tokenList ? JSON.parse(tokenList) : [];

  for (const token of tokens) {
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
        const level = classifyAlert({ n: host.n, stale: true });
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
