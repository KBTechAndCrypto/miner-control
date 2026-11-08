// Pool page backend for Miner Control: reads ckpool's own status files (read-only)
// and asks the local node for height / difficulty. Only real data, nothing simulated.
//
// Expected folder (read-only): CKPOOL_DIR, default /ckpool (Docker: mount your ckpool folder there)
//   /ckpool/ckpool.conf          node RPC credentials, payout address, stratum port
//   /ckpool/logs/pool/pool.status
//   /ckpool/logs/users/*
//   /ckpool/logs/ckpool.log      only scanned for solved blocks

'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

const DIR = process.env.CKPOOL_DIR || '/ckpool';
const CONF = path.join(DIR, 'ckpool.conf');
const LOGS = path.join(DIR, 'logs');
const ONLINE_MS = 10 * 60 * 1000;            // worker counts as online if it sent a share in the last 10 min
const NODE_EVERY_MS = 30 * 1000;
const PRICE_EVERY_MS = 5 * 60 * 1000;

let ctx = null;          // { store, addEvent, markDirty, getConfig, dataDir }
let conf = null;         // parsed ckpool.conf
let last = null;         // latest pool snapshot
let node = { ok: false, error: 'NOT_POLLED' };      // error codes are translated in the browser
let price = null;
let nodeAt = 0, priceAt = 0;
let hist = { pool: [], workers: {}, best: [] };
let bucket = null;
let logPos = -1;
let firstPoll = true;      // no worker events for what is already there when the dashboard starts

// ---------- helpers ----------
const readJson = f => JSON.parse(fs.readFileSync(f, 'utf8'));

// ckpool writes hashrates like "39.6G" (H/s with SI suffix)
function parseRate(s) {
  if (s === undefined || s === null) return 0;
  const m = String(s).trim().match(/^([\d.]+)\s*([KMGTPE]?)/i);
  if (!m) return 0;
  const mult = { '': 1, K: 1e3, M: 1e6, G: 1e9, T: 1e12, P: 1e15, E: 1e18 };
  return parseFloat(m[1]) * (mult[m[2].toUpperCase()] || 1);
}

// legacy P2PKH/P2SH -> CashAddr, so the page shows the address the same way the wallet does
function legacyToCashAddr(addr, prefix = 'bitcoincash') {
  try {
    const A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let n = 0n;
    for (const c of addr) { const i = A.indexOf(c); if (i < 0) return null; n = n * 58n + BigInt(i); }
    const bytes = []; while (n > 0n) { bytes.unshift(Number(n & 255n)); n >>= 8n; }
    for (const c of addr) { if (c === '1') bytes.unshift(0); else break; }
    if (bytes.length !== 25) return null;
    const ver = bytes[0], h160 = bytes.slice(1, 21);
    const type = ver === 0x00 ? 0 : ver === 0x05 ? 8 : null;
    if (type === null) return null;
    const payload8 = [type, ...h160];
    const data5 = []; let acc = 0, bits = 0;
    for (const b of payload8) { acc = (acc << 8) | b; bits += 8; while (bits >= 5) { bits -= 5; data5.push((acc >> bits) & 31); } }
    if (bits) data5.push((acc << (5 - bits)) & 31);
    const GEN = [0x98f2bc8e61n, 0x79b76d99e2n, 0xf33e5fb3c4n, 0xae2eabe2a8n, 0x1e4f43e470n];
    const polymod = v => { let c = 1n; for (const d of v) { const c0 = c >> 35n; c = ((c & 0x07ffffffffn) << 5n) ^ BigInt(d); for (let i = 0; i < 5; i++) if ((c0 >> BigInt(i)) & 1n) c ^= GEN[i]; } return c ^ 1n; };
    const pre = [...prefix].map(ch => ch.charCodeAt(0) & 31);
    const mod = polymod([...pre, 0, ...data5, 0, 0, 0, 0, 0, 0, 0, 0]);
    const chk = []; for (let i = 0; i < 8; i++) chk.push(Number((mod >> BigInt(5 * (7 - i))) & 31n));
    const C = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
    return prefix + ':' + [...data5, ...chk].map(d => C[d]).join('');
  } catch { return null; }
}

function loadConf() {
  try { conf = readJson(CONF); } catch { conf = null; }
}

// ---------- node RPC ----------
async function rpc(method, params = []) {
  const b = conf && Array.isArray(conf.btcd) && conf.btcd[0];
  if (!b) throw new Error('NO_NODE');
  const url = /^https?:\/\//.test(b.url) ? b.url : `http://${b.url}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + Buffer.from(`${b.auth}:${b.pass}`).toString('base64') },
    body: JSON.stringify({ jsonrpc: '1.0', id: 'mc', method, params }),
    signal: AbortSignal.timeout(8000)
  });
  const j = await res.json();
  if (j.error) throw new Error(j.error.message || 'RPC error');
  return j.result;
}

// Which coin the node mines, taken from its version string (getnetworkinfo "subversion"):
// Bitcoin Cash Node / ABC / Flowee / bchd -> BCH, Bitcoin Core ("Satoshi") / Knots -> BTC.
// Wins over the config value, so a BTC ckpool shows BTC price and addresses without any setting.
let detectedCoin = null;
function detectCoin(sub) {
  if (!sub) return null;
  if (/cash|bchn|flowee|bchd|bitcoin abc/i.test(sub)) return 'BCH';
  if (/satoshi|knots/i.test(sub)) return 'BTC';
  return null;
}
function coinNow() {
  const cfg = ctx.getConfig();
  return detectedCoin || (process.env.MC_COIN || '').toUpperCase() || (cfg.pool || {}).coin || 'BCH';
}

async function pollNode() {
  try {
    const bc = await rpc('getblockchaininfo');
    let nethash = null, net = null, peers = null, tpl = null;
    try { nethash = (await rpc('getmininginfo')).networkhashps; } catch {}
    try { net = await rpc('getnetworkinfo'); } catch {}
    try {
      const list = await rpc('getpeerinfo');
      const pings = list.map(p => p.pingtime).filter(v => typeof v === 'number');
      peers = {
        total: list.length,
        inbound: list.filter(p => p.inbound).length,
        ping: pings.length ? pings.reduce((a, b) => a + b, 0) / pings.length * 1000 : null
      };
    } catch {}
    // the template ckpool would mine on right now: subsidy + fees of the transactions in it
    try {
      let t;
      try { t = await rpc('getblocktemplate', []); } catch { t = await rpc('getblocktemplate', [{ rules: ['segwit'] }]); }
      tpl = { height: t.height, coinbase: t.coinbasevalue / 1e8, txs: Array.isArray(t.transactions) ? t.transactions.length : null };
    } catch {}
    node = {
      ok: true, chain: bc.chain, height: bc.blocks, headers: bc.headers,
      difficulty: bc.difficulty, nethash, sync: bc.verificationprogress,
      ibd: !!bc.initialblockdownload, pruned: !!bc.pruned, sizeOnDisk: bc.size_on_disk || null,
      version: net ? net.subversion : null, connections: net ? net.connections : null,
      peers, tpl, error: ''
    };
    const c = detectCoin(node.version);
    if (c && c !== detectedCoin) { detectedCoin = c; refreshPrice(); }   // coin changed: fetch the right price
  } catch (e) {
    node = Object.assign({}, node, { ok: false, error: e.name === 'TimeoutError' ? 'TIMEOUT' : (e.cause && e.cause.code) || e.message });
  }
}

async function pollPrice() {
  const cfg = ctx.getConfig();
  const coin = coinNow();
  const cur = (cfg.cost || {}).currency === 'EUR' ? 'EUR' : 'USD';     // price in the currency chosen in the settings
  try {
    const r = await fetch(`https://api.coinbase.com/v2/prices/${coin}-${cur}/spot`, { signal: AbortSignal.timeout(6000) });
    const j = await r.json();
    const p = parseFloat(j && j.data && j.data.amount);
    if (isFinite(p)) price = { v: p, cur, coin, t: Date.now() };
  } catch {}
}

// ---------- ckpool files ----------
function readPoolStatus() {
  const lines = fs.readFileSync(path.join(LOGS, 'pool', 'pool.status'), 'utf8').trim().split('\n');
  const out = {};
  for (const l of lines) { try { Object.assign(out, JSON.parse(l)); } catch {} }
  return out;
}

function readUsers() {
  const dir = path.join(LOGS, 'users');
  const users = [];
  for (const name of fs.readdirSync(dir)) {
    try {
      const f = path.join(dir, name);
      const written = fs.statSync(f).mtimeMs;       // ckpool rewrites this file once a minute
      const u = readJson(f);
      const workers = (Array.isArray(u.worker) ? u.worker : []).map(w => ({
        name: String(w.workername || name),
        short: String(w.workername || name).includes('.') ? String(w.workername).split('.').pop() : String(w.workername || name),
        h1m: parseRate(w.hashrate1m), h5m: parseRate(w.hashrate5m), h1h: parseRate(w.hashrate1hr), h1d: parseRate(w.hashrate1d),
        lastshare: (w.lastshare || 0) * 1000, shares: w.shares || 0,
        // seconds between the last share and ckpool writing the file; < 60 s means "active in the last update"
        shareAge: w.lastshare ? Math.max(0, written - w.lastshare * 1000) : null,
        best: w.bestshare || 0, bestever: Math.max(w.bestever || 0, w.bestshare || 0)
      }));
      users.push({
        name, h1m: parseRate(u.hashrate1m), h1h: parseRate(u.hashrate1hr), h1d: parseRate(u.hashrate1d), h7d: parseRate(u.hashrate7d),
        lastshare: (u.lastshare || 0) * 1000, shares: u.shares || 0, best: u.bestshare || 0, bestever: Math.max(u.bestever || 0, u.bestshare || 0),
        authorised: (u.authorised || 0) * 1000, workers
      });
    } catch {}
  }
  return users;
}

// scan ckpool.log for solved blocks; the first run reads the whole file once, later only new lines
function scanLog() {
  const f = path.join(LOGS, 'ckpool.log');
  let st; try { st = fs.statSync(f); } catch { return; }
  const track = ctx.store.track.__pool || (ctx.store.track.__pool = { blocks: [], scanned: false });
  if (logPos < 0) logPos = track.scanned ? st.size : 0;      // already scanned before -> start at the end
  if (st.size < logPos) logPos = 0;                           // log was rotated
  if (st.size === logPos) { track.scanned = true; return; }
  const fd = fs.openSync(f, 'r');
  const chunk = Buffer.alloc(1 << 20);
  let rest = '';
  while (logPos < st.size) {
    const n = fs.readSync(fd, chunk, 0, Math.min(chunk.length, st.size - logPos), logPos);
    if (n <= 0) break;
    logPos += n;
    const text = rest + chunk.toString('utf8', 0, n);
    const lines = text.split('\n'); rest = lines.pop();
    for (const l of lines) {
      if (!l.includes('Solved and confirmed block')) continue;
      const m = l.match(/^\[([\d-]+ [\d:.]+)\] Solved and confirmed block (\d+) by (\S+)/);
      if (!m) continue;
      const t = Date.parse(m[1].replace(' ', 'T'));
      if (!track.blocks.find(b => b.height === +m[2])) {
        track.blocks.push({ t, height: +m[2], worker: m[3] });
        if (track.scanned) ctx.addEvent('block', null, 'ev.poolBlock', { height: m[2], worker: m[3] }, 'pool');
        ctx.markDirty();
      }
    }
  }
  fs.closeSync(fd);
  logPos -= Buffer.byteLength(rest);
  if (!track.scanned) { track.scanned = true; ctx.markDirty(); }
}

// ---------- history ----------
function addSample(snap) {
  const minute = Math.floor(Date.now() / 60000) * 60000;
  if (bucket && bucket.minute !== minute) flush();
  bucket = bucket || { minute, n: 0, pool: 0, workers: {} };
  bucket.n++;
  bucket.pool += snap.h1m;
  for (const w of snap.workers) bucket.workers[w.name] = (bucket.workers[w.name] || 0) + w.h1m;
}
function flush() {
  if (!bucket || !bucket.n) { bucket = null; return; }
  hist.pool.push([bucket.minute, Math.round(bucket.pool / bucket.n)]);
  for (const [k, v] of Object.entries(bucket.workers)) (hist.workers[k] || (hist.workers[k] = [])).push([bucket.minute, Math.round(v / bucket.n)]);
  bucket = null;
}
function prune() {
  const cutoff = Date.now() - ctx.getConfig().retentionDays * 86400000;
  const cut = a => { let i = 0; while (i < a.length && a[i][0] < cutoff) i++; if (i) a.splice(0, i); };
  cut(hist.pool); cut(hist.best);
  for (const k of Object.keys(hist.workers)) { cut(hist.workers[k]); if (!hist.workers[k].length) delete hist.workers[k]; }
}
function histFile() { return path.join(ctx.dataDir, 'pool-history.json'); }

// ---------- public ----------
function init(c) {
  ctx = c;
  try { hist = Object.assign({ pool: [], workers: {}, best: [] }, readJson(histFile())); } catch {}
  setInterval(() => {
    const minute = Math.floor(Date.now() / 60000) * 60000;
    if (bucket && bucket.minute !== minute) flush();
    prune();
    try { const tmp = histFile() + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(hist)); fs.renameSync(tmp, histFile()); } catch {}
  }, 60000);
}

// forget the current price so that the next poll fetches it again (e.g. after the currency was changed)
function refreshPrice() { price = null; priceAt = 0; }

function available() { return fs.existsSync(path.join(LOGS, 'pool', 'pool.status')); }

async function poll() {
  if (!available()) { last = null; return; }
  loadConf();
  const now = Date.now();
  if (now - nodeAt > NODE_EVERY_MS) { nodeAt = now; await pollNode(); }
  if (now - priceAt > PRICE_EVERY_MS) { priceAt = now; pollPrice(); }
  try { scanLog(); } catch {}
  let ps = {}, users = [];
  try { ps = readPoolStatus(); } catch {}
  try { users = readUsers(); } catch {}

  const workers = [];
  for (const u of users) for (const w of u.workers) workers.push(Object.assign({ user: u.name, online: now - w.lastshare < ONLINE_MS && w.h5m > 0 }, w));
  const hideDays = Number((ctx.getConfig().pool || {}).hideDays ?? 7);
  if (hideDays > 0) for (let i = workers.length - 1; i >= 0; i--) if (now - workers[i].lastshare > hideDays * 86400000) workers.splice(i, 1);
  workers.sort((a, b) => b.h1h - a.h1h || b.lastshare - a.lastshare);

  const t = ctx.store.track.__pool || (ctx.store.track.__pool = { blocks: [], scanned: false });
  // all-time best share across all users (ckpool's own "bestever")
  const bestever = users.reduce((m, u) => Math.max(m, u.bestever, ...u.workers.map(w => w.bestever)), 0);
  if (t.bestever !== undefined && bestever > t.bestever) {
    const who = users.find(u => Math.max(u.bestever, ...u.workers.map(w => w.bestever)) === bestever);
    hist.best.push([now, bestever]);
    ctx.addEvent('info', null, 'ev.poolBest', { v: fmt(bestever), who: who ? ' (' + shortUser(who.name) + ')' : '' }, 'pool');
  }
  if (t.bestever === undefined || bestever > t.bestever) { t.bestever = bestever; ctx.markDirty(); }

  // worker online / offline events
  t.online = t.online || {};
  for (const w of workers) {
    const was = t.online[w.name];
    if (was === undefined && w.online && !firstPoll) ctx.addEvent('ok', null, 'ev.poolNewWorker', { w: w.short }, 'pool');
    if (was === false && w.online) ctx.addEvent('ok', null, 'ev.poolWorker', { w: w.short }, 'pool');
    if (was === true && !w.online) ctx.addEvent('bad', null, 'ev.poolWorkerIdle', { w: w.short }, 'pool');
    if (was !== w.online) { t.online[w.name] = w.online; ctx.markDirty(); }
  }

  const statusAge = ps.lastupdate ? now - ps.lastupdate * 1000 : null;
  last = {
    running: statusAge !== null && statusAge < 3 * 60 * 1000,
    statusAge,
    runtime: ps.runtime || 0,
    h1m: parseRate(ps.hashrate1m), h5m: parseRate(ps.hashrate5m), h1h: parseRate(ps.hashrate1hr),
    h1d: parseRate(ps.hashrate1d), h7d: parseRate(ps.hashrate7d),
    accepted: ps.accepted || 0, rejected: ps.rejected || 0,
    bestSinceBlock: ps.bestshare || 0, bestever,
    workersOnline: workers.filter(w => w.online).length,
    workers, users: users.map(u => ({ name: u.name, short: shortUser(u.name), h1h: u.h1h, best: u.best, bestever: u.bestever, lastshare: u.lastshare })),
    blocks: t.blocks
  };
  // health of ckpool and the node: a silent failure is the worst kind, so tell when they stop and when they are back.
  // (first poll after a dashboard start only remembers the state and stays silent)
  const nodeOk = !!node.ok;
  if (!firstPoll) {
    if (t.running === true && !last.running) ctx.addEvent('bad', null, 'ev.poolStopped', { min: Math.round((statusAge || 0) / 60000) }, 'pool');
    if (t.running === false && last.running) ctx.addEvent('ok', null, 'ev.poolRunning', {}, 'pool');
    if (t.nodeOk === true && !nodeOk) ctx.addEvent('bad', null, 'ev.nodeDown', { err: node.error || 'NO_RESPONSE' }, 'pool');
    if (t.nodeOk === false && nodeOk) ctx.addEvent('ok', null, 'ev.nodeUp', {}, 'pool');
  }
  if (t.running !== last.running || t.nodeOk !== nodeOk) { t.running = last.running; t.nodeOk = nodeOk; ctx.markDirty(); }
  addSample({ h1m: last.h1m, workers });
  firstPoll = false;
}

function fmt(v) { const u = ['', 'K', 'M', 'G', 'T', 'P', 'E']; let i = 0; while (v >= 1000 && i < 6) { v /= 1000; i++; } return v.toFixed(2) + ' ' + u[i]; }
function shortUser(n) { return n.length > 20 ? n.slice(0, 8) + '…' + n.slice(-6) : n; }

// first private IPv4 of this machine (works because the container runs in host network mode)
function lanIp() {
  for (const list of Object.values(os.networkInterfaces()))
    for (const i of list || []) if (i.family === 'IPv4' && !i.internal && /^(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))/.test(i.address)) return i.address;
  return null;
}

function subsidy(height) {
  // BCH/BTC schedule: 50 coins, halving every 210000 blocks
  const halvings = Math.floor(height / 210000);
  return halvings >= 64 ? 0 : 50 / Math.pow(2, halvings);
}

function state() {
  const cfg = ctx.getConfig();
  if (!available()) return { configured: false, dir: DIR };
  const addr = conf && conf.btcaddress;
  // ckpool binds every "serverurl" entry; ports above 4000 are ckpool's high-difficulty ports
  const urls = conf && Array.isArray(conf.serverurl) ? conf.serverurl : conf && conf.serverurl ? [conf.serverurl] : ['0.0.0.0:3333'];
  const ports = urls.map(u => { const port = +String(u).split(':').pop(); return { port, highdiff: port > 4000 }; }).filter(x => x.port);
  const port = (ports.find(x => !x.highdiff) || ports[0] || { port: 3333 }).port;
  const height = node.ok ? node.height : null;
  const nextSubsidy = height !== null ? subsidy(height + 1) : null;
  const nextReward = node.ok && node.tpl ? node.tpl.coinbase : nextSubsidy;
  const nextFees = node.ok && node.tpl && nextSubsidy !== null ? Math.max(0, node.tpl.coinbase - nextSubsidy) : null;
  // probability math: expected time to find a block at the current pool hashrate
  let expectDays = null, chanceDay = null;
  const rate = last ? (last.h1h < last.h5m * 0.5 ? last.h5m : last.h1h) : 0;
  if (node.ok && node.difficulty && rate > 0) {
    const perSec = rate / (node.difficulty * 4294967296);
    expectDays = 1 / perSec / 86400;
    chanceDay = 1 - Math.exp(-perSec * 86400);
  }
  return {
    configured: true,
    name: (cfg.pool && cfg.pool.name) || 'ckpool',
    coin: coinNow(),
    mode: 'SOLO',
    stratumPort: port,
    ports, highdiff: conf ? conf.highdiff || 1000000 : null, startdiff: conf ? conf.startdiff || 42 : null,
    stratumHost: lanIp(),
    signature: conf ? conf.btcsig || '' : '',
    mindiff: conf ? conf.mindiff : null,
    // CashAddr only makes sense on BCH; on BTC the address is shown as it is in ckpool.conf
    payout: addr || '', payoutCash: addr && coinNow() === 'BCH' ? legacyToCashAddr(addr) : null,
    node, price: price && price.coin === coinNow() ? price : null, nextReward, nextSubsidy, nextFees, expectDays, chanceDay,
    pool: last
  };
}

const RANGES = { '1h': [3600e3, 60e3], '6h': [6 * 3600e3, 120e3], '24h': [86400e3, 300e3], '7d': [7 * 86400e3, 1800e3], '30d': [30 * 86400e3, 7200e3] };
function history(range) {
  const [span, step] = RANGES[range] || RANGES['24h'];
  const now = Date.now(), start = Math.floor((now - span) / step) * step, n = Math.ceil((now - start) / step);
  const agg = arr => {
    const sum = new Array(n).fill(0), cnt = new Array(n).fill(0);
    for (const p of arr || []) { if (p[0] < start) continue; const i = Math.floor((p[0] - start) / step); if (i >= 0 && i < n) { sum[i] += p[1]; cnt[i]++; } }
    return sum.map((s, i) => (cnt[i] ? Math.round(s / cnt[i]) : null));
  };
  const series = { __pool: agg(hist.pool) };
  for (const [k, v] of Object.entries(hist.workers)) series[k] = agg(v);
  let first = series.__pool.findIndex(v => v !== null);
  if (first < 0) first = Math.max(0, n - 1);
  let lastI = n; while (lastI > first + 1 && series.__pool[lastI - 1] === null) lastI--;
  for (const k of Object.keys(series)) series[k] = series[k].slice(first, lastI);
  return { start: start + first * step, step, series, best: hist.best.filter(p => p[0] >= start) };
}

function summary() {
  if (!last) return null;
  return { running: last.running, th: +(last.h1m / 1e12).toFixed(2), workers: last.workersOnline, best: last.bestever, bestText: fmt(last.bestever), blocks: last.blocks.length, height: node.ok ? node.height : null };
}

// used by the UI to show or hide the POOL page
function info() { return { available: available(), dir: DIR }; }

module.exports = { init, poll, refreshPrice, state, info, history, summary, legacyToCashAddr, parseRate };
