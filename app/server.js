// Miner Control - small read-only dashboard for AxeOS miners (Bitaxe, LuckyAxe, ...)
// No external dependencies: runs on the official node:22-alpine image.
// The server polls each miner's /api/system/info, keeps history and events in /data
// and serves the web page. It never writes anything to a miner.

'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pool = require('./pool');
const push = require('./push');
const i18n = require('./public/i18n.js');
const scan = require('./scan');

const [NODE_MAJOR] = process.versions.node.split('.').map(Number);
if (NODE_MAJOR < 18) { console.error(`Miner Control needs Node.js 18 or newer (found ${process.versions.node}).`); process.exit(1); }

const PORT = parseInt(process.env.PORT || '8080', 10);
// data folder: /data in Docker, otherwise a 'data' folder next to the app (Linux, Windows)
const DATA_DIR = process.env.DATA_DIR || (fs.existsSync('/data') ? '/data' : path.join(__dirname, '..', 'data'));
const PUBLIC_DIR = path.join(__dirname, 'public');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const STORE_FILE = path.join(DATA_DIR, 'store.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
const MAX_EVENTS = 300;
const FETCH_TIMEOUT_MS = 5000;

const PROFILE_NAMES = { 0: '🍃 ECO', 1: '⚖️ Normal', 2: '⚡ Power', 3: '⚙️ Custom', 4: '🌙 Silent' };

const DEFAULT_LANG = i18n.normalise(process.env.MC_LANG) || 'de';

const DEFAULT_CONFIG = {
  title: 'MINER CONTROL',
  lang: DEFAULT_LANG,
  cost: { kwh: 0, currency: DEFAULT_LANG === 'de' ? 'EUR' : 'USD' },   // electricity price per kWh, 0 = do not show costs
  pollSeconds: 10,
  retentionDays: 30,
  alerts: { asicTemp: 70, vrTemp: 85, hashPct: 80, offlineMin: 2, minVinPct: 93 },
  push: { block: true, offline: true, warn: true, online: true, pool: true, best: false, cooldownMin: 15 },
  miners: []
};

// ---------- persistence helpers ----------
fs.mkdirSync(DATA_DIR, { recursive: true });

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file, obj) {
  // write to a temp file first so a power cut never leaves a half-written file
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj));
  fs.renameSync(tmp, file);
}

let config = Object.assign({}, DEFAULT_CONFIG, readJson(CONFIG_FILE, {}));
if (!i18n.normalise(config.lang)) config.lang = DEFAULT_LANG;
config.cost = Object.assign({}, DEFAULT_CONFIG.cost, config.cost || {});
config.alerts = Object.assign({}, DEFAULT_CONFIG.alerts, config.alerts || {});
config.push = Object.assign({}, DEFAULT_CONFIG.push, config.push || {});
if (!Array.isArray(config.miners)) config.miners = [];
writeJson(CONFIG_FILE, config);

// store: events + per-miner trackers (best diff, block count) that survive restarts
const store = readJson(STORE_FILE, { events: [], track: {} });
if (!Array.isArray(store.events)) store.events = [];
if (!store.track) store.track = {};
let storeDirty = false;

// history: { minerId: [[minuteTs, hashGH, powerW, maxTempC], ...] }
const history = readJson(HISTORY_FILE, {});

// ---------- runtime state ----------
const live = {};      // minerId -> { online, lastSeen, lastError, data, alerts: Map(key -> {k, a}) }
const bucket = {};    // minerId -> { minute, hash, power, temp, n }

// server-side translation (push messages and the readable copy of each event)
const T = (key, args) => i18n.tr(config.lang, key, args);

// Events are stored as a translation key + values (k, a), so the browser can show them in its own
// language. 'text' is the same message in the server language (fallback, and used for push).
function addEvent(level, minerId, k, a, src = 'miner') {
  const m = config.miners.find(x => x.id === minerId);
  const text = T(k, a);
  store.events.unshift({ t: Date.now(), level, miner: m ? m.name : '', k, a, text, src });
  if (store.events.length > MAX_EVENTS) store.events.length = MAX_EVENTS;
  storeDirty = true;
  notify(level, m ? m.name : '', text, src);
}

// push notification for an event, filtered by the settings in config.push
function notify(level, miner, text, src) {
  const p = config.push || {};
  const clean = String(text);
  if (src === 'pool' && level !== 'block' && !p.pool) return;
  const map = {
    block: [p.block, T('push.block'), true],
    bad: [p.offline, `🔴 ${miner || 'Pool'}`, true],
    warn: [p.warn, `⚠ ${miner || 'Pool'}`, false],
    ok: [p.online, `🟢 ${miner || 'Pool'}`, false],
    info: [p.best, `🎯 ${miner || 'Pool'}`, false]
  };
  const e = map[level];
  if (!e || !e[0]) return;
  const body = level === 'block' ? `${miner ? miner + ': ' : ''}${clean}` : clean;
  push.send(e[1], body, {
    key: `${miner}|${level}|${clean.replace(/[\d.,]+/g, '')}`,
    // blocks and new best difficulties are rare and every one is news: no cooldown, each gets its own notification
    cooldownMin: (level === 'block' || level === 'info') ? 0 : Number(p.cooldownMin ?? 15),
    urgent: e[2], tag: (level === 'block' || level === 'info') ? level + '-' + Date.now() : undefined
  }).catch(() => {});
}

// ---------- normalise AxeOS JSON into one compact shape ----------
const num = v => (typeof v === 'number' && isFinite(v) ? v : null);

function normalise(j) {
  const temps = [j.temp, j.temp2, j.temp3, j.temp4].map(num).filter(v => v !== null && v > 0 && v < 150);
  // AxeOS reports mV; 0 means 'no reading yet' (e.g. right after a restart), not 0 V
  const vin = num(j.voltage) !== null && j.voltage > 500 ? j.voltage / 1000 : null;
  let nominal = num(j.nominalVoltage);
  if (nominal && nominal > 100) nominal = nominal / 1000;                // tolerate mV
  if (!nominal && vin) nominal = vin > 8 ? 12 : 5;

  const fans = [{
    name: j.fan2rpm !== undefined && (j.fan2Mode || j.fan2rpm > 0) ? 'Fan 1' : 'Fan',
    pct: num(j.fanspeed), rpm: num(j.fanrpm),
    mode: j.overheat_mode ? 'Overheat' : (j.autofanspeed ? 'Auto' : 'Manual')
  }];
  fans[0].stalled = num(j.fanspeed) > 15 && num(j.fanrpm) === 0;
  if (j.fan2Mode || num(j.fan2rpm) > 0) {
    fans.push({ name: 'Fan 2', pct: num(j.fan2speed), rpm: num(j.fan2rpm), mode: j.fan2Mode || (j.autofan2speed ? 'Auto' : 'Manual'),
      stalled: !!j.fan2Stalled || (num(j.fan2speed) > 15 && num(j.fan2rpm) === 0) });
  }

  let pools = [];
  if (Array.isArray(j.poolStats) && j.poolStats.length && j.dualPool) {
    const bal = num(j.poolBalance);
    pools = j.poolStats.map((p, i) => {
      let share = num(p.effectiveBalance);
      if (share === null || share < 0 || share > 100) share = bal !== null ? (i === 0 ? bal : 100 - bal) : null;
      return {
        host: p.url ? `${p.url}:${p.port}` : `Pool ${i + 1}`,
        connected: !!p.connected, accepted: num(p.sharesAccepted) || 0,
        rejected: num(p.sharesRejected) || 0, share
      };
    });
  } else {
    const fb = !!j.isUsingFallbackStratum;
    const url = fb ? j.fallbackStratumURL : j.stratumURL;
    const port = fb ? j.fallbackStratumPort : j.stratumPort;
    pools = [{
      host: url ? `${url}:${port}` : 'Pool', fallback: fb, connected: true,
      accepted: num(j.sharesAccepted) || 0, rejected: num(j.sharesRejected) || 0, share: 100
    }];
  }

  const rejectedReasons = Array.isArray(j.sharesRejectedReasons)
    ? j.sharesRejectedReasons.map(r => ({ message: String(r.message || ''), count: num(r.count) || 0 })) : [];

  return {
    hostname: j.hostname || '',
    version: j.version || '',
    asicModel: j.ASICModel || '',
    asicCount: num(j.asicCount) || temps.length || null,
    hash: num(j.hashRate),                       // GH/s
    hash1h: num(j.hashRate_1h),
    expected: num(j.expectedHashrate),           // GH/s
    power: num(j.power),
    vin, nominal,
    temps,
    vrTemp: num(j.vrTemp),
    freq: num(j.frequency),
    vcore: num(j.coreVoltageActual) || num(j.coreVoltage),   // mV
    errorPct: num(j.errorPercentage),
    fans, pools, rejectedReasons,
    accepted: num(j.sharesAccepted) || 0,
    rejected: num(j.sharesRejected) || 0,
    best: num(j.bestDiff),
    bestSession: num(j.bestSessionDiff),
    blocksTotal: num(j.blocksFoundTotal),
    lastBlockTime: num(j.lastBlockTime),
    blockFound: !!j.blockFound,
    uptime: num(j.uptimeSeconds),
    profile: j.profile !== undefined && PROFILE_NAMES[j.profile] ? PROFILE_NAMES[j.profile] : null,
    oc: !!j.overclockEnabled,
    paused: !!j.miningPaused,
    overheat: !!j.overheat_mode
  };
}

// ---------- events and alerts ----------
function fmtDiff(v) {
  if (v === null || v === undefined) return '-';
  const u = ['', 'K', 'M', 'G', 'T', 'P', 'E'];
  let i = 0; while (v >= 1000 && i < u.length - 1) { v /= 1000; i++; }
  return v.toFixed(2) + ' ' + u[i];
}

function checkEvents(m, d) {
  const t = store.track[m.id] || (store.track[m.id] = {});
  // blocks: LuckyAxe has a persistent counter, plain AxeOS only a "blockFound" flag
  if (d.blocksTotal !== null) {
    if (t.blocks !== undefined && d.blocksTotal > t.blocks) addEvent('block', m.id, 'ev.block', { n: d.blocksTotal });
    if (t.blocks !== d.blocksTotal) { t.blocks = d.blocksTotal; storeDirty = true; }
  } else {
    if (d.blockFound && t.blockFlag === false) addEvent('block', m.id, 'ev.blockFlag', {});
    if (t.blockFlag !== d.blockFound) { t.blockFlag = d.blockFound; storeDirty = true; }
  }
  // new all-time best difficulty
  if (d.best !== null) {
    if (t.best !== undefined && d.best > t.best) addEvent('info', m.id, 'ev.best', { v: fmtDiff(d.best) });
    if (t.best === undefined || d.best > t.best) { t.best = d.best; storeDirty = true; }
  }
}

function checkAlerts(m, st, d, silent) {
  const a = config.alerts, now = new Map();
  // an alert is {k: translation key, a: values}; 'key' identifies it, so the same alert with a new value is not a new alert
  const add = (k, args, key = k) => now.set(key, { k, a: args });
  const maxT = d.temps.length ? Math.max(...d.temps) : null;
  if (maxT !== null && maxT > a.asicTemp) add('alert.asic', { v: maxT.toFixed(1) });
  if (d.vrTemp !== null && d.vrTemp > a.vrTemp) add('alert.vr', { v: d.vrTemp.toFixed(1) });
  if (d.hash !== null && d.expected && (d.uptime || 0) > 600 && !d.paused && d.hash < d.expected * a.hashPct / 100)
    add('alert.hash', { v: (d.hash / d.expected * 100).toFixed(0) });
  if (d.vin !== null && d.nominal && d.vin < d.nominal * a.minVinPct / 100) add('alert.vin', { v: d.vin.toFixed(2) });
  if (d.overheat) add('alert.overheat', {});
  if ((d.uptime || 0) > 120) for (const f of d.fans) if (f.stalled) add('alert.fan', { name: f.name, pct: f.pct ?? '-' }, 'alert.fan:' + f.name);
  // after a dashboard restart, alerts that are already active are shown on the card but not logged again
  if (!silent) for (const [key, al] of now) if (!st.alerts.has(key)) addEvent('warn', m.id, al.k, al.a);
  st.alerts = now;
}

// ---------- history ----------
function addSample(id, d) {
  const minute = Math.floor(Date.now() / 60000) * 60000;
  let b = bucket[id];
  if (b && b.minute !== minute) flushBucket(id);
  b = bucket[id] || (bucket[id] = { minute, hash: 0, power: 0, temp: 0, n: 0 });
  b.hash += d.hash || 0;
  b.power += d.power || 0;
  b.temp = Math.max(b.temp, d.temps.length ? Math.max(...d.temps) : 0);
  b.n++;
}
function flushBucket(id) {
  const b = bucket[id];
  if (!b || !b.n) { delete bucket[id]; return; }
  (history[id] || (history[id] = [])).push([b.minute, +(b.hash / b.n).toFixed(1), +(b.power / b.n).toFixed(1), +b.temp.toFixed(1)]);
  delete bucket[id];
}
function pruneHistory() {
  const cutoff = Date.now() - config.retentionDays * 86400000;
  const ids = new Set(config.miners.map(m => m.id));
  for (const id of Object.keys(history)) {
    if (!ids.has(id)) { delete history[id]; continue; }
    const arr = history[id];
    let i = 0; while (i < arr.length && arr[i][0] < cutoff) i++;
    if (i) arr.splice(0, i);
  }
}

// ---------- polling ----------
async function pollMiner(m) {
  const st = live[m.id] || (live[m.id] = { online: false, lastSeen: 0, lastError: '', data: null, alerts: new Map(), everSeen: false });
  try {
    const base = /^https?:\/\//.test(m.ip) ? m.ip : `http://${m.ip}`;
    const res = await fetch(`${base}/api/system/info`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const d = normalise(await res.json());
    const firstPoll = !st.everSeen;
    if (!st.online && st.everSeen) addEvent('ok', m.id, 'ev.online', {});
    st.online = true; st.everSeen = true; st.lastSeen = Date.now(); st.lastError = ''; st.data = d;
    checkEvents(m, d);
    checkAlerts(m, st, d, firstPoll);
    addSample(m.id, d);
  } catch (e) {
    st.lastError = e.name === 'TimeoutError' ? 'TIMEOUT' : (e.cause && e.cause.code) || e.message;   // codes are translated on display
    const offlineAfter = config.alerts.offlineMin * 60000;
    if (st.online && Date.now() - st.lastSeen > offlineAfter) {
      st.online = false;
      addEvent('bad', m.id, 'ev.offline', { err: st.lastError });
    }
    if (!st.everSeen) st.online = false;
  }
}

let pollTimer = null;
async function pollAll() {
  await Promise.all([...config.miners.map(pollMiner), pool.poll().catch(e => console.log('pool:', e.message))]);
  if (storeDirty) { writeJson(STORE_FILE, store); storeDirty = false; }
}
function schedule() {
  clearInterval(pollTimer);
  pollTimer = setInterval(pollAll, config.pollSeconds * 1000);
  pollAll();
}

// once a minute: close finished minute buckets, prune and save history
setInterval(() => {
  const minute = Math.floor(Date.now() / 60000) * 60000;
  for (const id of Object.keys(bucket)) if (bucket[id].minute !== minute) flushBucket(id);
  pruneHistory();
  writeJson(HISTORY_FILE, history);
}, 60000);

// ---------- API ----------
const RANGES = { '1h': [3600e3, 60e3], '6h': [6 * 3600e3, 120e3], '24h': [86400e3, 300e3], '7d': [7 * 86400e3, 1800e3], '30d': [30 * 86400e3, 7200e3] };

function historyFor(range) {
  const [span, step] = RANGES[range] || RANGES['24h'];
  const now = Date.now(), start = Math.floor((now - span) / step) * step;
  const n = Math.ceil((now - start) / step);
  const series = {};
  let first = n;
  for (const m of config.miners) {
    const sum = new Array(n).fill(0), cnt = new Array(n).fill(0);
    for (const p of history[m.id] || []) {
      if (p[0] < start) continue;
      const i = Math.floor((p[0] - start) / step);
      if (i >= 0 && i < n) { sum[i] += p[1]; cnt[i]++; }
    }
    series[m.id] = sum.map((s, i) => (cnt[i] ? +(s / cnt[i]).toFixed(1) : null));
    const f = series[m.id].findIndex(v => v !== null);
    if (f >= 0 && f < first) first = f;
  }
  if (first === n) first = Math.max(0, n - 1);
  // drop trailing buckets that have no data yet (the current minute is still being collected)
  let last = n;
  while (last > first + 1 && Object.values(series).every(s => s[last - 1] === null)) last--;
  for (const id of Object.keys(series)) series[id] = series[id].slice(first, last);
  return { start: start + first * step, step, series };
}

function stateJson() {
  return {
    title: config.title,
    lang: config.lang,
    cost: config.cost,
    pollSeconds: config.pollSeconds,
    alerts: config.alerts,
    retentionDays: config.retentionDays,
    pool: pool.info(),          // { available, dir } - the POOL page is hidden without ckpool
    now: Date.now(),
    miners: config.miners.map(m => {
      const st = live[m.id] || {};
      return {
        id: m.id, name: m.name, ip: m.ip,
        online: !!st.online, lastSeen: st.lastSeen || 0, lastError: st.lastError || '',
        alerts: st.alerts ? [...st.alerts.values()] : [],
        data: st.data || null
      };
    }),
    events: store.events.slice(0, 100)
  };
}

// fixed list of files the web server may deliver (no directory browsing)
const STATIC = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/widget': ['widget.html', 'text/html; charset=utf-8'],
  '/widget.html': ['widget.html', 'text/html; charset=utf-8'],
  '/manifest.webmanifest': ['manifest.webmanifest', 'application/manifest+json'],
  '/sw.js': ['sw.js', 'text/javascript; charset=utf-8'],
  '/theme.js': ['theme.js', 'text/javascript; charset=utf-8'],
  '/i18n.js': ['i18n.js', 'text/javascript; charset=utf-8'],
  '/icon-192.png': ['icon-192.png', 'image/png'],
  '/icon-512.png': ['icon-512.png', 'image/png'],
  '/apple-touch-icon.png': ['apple-touch-icon.png', 'image/png'],
  '/badge-96.png': ['badge-96.png', 'image/png']
};

// compact numbers for phone widgets (Scriptable, KWGT, web widgets ...)
function summaryJson() {
  let th = 0, exp = 0, power = 0, blocks = null, lastBlock = 0, best = null, online = 0;
  const miners = config.miners.map(m => {
    const st = live[m.id] || {}, d = st.data;
    if (d && d.blocksTotal !== null) blocks = (blocks || 0) + d.blocksTotal;
    if (d && d.lastBlockTime) lastBlock = Math.max(lastBlock, d.lastBlockTime);
    if (d && d.best !== null && (best === null || d.best > best)) best = d.best;
    if (st.online && d) { online++; th += (d.hash || 0) / 1000; exp += (d.expected || 0) / 1000; power += d.power || 0; }
    const tmax = d && d.temps.length ? Math.max(...d.temps) : null;
    return {
      name: m.name, online: !!st.online,
      th: d && st.online ? +((d.hash || 0) / 1000).toFixed(2) : 0,
      pct: d && d.expected ? +(d.hash / d.expected * 100).toFixed(1) : null,
      power: d ? d.power : null, tmax, vr: d ? d.vrTemp : null,
      alerts: st.alerts ? [...st.alerts.values()].map(al => T(al.k, al.a)) : []
    };
  });
  return {
    title: config.title, lang: config.lang, time: Date.now(), online, count: config.miners.length,
    th: +th.toFixed(2), expected: +exp.toFixed(2), power: +power.toFixed(1),
    costDay: config.cost.kwh > 0 ? +(power * 24 / 1000 * config.cost.kwh).toFixed(2) : null, currency: config.cost.currency,
    eff: th ? +(power / th).toFixed(1) : null,
    blocks, lastBlock: lastBlock || null, best, bestText: best !== null ? fmtDiff(best) : null,
    miners,
    pool: pool.summary()
  };
}

function cleanConfig(body) {
  const n = (v, lo, hi, def) => { const x = Number(v); return isFinite(x) ? Math.min(hi, Math.max(lo, x)) : def; };
  const out = {
    title: String(body.title || config.title).slice(0, 40),
    lang: i18n.normalise(body.lang) || config.lang,
    cost: {
      kwh: Math.round(n(body.cost && body.cost.kwh, 0, 10, config.cost.kwh) * 10000) / 10000,
      currency: ['EUR', 'USD'].includes(String(body.cost && body.cost.currency).toUpperCase()) ? String(body.cost.currency).toUpperCase() : config.cost.currency
    },
    pollSeconds: Math.round(n(body.pollSeconds, 5, 300, config.pollSeconds)),
    retentionDays: Math.round(n(body.retentionDays, 1, 365, config.retentionDays)),
    alerts: {
      asicTemp: n(body.alerts && body.alerts.asicTemp, 30, 120, config.alerts.asicTemp),
      vrTemp: n(body.alerts && body.alerts.vrTemp, 30, 150, config.alerts.vrTemp),
      hashPct: n(body.alerts && body.alerts.hashPct, 10, 100, config.alerts.hashPct),
      offlineMin: n(body.alerts && body.alerts.offlineMin, 0.5, 60, config.alerts.offlineMin),
      minVinPct: n(body.alerts && body.alerts.minVinPct, 50, 100, config.alerts.minVinPct)
    },
    push: {
      block: body.push ? !!body.push.block : config.push.block, offline: body.push ? !!body.push.offline : config.push.offline,
      warn: body.push ? !!body.push.warn : config.push.warn, online: body.push ? !!body.push.online : config.push.online,
      pool: body.push ? !!body.push.pool : config.push.pool, best: body.push ? !!body.push.best : config.push.best,
      cooldownMin: Math.round(n(body.push && body.push.cooldownMin, 0, 1440, config.push.cooldownMin))
    },
    pool: { name: String((body.pool && body.pool.name) || (config.pool && config.pool.name) || '').slice(0, 40), coin: String((body.pool && body.pool.coin) || (config.pool && config.pool.coin) || 'BCH').slice(0, 10).toUpperCase(), hideDays: Math.round(n(body.pool && body.pool.hideDays, 0, 365, (config.pool && config.pool.hideDays) ?? 7)) },
    miners: []
  };
  const list = Array.isArray(body.miners) ? body.miners.slice(0, 20) : [];
  for (const m of list) {
    const ip = String(m.ip || '').trim();
    if (!/^(https?:\/\/)?[A-Za-z0-9.\-:\[\]]{1,100}$/.test(ip)) continue;
    const old = config.miners.find(x => x.id === m.id);
    out.miners.push({ id: old ? old.id : crypto.randomBytes(4).toString('hex'), name: String(m.name || ip).slice(0, 40), ip });
  }
  return out;
}

function send(res, code, type, body) {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'GET' && STATIC[url.pathname]) {
    const [file, type] = STATIC[url.pathname];
    fs.readFile(path.join(PUBLIC_DIR, file), (err, buf) =>
      err ? send(res, 404, 'text/plain', file + ' missing') : send(res, 200, type, buf));
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/push/key') return send(res, 200, 'application/json', JSON.stringify({ key: push.publicKey(), devices: push.count() }));
  if (req.method === 'POST' && url.pathname.startsWith('/api/push/')) {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 16384) req.destroy(); });
    req.on('end', async () => {
      let j = {}; try { j = JSON.parse(body || '{}'); } catch {}
      const what = url.pathname.slice('/api/push/'.length);
      if (what === 'subscribe') return send(res, push.subscribe(j.subscription, j.label) ? 200 : 400, 'application/json', JSON.stringify({ devices: push.count() }));
      if (what === 'unsubscribe') { push.unsubscribe(j.endpoint); return send(res, 200, 'application/json', JSON.stringify({ devices: push.count() })); }
      if (what === 'status') return send(res, 200, 'application/json', JSON.stringify({ subscribed: push.has(j.endpoint), devices: push.count() }));
      if (what === 'test') {
        const r = await push.send('>_ Miner Control', T('push.test'), { key: 'test', cooldownMin: 0 });
        return send(res, 200, 'application/json', JSON.stringify(r));
      }
      send(res, 404, 'text/plain', 'not found');
    });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/scan') {
    // looks for AxeOS miners in the local network (only on button click, only private ranges)
    let body = '';
    req.on('data', c => { body += c; if (body.length > 2048) req.destroy(); });
    req.on('end', () => {
      let j = {}; try { j = JSON.parse(body || '{}'); } catch {}
      scan.run(j.range, config.miners.map(m => m.ip))
        .then(r => send(res, 200, 'application/json', JSON.stringify(r)))
        .catch(e => send(res, e.code === 'BUSY' ? 429 : 400, 'application/json', JSON.stringify({ error: e.code || 'FAILED' })));
    });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/lang') {
    // language switch from the page header: only changes the language, nothing else in the settings
    let body = '';
    req.on('data', c => { body += c; if (body.length > 1024) req.destroy(); });
    req.on('end', () => {
      let j = {}; try { j = JSON.parse(body || '{}'); } catch {}
      const lang = i18n.normalise(j.lang);
      if (!lang) return send(res, 400, 'application/json', JSON.stringify({ error: 'unknown language' }));
      config.lang = lang;
      writeJson(CONFIG_FILE, config);
      send(res, 200, 'application/json', JSON.stringify({ lang }));
    });
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/pool') return send(res, 200, 'application/json', JSON.stringify(pool.state()));
  if (req.method === 'GET' && url.pathname === '/api/pool/history') return send(res, 200, 'application/json', JSON.stringify(pool.history(url.searchParams.get('range'))));
  if (req.method === 'GET' && url.pathname === '/api/summary') return send(res, 200, 'application/json', JSON.stringify(summaryJson()));
  if (req.method === 'GET' && url.pathname === '/api/state') return send(res, 200, 'application/json', JSON.stringify(stateJson()));
  if (req.method === 'GET' && url.pathname === '/api/history') return send(res, 200, 'application/json', JSON.stringify(historyFor(url.searchParams.get('range'))));
  if (req.method === 'GET' && url.pathname === '/api/config') return send(res, 200, 'application/json', JSON.stringify(config));
  if (req.method === 'POST' && url.pathname === '/api/config') {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 65536) req.destroy(); });
    req.on('end', () => {
      try {
        const oldCur = config.cost.currency;
        config = cleanConfig(JSON.parse(body));
        if (config.cost.currency !== oldCur) pool.refreshPrice();   // coin price is fetched in the chosen currency
        writeJson(CONFIG_FILE, config);
        for (const id of Object.keys(live)) if (!config.miners.find(m => m.id === id)) delete live[id];
        pruneHistory();
        schedule();
        send(res, 200, 'application/json', JSON.stringify(config));
      } catch (e) {
        send(res, 400, 'application/json', JSON.stringify({ error: 'invalid config' }));
      }
    });
    return;
  }
  send(res, 404, 'text/plain', 'not found');
});

function shutdown() {
  for (const id of Object.keys(bucket)) flushBucket(id);
  try { writeJson(HISTORY_FILE, history); writeJson(STORE_FILE, store); } catch {}
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

push.init(DATA_DIR);
pool.init({ store, addEvent, markDirty: () => { storeDirty = true; }, getConfig: () => config, dataDir: DATA_DIR });
server.listen(PORT, () => console.log(`Miner Control listening on port ${PORT}, ${config.miners.length} miner(s) configured, data in ${DATA_DIR}`));
schedule();
