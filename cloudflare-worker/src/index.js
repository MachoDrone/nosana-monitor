/**
 * Nosana Fleet Dashboard — Cloudflare Worker  v0.05.9
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

const STALE_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes (3 missed heartbeats)
const TOKEN_RE = /^\/d\/([A-Za-z0-9_-]+)/;

// KV write throttle: max 1 write per token per interval, but accumulates
// ALL host updates between writes so no host's seen timestamp goes stale.
// Budget: 720 writes/day per token regardless of fleet size (1-200 hosts).
const KV_WRITE_INTERVAL_MS = 2 * 60 * 1000;
const lastKvWrite = new Map(); // token → timestamp
const pendingData = new Map(); // token → full data object with accumulated updates

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
  if (level === 'critical') return 'CRITICAL';
  if (level === 'warning') return 'WARNING';
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

  const { host, n, q, state, nodeAddress, version, dl, ul, ping, disk, gpu, tier, ram, gpuId, rewards, jobStart, jobTimeout, queueTotal, marketSlug, marketAddress, nodeUptime, containerStoppedAt, stateSince, downApprox, downLabel, monitorVersion, sol, nos, stakedNos, minStake, cpu, nvidiaDriver, cudaVersion, sysEnv, gpuName, runningJob } = body;
  if (!host) return jsonResponse({ error: 'Missing host' }, 400);

  // Read current data: prefer pending (accumulated updates) over KV
  let data;
  if (pendingData.has(token)) {
    data = pendingData.get(token);
  } else {
    const raw = await env.FLEET_DATA.get(token);
    data = raw ? JSON.parse(raw) : {};
  }
  const prev = data[host] || null;

  const wasDown = prev && (prev.alerted === true || Number(prev.n) === 0);
  const allUpNow = Number(n) === 1;
  const isDown = Number(n) === 0;

  // Build new host entry
  const updated = {
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
    nodeUptime: nodeUptime || (prev && prev.nodeUptime) || '',
    containerStoppedAt: containerStoppedAt || '',
    downApprox: downApprox || false,
    downLabel: downLabel || 'Node',
    stateSince: stateSince || (prev && prev.stateSince) || 0,
    monitorVersion: monitorVersion || (prev && prev.monitorVersion) || '',
    sol: sol || (prev && prev.sol) || '',
    nos: nos || (prev && prev.nos) || '',
    stakedNos: stakedNos || (prev && prev.stakedNos) || '',
    minStake: minStake || (prev && prev.minStake) || '',
    cpu: cpu || (prev && prev.cpu) || '',
    nvidiaDriver: nvidiaDriver || (prev && prev.nvidiaDriver) || '',
    cudaVersion: cudaVersion || (prev && prev.cudaVersion) || '',
    sysEnv: sysEnv || (prev && prev.sysEnv) || '',
    gpuName: gpuName || (prev && prev.gpuName) || '',
    runningJob: runningJob || '',
    seen: Date.now(),
    alerted: isDown,
  };

  // Update host in data
  data[host] = updated;

  // Accumulate update in pending buffer, write to KV when throttle expires.
  // All hosts' seen timestamps stay fresh because pending accumulates across POSTs.
  // Budget: 720 writes/day per token regardless of fleet size (1-200 hosts).
  const now = Date.now();
  pendingData.set(token, data);
  const lastWrite = lastKvWrite.get(token) || 0;
  if ((now - lastWrite) >= KV_WRITE_INTERVAL_MS) {
    try {
      await env.FLEET_DATA.put(token, JSON.stringify(data));
      lastKvWrite.set(token, now);
      pendingData.delete(token);
    } catch (e) {
      return jsonResponse({ error: 'KV write failed', detail: e.message }, 507);
    }
  }

  // Register token for cron (stale detection)
  try {
    const tokenListRaw = await env.FLEET_DATA.get('_tokens');
    const tokenSet = new Set(tokenListRaw ? JSON.parse(tokenListRaw) : []);
    if (!tokenSet.has(token)) {
      tokenSet.add(token);
      await env.FLEET_DATA.put('_tokens', JSON.stringify([...tokenSet]));
    }
  } catch {}

  // --- Recovery alert (immediate, no KV write needed) ---
  if (wasDown && allUpNow) {
    const level = 'info';
    const payload = JSON.stringify({
      title: alertTitle(level),
      body: `${host} recovered`,
      level,
      url: `/d/${token}`,
    });
    await sendAlerts(token, payload, env);
  }

  // --- Down alert (immediate) ---
  if (isDown) {
    const lbl = downLabel || 'nosana-node';
    const level = classifyAlert({ n });
    const payload = JSON.stringify({
      title: alertTitle(level),
      body: `\u{274C}\u{274C} ${lbl} STOPPED on ${host}`,
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
  // Prefer pending data (has latest seen timestamps) over KV
  let data;
  if (pendingData.has(token)) {
    data = pendingData.get(token);
  } else {
    const raw = await env.FLEET_DATA.get(token);
    data = raw ? JSON.parse(raw) : {};
  }



  const vapidPublicKey = env.VAPID_PUBLIC_KEY || '';
  const latestNodeVersion = (await env.FLEET_DATA.get('_latestNodeVersion')) || '';

  const hosts = Object.entries(data).sort(([a], [b]) => a.localeCompare(b));
  const now = Date.now();
  const activeHosts = hosts.filter(([, h]) => Number(h.n) === 1 && (now - h.seen <= STALE_THRESHOLD_MS));
  const totalHosts = activeHosts.length || hosts.length;
  const completeHosts = activeHosts.filter(([, h]) => h.tier && h.dl && h.ping).length;
  const monitorVersions = [...new Set(hosts.map(([, h]) => h.monitorVersion).filter(Boolean))];
  const versionLabel = monitorVersions.length === 0 ? '' : monitorVersions.length === 1 ? 'v' + monitorVersions[0] : monitorVersions.map(v => 'v' + v).join(' / ');

  function tap(label, content, extraAttrs) {
    return '<span class="tap" data-label="' + label + '"' + (extraAttrs || '') + '>' + content + '</span>';
  }

  const redX = '<span style="color:#ef4444;font-weight:700;font-size:13px">\u{2716}</span>';

  function indicator(val, seen, nodeUptime, containerStoppedAt, downApprox, downLabel) {
    const stale = now - seen > STALE_THRESHOLD_MS;
    const lbl = downLabel || 'nosana-node';
    if (stale) return tap('Host unreachable — last seen', '<span style="font-size:18px">\u{1F6A8}</span>', tsAttr(seen));
    if (Number(val) === 0) {
      if (containerStoppedAt) return tap(downApprox ? lbl + ' STOPPED at unknown time prior to' : lbl + ' STOPPED', redX, tsAttr(0, containerStoppedAt));
      return tap(lbl + ' STOPPED', redX);
    }
    return tap('UP', dot('#22c55e'), nodeUptime ? tsAttr(0, nodeUptime) : '');
  }

  function isDown(val, seen) {
    return now - seen > STALE_THRESHOLD_MS || Number(val) === 0;
  }

  function tierIndicator(t) {
    if (!t) return '-';
    const ch = t.charAt(0).toUpperCase();
    const label = ch === 'P' ? 'PREMIUM' : ch === 'C' ? 'COMMUNITY' : t;
    if (ch === 'P') return tap(label, '<span style="color:#4ade80;font-size:11px">' + ch + '</span>');
    if (ch === 'C') return tap(label, '<span style="color:#16a34a;font-size:11px">' + ch + '</span>');
    return tap(label, '<span style="color:#ef4444;font-size:11px">' + ch + '</span>');
  }

  const dot = (color) => '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + color + '"></span>';

  function tsAttr(ts, iso) {
    if (iso) return ' data-since-iso="' + iso + '"';
    if (ts && ts !== 0) return ' data-since-ts="' + ts + '"';
    return '';
  }

  function stateIndicator(s, stateSince) {
    if (!s) return '-';
    const st = String(s).toUpperCase();
    const sa = stateSince ? tsAttr(Number(stateSince)) : '';
    if (st === 'RUNNING') return tap('RUNNING', '<span class="run-ring"><svg class="run-svg" viewBox="0 0 24 24"><circle class="ring-solid" cx="12" cy="12" r="10"/><circle class="ring-dash" cx="12" cy="12" r="10"/></svg><svg class="run-bolt-svg" viewBox="0 0 24 24"><path d="M12 7L9 12L15 12L12 17" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>', sa);
    if (st === 'QUEUED') return tap('QUEUED', '<span class="queue-ring"><svg class="queue-svg" viewBox="0 0 24 24"><circle class="qring-solid" cx="12" cy="12" r="10"/><circle class="qring-dash" cx="12" cy="12" r="10"/></svg><svg class="queue-dots" viewBox="0 0 24 24"><circle class="qdot qdot1" r="1.8"/><circle class="qdot qdot2" r="1.8"/><circle class="qdot qdot3" r="1.8"/></svg></span>', sa);
    if (st === 'RESTARTING') return tap('RESTARTING', dot('#f97316'), sa);
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
    const exceeded = elapsed > max;
    const barColor = exceeded ? '#ef4444' : '#4ade80';
    const barHeight = exceeded ? 'height:12px' : '';
    const bar = '<span class="dur-bar" style="' + barHeight + '"><span class="dur-fill" style="width:' + pct + '%;background:' + barColor + '"></span></span>';
    const text = fmtDuration(elapsed) + ' / ' + fmtDuration(max);
    const styledText = exceeded ? '<span style="color:#ef4444;font-weight:700">' + text + '</span>' : text;
    return '<span class="dur-mode dur-m-bar">' + tap(exceeded ? '\u{26A0}\u{FE0F} EXCEEDED — ' + text : text, bar) + '</span><span class="dur-mode dur-m-text">' + styledText + '</span>';
  }

  function versionCell(ver) {
    if (!ver) return '-';
    const base = ver.replace(/-.*$/, ''); // strip -rc, -beta etc
    const hasTrailing = base !== ver;
    let color;
    if (hasTrailing) color = '#ec4899';          // pink: RC/beta
    else if (latestNodeVersion && base === latestNodeVersion) color = '#15803d'; // green: matches latest
    else if (latestNodeVersion) color = '#f59e0b'; // yellow: outdated
    else color = '#888';                          // grey: no latest known
    return '<span style="color:' + color + '">' + ver + '</span>';
  }

  function seenAgo(ts) {
    const diff = Math.round((now - ts) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  }

  function downtime(h) {
    let downSecs = 0;
    if (h.containerStoppedAt) {
      downSecs = Math.round((now - new Date(h.containerStoppedAt).getTime()) / 1000);
    }
    if (downSecs <= 0) downSecs = Math.round((now - h.seen) / 1000);
    const dur = downSecs < 3600
      ? Math.floor(downSecs / 60) + 'm'
      : Math.floor(downSecs / 3600) + 'h ' + Math.floor((downSecs % 3600) / 60) + 'm';
    const monitorHB = seenAgo(h.seen);
    return tap('Nosana Fleet Mon Heartbeat: ' + monitorHB, '<span style="color:#ef4444;font-weight:700">' + dur + '</span>');
  }

  function seenCell(h) {
    const isHostDown = isDown(h.n, h.seen);
    const full = isHostDown ? downtime(h) : seenAgo(h.seen);
    let compact;
    if (isHostDown) {
      let downSecs = 0;
      if (h.containerStoppedAt) downSecs = Math.round((now - new Date(h.containerStoppedAt).getTime()) / 1000);
      if (downSecs <= 0) downSecs = Math.round((now - h.seen) / 1000);
      const d = Math.floor(downSecs / 86400);
      const hr = Math.floor((downSecs % 86400) / 3600);
      const mn = Math.floor((downSecs % 3600) / 60);
      const dur = (d ? d + 'd ' : '') + (hr ? hr + 'h ' : '') + mn + 'm';
      compact = tap('PC or Host DOWN ' + dur.trim(), redX);
    } else {
      compact = tap('Nosana Fleet Mon Heartbeat: ' + seenAgo(h.seen), dot('#15803d'));
    }
    return '<span class="hb-m-full">' + full + '</span><span class="hb-m-compact">' + compact + '</span>';
  }

  const rows = hosts
    .map(
      ([name, h]) => `
      <tr data-host="${name}" data-node="${h.nodeAddress || ''}" data-n="${h.n}" data-state="${h.state || ''}" data-q="${h.q}" data-seen="${h.seen}">
        <td class="seen" data-sort="${h.seen ? Math.round((now - h.seen) / 1000) : 99999}">${seenCell(h)}</td>
        <td class="tier">${isDown(h.n, h.seen) ? '<span style="color:#888">?</span>' : tierIndicator(h.tier)}</td>
        <td class="host">${name}</td>
        <td class="node-addr">${h.nodeAddress ? `<a href="https://explore.nosana.com/hosts/${h.nodeAddress}" target="_blank">${h.nodeAddress.slice(0, 5)}</a>` : '-'}</td>
        <td class="sol">${h.sol || '-'}</td>
        <td>${indicator(h.n, h.seen, h.nodeUptime, h.containerStoppedAt, h.downApprox, h.downLabel)}</td>
        <td>${isDown(h.n, h.seen) ? '<span style="color:#555">\u{27F5}</span>' : stateIndicator(h.state, h.stateSince)}</td>
        <td class="running-job">${h.runningJob ? `<a href="https://explore.nosana.com/jobs/${h.runningJob}" target="_blank">${h.runningJob.slice(0, 5)}</a>` : '-'}</td>
        <td class="dur">${h.state === 'QUEUED' && h.q && h.q !== '-' ? '<span style="color:#555">\u{27F6}</span>' : jobDuration(h)}</td>
        <td class="q">${h.q && h.q !== '-' ? h.q + (h.queueTotal ? '/' + h.queueTotal : '') : (h.state === 'RUNNING' && h.jobStart && h.jobTimeout ? '<span style="color:#555">\u{27F5}</span>' : '-')}</td>
        <td class="ram">${h.ram ? Math.round(Number(h.ram) / 1024) : '-'}</td>
        <td class="disk">${h.disk || '-'}</td>
        <td class="dl">${h.dl ? tap('single-stream speed', String(Math.round(Number(h.dl)))) : '-'}</td>
        <td class="ul">${h.ul ? tap('single-stream speed', String(Math.round(Number(h.ul)))) : '-'}</td>
        <td class="ping">${h.ping ? Math.round(Number(h.ping)) : '-'}</td>
        <td class="nos">${h.nos ? Math.round(Number(h.nos)) : '-'}</td>
        <td class="rewards">${h.rewards && h.nodeAddress ? '<a href="https://host.nosana.com/' + h.nodeAddress + '" target="_blank">' + Math.round(Number(h.rewards)) + '</a>' : h.rewards ? String(Math.round(Number(h.rewards))) : '-'}</td>
        <td class="stakedNos">${h.stakedNos !== undefined && h.stakedNos !== '' ? Math.round(Number(h.stakedNos)) + ' / ' + (h.minStake ? Math.round(Number(h.minStake)) : '0') : '-'}</td>
        <td class="gpu" data-host="${name}"><span class="gpu-mode gpu-m-full">${h.marketSlug || h.gpu || '-'}</span><span class="gpu-mode gpu-m-dot">${(h.marketSlug || h.gpu || '').slice(0, 2) || '-'}</span></td>
        <td class="gpuid">${h.gpuId !== undefined && h.gpuId !== '' ? h.gpuId : '-'}</td>
        <td class="ver">${versionCell(h.version)}</td>
        <td class="cuda">${h.cudaVersion || '-'}</td>
        <td class="nvidia-drv"><span class="nv-m-full">${h.nvidiaDriver || '-'}</span><span class="nv-m-compact">${h.nvidiaDriver ? h.nvidiaDriver.split('.')[0] : '-'}</span></td>
        <td class="cpu"><span class="cpu-m-full">${h.cpu || '-'}</span><span class="cpu-m-compact">${h.cpu ? h.cpu.split(' ')[0] : '-'}</span></td>
        <td class="sysenv"><span class="sys-m-full">${h.sysEnv || '-'}</span><span class="sys-m-compact">${h.sysEnv ? h.sysEnv.split('-')[0] : '-'}</span></td>
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
    #gatherFill.breathe{background:#001900}
    @media(max-width:600px){#gatherFill.breathe{background:#151515}}
    @keyframes barBreathe{0%{width:0%}50%{width:100%}100%{width:0%}}
    @keyframes durSweep{0%{left:-100%}5%{left:-100%}10%{left:100%}100%{left:100%}}
    @keyframes colorShift{0%{color:#3b82f6}14%{color:#60a5fa}28%{color:#93c5fd}42%{color:#2563eb}57%{color:#1d4ed8}71%{color:#3b82f6}85%{color:#7dd3fc}100%{color:#3b82f6}}
    @keyframes colorShiftGreen{0%{color:#4ade80}33%{color:#86efac}66%{color:#22c55e}100%{color:#4ade80}}
    .run-ring{display:inline-block;position:relative;width:20px;height:20px;vertical-align:middle}
    .run-ring .state-running{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)}
    .run-bolt-svg{position:absolute;top:50%;left:50%;width:14px;height:14px;transform:translate(-50%,-50%) rotate(5deg)}
    .run-svg{position:absolute;top:0;left:0;width:100%;height:100%;transform:rotate(-90deg)}
    .ring-solid{fill:none;stroke:#3b82f6;stroke-width:1.5;stroke-dasharray:31.4 31.4;stroke-dashoffset:0}
    .ring-dash{fill:none;stroke:#3b82f6;stroke-width:1.5;stroke-dasharray:4.5 5;stroke-dashoffset:0;animation:dashTravel 0.9s linear infinite}
    .ring-dash{clip-path:polygon(0% 0%,100% 0%,100% 50%,0% 50%)}
    @keyframes dashTravel{0%{stroke-dashoffset:0}100%{stroke-dashoffset:-9.5}}
    .state-running{color:#3b82f6}
    .queue-ring{display:inline-block;position:relative;width:20px;height:20px;vertical-align:middle}
    .queue-dots{position:absolute;top:0;left:0;width:100%;height:100%}
    .qdot{fill:#4ade80}
    .qdot1{cx:12;cy:8;animation:q1 4s ease-in-out infinite}
    .qdot2{cx:12;cy:12;animation:q2 4s ease-in-out infinite}
    .qdot3{cx:12;cy:16;animation:q3 4s ease-in-out infinite}
    @keyframes q1{0%{cy:8;opacity:1}10%{cy:4;opacity:0}55%{cy:20;opacity:0}65%{cy:20;opacity:1}75%{cy:16;opacity:1}99.9%{cy:16;opacity:1}100%{cy:8;opacity:1}}
    @keyframes q2{0%{cy:12}15%{cy:12}25%{cy:8}99.9%{cy:8}100%{cy:12}}
    @keyframes q3{0%{cy:16}20%{cy:16}30%{cy:12}99.9%{cy:12}100%{cy:16}}
    .queue-svg{position:absolute;top:0;left:0;width:100%;height:100%;transform:rotate(-90deg)}
    .qring-solid{fill:none;stroke:#4ade80;stroke-width:1.5;stroke-dasharray:31.4 31.4;stroke-dashoffset:0}
    .qring-dash{fill:none;stroke:#4ade80;stroke-width:1.5;stroke-dasharray:4.5 5;stroke-dashoffset:0;animation:dashTravel 0.9s linear infinite}
    .qring-dash{clip-path:polygon(0% 0%,100% 0%,100% 50%,0% 50%)}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,monospace;
         background:#111;color:#e0e0e0;padding:12px;font-size:14px}
    h1{font-size:18px;margin-bottom:8px;color:#fff}
    .legend{font-size:11px;color:#888;margin-bottom:12px}
    table{border-collapse:collapse}
    th,td{padding:6px 8px;text-align:center;border-bottom:1px solid #2a2a2a;white-space:nowrap}
    tbody tr:nth-child(even){background:#171717}
    th{color:#aaa;font-size:10px;cursor:pointer;user-select:none;
       padding:6px 8px;vertical-align:bottom}
    th{height:80px;position:relative}
    th div{position:absolute;bottom:2px;left:calc(50% - 5px);transform:rotate(-90deg);transform-origin:0 0;white-space:nowrap}
    th:hover{color:#fff}
    th .sort-arrow{font-size:8px;color:#4ade80;margin-right:4px}
    td.host{text-align:left;font-weight:600;color:#fff;padding:0 4px}
    td.node-addr a{color:#60a5fa;text-decoration:none}
    td.node-addr a:hover{text-decoration:underline}
    td.rewards a{color:#15803d;text-decoration:none;font-weight:600}
    td.rewards a:hover{text-decoration:underline}
    td.q{font-size:12px;color:#ccc}
    td.seen,td.ver,td.dl,td.ul,td.ping,td.disk,td.gpu,td.ram,td.gpuid,td.rewards,td.dur,td.cuda,td.nvidia-drv,td.cpu,td.sysenv,td.running-job{font-size:11px;color:#888}
    td.running-job a{color:#60a5fa;text-decoration:none}
    td.running-job a:hover{text-decoration:underline}
    td.sol{font-size:11px;color:#7B3FCC}
    td.nos,td.stakedNos{font-size:11px;color:#15803d}
    .actions{margin:16px 0}
    .btn-row{display:flex;gap:8px;flex-wrap:wrap}
    button{background:#111;color:#15803d;border:1px solid #15803d;padding:8px 14px;
           border-radius:6px;font-size:12px;cursor:pointer}
    button:hover{background:#1a1a1a}
    .status-msg{font-size:12px;color:#888;margin-top:4px}
    .hint{font-size:11px;color:#f59e0b;margin-top:8px;line-height:1.5}
    .hint a{color:#60a5fa}
    .empty{text-align:center;padding:32px;color:#666}
    .dur-bar{display:inline-block;width:30px;height:8px;background:#333;border-radius:4px;vertical-align:middle}
    .dur-fill{display:block;height:100%;background:#4ade80;border-radius:4px;position:relative;overflow:hidden}
    .dur-fill::after{content:'';position:absolute;top:0;left:-100%;width:100%;height:100%;background:linear-gradient(90deg,transparent,rgba(255,255,255,1),transparent);animation:durSweep 10s linear infinite}
    .dur-m-text{display:none}
    body.dur-text .dur-m-bar{display:none}
    body.dur-text .dur-m-text{display:inline}
    .dur-toggle,.gpu-toggle,.hb-toggle,.nv-toggle,.cpu-toggle,.sys-toggle{cursor:pointer;font-size:12px}
    .nv-m-full{display:none}
    body.nv-expanded .nv-m-full{display:inline}
    body.nv-expanded .nv-m-compact{display:none}
    .cpu-m-full{display:none}
    body.cpu-expanded .cpu-m-full{display:inline}
    body.cpu-expanded .cpu-m-compact{display:none}
    .sys-m-full{display:none}
    body.sys-expanded .sys-m-full{display:inline}
    body.sys-expanded .sys-m-compact{display:none}
    .hb-m-compact{display:none}
    body.hb-compact .hb-m-full{display:none}
    body.hb-compact .hb-m-compact{display:inline}
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
      <span id="purgeBtn" style="cursor:pointer" title="Purge stale hosts">\u{267B}\u{FE0F}</span>
    </span>
  </div>
  <div class="legend">Tap column header to sort <span id="sortReset" style="cursor:pointer">\u{1F191}</span></div>
  ${totalHosts > 0 ? `
  <div id="gatherBar" class="tap" data-label="${completeHosts < totalHosts ? 'Gathering data from nodes... ' + completeHosts + '/' + totalHosts : 'All ' + totalHosts + ' nodes reporting'}" style="margin-bottom:8px">
    <div style="height:4px;position:relative">
      ${completeHosts < totalHosts
        ? '<div id="gatherFill" data-gathering="1" style="width:' + Math.round((completeHosts / totalHosts) * 100) + '%;height:100%;background:#4ade80;border-radius:4px;position:absolute;left:50%;transform:translateX(-50%)"></div>'
        : '<div id="gatherFill" class="breathe" data-gathering="0" style="width:0%;height:100%;border-radius:4px;position:absolute;left:50%;transform:translateX(-50%)"></div>'}
    </div>
    ${completeHosts < totalHosts ? '<div style="font-size:10px;color:#666;margin-top:2px">Gathering data from nodes\u{2026}</div>' : ''}
  </div>` : ''}
  ${
    hosts.length === 0
      ? '<div class="empty">No host data yet. Waiting for monitors...</div>'
      : `<table id="fleet">
    <thead>
      <tr>
        <th data-col="seen" data-type="num"><div>Monitor HB <span class="hb-toggle" id="hbToggle">\u{1F504}</span></div></th>
        <th data-col="tier" data-type="string"><div>Status</div></th>
        <th data-col="host" data-type="string"><div>PC</div></th>
        <th data-col="node" data-type="string"><div style="white-space:normal;text-align:left;line-height:1.3;left:calc(50% - 12px);bottom:-13px">Host<br>Address</div></th>
        <th data-col="sol" data-type="num"><div>SOL</div></th>
        <th data-col="n" data-type="num"><div>Host</div></th>
        <th data-col="state" data-type="string"><div>State</div></th>
        <th data-col="runningJob" data-type="string"><div style="white-space:normal;text-align:left;line-height:1.3;left:calc(50% - 12px);bottom:-13px">Latest<br>Job</div></th>
        <th data-col="dur" data-type="string"><div>Duration <span class="dur-toggle" id="durToggle">\u{1F504}</span></div></th>
        <th data-col="q" data-type="string"><div>Queued</div></th>
        <th data-col="ram" data-type="num"><div>RAM</div></th>
        <th data-col="disk" data-type="num"><div>Disk</div></th>
        <th data-col="dl" data-type="num"><div>DL</div></th>
        <th data-col="ul" data-type="num"><div>UL</div></th>
        <th data-col="ping" data-type="num"><div>Ping</div></th>
        <th data-col="nos" data-type="num"><div>NOS</div></th>
        <th data-col="rewards" data-type="num"><div style="white-space:normal;text-align:left;line-height:1.3;left:calc(50% - 12px);bottom:-13px">Rewards<br>to claim</div></th>
        <th data-col="stakedNos" data-type="num"><div>Staked NOS</div></th>
        <th data-col="gpu" data-type="string"><div>Market <span class="gpu-toggle" id="gpuToggle">\u{1F504}</span></div></th>
        <th data-col="gpuid" data-type="num"><div>GPU ID</div></th>
        <th data-col="ver" data-type="string"><div style="white-space:normal;text-align:left;line-height:1.3;left:calc(50% - 12px);bottom:-26px">Current<br>Node<br>${latestNodeVersion || '?'}</div></th>
        <th data-col="cuda" data-type="string"><div>CUDA</div></th>
        <th data-col="nvidiaDriver" data-type="string"><div>NVIDIA <span class="nv-toggle" id="nvToggle">\u{1F504}</span></div></th>
        <th data-col="cpu" data-type="string"><div>CPU <span class="cpu-toggle" id="cpuToggle">\u{1F504}</span></div></th>
        <th data-col="sysEnv" data-type="string"><div>System <span class="sys-toggle" id="sysToggle">\u{1F504}</span></div></th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>`
  }

  <div class="actions">
    <div class="btn-row">
      <select id="modeSelect" style="background:#222;color:#15803d;border:1px solid #15803d;border-radius:6px;padding:8px 10px;font-size:12px">
        <option value="kiosk" selected>Kiosk</option>
        <option value="10">Fast 10 min</option>
        <option value="15">Fast 15 min</option>
        <option value="20">Fast 20 min</option>
        <option value="30">Fast 30 min</option>
      </select>
      <span id="fastInfo" style="cursor:pointer;font-size:14px;color:#888;margin-right:16px" title="Info">\u{24D8}</span>
      <button id="pushBtn">Enable Push</button>
      <button id="soundBtn">Enable Sound</button>
      <button id="installBtn" style="display:none">Install App</button>
    </div>
    <div id="fastStatus" style="font-size:11px;color:#666;margin-top:4px;display:none"></div>
    <div class="status-msg" id="statusMsg"></div>
  </div>

  <script>
    // Format timestamps in local timezone for tooltips
    function fmtLocal(d) {
      const h = d.getHours(), m = d.getMinutes().toString().padStart(2,'0');
      const ampm = h >= 12 ? 'PM' : 'AM';
      return (d.getMonth()+1) + '/' + d.getDate() + ' ' + (h % 12 || 12) + ':' + m + ' ' + ampm;
    }

    const TOKEN = ${JSON.stringify(token)};
    const VAPID_PUBLIC_KEY = ${JSON.stringify(vapidPublicKey)};

    /* ---- Purge stale hosts ---- */
    (function() {
      const btn = document.getElementById('purgeBtn');
      if (!btn) return;
      btn.addEventListener('click', async () => {
        const rows = document.querySelectorAll('#fleet tbody tr');
        const stale = [];
        const now = Date.now();
        rows.forEach(r => {
          const name = r.dataset.host;
          const n = r.dataset.n;
          const state = r.dataset.state;
          const seen = Number(r.dataset.seen) || 0;
          const age = now - seen;
          if (!n || n === '0' || !state || age > 15 * 60 * 1000) stale.push(name);
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

    /* ---- Heartbeat toggle ---- */
    (function() {
      const mode = localStorage.getItem('nosana-hb-mode') || 'full';
      if (mode === 'compact') document.body.classList.add('hb-compact');
      const tog = document.getElementById('hbToggle');
      if (tog) tog.addEventListener('click', (e) => {
        e.stopPropagation();
        document.body.classList.toggle('hb-compact');
        const cur = document.body.classList.contains('hb-compact') ? 'compact' : 'full';
        localStorage.setItem('nosana-hb-mode', cur);
      });
    })();

    /* ---- NVIDIA Driver toggle (default: compact) ---- */
    (function() {
      const mode = localStorage.getItem('nosana-nv-mode') || 'compact';
      if (mode === 'expanded') document.body.classList.add('nv-expanded');
      const tog = document.getElementById('nvToggle');
      if (tog) tog.addEventListener('click', (e) => {
        e.stopPropagation();
        document.body.classList.toggle('nv-expanded');
        const cur = document.body.classList.contains('nv-expanded') ? 'expanded' : 'compact';
        localStorage.setItem('nosana-nv-mode', cur);
      });
    })();

    /* ---- CPU toggle (default: compact) ---- */
    (function() {
      const mode = localStorage.getItem('nosana-cpu-mode') || 'compact';
      if (mode === 'expanded') document.body.classList.add('cpu-expanded');
      const tog = document.getElementById('cpuToggle');
      if (tog) tog.addEventListener('click', (e) => {
        e.stopPropagation();
        document.body.classList.toggle('cpu-expanded');
        const cur = document.body.classList.contains('cpu-expanded') ? 'expanded' : 'compact';
        localStorage.setItem('nosana-cpu-mode', cur);
      });
    })();

    /* ---- System Env toggle (default: compact) ---- */
    (function() {
      const mode = localStorage.getItem('nosana-sys-mode') || 'compact';
      if (mode === 'expanded') document.body.classList.add('sys-expanded');
      const tog = document.getElementById('sysToggle');
      if (tog) tog.addEventListener('click', (e) => {
        e.stopPropagation();
        document.body.classList.toggle('sys-expanded');
        const cur = document.body.classList.contains('sys-expanded') ? 'expanded' : 'compact';
        localStorage.setItem('nosana-sys-mode', cur);
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
      let label = tap.dataset.label;
      const tsVal = tap.dataset.sinceTs;
      const isoVal = tap.dataset.sinceIso;
      const pre = label.includes('prior to') ? ' ' : ' since ';
      if (tsVal) { const d = new Date(Number(tsVal)); if (!isNaN(d)) label += pre + fmtLocal(d); }
      else if (isoVal) { const d = new Date(isoVal); if (!isNaN(d)) label += pre + fmtLocal(d); }
      tip.textContent = label;
      tap.appendChild(tip);
      // Clamp tooltip so it doesn't go off-screen left or right
      const rect = tip.getBoundingClientRect();
      if (rect.left < 0) { tip.style.left = '0'; tip.style.transform = 'none'; }
      else if (rect.right > window.innerWidth) { tip.style.left = 'auto'; tip.style.right = '0'; tip.style.transform = 'none'; }
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
          h.querySelectorAll('.sort-arrow').forEach(a => a.remove());
        });
      }

      function addArrow(th, dir) {
        clearArrows();
        const sym = dir === 1 ? ' \\u25C0' : ' \\u25B6';
        const div = th.querySelector('div');
        const target = div || th;
        const brs = target.querySelectorAll('br');
        if (brs.length > 0) {
          // Multi-line header — arrow before first line and after each <br>
          const a1 = document.createElement('span');
          a1.className = 'sort-arrow';
          a1.textContent = sym;
          target.insertBefore(a1, target.firstChild);
          brs.forEach(br => {
            const a = document.createElement('span');
            a.className = 'sort-arrow';
            a.textContent = sym;
            br.after(a);
          });
        } else {
          const arrow = document.createElement('span');
          arrow.className = 'sort-arrow';
          arrow.textContent = sym;
          target.insertBefore(arrow, target.firstChild);
        }
      }

      function resetSort() {
        currentSort = 'host';
        sortDir = 1;
        addArrow(headers[2], sortDir);
        const tbody = table.querySelector('tbody');
        const rows = Array.from(tbody.querySelectorAll('tr'));
        rows.sort((a, b) => (a.children[2] ? a.children[2].textContent.trim() : '').localeCompare(b.children[2] ? b.children[2].textContent.trim() : ''));
        rows.forEach(r => tbody.appendChild(r));
      }

      const resetBtn = document.getElementById('sortReset');
      if (resetBtn) resetBtn.addEventListener('click', resetSort);

      // Show default sort arrow on PC column (index 1)
      addArrow(headers[2], 1);

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
    }
    function setPushDisabled() {
      pushBtn.textContent = 'Enable Push';
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
      if (pushBtn.textContent === 'Disable Push') disableAlerts();
      else enableAlerts();
    });

    /* ---- Page Sound toggle ---- */
    let pageSoundEnabled = localStorage.getItem('nosana-page-sound') === 'on';

    function setSoundEnabled() {
      soundBtn.textContent = 'Disable Sound';
      pageSoundEnabled = true;
      localStorage.setItem('nosana-page-sound', 'on');
    }
    function setSoundDisabled() {
      soundBtn.textContent = 'Enable Sound';
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
      alert('How to Use\\n\\nInstall App adds a desktop/home screen shortcut that opens in its own window.\\n\\n\\u2705 Chrome, Edge (Windows, macOS, Linux, Android)\\n\\u26A0\\uFE0F iOS Safari: use Share \\u2192 "Add to Home Screen" instead\\n\\u274C Firefox, Brave, Safari macOS: not supported');
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

    /* ---- Cache + controlled refresh ---- */
    (function() {
      const cacheKey = 'nosana-fleet-cache-' + TOKEN;
      const loadTime = Date.now();

      // Save current page to localStorage
      localStorage.setItem(cacheKey, JSON.stringify({ ts: loadTime }));

      const complete = ${completeHosts};
      const total = ${totalHosts};

      const gatherFill = document.getElementById('gatherFill');

      // Kiosk/Fast mode auto-refresh with visibility awareness
      const kioskInterval = 120;
      const fastInterval = ${totalHosts <= 10 ? 10 : totalHosts <= 50 ? 15 : totalHosts <= 150 ? 20 : totalHosts <= 250 ? 30 : 45};
      let isFast = false;
      let fastExpiry = 0;
      let refreshTimer = null;

      const modeSelect = document.getElementById('modeSelect');
      const fastStatus = document.getElementById('fastStatus');
      const fastInfo = document.getElementById('fastInfo');

      // Restore mode from localStorage
      const savedFast = localStorage.getItem('nosana-fast-expiry');
      if (savedFast && Number(savedFast) > Date.now()) {
        isFast = true;
        fastExpiry = Number(savedFast);
        const savedMins = localStorage.getItem('nosana-fast-mins') || '15';
        modeSelect.value = savedMins;
      }

      function currentInterval() { return isFast ? fastInterval : kioskInterval; }

      function updateStatus() {
        if (isFast) {
          const totalSecs = Math.max(0, Math.floor((fastExpiry - Date.now()) / 1000));
          const left = Math.floor(totalSecs / 60);
          const secs = totalSecs % 60;
          fastStatus.textContent = 'Fast mode: ' + left + 'm ' + secs + 's remaining \u{2022} refresh ' + fastInterval + 's';
          fastStatus.style.display = '';
          if (Date.now() >= fastExpiry) {
            isFast = false;
            fastExpiry = 0;
            localStorage.removeItem('nosana-fast-expiry');
            localStorage.removeItem('nosana-fast-mins');
            modeSelect.value = 'kiosk';
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
          if (document.hidden) return;
          elapsed++;
          updateStatus();
          if (elapsed >= intv) {
            location.reload();
          }
        }, 1000);
      }

      modeSelect.addEventListener('change', () => {
        const val = modeSelect.value;
        if (val === 'kiosk') {
          isFast = false;
          fastExpiry = 0;
          localStorage.removeItem('nosana-fast-expiry');
          localStorage.removeItem('nosana-fast-mins');
        } else {
          const mins = Number(val) || 15;
          isFast = true;
          fastExpiry = Date.now() + mins * 60000;
          localStorage.setItem('nosana-fast-expiry', String(fastExpiry));
          localStorage.setItem('nosana-fast-mins', val);
        }
        updateStatus();
        scheduleRefresh();
        startBarAnimation();
      });

      if (fastInfo) fastInfo.addEventListener('click', () => {
        alert('Kiosk mode (default):\\nRefreshes every ' + kioskInterval + 's. Low API usage, safe for always-on displays.\\n\\nFast mode:\\nRefreshes every ' + fastInterval + 's for active monitoring. Auto-reverts to kiosk after the chosen timeout.\\n\\nBoth modes pause when the tab is in the background.\\nEach refresh counts toward a daily limit of 100K (free tier).\\nFleet size: ' + total + ' hosts.');
      });


      // Start breathing bar animation
      function startBarAnimation() {
        if (!gatherFill || gatherFill.dataset.gathering === '1') return;
        const intv = currentInterval();
        gatherFill.style.animation = 'barBreathe ' + intv + 's ease-in-out infinite';
      }

      // Start auto-refresh
      updateStatus();
      scheduleRefresh();
      startBarAnimation();
    })();
  </script>
  ${versionLabel ? '<div style="text-align:right;font-size:10px;color:#555;margin-top:8px">' + versionLabel + '</div>' : ''}
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

  // Fetch latest nosana-node version from Docker Hub (one call per cron tick for entire fleet)
  try {
    const resp = await fetch('https://hub.docker.com/v2/repositories/nosana/nosana-node/tags/?page_size=5&ordering=last_updated');
    if (resp.ok) {
      const tags = await resp.json();
      const latest = (tags.results || []).find(t => /^v?\d+\.\d+\.\d+$/.test(t.name));
      if (latest) {
        await env.FLEET_DATA.put('_latestNodeVersion', latest.name.replace(/^v/, ''));
      }
    }
  } catch {}

  // Get tokens from KV
  const kvTokenList = await env.FLEET_DATA.get('_tokens');
  const tokens = kvTokenList ? JSON.parse(kvTokenList) : [];

  for (const token of tokens) {
    // Read current KV data
    const raw = await env.FLEET_DATA.get(token);
    let data;
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = {};
    }

    let changed = false;

    // Check for stale hosts
    for (const [hostName, host] of Object.entries(data)) {
      const age = now - host.seen;
      const wasUp = Number(host.n) === 1;

      if (age > STALE_THRESHOLD_MS && wasUp && !host.alerted) {
        const level = classifyAlert({ n: host.n, stale: true });
        const payload = JSON.stringify({
          title: alertTitle(level),
          body: `\u{1F6A8} Host unreachable \u{2014} ${hostName} (no data for 15m)`,
          level,
          url: `/d/${token}`,
        });

        await sendAlerts(token, payload, env);

        data[hostName].alerted = true;
        changed = true;
      }
    }

    // Single KV write per token per cron tick (only if anything changed)
    if (changed) {
      try { await env.FLEET_DATA.put(token, JSON.stringify(data)); } catch {}
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
