// Web Push for Miner Control (no external dependencies).
// Implements VAPID (RFC 8292) and aes128gcm payload encryption (RFC 8291 / RFC 8188)
// with Node's built-in crypto. Subscriptions and keys are kept in /data/push.json.

'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let file = null;
let state = { publicKey: null, privateJwk: null, subs: [] };
const lastSent = new Map();          // cooldown per message key

const b64u = buf => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');

function save() {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state));
  fs.renameSync(tmp, file);
}

function init(dataDir) {
  file = path.join(dataDir, 'push.json');
  try { state = Object.assign(state, JSON.parse(fs.readFileSync(file, 'utf8'))); } catch {}
  if (!state.publicKey || !state.privateJwk) {
    // VAPID key pair, created once and kept so existing subscriptions stay valid
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const jwk = publicKey.export({ format: 'jwk' });
    state.publicKey = b64u(Buffer.concat([Buffer.from([4]), unb64u(jwk.x), unb64u(jwk.y)]));
    state.privateJwk = privateKey.export({ format: 'jwk' });
    save();
  }
  if (!Array.isArray(state.subs)) state.subs = [];
}

function publicKey() { return state.publicKey; }
function count() { return state.subs.length; }

function subscribe(sub, label) {
  if (!sub || typeof sub.endpoint !== 'string' || !/^https:\/\//.test(sub.endpoint) || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) return false;
  state.subs = state.subs.filter(s => s.endpoint !== sub.endpoint);
  state.subs.push({ endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth }, label: String(label || '').slice(0, 60), added: Date.now() });
  save();
  return true;
}
function unsubscribe(endpoint) {
  const n = state.subs.length;
  state.subs = state.subs.filter(s => s.endpoint !== endpoint);
  if (state.subs.length !== n) save();
  return n !== state.subs.length;
}
function has(endpoint) { return state.subs.some(s => s.endpoint === endpoint); }

// ---------- RFC 8291 payload encryption ----------
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();

function encrypt(payload, p256dh, authSecret, opts = {}) {
  const uaPublic = unb64u(p256dh), auth = unb64u(authSecret);
  const ecdh = crypto.createECDH('prime256v1');
  if (opts.asPrivate) ecdh.setPrivateKey(unb64u(opts.asPrivate)); else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(uaPublic);
  const salt = opts.salt ? unb64u(opts.salt) : crypto.randomBytes(16);

  const prkKey = hmac(auth, shared);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic, Buffer.from([1])]);
  const ikm = hmac(prkKey, keyInfo);
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: aes128gcm\0'), Buffer.from([1])])).subarray(0, 16);
  const nonce = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: nonce\0'), Buffer.from([1])])).subarray(0, 12);

  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, body]);
}

// ---------- RFC 8292 VAPID ----------
function vapidHeader(endpoint) {
  const aud = new URL(endpoint).origin;
  const header = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const claims = b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: 'mailto:miner-control@localhost.invalid' }));
  const key = crypto.createPrivateKey({ key: state.privateJwk, format: 'jwk' });
  const sig = crypto.sign('sha256', Buffer.from(`${header}.${claims}`), { key, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${header}.${claims}.${b64u(sig)}, k=${state.publicKey}`;
}

async function sendOne(sub, payload, urgency) {
  const body = encrypt(payload, sub.keys.p256dh, sub.keys.auth);
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      TTL: '86400',
      Urgency: urgency,
      Authorization: vapidHeader(sub.endpoint)
    },
    body,
    signal: AbortSignal.timeout(10000)
  });
  return res.status;
}

// title/body: text shown; opts.key: cooldown key; opts.cooldownMin; opts.urgent
async function send(title, body, opts = {}) {
  if (!state.subs.length) return { sent: 0, failed: 0 };
  const key = opts.key || title + body;
  const cd = (opts.cooldownMin ?? 15) * 60000;
  if (cd > 0 && lastSent.has(key) && Date.now() - lastSent.get(key) < cd) return { sent: 0, failed: 0, skipped: true };
  lastSent.set(key, Date.now());
  const payload = JSON.stringify({ title, body, tag: opts.tag || key, urgent: !!opts.urgent, t: Date.now() });
  let sent = 0, failed = 0, removed = false;
  for (const sub of [...state.subs]) {
    try {
      const st = await sendOne(sub, payload, opts.urgent ? 'high' : 'normal');
      if (st === 404 || st === 410) { state.subs = state.subs.filter(s => s !== sub); removed = true; failed++; }
      else if (st >= 200 && st < 300) sent++;
      else { failed++; console.log('push: endpoint answered', st); }
    } catch (e) { failed++; console.log('push:', e.message); }
  }
  if (removed) save();
  return { sent, failed };
}

module.exports = { init, publicKey, count, subscribe, unsubscribe, has, send, encrypt, vapidHeader, _b64u: b64u, _unb64u: unb64u };
