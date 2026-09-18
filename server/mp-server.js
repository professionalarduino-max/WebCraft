#!/usr/bin/env node
// WebCraft multiplayer server — zero dependencies.
// Raw WebSocket implementation over Node's built-in http module.
//
//   node server/mp-server.js [--port 8080] [--seed 12345] [--name "My Server"] [--op Steve]
//
// One port serves BOTH the game files and multiplayer: open http://<host>:PORT
// in a browser to play, the client joins MP on the same host/port over
// WebSocket (/ws). Block edits, chat,
// player positions and the time of day are relayed; block deltas persist
// to server/db.json so the shared world survives restarts.

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const arg = (k, dflt) => {
  const i = args.indexOf(k);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : dflt;
};
const PORT = parseInt(arg('--port', '8080'), 10) || 8080;
const SEED_ARG = args.includes('--seed') ? (parseInt(arg('--seed', '0'), 10) | 0) : null;
let SEED = SEED_ARG; // resolved after db load: arg > persisted > random
const SERVER_NAME = arg('--name', 'WebCraft Server');
const DAY_LEN = 300; // must match client's DAY_LEN
const DB_PATH = path.join(__dirname, 'db.json');
const MAX_DELTAS = 20000;
const MAX_MSG = 64 * 1024;

// ---------------------------------------------------------------------------
// State

const players = new Map(); // id -> player record
let nextId = 1;
const deltas = new Map();  // "dim:x,y,z" -> {dim,x,y,z,id}
const ops = new Set();     // operator names (lowercase)
let timeOfDay = 0.28;
let weather = 'clear'; // 'clear' | 'rain'

try {
  const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  for (const d of db.deltas || []) deltas.set(`${d.dim}:${d.x},${d.y},${d.z}`, d);
  for (const n of db.ops || []) ops.add(String(n).toLowerCase());
  if (SEED === null && Number.isInteger(db.seed)) SEED = db.seed | 0;
  if (typeof db.time === 'number') timeOfDay = ((db.time % 1) + 1) % 1;
  if (db.weather === 'rain' || db.weather === 'clear') weather = db.weather;
  console.log(`[mp] loaded ${deltas.size} block deltas, ${ops.size} ops from db.json`);
} catch (e) { /* first run */ }
for (const n of String(arg('--op', '')).split(',').map(s => s.trim().toLowerCase()).filter(Boolean)) {
  if (!ops.has(n)) { ops.add(n); dirty = true; console.log(`[mp] op granted: ${n}`); }
}
if (SEED === null) SEED = (Math.random() * 0xffffffff) | 0;

let dirty = false;
function saveDb() {
  if (!dirty) return;
  dirty = false;
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify({ deltas: [...deltas.values()], ops: [...ops], time: timeOfDay, weather, seed: SEED }));
  } catch (e) { console.log('[mp] db write failed:', e.message); }
}
setInterval(saveDb, 10000); // frequent autosave: builds survive even a hard kill
const shutdown = () => { dirty = true; saveDb(); process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// ---------------------------------------------------------------------------
// Minimal WebSocket framing (single-frame text messages + ping/pong)

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function sendText(sock, str) {
  const b = Buffer.from(str, 'utf8');
  const n = b.length;
  let head;
  if (n < 126) head = Buffer.from([0x81, n]);
  else if (n < 65536) head = Buffer.alloc(4), head[0] = 0x81, head[1] = 126, head.writeUInt16BE(n, 2);
  else return; // never happens: our messages are small except welcome-deltas
  try { sock.write(Buffer.concat([head, b])); } catch (e) {}
}

// welcome can exceed 64KB with many deltas — chunk it into several messages
function sendBig(sock, str) {
  const CH = 60000;
  if (str.length <= CH) { sendText(sock, str); return; }
  // split JSON array payloads: caller passes {head, items, tail} instead
  sendText(sock, str); // fallback (sendText drops >64KB safely)
}

function sendPing(sock) {
  try { sock.write(Buffer.from([0x89, 0x00])); } catch (e) {}
}

// Incremental frame parser for one socket. Calls onMsg(str) per text message.
function attachParser(sock, onMsg, onClose) {
  let buf = Buffer.alloc(0);
  let dead = false;
  sock.on('data', (chunk) => {
    if (dead) return;
    buf = Buffer.concat([buf, chunk]);
    if (buf.length > MAX_MSG + 16) { dead = true; try { sock.destroy(); } catch (e) {} return; }
    for (;;) {
      if (buf.length < 2) return;
      const fin = (buf[0] & 0x80) !== 0, op = buf[0] & 0x0f;
      const masked = (buf[1] & 0x80) !== 0;
      let len = buf[1] & 0x7f, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { dead = true; try { sock.destroy(); } catch (e) {} return; } // absurd size
      const mask = masked ? buf.slice(off, off + 4) : null;
      if (masked) off += 4;
      if (buf.length < off + len) return;
      let payload = buf.slice(off, off + len);
      buf = buf.slice(off + len);
      if (masked) {
        const u = Buffer.from(payload);
        for (let i = 0; i < u.length; i++) u[i] ^= mask[i % 4];
        payload = u;
      }
      if (op === 0x8) { dead = true; try { sock.end(); } catch (e) {} onClose(); return; }
      if (op === 0x9) { try { sock.write(Buffer.from([0x8a, 0x00])); } catch (e) {} continue; } // ping -> pong
      if (op === 0xa) continue; // pong
      if ((op === 0x1 || op === 0x2) && fin) { onMsg(payload.toString('utf8')); continue; }
      // continuation fragments: unsupported, drop the connection
      dead = true; try { sock.destroy(); } catch (e) {} onClose(); return;
    }
  });
  sock.on('close', () => { if (!dead) { dead = true; onClose(); } });
  sock.on('error', () => { if (!dead) { dead = true; onClose(); } });
}

// ---------------------------------------------------------------------------
// Validation helpers

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const clampNum = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const cleanName = (v) => String(v || '').replace(/[^A-Za-z0-9_]/g, '').slice(0, 16);
const cleanText = (v) => String(v ?? '').slice(0, 256);
const cleanDim = (v) => (v === 'nether' || v === 'end' ? v : 'overworld');

function uniqueName(want) {
  want = cleanName(want) || 'Steve';
  const taken = new Set([...players.values()].map(p => p.name.toLowerCase()));
  if (!taken.has(want.toLowerCase())) return want;
  for (let i = 2; i < 100; i++) {
    if (!taken.has((want + i).toLowerCase())) return want + i;
  }
  return want + '_' + ((Math.random() * 999) | 0);
}

// sliding-window rate limit: max `n` events per `ms`
function limited(p, key, n, ms) {
  const now = Date.now();
  p.rl[key] = (p.rl[key] || []).filter(t => now - t < ms);
  if (p.rl[key].length >= n) return true;
  p.rl[key].push(now);
  return false;
}

function cleanTag(tag) { // shulker-box contents: strict shape, 27 slots max
  if (!tag || typeof tag !== 'object' || !Array.isArray(tag.slots) || tag.slots.length > 27) return undefined;
  const slots = [];
  for (const s of tag.slots) {
    if (s == null) { slots.push(null); continue; }
    if (!Array.isArray(s) || !Number.isInteger(s[0]) || s[0] < 0 || s[0] > 500) return undefined;
    if (!Number.isInteger(s[1]) || s[1] < 1 || s[1] > 64) return undefined;
    slots.push(Number.isInteger(s[2]) && s[2] >= 0 ? [s[0], s[1], s[2]] : [s[0], s[1]]);
  }
  return { slots };
}

function broadcast(msg, exceptId = -1) {
  const s = JSON.stringify(msg);
  for (const p of players.values()) {
    if (p.id === exceptId) continue;
    sendText(p.sock, s);
  }
}

function sysTo(p, text) { sendText(p.sock, JSON.stringify({ t: 'sys', text })); }

// ---------------------------------------------------------------------------
// Message handling

function onMessage(p, raw) {
  let m;
  try { m = JSON.parse(raw); } catch (e) { return; }
  if (!m || typeof m.t !== 'string') return;
  p.lastSeen = Date.now();

  switch (m.t) {
    case 'hello': {
      if (p.hello) return;
      p.hello = true;
      p.name = uniqueName(m.name);
      if (Array.isArray(m.p) && m.p.length >= 3 && m.p.every(isNum)) {
        p.pos = [clampNum(m.p[0], -3e7, 3e7), clampNum(m.p[1], -64, 512), clampNum(m.p[2], -3e7, 3e7)];
      }
      p.yaw = isNum(m.yaw) ? m.yaw : 0;
      p.dim = cleanDim(m.dim);
      if (Array.isArray(m.armor)) p.armor = m.armor.slice(0, 4).map(a => (typeof a === 'string' ? a.slice(0, 16) : null));
      // first player on an empty server becomes operator
      if (players.size === 1 && ops.size === 0) {
        ops.add(p.name.toLowerCase());
        dirty = true;
      }
      p.op = ops.has(p.name.toLowerCase());
      const others = [...players.values()].filter(q => q.id !== p.id)
        .map(q => ({ id: q.id, name: q.name, p: q.pos, yaw: q.yaw, pitch: q.pitch, armor: q.armor, dim: q.dim, held: q.held || 0, swim: 0 }));
      // welcome may be huge (deltas) — send it in chunks
      sendText(p.sock, JSON.stringify({
        t: 'welcome', you: p.id, name: p.name, seed: SEED, time: timeOfDay, weather,
        server: SERVER_NAME, players: others, op: p.op, ops: [...players.values()].filter(q => q.op).map(q => q.id),
      }));
      const all = [...deltas.values()];
      for (let i = 0; i < all.length; i += 800) {
        sendText(p.sock, JSON.stringify({ t: 'sets', list: all.slice(i, i + 800) }));
      }
      sendText(p.sock, JSON.stringify({ t: 'synced' }));
      broadcast({ t: 'join', id: p.id, name: p.name, p: p.pos, yaw: p.yaw, pitch: p.pitch, armor: p.armor, dim: p.dim, held: 0, swim: 0 }, p.id);
      broadcast({ t: 'sys', text: `${p.name} joined the game` });
      console.log(`[mp] ${p.name} joined (${players.size} online)`);
      break;
    }
    case 'pos': {
      if (!p.hello || limited(p, 'pos', 60, 1000)) return;
      if (!Array.isArray(m.p) || m.p.length < 3 || !m.p.every(isNum)) return;
      const np = [clampNum(m.p[0], -3e7, 3e7), clampNum(m.p[1], -64, 512), clampNum(m.p[2], -3e7, 3e7)];
      if (!m.jump) { // reject teleport-hacks (legit /tp sends jump:1)
        const dx = Math.abs(np[0] - p.pos[0]), dy = Math.abs(np[1] - p.pos[1]), dz = Math.abs(np[2] - p.pos[2]);
        if (dx > 60 || dy > 60 || dz > 60) return;
      }
      p.pos = np;
      p.yaw = isNum(m.yaw) ? m.yaw : p.yaw;
      p.pitch = isNum(m.pitch) ? m.pitch : p.pitch;
      p.dim = cleanDim(m.dim);
      if (Array.isArray(m.armor)) p.armor = m.armor.slice(0, 4).map(a => (typeof a === 'string' ? a.slice(0, 16) : null));
      if (Number.isInteger(m.held) && m.held >= 0 && m.held <= 500) p.held = m.held;
      broadcast({ t: 'pos', id: p.id, p: p.pos, yaw: p.yaw, pitch: p.pitch, armor: p.armor, dim: p.dim, sneak: m.sneak ? 1 : 0, held: p.held, swim: m.swim ? 1 : 0 }, p.id);
      break;
    }
    case 'chat': {
      if (!p.hello || limited(p, 'chat', 4, 2000)) return;
      const text = cleanText(m.text);
      if (!text) return;
      broadcast({ t: 'chat', from: p.name, text });
      console.log(`[chat] <${p.name}> ${text}`);
      break;
    }
    case 'tell': {
      if (!p.hello || limited(p, 'chat', 4, 2000)) return;
      const to = [...players.values()].find(q => q.name.toLowerCase() === String(m.to || '').toLowerCase());
      const text = cleanText(m.text);
      if (!to) { sysTo(p, `Player "${m.to}" is not online`); return; }
      if (!text) return;
      sendText(to.sock, JSON.stringify({ t: 'tell', from: p.name, text }));
      sysTo(p, `[you → ${to.name}] ${text}`);
      break;
    }
    case 'set': case 'sets': {
      if (!p.hello || limited(p, 'sets', 3000, 1000)) return;
      const list = m.t === 'set' ? [m] : (Array.isArray(m.list) ? m.list.slice(0, 600) : []);
      const clean = [];
      for (const s of list) {
        if (!s || !Number.isInteger(s.x) || !Number.isInteger(s.y) || !Number.isInteger(s.z) || !Number.isInteger(s.id)) continue;
        if (Math.abs(s.x) > 3e7 || Math.abs(s.z) > 3e7 || s.y < 0 || s.y > 255 || s.id < 0 || s.id > 500) continue;
        const dim = cleanDim(s.dim);
        const e = { dim, x: s.x, y: s.y, z: s.z, id: s.id };
        if (Number.isInteger(s.f) && s.f >= 0 && s.f <= 5) e.f = s.f; // machine facing sync
        deltas.set(`${dim}:${s.x},${s.y},${s.z}`, e);
        if (deltas.size > MAX_DELTAS) deltas.delete(deltas.keys().next().value); // FIFO
        clean.push(e);
      }
      if (clean.length) { dirty = true; broadcast({ t: 'sets', list: clean }, p.id); }
      break;
    }
    case 'settime': {
      if (!p.hello) return;
      const v = Number(m.v);
      if (!Number.isFinite(v)) return;
      timeOfDay = ((v % 1) + 1) % 1;
      dirty = true;
      broadcast({ t: 'time', time: timeOfDay });
      broadcast({ t: 'sys', text: `${p.name} set the time` });
      break;
    }
    case 'kick': {
      if (!p.hello) return;
      if (!p.op) { sysTo(p, 'You must be an operator to kick players'); return; }
      const tgt = [...players.values()].find(q => q.name.toLowerCase() === String(m.target || '').toLowerCase());
      if (!tgt) { sysTo(p, `Player "${m.target}" is not online`); return; }
      if (tgt.id === p.id) { sysTo(p, 'You cannot kick yourself'); return; }
      sendText(tgt.sock, JSON.stringify({ t: 'kick', reason: cleanText(m.reason) || 'Kicked by an operator' }));
      setTimeout(() => { try { tgt.sock.destroy(); } catch (e) {} }, 300);
      broadcast({ t: 'sys', text: `${tgt.name} was kicked by ${p.name}` });
      console.log(`[mp] ${tgt.name} kicked by ${p.name}`);
      break;
    }
    case 'op': {
      if (!p.hello) return;
      if (!p.op) { sysTo(p, 'You must be an operator to grant op'); return; }
      const tgt = [...players.values()].find(q => q.name.toLowerCase() === String(m.target || '').toLowerCase());
      if (!tgt) { sysTo(p, `Player "${m.target}" is not online`); return; }
      tgt.op = true;
      ops.add(tgt.name.toLowerCase());
      dirty = true;
      broadcast({ t: 'ops', ops: [...players.values()].filter(q => q.op).map(q => q.id) });
      broadcast({ t: 'sys', text: `${tgt.name} is now an operator` });
      break;
    }
    case 'act': { // arm swing / action animation
      if (!p.hello || limited(p, 'act', 12, 1000)) return;
      broadcast({ t: 'act', id: p.id, act: String(m.act || 'swing').slice(0, 12) }, p.id);
      break;
    }
    case 'died': {
      if (!p.hello || limited(p, 'chat', 4, 2000)) return;
      broadcast({ t: 'sys', text: cleanText(m.text) || `${p.name} died` });
      break;
    }
    case 'weather': {
      if (!p.hello || limited(p, 'chat', 2, 2000)) return;
      if (m.mode !== 'rain' && m.mode !== 'clear') return;
      weather = m.mode;
      dirty = true;
      broadcast({ t: 'weather', mode: weather });
      broadcast({ t: 'sys', text: `${p.name} changed the weather` });
      break;
    }
    case 'drop': { // Q-thrown item: relay to everyone else
      if (!p.hello || limited(p, 'drop', 30, 1000)) return;
      const nid = String(m.nid || '').slice(0, 32);
      if (!nid || !Number.isInteger(m.id) || m.id < 0 || m.id > 500) return;
      if (!Number.isInteger(m.n) || m.n < 1 || m.n > 64) return;
      if (![m.x, m.y, m.z, m.vx, m.vy, m.vz].every(isNum)) return;
      if (Math.abs(m.x) > 3e7 || Math.abs(m.z) > 3e7 || m.y < -64 || m.y > 512) return;
      broadcast({ t: 'drop', from: p.id, nid, id: m.id, n: m.n,
        x: m.x, y: m.y, z: m.z, vx: m.vx, vy: m.vy, vz: m.vz, dmg: Number.isInteger(m.dmg) ? m.dmg : 0, tag: cleanTag(m.tag) }, p.id);
      break;
    }
    case 'gone': { // someone picked the drop up: remove it everywhere
      if (!p.hello || limited(p, 'drop', 30, 1000)) return;
      const nid = String(m.nid || '').slice(0, 32);
      if (!nid) return;
      broadcast({ t: 'gone', nid }, p.id);
      break;
    }
    case 'bye':
      try { p.sock.end(); } catch (e) {}
      break;
  }
}

function onDisconnect(p) {
  if (!players.has(p.id)) return;
  players.delete(p.id);
  if (p.hello) {
    broadcast({ t: 'leave', id: p.id });
    broadcast({ t: 'sys', text: `${p.name} left the game` });
    console.log(`[mp] ${p.name} left (${players.size} online)`);
    saveDb(); // someone leaving flushes the world to disk
  }
}

// ---------------------------------------------------------------------------
// HTTP + upgrade

// ---------------------------------------------------------------------------
// HTTP: the game itself + /status (same port as multiplayer)

const ROOT = path.join(__dirname, '..');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};

function serveStatic(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
  let urlPath;
  try { urlPath = decodeURIComponent(req.url.split('?')[0]); } catch (e) { res.writeHead(400); res.end(); return; }
  if (urlPath === '/') urlPath = '/index.html';
  if (urlPath.startsWith('/server/') || urlPath === '/server') { res.writeHead(404); res.end('not found'); return; }
  const file = path.normalize(path.join(ROOT, urlPath));
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403); res.end('forbidden'); return; }
  const type = MIME[path.extname(file).toLowerCase()];
  if (!type) { res.writeHead(404); res.end('not found'); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    const headers = { 'Content-Type': type };
    if (file.endsWith('.html')) headers['Cache-Control'] = 'no-store';
    res.writeHead(200, headers);
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  if (req.url.split('?')[0] === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      name: SERVER_NAME, game: 'webcraft', seed: SEED >>> 0,
      online: players.size, players: [...players.values()].map(p => p.name),
    }));
    return;
  }
  serveStatic(req, res);
});

server.on('upgrade', (req, sock) => {
  const key = req.headers['sec-websocket-key'];
  if (!key) { sock.destroy(); return; }
  const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
  sock.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\nConnection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
  );
  const p = {
    id: nextId++, sock, name: '', hello: false,
    pos: [0, 80, 0], yaw: 0, pitch: 0, armor: [null, null, null, null], dim: 'overworld', held: 0,
    op: false, rl: {}, lastSeen: Date.now(),
  };
  players.set(p.id, p);
  attachParser(sock, (msg) => onMessage(p, msg), () => onDisconnect(p));
});

// world clock + heartbeat
let lastTick = Date.now();
setInterval(() => {
  const now = Date.now();
  timeOfDay = (timeOfDay + (now - lastTick) / 1000 / DAY_LEN) % 1;
  lastTick = now;
  broadcast({ t: 'time', time: timeOfDay });
  dirty = true;
  for (const p of [...players.values()]) {
    if (now - p.lastSeen > 90000) { try { p.sock.destroy(); } catch (e) {} continue; }
    sendPing(p.sock);
  }
}, 5000);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[mp] ${SERVER_NAME} listening on port ${PORT}, seed ${SEED >>> 0}`);
  console.log('[mp] open http://<host>:' + PORT + ' to play — MP joins on the same port (/ws)');
});
