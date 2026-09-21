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
const PORT = parseInt(arg('--port', process.env.PORT || '8080'), 10) || 8080;
const SEED_ARG = args.includes('--seed') ? (parseInt(arg('--seed', '0'), 10) | 0) : null;
let SEED = SEED_ARG; // resolved after db load: arg > persisted > random
const SERVER_NAME = arg('--name', 'WebCraft Server');
const DAY_LEN = 300; // must match client's DAY_LEN
// --db lets you keep several worlds side by side (tests use a scratch file)
const DB_PATH = path.resolve(arg('--db', path.join(__dirname, 'db.json')));
// The world is kept as a delta map (every block a player changed). 20k was too
// small for a busy shared world: when it filled up the OLDEST edits were
// dropped, so old builds silently disappeared. The cap is now high and can be
// tuned with --max-deltas / MP_MAX_DELTAS. Anything above the cap is still
// evicted oldest-first, so keep it generous.
const MAX_DELTAS = Math.max(1000, parseInt(arg('--max-deltas', process.env.MP_MAX_DELTAS || '200000'), 10) || 200000);
let evicted = 0; // how many oldest edits had to be dropped (surfaced in /status)
// secret that unlocks POST /import (world restore). Empty = imports disabled.
const IMPORT_TOKEN = String(arg('--token', process.env.MP_TOKEN || ''));
// optional URL of a world snapshot to pull at boot (free hosts wipe the disk)
const DB_URL = String(arg('--db-url', process.env.MP_DB_URL || ''));
// player-vs-player damage: on by default, --pvp off / MP_PVP=0 disables it
const PVP = !/^(0|off|no|false)$/i.test(String(arg('--pvp', process.env.MP_PVP || '1')));
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

// --- community state (persisted in the world snapshot) ----------------------
const MAX_HISTORY = 120000; // undo journal: enough for many minutes of building
const history = [];         // newest last: {dim,x,y,z,prev,f,prevF,at,by,byId,done}
const claims = [];          // {owner,cid,dim,x0,y0,z0,x1,y1,z1,at}
const locks = new Map();    // "dim:x,y,z" -> {owner,cid}
const bans = [];            // {name,cid,at,by}
const homes = new Map();    // cid -> Map(name -> {dim,x,y,z})
const teams = new Map();    // lowerName -> {name,color,members:Set(cid)}
const statsByCid = new Map(); // cid -> {name,placed,broken,kills,deaths}
const sleeping = new Set(); // player ids that are in bed
const TEAM_COLORS = ['#ff7070', '#70b0ff', '#7ddc74', '#ffd75e', '#d491ff', '#5ce1e6', '#ff9f5e', '#c5c5c5'];
const LOCK_REACH = 6;
const HOME_LIMIT = 5;

const dimCode = (d) => (d === 'nether' ? 1 : d === 'end' ? 2 : 0);
const dimName = (c) => (c === 1 ? 'nether' : c === 2 ? 'end' : 'overworld');
const dkey = (dim, x, y, z) => `${dim}:${x},${y},${z}`;
const statKey = (p) => p.cid || ('n:' + String(p.name || '').toLowerCase());
function statsFor(p) {
  const k = statKey(p);
  let st = statsByCid.get(k);
  if (!st) { st = { name: p.name || '?', placed: 0, broken: 0, kills: 0, deaths: 0 }; statsByCid.set(k, st); }
  st.name = p.name || st.name;
  return st;
}
function teamOf(cid) {
  if (!cid) return null;
  for (const t of teams.values()) if (t.members.has(cid)) return t;
  return null;
}
function teamColorOf(cid) { const t = teamOf(cid); return t ? t.color : null; }
function claimAt(dim, x, y, z) {
  for (const c of claims) {
    if (c.dim !== dim) continue;
    if (x >= c.x0 && x <= c.x1 && z >= c.z0 && z <= c.z1 && y >= c.y0 && y <= c.y1) return c;
  }
  return null;
}
function isLockedAt(dim, x, y, z) { return locks.get(dkey(dim, x, y, z)) || null; }
function isBanned(name, cid) {
  const n = String(name || '').toLowerCase();
  return bans.find(b => (cid && b.cid && b.cid === cid) || (b.name && b.name === n)) || null;
}
// why can't this player touch that block? null = allowed
function editDenied(p, dim, x, y, z) {
  if (p.op) return null;
  const lk = isLockedAt(dim, x, y, z);
  if (lk && lk.cid !== p.cid && lk.owner !== p.name) return { why: 'lock', owner: lk.owner };
  const cl = claimAt(dim, x, y, z);
  if (cl && cl.cid !== p.cid && cl.owner !== p.name) return { why: 'claim', owner: cl.owner };
  return null;
}
function pushHistory(e) {
  history.push(e);
  const extra = history.length - MAX_HISTORY;
  if (extra > 0) history.splice(0, extra);
}
function broadcastLocks() {
  broadcast({ t: 'lock', list: [...locks.entries()].map(([k, v]) => [k, v.owner]) });
}
function broadcastClaims() {
  broadcast({ t: 'claims', list: claims.map(c => ({ owner: c.owner, cid: c.cid, dim: c.dim, x0: c.x0, y0: c.y0, z0: c.z0, x1: c.x1, y1: c.y1, z1: c.z1 })) });
}
function broadcastTeams() {
  broadcast({ t: 'teams', list: [...teams.values()].map(t => ({ name: t.name, color: t.color, n: t.members.size })) });
}
// apply a list of block reverts ({dim,x,y,z,id,f}) and tell everyone about them
function revertBlocks(list, note) {
  const clean = [];
  for (const r of list) {
    const e = { dim: r.dim, x: r.x, y: r.y, z: r.z, id: r.id };
    if (Number.isInteger(r.f) && r.f >= 0 && r.f <= 5) e.f = r.f;
    deltas.set(dkey(r.dim, r.x, r.y, r.z), e);
    clean.push(e);
  }
  if (clean.length) {
    dirty = true;
    broadcast({ t: 'sets', list: clean });
    if (note) broadcast({ t: 'sys', text: note });
  }
  return clean.length;
}
let weather = 'clear'; // 'clear' | 'rain'

try {
  const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  const n = applySnapshot(db, { quiet: true });
  console.log(`[mp] loaded ${n} block deltas, ${ops.size} ops from ${path.basename(DB_PATH)}`);
} catch (e) { /* first run */ }
for (const n of String(arg('--op', '')).split(',').map(s => s.trim()).filter(Boolean)) {
  const key = n.toLowerCase();
  if (!ops.has(key)) { ops.add(key); dirty = true; console.log(`[mp] op granted: ${n}`); }
}
if (SEED === null) SEED = (Math.random() * 0xffffffff) | 0;

// Free hosting filesystems are wiped on every restart: --db-url lets the server
// pull the last world snapshot (e.g. a file kept in the repo) at boot.
async function fetchSnapshot(url) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  // the backup workflow stores the world gzipped to keep the repository small
  if (buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
    return JSON.parse(require('zlib').gunzipSync(buf).toString('utf8'));
  }
  return JSON.parse(buf.toString('utf8'));
}

if (DB_URL) {
  fetchSnapshot(DB_URL)
    .then(db => {
      if (db.seed === undefined || db.seed === SEED || (SEED_ARG === null && deltas.size === 0)) {
        const n = applySnapshot(db);
        console.log(`[mp] world restored from ${DB_URL}: ${n} block deltas, seed ${SEED >>> 0}`);
      } else {
        console.log('[mp] world snapshot ignored: different seed');
      }
    })
    .catch(e => console.log('[mp] world restore skipped:', e.message));
}

// The whole mutable world in one JSON object (also used by the backup workflow).
// v2 stores every edit as a compact row [dim,x,y,z,id,f?] instead of an object
// with named keys: the file is ~3x smaller, which matters because the backup
// workflow commits it to git every few minutes.
function worldSnapshot() {
  const rows = [];
  for (const d of deltas.values()) {
    const c = dimCode(d.dim);
    rows.push(d.f === undefined ? [c, d.x, d.y, d.z, d.id] : [c, d.x, d.y, d.z, d.id, d.f]);
  }
  return {
    v: 2,
    deltas: rows,
    ops: [...ops],
    time: timeOfDay,
    weather,
    seed: SEED,
    claims: claims.map(c => [c.owner, c.cid, c.dim, c.x0, c.y0, c.z0, c.x1, c.y1, c.z1]),
    locks: [...locks.values()].map(l => [l.key, l.owner, l.cid]),
    bans: bans.map(b => [b.name, b.cid, b.by || '']),
    homes: [...homes.entries()].map(([cid, m]) => [cid, [...m.entries()].map(([n, h]) => [n, dimCode(h.dim), h.x, h.y, h.z])]),
    stats: [...statsByCid.entries()].map(([k, st]) => [k, st.name, st.placed, st.broken, st.kills, st.deaths]),
    teams: [...teams.values()].map(t => [t.name, t.color, [...t.members]]),
  };
}

// Accepts both the v2 rows and the old object form, so worlds saved by an
// earlier build still load.
function applySnapshot(db, opts = {}) {
  if (!db || !Array.isArray(db.deltas)) return 0;
  deltas.clear();
  let idByCode = new Map([[0, 'overworld'], [1, 'nether'], [2, 'end']]);
  for (const d of db.deltas) {
    if (Array.isArray(d)) {
      const dim = idByCode.get(d[0] | 0);
      if (!dim || !Number.isInteger(d[1]) || !Number.isInteger(d[2]) || !Number.isInteger(d[3]) || !Number.isInteger(d[4])) continue;
      const e = { dim, x: d[1], y: d[2], z: d[3], id: d[4] };
      if (Number.isInteger(d[5]) && d[5] >= 0 && d[5] <= 5) e.f = d[5];
      deltas.set(dkey(dim, e.x, e.y, e.z), e);
    } else {
      if (!Number.isInteger(d.x) || !Number.isInteger(d.y) || !Number.isInteger(d.z) || !Number.isInteger(d.id)) continue;
      const dim = cleanDim(d.dim);
      const e = { dim, x: d.x, y: d.y, z: d.z, id: d.id };
      if (Number.isInteger(d.f) && d.f >= 0 && d.f <= 5) e.f = d.f;
      deltas.set(dkey(dim, e.x, e.y, e.z), e);
    }
    if (deltas.size >= MAX_DELTAS) break;
  }
  if (Array.isArray(db.ops)) { ops.clear(); for (const n of db.ops) ops.add(String(n).toLowerCase()); }
  if (typeof db.time === 'number') timeOfDay = ((db.time % 1) + 1) % 1;
  if (db.weather === 'rain' || db.weather === 'clear') weather = db.weather;
  if (Number.isInteger(db.seed)) SEED = db.seed | 0;
  // community data (missing in old snapshots: keep whatever we have)
  if (Array.isArray(db.claims)) {
    claims.length = 0;
    for (const c of db.claims) {
      const arr = Array.isArray(c) ? { owner: c[0], cid: c[1], dim: c[2], x0: c[3], y0: c[4], z0: c[5], x1: c[6], y1: c[7], z1: c[8] } : c;
      if (!arr || typeof arr.owner !== 'string') continue;
      const dim = typeof arr.dim === 'string' ? cleanDim(arr.dim) : idByCode.get(arr.dim | 0) || 'overworld';
      if (![arr.x0, arr.y0, arr.z0, arr.x1, arr.y1, arr.z1].every(Number.isInteger)) continue;
      claims.push({ owner: arr.owner, cid: arr.cid || '', dim, x0: arr.x0, y0: arr.y0, z0: arr.z0, x1: arr.x1, y1: arr.y1, z1: arr.z1, at: Date.now() });
    }
  }
  if (Array.isArray(db.locks)) {
    locks.clear();
    for (const l of db.locks) {
      if (!Array.isArray(l) || typeof l[0] !== 'string' || typeof l[1] !== 'string') continue;
      locks.set(l[0], { key: l[0], owner: l[1], cid: l[2] || '' });
    }
  }
  if (Array.isArray(db.bans)) {
    bans.length = 0;
    for (const b of db.bans) {
      if (!Array.isArray(b)) continue;
      const name = String(b[0] || '').toLowerCase();
      if (!name && !b[1]) continue;
      bans.push({ name, cid: b[1] || '', by: b[2] || '' });
    }
  }
  if (Array.isArray(db.homes)) {
    homes.clear();
    for (const [cid, list] of db.homes) {
      if (typeof cid !== 'string' || !Array.isArray(list)) continue;
      const m = new Map();
      for (const h of list) {
        if (!Array.isArray(h) || typeof h[0] !== 'string') continue;
        m.set(String(h[0]).slice(0, 16), { dim: idByCode.get(h[1] | 0) || 'overworld', x: h[2] | 0, y: h[3] | 0, z: h[4] | 0 });
      }
      homes.set(cid, m);
    }
  }
  if (Array.isArray(db.stats)) {
    statsByCid.clear();
    for (const st of db.stats) {
      if (!Array.isArray(st) || typeof st[0] !== 'string') continue;
      statsByCid.set(st[0], { name: String(st[1] || '?'), placed: st[2] | 0, broken: st[3] | 0, kills: st[4] | 0, deaths: st[5] | 0 });
    }
  }
  if (Array.isArray(db.teams)) {
    teams.clear();
    for (const t of db.teams) {
      if (!Array.isArray(t) || typeof t[0] !== 'string') continue;
      teams.set(String(t[0]).toLowerCase(), { name: String(t[0]).slice(0, 16), color: String(t[1] || TEAM_COLORS[0]), members: new Set(Array.isArray(t[2]) ? t[2].filter(c => typeof c === 'string') : []) });
    }
  }
  dirty = true;
  if (!opts.quiet) saveDb();
  return deltas.size;
}

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
  return [...players.values()].map(q => {
    const t = teamOf(q.cid || '');
    return {
      id: q.id, name: q.name, dim: q.dim, op: !!q.op,
      ping: q.ping || 0, hp: q.hp == null ? 20 : q.hp,
      sleeping: sleeping.has(q.id) ? 1 : 0,
      color: t ? t.color : null, team: t ? t.name : null,
    };
  });
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
      const banCheck = isBanned(cleanName(m.name), cid);
      if (banCheck) {
        console.log(`[mp] rejected banned player: ${cleanText(m.name)}`);
        try { sendText(p.sock, JSON.stringify({ t: 'kick', reason: 'You are banned on this server' })); } catch (e) {}
        setTimeout(() => { try { p.sock.destroy(); } catch (e) {} }, 150);
        return;
      }
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
      const myTeam = teamOf(p.cid || '');
      const stat = statsFor(p);
      sendText(p.sock, JSON.stringify({
        t: 'welcome', you: p.id, name: p.name, seed: SEED, time: timeOfDay, weather,
        server: SERVER_NAME, players: others, op: p.op,
        ops: [...players.values()].filter(q => q.op).map(q => q.id),
        team: myTeam ? { name: myTeam.name, color: myTeam.color } : null,
        stats: stat, sleeping: [...sleeping], bans: bans.length,
      }));
      sendText(p.sock, JSON.stringify({ t: 'lock', list: [...locks.entries()].map(([k, v]) => [k, v.owner]) }));
      sendText(p.sock, JSON.stringify({ t: 'claims', list: claims.map(c => ({ owner: c.owner, cid: c.cid, dim: c.dim, x0: c.x0, y0: c.y0, z0: c.z0, x1: c.x1, y1: c.y1, z1: c.z1 })) }));
      sendText(p.sock, JSON.stringify({ t: 'teams', list: [...teams.values()].map(t => ({ name: t.name, color: t.color, n: t.members.size })) }));
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
      let denied = 0, deniedOwner = '';
      for (const s of list) {
        if (!s || !Number.isInteger(s.x) || !Number.isInteger(s.y) || !Number.isInteger(s.z) || !Number.isInteger(s.id)) continue;
        if (Math.abs(s.x) > 3e7 || Math.abs(s.z) > 3e7 || s.y < 0 || s.y > 255 || s.id < 0 || s.id > 500) continue;
        const dim = cleanDim(s.dim);
        const key = dkey(dim, s.x, s.y, s.z);
        const prev = deltas.get(key);
        const prevId = prev ? prev.id : 0;   // not in deltas = pristine world block
        const isBreak = s.id === 0 && prevId !== 0;
        const isPlace = s.id !== 0 && s.id !== prevId;
        // grief protection: foreign claims and locked blocks are untouchable
        const deny = (isBreak || isPlace) ? editDenied(p, dim, s.x, s.y, s.z) : null;
        if (deny) {
          denied++;
          deniedOwner = deny.owner;
          // put the real block back on that client only, so the world stays honest
          sendText(p.sock, JSON.stringify({ t: 'sets', list: [{ dim, x: s.x, y: s.y, z: s.z, id: prevId, f: prev && prev.f }] }));
          continue;
        }
        const e = { dim, x: s.x, y: s.y, z: s.z, id: s.id };
        if (Number.isInteger(s.f) && s.f >= 0 && s.f <= 5) e.f = s.f; // machine facing sync
        if (isBreak || isPlace) {
          pushHistory({ dim, x: s.x, y: s.y, z: s.z, prev: prevId, prevF: prev ? prev.f : undefined, at: Date.now(), by: p.name, byId: p.id, f: e.f });
          const st = statsFor(p);
          if (isBreak) st.broken++; else st.placed++;
        }
        deltas.set(key, e);
        if (deltas.size > MAX_DELTAS) { // FIFO: oldest edit leaves first
          deltas.delete(deltas.keys().next().value);
          // never lose blocks silently: shout about it (and count it in /status)
          evicted++;
          if (evicted === 1 || evicted % 10000 === 0) {
            broadcast({ t: 'sys', text: `⚠ World edit limit reached (${MAX_DELTAS}) — the oldest edits are being dropped. Raise --max-deltas or use /export to keep a backup.` });
            console.log(`[mp] WARNING: delta cap ${MAX_DELTAS} reached, ${evicted} oldest edits dropped. Raise --max-deltas / MP_MAX_DELTAS.`);
          }
        }
        clean.push(e);
      }
      if (denied) sysTo(p, deniedOwner
        ? `You cannot build here — this land belongs to ${deniedOwner}`
        : 'That block is locked by another player');
      // someone stepped on a pressure plate or touched a machine: tell the
      // player who owns the block, so locks can say 'opened by' later
      if (clean.length) { dirty = true; broadcast({ t: 'sets', list: clean }, p.id); }
      // batches carrying an id are confirmed, so the client can drop them from
      // its "not yet on the server" list (edits are never silently lost)
      if (Number.isInteger(m.batch)) sendText(p.sock, JSON.stringify({ t: 'ack', batch: m.batch, n: clean.length }));
      break;
    }
    case 'hit': {
      // PvP: the attacker's client decides the damage (weapon + crit), the
      // server only checks that the hit is plausible: right target, same
      // dimension, out of arm's reach and not faster than the swing cooldown.
      if (!p.hello || !PVP || limited(p, 'hit', 4, 1000)) return;
      const target = players.get(m.id | 0);
      if (!target || target.id === p.id || !target.hello) return;
      if ((target.dim || 'overworld') !== (p.dim || 'overworld')) return;
      // teammates can never hurt each other
      if (p.cid && target.cid && teamOf(p.cid) && teamOf(p.cid) === teamOf(target.cid)) {
        sysTo(p, `${target.name} is on your team — friendly fire is off`);
        return;
      }
      const dx = target.pos[0] - p.pos[0], dy = target.pos[1] - p.pos[1], dz = target.pos[2] - p.pos[2];
      if (Math.hypot(dx, dy, dz) > 8) return;          // reach
      const dmg = Math.max(1, Math.min(30, m.dmg | 0));
      if ((target.hp == null ? 20 : target.hp) - dmg <= 0) statsFor(p).kills++;
      const kl = Math.hypot(dx, dz) || 1;
      broadcast({
        t: 'hurt', id: target.id, by: p.name, byId: p.id, dmg,
        crit: m.crit ? 1 : 0, kx: +(dx / kl).toFixed(3), kz: +(dz / kl).toFixed(3),
      });
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
      statsFor(p).deaths++;
      sleeping.delete(p.id);
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
    // ---------------------------------------------------------------------
    // World safety: undo my edits, roll the whole world back, restore from the
    // backup stored in the repository.
    case 'undo': {
      if (!p.hello || limited(p, 'undo', 1, 2500)) return;
      const sec = clampNum(Number(m.sec) || 60, 1, 900);
      const since = Date.now() - sec * 1000;
      // m.name = '*' (operators only) undoes everyone's edits in that window
      const all = p.op && m.name === '*';
      const asOp = (p.op && !all && typeof m.name === 'string' && m.name) ? m.name.toLowerCase() : null;
      const revert = [];
      for (let i = history.length - 1; i >= 0; i--) {
        const h = history[i];
        if (h.done || h.at < since) continue;
        if (all ? false : (asOp ? h.by.toLowerCase() !== asOp : h.byId !== p.id)) continue;
        h.done = true;
        revert.push(h);
      }
      if (!revert.length) { sysTo(p, `Nothing to undo in the last ${Math.round(sec)}s`); return; }
      const n = revertBlocks(revert.map(h => ({ dim: h.dim, x: h.x, y: h.y, z: h.z, id: h.prev, f: h.prevF })),
        `${p.name} undid ${revert.length} edit${revert.length === 1 ? '' : 's'}`);
      sysTo(p, `Undid ${n} block${n === 1 ? '' : 's'}`);
      break;
    }
    case 'rollback': {
      if (!p.hello) return;
      if (!p.op) { sysTo(p, 'You must be an operator to roll the world back'); return; }
      if (limited(p, 'rollback', 1, 5000)) return;
      const min = clampNum(Number(m.min) || 5, 0.5, 120);
      const since = Date.now() - min * 60000;
      const revert = [];
      for (let i = history.length - 1; i >= 0; i--) {
        const h = history[i];
        if (h.done || h.at < since) continue;
        h.done = true;
        revert.push(h);
      }
      if (!revert.length) { sysTo(p, `No edits in the last ${min} minute(s)`); return; }
      const authors = new Set(revert.map(h => h.by));
      revertBlocks(revert.map(h => ({ dim: h.dim, x: h.x, y: h.y, z: h.z, id: h.prev, f: h.prevF })),
        `${p.name} rolled the world back ${min} minute(s): ${revert.length} edits by ${[...authors].join(', ')}`);
      break;
    }
    case 'restore': {
      if (!p.hello) return;
      if (!p.op) { sysTo(p, 'You must be an operator to restore the world'); return; }
      if (!DB_URL) { sysTo(p, 'No backup URL configured on this server (--db-url / MP_DB_URL)'); return; }
      if (limited(p, 'restore', 1, 20000)) return;
      sysTo(p, 'Restoring the world from the backup…');
      fetchSnapshot(DB_URL)
        .then(db => {
          const n = applySnapshot(db);
          broadcast({ t: 'sets', list: [...deltas.values()] });
          broadcast({ t: 'sys', text: `${p.name} restored the server world from the backup (${n} blocks)` });
        })
        .catch(e => sysTo(p, 'Restore failed: ' + e.message));
      break;
    }

    // ---------------------------------------------------------------------
    // Grief protection: claims, locked blocks, bans
    case 'claim': {
      if (!p.hello || limited(p, 'claim', 3, 3000)) return;
      const r = clampNum(Number(m.r) || 16, 4, 64);
      const [x, y, z] = p.pos;
      const box = {
        owner: p.name, cid: p.cid || '', dim: p.dim || 'overworld',
        x0: Math.round(x - r), x1: Math.round(x + r),
        y0: Math.max(0, Math.round(y - 24)), y1: Math.min(255, Math.round(y + 40)),
        z0: Math.round(z - r), z1: Math.round(z + r), at: Date.now(),
      };
      const clash = claims.find(c => c.dim === box.dim && c.owner !== p.name &&
        !(c.x1 < box.x0 || c.x0 > box.x1) && !(c.z1 < box.z0 || c.z0 > box.z1));
      if (clash) { sysTo(p, `Too close to ${clash.owner}'s claim — move away or ask them to unclaim`); return; }
      const own = claims.find(c => c.cid && c.cid === p.cid && c.dim === box.dim &&
        !(c.x1 < box.x0 || c.x0 > box.x1) && !(c.z1 < box.z0 || c.z0 > box.z1));
      if (own) { sysTo(p, 'You already have a claim here'); return; }
      claims.push(box);
      dirty = true;
      broadcastClaims();
      broadcast({ t: 'sys', text: `${p.name} claimed a ${r * 2}×${r * 2} area around themselves (${p.name}'s land)` });
      break;
    }
    case 'unclaim': {
      if (!p.hello || limited(p, 'claim', 3, 3000)) return;
      const [x, y, z] = p.pos;
      const keep = [];
      const removed = [];
      for (const c of claims) {
        const mine = (c.cid && c.cid === p.cid) || c.owner === p.name;
        const here = x >= c.x0 && x <= c.x1 && z >= c.z0 && z <= c.z1 && (c.dim === (p.dim || 'overworld'));
        if ((mine && here) || (p.op && here)) removed.push(c); else keep.push(c);
      }
      if (!removed.length) { sysTo(p, 'You are not standing in one of your claims'); return; }
      claims.length = 0;
      claims.push(...keep);
      dirty = true;
      broadcastClaims();
      broadcast({ t: 'sys', text: `${p.name} unclaimed this area` });
      break;
    }
    case 'claims': {
      if (!p.hello) return;
      sendText(p.sock, JSON.stringify({
        t: 'claimInfo',
        list: claims.map(c => ({ owner: c.owner, dim: c.dim, x: Math.round((c.x0 + c.x1) / 2), z: Math.round((c.z0 + c.z1) / 2), r: Math.round((c.x1 - c.x0) / 2) })),
      }));
      break;
    }
    case 'lock': {
      if (!p.hello || limited(p, 'lock', 4, 2000)) return;
      if (![m.x, m.y, m.z].every(Number.isInteger)) return;
      const dim = cleanDim(m.dim);
      const dx = m.x + 0.5 - p.pos[0], dy = m.y + 0.5 - p.pos[1], dz = m.z + 0.5 - p.pos[2];
      if (Math.hypot(dx, dy, dz) > LOCK_REACH + 1) { sysTo(p, 'Too far away'); return; }
      const key = dkey(dim, m.x, m.y, m.z);
      const cur = locks.get(key);
      if (cur) {
        if (cur.cid !== p.cid && cur.owner !== p.name && !p.op) { sysTo(p, `This block is locked by ${cur.owner}`); return; }
        locks.delete(key);
        dirty = true;
        broadcastLocks();
        sysTo(p, `Unlocked ${m.x} ${m.y} ${m.z}`);
      } else {
        locks.set(key, { key, owner: p.name, cid: p.cid || '' });
        dirty = true;
        broadcastLocks();
        sysTo(p, `Locked ${m.x} ${m.y} ${m.z} — only you can open or break it`);
      }
      break;
    }
    case 'ban': {
      if (!p.hello) return;
      if (!p.op) { sysTo(p, 'You must be an operator to ban players'); return; }
      const target = [...players.values()].find(q => q.name.toLowerCase() === String(m.target || '').toLowerCase());
      const name = (target ? target.name : cleanText(m.target)).slice(0, 16);
      if (!name) return;
      if (target && target.id === p.id) { sysTo(p, 'You cannot ban yourself'); return; }
      const cid = target ? (target.cid || '') : '';
      if (!bans.some(b => b.name === name.toLowerCase() || (cid && b.cid === cid))) {
        bans.push({ name: name.toLowerCase(), cid, by: p.name, at: Date.now() });
        dirty = true;
      }
      if (target) kickPlayer(target, `Banned by ${p.name}`);
      broadcast({ t: 'sys', text: `${name} was banned by ${p.name}` });
      console.log(`[mp] banned: ${name}${cid ? ' (' + cid + ')' : ''}`);
      break;
    }
    case 'unban': {
      if (!p.hello) return;
      if (!p.op) { sysTo(p, 'You must be an operator to unban players'); return; }
      const who = String(m.target || '').toLowerCase();
      const before = bans.length;
      for (let i = bans.length - 1; i >= 0; i--) if (bans[i].name === who) bans.splice(i, 1);
      if (bans.length === before) { sysTo(p, `"${cleanText(m.target)}" is not banned`); return; }
      dirty = true;
      broadcast({ t: 'sys', text: `${cleanText(m.target)} was unbanned by ${p.name}` });
      break;
    }
    case 'bans': {
      if (!p.hello) return;
      sysTo(p, bans.length ? `Banned: ${bans.map(b => b.name).join(', ')}` : 'Nobody is banned');
      break;
    }

    // ---------------------------------------------------------------------
    // Co-op: homes, teleport requests, teams, sleep, stats
    case 'home': {
      if (!p.hello || limited(p, 'home', 3, 2000)) return;
      const op = String(m.op || 'list');
      const cid = p.cid || ('n:' + p.name.toLowerCase());
      let mine = homes.get(cid);
      if (!mine) { mine = new Map(); homes.set(cid, mine); }
      const name = String(m.name || 'home').toLowerCase().slice(0, 16);
      if (op === 'set') {
        if (mine.size >= HOME_LIMIT && !mine.has(name)) { sysTo(p, `Home limit is ${HOME_LIMIT} — delete one with /delhome <name>`); return; }
        mine.set(name, { dim: p.dim || 'overworld', x: Math.round(p.pos[0]), y: Math.round(p.pos[1]), z: Math.round(p.pos[2]) });
        dirty = true;
        sysTo(p, `Home "${name}" set at ${Math.round(p.pos[0])} ${Math.round(p.pos[1])} ${Math.round(p.pos[2])} (${p.dim || 'overworld'})`);
      } else if (op === 'del') {
        if (!mine.delete(name)) { sysTo(p, `No home called "${name}"`); return; }
        dirty = true;
        sysTo(p, `Home "${name}" deleted`);
      } else if (op === 'go') {
        const h = mine.get(name);
        if (!h) { sysTo(p, `No home called "${name}" — /sethome first`); return; }
        sendText(p.sock, JSON.stringify({ t: 'tp', dim: h.dim, x: h.x + 0.5, y: h.y + 0.1, z: h.z + 0.5, why: `home "${name}"` }));
      } else {
        sendText(p.sock, JSON.stringify({
          t: 'homeInfo',
          list: [...mine.entries()].map(([n, h]) => ({ n, dim: h.dim, x: h.x, y: h.y, z: h.z })),
        }));
      }
      break;
    }
    case 'tpa': {
      if (!p.hello || limited(p, 'tpa', 3, 3000)) return;
      const target = [...players.values()].find(q => q.name.toLowerCase() === String(m.to || '').toLowerCase());
      if (!target) { sysTo(p, `Player "${cleanText(m.to)}" is not online`); return; }
      if (target.id === p.id) { sysTo(p, 'You are already there'); return; }
      if (!p.tpaIn) p.tpaIn = [];
      p.tpaIn.push({ from: target.name, fromId: target.id, at: Date.now() });
      // tell the target; the request is remembered on the ASKER, the target
      // answers with /tpaccept <name>
      if (!target.tpaOut) target.tpaOut = [];
      target.tpaOut = target.tpaOut.filter(r => Date.now() - r.at < 120000);
      target.tpaOut.push({ from: p.name, fromId: p.id, at: Date.now() });
      sendText(target.sock, JSON.stringify({ t: 'tpaReq', from: p.name, fromId: p.id }));
      sysTo(p, `Teleport request sent to ${target.name}`);
      break;
    }
    case 'tpaccept': {
      if (!p.hello || limited(p, 'tpa', 3, 3000)) return;
      const who = String(m.from || '').toLowerCase();
      const req = (p.tpaOut || []).find(r => r.from.toLowerCase() === who);
      if (!req) { sysTo(p, `No teleport request from "${cleanText(m.from)}"`); return; }
      p.tpaOut = p.tpaOut.filter(r => r !== req);
      const asker = players.get(req.fromId);
      if (!asker || !asker.hello) { sysTo(p, `${req.from} is no longer online`); return; }
      sendText(asker.sock, JSON.stringify({ t: 'tp', dim: p.dim || 'overworld', x: +p.pos[0].toFixed(2), y: +p.pos[1].toFixed(2), z: +p.pos[2].toFixed(2), why: `teleport to ${p.name}` }));
      sysTo(p, `${asker.name} is teleporting to you`);
      sysTo(asker, `Teleporting to ${p.name}…`);
      break;
    }
    case 'tpdeny': {
      if (!p.hello || limited(p, 'tpa', 3, 3000)) return;
      const who = String(m.from || '').toLowerCase();
      const req = (p.tpaOut || []).find(r => r.from.toLowerCase() === who);
      if (!req) { sysTo(p, `No teleport request from "${cleanText(m.from)}"`); return; }
      p.tpaOut = p.tpaOut.filter(r => r !== req);
      const asker = players.get(req.fromId);
      if (asker && asker.hello) sysTo(asker, `${p.name} denied your teleport request`);
      sysTo(p, 'Request denied');
      break;
    }
    case 'team': {
      if (!p.hello || limited(p, 'team', 3, 2000)) return;
      const op = String(m.op || 'list');
      const cid = p.cid || ('n:' + p.name.toLowerCase());
      const cur = teamOf(cid);
      if (op === 'create' || op === 'join') {
        const want = cleanText(m.name).trim().slice(0, 16);
        if (!want || !/^[A-Za-z0-9 _-]{2,16}$/.test(want)) { sysTo(p, 'Team name: 2-16 letters, digits, space, - or _'); return; }
        const key = want.toLowerCase();
        let t = teams.get(key);
        if (op === 'create' && t) { sysTo(p, 'That team already exists — use /team join ' + t.name); return; }
        if (op === 'join' && !t) { sysTo(p, `No team called "${want}" — create it with /team create ${want}`); return; }
        if (op === 'create') {
          t = { name: want, color: TEAM_COLORS[teams.size % TEAM_COLORS.length], members: new Set() };
          teams.set(key, t);
        }
        if (cur) cur.members.delete(cid);
        t.members.add(cid);
        dirty = true;
        broadcastTeams();
        broadcast({ t: 'sys', text: `${p.name} joined team ${t.name}` });
        sendText(p.sock, JSON.stringify({ t: 'teamInfo', name: t.name, color: t.color, n: t.members.size }));
      } else if (op === 'leave') {
        if (!cur) { sysTo(p, 'You are not in a team'); return; }
        if (cur.members.size <= 1) teams.delete(cur.name.toLowerCase());
        else cur.members.delete(cid);
        dirty = true;
        broadcastTeams();
        broadcastRoster();
        broadcast({ t: 'sys', text: `${p.name} left team ${cur.name}` });
      } else {
        sendText(p.sock, JSON.stringify({
          t: 'teamsInfo',
          list: [...teams.values()].map(t => ({ name: t.name, color: t.color, n: t.members.size })),
        }));
      }
      break;
    }
    case 'teamchat': {
      if (!p.hello || limited(p, 'chat', 4, 2000)) return;
      const cid = p.cid || ('n:' + p.name.toLowerCase());
      const t = teamOf(cid);
      if (!t) { sysTo(p, 'You are not in a team — /team create <name>'); return; }
      const text = cleanText(m.text);
      if (!text) return;
      for (const q of players.values()) if (q.cid && t.members.has(q.cid)) {
        sendText(q.sock, JSON.stringify({ t: 'chat', from: p.name, text, team: t.name, color: t.color }));
      }
      break;
    }
    case 'sleep': {
      if (!p.hello || limited(p, 'sleep', 4, 1000)) return;
      if (m.out) { sleeping.delete(p.id); }
      else {
        if ((p.dim || 'overworld') !== 'overworld') { sysTo(p, 'You can only sleep in the Overworld'); return; }
        sleeping.add(p.id);
      }
      const inOver = [...players.values()].filter(q => q.hello && (q.dim || 'overworld') === 'overworld');
      const names = inOver.filter(q => sleeping.has(q.id)).map(q => q.name);
      broadcast({ t: 'sleep', names, n: names.length, total: inOver.length });
      if (names.length && names.length >= inOver.length) {
        timeOfDay = 0.02;
        sleeping.clear();
        dirty = true;
        broadcast({ t: 'time', time: timeOfDay });
        broadcast({ t: 'sleep', names: [], n: 0, total: inOver.length });
        broadcast({ t: 'sys', text: 'Good morning! Everyone slept through the night' });
      } else if (names.length) {
        broadcast({ t: 'sys', text: `${names.join(', ')} ${names.length === 1 ? 'is' : 'are'} sleeping (${names.length}/${inOver.length})` });
      }
      break;
    }
    case 'stat': {
      if (!p.hello) return;
      const who = String(m.name || '').toLowerCase();
      if (!who) { const st = statsFor(p); sendText(p.sock, JSON.stringify({ t: 'stats', me: true, name: p.name, ...st })); return; }
      let found = null;
      for (const st of statsByCid.values()) if (st.name.toLowerCase() === who) { found = st; break; }
      if (!found) { sysTo(p, `No stats for "${cleanText(m.name)}" yet`); return; }
      sendText(p.sock, JSON.stringify({ t: 'stats', name: found.name, ...found }));
      break;
    }
    case 'top': {
      if (!p.hello) return;
      const list = [...statsByCid.values()].sort((a, b) => (b.placed + b.broken) - (a.placed + a.broken)).slice(0, 10);
      sendText(p.sock, JSON.stringify({ t: 'top', list: list.map(s => ({ name: s.name, placed: s.placed, broken: s.broken, kills: s.kills, deaths: s.deaths })) }));
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
  sleeping.delete(p.id);
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
      maxDeltas: MAX_DELTAS, evicted, claims: claims.length, locks: locks.size,
      bans: bans.length, teams: teams.size, sleeping: sleeping.size, pvp: PVP,
    }));
    return;
  }
  if (p === '/export') {
    // full world snapshot: used by the backup workflow and for manual saves.
    // ?gz=1 returns it gzipped (the workflow commits that, so git history stays
    // small even with hundreds of thousands of edits).
    const body = Buffer.from(JSON.stringify(worldSnapshot()), 'utf8');
    const wantGz = /[?&]gz=1/.test(req.url);
    const out = wantGz ? require('zlib').gzipSync(body, { level: 9 }) : body;
    res.writeHead(200, {
      'Content-Type': wantGz ? 'application/gzip' : 'application/json',
      'Content-Encoding': 'identity',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
      'X-World-Deltas': String(deltas.size),
    });
    res.end(out);
    return;
  }
  if (p === '/import') {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'content-type, x-mp-token',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      });
      res.end();
      return;
    }
    if (req.method !== 'POST' || !IMPORT_TOKEN || req.headers['x-mp-token'] !== IMPORT_TOKEN) {
      res.writeHead(403, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end('{"error":"import disabled or bad token"}');
      return;
    }
    let body = '', tooBig = false;
    req.on('data', (c) => { body += c; if (body.length > 12 * 1024 * 1024) { tooBig = true; req.destroy(); } });
    req.on('end', () => {
      if (tooBig) return;
      let n = 0;
      try { n = applySnapshot(JSON.parse(body)); } catch (e) { n = -1; }
      res.writeHead(n >= 0 ? 200 : 400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: n >= 0, deltas: Math.max(0, n) }));
      if (n >= 0) { console.log(`[mp] world imported: ${n} block deltas`); broadcast({ t: 'sys', text: 'Server world was restored from a backup' }); }
    });
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
