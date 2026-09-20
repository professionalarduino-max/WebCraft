// WebCraft — a Minecraft clone for the browser.
// Entry point: rendering, input, mining/building, inventory & crafting,
// HUD, day/night, save/load.

import * as THREE from 'three';
import { B, BLOCKS, TILE, buildAtlas, tileUV, computeAvgColors, isSolid, blockBoxes, emitBox, emitCross, ATLAS_COLS } from './blocks.js';
import { World, CHUNK, HEIGHT, SEA } from './world.js';
import { Player } from './player.js';
import { MobManager, Dragon } from './mobs.js';
import { blockOverlapsEntity } from './physics.js';
import { initAudio, sfx, music, materialOf, setSoundsEnabled, setVolume, setRain } from './sound.js';
import { buildPlayerModel, posePlayer } from './playermodel.js';
import { net, defaultAddr, legacyAddr } from './net.js';
import { STRUCT_BUILDERS } from './structures.js';
import { initChat, openChat, chatMessage, chatSys, chatErr, isChatOpen, submitChat } from './chat.js';
import { loadWorlds, storeWorlds, saveKeyFor, hashSeed, touchWorld, deleteWorldSave, newWorldId } from './worlds.js';
import { mulberry32 } from './noise.js';
import { I, ITEMS, breakInfo, RECIPES, matchGrid, itemIcon, initItemIcons, itemDamage, maxStack, maxDamage, TIER_NAMES, SMELT_TIME, SMELTING } from './items.js';
import { Inventory, encSlot, decSlot } from './inventory.js';
import { tickRedstone, powerLevelAt, isRep, isComp, rsLastScan } from './redstone.js';
import { DropManager } from './drops.js';
import { Furnaces, Chests } from './furnace.js';

let SAVE_KEY = 'webcraft_save_v1';
const PREFS_KEY = 'webcraft_prefs_v1';
const DAY_LEN = 300; // seconds per full day/night cycle
const REACH = 4.5;   // Minecraft block reach
const MOB_REACH = 3; // Minecraft entity reach

// ---------------------------------------------------------------------------
// Save / load

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) return migrateSave(JSON.parse(raw));
  } catch (e) { /* corrupted save */ }
  return null;
}

// Non-block item ids moved from 100-149 up to 200-249 when block ids grew past
// 100 — remap items in saves written before the change.
function migrateSave(s) {
  if (!s || s.itemsV2) return s;
  const remap = (id) => (id >= 100 && id < 150 ? id + 100 : id);
  const remapPair = (v) => (Array.isArray(v) ? [remap(+v[0]), v[1], ...v.slice(2)] : v);
  const inv = s.inventory;
  if (inv) {
    for (const k of ['slots', 'craft', 'armor']) {
      if (Array.isArray(inv[k])) inv[k] = inv[k].map(remapPair);
    }
    if (inv.cursor) inv.cursor = remapPair(inv.cursor);
    if (Array.isArray(inv.counts)) inv.counts = inv.counts.map(remapPair); // v1 inventory
    if (Array.isArray(inv.hotbar)) inv.hotbar = inv.hotbar.map((id) => (id == null ? id : remap(+id)));
  }
  for (const [, f] of s.furnaces || []) {
    if (f && Array.isArray(f.slots)) f.slots = f.slots.map(remapPair);
  }
  for (const e of s.chests || []) {
    if (Array.isArray(e[1])) e[1] = e[1].map(remapPair);
  }
  if (s.drops) {
    for (const rows of Object.values(s.drops)) {
      for (const row of rows || []) if (Array.isArray(row)) row[0] = remap(+row[0]);
    }
  }
  s.itemsV2 = true;
  return s;
}

// user preferences (sensitivity, view bobbing)
let prefs = { sens: 100, bob: true, music: true, sounds: true, volume: 100, rd: 4, mpName: '' };
try {
  const raw = localStorage.getItem(PREFS_KEY);
  if (raw) prefs = { ...prefs, ...JSON.parse(raw) };
} catch (e) { }
function savePrefs() {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (e) { }
}

const params = new URLSearchParams(location.search);
// multiplayer session (written by the MP screen, survives the join reload)
// rewrite pre-unification :8081 session addresses (same server, new port)
function migrateMPAddr(addr) {
  if (addr === legacyAddr()) return defaultAddr();
  try {
    const u = new URL(addr);
    const m = location.hostname.match(/^\d+-(.+)$/);
    const um = u.hostname.match(/^\d+-(.+)$/);
    if (m && um && um[1] === m[1] && u.hostname !== location.hostname) return defaultAddr();
  } catch (e) {}
  return addr;
}
let mpSession = null;
try { mpSession = JSON.parse(sessionStorage.getItem('webcraft_mp') || 'null'); } catch (e) {}
if (mpSession) {
  const migrated = migrateMPAddr(mpSession.addr);
  if (migrated !== mpSession.addr) {
    mpSession.addr = migrated;
    try { sessionStorage.setItem('webcraft_mp', JSON.stringify(mpSession)); } catch (e) {}
  }
}
if (mpSession && (!mpSession.addr || !mpSession.name)) mpSession = null;
// singleplayer world slots
let currentWorldId = null;
let curWorld = null;
if (!mpSession) {
  const worlds = loadWorlds();
  try { currentWorldId = sessionStorage.getItem('webcraft_sp'); } catch (e) {}
  if (!worlds.some(w => w.id === currentWorldId)) {
    currentWorldId = worlds.length
      ? worlds.slice().sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0))[0].id
      : null;
  }
  if (!currentWorldId) {
    curWorld = { id: newWorldId(), name: 'Новый мир', seed: (Math.random() * 0xffffffff) | 0, mode: 'survival', created: Date.now(), lastPlayed: 0 };
    worlds.push(curWorld);
    storeWorlds(worlds);
    currentWorldId = curWorld.id;
  } else {
    curWorld = worlds.find(w => w.id === currentWorldId) || null;
  }
  SAVE_KEY = saveKeyFor(currentWorldId);
  try { sessionStorage.setItem('webcraft_sp', currentWorldId); } catch (e) {}
} else {
  // multiplayer worlds save under their own key — singleplayer is untouched
  SAVE_KEY = 'webcraft_mp_' + ((mpSession.seed >>> 0).toString(36)) + '_v1';
}
const saved = loadSave();
const seed = mpSession ? (mpSession.seed | 0)
  : saved ? saved.seed
  : (curWorld ? curWorld.seed : ((Math.random() * 0xffffffff) | 0));
let renderDist = Math.min(8, Math.max(2, parseInt(params.get('rd') || String(prefs.rd || 4), 10) || 4));


// ---------------------------------------------------------------------------
// Renderer / scene

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.rotation.order = 'YXZ';

const ambient = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(ambient);
const sun = new THREE.DirectionalLight(0xffffff, 1.0);
scene.add(sun);
scene.add(sun.target);

scene.fog = new THREE.Fog(0x87ceeb, renderDist * CHUNK * 0.55, renderDist * CHUNK * 0.95);

// sky objects
const sunMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(16, 16),
  new THREE.MeshBasicMaterial({ color: 0xfff3a0, fog: false })
);
const moonMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(11, 11),
  new THREE.MeshBasicMaterial({ color: 0xdfe4f2, fog: false })
);
scene.add(sunMesh, moonMesh);

const starGeo = new THREE.BufferGeometry();
{
  const n = 350, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(400);
    if (v.y < 20) v.y = 20 + Math.random() * 300;
    pos.set([v.x, v.y, v.z], i * 3);
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
}
const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false });
const stars = new THREE.Points(starGeo, starMat);
scene.add(stars);

// blocky drifting clouds + rain streaks (overworld only)
const cloudGroup = new THREE.Group();
{
  const cm = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, fog: false });
  const cg = new THREE.BoxGeometry(1, 1, 1);
  for (let i = 0; i < 16; i++) {
    const m = new THREE.Mesh(cg, cm);
    m.scale.set(10 + Math.random() * 22, 1.2, 8 + Math.random() * 16);
    m.position.set((Math.random() - 0.5) * 320, 96, (Math.random() - 0.5) * 320);
    m.userData.v = 1 + Math.random() * 1.2;
    cloudGroup.add(m);
  }
}
scene.add(cloudGroup);
const RAIN_N = 700;
const rainGeo = new THREE.BufferGeometry();
const rainPos = new Float32Array(RAIN_N * 3);
for (let i = 0; i < RAIN_N; i++) {
  rainPos[i * 3] = (Math.random() - 0.5) * 44;
  rainPos[i * 3 + 1] = Math.random() * 30;
  rainPos[i * 3 + 2] = (Math.random() - 0.5) * 44;
}
rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
const rainMat = new THREE.PointsMaterial({ color: 0x9ab4d0, size: 0.12, transparent: true, opacity: 0.7, fog: false, depthWrite: false });
const rain = new THREE.Points(rainGeo, rainMat);
rain.visible = false;
rain.frustumCulled = false;
scene.add(rain);
let weatherMode = 'clear'; // 'clear' | 'rain'
let weatherUntil = 0;      // simTime expiry (0 = indefinite)

// ---------------------------------------------------------------------------
// Materials from generated atlas

const atlasCanvas = buildAtlas();
initItemIcons(atlasCanvas);
const atlasTex = new THREE.CanvasTexture(atlasCanvas);
atlasTex.magFilter = THREE.NearestFilter;
atlasTex.minFilter = THREE.NearestFilter;
atlasTex.generateMipmaps = false;
atlasTex.colorSpace = THREE.SRGBColorSpace;

const materials = {
  opaque: new THREE.MeshLambertMaterial({ map: atlasTex, vertexColors: true, alphaTest: 0.5 }),
  water: new THREE.MeshLambertMaterial({ map: atlasTex, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }),
  lava: new THREE.MeshBasicMaterial({ map: atlasTex, alphaTest: 0.5 }), // unlit: glows in the dark (also torches/glowstone)
};
const avgColors = computeAvgColors(atlasCanvas);

const itemTexCache = new Map();
function itemTexture(id) {
  if (!itemTexCache.has(id)) {
    const tex = new THREE.CanvasTexture(itemIcon(id));
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    itemTexCache.set(id, tex);
  }
  return itemTexCache.get(id);
}

// ---------------------------------------------------------------------------
// World / player / inventory

let dim = ['nether', 'end'].includes(saved?.dim) ? saved.dim : 'overworld';
const worldOver = new World(seed, scene, materials, renderDist, 'overworld', { gen: curWorld?.type || 'normal', mpSpawn: !!mpSession });
const worldNether = new World((seed ^ 0x5a17c3) | 0, scene, materials, renderDist, 'nether');
const worldEnd = new World((seed ^ 0x33cc99) | 0, scene, materials, renderDist, 'end');
if (saved && saved.edits) {
  for (const [ck, entries] of saved.edits) worldOver.edits.set(ck, new Map(entries));
}
if (saved && saved.editsN) {
  for (const [ck, entries] of saved.editsN) worldNether.edits.set(ck, new Map(entries));
}
if (saved && saved.editsE) {
  for (const [ck, entries] of saved.editsE) worldEnd.edits.set(ck, new Map(entries));
}
if (saved && saved.rsData) worldOver.rsDataLoad(saved.rsData);
if (saved && saved.rsDataN) worldNether.rsDataLoad(saved.rsDataN);
if (saved && saved.rsDataE) worldEnd.rsDataLoad(saved.rsDataE);
const dims = {
  overworld: { world: worldOver, portals: saved?.portals?.overworld || [] },
  nether: { world: worldNether, portals: saved?.portals?.nether || [] },
  end: { world: worldEnd, portals: [] },
};
let world = dims[dim].world;
let dragonDefeated = !!saved?.dragonDefeated;
let oneblockPhase = saved?.oneblock | 0 || 0;
let dragon = null;

const spawnPoint = worldOver.findSpawn();
const player = new Player(world, spawnPoint);
player.gameMode = saved?.gameMode === 'creative' || (!saved && curWorld && curWorld.mode === 'creative') ? 'creative' : 'survival';
const isCreative = () => player.gameMode === 'creative';
if (saved && saved.player) {
  player.pos = { ...saved.player.pos };
  player.prevPos = { ...saved.player.pos };
  player.yaw = saved.player.yaw || 0;
  player.pitch = saved.player.pitch || 0;
  player.hp = saved.player.hp ?? 20;
}
let timeOfDay = saved?.timeOfDay ?? 0.28;
let selected = saved?.player?.sel ?? 0;

// Minecraft sensitivity curve: f = sens*0.6+0.2; rotation = delta * f^3 * 8 * 0.15deg
// (scaled down 0.35x — browser movementX reports far more units per cm than
// Minecraft's raw mouse input, so unscaled 100% is unplayably fast)
function applySensitivity() {
  const f = (prefs.sens / 100) * 0.6 + 0.2;
  player.lookFactor = f * f * f * 8 * 0.15 * (Math.PI / 180) * 0.35;
}
applySensitivity();
setSoundsEnabled(prefs.sounds !== false);

const inventory = Inventory.from(saved?.inventory);
const isNewPlayer = !saved?.inventory;

const furnaces = new Furnaces();
if (saved?.furnaces) furnaces.load(saved.furnaces);
const chests = new Chests();
const shulkers = new Chests(); // shulker boxes reuse the chest container (27 slots)
const dispensers = new Chests(9);
const droppers = new Chests(9);
const hoppers = new Chests(5);
if (saved && saved.dispensers) dispensers.load(saved.dispensers);
if (saved && saved.droppers) droppers.load(saved.droppers);
if (saved && saved.hoppers) hoppers.load(saved.hoppers);
if (saved?.chests) chests.load(saved.chests);
if (saved?.shulkers) shulkers.load(saved.shulkers);
if (saved?.player?.spawn) player.spawn = { ...saved.player.spawn };
if (saved?.player) {
  player.hunger = saved.player.hunger ?? 20;
  player.saturation = saved.player.saturation ?? 5;
}
// died, then quit before respawning: rejoin freshly respawned at the spawn
// point (the scattered death drops are persisted separately)
if (player.hp <= 0) player.respawn();

// build ground under the player synchronously so we don't fall through
{
  const pcx = Math.floor(player.pos.x / CHUNK), pcz = Math.floor(player.pos.z / CHUNK);
  for (let dz = -2; dz <= 2; dz++)
    for (let dx = -2; dx <= 2; dx++) world.ensureData(pcx + dx, pcz + dz);
  for (let dz = -1; dz <= 1; dz++)
    for (let dx = -1; dx <= 1; dx++) world.buildMesh(pcx + dx, pcz + dz);
}

const mobsByDim = {
  overworld: new MobManager(scene, worldOver),
  nether: new MobManager(scene, worldNether),
  end: new MobManager(scene, worldEnd),
};
let mobs = mobsByDim[dim];

// ---------------------------------------------------------------------------
// Particles

class Particles {
  constructor(scene, cap = 600) {
    this.cap = cap;
    this.list = [];
    this.geo = new THREE.BufferGeometry();
    this.posArr = new Float32Array(cap * 3);
    this.colArr = new Float32Array(cap * 3);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.posArr, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.colArr, 3));
    this.geo.setDrawRange(0, 0);
    this.points = new THREE.Points(this.geo, new THREE.PointsMaterial({ size: 0.14, vertexColors: true }));
    this.points.frustumCulled = false;
    scene.add(this.points);
  }
  burst(x, y, z, rgb, n = 12, spread = 3.5) {
    for (let i = 0; i < n && this.list.length < this.cap; i++) {
      this.list.push({
        x, y, z,
        vx: (Math.random() - 0.5) * spread,
        vy: Math.random() * spread * 0.9 + 1,
        vz: (Math.random() - 0.5) * spread,
        ttl: 0.4 + Math.random() * 0.5,
        r: rgb[0] * (0.75 + Math.random() * 0.35),
        g: rgb[1] * (0.75 + Math.random() * 0.35),
        b: rgb[2] * (0.75 + Math.random() * 0.35),
      });
    }
  }
  update(dt) {
    let n = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.ttl -= dt;
      if (p.ttl <= 0) { this.list.splice(i, 1); continue; }
      p.vy -= 16 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    }
    for (const p of this.list) {
      this.posArr[n * 3] = p.x; this.posArr[n * 3 + 1] = p.y; this.posArr[n * 3 + 2] = p.z;
      this.colArr[n * 3] = p.r; this.colArr[n * 3 + 1] = p.g; this.colArr[n * 3 + 2] = p.b;
      n++;
    }
    this.geo.setDrawRange(0, n);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}
const particles = new Particles(scene);

// ---------------------------------------------------------------------------
// Block geometry helper (held viewmodel + dropped block items)

function makeBlockGeometry(id) {
  const blk = BLOCKS[id];
  const buf = { pos: [], nor: [], uv: [], col: [], idx: [] };
  if (blk.shape === 'cross') emitCross(buf, -0.5, -0.5, -0.5, blk.side);
  else for (const box of blockBoxes(id)) emitBox(buf, -0.5, -0.5, -0.5, box);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(buf.pos), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(buf.nor), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(buf.uv), 2));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(buf.col), 3));
  g.setIndex(buf.idx);
  return g;
}

const blockGeoCache = new Map();
function cachedBlockGeometry(id) {
  if (!blockGeoCache.has(id)) blockGeoCache.set(id, makeBlockGeometry(id));
  return blockGeoCache.get(id);
}

const dropResources = {
  blockGeometry: cachedBlockGeometry,
  blockMaterial: materials.opaque,
  itemTexture,
};
const dropsByDim = {
  overworld: new DropManager(scene, worldOver, dropResources),
  nether: new DropManager(scene, worldNether, dropResources),
  end: new DropManager(scene, worldEnd, dropResources),
};
let drops = dropsByDim[dim];
if (saved?.drops) {
  for (const d of ['overworld', 'nether', 'end']) {
    dropsByDim[d].load(saved.drops[d]);
    if (d !== dim) dropsByDim[d].setActive(false);
  }
}

// ---------------------------------------------------------------------------
// Dimensions & nether portals

const DIRS6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const dimPrefix = () => (dim === 'nether' ? 'N:' : '');
let portalT = 0, portalCd = 0, inPortalNow = false;

// water + lava contact turns the lava to obsidian
function liquidContact(x, y, z) {
  const cells = [[x, y, z], ...DIRS6.map(d => [x + d[0], y + d[1], z + d[2]])];
  for (const [ax, ay, az] of cells) {
    if (world.getBlock(ax, ay, az) !== B.LAVA) continue;
    for (const d of DIRS6) {
      if (world.getBlock(ax + d[0], ay + d[1], az + d[2]) === B.WATER) {
        world.setBlock(ax, ay, az, B.OBSIDIAN);
        particles.burst(ax + 0.5, ay + 0.5, az + 0.5, [0.35, 0.25, 0.5], 10, 2.5);
        sfx.splash();
        break;
      }
    }
  }
}

// --- liquid flow: water spreads 6, lava spreads 2, falling liquid stays strong ---
function liquidTick() {
  const q = world._liqQueue;
  if (!q || !q.size || !world._liqDist) return;
  liqTickN++;
  const lavaTurn = liqTickN % 3 === 0;
  let n = 0;
  for (const k of [...q]) {
    if (n >= 48) break;
    q.delete(k);
    const [x, y, z] = k.split(',').map(Number);
    const id = world.getBlock(x, y, z);
    if (id !== B.WATER && id !== B.LAVA) continue;
    if (id === B.LAVA && !lavaTurn) { q.add(k); continue; } // lava waits for its slow tick
    n++;
    flowLiquid(x, y, z, id);
  }
}
function flowLiquid(x, y, z, id) {
  const dist = world._liqDist.get(x + ',' + y + ',' + z) ?? 0;
  if (world.getBlock(x, y - 1, z) === B.AIR) { // pour down (setBlock re-queues via liquidTouch)
    if (world.setBlock(x, y - 1, z, id)) liquidContact(x, y - 1, z);
    return;
  }
  const maxD = id === B.WATER ? 6 : 2;
  if (dist >= maxD) return;
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    if (world.getBlock(x + dx, y, z + dz) !== B.AIR) continue;
    if (world.setBlock(x + dx, y, z + dz, id)) {
      world._liqDist.set((x + dx) + ',' + y + ',' + (z + dz), dist + 1);
      liquidContact(x + dx, y, z + dz);
    }
  }
}
export { liquidTick, liquidContact, worldOver, worldNether, worldEnd, oneblockState, oneblockPick, ONEBLOCK_PHASES, inSpawnRadius, SPAWN_R }; // boot-harness test hooks
// flood-fill the air inside an obsidian frame; must form a small rectangle
function floodPortalPlane(sx, sy, sz, axis) {
  const cells = [];
  const seen = new Set([sx + ',' + sy + ',' + sz]);
  const stack = [[sx, sy, sz]];
  const dirs = axis === 'x'
    ? [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0]]
    : [[0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0]];
  while (stack.length) {
    if (cells.length > 40) return null;
    const [ax, ay, az] = stack.pop();
    const b = world.getBlock(ax, ay, az);
    if (b === B.AIR) {
      cells.push([ax, ay, az]);
      for (const d of dirs) {
        const k = (ax + d[0]) + ',' + (ay + d[1]) + ',' + (az + d[2]);
        if (!seen.has(k)) { seen.add(k); stack.push([ax + d[0], ay + d[1], az + d[2]]); }
      }
    } else if (b !== B.OBSIDIAN) {
      return null; // frame is not sealed
    }
  }
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, minZ = 1e9, maxZ = -1e9;
  for (const [ax, ay, az] of cells) {
    minX = Math.min(minX, ax); maxX = Math.max(maxX, ax);
    minY = Math.min(minY, ay); maxY = Math.max(maxY, ay);
    minZ = Math.min(minZ, az); maxZ = Math.max(maxZ, az);
  }
  const w = axis === 'x' ? maxX - minX + 1 : maxZ - minZ + 1;
  const h = maxY - minY + 1;
  if (w < 2 || w > 8 || h < 3 || h > 8) return null;
  if (cells.length !== w * h) return null;
  return { cells, minX, minY, minZ };
}

function tryLightPortal(x, y, z) {
  if (world.getBlock(x, y, z) !== B.AIR) return false;
  for (const axis of ['x', 'z']) {
    const region = floodPortalPlane(x, y, z, axis);
    if (region) {
      for (const [ax, ay, az] of region.cells) world.setBlock(ax, ay, az, B.PORTAL);
      dims[dim].portals.push({ x: region.minX, y: region.minY, z: region.minZ });
      return true;
    }
  }
  return false;
}

function ensureAround(px, pz) {
  const pcx = Math.floor(px / CHUNK), pcz = Math.floor(pz / CHUNK);
  for (let dz = -2; dz <= 2; dz++)
    for (let dx = -2; dx <= 2; dx++) world.ensureData(pcx + dx, pcz + dz);
  for (let dz = -1; dz <= 1; dz++)
    for (let dx = -1; dx <= 1; dx++) world.buildMesh(pcx + dx, pcz + dz);
}

function findNetherSpot(x, z) {
  for (let y = 28; y < 50; y++) {
    if (world.getBlock(x, y, z) === B.AIR && world.getBlock(x, y + 1, z) === B.AIR
      && world.getBlock(x, y - 1, z) !== B.AIR && world.getBlock(x, y - 1, z) !== B.LAVA) {
      return { x, y, z };
    }
  }
  // carve a safe pocket
  for (let ay = 32; ay <= 36; ay++)
    for (let az = z - 2; az <= z + 2; az++)
      for (let ax = x - 2; ax <= x + 2; ax++) world.setBlock(ax, ay, az, B.AIR);
  for (let az = z - 2; az <= z + 2; az++)
    for (let ax = x - 2; ax <= x + 2; ax++) world.setBlock(ax, 31, az, B.NETHERRACK);
  return { x, y: 32, z };
}

// build a lit 4x5 portal (2x3 interior) with a small platform
function buildPortalFrame(x, y, z) {
  for (let fy = -1; fy <= 3; fy++) {
    for (let fx = -1; fx <= 2; fx++) {
      const interior = fx >= 0 && fx <= 1 && fy >= 0 && fy <= 2;
      world.setBlock(x + fx, y + fy, z, interior ? B.PORTAL : B.OBSIDIAN);
    }
  }
  for (let fx = -1; fx <= 2; fx++) {
    for (let fz = -1; fz <= 1; fz++) {
      const below = world.getBlock(x + fx, y - 1, z + fz);
      if (!BLOCKS[below].solid) world.setBlock(x + fx, y - 1, z + fz, B.OBSIDIAN);
    }
  }
  // breathing room in front of the portal
  for (let fy = 0; fy <= 2; fy++)
    for (let fx = 0; fx <= 1; fx++)
      for (const dz of [-1, 1]) {
        const b = world.getBlock(x + fx, y + fy, z + dz);
        if (b !== B.AIR && b !== B.PORTAL) world.setBlock(x + fx, y + fy, z + dz, B.AIR);
      }
}

function findOrBuildPortal(tx, tz) {
  const reg = dims[dim].portals;
  ensureAround(tx, tz);
  for (const p of reg) {
    if (Math.hypot(p.x - tx, p.z - tz) < 24 && world.getBlock(p.x, p.y, p.z) === B.PORTAL) return p;
  }
  let spot;
  if (dim === 'nether') {
    spot = findNetherSpot(tx, tz);
  } else {
    const s = world.getSurface(tx, tz);
    spot = { x: tx, y: s ? s.y + 1 : 40, z: tz };
  }
  buildPortalFrame(spot.x, spot.y, spot.z);
  reg.push(spot);
  return spot;
}

function setDimension(target) {
  if (target === dim) return;
  afterTeleport(); // dimensions scale 1:8 — never let the server clamp the move
  if (dim === 'end' && dragon) dragon.group.visible = false;
  world.unloadAll();
  mobs.setActive(false);
  drops.setActive(false);
  dim = target;
  world = dims[dim].world;
  mobs = mobsByDim[dim];
  drops = dropsByDim[dim];
  mobs.setActive(true);
  drops.setActive(true);
  player.world = world;
  if (window.__game) {
    window.__game.world = world;
    window.__game.mobs = mobs;
    window.__game.drops = drops;
  }
}

function resetPlayerAt(x, y, z) {
  player.pos = { x, y, z };
  player.prevPos = { ...player.pos };
  player.vel = { x: 0, y: 0, z: 0 };
  player.fallDist = 0;
  player.burnT = 0;
  portalCd = 3;
  portalT = 0;
}

function switchDimension(target) {
  const scale = target === 'nether' ? 1 / 8 : 8;
  const tx = Math.round(player.pos.x * scale), tz = Math.round(player.pos.z * scale);
  setDimension(target);
  const arrive = findOrBuildPortal(tx, tz);
  resetPlayerAt(arrive.x + 0.5, arrive.y + 0.02, arrive.z + 0.5);
  ensureAround(player.pos.x, player.pos.z);
  sfx.portal();
  toast(target === 'nether' ? 'Entering the Nether…' : 'Returning to the Overworld…', 2.5);
  save();
}

// --- The End ---------------------------------------------------------------

function enterEnd() {
  setDimension('end');
  // obsidian arrival platform off the island's western rim
  ensureAround(-54, 0);
  for (let x = -56; x <= -52; x++) {
    for (let z = -2; z <= 2; z++) {
      world.setBlock(x, 40, z, B.OBSIDIAN);
      for (let y = 41; y <= 43; y++) world.setBlock(x, y, z, B.AIR);
    }
  }
  resetPlayerAt(-53.5, 41.02, 0.5);
  ensureAround(player.pos.x, player.pos.z);
  if (!dragonDefeated && !dragon) {
    dragon = new Dragon(scene);
    dragon.onDeath = onDragonDeath;
    toast('The Ender Dragon circles above…', 3);
  } else {
    toast('Entering the End…', 2.5);
  }
  if (dragon) dragon.group.visible = true;
  sfx.portal();
  save();
}

function leaveEnd() {
  setDimension('overworld');
  if (dragon) dragon.group.visible = false;
  resetPlayerAt(player.spawn.x, player.spawn.y, player.spawn.z);
  ensureAround(player.pos.x, player.pos.z);
  sfx.portal();
  toast('Returning home…', 2.5);
  save();
}

function onDragonDeath() {
  dragonDefeated = true;
  toast('THE ENDER DRAGON HAS BEEN DEFEATED!', 6);
  sfx.levelup();
  const dp = dragon.pos;
  for (let i = 0; i < 8; i++) {
    setTimeout(() => particles.burst(
      dp.x + (Math.random() - 0.5) * 4, dp.y + (Math.random() - 0.5) * 3, dp.z + (Math.random() - 0.5) * 4,
      [0.75, 0.3, 0.9], 20, 6), i * 180);
  }
  sfx.portal();
  setTimeout(() => { if (dragon) { dragon.dispose(); dragon = null; } }, 1600);
  // exit portal + the dragon egg trophy at the island's heart
  ensureAround(0, 0);
  const s = world.getSurface(0, 0);
  const py = (s ? s.y : 38) + 1;
  for (let i = -1; i <= 1; i++) {
    for (let j = -1; j <= 1; j++) world.setBlock(i, py, j, B.END_PORTAL);
    world.setBlock(i, py, -2, B.BEDROCK); world.setBlock(i, py, 2, B.BEDROCK);
    world.setBlock(-2, py, i, B.BEDROCK); world.setBlock(2, py, i, B.BEDROCK);
  }
  world.setBlock(2, py + 1, 2, B.BEDROCK);
  world.setBlock(2, py + 2, 2, B.DRAGON_EGG);
  save();
}

// filling the 12th frame opens the 3x3 floor portal
function checkEndPortalComplete(fx, y, fz) {
  for (let ox = fx - 3; ox <= fx + 1; ox++) {
    for (let oz = fz - 3; oz <= fz + 1; oz++) {
      const ring = [];
      for (let i = 0; i < 3; i++) {
        ring.push([ox - 1, oz + i], [ox + 3, oz + i], [ox + i, oz - 1], [ox + i, oz + 3]);
      }
      if (!ring.every(([rx, rz]) => world.getBlock(rx, y, rz) === B.END_FRAME_FILLED)) continue;
      let clear = true;
      for (let i = 0; i < 3 && clear; i++)
        for (let j = 0; j < 3 && clear; j++) {
          const b = world.getBlock(ox + i, y, oz + j);
          if (b !== B.AIR && b !== B.END_PORTAL) clear = false;
        }
      if (!clear) continue;
      for (let i = 0; i < 3; i++)
        for (let j = 0; j < 3; j++) world.setBlock(ox + i, y, oz + j, B.END_PORTAL);
      sfx.portal();
      toast('The End portal opens beneath you…', 3);
      return true;
    }
  }
  return false;
}

// --- thrown ender pearls -----------------------------------------------------

const pearls = [];
function throwPearl() {
  const eye = player.eye();
  const dir = player.forwardDir();
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.35, 0.35),
    new THREE.MeshBasicMaterial({ map: itemTexture(I.ENDER_PEARL), transparent: true, alphaTest: 0.1, side: THREE.DoubleSide })
  );
  mesh.position.set(eye.x, eye.y, eye.z);
  scene.add(mesh);
  pearls.push({
    pos: { x: eye.x + dir.x * 0.4, y: eye.y + dir.y * 0.4, z: eye.z + dir.z * 0.4 },
    vel: { x: dir.x * 20, y: dir.y * 20 + 3, z: dir.z * 20 },
    ttl: 6, mesh,
  });
  sfx.pop();
}

function updatePearls(dt) {
  for (let i = pearls.length - 1; i >= 0; i--) {
    const pe = pearls[i];
    pe.ttl -= dt;
    pe.vel.y -= 22 * dt;
    const nx = pe.pos.x + pe.vel.x * dt, ny = pe.pos.y + pe.vel.y * dt, nz = pe.pos.z + pe.vel.z * dt;
    const hitSolid = BLOCKS[world.getBlock(Math.floor(nx), Math.floor(ny), Math.floor(nz))].solid;
    if (hitSolid || pe.ttl <= 0) {
      if (hitSolid && !player.dead) {
        // teleport to the last clear spot before impact, MC-style landing damage
        player.pos = { x: pe.pos.x, y: Math.max(1, Math.floor(pe.pos.y)) + 0.02, z: pe.pos.z };
        player.prevPos = { ...player.pos };
        player.vel = { x: 0, y: 0, z: 0 };
        player.fallDist = 0;
        player.damage(2, simTime, 'fall');
        particles.burst(player.pos.x, player.pos.y + 1, player.pos.z, [0.7, 0.25, 0.85], 16, 3.5);
        sfx.portal();
      }
      scene.remove(pe.mesh);
      pe.mesh.geometry.dispose();
      pearls.splice(i, 1);
      continue;
    }
    pe.pos.x = nx; pe.pos.y = ny; pe.pos.z = nz;
    pe.mesh.position.set(nx, ny, nz);
    pe.mesh.rotation.y += dt * 6;
  }
}

// --- arrows (shot from bows) -------------------------------------------------

const ARROW_SPEED = 40;
const ARROW_DMG = 6;
const arrows = [];
const arrowGeo = new THREE.BoxGeometry(0.06, 0.06, 0.5);
const arrowMat = new THREE.MeshLambertMaterial({ color: 0x9a7040 });

function shootArrow() {
  const eye = player.eye();
  const dir = player.forwardDir();
  const mesh = new THREE.Mesh(arrowGeo, arrowMat);
  mesh.position.set(eye.x, eye.y, eye.z);
  scene.add(mesh);
  arrows.push({
    pos: { x: eye.x + dir.x * 0.4, y: eye.y - 0.12 + dir.y * 0.4, z: eye.z + dir.z * 0.4 },
    vel: { x: dir.x * ARROW_SPEED, y: dir.y * ARROW_SPEED, z: dir.z * ARROW_SPEED },
    ttl: 5, mesh,
  });
  sfx.bow();
}

function updateArrows(dt) {
  for (let i = arrows.length - 1; i >= 0; i--) {
    const a = arrows[i];
    a.ttl -= dt;
    a.vel.y -= 16 * dt;
    const speed = Math.hypot(a.vel.x, a.vel.y, a.vel.z) || 1;
    const nd = { x: a.vel.x / speed, y: a.vel.y / speed, z: a.vel.z / speed };
    const step = speed * dt;
    let gone = a.ttl <= 0;

    // mobs (and the dragon) are checked along this frame's flight path
    const mobHit = mobs.raycast(a.pos.x, a.pos.y, a.pos.z, nd.x, nd.y, nd.z, step);
    if (mobHit) {
      mobHit.mob.hurt(ARROW_DMG, nd.x * 0.5, nd.z * 0.5, { player, world, particles });
      sfx.hit();
      gone = true;
    } else if (dim === 'end' && dragon && !dragon.dead
      && dragon.rayHit(a.pos.x, a.pos.y, a.pos.z, nd.x, nd.y, nd.z, step) !== null) {
      dragon.hurt(ARROW_DMG, { particles });
      sfx.hit();
      gone = true;
    } else {
      const nx = a.pos.x + a.vel.x * dt, ny = a.pos.y + a.vel.y * dt, nz = a.pos.z + a.vel.z * dt;
      const bx = Math.floor(nx), by = Math.floor(ny), bz = Math.floor(nz);
      if (BLOCKS[world.getBlock(bx, by, bz)].solid) {
        // hitting a Target block lights it up (power by how close to the centre)
        if (world.getBlock(bx, by, bz) === B.TARGET) arrowHitTarget(bx, by, bz, a);
        drops.spawn(I.ARROW, 1, a.pos.x, a.pos.y, a.pos.z); // stuck arrows can be picked back up
        sfx.place();
        gone = true;
      } else {
        a.pos.x = nx; a.pos.y = ny; a.pos.z = nz;
        a.mesh.position.set(nx, ny, nz);
        a.mesh.lookAt(nx + nd.x, ny + nd.y, nz + nd.z);
      }
    }
    if (gone) {
      scene.remove(a.mesh);
      arrows.splice(i, 1);
    }
  }
}

// ---------------------------------------------------------------------------
// Block highlight + crack overlay + held viewmodel

const highlight = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002)),
  new THREE.LineBasicMaterial({ color: 0x111111 })
);
highlight.visible = false;
scene.add(highlight);

function buildCrackTextures() {
  const texs = [];
  const rand = mulberry32(4242);
  for (let s = 0; s < 5; s++) {
    const c = document.createElement('canvas');
    c.width = c.height = 16;
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'rgba(15,15,15,0.85)';
    const cracks = (s + 1) * 3;
    for (let i = 0; i < cracks; i++) {
      let x = (rand() * 16) | 0, y = (rand() * 16) | 0;
      const len = 3 + ((rand() * 5) | 0);
      for (let j = 0; j < len; j++) {
        ctx.fillRect(x, y, 1, 1);
        x = Math.max(0, Math.min(15, x + ((rand() * 3) | 0) - 1));
        y = Math.max(0, Math.min(15, y + ((rand() * 3) | 0) - 1));
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    texs.push(tex);
  }
  return texs;
}
const crackTextures = buildCrackTextures();
const crackMat = new THREE.MeshBasicMaterial({
  map: crackTextures[0], transparent: true, depthWrite: false,
  polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
});
const crackMesh = new THREE.Mesh(new THREE.BoxGeometry(1.003, 1.003, 1.003), crackMat);
crackMesh.visible = false;
scene.add(crackMesh);

const heldGroup = new THREE.Group();
camera.add(heldGroup);
scene.add(camera);
let heldMesh = null;
let swingT = 10;
let eatT = -1; // food-to-mouth animation progress (0..1, -1 = idle)

function heldId() { const s = inventory.slots[selected]; return s ? s.id : null; }

let armMesh = null; // first-person right arm (always visible, even empty-handed)
function buildFirstPersonArm() {
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xc8966c });
  const shirt = new THREE.MeshLambertMaterial({ color: 0x2fa3a0 });
  const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.5, 0.15), shirt);
  sleeve.position.set(0.13, -0.34, 0.3);
  sleeve.rotation.set(-0.5, 0, 0.15);
  const hand = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 0.15), skin);
  hand.position.set(0.03, -0.11, 0.07);
  hand.rotation.x = 0.3;
  g.add(sleeve, hand);
  return g;
}

function updateHeldItem() {
  if (!armMesh) { armMesh = buildFirstPersonArm(); heldGroup.add(armMesh); }
  if (heldMesh) {
    heldGroup.remove(heldMesh);
    if (heldMesh.userData.ownGeo) heldMesh.geometry.dispose();
    heldMesh = null;
  }
  const id = heldId();
  const it = ITEMS[id];
  if (!it) return;
  if (it.kind === 'block') {
    heldMesh = new THREE.Mesh(cachedBlockGeometry(id), materials.opaque);
    heldMesh.scale.setScalar(0.22);
    heldGroup.position.set(0.55, -0.48, -0.85);
    heldGroup.rotation.set(0.12, Math.PI / 5, 0);
  } else {
    heldMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.5),
      new THREE.MeshBasicMaterial({ map: itemTexture(id), transparent: true, alphaTest: 0.1, side: THREE.DoubleSide })
    );
    heldMesh.userData.ownGeo = true;
    heldGroup.position.set(0.5, -0.45, -0.8);
    heldGroup.rotation.set(0.1, -0.35, 0.25);
  }
  heldGroup.add(heldMesh);
}

// ---------------------------------------------------------------------------
// HUD / UI

const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlayTitle');
const deathScreen = document.getElementById('deathScreen');
const heartsEl = document.getElementById('hearts');
const hotbarEl = document.getElementById('hotbar');
const debugEl = document.getElementById('debug');
const obHudEl = document.getElementById('oneblockHud');
const blockNameEl = document.getElementById('blockname');
const damageEl = document.getElementById('vignette-damage');
const underwaterEl = document.getElementById('underwater');
const invScreen = document.getElementById('invScreen');
const invMainEl = document.getElementById('invMain');
const invHotbarRowEl = document.getElementById('invHotbarRow');
const craftList = document.getElementById('craftList');
const paletteTabsEl = document.getElementById('paletteTabs');
const playerRowEl = document.getElementById('playerRow');
const craftGridEl = document.getElementById('craftGrid');
const craftOutEl = document.getElementById('craftOut');
const craftTitleEl = document.getElementById('craftTitle');
const cursorStackEl = document.getElementById('cursorStack');
const tooltipEl = document.getElementById('invTooltip');
const hungerEl = document.getElementById('hunger');
const armorbarEl = document.getElementById('armorbar');
const airbarEl = document.getElementById('airbar');
const fireOverlayEl = document.getElementById('fireOverlay');
const portalOverlayEl = document.getElementById('portalOverlay');
const bossbarEl = document.getElementById('bossbar');
const bossFillEl = document.getElementById('bossFill');
const armorRowEl = document.getElementById('armorRow');
const craftAreaEl = document.getElementById('craftArea');
const furnacePanelEl = document.getElementById('furnacePanel');
const chestPanelEl = document.getElementById('chestPanel');
const furnInEl = document.getElementById('furnIn');
const furnFuelEl = document.getElementById('furnFuel');
const furnOutEl = document.getElementById('furnOut');
const flameFillEl = document.getElementById('flameFill');
const progFillEl = document.getElementById('progFill');
const recipesColEl = document.querySelector('.inv-col.recipes');
const recipesTitleEl = document.querySelector('.inv-col.recipes h2');
document.getElementById('seedLabel').textContent = 'сид: ' + (seed >>> 0);

// --- main menu dressing: dirt background, splash text, toggles ----------------
{
  const dt = document.createElement('canvas');
  dt.width = dt.height = 48;
  const dctx = dt.getContext('2d');
  dctx.imageSmoothingEnabled = false;
  dctx.drawImage(atlasCanvas, (TILE.DIRT % 16) * 16, ((TILE.DIRT / 16) | 0) * 16, 16, 16, 0, 0, 48, 48);
  overlay.style.backgroundImage = `url(${dt.toDataURL()})`;
  overlay.classList.add('dirt');
}
const SPLASHES = [
  'Руби деревья!', '100% JavaScript!', 'Теперь блоков на 20% больше!',
  'Крипер? О нет!', 'F5 для селфи!', 'Алмазы тебе!',
  'Не копай под себя!', 'Работает в браузере!', 'Факелы светятся!',
  'Бойся зомби!', 'Спи крепко!', 'V = камера!',
  'Джукбокс внутри!', 'Паутина липкая!', 'Играй с друзьями!',
  'Торт — это ложь!', 'Осторожно, лава!',
];
const splashEl = document.getElementById('splash');
if (splashEl) splashEl.textContent = SPLASHES[(Math.random() * SPLASHES.length) | 0];
const musicBtn = document.getElementById('musicBtn');
const soundBtn = document.getElementById('soundBtn');
function refreshToggles() {
  if (musicBtn) musicBtn.textContent = `♫ Музыка: ${prefs.music ? 'ВКЛ' : 'ВЫКЛ'}`;
  if (soundBtn) soundBtn.textContent = `🔊 Звук: ${prefs.sounds ? 'ВКЛ' : 'ВЫКЛ'}`;
}
refreshToggles();
if (musicBtn) musicBtn.addEventListener('click', () => {
  prefs.music = !prefs.music; savePrefs(); refreshToggles();
  if (prefs.music) music.start(); else music.stop();
});
if (soundBtn) soundBtn.addEventListener('click', () => {
  prefs.sounds = !prefs.sounds; savePrefs(); refreshToggles();
  setSoundsEnabled(prefs.sounds);
});
// every menu button clicks like Minecraft
document.querySelectorAll('.mc-btn').forEach(b =>
  b.addEventListener('pointerdown', () => sfx.click()));

// --- menu screens: main / singleplayer / multiplayer / settings --------------
async function probeServer() { // live info card on the multiplayer screen
  if (!mpStatus) return;
  const addr = (mpAddr && mpAddr.value.trim()) || prefs.mpAddr || defaultAddr();
  let url = '';
  try {
    const u = new URL(addr.replace(/^ws/, 'http'));
    // only same-origin probes work from the browser (CORS): the game server
    // serves the page itself, so this hits the server the page came from
    if (u.host === location.host) url = '/status';
    else if (u.hostname === location.hostname) url = `${u.protocol}//${u.host}/status`;
  } catch (e) {}
  if (!url) { return; }
  try {
    const r = await fetch(url + '?t=' + Date.now());
    if (!r.ok) return;
    const j = await r.json();
    if (!j || j.game !== 'webcraft') return;
    const names = (j.players || []).map(p => (typeof p === 'string' ? p : p.name)).slice(0, 8);
    mpStatus.innerHTML = `\u2714 ${esc4(j.name || 'WebCraft server')} \u00b7 ${j.online} online` +
      (names.length ? ` \u00b7 ${names.map(esc4).join(', ')}` : '') +
      `<br>seed ${j.seed >>> 0} \u00b7 ${j.deltas || 0} block edits`;
  } catch (e) { /* server not reachable from here — no big deal */ }
}
function esc4(x) { return String(x).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])); }

function showScreen(name) {
  for (const id of ['menuMain', 'menuSingle', 'menuMP', 'menuSettings']) {
    document.getElementById(id).classList.toggle('show', id === name);
  }
  if (name === 'menuMP') { refreshMP(); probeServer(); }
  if (name === 'menuSingle') renderWorlds();
}
document.getElementById('singleBtn').addEventListener('click', () => showScreen('menuSingle'));
document.getElementById('mpBtn').addEventListener('click', () => { initAudio(); showScreen('menuMP'); });
document.getElementById('settingsBtn').addEventListener('click', () => { initAudio(); showScreen('menuSettings'); });
for (const id of ['backSingle', 'backMP', 'backSettings']) {
  document.getElementById(id).addEventListener('click', () => showScreen('menuMain'));
}

// --- singleplayer worlds ----------------------------------------------------
let selectedWorld = currentWorldId;
function renderWorlds() {
  const list = document.getElementById('worldList');
  list.innerHTML = '';
  const ws = loadWorlds().slice().sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0));
  if (!ws.length) {
    const d = document.createElement('div');
    d.className = 'world-empty';
    d.textContent = 'Нет миров — создайте первый!';
    list.appendChild(d);
    return;
  }
  if (!ws.some(w => w.id === selectedWorld)) selectedWorld = ws[0].id;
  for (const w of ws) {
    const row = document.createElement('div');
    row.className = 'world-row' + (w.id === selectedWorld ? ' sel' : '');
    const nm = document.createElement('div');
    nm.className = 'w-name';
    nm.textContent = w.name + (w.id === currentWorldId ? ' ●' : '');
    const meta = document.createElement('div');
    meta.className = 'w-meta';
    const d = w.lastPlayed ? new Date(w.lastPlayed) : null;
    meta.textContent = `${w.mode === 'creative' ? 'Творческий' : 'Выживание'} · ${w.type === 'flat' ? 'Плоский' : w.type === 'oneblock' ? 'Один блок' : 'Обычный'} · сид ${w.seed >>> 0}` +
      (d ? ` · ${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : '');
    row.append(nm, meta);
    row.addEventListener('click', () => { selectedWorld = w.id; renderWorlds(); });
    row.addEventListener('dblclick', () => playWorld(w.id));
    list.appendChild(row);
  }
}
function playWorld(id) {
  if (!id) return;
  if (id === currentWorldId && !mpSession) { startGame(); return; } // already here: just play
  save();
  try { sessionStorage.setItem('webcraft_sp', id); sessionStorage.removeItem('webcraft_mp'); } catch (e) {}
  location.reload();
}
document.getElementById('playWorldBtn').addEventListener('click', () => playWorld(selectedWorld));
document.getElementById('createWorldBtn').addEventListener('click', () => {
  const name = (document.getElementById('worldName').value || '').trim() || 'Новый мир';
  const seedStr = (document.getElementById('worldSeed').value || '').trim();
  const mode = document.getElementById('worldMode').value === 'creative' ? 'creative' : 'survival';
  const wtype = document.getElementById('worldType').value;
  const ws = loadWorlds();
  const w = {
    id: newWorldId(), name: name.slice(0, 24),
    seed: seedStr ? hashSeed(seedStr) : ((Math.random() * 0xffffffff) | 0),
    mode, type: ['flat', 'oneblock'].includes(wtype) ? wtype : 'normal', created: Date.now(), lastPlayed: 0,
  };
  ws.push(w);
  storeWorlds(ws);
  playWorld(w.id);
});
let deleteArmed = false, deleteTimer = 0;
const deleteWorldBtn = document.getElementById('deleteWorldBtn');
deleteWorldBtn.addEventListener('click', () => {
  if (!selectedWorld) return;
  if (!deleteArmed) {
    deleteArmed = true;
    deleteWorldBtn.textContent = '⚠ Точно удалить?';
    deleteWorldBtn.classList.add('danger');
    clearTimeout(deleteTimer);
    deleteTimer = setTimeout(() => {
      deleteArmed = false;
      deleteWorldBtn.textContent = 'Удалить';
      deleteWorldBtn.classList.remove('danger');
    }, 4000);
    return;
  }
  clearTimeout(deleteTimer);
  deleteArmed = false;
  deleteWorldBtn.textContent = 'Удалить';
  deleteWorldBtn.classList.remove('danger');
  const ws = loadWorlds().filter(w => w.id !== selectedWorld);
  deleteWorldSave(selectedWorld);
  storeWorlds(ws);
  if (selectedWorld === currentWorldId) {
    if (!ws.length) {
      const w = { id: newWorldId(), name: 'Новый мир', seed: (Math.random() * 0xffffffff) | 0, mode: 'survival', created: Date.now(), lastPlayed: 0 };
      ws.push(w); storeWorlds(ws);
    }
    playWorld(ws[0].id);
  } else {
    selectedWorld = currentWorldId;
    renderWorlds();
  }
});

// --- multiplayer: one shared server ------------------------------------------
const mpName = document.getElementById('mpName');
const mpAddr = document.getElementById('mpAddr');
const mpJoin = document.getElementById('mpJoin');
const mpLeave = document.getElementById('mpLeave');
const mpStatus = document.getElementById('mpStatus');
let playMPBtn = document.getElementById('playMPBtn');
if (!playMPBtn && mpStatus) { // stale-cached index.html: build the button ourselves
  playMPBtn = document.createElement('button');
  playMPBtn.id = 'playMPBtn';
  playMPBtn.className = 'mc-btn';
  playMPBtn.textContent = '\u25B6 Играть';
  mpStatus.after(playMPBtn);
}
if (mpName && !mpName.value) mpName.value = prefs.mpName || ('Steve' + ((Math.random() * 900 + 100) | 0));
if (prefs.mpAddr === legacyAddr()) { prefs.mpAddr = defaultAddr(); savePrefs(); } // pre-unification :8081 address
if (mpAddr && !mpAddr.value) mpAddr.value = prefs.mpAddr || defaultAddr();
function refreshMP() {
  if (!mpStatus) return;
  if (playMPBtn) playMPBtn.style.display = mpSession ? 'block' : 'none';
  if (mpSession) {
    mpStatus.textContent = net.online ? `Подключено: ${net.name || mpSession.name}` : `Подключение к ${mpSession.addr}…`;
    mpJoin.style.display = 'none';
    mpLeave.style.display = '';
  } else {
    mpStatus.textContent = 'Общий мир: постройки хранятся на сервере';
    mpJoin.style.display = '';
    mpLeave.style.display = 'none';
  }
}
if (mpJoin) mpJoin.addEventListener('click', () => {
  initAudio();
  const name = (mpName.value || 'Steve').slice(0, 16);
  const addr = mpAddr.value.trim();
  if (!addr) { mpStatus.textContent = 'Введите адрес сервера'; return; }
  prefs.mpName = name; prefs.mpAddr = addr; savePrefs();
  mpStatus.textContent = 'Подключение…';
  save(); // keep the singleplayer world safe first
  net.disconnect();
  net.connect(addr, name, {
    onWelcome: (m) => {
      try { sessionStorage.setItem('webcraft_mp', JSON.stringify({ addr, name: m.name || name, seed: m.seed })); } catch (e) {}
      try { net.sock && net.sock.close(); } catch (e) {}
      net.sock = null; net.connected = false;
      location.reload();
    },
    onClose: () => { if (mpStatus.textContent === 'Подключение…') mpStatus.textContent = 'Не удалось подключиться — сервер запущен?'; },
    onError: () => { if (mpStatus.textContent === 'Подключение…') mpStatus.textContent = 'Ошибка соединения — проверьте адрес'; },
  });
  setTimeout(() => {
    if (mpStatus.textContent === 'Подключение…') {
      net.disconnect();
      mpStatus.textContent = 'Время ожидания истекло';
    }
  }, 8000);
});
if (mpLeave) mpLeave.addEventListener('click', () => {
  save();
  try { net.disconnect(); } catch (e) {}
  try { sessionStorage.removeItem('webcraft_mp'); } catch (e) {}
  location.reload();
});
if (playMPBtn) playMPBtn.addEventListener('click', startGame);
// volume + render-distance sliders
const volSlider = document.getElementById('volSlider');
const volVal = document.getElementById('volVal');
if (volSlider) {
  volSlider.value = prefs.volume ?? 100;
  if (volVal) volVal.textContent = volSlider.value + '%';
  volSlider.addEventListener('input', () => {
    prefs.volume = +volSlider.value; savePrefs();
    if (volVal) volVal.textContent = volSlider.value + '%';
    setVolume(prefs.volume / 100);
  });
}
const rdSlider = document.getElementById('rdSlider');
const rdVal = document.getElementById('rdVal');
if (rdSlider) {
  rdSlider.value = renderDist;
  if (rdVal) rdVal.textContent = String(renderDist);
  rdSlider.addEventListener('input', () => {
    if (rdVal) rdVal.textContent = rdSlider.value;
    setRenderDist(+rdSlider.value);
  });
}
setVolume((prefs.volume ?? 100) / 100);
refreshMP(); // correct Join/Leave visibility from the start
// after a (re)load there is always a world to enter — SP slot or MP session
if (mpSession || currentWorldId) {
  const bootPlay = document.getElementById('playBtn');
  bootPlay.textContent = '▶ Играть';
  bootPlay.style.display = 'block';
}

let blockNameT = 0;
function toast(text, secs = 1.6) {
  blockNameEl.textContent = text;
  blockNameEl.style.opacity = 1;
  blockNameT = secs;
}

// --- camera modes (F5 / V): first person, third-person back/front ------------
let camMode = 0;
const CAM_NAMES = ['First person', 'Third person (back)', 'Third person (front)'];
function cycleCamera() {
  camMode = (camMode + 1) % 3;
  toast('Camera: ' + CAM_NAMES[camMode], 1.4);
  sfx.click();
}
const playerModel = buildPlayerModel();
playerModel.group.visible = false;
scene.add(playerModel.group);
let armorSig = '';

function iconCanvasFor(id, size = 36) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(itemIcon(id), 0, 0, 16, 16, 0, 0, size, size);
  return c;
}

// --- tool/armor durability -------------------------------------------------
function damageHeld(amount = 1) {
  if (isCreative()) return;
  const s = inventory.slots[selected];
  if (!s || !maxDamage(s.id)) return;
  s.d = (s.d || 0) + amount;
  if (s.d >= maxDamage(s.id)) {
    toast(`Your ${ITEMS[s.id].name} broke!`, 2);
    sfx.pop();
    inventory.slots[selected] = null;
  }
  inventory._c();
}
function damageArmor() {
  if (isCreative()) return;
  const worn = [0, 1, 2, 3].filter(i => inventory.armor[i] && maxDamage(inventory.armor[i].id));
  if (!worn.length) return;
  const i = worn[(Math.random() * worn.length) | 0];
  const s = inventory.armor[i];
  s.d = (s.d || 0) + 1;
  if (s.d >= maxDamage(s.id)) {
    toast(`Your ${ITEMS[s.id].name} broke!`, 2);
    sfx.pop();
    inventory.armor[i] = null;
  }
  inventory._c();
}
function durabilityBar(el, s) {
  const max = maxDamage(s.id);
  if (!max || !(s.d > 0)) return;
  const frac = Math.max(0, 1 - s.d / max);
  const bar = document.createElement('div');
  bar.className = 'dbar';
  const fill = document.createElement('div');
  fill.className = 'dfill';
  fill.style.width = (frac * 100).toFixed(0) + '%';
  fill.style.background = frac > 0.6 ? '#5fd65f' : frac > 0.25 ? '#ffd76e' : '#e05555';
  bar.appendChild(fill);
  el.appendChild(bar);
}

function renderHotbar() {
  hotbarEl.innerHTML = '';
  for (let i = 0; i < 9; i++) {
    const slot = document.createElement('div');
    slot.className = 'slot' + (i === selected ? ' sel' : '');
    const s = inventory.slots[i];
    if (s) {
      slot.appendChild(iconCanvasFor(s.id, 36));
      durabilityBar(slot, s);
      if (s.n > 1) {
        const cnt = document.createElement('span');
        cnt.className = 'cnt';
        cnt.textContent = s.n;
        slot.appendChild(cnt);
      }
    }
    hotbarEl.appendChild(slot);
  }
}

function setSelected(i) {
  selected = ((i % 9) + 9) % 9;
  document.querySelectorAll('#hotbar .slot').forEach((s, j) => s.classList.toggle('sel', j === selected));
  updateHeldItem();
  const id = heldId();
  if (id != null) toast(ITEMS[id].name);
}

let lastHp = -1, lastHunger = -1, lastArmor = -1;
function updateHearts() {
  updateAir();
  if (player.hp !== lastHp) {
    lastHp = player.hp;
    let html = '';
    for (let i = 0; i < 10; i++) {
      const full = player.hp >= (i + 1) * 2;
      const half = !full && player.hp >= i * 2 + 1;
      html += `<span class="${full ? 'full' : half ? 'half' : 'empty'}">♥</span>`;
    }
    heartsEl.innerHTML = html;
  }
  const hungerNow = Math.ceil(player.hunger);
  if (hungerNow !== lastHunger) {
    lastHunger = hungerNow;
    let html = '';
    for (let i = 9; i >= 0; i--) { // drumsticks deplete right-to-left like MC
      const full = player.hunger >= (i + 1) * 2;
      const half = !full && player.hunger >= i * 2 + 1;
      html += `<span class="${full ? 'full' : half ? 'half' : 'empty'}">🍗</span>`;
    }
    hungerEl.innerHTML = html;
  }
  if (player.armorPoints !== lastArmor) {
    lastArmor = player.armorPoints;
    if (player.armorPoints <= 0) {
      armorbarEl.innerHTML = '';
    } else {
      let html = '';
      for (let i = 0; i < 10; i++) {
        html += `<span class="${player.armorPoints >= (i + 1) * 2 ? 'full' : 'empty'}">🛡</span>`;
      }
      armorbarEl.innerHTML = html;
    }
  }
}

// air bubbles while diving
let lastAir = -1;
function updateAir() {
  const a = Math.ceil(player.air);
  const show = !isCreative() && (player.air < 10 || player.eyeInWater);
  if (airbarEl.style.display === (show ? '' : 'none') && a === lastAir) return;
  lastAir = a;
  airbarEl.style.display = show ? '' : 'none';
  if (!show) return;
  let html = '';
  for (let i = 0; i < 10; i++) html += `<span class="${a > i ? 'full' : 'empty'}">\u{1FAE7}</span>`;
  airbarEl.innerHTML = html;
}

function updateFurnaceBars() {
  const c = inventory.container;
  if (!c) return;
  flameFillEl.style.height = (c.burnMax > 0 ? Math.max(0, c.burn / c.burnMax) * 100 : 0) + '%';
  progFillEl.style.width = (c.progress / SMELT_TIME) * 100 + '%';
}

player.onDamage = () => {
  if (!['starve', 'drown', 'void', 'suicide'].includes(player.lastDmg)) damageArmor();
  damageEl.style.transition = 'none';
  damageEl.style.opacity = 0.55;
  requestAnimationFrame(() => {
    damageEl.style.transition = 'opacity 0.6s';
    damageEl.style.opacity = 0;
  });
  sfx.hurt();
};
// survival death: everything you carried scatters where you fell
// (5-minute despawn instead of the usual 90s, so you can run back for it)
function scatterInventory() {
  const stacks = [];
  for (let i = 0; i < 36; i++) if (inventory.slots[i]) { stacks.push(inventory.slots[i]); inventory.slots[i] = null; }
  for (let i = 0; i < 4; i++) if (inventory.armor[i]) { stacks.push(inventory.armor[i]); inventory.armor[i] = null; }
  const p = player.pos;
  for (const s of stacks) netDrop(s.id, s.n, p.x, p.y + 0.6, p.z, { stack: true, ttl: 300, dmg: s.d || 0 });
  inventory._c();
}

let lastPlayerAttacker = null;   // set when another player lands the killing-blow-ish hit
let dbgLastAttack = null;        // diagnostics for the tests: what the last swing hit

player.onDeath = () => {
  {
    const nm = (mpSession && net.online) ? net.name : 'You';
    const msgs = { fall: 'hit the ground too hard', lava: 'tried to swim in lava', fire: 'burned to death', void: 'fell out of the world', starve: 'starved to death', drown: 'drowned', attack: 'was slain', arrow: 'was shot', suicide: 'took the easy way out', generic: 'died' };
    const dt = (player.lastDmg === 'attack' && lastPlayerAttacker)
      ? `${nm} was slain by ${lastPlayerAttacker}`
      : `${nm} ${msgs[player.lastDmg] || msgs.generic}`;
    if (mpSession && net.online) net.sendDied(dt); else chatMessage(dt, '#ff8080');
  }
  sfx.die();
  closeInventory(false); // returns crafting grid + cursor to the slots first
  if (!isCreative()) scatterInventory();
  document.exitPointerLock();
  deathScreen.classList.add('show');
  save();
};

document.getElementById('respawnBtn').addEventListener('click', () => {
  lastPlayerAttacker = null;
  if (dim !== 'overworld') setDimension('overworld'); // you wake up back home
  player.respawn();
  afterTeleport(); // tell the server this jump is legit
  ensureAround(player.pos.x, player.pos.z);
  deathScreen.classList.remove('show');
  canvas.requestPointerLock();
});

// ---------------------------------------------------------------------------
// Game mode (survival / creative)

const modeBtn = document.getElementById('modeBtn');

function applyGameMode(mode, opts = {}) {
  if (mode !== 'creative' && mode !== 'survival') return;
  player.gameMode = mode;
  const creative = mode === 'creative';
  if (!creative) player.fly = false; // no flying in survival
  else player.burnT = 0;
  // creative hides the survival bars, like Minecraft
  heartsEl.style.display = creative ? 'none' : '';
  hungerEl.style.display = creative ? 'none' : '';
  armorbarEl.style.display = creative ? 'none' : '';
  modeBtn.textContent = creative ? '⚒ Режим: Творческий' : '⚒ Режим: Выживание';
  if (invOpen) renderInvScreen(); // swap recipes <-> block palette
  if (!opts.silent) {
    toast(creative ? 'Creative mode — F to fly, E for all blocks' : 'Survival mode', 3);
    save();
  }
}

modeBtn.addEventListener('click', () => {
  applyGameMode(isCreative() ? 'survival' : 'creative');
});

// ---------------------------------------------------------------------------
// Inventory & crafting screen (Minecraft Java-style slot interactions)

let invOpen = false;
let invMode = 'inv';          // 'inv' (2x2) | 'table' (3x3) | 'furnace'
let craftSize = 2;            // 2 = inventory grid, 3 = crafting table
let hoveredSlot = null;       // {area:'inv'|'craft'|'armor'|'furn', idx}
let paint = null;             // drag-paint session {btn, locs:[{area,idx}], keys:Set}
let lastPickup = { key: null, t: 0 }; // double-click tracking
const slotEls = new Map();    // slotKey -> element (for paint highlights)

const slotKey = (area, idx) => area + ':' + idx;

let dropSeq = 0;
// spawn a drop and (in MP) broadcast it so friends see it too
function netDrop(id, n, x, y, z, opts) {
  const es = drops.spawn(id, n, x, y, z, opts);
  if (net.online && es) {
    for (const e of es) {
      e.nid = net.myId + 's' + (net.sess || 0) + ':' + (dropSeq++);
      net.sendDrop(e.nid, e.id, e.n, e.pos.x, e.pos.y, e.pos.z, e.vel.x, e.vel.y, e.vel.z, e.dmg || 0, e.tag || null);
    }
  }
  return es;
}
function dropStacks(stacks) {
  if (!stacks || !stacks.length) return;
  const eye = player.eye();
  const dir = player.forwardDir();
  for (const s of stacks) {
    if (s && s.n > 0) netDrop(s.id, s.n, eye.x + dir.x * 0.4, eye.y - 0.3, eye.z + dir.z * 0.4, { stack: true, throwDir: dir, dmg: s.d || 0, tag: s.tag || null });
  }
}

function throwFromSlot(area, idx, all) {
  const s = inventory.get(area, idx);
  if (!s) return;
  const take = inventory.takeFrom(area, idx, all ? s.n : 1);
  if (take) { dropStacks([take]); sfx.pop(); }
}

// basic loot for untouched village chests, seeded by position
function fillChestLoot(state, key) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (Math.imul(h, 31) + key.charCodeAt(i)) | 0;
  const rand = mulberry32(h ^ world.seed);
  const table = [
    [I.APPLE, 1, 3, 1], [I.COAL, 2, 5, 1], [I.IRON_INGOT, 1, 3, 0.7],
    [I.STICK, 2, 6, 1], [B.PLANK, 2, 8, 1], [B.WOOL, 1, 3, 0.8],
    [B.TORCH, 3, 8, 0.9], [B.BRICKS, 2, 5, 0.4],
    [I.PORKCHOP, 1, 2, 0.6], [I.STRING, 1, 4, 0.6], [I.ENDER_PEARL, 1, 1, 0.15],
    [I.IRON_PICK, 1, 1, 0.12], [I.IRON_SWORD, 1, 1, 0.12],
  ];
  const stacks = 3 + Math.floor(rand() * 3);
  for (let i = 0; i < stacks; i++) {
    const [id, min, max, chance] = table[Math.floor(rand() * table.length)];
    if (rand() > chance) continue;
    const slot = Math.floor(rand() * 27);
    if (!state.slots[slot]) state.slots[slot] = { id, n: min + Math.floor(rand() * (max - min + 1)) };
  }
}

function openInventory(mode = 'inv', contKey = null, contPos = null) {
  if (player.dead) return;
  if (mode === true) mode = 'table'; // legacy callers
  invOpen = true;
  invMode = mode;
  craftSize = mode === 'table' ? 3 : 2;
  inventory.container = null;
  if (mode === 'furnace') {
    inventory.container = furnaces.get(contKey, true);
  } else if (mode === 'chest') {
    const [state, isNew] = chests.get(contKey, true);
    // worldgen chests (not placed by the player) start with loot
    if (isNew && contPos && !world.hasEdit(contPos.x, contPos.y, contPos.z)) {
      fillChestLoot(state, contKey);
    }
    inventory.container = state;
  } else if (mode === 'shulker') {
    const [state] = shulkers.get(contKey, true);
    state.shulker = true; // nesting guard: no shulker inside a shulker
    inventory.container = state;
  } else if (mode === 'dispenser' || mode === 'dropper' || mode === 'hopper') {
    const store = mode === 'dispenser' ? dispensers : mode === 'dropper' ? droppers : hoppers;
    const [state] = store.get(contKey, true);
    inventory.container = state;
  }
  invScreen.classList.add('show');
  if (mode === 'chest' || mode === 'shulker' || mode === 'dispenser' || mode === 'dropper' || mode === 'hopper') sfx.chest(); else sfx.click();
  renderInvScreen();
  if (locked) document.exitPointerLock();
}

function closeInventory(relock = true) {
  if (!invOpen) return;
  // crafting grid + cursor go back to the inventory; drop what doesn't fit
  dropStacks(inventory.returnAll());
  inventory.container = null;
  invOpen = false;
  paint = null;
  hoveredSlot = null;
  invScreen.classList.remove('show');
  sfx.click();
  if (relock && started && !player.dead) canvas.requestPointerLock();
}

document.getElementById('invClose').addEventListener('click', () => closeInventory());

// --- crafting result -------------------------------------------------------

function currentRecipe() {
  return matchGrid(inventory.craft.map(c => (c ? c.id : null)), 3);
}

function consumeGridOnce() {
  for (let i = 0; i < 9; i++) {
    const s = inventory.craft[i];
    if (s) { s.n--; if (!s.n) inventory.craft[i] = null; }
  }
}

// Take the crafting result. shift = craft as many as possible into inventory.
function takeResult(shift) {
  let r = currentRecipe();
  if (!r) return false;
  if (shift) {
    let safety = 0;
    while (r && safety++ < 64) {
      const left = inventory.add(r.out, r.n);
      consumeGridOnce();
      if (left > 0) { dropStacks([{ id: r.out, n: left }]); break; }
      r = currentRecipe();
    }
  } else {
    const c = inventory.cursor;
    if (!c) inventory.cursor = { id: r.out, n: r.n };
    else if (c.id === r.out && c.n + r.n <= maxStack(r.out)) c.n += r.n;
    else return false;
    consumeGridOnce();
  }
  sfx.craft();
  inventory._c();
  return true;
}

// Recipe helper list: move real ingredients from the inventory into the grid.
function autofillRecipe(r) {
  if (r.needsTable && craftSize < 3) {
    toast('Needs a crafting table (craft one, place it, right-click it)', 2.5);
    return;
  }
  for (const [id, n] of r.in) {
    if (inventory.count(id) < n) { toast('Not enough materials', 1.2); return; }
  }
  dropStacks(inventory.returnAll()); // clear the grid first
  if (r.pattern) {
    for (let rr = 0; rr < r.pattern.length; rr++) {
      for (let cc = 0; cc < r.pattern[rr].length; cc++) {
        const id = r.pattern[rr][cc];
        if (id != null && inventory.consume(id, 1)) inventory.craft[rr * 3 + cc] = { id, n: 1 };
      }
    }
  } else {
    r.shapeless.forEach((id, i) => {
      if (inventory.consume(id, 1))
        inventory.craft[Math.floor(i / craftSize) * 3 + (i % craftSize)] = { id, n: 1 };
    });
  }
  inventory._c();
}

// --- slot mouse interactions -------------------------------------------------

function canPaintInto(area, idx) {
  const c = inventory.cursor;
  if (!c) return false;
  const s = inventory.get(area, idx);
  return !s || (s.id === c.id && s.n < maxStack(s.id));
}

function paintRightPlace(area, idx) {
  const key = slotKey(area, idx);
  if (!paint || paint.keys.has(key) || !canPaintInto(area, idx)) return;
  paint.keys.add(key);
  inventory.rightClick(area, idx); // places exactly one
  if (!inventory.cursor) paint = null;
}

function onSlotMouseDown(e, area, idx) {
  e.preventDefault();
  if (e.button === 0 || e.button === 2) sfx.click();
  if (e.button === 0) {
    if (e.shiftKey) { inventory.quickMove(area, idx); return; }
    const key = slotKey(area, idx);
    const now = performance.now();
    if (inventory.cursor && lastPickup.key === key && now - lastPickup.t < 300) {
      inventory.collectAll(); // double-click: gather all matching
      lastPickup.key = null;
      return;
    }
    if (!inventory.cursor) {
      inventory.leftClick(area, idx); // pick up the stack
      lastPickup = { key, t: now };
    } else {
      // holding a stack: start a paint/drag session, finalized on mouseup
      paint = { btn: 0, locs: [], keys: new Set() };
      addPaintSlot(area, idx);
    }
  } else if (e.button === 2) {
    if (!inventory.cursor) {
      inventory.rightClick(area, idx); // pick up half
    } else {
      paint = { btn: 2, locs: [], keys: new Set() };
      paintRightPlace(area, idx); // place one per slot crossed
    }
  }
}

function addPaintSlot(area, idx) {
  const key = slotKey(area, idx);
  if (!paint || paint.keys.has(key) || !canPaintInto(area, idx)) return;
  paint.keys.add(key);
  paint.locs.push({ area, idx });
  const el = slotEls.get(key);
  if (el) el.classList.add('painting');
}

function onSlotMouseEnter(area, idx) {
  hoveredSlot = { area, idx };
  updateTooltip();
  if (!paint) return;
  if (paint.btn === 2) paintRightPlace(area, idx);
  else addPaintSlot(area, idx);
}

function finalizePaint() {
  if (!paint) return;
  const p = paint;
  paint = null;
  if (p.btn !== 0 || !p.locs.length) { renderInvScreen(); return; }
  const c = inventory.cursor;
  if (!c) return;
  if (p.locs.length === 1) {
    // plain click: place all / merge / swap
    inventory.leftClick(p.locs[0].area, p.locs[0].idx);
    return;
  }
  // left-drag: distribute the stack evenly across painted slots
  const per = Math.floor(c.n / p.locs.length);
  if (per > 0) {
    for (const l of p.locs) {
      if (!c.n) break;
      const s = inventory.get(l.area, l.idx);
      const cap = s ? maxStack(c.id) - s.n : maxStack(c.id);
      const put = Math.min(per, cap, c.n);
      if (put <= 0) continue;
      if (s) s.n += put;
      else inventory.set(l.area, l.idx, { id: c.id, n: put });
      c.n -= put;
    }
    if (!c.n) inventory.cursor = null;
  }
  inventory._c();
}
document.addEventListener('mouseup', finalizePaint);

// click the dark backdrop with a held stack: drop it into the world
invScreen.addEventListener('mousedown', (e) => {
  if (e.target !== invScreen || !inventory.cursor) return;
  const c = inventory.cursor;
  if (e.button === 0) {
    inventory.cursor = null;
    dropStacks([c]);
  } else if (e.button === 2) {
    c.n--;
    dropStacks([{ id: c.id, n: 1 }]);
    if (!c.n) inventory.cursor = null;
  }
  inventory._c();
});

// cursor stack + tooltip follow the mouse
invScreen.addEventListener('mousemove', (e) => {
  cursorStackEl.style.left = (e.clientX - 20) + 'px';
  cursorStackEl.style.top = (e.clientY - 20) + 'px';
  tooltipEl.style.left = (e.clientX + 16) + 'px';
  tooltipEl.style.top = (e.clientY - 24) + 'px';
});

function updateTooltip() {
  const s = hoveredSlot ? inventory.get(hoveredSlot.area, hoveredSlot.idx) : null;
  if (s && !inventory.cursor) {
    tooltipEl.textContent = ITEMS[s.id].name;
    tooltipEl.style.display = 'block';
  } else {
    tooltipEl.style.display = 'none';
  }
}

function renderCursorStack() {
  const c = inventory.cursor;
  if (c) {
    cursorStackEl.innerHTML = '';
    cursorStackEl.appendChild(iconCanvasFor(c.id, 40));
    if (c.n > 1) {
      const cnt = document.createElement('span');
      cnt.className = 'cnt';
      cnt.textContent = c.n;
      cursorStackEl.appendChild(cnt);
    }
    cursorStackEl.style.display = 'block';
  } else {
    cursorStackEl.style.display = 'none';
  }
}

// --- rendering ---------------------------------------------------------------

function makeSlotEl(area, idx) {
  const s = inventory.get(area, idx);
  const el = document.createElement('div');
  el.className = 'inv-slot';
  if (s) {
    el.appendChild(iconCanvasFor(s.id, 36));
    durabilityBar(el, s);
    if (s.n > 1) {
      const cnt = document.createElement('span');
      cnt.className = 'cnt';
      cnt.textContent = s.n;
      el.appendChild(cnt);
    }
  }
  el.addEventListener('mousedown', (e) => onSlotMouseDown(e, area, idx));
  el.addEventListener('mouseenter', () => onSlotMouseEnter(area, idx));
  el.addEventListener('mouseleave', () => { hoveredSlot = null; updateTooltip(); });
  slotEls.set(slotKey(area, idx), el);
  return el;
}

function renderInvScreen() {
  slotEls.clear();

  const furnaceMode = invMode === 'furnace';
  const chestMode = invMode === 'chest' || invMode === 'shulker' || invMode === 'dispenser' || invMode === 'dropper' || invMode === 'hopper';
  craftAreaEl.style.display = (furnaceMode || chestMode) ? 'none' : 'flex';
  furnacePanelEl.style.display = furnaceMode ? 'flex' : 'none';
  chestPanelEl.style.display = chestMode ? 'grid' : 'none';
  if (recipesColEl) recipesColEl.style.display = (furnaceMode || chestMode) ? 'none' : '';
  if (playerRowEl) playerRowEl.style.display = (furnaceMode || chestMode) ? 'none' : 'flex';

  if (chestMode) {
    craftTitleEl.textContent = invMode === 'shulker' ? 'Shulker Box' : invMode === 'dispenser' ? 'Dispenser' : invMode === 'dropper' ? 'Dropper' : invMode === 'hopper' ? 'Hopper' : 'Chest';
    chestPanelEl.innerHTML = '';
    for (let i = 0; i < (inventory.container ? inventory.container.slots.length : 27); i++) chestPanelEl.appendChild(makeSlotEl('furn', i));
  } else if (furnaceMode) {
    craftTitleEl.textContent = 'Furnace';
    furnInEl.innerHTML = ''; furnFuelEl.innerHTML = ''; furnOutEl.innerHTML = '';
    furnInEl.appendChild(makeSlotEl('furn', 0));
    furnFuelEl.appendChild(makeSlotEl('furn', 1));
    const outSlot = makeSlotEl('furn', 2);
    outSlot.classList.add('out');
    furnOutEl.appendChild(outSlot);
    updateFurnaceBars();
  } else {
    // crafting grid
    craftTitleEl.textContent = craftSize === 3 ? 'Crafting Table (3×3)' : 'Crafting (2×2)';
    craftGridEl.style.display = 'grid';
    craftGridEl.style.gap = '4px';
    craftGridEl.style.gridTemplateColumns = `repeat(${craftSize}, 42px)`;
    craftGridEl.innerHTML = '';
    for (let rr = 0; rr < craftSize; rr++)
      for (let cc = 0; cc < craftSize; cc++)
        craftGridEl.appendChild(makeSlotEl('craft', rr * 3 + cc));

    // result slot
    const r = currentRecipe();
    craftOutEl.innerHTML = '';
    craftOutEl.className = 'inv-slot out' + (r ? '' : ' empty');
    if (r) {
      craftOutEl.appendChild(iconCanvasFor(r.out, 44));
      if (r.n > 1) {
        const cnt = document.createElement('span');
        cnt.className = 'cnt';
        cnt.textContent = r.n;
        craftOutEl.appendChild(cnt);
      }
      craftOutEl.title = ITEMS[r.out].name + ' — shift-click to craft all';
    }
    craftOutEl.onmousedown = (e) => {
      e.preventDefault();
      if (e.button === 0) takeResult(e.shiftKey);
    };
  }

  // armor slots
  armorRowEl.innerHTML = '';
  const armorPh = ['helm', 'chest', 'legs', 'boots'];
  for (let i = 0; i < 4; i++) {
    const el = makeSlotEl('armor', i);
    if (!inventory.armor[i]) {
      el.classList.add('armor-empty');
      el.dataset.ph = armorPh[i];
    }
    armorRowEl.appendChild(el);
  }

  // main inventory + hotbar rows
  invMainEl.innerHTML = '';
  for (let i = 9; i < 36; i++) invMainEl.appendChild(makeSlotEl('inv', i));
  invHotbarRowEl.innerHTML = '';
  for (let i = 0; i < 9; i++) invHotbarRowEl.appendChild(makeSlotEl('inv', i));

  // right column: creative block palette, or the recipe reference list
  craftList.innerHTML = '';
  craftList.classList.toggle('palette', isCreative());
  if (isCreative()) {
    recipesTitleEl.innerHTML = 'All Blocks &amp; Items <span class="tip">click = stack · right = one · shift = to inventory</span>';
    renderPalette();
  } else {
    if (paletteTabsEl) paletteTabsEl.style.display = 'none';
    recipesTitleEl.innerHTML = 'Recipes <span class="tip">click one to fill the grid</span>';
    for (const rec of RECIPES) {
      const ok = rec.in.every(([id, n]) => inventory.count(id) >= n);
      const row = document.createElement('div');
      row.className = 'craft-row' + (ok ? '' : ' locked');
      row.appendChild(iconCanvasFor(rec.out, 30));
      const name = document.createElement('span');
      name.className = 'c-name';
      name.innerHTML = ITEMS[rec.out].name + (rec.n > 1 ? ` ×${rec.n}` : '') +
        (rec.needsTable ? ' <span class="tag-table">table</span>' : '');
      row.appendChild(name);
      const ins = document.createElement('span');
      ins.className = 'c-in';
      ins.innerHTML = rec.in.map(([id, n]) =>
        `<span class="${inventory.count(id) >= n ? 'have' : 'miss'}">${n}× ${ITEMS[id].name}</span>`
      ).join(' + ');
      row.appendChild(ins);
      row.addEventListener('mousedown', (e) => { if (e.button === 0) autofillRecipe(rec); });
      craftList.appendChild(row);
    }
  }

  renderCursorStack();
  updateTooltip();
}

// --- creative palette: every block & item, free of charge ------------------

// creative palette categories
const PALETTE_CATS = [['all', 'All'], ['blocks', 'Blocks'], ['deco', 'Deco'], ['gear', 'Gear'], ['food', 'Food'], ['items', 'Items']];
let paletteFilter = 'all';
const DECO_IDS = new Set([
  B.TORCH, B.POPPY, B.DANDELION, B.BLUE_ORCHID, B.ALLIUM, B.CACTUS,
  B.FENCE, B.GLASS_PANE, B.LADDER, B.DOOR, B.BED, B.CHEST,
  B.CRAFTING_TABLE, B.FURNACE, B.BOOKSHELF, B.JUKEBOX, B.NOTE_BLOCK,
  B.ENCHANT_TABLE, B.PUMPKIN, B.MELON, B.JACK_O_LANTERN, B.COBWEB, B.TNT, B.HAY,
  B.IRON_BARS, B.SEA_LANTERN, B.AMETHYST, B.TINTED_GLASS, B.BONE_BLOCK,
  B.REDSTONE_DUST, B.RTORCH, B.LEVER, B.BUTTON, B.PLATE, B.LAMP, B.SENSOR, B.SHULKER_BOX,
  B.REPEATER, B.COMPARATOR, B.OBSERVER, B.PISTON, B.STICKY_PISTON,
  B.DISPENSER, B.DROPPER, B.HOPPER, B.BULB, B.TARGET,
]);
function categoryOf(id) {
  const it = ITEMS[id];
  if (!it) return 'items';
  if (it.kind === 'food') return 'food';
  if (it.kind === 'tool' || it.kind === 'armor' || it.kind === 'bow') return 'gear';
  if (it.kind !== 'block') return 'items';
  const base = (BLOCKS[id] && BLOCKS[id].item) || id;
  return DECO_IDS.has(base) ? 'deco' : 'blocks';
}

const PALETTE_IDS = Object.keys(ITEMS).map(Number).sort((a, b) => a - b);

function paletteTip(el, text) {
  el.addEventListener('mouseenter', () => {
    tooltipEl.textContent = text;
    tooltipEl.style.display = 'block';
  });
  el.addEventListener('mouseleave', () => updateTooltip());
}

function paletteClick(e, id) {
  e.preventDefault();
  const lim = maxStack(id);
  if (e.button === 0 && e.shiftKey) {
    const left = inventory.add(id, lim); // straight to the inventory
    if (left === lim) return; // full — nothing moved, skip the re-render
  } else if (e.button === 0) {
    inventory.cursor = { id, n: lim }; // grab a full stack
  } else if (e.button === 2) {
    if (!inventory.cursor) inventory.cursor = { id, n: 1 };
    else if (inventory.cursor.id === id) inventory.cursor.n = Math.min(lim, inventory.cursor.n + 1);
    else return;
  } else {
    return;
  }
  sfx.pop();
  inventory._c();
}

function renderPalette() {
  if (paletteTabsEl) {
    paletteTabsEl.style.display = 'flex';
    paletteTabsEl.innerHTML = '';
    for (const [key, label] of PALETTE_CATS) {
      const t = document.createElement('div');
      t.className = 'ptab' + (paletteFilter === key ? ' sel' : '');
      t.textContent = label;
      t.addEventListener('mousedown', (e) => { e.preventDefault(); paletteFilter = key; sfx.click(); renderInvScreen(); });
      paletteTabsEl.appendChild(t);
    }
  }
  const trash = document.createElement('div');
  trash.className = 'inv-slot trash';
  trash.textContent = '✕';
  paletteTip(trash, 'Destroy the held stack');
  trash.addEventListener('mousedown', (e) => {
    e.preventDefault();
    if (!inventory.cursor) return;
    inventory.cursor = null;
    sfx.break();
    inventory._c();
  });
  craftList.appendChild(trash);

  for (const id of PALETTE_IDS) {
    if (paletteFilter !== 'all' && categoryOf(id) !== paletteFilter) continue;
    const el = document.createElement('div');
    el.className = 'inv-slot';
    el.appendChild(iconCanvasFor(id, 36));
    paletteTip(el, ITEMS[id].name);
    el.addEventListener('mousedown', (e) => paletteClick(e, id));
    craftList.appendChild(el);
  }
}

// --- inventory player preview (little 3D Steve, drag to rotate) --------------
let pvRenderer = null, pvScene = null, pvCam = null, pvModel = null;
let pvYaw = 0.7, pvCamH = 1.15, pvArmorSig = '';
function initPlayerPreview() {
  const canvas = document.getElementById('playerCanvas');
  if (!canvas) return false;
  pvRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  pvRenderer.setSize(150, 190, false);
  pvRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  pvScene = new THREE.Scene();
  pvScene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 0.9));
  const dl = new THREE.DirectionalLight(0xffffff, 1.1);
  dl.position.set(2, 4, 3);
  pvScene.add(dl);
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(0.55, 24),
    new THREE.MeshBasicMaterial({ color: 0x14161c })
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.01;
  pvScene.add(disc);
  pvModel = buildPlayerModel();
  pvScene.add(pvModel.group);
  pvCam = new THREE.PerspectiveCamera(32, 150 / 190, 0.1, 20);
  let dragging = false, lx = 0, ly = 0;
  canvas.addEventListener('pointerdown', (e) => {
    dragging = true; lx = e.clientX; ly = e.clientY;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    pvYaw -= (e.clientX - lx) * 0.02;
    pvCamH = Math.max(0.3, Math.min(1.9, pvCamH + (e.clientY - ly) * 0.01));
    lx = e.clientX; ly = e.clientY;
  });
  const stop = () => { dragging = false; };
  canvas.addEventListener('pointerup', stop);
  canvas.addEventListener('pointercancel', stop);
  return true;
}
function renderPlayerPreview() {
  if (!pvRenderer && !initPlayerPreview()) return;
  pvModel.group.rotation.y = 0;
  posePlayer(pvModel, simTime * 1.6, 0.05, 99, false, { t: simTime }); // idle sway + breathe
  pvModel.group.position.y = Math.sin(simTime * 1.6) * 0.015;
  const sig = inventory.armor.map(s => (s ? ITEMS[s.id].matKey : '-')).join(',');
  if (sig !== pvArmorSig) {
    pvArmorSig = sig;
    pvModel.setArmor(inventory.armor.map(s => (s ? ITEMS[s.id].matKey : null)));
  }
  pvCam.position.set(Math.sin(pvYaw) * 2.7, pvCamH, Math.cos(pvYaw) * 2.7);
  pvCam.lookAt(0, 0.92, 0);
  pvRenderer.render(pvScene, pvCam);
}

inventory.onChange = () => {
  renderHotbar();
  updateHeldItem();
  player.armorPoints = inventory.armorPoints();
  if (invOpen) renderInvScreen();
};
player.armorPoints = inventory.armorPoints();

// ---------------------------------------------------------------------------
// Input

const keys = new Set();
let locked = false;
let started = false;
let forceStarted = false; // for automated testing without pointer lock
let firstStartHint = isNewPlayer;

function isLocked() { return locked || forceStarted; }

function startGame() {
  initAudio();
  if (prefs.music) music.start();
  showScreen('menuMain');
  try {
    const p = canvas.requestPointerLock();
    // Chrome blocks re-lock for ~1.5s after Esc: tell the player to click again
    if (p && p.catch) p.catch(() => toast('Нажмите ещё раз — браузер отпускает мышь с задержкой', 2.5));
  } catch (e) {
    toast('Не удалось захватить мышь — нажмите ещё раз', 2.5);
  }
}
document.getElementById('playBtn').addEventListener('click', startGame);

// Fullscreen + Keyboard Lock: in fullscreen the browser lets us capture
// shortcuts like Ctrl+W so sprinting can't close the tab.
const fullscreenBtn = document.getElementById('fullscreenBtn');
async function lockKeyboard() {
  try {
    if (navigator.keyboard && navigator.keyboard.lock) await navigator.keyboard.lock();
  } catch (e) { /* unsupported browser */ }
}
fullscreenBtn.addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch (e) { }
});
document.addEventListener('fullscreenchange', () => {
  if (document.fullscreenElement) {
    lockKeyboard();
    fullscreenBtn.textContent = '⛶ Exit Fullscreen';
  } else {
    if (navigator.keyboard && navigator.keyboard.unlock) navigator.keyboard.unlock();
    fullscreenBtn.textContent = '⛶ Fullscreen';
  }
});
const sensSlider = document.getElementById('sensSlider');
const sensVal = document.getElementById('sensVal');
const bobToggle = document.getElementById('bobToggle');
sensSlider.value = prefs.sens;
sensVal.textContent = prefs.sens + '%';
bobToggle.checked = prefs.bob;
sensSlider.addEventListener('input', () => {
  prefs.sens = +sensSlider.value;
  sensVal.textContent = prefs.sens + '%';
  applySensitivity();
  savePrefs();
});
bobToggle.addEventListener('change', () => {
  prefs.bob = bobToggle.checked;
  savePrefs();
});

// New World: two-click confirm (confirm() dialogs are unreliable in embedded
// browsers) + suppress further saves so beforeunload can't resurrect the world.
let wipeSave = false;
// (world creation moved to the Singleplayer screen)

// another tab hit New World: stop persisting this tab's (old) world
window.addEventListener('storage', (e) => {
  if (e.key === 'webcraft_wipe') wipeSave = true;
});

document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  if (locked) {
    started = true;
    overlay.classList.add('hidden');
    overlayTitle.textContent = 'ПАУЗА';
    const pb = document.getElementById('playBtn');
    pb.textContent = '▶ Продолжить';
    pb.style.display = 'block';
    if (firstStartHint) {
      firstStartHint = false;
      toast('Добудьте дерево — нажмите E для крафта!', 8);
    }
  } else {
    keys.clear();
    breakingHeld = placingHeld = false;
    if (!player.dead && !invOpen && !isChatOpen()) { showScreen('menuMain'); overlay.classList.remove('hidden'); }
  }
});

document.addEventListener('mousemove', (e) => {
  if (locked) player.look(e.movementX, e.movementY);
});

let lastSpaceDown = -1;
document.addEventListener('keydown', (e) => {
  if (isChatOpen()) return;
  if ((e.code === 'KeyT' || e.code === 'Enter' || e.code === 'Slash') && isLocked() && !invOpen && !player.dead) {
    e.preventDefault();
    openChat(e.code === 'Slash' ? '/' : '');
    return;
  }
  if (e.code === 'Tab' && isLocked() && !invOpen) { e.preventDefault(); showTabList(true); return; }
  if (invOpen) {
    if (e.code === 'KeyE' || e.code === 'Escape') {
      e.preventDefault();
      closeInventory();
    } else if (hoveredSlot && e.code.startsWith('Digit')) {
      const n = +e.code.slice(5);
      if (n >= 1 && n <= 9) {
        e.preventDefault();
        inventory.swapWithHotbar(hoveredSlot.area, hoveredSlot.idx, n - 1);
      }
    } else if (hoveredSlot && e.code === 'KeyQ') {
      e.preventDefault();
      throwFromSlot(hoveredSlot.area, hoveredSlot.idx, e.ctrlKey || e.metaKey);
    }
    return;
  }
  if (e.code === 'F5' || e.code === 'KeyV') {
    if (isLocked() && !invOpen && !player.dead) { e.preventDefault(); cycleCamera(); }
    return;
  }
  if (!isLocked()) return;
  e.preventDefault(); // with keyboard lock active, keep every shortcut in-game
  // with the keyboard locked (fullscreen), Esc reaches us instead of the browser
  if (e.code === 'Escape') { document.exitPointerLock(); return; }
  // double-tap Space toggles creative flight, like Minecraft
  if (e.code === 'Space' && !e.repeat) {
    const now = performance.now() / 1000;
    if (isCreative() && now - lastSpaceDown < 0.3) {
      player.fly = !player.fly;
      lastSpaceDown = -1; // consume the double-tap so a third press starts fresh
    } else {
      lastSpaceDown = now;
    }
  }
  keys.add(e.code);
  if (e.code === 'KeyF') {
    if (isCreative()) player.fly = !player.fly;
    else toast('Flying is creative-only', 1.2);
  }
  if (e.code === 'F3') debugEl.classList.toggle('show');
  if (e.code === 'KeyE') openInventory();
  if (e.code === 'KeyQ') throwFromSlot('inv', selected, e.ctrlKey || e.metaKey); // drop held item
  if (e.code.startsWith('Digit')) {
    const n = +e.code.slice(5);
    if (n >= 1 && n <= 9) setSelected(n - 1);
  }
});
document.addEventListener('keyup', (e) => {
  keys.delete(e.code);
  if (e.code === 'Tab') showTabList(false);
});
window.addEventListener('blur', () => { keys.clear(); breakingHeld = placingHeld = false; });

// non-passive so we can block Ctrl+scroll / pinch browser zoom while playing
document.addEventListener('wheel', (e) => {
  if (invOpen) {
    if (e.ctrlKey) e.preventDefault(); // no zoom, but keep panel scrolling
    return;
  }
  if (!isLocked()) return;
  e.preventDefault();
  setSelected(selected + (e.deltaY > 0 ? 1 : -1));
}, { passive: false });

document.addEventListener('contextmenu', (e) => e.preventDefault());

let breakingHeld = false, placingHeld = false;
let placeCd = 0;
canvas.addEventListener('mousedown', (e) => {
  if (!isLocked() || invOpen) return;
  if (e.button === 0) breakingHeld = true;
  if (e.button === 1) { e.preventDefault(); pickBlock(); }
  if (e.button === 2) { placingHeld = true; useHeld(); placeCd = 0.25; }
});
document.addEventListener('mouseup', (e) => {
  if (e.button === 0) breakingHeld = false;
  if (e.button === 2) placingHeld = false;
  // mouse side buttons would navigate back/forward and dump you out of the game
  if ((e.button === 3 || e.button === 4) && (isLocked() || invOpen)) e.preventDefault();
});
document.addEventListener('mousedown', (e) => {
  if ((e.button === 3 || e.button === 4) && (isLocked() || invOpen)) e.preventDefault();
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------------------
// Interaction: voxel raycast (Amanatides & Woo DDA)

function raycastVoxel(ox, oy, oz, dx, dy, dz, maxDist) {
  let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
  const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
  const tDX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  const tDZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;
  let tMX = dx !== 0 ? (dx > 0 ? (x + 1 - ox) : (ox - x)) * tDX : Infinity;
  let tMY = dy !== 0 ? (dy > 0 ? (y + 1 - oy) : (oy - y)) * tDY : Infinity;
  let tMZ = dz !== 0 ? (dz > 0 ? (z + 1 - oz) : (oz - z)) * tDZ : Infinity;
  let t = 0, fx = 0, fy = 0, fz = 0;

  while (t <= maxDist) {
    if (t > 0) {
      const b = world.getBlock(x, y, z);
      if (b !== B.AIR && b !== B.WATER && b !== B.LAVA) return { x, y, z, id: b, face: [fx, fy, fz], t };
    }
    if (tMX < tMY && tMX < tMZ) { x += stepX; t = tMX; tMX += tDX; fx = -stepX; fy = 0; fz = 0; }
    else if (tMY < tMZ) { y += stepY; t = tMY; tMY += tDY; fx = 0; fy = -stepY; fz = 0; }
    else { z += stepZ; t = tMZ; tMZ += tDZ; fx = 0; fy = 0; fz = -stepZ; }
  }
  return null;
}

function currentTarget() {
  const eye = player.eye();
  const dir = player.forwardDir();
  return raycastVoxel(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, REACH);
}

// ---------------------------------------------------------------------------
// Mining (hold to break), attacking, placing, eating

let mining = null; // {x,y,z,blockId,progress,total}
let punchCd = 0;
let miningParticleT = 0;
let creativeBreakCd = 0;

function stopMining() {
  mining = null;
  crackMesh.visible = false;
}

// one-block world: phased progression. oneblockPhase = total blocks broken
// (saved); the current phase is derived from it, so old saves keep working.
const ONEBLOCK_PHASES = [
  { icon: '\u{1F331}', name: 'Равнины', need: 30, reward: 'верстак', gift: [[B.CRAFTING_TABLE, 1]], mobs: ['pig'],
    pool: [[B.GRASS, 4], [B.DIRT, 3], [B.SAND, 1], [B.LOG, 2], [B.PLANK, 1], [B.LEAVES, 1]] },
  { icon: '\u{1F332}', name: 'Тайга', need: 40, reward: 'факелы ×8', gift: [[B.TORCH, 8]], mobs: ['chicken', 'chicken'],
    pool: [[B.LOG, 3], [B.SPRUCE_LOG, 2], [B.LEAVES, 3], [B.PLANK, 2], [B.DIRT, 1], [B.GRASS, 1]] },
  { icon: '\u26CF\uFE0F', name: 'Подземелье', need: 50, reward: 'печь', gift: [[B.FURNACE, 1]], mobs: ['sheep'],
    pool: [[B.STONE, 4], [B.COBBLE, 3], [B.COAL_ORE, 2], [B.GRAVEL, 2], [B.DIRT, 1]] },
  { icon: '\u{1FAA8}', name: 'Глубины', need: 60, reward: 'яблоки ×6', gift: [[I.APPLE, 6]], mobs: ['cow'],
    pool: [[B.STONE, 3], [B.COBBLE, 2], [B.COAL_ORE, 2], [B.IRON_ORE, 2], [B.GRAVEL, 1], [B.CLAY, 1]] },
  { icon: '\u{1F3DC}\uFE0F', name: 'Оазис', need: 50, reward: 'ведро воды', gift: [[I.WATER_BUCKET, 1]], mobs: ['sheep'],
    pool: [[B.SAND, 3], [B.SANDSTONE, 2], [B.CLAY, 2], [B.GRAVEL, 1], [B.DIRT, 1], [B.SUGAR_CANE, 1]] },
  { icon: '\u{1F525}', name: 'Недра', need: 60, reward: 'ведро лавы', gift: [[I.LAVA_BUCKET, 1]], mobs: ['zombie'],
    pool: [[B.NETHERRACK, 4], [B.GLOWSTONE, 2], [B.QUARTZ_ORE, 2], [B.MAGMA, 1], [B.GRAVEL, 1]] },
  { icon: '\u{1F48E}', name: 'Сокровища', need: 80, reward: 'золотое яблоко', gift: [[I.GOLDEN_APPLE, 1]], mobs: ['skeleton'],
    pool: [[B.STONE, 2], [B.COAL_ORE, 1], [B.IRON_ORE, 2], [B.GOLD_ORE, 2], [B.LAPIS_ORE, 1], [B.REDSTONE_ORE, 1], [B.DIAMOND_ORE, 1]] },
  { icon: '\u{1F30C}', name: 'Край', need: 80, reward: 'жемчуг Края ×2', gift: [[I.ENDER_PEARL, 2]], mobs: ['slime'],
    pool: [[B.END_STONE, 4], [B.STONE, 2], [B.GLOWSTONE, 2], [B.GOLD_ORE, 1], [B.EMERALD_ORE, 1], [B.DIAMOND_ORE, 1]] },
  { icon: '\u267E\uFE0F', name: 'Бесконечность', need: Infinity, reward: 'алмазы ×2', gift: [[I.DIAMOND, 2]], mobs: null,
    pool: [[B.DIAMOND_ORE, 1], [B.GOLD_ORE, 2], [B.IRON_ORE, 3], [B.COAL_ORE, 2], [B.LAPIS_ORE, 1],
           [B.REDSTONE_ORE, 1], [B.EMERALD_ORE, 1], [B.QUARTZ_ORE, 1], [B.STONE, 2], [B.LOG, 1],
           [B.GLOWSTONE, 1], [B.END_STONE, 1]] },
];

// -> { i, ph, inPhase }: phase index, phase def, blocks broken within it
function oneblockState(total) {
  let acc = 0;
  for (let i = 0; i < ONEBLOCK_PHASES.length; i++) {
    const ph = ONEBLOCK_PHASES[i];
    if (!isFinite(ph.need) || total < acc + ph.need) return { i, ph, inPhase: total - acc };
    acc += ph.need;
  }
  const i = ONEBLOCK_PHASES.length - 1; // unreachable (last phase is endless)
  return { i, ph: ONEBLOCK_PHASES[i], inPhase: 0 };
}

function oneblockPick(ph) {
  let sum = 0;
  for (const [, w] of ph.pool) sum += w;
  let r = Math.random() * sum;
  for (const [id, w] of ph.pool) { r -= w; if (r <= 0) return id; }
  return ph.pool[0][0];
}

// phase-up rewards: gift items + guest mobs on the platform
function oneblockReward(st, milestone = false) {
  for (const [id, n] of st.ph.gift) drops.spawn(id, n, 0.5, 64.6, 0.5, { stack: true });
  let mobNote = '';
  const guests = st.ph.mobs || (st.i >= ONEBLOCK_PHASES.length - 1
    ? [['pig', 'sheep', 'cow', 'chicken'][(Math.random() * 4) | 0]] : []);
  for (const t of guests) {
    try { mobs.forceSpawn(t, 1.5 + Math.random() * 2, 63.15, 1.5 + Math.random() * 2); } catch (e) {}
    mobNote = (t === 'zombie' || t === 'skeleton') ? ' \u26A0\uFE0F осторожно, монстр!' : ' + гость \u{1F43E}';
  }
  toast(milestone ? `${st.ph.icon} Бесконечность: всего ${oneblockPhase}! Награда: ${st.ph.reward}${mobNote}`
                  : `${st.ph.icon} Новая фаза: ${st.ph.name}! Награда: ${st.ph.reward}${mobNote}`, 3.5);
}

// per-frame one-block upkeep: void rescue + infinite-block guard + HUD
let obHudT = 0;
function oneblockTick(dt) {
  if (dim !== 'overworld' || world.gen !== 'oneblock') {
    if (obHudEl.style.display !== 'none') obHudEl.style.display = 'none';
    return;
  }
  // fell into the void: bounce back onto the island instead of dying
  if (!player.dead && !isCreative() && player.pos.y < -10) {
    player.pos.x = 0.5; player.pos.y = 64.1; player.pos.z = 0.5;
    player.vel.x = 0; player.vel.y = 0; player.vel.z = 0;
    player.damage(4, simTime, 'void');
    toast('\u{1F573}\uFE0F Пустота выплюнула тебя обратно на остров!', 2.5);
  }
  // the infinite block must never stay gone (explosions, edge cases)
  if (world.getBlock(0, 63, 0) === B.AIR) {
    world.setBlock(0, 63, 0, oneblockPick(oneblockState(oneblockPhase).ph));
  }
  obHudT -= dt;
  if (obHudT <= 0) {
    obHudT = 0.25;
    const st = oneblockState(oneblockPhase);
    obHudEl.style.display = 'block';
    obHudEl.textContent = isFinite(st.ph.need)
      ? `${st.ph.icon} ${st.ph.name} · ${st.inPhase}/${st.ph.need}`
      : `${st.ph.icon} ${st.ph.name} · всего ${oneblockPhase}`;
  }
}

function finishBreak(hit, info) {
  if (spawnGuard(hit.x, hit.z)) { stopMining(); return; } // spawn safe zone
  // one-block safety platform is indestructible (expand with placed blocks)
  if (dim === 'overworld' && world.gen === 'oneblock' && !isCreative()
      && hit.y === 62 && hit.x >= 0 && hit.x <= 4 && hit.z >= 0 && hit.z <= 4) {
    toast('Платформа неразрушаема — копай верхний блок!', 2);
    stopMining();
    return;
  }
  if (info.canHarvest && !isCreative()) { // creative breaks drop nothing
    const d = info.drop(Math.random());
    if (d) drops.spawn(d[0], d[1], hit.x + 0.5, hit.y + 0.35, hit.z + 0.5);
  }
  // broken containers spill their contents
  if (hit.id === B.FURNACE) {
    for (const s of furnaces.breakAt(dimPrefix() + furnaces.key(hit.x, hit.y, hit.z))) {
      drops.spawn(s.id, s.n, hit.x + 0.5, hit.y + 0.5, hit.z + 0.5, { stack: true, dmg: s.d || 0 });
    }
  }
  if (hit.id === B.CHEST) {
    const ck = dimPrefix() + chests.key(hit.x, hit.y, hit.z);
    let spill = chests.breakAt(ck);
    if (!spill.length && !world.hasEdit(hit.x, hit.y, hit.z)) {
      // never-opened village chest: roll its loot so breaking doesn't waste it
      const tmp = { slots: new Array(27).fill(null) };
      fillChestLoot(tmp, ck);
      spill = tmp.slots.filter(Boolean);
    }
    for (const s of spill) {
      drops.spawn(s.id, s.n, hit.x + 0.5, hit.y + 0.5, hit.z + 0.5, { stack: true, dmg: s.d || 0 });
    }
  }
  if (hit.id === B.SHULKER_BOX) {
    // shulker boxes keep their contents when broken (Minecraft)
    const sk = dimPrefix() + chests.key(hit.x, hit.y, hit.z);
    const [st] = shulkers.get(sk);
    shulkers.breakAt(sk);
    if (!isCreative()) {
      drops.spawn(B.SHULKER_BOX, 1, hit.x + 0.5, hit.y + 0.5, hit.z + 0.5,
        { stack: true, tag: { slots: (st ? st.slots : []).map(encSlot) } });
    }
  }
  // piston heads break together with their base (Minecraft drops the base)
  if (hit.id === B.PISTON_HEAD) {
    const st = world._rsData ? world._rsData.get(hit.x + ',' + hit.y + ',' + hit.z) : null;
    if (st && st.f != null) {
      const [dx, dy, dz] = DIRS6[st.f];
      const base = world.getBlock(hit.x - dx, hit.y - dy, hit.z - dz);
      if (base === B.PISTON || base === B.STICKY_PISTON) {
        world.setBlock(hit.x - dx, hit.y - dy, hit.z - dz, B.AIR);
        if (!isCreative()) drops.spawn(base, 1, hit.x + 0.5, hit.y + 0.5, hit.z + 0.5, { stack: true });
      }
    }
  }
  // broken machines spill their contents
  if (hit.id === B.DISPENSER || hit.id === B.DROPPER || hit.id === B.HOPPER) {
    const store = hit.id === B.DISPENSER ? dispensers : hit.id === B.DROPPER ? droppers : hoppers;
    for (const s of store.breakAt(dimPrefix() + chests.key(hit.x, hit.y, hit.z))) {
      drops.spawn(s.id, s.n, hit.x + 0.5, hit.y + 0.5, hit.z + 0.5, { stack: true, dmg: s.d || 0, tag: s.tag || null });
    }
  }
  player.exhaustion += 0.005;
  // ice melts back into water below sea level
  world.setBlock(hit.x, hit.y, hit.z, (hit.id === B.ICE && hit.y <= SEA) ? B.WATER : B.AIR);
  if (dim === 'overworld' && world.gen === 'oneblock' && hit.x === 0 && hit.y === 63 && hit.z === 0) {
    const before = oneblockState(oneblockPhase);
    if (!isCreative()) oneblockPhase++;
    const st = oneblockState(oneblockPhase);
    world.setBlock(0, 63, 0, oneblockPick(st.ph)); // respawns instantly
    if (!isCreative()) {
      if (st.i !== before.i) oneblockReward(st);
      else if (!isFinite(st.ph.need) && oneblockPhase % 100 === 0) oneblockReward(st, true);
      else if (isFinite(st.ph.need) && st.inPhase === st.ph.need - 10) {
        toast(`${st.ph.icon} ${st.ph.name}: осталось 10 блоков до новой фазы!`, 2.5);
      }
    }
    save();
  }
  // doors break as a pair (only the broken half drops)
  if (BLOCKS[hit.id].doorPart) {
    const oy = BLOCKS[hit.id].doorTop ? hit.y - 1 : hit.y + 1;
    const other = world.getBlock(hit.x, oy, hit.z);
    if (BLOCKS[other] && BLOCKS[other].doorPart) world.setBlock(hit.x, oy, hit.z, B.AIR);
  }
  // breaking the frame extinguishes attached portal blocks
  if (hit.id === B.OBSIDIAN) {
    const stack = DIRS6.map(d => [hit.x + d[0], hit.y + d[1], hit.z + d[2]]);
    let guard = 0;
    while (stack.length && guard++ < 300) {
      const [ax, ay, az] = stack.pop();
      if (world.getBlock(ax, ay, az) === B.PORTAL) {
        world.setBlock(ax, ay, az, B.AIR);
        for (const d of DIRS6) stack.push([ax + d[0], ay + d[1], az + d[2]]);
      }
    }
    dims[dim].portals = dims[dim].portals.filter(p => world.getBlock(p.x, p.y, p.z) === B.PORTAL);
  }
  liquidContact(hit.x, hit.y, hit.z); // freed water/lava may now touch
  if (hit.id === B.JUKEBOX) sfx.jukeboxStop();
  const c = avgColors[hit.id] || [0.5, 0.5, 0.5];
  particles.burst(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5, c, 14, 3.2);
  sfx.breakMat(materialOf(hit.id));
  damageHeld();
  stopMining();
}

function updateMining(dt) {
  punchCd -= dt;
  creativeBreakCd -= dt;
  if (!breakingHeld || player.dead || invOpen) { stopMining(); return; }

  const eye = player.eye();
  const dir = player.forwardDir();
  const mobHit = mobs.raycast(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, MOB_REACH);
  const hit = currentTarget();

  // Minecraft critical hits: attacking while falling deals 1.5x with sparks
  const attackDamage = () => {
    const base = itemDamage(heldId());
    const crit = !player.onGround && player.vel.y < 0 && !player.inWater && !player.fly;
    return { dmg: crit ? Math.round(base * 1.5) : base, crit };
  };
  const critFx = (x, y, z) => {
    particles.burst(x, y, z, [1, 0.85, 0.25], 12, 3.5);
    sfx.crit();
  };

  // attack mobs when the crosshair is on one
  if (mobHit && (!hit || mobHit.t < hit.t)) {
    stopMining();
    if (punchCd <= 0) {
      punchCd = 0.5;
      swingT = 0;
      player.exhaustion += 0.1;
      const { dmg, crit } = attackDamage();
      mobHit.mob.hurt(dmg, dir.x, dir.z, { player, world, particles });
      damageHeld();
      if (crit) critFx(mobHit.mob.pos.x, mobHit.mob.pos.y + mobHit.mob.height * 0.8, mobHit.mob.pos.z);
      else sfx.hit();
    }
    return;
  }
  // PvP: another player under the crosshair takes the hit instead of the block
  if (mpSession && net.online) {
    const pHit = raycastRemotePlayers(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, MOB_REACH);
    if (pHit && (!hit || pHit.t < hit.t)) {
      stopMining();
      if (punchCd <= 0) {
        punchCd = 0.5;
        swingT = 0;
        player.exhaustion += 0.1;
        const { dmg, crit } = attackDamage();
        net.sendHit(pHit.id, dmg, crit);
        dbgLastAttack = { kind: 'player', id: pHit.id, dmg, crit, t: +pHit.t.toFixed(2) };
        damageHeld();
        const g = pHit.r.group.position;
        particles.burst(g.x, g.y + 1.1, g.z, [0.85, 0.2, 0.2], 10, 3);
        if (crit) critFx(g.x, g.y + 1.1, g.z); else sfx.hit();
      }
      return;
    }
  }
  // the dragon is a huge target — check it before blocks
  if (dim === 'end' && dragon && !dragon.dead) {
    const dt2 = dragon.rayHit(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, MOB_REACH + 2);
    if (dt2 !== null && (!hit || dt2 < hit.t)) {
      stopMining();
      if (punchCd <= 0) {
        punchCd = 0.5;
        swingT = 0;
        player.exhaustion += 0.1;
        const { dmg, crit } = attackDamage();
        dragon.hurt(dmg, { particles });
        damageHeld();
        if (crit) critFx(dragon.pos.x, dragon.pos.y + 1, dragon.pos.z);
        else sfx.hit();
      }
      return;
    }
  }
  if (!hit) { stopMining(); return; }

  dbgLastAttack = { kind: 'block', id: hit.id };
  // creative: everything (even bedrock) breaks instantly
  if (isCreative()) {
    stopMining();
    if (creativeBreakCd <= 0) {
      creativeBreakCd = 0.22;
      swingT = 0;
      const info = breakInfo(hit.id, heldId());
      finishBreak(hit, info || { canHarvest: false, drop: () => null });
    }
    return;
  }

  const info = breakInfo(hit.id, heldId());
  if (!info) { stopMining(); return; } // bedrock etc.

  if (!mining || mining.x !== hit.x || mining.y !== hit.y || mining.z !== hit.z || mining.blockId !== hit.id) {
    mining = { x: hit.x, y: hit.y, z: hit.z, blockId: hit.id, progress: 0, total: info.time };
  }
  mining.progress += dt;

  if (swingT > 0.45) swingT = 0; // keep swinging while mining

  if (!info.canHarvest && info.needTool) {
    toast(`Needs a ${TIER_NAMES[Math.max(1, info.needTier)]} ${info.needTool} to drop items`, 0.4);
  }

  miningParticleT -= dt;
  if (miningParticleT <= 0) {
    miningParticleT = 0.18;
    const c = avgColors[hit.id] || [0.5, 0.5, 0.5];
    particles.burst(
      hit.x + 0.5 + hit.face[0] * 0.55,
      hit.y + 0.5 + hit.face[1] * 0.55,
      hit.z + 0.5 + hit.face[2] * 0.55,
      c, 2, 1.4
    );
    sfx.dig(materialOf(hit.id));
  }

  if (mining.progress >= mining.total) {
    finishBreak(hit, info);
    return;
  }
  const stage = Math.min(4, (mining.progress / mining.total * 5) | 0);
  crackMat.map = crackTextures[stage];
  crackMesh.visible = true;
  crackMesh.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
}

// consume one item from the selected hotbar slot, optionally replacing it
function consumeHeld(replacementId = null) {
  if (isCreative()) return; // creative items are infinite
  const slot = inventory.slots[selected];
  if (!slot) return;
  slot.n--;
  if (!slot.n) inventory.slots[selected] = null;
  if (replacementId != null) {
    const left = inventory.add(replacementId, 1);
    if (left > 0) dropStacks([{ id: replacementId, n: left }]);
  }
  inventory._c();
}

// DDA raycast that stops at the first liquid (for bucket scooping)
function liquidTarget() {
  const eye = player.eye();
  const d = player.forwardDir();
  let x = Math.floor(eye.x), y = Math.floor(eye.y), z = Math.floor(eye.z);
  const stepX = d.x > 0 ? 1 : -1, stepY = d.y > 0 ? 1 : -1, stepZ = d.z > 0 ? 1 : -1;
  const tDX = d.x !== 0 ? Math.abs(1 / d.x) : Infinity;
  const tDY = d.y !== 0 ? Math.abs(1 / d.y) : Infinity;
  const tDZ = d.z !== 0 ? Math.abs(1 / d.z) : Infinity;
  let tMX = d.x !== 0 ? (d.x > 0 ? (x + 1 - eye.x) : (eye.x - x)) * tDX : Infinity;
  let tMY = d.y !== 0 ? (d.y > 0 ? (y + 1 - eye.y) : (eye.y - y)) * tDY : Infinity;
  let tMZ = d.z !== 0 ? (d.z > 0 ? (z + 1 - eye.z) : (eye.z - z)) * tDZ : Infinity;
  let t = 0;
  while (t <= REACH) {
    const b = world.getBlock(x, y, z);
    if (t > 0) {
      if (b === B.WATER || b === B.LAVA) return { x, y, z, id: b };
      if (b !== B.AIR) return null; // solid block in the way
    }
    if (tMX < tMY && tMX < tMZ) { x += stepX; t = tMX; tMX += tDX; }
    else if (tMY < tMZ) { y += stepY; t = tMY; tMY += tDY; }
    else { z += stepZ; t = tMZ; tMZ += tDZ; }
  }
  return null;
}

const notePitches = new Map(); // note block pitch memory (per position)

function useHeld() {
  if (player.dead || invOpen) return;
  const hit = currentTarget();
  // interacting with a crafting table / furnace takes precedence
  if (hit && hit.t < 5) {
    if (hit.id === B.CRAFTING_TABLE) { placingHeld = false; openInventory('table'); return; }
    if (hit.id === B.FURNACE) {
      placingHeld = false;
      openInventory('furnace', dimPrefix() + furnaces.key(hit.x, hit.y, hit.z));
      return;
    }
    if (hit.id === B.CHEST) {
      placingHeld = false;
      openInventory('chest', dimPrefix() + chests.key(hit.x, hit.y, hit.z), { x: hit.x, y: hit.y, z: hit.z });
      return;
    }
    if (hit.id === B.LEVER || hit.id === B.LEVER_ON) {
      placingHeld = false;
      world.setBlock(hit.x, hit.y, hit.z, hit.id === B.LEVER ? B.LEVER_ON : B.LEVER);
      sfx.click();
      return;
    }
    if (hit.id === B.BUTTON || hit.id === B.BUTTON_ON) {
      placingHeld = false;
      if (hit.id === B.BUTTON) {
        world.setBlock(hit.x, hit.y, hit.z, B.BUTTON_ON);
        if (!world._rsButtons) world._rsButtons = new Map();
        world._rsButtons.set(hit.x + ',' + hit.y + ',' + hit.z, simTime + 1.2);
        sfx.click();
      }
      return;
    }
    if (hit.id === B.SHULKER_BOX) {
      placingHeld = false;
      openInventory('shulker', dimPrefix() + chests.key(hit.x, hit.y, hit.z), { x: hit.x, y: hit.y, z: hit.z });
      return;
    }
    if (BLOCKS[hit.id].doorPart) {
      placingHeld = false;
      const by = BLOCKS[hit.id].doorTop ? hit.y - 1 : hit.y;
      const bot = world.getBlock(hit.x, by, hit.z);
      const bblk = BLOCKS[bot];
      if (bblk && bblk.shape === 'door' && !bblk.doorTop) {
        world.setBlock(hit.x, by, hit.z, bblk.toggleId);
        const top = world.getBlock(hit.x, by + 1, hit.z);
        if (BLOCKS[top] && BLOCKS[top].doorTop) world.setBlock(hit.x, by + 1, hit.z, BLOCKS[top].toggleId);
        sfx.door();
      }
      return;
    }
    if (hit.id === B.BED) {
      placingHeld = false;
      if (dim !== 'overworld') { toast('You can only sleep in the overworld'); return; }
      player.spawn = { x: hit.x + 0.5, y: hit.y + 1.02, z: hit.z + 0.5 };
      if (daylight < 0.3) {
        setTimeOfDay(0.02); // dawn — and everyone else sees the sunrise too
        toast('You sleep through the night… spawn point set', 2.5);
        sfx.portal();
      } else {
        toast('Spawn point set — you can sleep here at night', 2);
        sfx.place();
      }
      save();
      return;
    }
    if (hit.id === B.DISPENSER) {
      placingHeld = false;
      openInventory('dispenser', dimPrefix() + chests.key(hit.x, hit.y, hit.z), { x: hit.x, y: hit.y, z: hit.z });
      return;
    }
    if (hit.id === B.DROPPER) {
      placingHeld = false;
      openInventory('dropper', dimPrefix() + chests.key(hit.x, hit.y, hit.z), { x: hit.x, y: hit.y, z: hit.z });
      return;
    }
    if (hit.id === B.HOPPER) {
      placingHeld = false;
      openInventory('hopper', dimPrefix() + chests.key(hit.x, hit.y, hit.z), { x: hit.x, y: hit.y, z: hit.z });
      return;
    }
    if (isRep(hit.id)) { // right-click cycles repeater delay 1..4 (slider nub moves)
      placingHeld = false;
      const k = hit.x + ',' + hit.y + ',' + hit.z;
      if (!world._rsData) world._rsData = new Map();
      const st = world._rsData.get(k) || {};
      st.d = (st.d || 1) % 4 + 1;
      world._rsData.set(k, st);
      world.setBlock(hit.x, hit.y, hit.z, hit.id); // same id: remesh only
      sfx.click();
      return;
    }
    if (isComp(hit.id)) { // right-click toggles comparator compare/subtract (front nub grows)
      placingHeld = false;
      const k = hit.x + ',' + hit.y + ',' + hit.z;
      if (!world._rsData) world._rsData = new Map();
      const st = world._rsData.get(k) || {};
      st.m = st.m ? 0 : 1;
      world._rsData.set(k, st);
      world.setBlock(hit.x, hit.y, hit.z, hit.id); // same id: remesh only
      if (world.rsUpdate) world.rsUpdate(hit.x, hit.y, hit.z);
      sfx.click();
      return;
    }
    if (hit.id === B.NOTE_BLOCK) {
      placingHeld = false;
      const k = dim + ':' + hit.x + ',' + hit.y + ',' + hit.z;
      const p = ((notePitches.get(k) ?? 11) + 1) % 25;
      notePitches.set(k, p);
      sfx.note(p);
      particles.burst(hit.x + 0.5, hit.y + 1.2, hit.z + 0.5, [0.3 + p / 25 * 0.7, 0.85, 1], 5, 1);
      return;
    }
    if (hit.id === B.JUKEBOX) {
      placingHeld = false;
      if (sfx.jukeboxPlaying()) { sfx.jukeboxStop(); toast('The music fades…', 1.2); }
      else { sfx.jukeboxStart(); toast('♪ Now playing: WebCraft Overture ♪', 3); }
      return;
    }
    if (hit.id === B.ENCHANT_TABLE) {
      placingHeld = false;
      sfx.note(12);
      setTimeout(() => sfx.note(19), 120);
      toast('The runes shimmer… (enchanting is not ready yet)', 2.2);
      return;
    }
  }
  const id = heldId();
  const it = ITEMS[id];
  if (!it) return;

  if (it.kind === 'structure') {
    placingHeld = false; // single-shot: holding RMB must not spam castles
    if (!hit) return;
    const bx = hit.x + hit.face[0], by = hit.y + hit.face[1], bz = hit.z + hit.face[2];
    if (by < 0 || by >= HEIGHT) return;
    if (spawnGuard(bx, bz)) return; // no structures inside the spawn zone
    swingT = 0;
    const n = pasteStructure(it.struct, bx, by, bz);
    if (n > 0) {
      consumeHeld();
      sfx.placeMat('wood');
      toast(`Построено: ${it.name} (${n} блоков)`, 2.5);
    }
    return;
  }
  if (it.kind === 'block') {
    if (!hit) return;
    const px = hit.x + hit.face[0], py = hit.y + hit.face[1], pz = hit.z + hit.face[2];
    if (py < 0 || py >= HEIGHT) return;
    if (spawnGuard(px, pz)) return;
    const existing = world.getBlock(px, py, pz);
    if (existing !== B.AIR && existing !== B.WATER && existing !== B.LAVA) return;
    // only solid blocks can't overlap entities (liquids can be placed at your feet)
    if (BLOCKS[id].solid && (blockOverlapsEntity(px, py, pz, player) || mobs.anyOverlapping(px, py, pz))) return;
    if (!world.hasDataAt(px, pz)) return;
    // torches, flowers and cacti need a solid block underneath
    if (BLOCKS[id].needSupport && !isSolid(world.getBlock(px, py - 1, pz))) return;
    // doors fill two cells: place the bottom + matching top, panel toward you
    if (BLOCKS[id].shape === 'door') {
      if (py + 1 >= HEIGHT) return;
      const above = world.getBlock(px, py + 1, pz);
      if (above !== B.AIR && above !== B.WATER) return;
      if (!isSolid(world.getBlock(px, py - 1, pz))) return;
      if (blockOverlapsEntity(px, py + 1, pz, player) || mobs.anyOverlapping(px, py + 1, pz)) return;
      const d = player.forwardDir();
      const f = Math.abs(d.x) > Math.abs(d.z) ? (d.x > 0 ? 2 : 0) : (d.z > 0 ? 3 : 1);
      swingT = 0;
      world.setBlock(px, py, pz, BLOCKS[id].facings[f]);
      world.setBlock(px, py + 1, pz, B.DOOR_TOP);
      consumeHeld();
      sfx.placeMat('wood');
      return;
    }
    let placeId = id;
    if (BLOCKS[id].shape === 'ladder') {
      // ladders hang on a solid wall: must click a side face
      if (hit.face[1] !== 0 || !isSolid(hit.id)) return;
      const fx = -hit.face[0], fz = -hit.face[2];
      placeId = BLOCKS[id].facings[fx > 0 ? 0 : fx < 0 ? 2 : fz > 0 ? 1 : 3];
    } else if (BLOCKS[id].facings) {
      // stairs: the high step lands on the far side, ascending away from you
      const d = player.forwardDir();
      placeId = BLOCKS[id].facings[Math.abs(d.x) > Math.abs(d.z) ? (d.x > 0 ? 0 : 2) : (d.z > 0 ? 1 : 3)];
    }
    swingT = 0;
    // redstone facing: repeaters/comparators pick a yaw variant, the rest use the facing map
    let faceData = null;
    if (id === B.REPEATER || id === B.COMPARATOR) {
      const d = player.forwardDir();
      placeId = id + (Math.abs(d.x) > Math.abs(d.z) ? (d.x > 0 ? 0 : 1) : (d.z > 0 ? 2 : 3));
    } else if (id === B.OBSERVER || id === B.PISTON || id === B.STICKY_PISTON || id === B.DISPENSER || id === B.DROPPER) {
      const o = [-hit.face[0], -hit.face[1], -hit.face[2]]; // face the player
      faceData = { f: DIRS6.findIndex((v) => v[0] === o[0] && v[1] === o[1] && v[2] === o[2]) };
    } else if (id === B.HOPPER) {
      const o = [-hit.face[0], -hit.face[1], -hit.face[2]]; // latch onto the clicked face
      let hf = DIRS6.findIndex((v) => v[0] === o[0] && v[1] === o[1] && v[2] === o[2]);
      if (hf === 2) hf = 3; // hoppers can't point up
      faceData = { f: hf };
    }
    const heldTag = id === B.SHULKER_BOX ? (inventory.slots[selected] || {}).tag : null;
    if (faceData && faceData.f >= 0) {
      if (!world._rsData) world._rsData = new Map();
      world._rsData.set(px + ',' + py + ',' + pz, faceData); // before setBlock so MP picks up `f`
    }
    world.setBlock(px, py, pz, placeId);
    if (id === B.SHULKER_BOX && heldTag && Array.isArray(heldTag.slots)) {
      const [st] = shulkers.get(dimPrefix() + chests.key(px, py, pz), true);
      st.slots = heldTag.slots.map(decSlot).concat(new Array(27).fill(null)).slice(0, 27);
    }
    if (id === B.OBSERVER) { // placed observers pulse once (Minecraft)
      if (!world._rsPend) world._rsPend = new Map();
      world._rsPend.set(px + ',' + py + ',' + pz, { at: world._rsNow || 0, kind: 'obsOn' });
    }
    consumeHeld();
    sfx.placeMat(materialOf(placeId));
    // creative-placed liquids still react with each other
    if (id === B.WATER || id === B.LAVA) liquidContact(px, py, pz);
  } else if (it.kind === 'food') {
    if (player.hunger >= 20) { toast('Not hungry'); return; }
    swingT = 0;
    eatT = 0;
    player.eat(it);
    consumeHeld(it.returns || null); // e.g. mushroom stew gives the bowl back
    sfx.eat();
  } else if (it.kind === 'bucket') {
    swingT = 0;
    if (it.liquid == null) {
      // empty bucket: scoop the liquid we're looking at
      const lt = liquidTarget();
      if (!lt) return;
      if (spawnGuard(lt.x, lt.z)) return;
      world.setBlock(lt.x, lt.y, lt.z, B.AIR);
      consumeHeld(lt.id === B.LAVA ? I.LAVA_BUCKET : I.WATER_BUCKET);
      sfx.splash();
    } else {
      // filled bucket: pour into the cell in front of the targeted face
      if (!hit) return;
      const px = hit.x + hit.face[0], py = hit.y + hit.face[1], pz = hit.z + hit.face[2];
      if (py < 0 || py >= HEIGHT || !world.hasDataAt(px, pz)) return;
      if (spawnGuard(px, pz)) return;
      const existing = world.getBlock(px, py, pz);
      if (existing !== B.AIR && existing !== B.WATER && existing !== B.LAVA) return;
      world.setBlock(px, py, pz, it.liquid === 'lava' ? B.LAVA : B.WATER);
      consumeHeld(I.BUCKET);
      sfx.splash();
      liquidContact(px, py, pz); // water + lava -> obsidian
    }
  } else if (it.kind === 'lighter') {
    if (!hit) return;
    swingT = 0;
    if (hit.id === B.TNT) {
      igniteTnt(hit.x, hit.y, hit.z);
      toast('The TNT hisses…', 1.2);
      return;
    }
    const lx = hit.x + hit.face[0], ly = hit.y + hit.face[1], lz = hit.z + hit.face[2];
    if (tryLightPortal(lx, ly, lz)) {
      sfx.portal();
      toast('The portal roars to life!', 2.5);
    } else {
      toast('Nothing to light — needs a sealed obsidian frame (2×3 inside)', 2);
    }
  } else if (it.kind === 'pearl') {
    swingT = 0;
    throwPearl();
    consumeHeld();
  } else if (it.kind === 'bow') {
    // arrows are ammo pulled from anywhere in the inventory (creative: infinite)
    if (!isCreative() && !inventory.consume(I.ARROW, 1)) {
      toast('No arrows — craft some from 3 sticks in a diagonal', 1.6);
      return;
    }
    swingT = 0;
    shootArrow();
    damageHeld();
  } else if (it.kind === 'eye') {
    // eyes of ender socket into End portal frames
    if (hit && hit.id === B.END_FRAME && hit.t < 5) {
      swingT = 0;
      world.setBlock(hit.x, hit.y, hit.z, B.END_FRAME_FILLED);
      consumeHeld();
      sfx.place();
      if (!checkEndPortalComplete(hit.x, hit.y, hit.z)) toast('The eye locks into the frame…', 1.4);
    } else {
      // the eye flies toward the stronghold
      if (dim !== 'overworld') { toast('The eye lies still — it seeks something in the overworld', 2); return; }
      swingT = 0;
      const sh = worldOver.stronghold;
      const dx = sh.x - player.pos.x, dz = sh.z - player.pos.z;
      const dist = Math.hypot(dx, dz);
      launchEyeFlight(dx, dz, dist);
      if (dist < 12) toast('The eye plunges downward — dig beneath you!', 2.5);
      else toast(`The eye streaks ${compassDir(dx, dz)} — about ${Math.round(dist)} blocks`, 2.5);
      sfx.pop();
    }
  }
}

function compassDir(dx, dz) {
  const dirs = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
  const a = (Math.atan2(dx, -dz) + Math.PI * 2) % (Math.PI * 2);
  return dirs[Math.round(a / (Math.PI / 4)) % 8];
}

// ---------------------------------------------------------------------------
// TNT: lit with flint & steel, sparks for 2 seconds, then explodes
// (chain-igniting any TNT caught in the blast)

const tntFuses = []; // {x, y, z, t, spark}

// redstone side-effects: TNT ignition, note plays, door/plate clicks
// --- redstone machines: dispensers, droppers, hoppers, target ----------------

const MECH_EDGE = new Map(); // "dim:x,y,z" -> last powered state (edge trigger)

function mechContAt(x, y, z) {
  // container state at a cell, or null (checks every container kind)
  const k = dimPrefix() + chests.key(x, y, z);
  const id = world.getBlock(x, y, z);
  if (id === B.FURNACE) { const st = furnaces.get(k); return st ? { state: st, pull: [2, 0, 1], push: [0, 1] } : null; }
  if (id === B.CHEST) { const r = chests.get(k); return r && r[0] ? { state: r[0] } : null; }
  if (id === B.SHULKER_BOX) { const r = shulkers.get(k); return r && r[0] ? { state: r[0] } : null; }
  if (id === B.DISPENSER) { const r = dispensers.get(k); return r && r[0] ? { state: r[0] } : null; }
  if (id === B.DROPPER) { const r = droppers.get(k); return r && r[0] ? { state: r[0] } : null; }
  if (id === B.HOPPER) { const r = hoppers.get(k); return r && r[0] ? { state: r[0] } : null; }
  return null;
}

function mechSameTag(a, b) {
  return (!a && !b) || (!!a && !!b && JSON.stringify(a) === JSON.stringify(b));
}

function mechPushInto(cont, item) {
  // insert a stack into the first fitting slot; returns leftover count
  const slots = cont.state.slots;
  const order = cont.push || slots.map((_, i) => i);
  const lim = maxStack(item.id);
  for (const i of order) {
    const s = slots[i];
    if (s && s.id === item.id && (s.d || 0) === (item.d || 0) && mechSameTag(s.tag, item.tag) && s.n < lim) {
      const t = Math.min(item.n, lim - s.n);
      s.n += t; item.n -= t;
      if (!item.n) return 0;
    }
  }
  for (const i of order) {
    if (!slots[i]) { slots[i] = { id: item.id, n: item.n, d: item.d || 0, tag: item.tag || null }; return 0; }
  }
  return item.n;
}

function mechTakeOne(cont) {
  const slots = cont.state.slots;
  const order = cont.pull || slots.map((_, i) => i);
  for (const i of order) {
    const s = slots[i];
    if (s && s.n > 0) {
      const out = { id: s.id, n: 1, d: s.d || 0, tag: s.tag || null };
      if (--s.n <= 0) slots[i] = null;
      return out;
    }
  }
  return null;
}

function mechFace(x, y, z, def = 3) {
  const st = world._rsData ? world._rsData.get(x + ',' + y + ',' + z) : null;
  return DIRS6[(st && st.f != null) ? st.f : def];
}

function mechTick() {
  if (!world._rsMech) return;
  for (const k of [...world._rsMech]) {
    const [x, y, z] = k.split(',').map(Number);
    const id = world.getBlock(x, y, z);
    if (id !== B.DISPENSER && id !== B.DROPPER && id !== B.HOPPER) { world._rsMech.delete(k); continue; }
    const pw = powerLevelAt(world, x, y, z) > 0;
    if (id === B.HOPPER) { if (!pw) hopperTransfer(x, y, z); continue; }
    const ek = dim + ':' + k;
    const was = MECH_EDGE.get(ek) || false;
    MECH_EDGE.set(ek, pw);
    if (pw && !was) {
      if (id === B.DISPENSER) fireDispenser(x, y, z);
      else fireDropper(x, y, z);
    }
  }
}

function hopperTransfer(x, y, z) {
  const [hst] = hoppers.get(dimPrefix() + chests.key(x, y, z), true);
  const hop = { state: hst };
  const [dx, dy, dz] = mechFace(x, y, z, 3);
  // push down-stream first, then pull from above (Minecraft order)
  const dst = mechContAt(x + dx, y + dy, z + dz);
  if (dst) {
    const item = mechTakeOne(hop);
    if (item) {
      if (world.getBlock(x + dx, y + dy, z + dz) === B.SHULKER_BOX && item.id === B.SHULKER_BOX) {
        mechPushInto(hop, item); // no nesting: put it back
      } else {
        const left = mechPushInto(dst, item);
        if (left > 0) { item.n = left; mechPushInto(hop, item); }
        else contDirty = true;
      }
    }
  }
  const src = mechContAt(x, y + 1, z);
  if (src) {
    const item = mechTakeOne(src);
    if (item) {
      const left = mechPushInto(hop, item);
      if (left > 0) { item.n = left; mechPushInto(src, item); }
      else contDirty = true;
    }
  }
}

function fireDispenser(x, y, z) {
  const [dx, dy, dz] = mechFace(x, y, z);
  const fx = x + dx, fy = y + dy, fz = z + dz;
  const [st] = dispensers.get(dimPrefix() + chests.key(x, y, z), true);
  const cont = { state: st };
  const item = mechTakeOne(cont);
  if (!item) { sfx.click(); return; }
  const front = world.getBlock(fx, fy, fz);
  const putBack = () => mechPushInto(cont, item);
  if (item.id === I.ARROW) {
    shootDispenserArrow(fx + 0.5, fy + 0.5, fz + 0.5, dx, dy, dz);
  } else if (item.id === B.TNT) {
    if (front === B.AIR || front === B.WATER) { world.setBlock(fx, fy, fz, B.TNT); igniteTnt(fx, fy, fz); }
    else putBack();
  } else if (item.id === I.WATER_BUCKET || item.id === I.LAVA_BUCKET) {
    if (front === B.AIR) {
      world.setBlock(fx, fy, fz, item.id === I.WATER_BUCKET ? B.WATER : B.LAVA);
      mechPushInto(cont, { id: I.BUCKET, n: 1 });
    } else putBack();
  } else if (item.id === I.BUCKET) {
    if (front === B.WATER || front === B.LAVA) {
      world.setBlock(fx, fy, fz, B.AIR);
      mechPushInto(cont, { id: front === B.WATER ? I.WATER_BUCKET : I.LAVA_BUCKET, n: 1 });
    } else putBack();
  } else if (item.id === I.FLINT_STEEL) {
    if (front === B.TNT) igniteTnt(fx, fy, fz);
    putBack(); // tools aren't consumed
  } else {
    const es = drops.spawn(item.id, 1, fx + 0.5, fy + 0.5, fz + 0.5, { stack: true, dmg: item.d || 0, tag: item.tag || null });
    if (es && es[0]) es[0].vel = { x: dx * 4, y: dy * 4 + 2, z: dz * 4 };
  }
  sfx.dispense();
  contDirty = true;
}

function fireDropper(x, y, z) {
  const [dx, dy, dz] = mechFace(x, y, z);
  const [st] = droppers.get(dimPrefix() + chests.key(x, y, z), true);
  const cont = { state: st };
  const item = mechTakeOne(cont);
  if (!item) { sfx.click(); return; }
  const dst = mechContAt(x + dx, y + dy, z + dz);
  if (dst && !(world.getBlock(x + dx, y + dy, z + dz) === B.SHULKER_BOX && item.id === B.SHULKER_BOX)) {
    const left = mechPushInto(dst, item);
    if (left > 0) { item.n = left; mechPushInto(cont, item); }
  } else if (!dst) {
    const es = drops.spawn(item.id, 1, x + dx + 0.5, y + dy + 0.5, z + dz + 0.5, { stack: true, dmg: item.d || 0, tag: item.tag || null });
    if (es && es[0]) es[0].vel = { x: dx * 1.5, y: 1, z: dz * 1.5 };
  } else {
    mechPushInto(cont, item);
  }
  sfx.dispense();
  contDirty = true;
}

function shootDispenserArrow(x, y, z, dx, dy, dz) {
  const mesh = new THREE.Mesh(arrowGeo, arrowMat);
  mesh.position.set(x, y, z);
  scene.add(mesh);
  arrows.push({
    pos: { x, y, z },
    vel: { x: dx * 22 + (Math.random() - 0.5) * 2, y: dy * 22 + 1, z: dz * 22 + (Math.random() - 0.5) * 2 },
    ttl: 5, mesh, foe: true,
  });
  sfx.bow();
}

function arrowHitTarget(bx, by, bz, a) {
  // bullseye = 15, middle ring = 10, edge = 5 (distance from face center)
  const ax = Math.abs(a.vel.x) >= Math.abs(a.vel.y) && Math.abs(a.vel.x) >= Math.abs(a.vel.z) ? 'x'
    : Math.abs(a.vel.y) >= Math.abs(a.vel.z) ? 'y' : 'z';
  let o1, o2;
  if (ax === 'x') { o1 = a.pos.y - by - 0.5; o2 = a.pos.z - bz - 0.5; }
  else if (ax === 'y') { o1 = a.pos.x - bx - 0.5; o2 = a.pos.z - bz - 0.5; }
  else { o1 = a.pos.x - bx - 0.5; o2 = a.pos.y - by - 0.5; }
  const d = Math.max(Math.abs(o1), Math.abs(o2)) * 16; // 0..8
  const lvl = d < 2 ? 15 : d < 4 ? 10 : 5;
  if (!world._rsTarget) world._rsTarget = new Map();
  world._rsTarget.set(bx + ',' + by + ',' + bz, { lvl, until: simTime + 1.2 });
  if (world.rsUpdate) world.rsUpdate(bx, by, bz);
  sfx.click();
}

function dispatchRedstone(a) {
  if (!a) return;
  if (a.dim !== undefined && a.dim !== dim) return;
  if (a.t === 'ignite' || a.t === 'tnt') {
    igniteTnt(a.x, a.y, a.z);
  } else if (a.t === 'note') {
    const p = notePitches.get(a.dim + ':' + a.x + ',' + a.y + ',' + a.z) ?? 11;
    sfx.note(p);
    particles.burst(a.x + 0.5, a.y + 1.2, a.z + 0.5, [0.3 + p / 25 * 0.7, 0.85, 1], 5, 1);
  } else if (a.t === 'door') {
    // powered doors swing: toggle bottom + top like a manual click
    const bot = world.getBlock(a.x, a.y, a.z);
    const bblk = BLOCKS[bot];
    if (bblk && bblk.shape === 'door' && !bblk.doorTop && bblk.toggleId) {
      world.setBlock(a.x, a.y, a.z, bblk.toggleId);
      const top = world.getBlock(a.x, a.y + 1, a.z);
      if (BLOCKS[top] && BLOCKS[top].doorTop && BLOCKS[top].toggleId) world.setBlock(a.x, a.y + 1, a.z, BLOCKS[top].toggleId);
      sfx.door();
    }
  } else if (a.t === 'piston') {
    sfx.piston();
  } else if (a.t === 'click') {
    sfx.click();
  }
}

function igniteTnt(x, y, z, fuse = 2) {
  if (tntFuses.some((f) => f.x === x && f.y === y && f.z === z)) return;
  tntFuses.push({ x, y, z, t: fuse, spark: 0 });
  sfx.fuse();
}

function explode(cx, cy, cz, radius = 3.4) {
  const R = Math.ceil(radius);
  for (let dy = -R; dy <= R; dy++) {
    for (let dz = -R; dz <= R; dz++) {
      for (let dx = -R; dx <= R; dx++) {
        // ragged sphere edge
        if (dx * dx + dy * dy + dz * dz > radius * radius * (0.7 + Math.random() * 0.45)) continue;
        const x = cx + dx, y = cy + dy, z = cz + dz;
        if (inSpawnZone(x, z)) continue; // spawn plaza is explosion-proof
        // one-block starter island survives explosions (creepers, TNT)
        if (dim === 'overworld' && world.gen === 'oneblock') {
          if ((y === 62 && x >= 0 && x <= 4 && z >= 0 && z <= 4) || (x === 0 && y === 63 && z === 0)) continue;
        }
        const id = world.getBlock(x, y, z);
        if (id === B.AIR || id === B.WATER || id === B.BEDROCK || id === B.OBSIDIAN ||
          id === B.END_FRAME || id === B.END_FRAME_FILLED || id === B.END_PORTAL || id === B.PORTAL) continue;
        if (id === B.TNT) { igniteTnt(x, y, z, 0.2 + Math.random() * 0.5); continue; }
        world.setBlock(x, y, z, B.AIR);
      }
    }
  }
  particles.burst(cx + 0.5, cy + 0.5, cz + 0.5, [1, 0.8, 0.35], 40, 10);
  particles.burst(cx + 0.5, cy + 0.5, cz + 0.5, [0.4, 0.38, 0.36], 30, 7);
  sfx.explode();
  // entities take distance-scaled damage
  const dmgAt = (ex, ey, ez) => {
    const d = Math.hypot(ex - cx - 0.5, ey - cy - 0.5, ez - cz - 0.5);
    return d > radius * 2 ? 0 : Math.round(22 * (1 - d / (radius * 2)));
  };
  const pDmg = dmgAt(player.pos.x, player.pos.y + 0.9, player.pos.z);
  if (pDmg > 0) player.damage(pDmg, simTime, 'attack');
  for (const m of mobs.mobs) {
    const n = dmgAt(m.pos.x, m.pos.y + 0.5, m.pos.z);
    if (n <= 0) continue;
    const kx = m.pos.x - cx - 0.5, kz = m.pos.z - cz - 0.5;
    const kl = Math.hypot(kx, kz) || 1;
    m.hurt(n, kx / kl, kz / kl, { player, world, particles });
  }
}

function updateTnt(dt) {
  for (let i = tntFuses.length - 1; i >= 0; i--) {
    const f = tntFuses[i];
    f.t -= dt;
    f.spark -= dt;
    if (f.spark <= 0) {
      f.spark = 0.12;
      particles.burst(f.x + 0.5, f.y + 1.05, f.z + 0.5, [1, 0.9, 0.4], 2, 1.2);
    }
    if (f.t <= 0) {
      tntFuses.splice(i, 1);
      world.setBlock(f.x, f.y, f.z, B.AIR);
      explode(f.x, f.y, f.z);
    }
  }
}

// visual eye-of-ender flight: drifts toward the stronghold, then pops
const eyeFlights = [];
function launchEyeFlight(dx, dz, dist) {
  const eye = player.eye();
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.35, 0.35),
    new THREE.MeshBasicMaterial({ map: itemTexture(I.EYE_OF_ENDER), transparent: true, alphaTest: 0.1, side: THREE.DoubleSide })
  );
  mesh.position.set(eye.x, eye.y, eye.z);
  scene.add(mesh);
  const l = Math.hypot(dx, dz) || 1;
  eyeFlights.push({
    pos: { x: eye.x, y: eye.y, z: eye.z },
    vel: dist < 12
      ? { x: 0, y: -5, z: 0 }                                // points straight down when on top of it
      : { x: (dx / l) * 9, y: 2.2, z: (dz / l) * 9 },
    ttl: 1.8, mesh,
  });
}

function updateEyeFlights(dt) {
  for (let i = eyeFlights.length - 1; i >= 0; i--) {
    const e = eyeFlights[i];
    e.ttl -= dt;
    e.vel.y -= 1.2 * dt;
    e.pos.x += e.vel.x * dt; e.pos.y += e.vel.y * dt; e.pos.z += e.vel.z * dt;
    e.mesh.position.set(e.pos.x, e.pos.y, e.pos.z);
    e.mesh.rotation.y += dt * 5;
    if (e.ttl <= 0) {
      particles.burst(e.pos.x, e.pos.y, e.pos.z, [0.5, 0.95, 0.7], 14, 2.5);
      scene.remove(e.mesh);
      e.mesh.geometry.dispose();
      eyeFlights.splice(i, 1);
    }
  }
}

function pickBlock() {
  const hit = currentTarget();
  if (!hit) return;
  const id = (BLOCKS[hit.id] && BLOCKS[hit.id].item) || hit.id;
  if (!ITEMS[id]) return;
  const idx = inventory.slots.findIndex((s, i) => i < 9 && s && s.id === id);
  if (idx >= 0) { setSelected(idx); return; }
  if (isCreative()) {
    // creative: the targeted block appears in the selected slot, like Minecraft
    inventory.slots[selected] = { id, n: maxStack(id) };
    sfx.pop();
    inventory._c();
  }
}

// ---------------------------------------------------------------------------
// Day / night cycle

const skyDay = new THREE.Color(0x87ceeb);
const skyNight = new THREE.Color(0x070b1c);
const skySunset = new THREE.Color(0xe87a3f);
const skyColor = new THREE.Color();
let daylight = 1;

const netherSky = new THREE.Color(0x1c0808);
const endSky = new THREE.Color(0x0b0714);

function updateDayNight(dt) {
  if (world.dim === 'end') {
    scene.background = endSky;
    scene.fog.color.copy(endSky);
    ambient.intensity = 0.6;
    sun.intensity = 0.18;
    sunMesh.visible = false;
    moonMesh.visible = false;
    stars.position.set(player.pos.x, player.pos.y, player.pos.z);
    starMat.opacity = 0.55; // endless night sky
    daylight = 0.35;
    return;
  }
  if (world.dim === 'nether') {
    scene.background = netherSky;
    scene.fog.color.copy(netherSky);
    ambient.intensity = 0.55;
    sun.intensity = 0.12;
    sunMesh.visible = false;
    moonMesh.visible = false;
    starMat.opacity = 0;
    daylight = 0.4; // constant gloom; no day/night in the nether
    return;
  }
  sunMesh.visible = true;
  moonMesh.visible = true;
  timeOfDay = (timeOfDay + dt / DAY_LEN) % 1;
  const a = timeOfDay * Math.PI * 2; // 0 = dawn, PI/2 = noon
  const sinA = Math.sin(a);
  daylight = Math.max(0, Math.min(1, (sinA + 0.12) / 0.42));
  if (weatherMode === 'rain') daylight *= 0.45;
  const dl = daylight * daylight * (3 - 2 * daylight); // smoothstep

  ambient.intensity = 0.35 + 0.5 * dl;
  sun.intensity = 0.15 + 1.0 * dl;

  skyColor.copy(skyNight).lerp(skyDay, dl);
  const sunsetW = Math.max(0, 1 - Math.abs(sinA) * 4.5) * dl * 0.8;
  skyColor.lerp(skySunset, sunsetW);
  scene.background = skyColor;
  scene.fog.color.copy(skyColor);

  const p = player.pos;
  const sunDir = new THREE.Vector3(Math.cos(a), sinA, 0.35).normalize();
  sun.position.set(p.x + sunDir.x * 100, p.y + sunDir.y * 100, p.z + sunDir.z * 100);
  sun.target.position.set(p.x, p.y, p.z);

  sunMesh.position.set(p.x + sunDir.x * 380, p.y + sunDir.y * 380, p.z + sunDir.z * 380);
  sunMesh.lookAt(camera.position);
  moonMesh.position.set(p.x - sunDir.x * 380, p.y - sunDir.y * 380, p.z - sunDir.z * 380);
  moonMesh.lookAt(camera.position);
  stars.position.set(p.x, p.y, p.z);
  starMat.opacity = Math.max(0, 1 - dl * 1.6) * 0.9;
}

// ---------------------------------------------------------------------------
// Save

function save() {
  if (wipeSave) return; // world was just deleted via New World
  try {
    const edits = [];
    for (const [ck, m] of worldOver.edits) edits.push([ck, [...m]]);
    const editsN = [];
    for (const [ck, m] of worldNether.edits) editsN.push([ck, [...m]]);
    const editsE = [];
    for (const [ck, m] of worldEnd.edits) editsE.push([ck, [...m]]);
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      itemsV2: true, // item ids 200+ (post block-id expansion)
      seed: worldOver.seed,
      dim,
      gameMode: player.gameMode,
      editsN,
      editsE,
      dragonDefeated,
      portals: { overworld: dims.overworld.portals, nether: dims.nether.portals },
      timeOfDay,
      player: { pos: player.pos, spawn: player.spawn, yaw: player.yaw, pitch: player.pitch, hp: player.hp, hunger: player.hunger, saturation: player.saturation, sel: selected },
      inventory: inventory.serialize(),
      furnaces: furnaces.serialize(),
      chests: chests.serialize(),
      shulkers: shulkers.serialize(),
      dispensers: dispensers.serialize(),
      droppers: droppers.serialize(),
      hoppers: hoppers.serialize(),
      rsData: worldOver.rsDataSave(),
      rsDataN: worldNether.rsDataSave(),
      rsDataE: worldEnd.rsDataSave(),
      drops: {
        overworld: dropsByDim.overworld.serialize(),
        nether: dropsByDim.nether.serialize(),
        end: dropsByDim.end.serialize(),
      },
      edits,
      oneblock: oneblockPhase,
      mpOutbox: mpSession ? outboxRows() : undefined,
    }));
    if (!mpSession && currentWorldId) touchWorld(currentWorldId);
  } catch (e) { /* storage full or unavailable */ }
}
setInterval(save, 10000);
window.addEventListener('beforeunload', save);

// ---------------------------------------------------------------------------
// Main loop

const clock = new THREE.Clock();
let fps = 60, fpsSmooth = 60;
let debugT = 0;
let simTime = 0;
let bobPhase = 0, bobAmp = 0;
let stepAcc = 0;
let prevInWater = false;
let mechT = 0;
let liqT = 0, liqTickN = 0; // liquid flow accumulator (lava moves every 3rd tick)
let contDirty = false; // open machine UI needs a live refresh

const pasteQueue = []; // [world, x, y, z, id]: queued structure blocks, drained 900/frame
function animate() {
  requestAnimationFrame(animate);
  frame(Math.min(clock.getDelta(), 0.05));
}

function frame(dt) {
  simTime += dt;
  const time = simTime;
  fps = 1 / Math.max(dt, 1e-4);
  fpsSmooth += (fps - fpsSmooth) * 0.05;

  world.update(player.pos.x, player.pos.z, started ? 8 : 25);
  world.flushDirty();

  // singleplayer: the world pauses while the inventory is open —
  // except the furnace UI, which runs in real time like Minecraft containers
  const paused = invOpen && invMode !== 'furnace' && invMode !== 'chest' && invMode !== 'shulker' && invMode !== 'dispenser' && invMode !== 'dropper' && invMode !== 'hopper'; // containers run in real time
  if ((started || forceStarted) && !paused) {
    const preVy = player.vel.y, preGround = player.onGround;
    player.update(dt, isLocked() ? keys : new Set(), time);
    if (!preGround && player.onGround && preVy < -9 && !player.dead) {
      sfx.land(Math.min(1, (-preVy - 9) / 22 + 0.25));
    }
    mobs.update(dt, { world, player, daylight, time, sfx, particles, drops, explode });
    drops.update(dt, { player, inventory, onPickup: () => sfx.pickup(), sendGone: (nid) => net.sendGone(nid) });
    if (furnaces.tick(dt) && invOpen && invMode === 'furnace') renderInvScreen();
    world._rsNow = simTime;
    tickRedstone(world, {
      entities: [player, ...mobs.mobs],
      daylight: Math.max(0, Math.min(15, Math.round(daylight * 15))),
      time: simTime,
      setBlock: (x, y, z, id) => world.setBlock(x, y, z, id),
    });
    mechT += dt;
    if (mechT >= 0.2) { mechT = 0; mechTick(); }
    liqT += dt;
    if (liqT >= 0.25) { liqT = 0; liquidTick(); }
    if (contDirty) { contDirty = false; if (invOpen && (invMode === 'dispenser' || invMode === 'dropper' || invMode === 'hopper')) renderInvScreen(); }
    if (dim === 'end' && dragon && !dragon.dead) dragon.update(dt, { player, time, sfx, particles });
    updatePearls(dt);
    updateArrows(dt);
    updateEyeFlights(dt);
    updateTnt(dt);
    updateMining(dt);
    oneblockTick(dt);
    spawnTick(dt);

    // held-repeat placing / eating
    placeCd -= dt;
    if (placingHeld && placeCd <= 0) {
      useHeld();
      const hk = ITEMS[heldId()]?.kind;
      placeCd = (hk === 'food' || hk === 'bow') ? 0.7 : 0.25;
    }
  }

  // camera follows player eye (interpolated between physics ticks)
  const eye = player.eye();

  // view bobbing: vertical oscillation + slight roll, paced like footsteps
  const hspd = Math.hypot(player.vel.x, player.vel.z);
  const bobTarget = (prefs.bob && player.onGround && !player.fly && hspd > 0.5) ? Math.min(1, hspd / 4.3) : 0;
  bobAmp += (bobTarget - bobAmp) * Math.min(1, 8 * dt);
  if (bobTarget > 0) bobPhase += dt * hspd * 0.45;
  else if (player.swimming && hspd > 0.5) bobPhase += dt * hspd * 0.35; // crawl stroke
  const bobY = Math.abs(Math.sin(bobPhase * Math.PI)) * 0.04 * bobAmp;
  const bobRoll = Math.sin(bobPhase * Math.PI) * 0.007 * bobAmp;

  // footsteps: distance-triggered, louder when sprinting, quiet when sneaking
  const stepping = !paused && started && !player.dead && player.onGround && !player.fly && hspd > 0.8;
  if (stepping) {
    stepAcc += hspd * dt;
    const stride = player.sprinting ? 2.7 : player.sneaking ? 1.7 : 2.2;
    if (stepAcc >= stride) {
      stepAcc = 0;
      const mat = player.inWater ? 'water'
        : materialOf(world.getBlock(Math.floor(player.pos.x), Math.floor(player.pos.y - 0.25), Math.floor(player.pos.z)));
      sfx.step(mat, player.sneaking ? 0.35 : player.sprinting ? 1.2 : 1);
    }
  } else {
    stepAcc = 0;
  }

  // splash when hitting the water
  if (!prevInWater && player.inWater && player.vel.y < -4 && started && !player.dead) {
    particles.burst(eye.x, eye.y - 0.6, eye.z, [0.3, 0.5, 0.9], 24, 3);
    sfx.splash();
  }
  prevInWater = player.inWater;

  // third-person body
  const showBody = camMode !== 0 && !player.dead && started;
  playerModel.group.visible = showBody;
  if (showBody) {
    const a = player.renderAlpha;
    playerModel.group.position.set(
      player.prevPos.x + (player.pos.x - player.prevPos.x) * a,
      player.prevPos.y + (player.pos.y - player.prevPos.y) * a,
      player.prevPos.z + (player.pos.z - player.prevPos.z) * a
    );
    playerModel.group.rotation.y = player.yaw;
    playerModel.head.rotation.x = THREE.MathUtils.clamp(-player.pitch, -1.1, 1.1) * 0.85;
    posePlayer(playerModel, bobPhase * Math.PI, bobAmp, swingT, player.sneaking, {
      run: player.sprinting && !player.swimming ? 1 : 0, eat: eatT,
      swim: player.swimming ? 1 : 0, fly: player.fly,
      air: !player.onGround && !player.inWater && !player.fly,
      t: performance.now() / 1000,
    });
    const sig = inventory.armor.map(s => (s ? ITEMS[s.id].matKey : '-')).join(',');
    if (sig !== armorSig) {
      armorSig = sig;
      playerModel.setArmor(inventory.armor.map(s => (s ? ITEMS[s.id].matKey : null)));
    }
  }
  heldGroup.visible = !showBody;

  if (camMode === 0) {
    camera.position.set(eye.x, eye.y + bobY, eye.z);
    camera.rotation.set(player.pitch, player.yaw, bobRoll);
  } else {
    // pull the camera back/front along the view axis, stopping at walls
    const fwd = player.forwardDir();
    const sgn = camMode === 1 ? -1 : 1;
    const dx = fwd.x * sgn, dy = fwd.y * sgn, dz = fwd.z * sgn;
    let dist = 4;
    for (let d = 0.8; d <= 4; d += 0.25) {
      const bb = world.getBlock(Math.floor(eye.x + dx * d), Math.floor(eye.y + dy * d), Math.floor(eye.z + dz * d));
      if (bb !== B.AIR && bb !== B.WATER && BLOCKS[bb] && BLOCKS[bb].solid) { dist = Math.max(0.6, d - 0.3); break; }
    }
    camera.position.set(eye.x + dx * dist, Math.max(0.5, eye.y + dy * dist), eye.z + dz * dist);
    if (camMode === 1) camera.rotation.set(player.pitch, player.yaw, 0);
    else camera.rotation.set(-player.pitch, player.yaw + Math.PI, 0);
  }

  // sprint FOV (70 base, +10% sprinting)
  const targetFov = player.sprinting ? 77 : 70;
  if (Math.abs(camera.fov - targetFov) > 0.1) {
    camera.fov += (targetFov - camera.fov) * Math.min(1, 10 * dt);
    camera.updateProjectionMatrix();
  }

  // held item swing animation (+ eating + swimming offsets for the arm)
  swingT += dt * 7;
  if (eatT >= 0) { eatT += dt / 1.1; if (eatT >= 1) eatT = -1; }
  {
    const s = Math.min(swingT, Math.PI);
    const baseRx = (ITEMS[heldId()]?.kind === 'block' ? 0.12 : 0.1);
    let rx = baseRx - Math.sin(s) * 0.6;
    let py = -0.46 - Math.sin(s) * 0.12;
    if (player.swimming) py -= 0.12;
    if (eatT >= 0) { // food to the mouth, chomping
      rx = -0.9 + Math.sin(eatT * 28) * 0.18;
      py = -0.2 + Math.abs(Math.sin(eatT * 14)) * 0.05;
    }
    heldGroup.rotation.x = rx;
    heldGroup.position.y = py;
  }

  // block highlight
  const hit = (isLocked() && !invOpen) ? currentTarget() : null;
  if (hit) {
    highlight.visible = true;
    highlight.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
  } else {
    highlight.visible = false;
  }

  if (pasteQueue.length) { // drain the structure queue a slice per frame
    for (const [w, x, y, z, id] of pasteQueue.splice(0, 900)) w.setBlock(x, y, z, id);
  }
  updateDayNight((started || forceStarted) && !paused ? dt : 0);
  particles.update(dt);
  updateHearts();

  // live furnace progress bars while its UI is open
  if (invOpen && invMode === 'furnace') updateFurnaceBars();
  if (invOpen && (invMode === 'inv' || invMode === 'table')) renderPlayerPreview();

  // burning vignette (creative players don't burn)
  fireOverlayEl.style.opacity = (player.inLava || player.burnT > 0) && !player.dead && !isCreative() ? 0.75 : 0;

  // underwater overlay + fog (nether has its own closer fog)
  if (player.eyeInWater) {
    underwaterEl.style.opacity = 0.35;
    scene.fog.near = 2; scene.fog.far = 18;
  } else {
    underwaterEl.style.opacity = 0;
    scene.fog.near = world.dim === 'nether' ? 10 : renderDist * CHUNK * 0.55;
    scene.fog.far = renderDist * CHUNK * (world.dim === 'nether' ? 0.75 : world.dim === 'end' ? 1.15 : 0.95);
  }

  // stand in a portal to travel
  if ((started || forceStarted) && !paused && !player.dead) {
    const standIn = world.getBlock(Math.floor(player.pos.x), Math.floor(player.pos.y + 0.5), Math.floor(player.pos.z));
    inPortalNow = standIn === B.PORTAL || standIn === B.END_PORTAL;
    portalCd -= dt;
    if (inPortalNow && portalCd <= 0) {
      portalT += dt;
      const need = standIn === B.END_PORTAL ? 0.8 : 2;
      if (portalT >= need) {
        portalT = 0;
        if (standIn === B.END_PORTAL) {
          if (dim === 'end') leaveEnd();
          else enterEnd();
        } else {
          switchDimension(dim === 'nether' ? 'overworld' : 'nether');
        }
      }
    } else if (!inPortalNow) {
      portalT = Math.max(0, portalT - dt * 3);
    }
    portalOverlayEl.style.opacity = inPortalNow && portalCd <= 0 ? Math.min(0.85, 0.3 + (portalT / 2) * 0.55) : 0;
  } else if (player.dead) {
    portalOverlayEl.style.opacity = 0;
  }

  // boss bar
  const bossVisible = dim === 'end' && dragon && !dragon.dead;
  bossbarEl.classList.toggle('show', !!bossVisible);
  if (bossVisible) bossFillEl.style.width = (dragon.hp / dragon.maxHp * 100) + '%';

  // toast fade
  if (blockNameT > 0) {
    blockNameT -= dt;
    if (blockNameT <= 0) blockNameEl.style.opacity = 0;
  }

  // debug overlay
  debugT -= dt;
  if (debugT <= 0 && debugEl.classList.contains('show')) {
    debugT = 0.25;
    debugEl.textContent =
      `FPS ${fpsSmooth.toFixed(0)}  |  XYZ ${player.pos.x.toFixed(1)} / ${player.pos.y.toFixed(1)} / ${player.pos.z.toFixed(1)}\n` +
      `chunks ${world.chunks.size}  mobs ${mobs.mobs.length}  drops ${drops.list.length}  time ${timeOfDay.toFixed(2)}  daylight ${daylight.toFixed(2)}\n` +
      `seed ${world.seed >>> 0}  renderDist ${renderDist}  mode ${player.gameMode}  fly ${player.fly}  cam ${camMode}` +
      (mpSession ? `\nMP ${net.status}${net.online ? '' : ' \u21bb'}  ping ${net.ping || '?'} ms  players ${net.players.size + 1}  edits queued ${editOutbox.size}` : '');
  }

  // multiplayer remotes + weather
  updateRemotes(dt);
  if (tabListShown) renderTabList();
  if (weatherUntil && simTime > weatherUntil && weatherMode === 'rain') setWeather('clear');
  updateClouds(dt);
  updateRain(dt);

  renderer.render(scene, camera);
}

// booted mid-End with the dragon still alive: bring it back
if (dim === 'end' && !dragonDefeated) {
  dragon = new Dragon(scene);
  dragon.onDeath = onDragonDeath;
}

applyGameMode(player.gameMode, { silent: true });
renderHotbar();
updateHeldItem();
updateHearts();

// ---------------------------------------------------------------------------
// Multiplayer: shared block edits, remote players, chat, time/weather sync

function isMP() { return !!mpSession; }

const SPAWN_R = 16; // spawn safe-zone radius (multiplayer overworld only)
function inSpawnRadius(sx, sz, x, z, r = SPAWN_R) {
  const dx = x - sx, dz = z - sz;
  return dx * dx + dz * dz <= r * r;
}
function inSpawnZone(x, z) {
  return isMP() && dim === 'overworld' &&
    inSpawnRadius(Math.floor(spawnPoint.x), Math.floor(spawnPoint.z), Math.floor(x), Math.floor(z));
}
function spawnProtected() { return !isCreative() && !net.isOp(net.myId); }
let spawnToastCd = 0;
function spawnGuard(x, z) { // true = edit blocked (non-op inside the spawn zone)
  if (!inSpawnZone(x, z) || !spawnProtected()) return false;
  if (spawnToastCd <= 0) { spawnToastCd = 1.5; toast('\u{1F3E0} Спавн защищён! Здесь строить нельзя', 1.5); }
  return true;
}
let wasInSpawn = false;
function spawnTick(dt) {
  spawnToastCd = Math.max(0, spawnToastCd - dt);
  const inside = inSpawnZone(player.pos.x, player.pos.z);
  player.invulnerable = inside; // god mode inside the safe zone
  if (inside && !wasInSpawn) toast('\u{1F3E0} Спавн — безопасная зона. Здесь ты бессмертен!', 2.5);
  wasInSpawn = inside;
}
const remoteModels = new Map(); // id -> {group, parts, walkPhase, swingT, armorSig}
let netJump = false, prevSwingT = 0;
const lastSentPos = { x: 0, y: 0, z: 0 };

function mpArmor() { return inventory.armor.map(s => (s ? ITEMS[s.id].matKey || null : null)); }
function afterTeleport() { netJump = true; }
function afterEdit() { save(); }

// --- outgoing block edits: a small outbox with acknowledgements ------------
// Every local edit is queued here and sent in batches. The server acks each
// batch id, and only then is the entry dropped — so edits made during a
// disconnect (or lost with a dropped socket) are pushed again on reconnect
// instead of silently vanishing.
const editOutbox = new Map();  // "dim,x,y,z" -> {dim,x,y,z,id,f,seq}
const batchKeys = new Map();   // batchId -> [[key, seq], ...]
let batchSeq = 0, outboxSeq = 0;
const OUTBOX_MAX = 40000;

let outboxSavedAt = 0;

// rows handed to save(): [dim,x,y,z,id,f+1] (f+1 so 0 means "no facing")
function outboxRows() {
  const rows = [];
  for (const e of editOutbox.values()) rows.push([e.dim, e.x, e.y, e.z, e.id, e.f == null ? 0 : e.f + 1]);
  return rows;
}

function outboxLoad(rows) {
  if (!Array.isArray(rows)) return;
  for (const r of rows) {
    if (!Array.isArray(r) || r.length < 5) continue;
    const [d, x, y, z, id, f] = r;
    if (d !== 'overworld' && d !== 'nether' && d !== 'end') continue;
    if (![x, y, z, id].every(Number.isInteger)) continue;
    const key = d + ',' + x + ',' + y + ',' + z;
    editOutbox.set(key, { dim: d, x, y, z, id, f: Number.isInteger(f) && f > 0 ? f - 1 : undefined, seq: ++outboxSeq });
  }
}

function queueEdit(dim, x, y, z, id, f) {
  if (!mpSession) return;
  const k = dim + ',' + x + ',' + y + ',' + z;
  editOutbox.delete(k); // keep insertion order = send order
  editOutbox.set(k, { dim, x, y, z, id, f, seq: ++outboxSeq });
  if (editOutbox.size > OUTBOX_MAX) editOutbox.delete(editOutbox.keys().next().value);
}

function flushOutbox(force = false) {
  if (!net.online || !editOutbox.size) return;
  if (!force && simTime - outboxSavedAt < 0.2) return;
  outboxSavedAt = simTime;
  const list = [], keys = [];
  for (const [k, e] of editOutbox) {
    const o = { dim: e.dim, x: e.x, y: e.y, z: e.z, id: e.id };
    if (Number.isInteger(e.f) && e.f >= 0) o.f = e.f;
    list.push(o); keys.push([k, e.seq]);
    if (list.length >= 500) break;
  }
  if (!list.length) return;
  const batch = ++batchSeq;
  batchKeys.set(batch, keys);
  net.sendEdits(list, batch);
  if (batchKeys.size > 400) { // socket is very unhealthy: forget the oldest
    const oldest = batchKeys.keys().next().value;
    batchKeys.delete(oldest);
  }
}

function ackBatch(batch) {
  const keys = batchKeys.get(batch);
  if (!keys) return;
  batchKeys.delete(batch);
  for (const [k, seq] of keys) {
    const cur = editOutbox.get(k);
    if (cur && cur.seq === seq) editOutbox.delete(k); // newer edit for the same block? keep it
  }
}

// position updates live on a timer (not the render loop) so a background tab
// — where requestAnimationFrame is paused by the browser — still keeps the
// player alive and visible for everyone else
function mpSendPos(force = false) {
  if (!mpSession || !net.online || (!started && !forceStarted)) return;
  const p = player.pos;
  const far = Math.abs(p.x - lastSentPos.x) > 40 || Math.abs(p.y - lastSentPos.y) > 40 || Math.abs(p.z - lastSentPos.z) > 40;
  const jump = netJump || far; // legit teleport: the server must not reject it
  lastSentPos.x = p.x; lastSentPos.y = p.y; lastSentPos.z = p.z;
  netJump = false;
  net.sendPos(p, player.yaw, player.pitch, mpArmor(), dim, {
    jump, sneak: player.sneaking, sprint: player.sprinting,
    fly: player.fly, ground: player.onGround, held: heldId() || 0,
    swim: player.swimming, hp: player.dead ? 0 : Math.ceil(player.hp),
  });
}

function setTimeOfDay(v) { // synced to the server in multiplayer
  timeOfDay = ((v % 1) + 1) % 1;
  if (mpSession && net.online) net.sendTime(timeOfDay);
}

function setWeather(mode, secs = 0, fromNet = false) {
  weatherMode = mode === 'rain' ? 'rain' : 'clear';
  weatherUntil = secs > 0 ? simTime + secs : 0;
  setRain(weatherMode === 'rain');
  if (!fromNet && mpSession && net.online) net.sendWeather(weatherMode);
}

function setRenderDist(n) {
  renderDist = Math.min(8, Math.max(2, n | 0));
  worldOver.renderDist = renderDist;
  worldNether.renderDist = renderDist;
  worldEnd.renderDist = renderDist;
  prefs.rd = renderDist;
  savePrefs();
}

let tabListEl = null, tabListShown = false, tabListRowsSig = '';
function pingBars(ms) {
  const n = !ms ? 0 : ms < 60 ? 5 : ms < 110 ? 4 : ms < 180 ? 3 : ms < 300 ? 2 : 1;
  return '\u2582\u2584\u2586\u2588'.slice(0, n).padEnd(5, '\u2581');
}
function showTabList(show) {
  if (!tabListEl) tabListEl = document.getElementById('tabList');
  if (!tabListEl) return;
  tabListShown = !!show;
  if (!tabListShown || !mpSession) { tabListEl.classList.remove('show'); return; }
  renderTabList();
  tabListEl.classList.add('show');
}
function renderTabList(force = false) {
  if (!tabListEl || !tabListShown || !mpSession) return;
  const esc = (x) => String(x).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
  const hearts = (q) => {
    const hp = q.hp == null ? 20 : q.hp;
    const full = Math.round(hp / 2);
    return '\u2665'.repeat(Math.max(0, full)) + '\u2661'.repeat(Math.max(0, 10 - full));
  };
  const status = net.online ? 'online' : net.status;
  const mine = [net.name + ' (you)' + (net.isOp() ? ' \u2605' : ''), pingBars(net.ping), hearts(player), '\u00b7 ' + status];
  const others = [...net.players.values()].map(q => [
    esc(q.name) + (net.isOp(q.id) ? ' \u2605' : ''),
    pingBars(q.ping), hearts(q), '\u00b7 ' + esc(q.dim || 'overworld'),
  ]);
  const sig = JSON.stringify([mine, others]);
  if (!force && sig === tabListRowsSig) return;
  tabListRowsSig = sig;
  const row = (cols, cls) => '<div class="' + (cls || '') + '">' + cols.map(c => '<span>' + c + '</span>').join('') + '</div>';
  tabListEl.innerHTML =
    `<div class="tab-head">${esc(net.server || 'server')} \u00b7 ${others.length + 1} online` +
    `${net.online ? '' : ' \u00b7 ' + status}</div>` +
    row(mine, 'tab-you') + others.map(o => row(o)).join('');
}

function relockPointer() {
  if (started && !player.dead && !invOpen && !document.pointerLockElement) {
    try { canvas.requestPointerLock(); } catch (e) {}
  }
}

function removeRemote(id) {
  const r = remoteModels.get(id);
  if (!r) return;
  scene.remove(r.group);
  for (const o of r.group.children) {
    if (o.isSprite && o.material) {
      if (o.material.map) o.material.map.dispose();
      o.material.dispose();
    }
  }
  try { r.parts.dispose(); } catch (e) {}
  remoteModels.delete(id);
}

function makeNameSprite(name, hue = 0) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 48;
  const g = c.getContext('2d');
  g.font = 'bold 26px monospace';
  g.textAlign = 'center';
  g.fillStyle = 'rgba(0,0,0,0.55)';
  const w = Math.min(250, g.measureText(name).width + 24);
  g.fillRect(128 - w / 2, 4, w, 38);
  g.fillStyle = `hsl(${hue}, 85%, 78%)`;
  g.fillText(name, 128, 32);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
  sp.scale.set(1.9, 0.36, 1);
  return sp;
}


// item mesh floating in a remote player's right hand
function setRemoteHeld(r, id) {
  if (r.held) {
    r.parts.armR.remove(r.held);
    if (!r.held.userData.sharedRes) { r.held.geometry.dispose(); r.held.material.dispose(); }
    r.held = null;
  }
  const it = ITEMS[id];
  if (!it) return;
  let m;
  if (it.kind === 'block') {
    m = new THREE.Mesh(cachedBlockGeometry(id), materials.opaque);
    m.scale.setScalar(0.28);
    m.userData.sharedRes = true; // cached geo + shared material: dispose() must skip
  } else {
    m = new THREE.Mesh(
      new THREE.PlaneGeometry(0.42, 0.42),
      new THREE.MeshBasicMaterial({ map: itemTexture(id), transparent: true, alphaTest: 0.1, side: THREE.DoubleSide })
    );
  }
  m.position.set(0, -0.62, -0.1);
  r.parts.armR.add(m);
  r.held = m;
}

// structure paste queue: big builds (city!) go in slices so the game never freezes

// instant structures (house/castle/well/portal/villa/city): queue at the base cell
function pasteStructure(key, bx, by, bz) {
  const build = STRUCT_BUILDERS[key];
  if (!build) return 0;
  const rows = build();
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  for (const [dx, , dz] of rows) {
    if (dx < minX) minX = dx; if (dx > maxX) maxX = dx;
    if (dz < minZ) minZ = dz; if (dz > maxZ) maxZ = dz;
  }
  const cx = bx + ((minX + maxX) >> 1), cz = bz + ((minZ + maxZ) >> 1);
  if (!world.hasDataAt(bx + minX, bz + minZ) || !world.hasDataAt(bx + maxX, bz + maxZ) || !world.hasDataAt(cx, cz)) {
    toast('Чанки не загружены — подойдите ближе', 2);
    return 0;
  }
  let n = 0;
  for (const [dx, dy, dz, id] of rows) {
    const x = bx + dx, y = by + dy, z = bz + dz;
    if (y < 0 || y >= HEIGHT) continue;
    if (world.getBlock(x, y, z) === B.BEDROCK) continue;
    pasteQueue.push([world, x, y, z, id]);
    n++;
  }
  return n;
}

// PvP: ray against the other players' hitboxes (0.6 wide, 1.8 tall).
// Returns the nearest hit with its distance, or null.
function raycastRemotePlayers(ox, oy, oz, dx, dy, dz, maxT) {
  let best = null;
  for (const [id, r] of remoteModels) {
    if (!r.group.visible) continue;
    const g = r.group.position;
    const hw = 0.32;
    // slab method on the player AABB
    let t0 = 0, t1 = maxT;
    const lo = [g.x - hw, g.y, g.z - hw], hi = [g.x + hw, g.y + 1.8, g.z + hw];
    const o = [ox, oy, oz], d = [dx, dy, dz];
    let miss = false;
    for (let i = 0; i < 3; i++) {
      if (Math.abs(d[i]) < 1e-6) { if (o[i] < lo[i] || o[i] > hi[i]) { miss = true; break; } continue; }
      let ta = (lo[i] - o[i]) / d[i], tb = (hi[i] - o[i]) / d[i];
      if (ta > tb) { const s2 = ta; ta = tb; tb = s2; }
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) { miss = true; break; }
    }
    if (miss || t0 >= maxT) continue;
    if (!best || t0 < best.t) best = { id, t: t0, r };
  }
  return best;
}

function updateRemotes(dt) {
  if (!mpSession) { if (remoteModels.size) for (const id of [...remoteModels.keys()]) removeRemote(id); return; }
  if (net.online) {
    flushOutbox();
    if (swingT < prevSwingT) net.sendAct('swing'); // our arm swung: tell everyone
    prevSwingT = swingT;
  }
  // remote players are drawn even while we are offline (frozen in place) so
  // the world does not visually reset during a reconnect blip
  for (const [id, p] of net.players) {
    if (!Array.isArray(p.p)) continue; // no position yet (just joined)
    let r = remoteModels.get(id);
    if (!r) {
      const parts = buildPlayerModel();
      let hue = 0;
      for (const ch of String(p.name || '')) hue = (hue * 31 + ch.codePointAt(0)) % 360;
      const tag = makeNameSprite(p.name, hue);
      tag.position.y = 2.15;
      parts.group.add(tag);
      scene.add(parts.group);
      r = { group: parts.group, parts, walkPhase: Math.random() * 6, swingT: 99, armorSig: '', heldSig: -1 };
      r.group.position.set(p.p[0], p.p[1], p.p[2]);
      remoteModels.set(id, r);
    }
    const sameDim = (p.dim || 'overworld') === dim;
    r.group.visible = sameDim && !player.dead;
    if (!sameDim) continue;
    const g = r.group.position;
    const dx = p.p[0] - g.x, dy = p.p[1] - g.y, dz = p.p[2] - g.z;
    const dist = Math.hypot(dx, dz);
    const far = Math.hypot(dx, dy, dz);
    // snap on real teleports (respawn, portals, /tp) instead of gliding there
    if (p.tp || far > 30) { g.set(p.p[0], p.p[1], p.p[2]); p.tp = 0; }
    else { const k = Math.min(1, dt * 12); g.x += dx * k; g.y += dy * k; g.z += dz * k; }
    r.group.rotation.y = p.yaw || 0;
    r.parts.head.rotation.x = THREE.MathUtils.clamp(-(p.pitch || 0), -1.1, 1.1) * 0.85;
    const speed = dist / Math.max(dt, 1e-3);
    r.walkPhase += dt * (2 + Math.min(8, speed) * 1.6);
    r.swingT += dt;
    const air = sameDim && p.ground === 0 && speed > 1.5;
    posePlayer(r.parts, r.walkPhase, Math.min(1, speed / 4), r.swingT, !!p.sneak, {
      run: (speed > 5 ? 1 : 0) + (p.sprint ? 1 : 0) > 1 ? 1 : (p.sprint ? 1 : 0),
      swim: p.swim ? 1 : 0, fly: !!p.fly, air, t: performance.now() / 1000,
    });
    const sig = (p.armor || []).join(',');
    if (sig !== r.armorSig) { r.armorSig = sig; r.parts.setArmor(p.armor || [null, null, null, null]); }
    const hsig = p.held | 0;
    if (hsig !== r.heldSig) { r.heldSig = hsig; setRemoteHeld(r, hsig); }
    // brief red flash after being hit (PvP feedback)
    if (r.hurtT !== undefined && r.hurtT < 0.35) {
      r.hurtT += dt;
      const flash = r.hurtT < 0.3;
      for (const part of [r.parts.head, r.parts.body, r.parts.armL, r.parts.armR, r.parts.legL, r.parts.legR]) {
        if (!part || !part.material) continue;
        if (!part.userData._baseColor) part.userData._baseColor = part.material.color.getHex();
        part.material.color.setHex(flash ? 0xff5555 : part.userData._baseColor);
      }
    }
    // name tags fade out with distance so a busy server stays readable
    const tag = r.group.children.find(o => o.isSprite);
    if (tag) tag.material.opacity = far > 48 ? 0 : (far > 32 ? (48 - far) / 16 : 1);
  }
  for (const id of [...remoteModels.keys()]) {
    if (!net.players.has(id)) removeRemote(id);
  }
}

function updateClouds(dt) {
  cloudGroup.visible = dim === 'overworld';
  if (!cloudGroup.visible) return;
  for (const m of cloudGroup.children) {
    m.position.x += m.userData.v * dt;
    if (m.position.x - camera.position.x > 170) m.position.x -= 340;
    if (m.position.x - camera.position.x < -170) m.position.x += 340;
  }
}

function updateRain(dt) {
  rain.visible = weatherMode === 'rain' && dim === 'overworld';
  if (!rain.visible) return;
  rain.position.set(camera.position.x, camera.position.y - 12, camera.position.z);
  const a = rainGeo.attributes.position.array;
  for (let i = 0; i < RAIN_N; i++) {
    a[i * 3 + 1] -= dt * 22;
    if (a[i * 3 + 1] < 0) {
      a[i * 3 + 1] = 30;
      a[i * 3] = (Math.random() - 0.5) * 44;
      a[i * 3 + 2] = (Math.random() - 0.5) * 44;
    }
  }
  rainGeo.attributes.position.needsUpdate = true;
}

initChat({
  player, inventory, mobs, scene,
  isCreative, applyGameMode,
  getWorld: () => world,
  getDim: () => dim,
  dims, worldOver,
  getTime: () => timeOfDay,
  setTime: (v) => setTimeOfDay(v),
  setRenderDist, getRenderDist: () => renderDist,
  setWeather: (m, s) => setWeather(m, s),
  getWeather: () => weatherMode,
  spawnPoint, seed, inSpawnZone,
  net, cycleCamera, toast, sfx,
  myName: () => (mpSession ? net.name : 'you'),
  isMP: () => !!mpSession,
  disconnectMP: () => { save(); try { net.disconnect(); } catch (e) {} try { sessionStorage.removeItem('webcraft_mp'); } catch (e) {} location.reload(); },
  afterTeleport, afterEdit,
  relock: relockPointer,
});

for (const w of [worldOver, worldNether, worldEnd]) { w.onRedstoneAction = dispatchRedstone; w._rsNow = 0; }

let mpJoinedOnce = false;
if (mpSession) {
  for (const w of [worldOver, worldNether, worldEnd]) {
    w.onEdit = (x, y, z, id) => {
      const f = w._rsData ? (w._rsData.get(x + ',' + y + ',' + z) || {}).f : undefined;
      queueEdit(w.dim, x, y, z, id, Number.isInteger(f) && f >= 0 ? f : undefined);
    };
  }
  // edits that never reached the server (offline session / dropped socket)
  // are restored and pushed again as soon as we are online
  outboxLoad(saved && saved.mpOutbox);
  net.connect(mpSession.addr, mpSession.name, {
    getPos: () => [player.pos.x, player.pos.y, player.pos.z],
    getYaw: () => player.yaw,
    getPitch: () => player.pitch,
    getDim: () => dim,
    getArmor: mpArmor,
    getHp: () => (player.dead ? 0 : Math.ceil(player.hp)),
    onWelcome: (m) => {
      if ((m.seed | 0) !== (mpSession.seed | 0)) {
        mpSession.seed = m.seed | 0;
        try { sessionStorage.setItem('webcraft_mp', JSON.stringify(mpSession)); } catch (e) {}
        try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
        location.reload();
        return;
      }
      if (m.name && m.name !== mpSession.name) {
        // the server renamed us (nickname already taken / not allowed chars)
        mpSession.name = m.name;
        try { sessionStorage.setItem('webcraft_mp', JSON.stringify(mpSession)); } catch (e) {}
      }
      const first = !mpJoinedOnce;
      mpJoinedOnce = true;
      toast(first ? `Connected to ${m.server || 'server'} as ${m.name}` : `Reconnected to ${m.server || 'server'}`, 3);
      chatSys(`Connected to ${m.server || 'server'} — ${m.players.length + 1} online as ${m.name}`);
      setWeather(m.weather === 'rain' ? 'rain' : 'clear', 0, true);
      if (typeof m.time === 'number') timeOfDay = m.time;
      flushOutbox(true);
      mpSendPos(true);
    },
    onStatus: (st) => {
      if (st === 'reconnecting') chatSys('Connection lost — reconnecting…');
      tabListRowsSig = '';
    },
    onOpen: () => { flushOutbox(true); mpSendPos(true); },
    onSynced: () => { flushOutbox(true); },
    onAck: (batch) => ackBatch(batch),
    onPlayers: () => { tabListRowsSig = ''; },
    onLeave: (id) => removeRemote(id),
    onChat: (from, text) => chatMessage(`<${from}> ${text}`),
    onMe: (from, text) => chatMessage(`* ${from} ${text}`, '#d0d0d0'),
    onTell: (from, text) => chatMessage(`[${from} \u2192 you] ${text}`, '#f0a0f0'),
    onSys: (text) => chatMessage(text, '#ffff55'),
    onSets: (list) => {
      const worlds = [worldOver, worldNether, worldEnd];
      for (const w of worlds) w._muteEdit = true;
      try {
        for (const s of list) {
          const w = s.dim === 'nether' ? worldNether : s.dim === 'end' ? worldEnd : worldOver;
          // applyRemoteEdit also stores edits for chunks that are not loaded yet,
          // otherwise a friend's build (or the join snapshot) is lost until reload
          w.applyRemoteEdit(s.x, s.y, s.z, s.id);
          if (Number.isInteger(s.f) && s.f >= 0 && s.f <= 5) {
            if (!w._rsData) w._rsData = new Map();
            const k = s.x + ',' + s.y + ',' + s.z;
            const st = w._rsData.get(k) || {};
            st.f = s.f;
            w._rsData.set(k, st);
          }
        }
      } finally {
        for (const w of worlds) w._muteEdit = false;
      }
    },
    onTime: (t) => { if (Math.abs(t - timeOfDay) > 0.004) timeOfDay = t; },
    onWeather: (mode) => setWeather(mode, 0, true),
    onAct: (id, act) => { const r = remoteModels.get(id); if (r && act === 'swing') r.swingT = 0; },
    // PvP: somebody was hit. Me -> take damage + knockback; someone else -> show it
    onHurt: (m) => {
      if (m.id === net.myId) {
        if (m.by) lastPlayerAttacker = m.by;
        player.damage(Math.max(1, m.dmg | 0), simTime, 'attack');
        if (!player.dead) {
          const k = m.crit ? 9 : 6;
          player.vel.x += (m.kx || 0) * k;
          player.vel.z += (m.kz || 0) * k;
          if (m.crit) player.vel.y = Math.max(player.vel.y, 4.2);
          player.onGround = false;
          chatMessage(`${m.by} hit you for ${m.dmg}`, '#ffb0b0');
        }
      } else {
        const r = remoteModels.get(m.id);
        if (r) {
          const g = r.group.position;
          particles.burst(g.x, g.y + 1.1, g.z, [0.85, 0.22, 0.22], 9, 3);
          if (m.crit) particles.burst(g.x, g.y + 1.3, g.z, [1, 0.85, 0.25], 8, 3.5);
          r.hurtT = 0;   // short red flash on the model
        }
      }
    },
    onDrop: (m) => {
      if (!m || !ITEMS[m.id]) return;
      if (![m.x, m.y, m.z].every(Number.isFinite)) return;
      const es = drops.spawn(m.id, Math.max(1, Math.min(64, m.n | 0)), m.x, m.y, m.z, { stack: true, ttl: 90, dmg: m.dmg | 0, nid: String(m.nid || ''), tag: m.tag || null });
      if (es && es[0]) es[0].vel = { x: +m.vx || 0, y: (+m.vy || 0) + 1, z: +m.vz || 0 };
    },
    onGone: (nid) => drops.removeByNid(nid),
    onKick: (reason) => {
      toast('Kicked: ' + reason, 4);
      chatErr('Kicked: ' + reason);
    },
    onError: () => chatSys('Server unreachable — retrying…'),
    onClose: (why) => {
      if (why) { toast('Disconnected from server', 3); chatSys('Disconnected from server'); }
      for (const id of [...remoteModels.keys()]) removeRemote(id);
      tabListRowsSig = '';
    },
  });

  // keep the position flowing even when the tab is in the background (the
  // browser pauses requestAnimationFrame there, which used to look like a
  // frozen/absent player for everyone else, and eventually timed players out)
  setInterval(() => { if (!document.hidden) mpSendPos(); }, 100);
  setInterval(() => { if (document.hidden) mpSendPos(); net.pingTick(); }, 1000);
  document.addEventListener('visibilitychange', () => {
    net.setBackground(document.hidden);
    if (!document.hidden) { mpSendPos(true); if (!net.online && net.status === 'reconnecting') net.connect(net.addr, net.name, net.ev); }
  });
}

// ---------------------------------------------------------------------------
// Debug hooks (used by automated tests; harmless in production)



window.__game = {
  world, player, mobs, camera, renderer, particles, keys, inventory, drops, furnaces,
  setTime: (t) => { timeOfDay = t; },
  getTime: () => timeOfDay,
  getDaylight: () => daylight,
  forceStart: () => { forceStarted = true; started = true; overlay.classList.add('hidden'); },
  currentTarget, setSelected, useHeld, igniteTnt,
  // what the PvP ray currently sees (used by the tests)
  rsLastScan: () => rsLastScan(),
  pvpProbe: (maxT = 4.5) => {
    const eye = player.eye(), dir = player.forwardDir();
    const h = raycastRemotePlayers(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, maxT);
    return {
      hit: h ? { id: h.id, t: +h.t.toFixed(2) } : null,
      eye: [+eye.x.toFixed(2), +eye.y.toFixed(2), +eye.z.toFixed(2)],
      dir: [+dir.x.toFixed(2), +dir.y.toFixed(2), +dir.z.toFixed(2)],
      remotes: [...remoteModels.entries()].map(([id, r]) => ({ id, vis: r.group.visible, pos: [+r.group.position.x.toFixed(2), +r.group.position.y.toFixed(2), +r.group.position.z.toFixed(2)] })),
      myId: net.myId, online: net.online,
    };
  },
  // one real attack tick through the normal code path (used by the tests)
  attackOnce: () => {
    dbgLastAttack = null;
    punchCd = -1; breakingHeld = true;
    try { updateMining(0.016); } finally { breakingHeld = false; }
    return dbgLastAttack || { kind: 'none', dead: player.dead, hp: player.hp, online: !!(mpSession && net.online) };
  },
  give: (id, n = 1) => inventory.add(id, n),
  breakTarget: () => {
    const hit = currentTarget();
    if (!hit) return null;
    const info = breakInfo(hit.id, heldId());
    if (!info) return null;
    finishBreak(hit, info);
    return hit;
  },
  openInventory, closeInventory, matchGrid,
  I, ITEMS, RECIPES, B, BLOCKS, PALETTE_IDS, atlasCanvas, ATLAS_COLS, SMELTING,
  setCraftCells: (cells) => {
    inventory.craft = cells.slice(0, 9).map(id => (id == null ? null : { id, n: 1 }));
    while (inventory.craft.length < 9) inventory.craft.push(null);
    inventory._c();
  },
  getCraftState: () => ({ craftSize, craft: inventory.craft.map(s => (s ? [s.id, s.n] : null)), cursor: inventory.cursor, match: currentRecipe() }),
  craftFromGrid: () => takeResult(true),
  takeResult, dropStacks,
  slotClick: (area, idx, btn, shift) => {
    if (shift) inventory.quickMove(area, idx);
    else if (btn === 2) inventory.rightClick(area, idx);
    else inventory.leftClick(area, idx);
  },
  suppressSave: () => { wipeSave = true; },
  saveNow: () => { save(); return true; },
  getSaveKey: () => SAVE_KEY,
  setGameMode: (m) => applyGameMode(m, { silent: true }),
  cycleCamera, getCamMode: () => camMode,
  chat: submitChat, net, setWeather, isMP,
  // multiplayer introspection (used by the automated tests)
  mpState: () => ({
    isMP: !!mpSession, online: net.online, status: net.status, ping: net.ping,
    myId: net.myId, name: net.name, server: net.server, seed: net.seed,
    players: [...net.players.values()].map(q => ({ id: q.id, name: q.name, dim: q.dim, p: q.p, hp: q.hp })),
    remotes: [...remoteModels.entries()].map(([id, r]) => ({
      id, visible: r.group.visible, inScene: !!r.group.parent,
      pos: [+r.group.position.x.toFixed(2), +r.group.position.y.toFixed(2), +r.group.position.z.toFixed(2)],
    })),
    outbox: editOutbox.size, tabOpen: tabListShown,
  }),
  showTabList,
  getGameMode: () => player.gameMode,
  getDim: () => dim,
  switchDimension, setDimension, tryLightPortal, dims,
  enterEnd, leaveEnd, checkEndPortalComplete, throwPearl,
  shootArrow, arrows, scatterInventory,
  getDragon: () => dragon,
  chests, fillChestLoot,
  getStronghold: () => worldOver.stronghold,
  villageInfo: (gx, gz) => worldOver.villageInfo(gx, gz),
  isDragonDefeated: () => dragonDefeated,
  setDragonDefeated: (v) => { dragonDefeated = !!v; },
  respawnDragon: () => { if (!dragon) { dragon = new Dragon(scene); dragon.onDeath = onDragonDeath; dragon.group.visible = dim === 'end'; } },
  state: () => ({ breakingHeld, placingHeld, mining: mining && { ...mining }, invOpen, locked, forceStarted, punchCd }),
  setBreaking: (v) => { breakingHeld = v; },
  step: (dt = 0.05, n = 1) => { for (let i = 0; i < n; i++) frame(dt); },
};

// everything is declared now — start the render/simulation loop
animate();
