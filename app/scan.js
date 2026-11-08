// Network scan for Miner Control: finds AxeOS devices (Bitaxe, LuckyAxe, ...) in the local network.
// Read-only: it only sends GET /api/system/info to every address of a private range, nothing else.
// Only private ranges (10/8, 172.16/12, 192.168/16) and loopback are allowed, at most 1024 addresses
// per scan, and only one scan runs at a time.

'use strict';
const os = require('os');

const PROBE_TIMEOUT_MS = 1500;
const CONCURRENCY = 64;
const MAX_BITS_SPAN = 10;            // /22 = 1024 addresses at most
const MAX_RANGES = 3;
let busy = false;

const ipToInt = ip => ip.split('.').reduce((a, b) => a * 256 + Number(b), 0);
const intToIp = n => [Math.floor(n / 16777216) % 256, Math.floor(n / 65536) % 256, Math.floor(n / 256) % 256, n % 256].join('.');

// private networks and loopback (loopback only makes testing on one machine possible)
function allowed(n) {
  return (n >= ipToInt('10.0.0.0') && n <= ipToInt('10.255.255.255')) ||
    (n >= ipToInt('172.16.0.0') && n <= ipToInt('172.31.255.255')) ||
    (n >= ipToInt('192.168.0.0') && n <= ipToInt('192.168.255.255')) ||
    (n >= ipToInt('127.0.0.0') && n <= ipToInt('127.255.255.255'));
}

function fail(code) { const e = new Error(code); e.code = code; return e; }

// "192.168.178.0/24" -> { base, size }. A plain "192.168.178" is taken as /24.
function parseRange(text) {
  let s = String(text).trim();
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(s)) s += '.0/24';
  const m = s.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/);
  if (!m) throw fail('BAD_RANGE');
  const oct = m.slice(1, 5).map(Number), bits = Number(m[5]);
  if (oct.some(o => o > 255) || bits > 32 || bits < 32 - MAX_BITS_SPAN) throw fail('BAD_RANGE');
  const size = Math.pow(2, 32 - bits);
  const base = Math.floor(ipToInt(oct.join('.')) / size) * size;
  if (!allowed(base) || !allowed(base + size - 1)) throw fail('BAD_RANGE');
  return { base, size, label: `${intToIp(base)}/${bits}` };
}

// the networks this machine is connected to (physical / Wi-Fi interfaces only), as /24
function autoRanges() {
  const skip = /^(lo|docker|br-|veth|virbr|tailscale|ts\d|utun|zt|vEthernet|VMware|VirtualBox|Loopback)/i;
  const out = new Map();
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    if (skip.test(name)) continue;
    for (const i of list || []) {
      if (i.internal || (i.family !== 'IPv4' && i.family !== 4)) continue;
      const n = ipToInt(i.address);
      if (!allowed(n) || n >= ipToInt('127.0.0.0') && n <= ipToInt('127.255.255.255')) continue;
      const r = parseRange(`${i.address.split('.').slice(0, 3).join('.')}.0/24`);
      out.set(r.label, r);
    }
  }
  return [...out.values()].slice(0, MAX_RANGES);
}

async function probe(ip) {
  try {
    const res = await fetch(`http://${ip}/api/system/info`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    if (!res.ok) return null;
    if ((Number(res.headers.get('content-length')) || 0) > 200000) return null;
    const j = JSON.parse(await res.text());
    // AxeOS always reports a numeric hashRate and the ASIC model
    if (!j || typeof j !== 'object' || (typeof j.hashRate !== 'number' && typeof j.ASICModel !== 'string')) return null;
    return {
      ip,
      hostname: String(j.hostname || '').slice(0, 40),
      model: String(j.ASICModel || '').slice(0, 20),
      asicCount: typeof j.asicCount === 'number' ? j.asicCount : null,
      hash: typeof j.hashRate === 'number' ? j.hashRate : null,     // GH/s
      version: String(j.version || '').slice(0, 30)
    };
  } catch { return null; }
}

// 'http://1.2.3.4:80/' -> '1.2.3.4' so that known miners can be recognised
const hostOf = ip => String(ip || '').trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/:80$/, '');

// rangeText: optional, one or more ranges separated by commas; empty = automatic
async function run(rangeText, knownIps = []) {
  if (busy) throw fail('BUSY');
  const t0 = Date.now();
  busy = true;
  try {
    const text = String(rangeText || '').trim();
    const ranges = text ? text.split(',').slice(0, MAX_RANGES).map(parseRange) : autoRanges();
    if (!ranges.length) throw fail('NO_NETWORK');
    const hosts = [];
    for (const r of ranges) {
      const lo = r.size > 2 ? 1 : 0, hi = r.size > 2 ? r.size - 1 : r.size;   // skip network and broadcast address
      for (let k = lo; k < hi; k++) hosts.push(intToIp(r.base + k));
    }
    const found = [];
    let next = 0;
    const worker = async () => {
      while (next < hosts.length) {
        const r = await probe(hosts[next++]);
        if (r) found.push(r);
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, hosts.length) }, worker));
    const known = new Set(knownIps.map(hostOf));
    found.sort((a, b) => ipToInt(a.ip) - ipToInt(b.ip));
    for (const f of found) f.known = known.has(f.ip);
    return { ranges: ranges.map(r => r.label), scanned: hosts.length, found, ms: Date.now() - t0 };
  } finally { busy = false; }
}

module.exports = { run, parseRange, autoRanges, hostOf };
