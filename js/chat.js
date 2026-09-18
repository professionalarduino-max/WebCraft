// In-game chat + cheat-command console (singleplayer and multiplayer).
// All user text is rendered with textContent — no HTML injection possible.
// Singleplayer chat echoes locally; in multiplayer messages go to the server.

import { ITEMS, NAME_TO_ID } from './items.js';
import { BLOCKS } from './blocks.js';

let game = null;
let logEl = null, rowEl = null, inputEl = null;
let chatOpen = false;
let history = [];
let histIdx = -1;

export const COMMANDS = [
  'help', 'gamemode', 'give', 'tp', 'spawn', 'time', 'kill', 'heal', 'clear',
  'fly', 'seed', 'me', 'list', 'tell', 'summon', 'setblock', 'weather',
  'rd', 'locate', 'op', 'kick', 'cam', 'disconnect',
];

const VALID_MOBS = ['pig', 'sheep', 'cow', 'chicken', 'zombie', 'spider', 'skeleton', 'slime', 'slime_small', 'creeper', 'enderman', 'blaze'];

export function isChatOpen() { return chatOpen; }

export function initChat(g) {
  game = g;
  logEl = document.getElementById('chatLog');
  rowEl = document.getElementById('chatRow');
  inputEl = document.getElementById('chatInput');
  if (!logEl || !rowEl || !inputEl) return;
  inputEl.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      const text = inputEl.value.trim().slice(0, 256);
      closeChat(true);
      if (text) submitChat(text);
    } else if (e.key === 'Escape') {
      closeChat(true);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length) { histIdx = histIdx < 0 ? history.length - 1 : Math.max(0, histIdx - 1); inputEl.value = history[histIdx]; }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (histIdx >= 0) { histIdx++; inputEl.value = histIdx >= history.length ? '' : history[histIdx]; if (histIdx >= history.length) histIdx = -1; }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const v = inputEl.value;
      if (v.startsWith('/') && !v.includes(' ')) {
        const part = v.slice(1).toLowerCase();
        const hit = COMMANDS.find(c => c.startsWith(part) && c !== part);
        if (hit) inputEl.value = '/' + hit + ' ';
      }
    }
  });
  // clicking the log while open shouldn't steal the game
  rowEl.addEventListener('mousedown', (e) => e.stopPropagation());
}

export function openChat(prefill = '') {
  if (!inputEl || chatOpen) return;
  chatOpen = true;
  histIdx = -1;
  rowEl.classList.add('show');
  for (const el of logEl.children) { el.style.opacity = '1'; if (el._fade) { clearTimeout(el._fade); el._fade = 0; } }
  inputEl.value = prefill;
  if (document.pointerLockElement) document.exitPointerLock();
  setTimeout(() => inputEl.focus(), 0);
}

export function closeChat(relock = true) {
  if (!inputEl || !chatOpen) return;
  chatOpen = false;
  rowEl.classList.remove('show');
  inputEl.value = '';
  inputEl.blur();
  for (const el of logEl.children) scheduleFade(el);
  if (relock && game && game.relock) game.relock();
}

function scheduleFade(el) {
  if (el._fade) clearTimeout(el._fade);
  el._fade = setTimeout(() => { el.style.opacity = '0'; }, 9000);
  setTimeout(() => { el.remove(); }, 10500);
}

export function chatMessage(text, color = '#ffffff') {
  if (!logEl) return;
  const el = document.createElement('div');
  el.className = 'msg';
  el.textContent = text;
  el.style.color = color;
  logEl.appendChild(el);
  while (logEl.children.length > 50) logEl.firstChild.remove();
  if (!chatOpen) scheduleFade(el);
}
export const chatSys = (text) => chatMessage(text, '#9fdcff');
export const chatErr = (text) => chatMessage(text, '#ff8080');

export function submitChat(text) {
  history.push(text);
  if (history.length > 50) history.shift();
  if (!text.startsWith('/')) {
    if (game.isMP() && game.net.online) game.net.sendChat(text);
    else chatMessage(`<${game.myName()}> ${text}`);
    return;
  }
  const [cmd, ...args] = text.slice(1).split(/\s+/);
  try {
    runCommand((cmd || '').toLowerCase(), args);
  } catch (err) {
    chatErr(`Error: ${err.message}`);
  }
}

function needMP() {
  if (!game.isMP() || !game.net.online) throw new Error('multiplayer only — join a server first');
}

function resolveId(s) {
  if (/^\d+$/.test(s)) {
    const id = +s;
    if (ITEMS[id]) return id;
    throw new Error(`unknown item id ${s}`);
  }
  const key = s.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const id = NAME_TO_ID.get(key);
  if (id == null) throw new Error(`unknown item "${s}"`);
  return id;
}

function runCommand(cmd, args) {
  const p = game.player;
  switch (cmd) {
    case 'help':
      chatSys('/gamemode <s|c> · /give <item> [n] · /tp <x y z|player> · /spawn');
      chatSys('/time set <day|noon|night|midnight|ticks> · /weather <clear|rain> · /kill · /heal · /clear · /fly');
      chatSys('/summon <mob> [n] · /setblock <x y z> <id> · /locate <stronghold|village> · /rd <2-8> · /seed');
      chatSys('/me · /list · /tell <player> · /op · /kick · /cam · /disconnect — Tab completes, ↑↓ history');
      break;
    case 'gamemode': case 'gm': {
      const a = (args[0] || '').toLowerCase();
      const m = (a === 'c' || a === '1' || a.startsWith('crea')) ? 'creative'
        : (a === 's' || a === '0' || a.startsWith('surv')) ? 'survival' : null;
      if (!m) throw new Error('usage: /gamemode <survival|creative>');
      game.applyGameMode(m);
      chatSys(`Game mode set to ${m}`);
      break;
    }
    case 'give': {
      if (!args[0]) throw new Error('usage: /give <item> [count]');
      const id = resolveId(args[0]);
      const n = Math.max(1, Math.min(64, parseInt(args[1] ?? '1', 10) || 1));
      const left = game.inventory.add(id, n);
      chatSys(`Gave ${n - left}× ${ITEMS[id].name}`);
      break;
    }
    case 'tp': {
      if (args.length === 1) {
        needMP();
        const tgt = [...game.net.players.values()].find(q => q.name.toLowerCase() === args[0].toLowerCase());
        if (!tgt) throw new Error(`player "${args[0]}" is not online`);
        p.teleport(tgt.p[0], tgt.p[1], tgt.p[2]);
        game.afterTeleport();
        chatSys(`Teleported to ${tgt.name}`);
      } else if (args.length >= 3) {
        const [x, y, z] = args.slice(0, 3).map(Number);
        if ([x, y, z].some(v => !Number.isFinite(v))) throw new Error('coordinates must be numbers');
        p.teleport(Math.max(-3e7, Math.min(3e7, x)), Math.max(-60, Math.min(512, y)), Math.max(-3e7, Math.min(3e7, z)));
        game.afterTeleport();
        chatSys(`Teleported to ${x.toFixed(1)} ${y.toFixed(1)} ${z.toFixed(1)}`);
      } else throw new Error('usage: /tp <x> <y> <z> or /tp <player>');
      break;
    }
    case 'spawn':
      p.teleport(game.spawnPoint.x, game.spawnPoint.y, game.spawnPoint.z);
      game.afterTeleport();
      chatSys('Teleported to spawn');
      break;
    case 'time': {
      const v = args[0] === 'set' ? args[1] : args[0];
      if (v == null) { chatSys(`Time is ${game.getTime().toFixed(3)} (day fraction)`); break; }
      const presets = { dawn: 0, day: 0.03, morning: 0.1, noon: 0.25, afternoon: 0.4, sunset: 0.5, dusk: 0.52, night: 0.6, midnight: 0.75 };
      let t;
      if (v in presets) t = presets[v];
      else if (/^\d+(\.\d+)?$/.test(v)) t = +v >= 24 ? (+v / 24000) : +v; // ticks or fraction
      else throw new Error('usage: /time set <day|noon|night|midnight|ticks>');
      game.setTime(((t % 1) + 1) % 1);
      chatSys(`Time set to ${game.getTime().toFixed(3)}`);
      break;
    }
    case 'kill':
      p.hp = 0; p.dead = true; p.lastDmg = 'suicide';
      if (p.onDeath) p.onDeath();
      break;
    case 'heal':
      p.hp = p.maxHp; p.hunger = 20; p.saturation = 20; p.air = 10; p.burnT = 0;
      chatSys('Healed');
      break;
    case 'clear': {
      let n = 0;
      for (const arr of [game.inventory.slots, game.inventory.craft, game.inventory.armor]) {
        for (let i = 0; i < arr.length; i++) if (arr[i]) { arr[i] = null; n++; }
      }
      game.inventory.cursor = null;
      game.inventory._c();
      chatSys(`Cleared ${n} stack(s)`);
      break;
    }
    case 'fly':
      p.fly = !p.fly;
      chatSys(`Flying ${p.fly ? 'enabled' : 'disabled'}`);
      break;
    case 'seed':
      chatSys(`Seed: ${game.seed >>> 0}`);
      break;
    case 'me': {
      const text = args.join(' ');
      if (!text) throw new Error('usage: /me <action>');
      if (game.isMP() && game.net.online) game.net.sendChat(`* ${text}`);
      else chatMessage(`* ${game.myName()} ${text}`, '#e0e0e0');
      break;
    }
    case 'list': {
      needMP();
      const names = [game.net.name + ' (you)', ...[...game.net.players.values()].map(q => q.name + (game.net.isOp(q.id) ? ' ★' : ''))];
      chatSys(`${names.length} online: ${names.join(', ')}`);
      break;
    }
    case 'tell': case 'msg': case 'w': {
      needMP();
      const to = args[0], text = args.slice(1).join(' ');
      if (!to || !text) throw new Error('usage: /tell <player> <message>');
      game.net.sendTell(to, text);
      break;
    }
    case 'summon': {
      const type = (args[0] || '').toLowerCase();
      if (!VALID_MOBS.includes(type)) throw new Error(`unknown mob "${args[0] || ''}" (${VALID_MOBS.join(', ')})`);
      const n = Math.max(1, Math.min(10, parseInt(args[1] ?? '1', 10) || 1));
      const d = p.forwardDir();
      for (let i = 0; i < n; i++) {
        game.mobs.forceSpawn(type, p.pos.x + d.x * 3 + (Math.random() - 0.5) * 2, p.pos.y + 1, p.pos.z + d.z * 3 + (Math.random() - 0.5) * 2);
      }
      chatSys(`Summoned ${n}× ${type}`);
      break;
    }
    case 'setblock': {
      if (args.length < 4) throw new Error('usage: /setblock <x> <y> <z> <block>');
      const [x, y, z] = args.slice(0, 3).map(Number);
      if ([x, y, z].some(v => !Number.isInteger(v))) throw new Error('coordinates must be integers');
      const id = resolveId(args[3]);
      if (game.isMP() && game.inSpawnZone && game.inSpawnZone(x, z) && !game.net.isOp(game.net.myId)) throw new Error('spawn is protected — building is disabled there');
      if (!BLOCKS[id] || BLOCKS[id].shape === 'stair-individual') throw new Error(`"${args[3]}" is not a placeable block`);
      if (!game.getWorld().setBlock(x, y, z, id)) throw new Error('cannot set block there (unloaded chunk?)');
      game.afterEdit();
      chatSys(`Set ${ITEMS[id] ? ITEMS[id].name : 'block'} at ${x} ${y} ${z}`);
      break;
    }
    case 'weather': case 'wthr': {
      const m = (args[0] || '').toLowerCase();
      if (m !== 'clear' && m !== 'rain') throw new Error('usage: /weather <clear|rain> [seconds]');
      const secs = args[1] != null ? Math.max(5, Math.min(3600, parseInt(args[1], 10) || 120)) : 0;
      game.setWeather(m, secs);
      chatSys(m === 'rain' ? 'The sky darkens…' : 'The sky clears');
      break;
    }
    case 'rd': {
      const n = parseInt(args[0], 10);
      if (!(n >= 2 && n <= 8)) throw new Error('usage: /rd <2-8>');
      game.setRenderDist(n);
      chatSys(`Render distance: ${n} chunks`);
      break;
    }
    case 'locate': {
      const what = (args[0] || '').toLowerCase();
      if (what === 'stronghold') {
        const s = game.worldOver.stronghold;
        chatSys(`Stronghold at ${s.x} ${s.y} ${s.z} (${Math.hypot(s.x - p.pos.x, s.z - p.pos.z).toFixed(0)} blocks away)`);
      } else if (what === 'village') {
        const v = findVillage(game.worldOver, p.pos.x, p.pos.z);
        if (!v) chatSys('No village within ~3500 blocks');
        else chatSys(`Village at ${v.x} ~ ${v.z} (${Math.hypot(v.x - p.pos.x, v.z - p.pos.z).toFixed(0)} blocks away)`);
      } else throw new Error('usage: /locate <stronghold|village>');
      break;
    }
    case 'op': case 'kick': {
      needMP();
      if (!args[0]) throw new Error(`usage: /${cmd} <player>`);
      if (cmd === 'op') game.net.sendOp(args[0]); else game.net.sendKick(args[0]);
      break;
    }
    case 'cam':
      game.cycleCamera();
      break;
    case 'disconnect': case 'leave':
      if (!game.isMP()) { chatSys('Not in multiplayer'); break; }
      game.disconnectMP();
      break;
    default:
      chatErr(`Unknown command "/${cmd}". Try /help`);
  }
}

// spiral search over the village grid (villages repeat every 320 blocks)
function findVillage(world, px, pz) {
  const cgx = Math.round(px / 320), cgz = Math.round(pz / 320);
  for (let r = 0; r <= 11; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const v = world.villageInfo(cgx + dx, cgz + dz);
        if (v) return v;
      }
    }
  }
  return null;
}
