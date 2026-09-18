// Multiplayer client for server/mp-server.js.
// JSON messages over WebSocket; remote-player state lives here so the
// renderer can stay dumb. All sends are no-ops while offline.

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

  get online() { return this.connected && this.sock && this.sock.readyState === 1; },
  isOp(id = this.myId) { return this.ops.has(id); },

  connect(addr, name, ev = {}) {
    this.disconnect();
    this.addr = addr;
    this.name = name;
    this.ev = ev;
    this.players.clear();
    this.ops.clear();
    let sock;
    try {
      sock = new WebSocket(addr);
    } catch (e) {
      ev.onClose && ev.onClose('bad address');
      return;
    }
    this.sock = sock;
    sock.onopen = () => {
      this.connected = true;
      this.send({
        t: 'hello', name,
        p: ev.getPos ? ev.getPos() : [0, 80, 0],
        yaw: ev.getYaw ? ev.getYaw() : 0,
        dim: ev.getDim ? ev.getDim() : 'overworld',
        armor: ev.getArmor ? ev.getArmor() : [null, null, null, null],
      });
    };
    sock.onmessage = (e) => this._onMsg(e.data);
    sock.onerror = () => { if (!this.connected && ev.onError) ev.onError('connection failed'); };
    sock.onclose = () => {
      const was = this.connected;
      this.connected = false;
      this.sock = null;
      this.players.clear();
      if (was && this.ev.onClose) this.ev.onClose('');
    };
  },

  disconnect() {
    if (this.sock) {
      try { this.send({ t: 'bye' }); this.sock.close(); } catch (e) {}
      this.sock = null;
    }
    this.connected = false;
    this.players.clear();
  },

  send(obj) {
    if (this.sock && this.sock.readyState === 1) {
      try { this.sock.send(JSON.stringify(obj)); } catch (e) {}
    }
  },

  sendPos(p, yaw, pitch, armor, dim, jump = false, sneak = false, held = 0, swim = 0) {
    if (!this.online) return;
    this.send({ t: 'pos', p: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)], yaw: +yaw.toFixed(3), pitch: +pitch.toFixed(3), armor, dim, jump: jump ? 1 : 0, sneak: sneak ? 1 : 0, held: held | 0, swim: swim ? 1 : 0 });
  },
  sendChat(text) { this.send({ t: 'chat', text }); },
  sendSets(list) {
    for (let i = 0; i < list.length; i += 500) this.send({ t: 'sets', list: list.slice(i, i + 500) });
  },
  sendTell(to, text) { this.send({ t: 'tell', to, text }); },
  sendKick(target) { this.send({ t: 'kick', target }); },
  sendOp(target) { this.send({ t: 'op', target }); },
  sendTime(v) { this.send({ t: 'settime', v }); },
  sendAct(act) { this.send({ t: 'act', act }); },
  sendDied(text) { this.send({ t: 'died', text }); },
  sendDrop(nid, id, n, x, y, z, vx, vy, vz, dmg = 0, tag = null) {
    this.send({ t: 'drop', nid, id, n, x: +x.toFixed(2), y: +y.toFixed(2), z: +z.toFixed(2), vx: +vx.toFixed(2), vy: +vy.toFixed(2), vz: +vz.toFixed(2), dmg, tag });
  },
  sendGone(nid) { this.send({ t: 'gone', nid }); },
  sendWeather(mode) { this.send({ t: 'weather', mode }); },

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
        this.ops = new Set(m.ops || []);
        this.players.clear();
        for (const p of m.players || []) this.players.set(p.id, p);
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
        if (p) { p.p = m.p; p.yaw = m.yaw; p.pitch = m.pitch; p.armor = m.armor; p.dim = m.dim; p.sneak = m.sneak; p.held = m.held | 0; p.swim = m.swim ? 1 : 0; }
        ev.onPos && ev.onPos(m);
        break;
      }
      case 'chat': ev.onChat && ev.onChat(m.from, m.text); break;
      case 'tell': ev.onTell && ev.onTell(m.from, m.text); break;
      case 'sys': ev.onSys && ev.onSys(m.text); break;
      case 'set': ev.onSets && ev.onSets([m]); break;
      case 'sets': ev.onSets && ev.onSets(m.list || []); break;
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
        this.ops = new Set(m.ops || []);
        ev.onOps && ev.onOps(this.ops);
        break;
      case 'kick':
        ev.onKick && ev.onKick(m.reason || 'kicked');
        this.disconnect();
        break;
      case 'drop': ev.onDrop && ev.onDrop(m); break;
      case 'gone': ev.onGone && ev.onGone(m.nid); break;
    }
  },
};
