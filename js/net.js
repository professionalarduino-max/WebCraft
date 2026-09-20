// Multiplayer client for server/mp-server.js.
// JSON messages over WebSocket; remote-player state lives here so the
// renderer can stay dumb. All sends are no-ops while offline.
//
// Reliability features (see README):
//   * automatic reconnection with exponential backoff (stops on kick/leave)
//   * outgoing block-edit batches with ids + acks, so nothing is lost when
//     the socket blips (unacked batches are simply sent again)
//   * app-level ping/pong -> net.ping (ms) for the Tab player list
//   * a stable client id (webcraft_cid) so a reconnect reclaims the same
//     player slot instead of leaving a ghost behind

// Default server address: same origin as the page — the server hosts both
// the game files and multiplayer on one port (/ws path).
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

const CID_KEY = 'webcraft_cid';
const PING_EVERY = 2000;      // app-level RTT ping interval
const RECONNECT_MIN = 800;    // first retry delay
const RECONNECT_MAX = 15000;  // cap

function clientId() {
  try {
    let v = localStorage.getItem(CID_KEY);
    if (!v || v.length < 6) {
      v = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
      localStorage.setItem(CID_KEY, v);
    }
    return v;
  } catch (e) {
    return 'anon' + ((Math.random() * 1e6) | 0);
  }
}

export const net = {
  sock: null,
  connected: false,
  myId: -1,
  name: '',
  addr: '',
  server: '',
  seed: 0,
  serverTime: null,
  weather: 'clear',
  players: new Map(), // id -> {name, p:[x,y,z], yaw, pitch, armor, dim}
  ops: new Set(),
  ev: {},
  status: 'offline',   // 'offline' | 'connecting' | 'online' | 'reconnecting'
  ping: 0,             // round-trip time in ms (0 = unknown)
  cid: '',
  sess: (Math.random() * 0xffffff | 0).toString(36), // per-page-load tag (drop ids)
  reconnectTries: 0,

  get online() { return this.connected && this.sock && this.sock.readyState === 1; },
  isOp(id = this.myId) { return this.ops.has(id); },

  _setStatus(s) {
    if (this.status === s) return;
    this.status = s;
    if (this.ev.onStatus) { try { this.ev.onStatus(s); } catch (e) {} }
  },

  _clearWorld() {
    this.players.clear();
    this.ops.clear();
  },

  // called by the game when the tab is hidden/shown: hidden tabs get a slower
  // position rate (background timers are throttled by the browser anyway)
  setBackground(hidden) { this._bg = !!hidden; },

  connect(addr, name, ev = {}) {
    const keepEv = ev && Object.keys(ev).length ? ev : this.ev;
    this.disconnect(true);            // drop any previous socket, keep retrying allowed
    this.addr = addr;
    this.name = name || this.name || 'Steve';
    this.ev = keepEv || {};
    this.cid = clientId();
    this._stop = false;
    this._clearWorld();
    this._setStatus(this.reconnectTries > 0 ? 'reconnecting' : 'connecting');
    let sock;
    try {
      sock = new WebSocket(addr);
    } catch (e) {
      this._setStatus('offline');
      if (this.ev.onClose) this.ev.onClose('bad address');
      return;
    }
    const mySock = this.sock = sock;
    sock.onopen = () => {
      if (this.sock !== mySock) return;
      this.connected = true;
      this.reconnectTries = 0;
      this._setStatus('online');
      this._lastPingAt = 0;
      this.send({
        t: 'hello', name: this.name, cid: this.cid,
        p: this.ev.getPos ? this.ev.getPos() : [0, 80, 0],
        yaw: this.ev.getYaw ? this.ev.getYaw() : 0,
        pitch: this.ev.getPitch ? this.ev.getPitch() : 0,
        dim: this.ev.getDim ? this.ev.getDim() : 'overworld',
        armor: this.ev.getArmor ? this.ev.getArmor() : [null, null, null, null],
        hp: this.ev.getHp ? this.ev.getHp() : 20,
      });
      if (this.ev.onOpen) this.ev.onOpen();
    };
    sock.onmessage = (e) => { if (this.sock === mySock) this._onMsg(e.data); };
    sock.onerror = () => { if (!this.connected && this.ev.onError) this.ev.onError('connection failed'); };
    sock.onclose = () => {
      if (this.sock !== mySock) return;
      const was = this.connected;
      this.connected = false;
      this.sock = null;
      this.ping = 0;
      this._clearWorld();
      if (this._stop) { this._setStatus('offline'); return; }
      // unexpected drop: keep the game playable and retry in the background
      this._scheduleReconnect();
      if (was && this.ev.onClose) this.ev.onClose('');
    };
  },

  _scheduleReconnect() {
    if (this._stop) return;
    if (this._timer) clearTimeout(this._timer);
    this.reconnectTries++;
    const delay = Math.min(RECONNECT_MAX, Math.round(RECONNECT_MIN * Math.pow(1.7, Math.min(6, this.reconnectTries - 1))));
    this._setStatus('reconnecting');
    this._timer = setTimeout(() => { this._timer = null; this.connect(this.addr, this.name, this.ev); }, delay);
  },

  // user pressed "leave"/"disconnect": no automatic reconnection
  disconnect(keepRetry = false) {
    if (!keepRetry) { this._stop = true; this.reconnectTries = 0; }
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    if (this.sock) {
      try { this.send({ t: 'bye' }); this.sock.close(); } catch (e) {}
      this.sock = null;
    }
    this.connected = false;
    this.ping = 0;
    this._clearWorld();
    if (!keepRetry) this._setStatus('offline');
  },

  send(obj) {
    if (this.sock && this.sock.readyState === 1) {
      try { this.sock.send(JSON.stringify(obj)); } catch (e) {}
    }
  },

  // jump = a legitimate teleport (respawn, /tp, portal, pearl): the server
  // skips its "moved too fast" check for that one update
  sendPos(p, yaw, pitch, armor, dim, opts = {}) {
    if (!this.online) return;
    this.send({
      t: 'pos',
      p: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)],
      yaw: +yaw.toFixed(3), pitch: +pitch.toFixed(3), armor, dim,
      jump: opts.jump ? 1 : 0,
      sneak: opts.sneak ? 1 : 0,
      sprint: opts.sprint ? 1 : 0,
      fly: opts.fly ? 1 : 0,
      ground: opts.ground ? 1 : 0,
      held: opts.held | 0,
      swim: opts.swim ? 1 : 0,
      hp: opts.hp == null ? undefined : Math.max(0, Math.min(20, opts.hp | 0)),
    });
  },
  sendChat(text) { this.send({ t: 'chat', text }); },
  sendMe(text) { this.send({ t: 'me', text }); },
  // edits travel in batches: the server acks each id, so we can resend the
  // ones that never made it (e.g. the socket dropped mid-batch)
  sendEdits(list, batch) { this.send({ t: 'sets', batch, list }); },
  sendWho() { this.send({ t: 'who' }); },
  sendTell(to, text) { this.send({ t: 'tell', to, text }); },
  sendKick(target) { this.send({ t: 'kick', target }); },
  sendOp(target) { this.send({ t: 'op', target }); },
  sendTime(v) { this.send({ t: 'settime', v }); },
  sendAct(act) { this.send({ t: 'act', act }); },
  // PvP: hit another player (the server validates range + rate and broadcasts it)
  sendHit(id, dmg, crit) { this.send({ t: 'hit', id, dmg, crit: crit ? 1 : 0 }); },
  sendDied(text) { this.send({ t: 'died', text }); },
  sendDrop(nid, id, n, x, y, z, vx, vy, vz, dmg = 0, tag = null) {
    this.send({
      t: 'drop', nid, id, n,
      x: +x.toFixed(2), y: +y.toFixed(2), z: +z.toFixed(2),
      vx: +vx.toFixed(2), vy: +vy.toFixed(2), vz: +vz.toFixed(2), dmg, tag,
    });
  },
  sendGone(nid) { this.send({ t: 'gone', nid }); },
  sendWeather(mode) { this.send({ t: 'weather', mode }); },

  pingTick() {
    if (!this.online) return;
    const now = Date.now();
    if (now - (this._lastPingAt || 0) < PING_EVERY) return;
    this._lastPingAt = now;
    this.send({ t: 'ping', ts: now });
  },

  _onMsg(raw) {
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || typeof m.t !== 'string') return;
    const ev = this.ev;
    switch (m.t) {
      case 'welcome':
        this.myId = m.you;
        this.name = m.name || this.name;
        this.seed = m.seed | 0;
        this.server = m.server || '';
        this.serverTime = m.time;
        this.players.clear();
        for (const p of m.players || []) this.players.set(p.id, p);
        this.ops.clear();
        for (const id of m.ops || []) this.ops.add(id);
        ev.onWelcome && ev.onWelcome(m);
        break;
      case 'synced':
        ev.onSynced && ev.onSynced();
        break;
      case 'join':
        this.players.set(m.id, m);
        ev.onJoin && ev.onJoin(m);
        break;
      case 'leave':
        this.players.delete(m.id);
        ev.onLeave && ev.onLeave(m.id);
        break;
      case 'pos': {
        const p = this.players.get(m.id);
        if (p) {
          p.p = m.p; p.yaw = m.yaw; p.pitch = m.pitch; p.armor = m.armor; p.dim = m.dim;
          p.sneak = m.sneak; p.held = m.held | 0; p.swim = m.swim ? 1 : 0;
          p.sprint = m.sprint ? 1 : 0; p.fly = m.fly ? 1 : 0; p.ground = m.ground ? 1 : 0;
          if (typeof m.hp === 'number') p.hp = m.hp;
          if (m.tp) p.tp = 1; else delete p.tp;
        } else {
          // we somehow missed this player's join: ask the server for the list
          const now = Date.now();
          if (!this._whoAt || now - this._whoAt > 3000) { this._whoAt = now; this.sendWho(); }
        }
        ev.onPos && ev.onPos(m);
        break;
      }
      case 'players':
        // full roster refresh (names, dims, op, ping, hp) every couple of seconds
        if (Array.isArray(m.list)) {
          const seen = new Set();
          for (const q of m.list) {
            if (q.id === this.myId) { this.name = q.name || this.name; continue; }
            seen.add(q.id);
            const old = this.players.get(q.id);
            // a roster entry may arrive before the player's first position
            // update: remember the name, but no position yet
            if (old) Object.assign(old, q, { p: old.p });
            else this.players.set(q.id, { ...q, p: null });
          }
          for (const id of [...this.players.keys()]) if (!seen.has(id)) this.players.delete(id);
        }
        ev.onPlayers && ev.onPlayers(m.list || []);
        break;
      case 'chat': ev.onChat && ev.onChat(m.from, m.text); break;
      case 'me': ev.onMe && ev.onMe(m.from, m.text); break;
      case 'tell': ev.onTell && ev.onTell(m.from, m.text); break;
      case 'sys': ev.onSys && ev.onSys(m.text); break;
      case 'set': ev.onSets && ev.onSets([m]); break;
      case 'sets': ev.onSets && ev.onSets(m.list || []); break;
      case 'ack':
        if (Number.isInteger(m.batch)) ev.onAck && ev.onAck(m.batch, m.n | 0);
        break;
      case 'time':
        this.serverTime = m.time;
        ev.onTime && ev.onTime(m.time);
        break;
      case 'act': ev.onAct && ev.onAct(m.id, m.act); break;
      case 'hurt': ev.onHurt && ev.onHurt(m); break;
      case 'died': ev.onPlayerDied && ev.onPlayerDied(m); break;
      case 'weather':
        this.weather = m.mode === 'rain' ? 'rain' : 'clear';
        ev.onWeather && ev.onWeather(this.weather);
        break;
      case 'ops':
        this.ops = new Set(m.ops || []);
        ev.onOps && ev.onOps(this.ops);
        break;
      case 'pong':
        if (typeof m.ts === 'number') {
          const rtt = Date.now() - m.ts;
          if (rtt >= 0 && rtt < 60000) this.ping = this.ping ? Math.round(this.ping * 0.6 + rtt * 0.4) : rtt;
        }
        ev.onPong && ev.onPong(this.ping);
        break;
      case 'kick':
        this._stop = true; // never auto-reconnect a kicked client
        this.kickReason = m.reason || 'kicked';
        ev.onKick && ev.onKick(this.kickReason);
        this.disconnect();
        break;
      case 'drop': ev.onDrop && ev.onDrop(m); break;
      case 'gone': ev.onGone && ev.onGone(m.nid); break;
    }
  },
};
