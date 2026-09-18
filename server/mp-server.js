#!/usr/bin/env node
// WebCraft multiplayer server — zero dependencies.
// Raw WebSocket implementation over Node's built-in http module.
//
//   node server/mp-server.js [--port 8080] [--seed 12345] [--name "My Server"] [--op Steve]
//
// One port serves BOTH the game files and multiplayer: open http://<host>:PORT
// in a browser to play, the client joins MP on the same host/port over
// WebSocket (/ws). Block edits, chat, player positions and the time of day are
// relayed; block deltas persist to server/db.json so the shared world survives
// restarts.
//
// Protocol notes (client: js/net.js):
//   client -> server: hello, pos, chat, me, tell, set(s)[batch], settime, act,
//                     died, weather, drop, gone, kick, op, who, ping, bye
//   server -> client: welcome, synced, join, leave, pos, players, chat, me,
//                     tell, sys, set(s), ack, time, act, weather, ops, pong,
//                     kick, drop, gone
//   * pos.tp marks a legit teleport (respawn / portal / pearl / /tp) so the
//     "moved too fast" guard never freezes a player at a stale spot
//   * every sets batch carries an id and is acknowledged with ack, so the
//     client can resend batches that were lost when the socket blipped

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
// --db lets you keep several worlds side by side (tests use a scratch file)
const DB_PATH = path.resolve(arg('--db', path.join(__dirname, 'db.json')));
const MAX_DELTAS = Math.max(1000, parseInt(arg('--max-deltas', '20000'), 10) || 20000);
const MAX_MSG = 1024 * 1024;
const MAX_BATCH = 2000;      // blocks per sets message
const IDLE_TIMEOUT = 120000; // no frames at all for 2 min -> drop
const ROSTER_EVERY = 2000;   // players roster broadcast interval

let dirty = false; // (declared before any use — see the --op loop below)

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
  console.log(`[mp] loaded ${deltas.size} block deltas, ${ops.size} ops from ${path.basename(DB_PATH)}`);
} catch (e) { /* first run */ }
for (const n of String(arg('--op', '')).split(',').map(s => s.trim()).filter(Boolean)) {
  const key = n.toLowerCase();
  if (!ops.has(key)) { ops.add(key); dirty = true; console.log(`[mp] op granted: ${n}`); }
}
if (SEED === null) SEED = (Math.random() * 0xffffffff) | 0;

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
// Minimal WebSocket framing (text messages, fragmentation, ping/pong)

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function frame(opcode, payload) {
  const b = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, 'utf8');
  const n = b.length;
  let head;
  if (n < 126) {
    head = Buffer.alloc(2); head[1] = n;
  } else if (n < 65536) {
    head = Buffer.alloc(4); head[1] = 126; head.writeUInt16BE(n, 2);
  } else {
    head = Buffer.alloc(10); head[1] = 127; head.writeBigUInt64BE(BigInt(n), 2);
  }
  head[0] = 0x80 | opcode;
  return Buffer.concat([head, b]);
}

function sendText(sock, str) {
  try { sock.write(frame(0x1, str)); } catch (e) {}
}

// ws-level ping with a 4-byte id so we can measure the round trip
let pingSeq = 0;
function sendPing(sock, p) {
  const id = (++pingSeq) >>> 0;
  const b = Buffer.alloc(4);
  b.writeUInt32BE(id, 0);
  p.pingSentId = id;
  p.pingSentAt = Date.now();
  try { sock.write(frame(0x9, b)); } catch (e) {}
}

// Incremental frame parser for one socket. Calls onMsg(str) per text message,
// onPong(payload) for control pongs and onClose() once when the socket dies.
function attachParser(sock, onMsg, onClose, onPong) {
  let buf = Buffer.alloc(0);
  let dead = false;
  let frag = null;       // Buffer while a fragmented message is being assembled
  sock.on('data', (chunk) => {
    if (dead) return;
    buf = Buffer.concat([buf, chunk]);
    if (buf.length > MAX_MSG + 32) { dead = true; try { sock.destroy(); } catch (e) {} return; }
    for (;;) {
      if (buf.length < 2) return;
      const fin = (buf[0] & 0x80) !== 0, op = buf[0] & 0x0f;
      const masked = (buf[1] & 0x80) !== 0;
      let len = buf[1] & 0x7f, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) {
        if (buf.length < 10) return;
        const big = buf.readBigUInt64BE(2);
        if (big > BigInt(MAX_MSG)) { dead = true; try { sock.destroy(); } catch (e) {} return; }
        len = Number(big); off = 10;
      }
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
      if (op === 0x8) { // close
        dead = true; try { sock.end(frame(0x8, Buffer.alloc(0))); } catch (e) {}
        onClose(); return;
      }
      if (op === 0x9) { try { sock.write(frame(0xa, payload)); } catch (e) {} continue; } // ping -> pong
      if (op === 0xa) { if (onPong) onPong(payload); continue; }
      if (op === 0x1 || op === 0x2) {
        if (fin) { onMsg(payload.toString('utf8')); continue; }
        frag = Buffer.from(payload); continue; // start of a fragmented message
      }
      if (op === 0x0) { // continuation
        if (!frag) { dead = true; try { sock.destroy(); } catch (e) {} onClose(); return; }
        frag = Buffer.concat([frag, payload]);
        if (frag.length > MAX_MSG) { dead = true; try { sock.destroy(); } catch (e) {} onClose(); return; }
        if (fin) { const s = frag.toString('utf8'); frag = null; onMsg(s); }
        continue;
      }
      // unknown opcode: drop the connection (protocol error)
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
// player names may be Cyrillic/Greek/CJK too — keep letters, digits, _ - and space
const cleanName = (v) => {
  let s = String(v ?? '').replace(/[^\p{L}\p{N}_\- ]/gu, '').replace(/\s+/g, ' ').trim();
  const cp = [...s];
  if (cp.length > 16) s = cp.slice(0, 16).join('');
  return s;
};
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

function roster() {
  return [...players.values()].map(q => ({
    id: q.id, name: q.name, dim: q.dim, op: !!q.op,
    ping: q.ping || 0, hp: q.hp == null ? 20 : q.hp,
  }));
}
const broadcastRoster = () => broadcast({ t: 'players', list: roster() });

function sendRosterTo(p) { sendText(p.sock, JSON.stringify({ t: 'players', list: roster() })); }

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
      // same client id (or same nickname) already online -> that session is stale
      const cid = typeof m.cid === 'string' ? m.cid.slice(0, 24) : '';
      if (cid) {
        for (const q of [...players.values()]) {
          if (q.id !== p.id && q.cid && q.cid === cid) dropPlayer(q, 'You logged in from another location');
        }
      }
      p.hello = true;
      p.cid = cid;
      const wanted = cleanName(m.name) || 'Steve';
      const clash = [...players.values()].find(q => q.id !== p.id && q.name.toLowerCase() === wanted.toLowerCase());
      if (clash) dropPlayer(clash, 'You logged in from another location');
      p.name = uniqueName(m.name);
      if (Array.isArray(m.p) && m.p.length >= 3 && m.p.every(isNum)) {
        p.pos = [clampNum(m.p[0], -3e7, 3e7), clampNum(m.p[1], -64, 512), clampNum(m.p[2], -3e7, 3e7)];
      }
      p.yaw = isNum(m.yaw) ? m.yaw : 0;
      p.pitch = isNum(m.pitch) ? m.pitch : 0;
      p.dim = cleanDim(m.dim);
      if (Array.isArray(m.armor)) p.armor = m.armor.slice(0, 4).map(a => (typeof a === 'string' ? a.slice(0, 16) : null));
      if (isNum(m.hp)) p.hp = clampNum(Math.round(m.hp), 0, 20);
      // first player on an empty server becomes operator
      if (players.size === 1 && ops.size === 0) {
        ops.add(p.name.toLowerCase());
        dirty = true;
      }
      p.op = ops.has(p.name.toLowerCase());
      const others = [...players.values()].filter(q => q.id !== p.id)
        .map(q => ({
          id: q.id, name: q.name, p: q.pos, yaw: q.yaw, pitch: q.pitch,
          armor: q.armor, dim: q.dim, held: q.held || 0, swim: 0,
          hp: q.hp == null ? 20 : q.hp,
        }));
      sendText(p.sock, JSON.stringify({
        t: 'welcome', you: p.id, name: p.name, seed: SEED, time: timeOfDay, weather,
        server: SERVER_NAME, players: others, op: p.op,
        ops: [...players.values()].filter(q => q.op).map(q => q.id),
      }));
      const all = [...deltas.values()];
      for (let i = 0; i < all.length; i += 800) {
        sendText(p.sock, JSON.stringify({ t: 'sets', list: all.slice(i, i + 800) }));
      }
      sendText(p.sock, JSON.stringify({ t: 'synced' }));
      broadcast({ t: 'join', id: p.id, name: p.name, p: p.pos, yaw: p.yaw, pitch: p.pitch, armor: p.armor, dim: p.dim, held: 0, swim: 0, hp: p.hp }, p.id);
      broadcast({ t: 'sys', text: `${p.name} joined the game` });
      broadcastRoster();
      console.log(`[mp] ${p.name} joined (${players.size} online)`);
      break;
    }
    case 'pos': {
      if (!p.hello || limited(p, 'pos', 80, 1000)) return;
      if (!Array.isArray(m.p) || m.p.length < 3 || !m.p.every(isNum)) return;
      const newDim = cleanDim(m.dim);
      const dimChanged = newDim !== p.dim;
      const np = [clampNum(m.p[0], -3e7, 3e7), clampNum(m.p[1], -64, 512), clampNum(m.p[2], -3e7, 3e7)];
      // teleport guard: legit teleports (respawn, portal, pearl, /tp) are
      // flagged with jump:1 by the client, so they are never rejected here
      const jumped = m.jump ? 1 : 0;
      if (!jumped) {
        const dx = Math.abs(np[0] - p.pos[0]), dy = Math.abs(np[1] - p.pos[1]), dz = Math.abs(np[2] - p.pos[2]);
        // entering/leaving a dimension moves the coordinates a lot by design
        if (!dimChanged && (dx > 60 || dy > 60 || dz > 60)) return;
      }
      let dimMoved = false;
      if (dimChanged && !limited(p, 'dim', 4, 2000)) { p.dim = newDim; dimMoved = true; }
      p.pos = np;
      p.yaw = isNum(m.yaw) ? m.yaw : p.yaw;
      p.pitch = isNum(m.pitch) ? m.pitch : p.pitch;
      if (Array.isArray(m.armor)) p.armor = m.armor.slice(0, 4).map(a => (typeof a === 'string' ? a.slice(0, 16) : null));
      if (Number.isInteger(m.held) && m.held >= 0 && m.held <= 500) p.held = m.held;
      if (isNum(m.hp)) p.hp = clampNum(Math.round(m.hp), 0, 20);
      broadcast({
        t: 'pos', id: p.id, p: p.pos, yaw: p.yaw, pitch: p.pitch, armor: p.armor, dim: p.dim,
        sneak: m.sneak ? 1 : 0, sprint: m.sprint ? 1 : 0, fly: m.fly ? 1 : 0, ground: m.ground ? 1 : 0,
        held: p.held || 0, swim: m.swim ? 1 : 0, hp: p.hp, tp: jumped,
      }, p.id);
      if (dimMoved) {
        const where = newDim === 'nether' ? 'the Nether' : newDim === 'end' ? 'the End' : 'the Overworld';
        broadcast({ t: 'sys', text: `${p.name} went to ${where}` }, p.id);
        broadcastRoster();
      }
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
    case 'me': { // /me emote
      if (!p.hello || limited(p, 'chat', 4, 2000)) return;
      const text = cleanText(m.text);
      if (!text) return;
      broadcast({ t: 'me', from: p.name, text: text.slice(0, 128) });
      console.log(`[chat] * ${p.name} ${text}`);
      break;
    }
    case 'tell': {
      if (!p.hello || limited(p, 'chat', 4, 2000)) return;
      const to = [...players.values()].find(q => q.name.toLowerCase() === String(m.to || '').toLowerCase());
      const text = cleanText(m.text);
      if (!to) { sysTo(p, `Player "${cleanText(m.to)}" is not online`); return; }
      if (!text) return;
      sendText(to.sock, JSON.stringify({ t: 'tell', from: p.name, text }));
      sysTo(p, `[you → ${to.name}] ${text}`);
      break;
    }
    case 'who':
      if (!p.hello) return;
      sendRosterTo(p);
      break;
    case 'ping':
      if (typeof m.ts === 'number') sendText(p.sock, JSON.stringify({ t: 'pong', ts: m.ts }));
      break;
    case 'set': case 'sets': {
      if (!p.hello || limited(p, 'sets', 4000, 1000)) return;
      const list = m.t === 'set' ? [m] : (Array.isArray(m.list) ? m.list.slice(0, MAX_BATCH) : []);
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
      // batches carrying an id are confirmed, so the client can drop them from
      // its "not yet on the server" list (edits are never silently lost)
      if (Number.isInteger(m.batch)) sendText(p.sock, JSON.stringify({ t: 'ack', batch: m.batch, n: clean.length }));
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
      if (!tgt) { sysTo(p, `Player "${cleanText(m.target)}" is not online`); return; }
      if (tgt.id === p.id) { sysTo(p, 'You cannot kick yourself'); return; }
      kickPlayer(tgt, `${cleanText(m.reason) || 'Kicked by an operator'} (by ${p.name})`);
      break;
    }
    case 'op': {
      if (!p.hello) return;
      if (!p.op) { sysTo(p, 'You must be an operator to grant op'); return; }
      const tgt = [...players.values()].find(q => q.name.toLowerCase() === String(m.target || '').toLowerCase());
      if (!tgt) { sysTo(p, `Player "${cleanText(m.target)}" is not online`); return; }
      tgt.op = true;
      ops.add(tgt.name.toLowerCase());
      dirty = true;
      broadcast({ t: 'ops', ops: [...players.values()].filter(q => q.op).map(q => q.id) });
      broadcast({ t: 'sys', text: `${tgt.name} is now an operator` });
      broadcastRoster();
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
      const nid = String(m.nid || '').slice(0, 48);
      if (!nid || !Number.isInteger(m.id) || m.id < 0 || m.id > 500) return;
      if (!Number.isInteger(m.n) || m.n < 1 || m.n > 64) return;
      if (![m.x, m.y, m.z, m.vx, m.vy, m.vz].every(isNum)) return;
      if (Math.abs(m.x) > 3e7 || Math.abs(m.z) > 3e7 || m.y < -64 || m.y > 512) return;
      broadcast({ t: 'drop', from: p.id, nid, id: m.id, n: m.n,
        x: m.x, y: m.y, z: m.z, vx: m.vx, vy: m.vy, vz: m.vz,
        dmg: Number.isInteger(m.dmg) ? m.dmg : 0, tag: cleanTag(m.tag) }, p.id);
      break;
    }
    case 'gone': { // someone picked the drop up: remove it everywhere
      if (!p.hello || limited(p, 'drop', 30, 1000)) return;
      const nid = String(m.nid || '').slice(0, 48);
      if (!nid) return;
      broadcast({ t: 'gone', nid }, p.id);
      break;
    }
    case 'bye':
      try { p.sock.end(); } catch (e) {}
      break;
  }
}

function kickPlayer(p, reason) {
  broadcast({ t: 'sys', text: `${p.name} was kicked (${reason})` });
  try { sendText(p.sock, JSON.stringify({ t: 'kick', reason })); } catch (e) {}
  const sock = p.sock;
  setTimeout(() => { try { sock.destroy(); } catch (e) {} }, 250);
}

// remove a session synchronously (reconnect take-over) and tell everyone
function dropPlayer(p, reason) {
  if (!players.has(p.id)) return;
  players.delete(p.id);
  broadcast({ t: 'leave', id: p.id });
  if (reason) try { sendText(p.sock, JSON.stringify({ t: 'kick', reason })); } catch (e) {}
  const sock = p.sock;
  setTimeout(() => { try { sock.destroy(); } catch (e) {} }, 100);
  if (reason) broadcast({ t: 'sys', text: `${p.name} disconnected (${reason})` });
  saveDb();
}

function onDisconnect(p) {
  if (!players.has(p.id)) return; // already replaced by a reconnect
  players.delete(p.id);
  if (p.hello) {
    broadcast({ t: 'leave', id: p.id });
    broadcast({ t: 'sys', text: `${p.name} left the game` });
    broadcastRoster();
    console.log(`[mp] ${p.name} left (${players.size} online)`);
    saveDb(); // someone leaving flushes the world to disk
  }
}

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
    const headers = {
      'Content-Type': type,
      // the game is a live dev target: never let a browser mix old and new files
      'Cache-Control': file.endsWith('.html') ? 'no-store' : 'no-cache',
      'Access-Control-Allow-Origin': '*',
    };
    res.writeHead(200, headers);
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const p = req.url.split('?')[0];
  if (p === '/status' || p === '/players') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({
      name: SERVER_NAME, game: 'webcraft', seed: SEED >>> 0,
      online: players.size,
      players: roster(),
      names: [...players.values()].map(q => q.name),
      time: timeOfDay, weather, deltas: deltas.size, version: 2,
    }));
    return;
  }
  serveStatic(req, res);
});

server.on('upgrade', (req, sock) => {
  if (req.url.split('?')[0] !== '/ws' && req.url !== '/') { sock.destroy(); return; }
  const key = req.headers['sec-websocket-key'];
  if (!key) { sock.destroy(); return; }
  const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
  sock.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\nConnection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
  );
  sock.setNoDelay(true);
  const p = {
    id: nextId++, sock, name: '', hello: false, cid: '',
    pos: [0, 80, 0], yaw: 0, pitch: 0, armor: [null, null, null, null], dim: 'overworld',
    held: 0, hp: 20, op: false, rl: {}, lastSeen: Date.now(), ping: 0,
  };
  players.set(p.id, p);
  attachParser(
    sock,
    (msg) => { try { onMessage(p, msg); } catch (e) { console.log('[mp] bad message:', e.message); } },
    () => onDisconnect(p),
    // any pong proves the browser is still there: a background tab that stops
    // running rAF must NOT be kicked for inactivity
    (payload) => {
      p.lastSeen = Date.now();
      if (payload && payload.length >= 4 && payload.readUInt32BE(0) === p.pingSentId) {
        const rtt = Date.now() - p.pingSentAt;
        if (rtt >= 0 && rtt < 60000) p.ping = p.ping ? Math.round(p.ping * 0.6 + rtt * 0.4) : rtt;
      }
    }
  );
});

// world clock + heartbeat + roster
let lastTick = Date.now();
setInterval(() => {
  const now = Date.now();
  timeOfDay = (timeOfDay + (now - lastTick) / 1000 / DAY_LEN) % 1;
  lastTick = now;
  broadcast({ t: 'time', time: timeOfDay });
  dirty = true;
  for (const p of [...players.values()]) {
    if (now - p.lastSeen > IDLE_TIMEOUT) { try { p.sock.destroy(); } catch (e) {} continue; }
    sendPing(p.sock, p);
  }
}, 5000);

setInterval(() => { if (players.size) broadcastRoster(); }, ROSTER_EVERY);

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`[mp] port ${PORT} is already in use — is another server running?`);
    console.error('[mp] start with a free port:  node server/mp-server.js --port 8081');
  } else {
    console.error('[mp] server error:', e.message);
  }
  process.exit(1);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[mp] ${SERVER_NAME} listening on port ${PORT}, seed ${SEED >>> 0}`);
  console.log('[mp] open http://<host>:' + PORT + ' to play — MP joins on the same port (/ws)');
  console.log(ops.size
    ? `[mp] operators: ${[...ops].join(', ')} — add more with --op <name>`
    : '[mp] no operators yet: the first player to join becomes one');
});
