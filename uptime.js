'use strict';
// Miner Control - uptime / availability per miner.
//
// Every poll reports whether the miner answered. Once a minute the minute is closed with one state:
//   '1' answered and hashing          'z' answered, but hashrate ~0 ("not hashing")
//   'p' answered, mining paused        '0' no answer at all (offline)
//   'r' restarting: up to 2 min after boot without hashrate, and the offline minutes right before the boot
//   '.' unknown - the dashboard itself was not running (never counted as an outage)
// States are kept as one 1440-character string per UTC day, 30 days, in /data/uptime.json.
// Restarts are detected from AxeOS "uptimeSeconds" going down (also across dashboard restarts).

const fs = require('fs');
const path = require('path');

const KEEP_DAYS = 30;
const DAY_MIN = 1440;
const BOOT_GRACE_S = 120;   // a freshly booted miner gets 2 min to start hashing before it counts as an outage
let FILE = null;
let data = {};          // id -> { days: { dayNo: string }, restarts: [ts], lastUp: seconds, lastTs: ms }
const cur = {};         // id -> { minute, ok, zero, paused, fail }  (minute being collected)
let dirty = false;

function init(dataDir) {
  FILE = path.join(dataDir, 'uptime.json');
  try { data = JSON.parse(fs.readFileSync(FILE, 'utf8')) || {}; } catch { data = {}; }
}
function save() {
  if (!FILE || !dirty) return;
  try { fs.writeFileSync(FILE + '.tmp', JSON.stringify(data)); fs.renameSync(FILE + '.tmp', FILE); dirty = false; } catch {}
}
const rec = id => data[id] || (data[id] = { days: {}, restarts: [], lastUp: null, lastTs: 0 });
const minuteOf = t => Math.floor(t / 60000);

// called after every poll; d = normalised miner data or null when the miner did not answer.
// Returns the time of a detected restart (ms) or null.
function poll(id, d, now = Date.now()) {
  const m = minuteOf(now);
  let c = cur[id];
  if (c && c.minute !== m) { close(id); c = null; }
  if (!c) c = cur[id] = { minute: m, ok: 0, zero: 0, paused: 0, boot: 0, fail: 0 };
  if (!d) { c.fail++; return null; }
  if (d.paused) c.paused++;
  // "not hashing": answers but delivers practically nothing (0, or under 5 % of its own target)
  else if (d.hash === null || d.hash <= 0 || (d.expected && d.hash < d.expected * 0.05)) {
    if (typeof d.uptime === 'number' && d.uptime < BOOT_GRACE_S) c.boot++; else c.zero++;
  }
  else c.ok++;

  let restart = null;
  const r = rec(id);
  if (typeof d.uptime === 'number') {
    if (r.lastUp !== null && r.lastTs) {
      // what the uptime should be now if the miner had not restarted (tolerates poll jitter)
      const expectUp = r.lastUp + (now - r.lastTs) / 1000;
      // restart = the running time went backwards, or - after a longer gap (miner unreachable or dashboard
      // off) - it lags far behind the wall clock. A frozen uptime value alone does not count as a restart.
      if (d.uptime + 5 < r.lastUp || (now - r.lastTs > 120000 && d.uptime + 60 < expectUp)) restart = now - d.uptime * 1000;
    }
    r.lastUp = d.uptime; r.lastTs = now;
    if (restart !== null) {
      r.restarts.push(Math.round(restart));
      // the offline minutes just before the boot (shutting down / booting) belong to the restart
      const bootMin = minuteOf(restart);
      for (let k = bootMin - 2; k <= bootMin; k++) if (stateAt(r, k) === '0') setState(r, k, 'r');
    }
    dirty = true;
  }
  return restart;
}

// write the collected minute into the day string
function close(id) {
  const c = cur[id]; if (!c) return;
  delete cur[id];
  const s = c.ok ? '1' : c.paused ? 'p' : c.boot ? 'r' : c.zero ? 'z' : c.fail ? '0' : null;
  if (s) setState(rec(id), c.minute, s);
}
function setState(r, minute, s) {
  const day = Math.floor(minute / DAY_MIN), idx = minute % DAY_MIN;
  const str = r.days[day] || '.'.repeat(DAY_MIN);
  r.days[day] = str.slice(0, idx) + s + str.slice(idx + 1);
  dirty = true;
}

// once a minute: close finished minutes, drop old days and removed miners, save
function tick(ids, now = Date.now()) {
  const m = minuteOf(now);
  for (const id of Object.keys(cur)) if (cur[id].minute !== m) close(id);
  const keep = new Set(ids), minDay = Math.floor(m / DAY_MIN) - KEEP_DAYS, cutoff = now - KEEP_DAYS * 86400000;
  for (const id of Object.keys(data)) {
    if (!keep.has(id)) { delete data[id]; dirty = true; continue; }
    const r = data[id];
    for (const day of Object.keys(r.days)) if (+day < minDay) { delete r.days[day]; dirty = true; }
    const before = r.restarts.length;
    r.restarts = r.restarts.filter(t => t >= cutoff);
    if (r.restarts.length !== before) dirty = true;
  }
  save();
}

// state of one minute (absolute minute number)
function stateAt(r, minute) {
  const s = r.days[Math.floor(minute / DAY_MIN)];
  return s ? s[minute % DAY_MIN] : '.';
}

// availability and outages for the API
function report(miners, now = Date.now()) {
  const nowMin = minuteOf(now) - 1;                      // last finished minute
  for (const id of Object.keys(cur)) if (cur[id].minute <= nowMin) close(id);   // finished but not yet closed by tick()
  const list = [];
  const out = miners.map(m => {
    const r = data[m.id] || { days: {}, restarts: [] };
    const win = { d1: [0, 0], d7: [0, 0], d30: [0, 0] };  // [known (excl. pause), down]
    let first = null, run = null, outages = 0, longest = 0;
    const runs = [];
    for (let i = KEEP_DAYS * DAY_MIN - 1; i >= 0; i--) {
      const min = nowMin - i, s = stateAt(r, min);
      if (s !== '.' && first === null) first = min;
      const age = i;                                     // minutes ago
      if (s === '1' || s === '0' || s === 'z') {
        const down = s !== '1';
        for (const [k, lim] of [['d1', DAY_MIN], ['d7', 7 * DAY_MIN], ['d30', 30 * DAY_MIN]])
          if (age < lim) { win[k][0]++; if (down) win[k][1]++; }
      }
      // outages = consecutive down minutes; an unknown minute ends the run
      if (s === '0' || s === 'z') {
        if (!run) run = { from: min, to: min, off: 0, zero: 0 };
        run.to = min; if (s === '0') run.off++; else run.zero++;
      } else if (run) { runs.push(run); run = null; }
    }
    if (run) { run.ongoing = run.to === nowMin; runs.push(run); }
    for (const x of runs) {
      const len = x.to - x.from + 1;
      outages++; longest = Math.max(longest, len);
      list.push({ id: m.id, name: m.name, type: x.off >= x.zero ? 'off' : 'zero', from: x.from * 60000, to: (x.to + 1) * 60000, min: len, ongoing: !!x.ongoing });
    }
    for (const t of r.restarts) list.push({ id: m.id, name: m.name, type: 'restart', from: t, to: t, min: 0 });
    const pct = ([k, d]) => (k ? Math.floor((k - d) / k * 1000) / 10 : null);   // round down: 99.96 shows 99.9
    return {
      id: m.id, name: m.name,
      d1: pct(win.d1), d7: pct(win.d7), d30: pct(win.d30),
      outages, longest, restarts: r.restarts.length,
      since: first !== null ? first * 60000 : null
    };
  });
  list.sort((a, b) => b.from - a.from);
  return { miners: out, recent: list.slice(0, 20) };
}

// Hour grid for the log viewer: one row per local day (newest first), 24 characters per row.
//   '.' no data   'p' only paused   '1' no outage   'a' up to 10 % down   'b' up to 50 % down   'x' mostly down
// miner = 'all' combines all miners (the worst state of the hour wins).
const RANK = { '.': 0, p: 1, '1': 2, a: 3, b: 4, x: 5 };
function hours(miners, miner, now = Date.now()) {
  const nowMin = minuteOf(now) - 1;
  for (const id of Object.keys(cur)) if (cur[id].minute <= nowMin) close(id);
  const ids = miner === 'all' ? miners.map(m => m.id) : miners.filter(m => m.id === miner).map(m => m.id);
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const days = [];
  for (let i = 0; i < KEEP_DAYS; i++) { const d = new Date(today); d.setDate(d.getDate() - i); days.push(d.getTime()); }
  const grid = days.map(() => new Array(24).fill('.'));
  const restarts = [];
  for (const id of ids) {
    const r = data[id]; if (!r) continue;
    for (const t of r.restarts) restarts.push(t);
    for (let di = 0; di < days.length; di++) {
      for (let h = 0; h < 24; h++) {
        const start = minuteOf(days[di]) + h * 60;   // local hour start (DST days are close enough)
        let known = 0, down = 0, paused = 0;
        for (let k = 0; k < 60; k++) {
          const min = start + k; if (min > nowMin) break;
          const s = stateAt(r, min);
          if (s === '1') known++; else if (s === '0' || s === 'z') { known++; down++; } else if (s === 'p') paused++;
        }
        const c = known ? (down === 0 ? '1' : down <= known * 0.1 ? 'a' : down <= known * 0.5 ? 'b' : 'x') : paused ? 'p' : '.';
        if (RANK[c] > RANK[grid[di][h]]) grid[di][h] = c;
      }
    }
  }
  return { days, rows: grid.map(r => r.join('')), restarts: restarts.filter(t => t >= days[days.length - 1]) };
}

module.exports = { init, poll, tick, report, hours };
