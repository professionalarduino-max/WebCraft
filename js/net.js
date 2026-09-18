// Multiplayer client for server/mp-server.js.
// JSON messages over WebSocket. This module owns connection state and the
// remote-player snapshot so the renderer can stay simple.

// Default server address: same origin as the page — the server hosts both the
// game files and multiplayer on one port (/ws path).
export function defaultAddr() {
  const secure = location.protocol === 'https:';
  return `${secure ? 'wss' : 'ws'}://${location.host}/ws`;
}

// Pre-unification address pattern (game :8080 + MP :8081): only used to
// migrate stale saved addresses to the new default.
export function legacyAddr() {
  const secure = location.protocol === 'https:';
  const h = location.hostname;
  const m = h.match(/^(\d+)-(.+)$/);
  const host = m ? `8081-${m[2]}` : `${h}:8081`;
  return `${secure ? 'wss' : 'ws'}://${host}`;
}

function finite(v) { return typeof v === 'number' && Number.isFinite(v); }
function validPos(p) { return Array.isArray(p) && p.length >= 3 && p.slice(0, 3).every(finite); }
function safePos(p, fallback = [0, 80, 0]) {
  return validPos(p) ? [+p[0], +p[1], +p[2]] : [...fallback];
}
function safeArmor(a) {
  const out = [null, null, null, null];
  if (Array.isArray(a)) for (let i = 0; i < 4; i++) out[i] = typeof a[i] === 'string' ? a[i].slice(0, 16) : null;
  return out;
}

export const net = {
  sock: null,
  connected: false,
  connecting: false,
  intentional: false,
  myId: -1,
  name: '',
  addr: '',
  server: '',
  token: '',
  seed: 0,
  serverTime: null,
  weather: 'clear',
  synced: false,
  players: new Map(), // id -> {name, p:[x,y,z], yaw, pitch, armor, dim}
  ops: new Set(),
  ev: {},
  _generation: 0,

  get online() { return this.connected && this.sock && this.sock.readyState === 1; },
  isOp(id = this.myId) { return this.ops.has(id); },

  connect(addr, name, ev = {}) {
    // Ignore callbacks from a socket belonging to an earlier connect. This is
    // important during a page reload/reconnect: the browser may fire the old
    // close event after the new socket is already open.
    this.disconnect(false);
    this.addr = String(addr || '').trim();
    this.name = String(name || 'Steve').slice(0, 16);
    this.ev = ev;
    this.token = Object.prototype.hasOwnProperty.call(ev, 'token')
      ? String(ev.token || '') : String(this.token || '');
    this.players.clear();
    this.ops.clear();
    this.myId = -1;
    this.synced = false;
    this.intentional = false;

    let sock;
    try {
      sock = new WebSocket(this.addr);
    } catch (e) {
      this.connecting = false;
      ev.onError && ev.onError('bad address');
      return;
    }
    const generation = ++this._generation;
    this.sock = sock;
    this.connecting = true;
    const current = () => this.sock === sock && this._generation === generation;

    sock.onopen = () => {
      if (!current()) return;
      this.connecting = false;
      this.connected = true;
      const get = (fn, fallback) => {
        try { return typeof fn === 'function' ? fn() : fallback; } catch (e) { return fallback; }
      };
      this.send({
        t: 'hello', name: this.name,
        token: this.token || undefined,
        p: safePos(get(ev.getPos, [0, 80, 0])),
        yaw: finite(get(ev.getYaw, 0)) ? get(ev.getYaw, 0) : 0,
        pitch: finite(get(ev.getPitch, 0)) ? get(ev.getPitch, 0) : 0,
        dim: get(ev.getDim, 'overworld'),
        armor: get(ev.getArmor, [null, null, null, null]),
        held: get(ev.getHeld, 0) | 0,
        swim: get(ev.getSwim, 0) ? 1 : 0,
      });
      ev.onOpen && ev.onOpen();
    };
    sock.onmessage = (e) => { if (current()) this._onMsg(e.data); };
    sock.onerror = () => {
      if (!current()) return;
      if (this.connecting && ev.onError) ev.onError('connection failed');
      ev.onSocketError && ev.onSocketError();
    };
    sock.onclose = () => {
      if (!current()) return;
      const was = this.connected || this.connecting;
      this.connected = false;
      this.connecting = false;
      this.sock = null;
      this.players.clear();
      this.myId = -1;
      if (was && !this.intentional && this.ev.onClose) this.ev.onClose('');
    };
  },

  disconnect(notify = false) {
    const sock = this.sock;
    const ev = this.ev;
    const was = !!sock || this.connected || this.connecting;
    this.intentional = true;
    this._generation++;
    this.sock = null;
    this.connected = false;
    this.connecting = false;
    this.players.clear();
    this.myId = -1;
    if (sock) {
      try {
        if (sock.readyState === 1) sock.send(JSON.stringify({ t: 'bye' }));
        sock.close();
      } catch (e) {}
    }
    if (notify && was && ev.onClose) ev.onClose('');
  },

  send(obj) {
    if (this.sock && this.sock.readyState === 1) {
      try { this.sock.send(JSON.stringify(obj)); return true; } catch (e) {}
    }
    return false;
  },

  sendPos(p, yaw, pitch, armor, dim, jump = false, sneak = false, held = 0, swim = 0) {
    if (!this.online) return false;
    const pos = safePos([p?.x, p?.y, p?.z]);
    return this.send({
      t: 'pos', p: pos.map(v => +v.toFixed(2)),
      yaw: finite(yaw) ? +yaw.toFixed(3) : 0,
      pitch: finite(pitch) ? +pitch.toFixed(3) : 0,
      armor: safeArmor(armor), dim,
      jump: jump ? 1 : 0, sneak: sneak ? 1 : 0, held: held | 0, swim: swim ? 1 : 0,
    });
  },
  sendChat(text) { return this.send({ t: 'chat', text }); },
  sendSets(list) {
    if (!Array.isArray(list) || !list.length) return false;
    let ok = true;
    for (let i = 0; i < list.length; i += 500) ok = this.send({ t: 'sets', list: list.slice(i, i + 500) }) && ok;
    return ok;
  },
  sendTell(to, text) { return this.send({ t: 'tell', to, text }); },
  sendKick(target) { return this.send({ t: 'kick', target }); },
  sendOp(target) { return this.send({ t: 'op', target }); },
  sendTime(v) { return this.send({ t: 'settime', v }); },
  sendAct(act) { return this.send({ t: 'act', act }); },
  sendDied(text) { return this.send({ t: 'died', text }); },
  sendDrop(nid, id, n, x, y, z, vx, vy, vz, dmg = 0, tag = null) {
    return this.send({ t: 'drop', nid, id, n, x: +x.toFixed(2), y: +y.toFixed(2), z: +z.toFixed(2), vx: +vx.toFixed(2), vy: +vy.toFixed(2), vz: +vz.toFixed(2), dmg, tag });
  },
  sendGone(nid) { return this.send({ t: 'gone', nid }); },
  sendWeather(mode) { return this.send({ t: 'weather', mode }); },

  _onMsg(raw) {
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || typeof m.t !== 'string') return;
    const ev = this.ev;
    switch (m.t) {
      case 'welcome':
        this.myId = Number.isInteger(m.you) ? m.you : -1;
        this.name = m.name || this.name;
        if (typeof m.token === 'string' && m.token) this.token = m.token;
        this.seed = m.seed | 0;
        this.server = m.server || '';
        this.serverTime = m.time;
        this.weather = m.weather === 'rain' ? 'rain' : 'clear';
        this.ops = new Set(Array.isArray(m.ops) ? m.ops : []);
        this.synced = false;
        this.players.clear();
        for (const p of m.players || []) this._upsertPlayer(p);
        ev.onWelcome && ev.onWelcome(m);
        break;
      case 'synced':
        this.synced = true;
        ev.onSynced && ev.onSynced();
        break;
      case 'snapshot': {
        const seen = new Set();
        for (const p of Array.isArray(m.players) ? m.players : []) {
          const q = this._upsertPlayer(p);
          if (q) seen.add(q.id);
        }
        for (const id of [...this.players.keys()]) if (!seen.has(id)) {
          this.players.delete(id);
          ev.onLeave && ev.onLeave(id);
        }
        ev.onSnapshot && ev.onSnapshot(this.players);
        break;
      }
      case 'join':
        if (m.id !== this.myId) {
          this._upsertPlayer(m);
          ev.onJoin && ev.onJoin(m);
        }
        break;
      case 'leave':
        this.players.delete(m.id);
        ev.onLeave && ev.onLeave(m.id);
        break;
      case 'pos': {
        const p = this._upsertPlayer(m);
        if (p) {
          p.p = safePos(m.p, p.p);
          if (finite(m.yaw)) p.yaw = m.yaw;
          if (finite(m.pitch)) p.pitch = m.pitch;
          p.armor = safeArmor(m.armor);
          if (m.dim === 'nether' || m.dim === 'end' || m.dim === 'overworld') p.dim = m.dim;
          p.sneak = m.sneak ? 1 : 0;
          p.held = Number.isInteger(m.held) ? m.held | 0 : p.held | 0;
          p.swim = m.swim ? 1 : 0;
        }
        ev.onPos && ev.onPos(m);
        break;
      }
      case 'chat': ev.onChat && ev.onChat(m.from, m.text); break;
      case 'tell': ev.onTell && ev.onTell(m.from, m.text); break;
      case 'sys': ev.onSys && ev.onSys(m.text); break;
      case 'set': ev.onSets && ev.onSets([m]); break;
      case 'sets': ev.onSets && ev.onSets(Array.isArray(m.list) ? m.list : []); break;
      case 'time':
        this.serverTime = m.time;
        ev.onTime && ev.onTime(m.time);
        break;
      case 'act': ev.onAct && ev.onAct(m.id, m.act); break;
      case 'weather':
        this.weather = m.mode === 'rain' ? 'rain' : 'clear';
        ev.onWeather && ev.onWeather(this.weather);
        break;
      case 'ops':
        this.ops = new Set(Array.isArray(m.ops) ? m.ops : []);
        ev.onOps && ev.onOps(this.ops);
        break;
      case 'kick':
        ev.onKick && ev.onKick(m.reason || 'kicked');
        this.disconnect(false);
        break;
      case 'drop': ev.onDrop && ev.onDrop(m); break;
      case 'gone': ev.onGone && ev.onGone(m.nid); break;
    }
  },

  _upsertPlayer(raw) {
    if (!raw || !Number.isInteger(raw.id) || raw.id === this.myId) return null;
    const old = this.players.get(raw.id);
    const p = old || {
      id: raw.id, name: '', p: [0, 80, 0], yaw: 0, pitch: 0,
      armor: [null, null, null, null], dim: 'overworld', held: 0, sneak: 0, swim: 0,
    };
    if (typeof raw.name === 'string' && raw.name) p.name = raw.name.slice(0, 16);
    if (validPos(raw.p)) p.p = safePos(raw.p, p.p);
    if (finite(raw.yaw)) p.yaw = raw.yaw;
    if (finite(raw.pitch)) p.pitch = raw.pitch;
    if (Array.isArray(raw.armor)) p.armor = safeArmor(raw.armor);
    if (raw.dim === 'nether' || raw.dim === 'end' || raw.dim === 'overworld') p.dim = raw.dim;
    if (Number.isInteger(raw.held)) p.held = raw.held | 0;
    p.swim = raw.swim ? 1 : 0;
    if (!old) this.players.set(p.id, p);
    return p;
  },
};
