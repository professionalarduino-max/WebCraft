// Chunked voxel world: terrain generation (biomes, caves, ores, trees),
// block get/set with edit tracking, and chunk meshing with baked ambient occlusion.

import * as THREE from 'three';
import { Perlin, fbm2, hash2, hash3 } from './noise.js';
import { B, BLOCKS, isOpaque, tileUV, blockBoxes, emitBox, emitCross } from './blocks.js';
import { updatePower, rsTouch as rsMechTouch, rsObserve } from './redstone.js';

export const CHUNK = 16;
export const HEIGHT = 80;
export const SEA = 30;

const AO_VALS = [1.0, 0.8, 0.64, 0.5];

// Face table: dir, 4 corners [x,y,z,u,v] (CCW from outside), base shade.
const FACES = [
  { dir: [1, 0, 0], shade: 0.8, corners: [[1, 0, 1, 0, 0], [1, 0, 0, 1, 0], [1, 1, 0, 1, 1], [1, 1, 1, 0, 1]] },
  { dir: [-1, 0, 0], shade: 0.8, corners: [[0, 0, 0, 0, 0], [0, 0, 1, 1, 0], [0, 1, 1, 1, 1], [0, 1, 0, 0, 1]] },
  { dir: [0, 1, 0], shade: 1.0, corners: [[0, 1, 1, 0, 0], [1, 1, 1, 1, 0], [1, 1, 0, 1, 1], [0, 1, 0, 0, 1]] },
  { dir: [0, -1, 0], shade: 0.55, corners: [[0, 0, 0, 0, 0], [1, 0, 0, 1, 0], [1, 0, 1, 1, 1], [0, 0, 1, 0, 1]] },
  { dir: [0, 0, 1], shade: 0.72, corners: [[0, 0, 1, 0, 0], [1, 0, 1, 1, 0], [1, 1, 1, 1, 1], [0, 1, 1, 0, 1]] },
  { dir: [0, 0, -1], shade: 0.72, corners: [[1, 0, 0, 0, 0], [0, 0, 0, 1, 0], [0, 1, 0, 1, 1], [1, 1, 0, 0, 1]] },
];

const key = (cx, cz) => cx + ',' + cz;

export class World {
  constructor(seed, scene, materials, renderDist = 4, dim = 'overworld', opts = {}) {
    this.seed = seed | 0;
    this.dim = dim;
    this.gen = dim === 'overworld' ? (opts.gen || 'normal') : 'normal'; // normal | flat | oneblock
    this.mpSpawn = !!opts.mpSpawn; // multiplayer: generate the beautiful spawn plaza
    this.scene = scene;
    this.materials = materials; // {opaque, water, lava}
    this.renderDist = renderDist;
    this.chunks = new Map();    // key -> {cx, cz, data, meshO, meshW, hasMesh}
    this.edits = new Map();     // chunkKey -> Map("lx,y,lz" -> id)
    this.dirty = new Set();
    this.pNoise = new Perlin(this.seed);
    this.pNoise2 = new Perlin(this.seed + 101);
    this.pCave1 = new Perlin(this.seed + 202);
    this.pCave2 = new Perlin(this.seed + 303);
    this._frame = 0;
    // one stronghold per overworld, a few hundred blocks out
    if (dim === 'overworld') {
      const a = hash2(this.seed, 991, this.seed) * Math.PI * 2;
      const d = 350 + hash2(this.seed, 177, this.seed) * 250;
      this.stronghold = { x: Math.round(Math.cos(a) * d), z: Math.round(Math.sin(a) * d), y: 21 };
    }
  }

  hasEdit(x, y, z) {
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    const ce = this.edits.get(key(cx, cz));
    return !!(ce && ce.has((x - cx * CHUNK) + ',' + y + ',' + (z - cz * CHUNK)));
  }

  // --- terrain shape -------------------------------------------------------

  columnInfo(x, z) {
    const p = this.pNoise, q = this.pNoise2;
    const hills = fbm2(p, x * 0.02, z * 0.02, 4);
    const continent = fbm2(p, x * 0.006 + 500, z * 0.006 + 500, 4);
    let h = 34 + hills * 7 + continent * 30;
    const mountain = fbm2(q, x * 0.0035 + 300, z * 0.0035 - 300, 3);
    if (mountain > 0.12) h += (mountain - 0.12) * 130;
    h = Math.round(Math.max(4, Math.min(HEIGHT - 8, h)));

    const desert = fbm2(q, x * 0.0045 + 1000, z * 0.0045 - 1000, 2) > 0.28 && h > SEA && h < 52;
    const cold = !desert && fbm2(q, x * 0.0028 + 2000, z * 0.0028 - 2000, 2) > 0.42;
    const snowy = h >= 62 || (cold && h > SEA);
    let treeDensity = 0, treeType = 'oak';
    if (!desert && h > SEA + 1) {
      if (snowy || cold) {
        if (h < 60) { treeDensity = 0.012; treeType = 'spruce'; }
      } else if (h < 58) {
        const forest = fbm2(p, x * 0.008 - 800, z * 0.008 + 800, 2);
        treeDensity = forest > 0.15 ? 0.035 : 0.005;
      }
    }
    return { h, desert, snowy, cold, treeDensity, treeType };
  }

  caveAt(x, y, z) {
    const n1 = this.pCave1.noise3(x * 0.045, y * 0.07, z * 0.045);
    const n2 = this.pCave2.noise3(x * 0.045, y * 0.07, z * 0.045);
    return n1 * n1 + n2 * n2 < 0.012;
  }

  // Nether: netherrack floor + ceiling with a cavernous middle, lava ocean,
  // and noise pillars connecting them.
  genNetherChunk(cx, cz) {
    const data = new Uint16Array(CHUNK * CHUNK * HEIGHT);
    const p = this.pNoise;
    const LAVA_SEA = 26;
    const baseX = cx * CHUNK, baseZ = cz * CHUNK;
    for (let lz = 0; lz < CHUNK; lz++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        const wx = baseX + lx, wz = baseZ + lz;
        const floorH = Math.round(24 + fbm2(p, wx * 0.02, wz * 0.02, 3) * 12);
        const ceilH = Math.round(58 + fbm2(p, wx * 0.015 + 700, wz * 0.015 - 700, 3) * 10);
        for (let y = 0; y < HEIGHT; y++) {
          let id = B.AIR;
          if (y <= 1 || y >= HEIGHT - 2) id = B.BEDROCK;
          else if (y <= floorH || y >= ceilH) id = B.NETHERRACK;
          else if (this.pCave1.noise3(wx * 0.05, y * 0.05, wz * 0.05) > 0.42) id = B.NETHERRACK; // pillars
          else if (y <= LAVA_SEA) id = B.LAVA;
          if (id === B.NETHERRACK) {
            const h = hash3(wx, y, wz, this.seed ^ 0x33f1);
            if (h < 0.014) id = B.QUARTZ_ORE;
            else if (h < 0.0168) id = B.NETHER_GOLD_ORE;
            else if (y <= floorH + 2 && y >= floorH - 1) {
              // floor biomes: slow noise picks blackstone / soul sand, faster noise
              // scatters basalt patches and magma crust
              const region = fbm2(p, wx * 0.012 + 11, wz * 0.012 - 7, 2);
              const patch = fbm2(p, wx * 0.09 - 5, wz * 0.09 + 3, 2);
              if (region < -0.3) id = B.BLACKSTONE;
              else if (region > 0.28 && patch > 0.3) id = B.SOUL_SAND;
              else if (patch < -0.45) id = B.BASALT;
              else if (patch > 0.55 && y >= floorH) id = B.MAGMA;
            } else if (y > 26 && y < 42 && hash3(wx >> 2, y >> 2, wz >> 2, this.seed ^ 0x55aa) < 0.0035) {
              id = B.ANCIENT_DEBRIS;   // very rare, only in the deep layers
            }
          } else if (id === B.AIR && y >= ceilH - 2) {
            // glowstone clusters hang under the ceiling, shroomlight is rarer
            const h = hash3(wx >> 1, y >> 1, wz >> 1, this.seed ^ 0x9d5);
            if (h < 0.05) id = B.GLOWSTONE;
            else if (h < 0.058) id = B.SHROOMLIGHT;
          } else if (id === B.AIR && y < ceilH) {
            // basalt stalactites under the ceiling
            const spike = hash3(wx, 3, wz, this.seed ^ 0x7a11) < 0.045
              ? 2 + ((hash3(wx, 5, wz, this.seed ^ 0x1c) * 5) | 0) : 0;
            if (spike && y >= ceilH - spike) id = B.BASALT;
          }
          data[lx + lz * CHUNK + y * CHUNK * CHUNK] = id;
        }
      }
    }
    const ce = this.edits.get(key(cx, cz));
    if (ce) {
      for (const [lkey, id] of ce) {
        const [lx, y, lz] = lkey.split(',').map(Number);
        if (lx >= 0 && lx < CHUNK && y >= 0 && y < HEIGHT && lz >= 0 && lz < CHUNK)
          data[lx + lz * CHUNK + y * CHUNK * CHUNK] = id;
      }
    }
    return data;
  }

  // The End: a floating end-stone island in the void, ringed by obsidian pillars.
  genEndChunk(cx, cz) {
    const data = new Uint16Array(CHUNK * CHUNK * HEIGHT);
    const p = this.pNoise;
    const baseX = cx * CHUNK, baseZ = cz * CHUNK;
    // obsidian pillar ring (deterministic positions)
    const pillars = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      pillars.push({ x: Math.round(Math.cos(a) * 26), z: Math.round(Math.sin(a) * 26), top: 50 + (i % 3) * 4 });
    }
    // ruined towers: a deterministic ring, radius stays well inside the island
    const ruins = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + hash3(i, 1, 0, this.seed ^ 0x77) * 0.5;
      const rad = 9 + (i % 3) * 10;   // 9 / 19 / 29 blocks from the center
      ruins.push({ x: Math.round(Math.cos(a) * rad), z: Math.round(Math.sin(a) * rad) });
    }
    for (let lz = 0; lz < CHUNK; lz++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        const wx = baseX + lx, wz = baseZ + lz;
        const dist = Math.hypot(wx, wz);
        const R = 46 + fbm2(p, wx * 0.04, wz * 0.04, 3) * 7;
        if (dist < R) {
          const edge = 1 - dist / R; // 1 at center, 0 at rim
          const topY = Math.round(38 + fbm2(p, wx * 0.05 + 300, wz * 0.05 - 300, 3) * 3 - (1 - edge) * 4);
          const botY = Math.round(38 - edge * 16 - fbm2(p, wx * 0.06 - 900, wz * 0.06 + 900, 2) * 5);
          for (let y = Math.max(1, botY); y <= Math.min(HEIGHT - 2, topY); y++) {
            data[lx + lz * CHUNK + y * CHUNK * CHUNK] = B.END_STONE;
          }
        }
        for (const pil of pillars) {
          if (Math.hypot(wx - pil.x, wz - pil.z) < 2.6) {
            for (let y = 30; y <= pil.top; y++) {
              data[lx + lz * CHUNK + y * CHUNK * CHUNK] = B.OBSIDIAN;
            }
          }
        }
        // purpur ruins: a ring of small ruined towers of End stone bricks,
        // purpur and end rods, always on the island
        if (dist < R) {
          for (let ri = 0; ri < ruins.length; ri++) {
            const ru = ruins[ri];
            const dx = wx - ru.x, dz = wz - ru.z;
            if (Math.abs(dx) <= 2 && Math.abs(dz) <= 2) {
              const edge = Math.abs(dx) === 2 || Math.abs(dz) === 2;
              const corner = Math.abs(dx) === 2 && Math.abs(dz) === 2;
              let baseY = -1;
              for (let y = Math.min(HEIGHT - 3, 60); y >= 2; y--) {
                if (data[lx + lz * CHUNK + y * CHUNK * CHUNK] === B.END_STONE) { baseY = y; break; }
              }
              if (baseY > 0) {
                const H = 5 + ((hash3(ri, 9, 0, this.seed ^ 0xcc) * 3) | 0);
                for (let y = baseY + 1; y <= baseY + H && y < HEIGHT - 2; y++) {
                  const idx = lx + lz * CHUNK + y * CHUNK * CHUNK;
                  if (y === baseY + H) { data[idx] = corner ? B.PURPUR_PILLAR : B.PURPUR; continue; }
                  if (corner) data[idx] = (y - baseY) % 3 === 0 ? B.PURPUR_PILLAR : B.END_STONE_BRICK;
                  else if (edge) data[idx] = B.END_STONE_BRICK;
                }
                if (corner && baseY + H + 1 < HEIGHT - 2) {
                  data[lx + lz * CHUNK + (baseY + H + 1) * CHUNK * CHUNK] = B.END_ROD;
                }
              }
            }
          }
        }
      }
    }
    const ce = this.edits.get(key(cx, cz));
    if (ce) {
      for (const [lkey, id] of ce) {
        const [lx, y, lz] = lkey.split(',').map(Number);
        if (lx >= 0 && lx < CHUNK && y >= 0 && y < HEIGHT && lz >= 0 && lz < CHUNK)
          data[lx + lz * CHUNK + y * CHUNK * CHUNK] = id;
      }
    }
    return data;
  }

  genChunkData(cx, cz) {
    if (this.dim === 'nether') return this.genNetherChunk(cx, cz);
    if (this.dim === 'end') return this.genEndChunk(cx, cz);
    if (this.gen === 'flat') return this.genFlatChunk(cx, cz);
    if (this.gen === 'oneblock') return this.genOneblockChunk(cx, cz);
    const data = new Uint16Array(CHUNK * CHUNK * HEIGHT);
    const PAD = 3; // extra columns so trees from neighbor chunks reach in
    const W = CHUNK + PAD * 2;
    const cols = new Array(W * W);
    const baseX = cx * CHUNK, baseZ = cz * CHUNK;
    for (let dz = -PAD; dz < CHUNK + PAD; dz++) {
      for (let dx = -PAD; dx < CHUNK + PAD; dx++) {
        cols[(dz + PAD) * W + (dx + PAD)] = this.columnInfo(baseX + dx, baseZ + dz);
      }
    }
    const colAt = (lx, lz) => cols[(lz + PAD) * W + (lx + PAD)];

    // base terrain
    for (let lz = 0; lz < CHUNK; lz++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        const wx = baseX + lx, wz = baseZ + lz;
        const { h, desert, snowy, cold } = colAt(lx, lz);
        const beach = h <= SEA + 1;
        for (let y = 0; y < HEIGHT; y++) {
          let id = B.AIR;
          if (y === 0 || (y === 1 && hash3(wx, y, wz, this.seed) < 0.5)) {
            id = B.BEDROCK;
          } else if (y <= h) {
            const carveOK = y > 2 && (h >= SEA + 2 ? true : y < h - 4);
            if (carveOK && this.caveAt(wx, y, wz)) {
              id = y <= 11 ? B.LAVA : B.AIR; // lava lakes in the deepest caves
            } else if (y < h - 3) {
              if (this.pCave2.noise3(wx * 0.09 + 80, y * 0.09, wz * 0.09 + 80) > 0.56) {
                id = B.GRAVEL; // gravel pockets
              } else {
                id = B.STONE;
                const r = hash3(wx, y, wz, this.seed ^ 0x51ab);
                if (r < 0.0025 && y < 14) id = B.DIAMOND_ORE;
                else if (r < 0.0036 && y < 16) id = B.EMERALD_ORE;
                else if (r < 0.006 && y < 22) id = B.GOLD_ORE;
                else if (r < 0.009 && y < 16) id = B.REDSTONE_ORE;
                else if (r < 0.011 && y < 26) id = B.LAPIS_ORE;
                else if (r < 0.0185 && y < 36) id = B.IRON_ORE;
                else if (r < 0.0305 && y < 52) id = B.COAL_ORE;
              }
            } else if (y < h) {
              // clay patches line lake and ocean beds
              if (h <= SEA && fbm2(this.pNoise2, wx * 0.06 + 3000, wz * 0.06 - 3000, 2) > 0.42) id = B.CLAY;
              else id = (desert || beach) ? B.SAND : B.DIRT;
            } else { // y === h, surface
              if (desert || beach) id = B.SAND;
              else if (snowy) id = B.SNOW;
              else id = B.GRASS;
            }
          } else if (y <= SEA) {
            id = (y === SEA && cold) ? B.ICE : B.WATER; // frozen lakes in cold biomes
          }
          data[lx + lz * CHUNK + y * CHUNK * CHUNK] = id;
        }
      }
    }

    // trees (deterministic per world column; candidates include padding so
    // canopies crossing chunk borders generate consistently)
    const set = (lx, y, lz, id, onlyAir) => {
      if (lx < 0 || lx >= CHUNK || lz < 0 || lz >= CHUNK || y < 0 || y >= HEIGHT) return;
      const i = lx + lz * CHUNK + y * CHUNK * CHUNK;
      if (onlyAir && data[i] !== B.AIR) return;
      data[i] = id;
    };
    for (let dz = -PAD; dz < CHUNK + PAD; dz++) {
      for (let dx = -PAD; dx < CHUNK + PAD; dx++) {
        const info = colAt(dx, dz);
        if (info.treeDensity <= 0) continue;
        const wx = baseX + dx, wz = baseZ + dz;
        if (hash2(wx, wz, this.seed ^ 0x9e37) >= info.treeDensity) continue;
        const h = info.h;
        // forests mix in the occasional birch; cold biomes grow spruce
        const type = info.treeType === 'spruce' ? 'spruce'
          : hash2(wx, wz, this.seed + 29) < 0.15 ? 'birch' : 'oak';
        const log = type === 'spruce' ? B.SPRUCE_LOG : type === 'birch' ? B.BIRCH_LOG : B.LOG;
        set(dx, h, dz, B.DIRT, false);
        if (type === 'spruce') {
          // tall conical canopy
          const th = 5 + ((hash2(wx, wz, this.seed + 7) * 3) | 0);
          for (let dy = 1; dy <= th; dy++) set(dx, h + dy, dz, log, false);
          set(dx, h + th + 1, dz, B.LEAVES, true);
          for (let dy = th - 4; dy <= th; dy++) {
            const r = (th - dy) % 2 === 0 ? 1 : 2;
            for (let ox = -r; ox <= r; ox++) {
              for (let oz = -r; oz <= r; oz++) {
                if (ox === 0 && oz === 0) continue;
                if (r === 2 && Math.abs(ox) === 2 && Math.abs(oz) === 2) continue;
                set(dx + ox, h + dy, dz + oz, B.LEAVES, true);
              }
            }
          }
          continue;
        }
        const th = 4 + ((hash2(wx, wz, this.seed + 7) * 3) | 0);
        for (let dy = 1; dy <= th; dy++) set(dx, h + dy, dz, log, false);
        for (let dy = th - 2; dy <= th + 1; dy++) {
          const r = dy <= th - 1 ? 2 : 1;
          for (let ox = -r; ox <= r; ox++) {
            for (let oz = -r; oz <= r; oz++) {
              if (ox === 0 && oz === 0 && dy <= th) continue;
              if (Math.abs(ox) === r && Math.abs(oz) === r) {
                if (dy === th + 1) continue;
                if (hash3(wx + ox, h + dy, wz + oz, this.seed) < 0.5) continue;
              }
              set(dx + ox, h + dy, dz + oz, B.LEAVES, true);
            }
          }
        }
      }
    }

    // surface decorations: flowers, pumpkins, melons, cacti
    for (let lz = 0; lz < CHUNK; lz++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        const { h, desert, snowy, treeDensity } = colAt(lx, lz);
        if (h <= SEA || h + 3 >= HEIGHT) continue;
        const wx = baseX + lx, wz = baseZ + lz;
        const idx = lx + lz * CHUNK;
        const ground = data[idx + h * CHUNK * CHUNK];
        const above = data[idx + (h + 1) * CHUNK * CHUNK];
        if (above !== B.AIR) continue;
        const r = hash2(wx, wz, this.seed ^ 0x77aa);
        if (desert && ground === B.SAND) {
          if (r < 0.006) {
            const ht = 1 + ((hash2(wx, wz, this.seed + 21) * 3) | 0);
            for (let dy = 1; dy <= ht; dy++) data[idx + (h + dy) * CHUNK * CHUNK] = B.CACTUS;
          } else if (r < 0.010 && h <= SEA + 1) {
            const ht = 1 + ((hash2(wx, wz, this.seed + 22) * 2) | 0);
            for (let dy = 1; dy <= ht; dy++) data[idx + (h + dy) * CHUNK * CHUNK] = B.SUGAR_CANE;
          }
        } else if (!snowy && ground === B.GRASS) {
          if (r < 0.016) {
            const fr = hash2(wx, wz, this.seed + 33);
            data[idx + (h + 1) * CHUNK * CHUNK] =
              fr < 0.3 ? B.DANDELION : fr < 0.55 ? B.POPPY : fr < 0.7 ? B.BLUE_ORCHID : fr < 0.82 ? B.ALLIUM : fr < 0.91 ? B.RED_MUSHROOM : B.BROWN_MUSHROOM;
          } else if (r < 0.0175) {
            data[idx + (h + 1) * CHUNK * CHUNK] = B.PUMPKIN;
          } else if (r < 0.019 && treeDensity > 0.02) {
            data[idx + (h + 1) * CHUNK * CHUNK] = B.MELON;
          } else if (r < 0.021 && h <= SEA + 1) {
            const ht = 1 + ((hash2(wx, wz, this.seed + 79) * 2) | 0);
            for (let dy = 1; dy <= ht && h + dy < HEIGHT; dy++) data[idx + (h + dy) * CHUNK * CHUNK] = B.SUGAR_CANE;
          }
        }
      }
    }

    // structures (villages, stronghold), then player edits on top
    this.genVillages(data, cx, cz);
    if (this.mpSpawn) this.genSpawnPlaza(data, cx, cz);
    this.genStronghold(data, cx, cz);
    this.applyEdits(data, cx, cz);
    return data;
  }

  // player edits on top of generated terrain
  applyEdits(data, cx, cz) {
    const ce = this.edits.get(key(cx, cz));
    if (ce) {
      for (const [lkey, id] of ce) {
        const [lx, y, lz] = lkey.split(',').map(Number);
        if (lx >= 0 && lx < CHUNK && y >= 0 && y < HEIGHT && lz >= 0 && lz < CHUNK)
          data[lx + lz * CHUNK + y * CHUNK * CHUNK] = id;
      }
    }
  }

  // superflat: bedrock + dirt + grass, no caves/trees/ores
  genFlatChunk(cx, cz) {
    const data = new Uint16Array(CHUNK * CHUNK * HEIGHT);
    for (let lz = 0; lz < CHUNK; lz++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        const i = lx + lz * CHUNK;
        data[i] = B.BEDROCK;
        data[i + CHUNK * CHUNK] = B.DIRT;
        data[i + 2 * CHUNK * CHUNK] = B.DIRT;
        data[i + 3 * CHUNK * CHUNK] = B.GRASS;
      }
    }
    this.applyEdits(data, cx, cz);
    return data;
  }

  // one block: void with a 5x5 safety platform + the infinite block at (0,63,0)
  genOneblockChunk(cx, cz) {
    const data = new Uint16Array(CHUNK * CHUNK * HEIGHT); // all AIR
    if (cx === 0 && cz === 0) {
      for (let lx = 0; lx <= 4; lx++) {
        for (let lz = 0; lz <= 4; lz++) {
          data[lx + lz * CHUNK + 62 * CHUNK * CHUNK] = B.COBBLE;
        }
      }
      data[63 * CHUNK * CHUNK] = B.GRASS; // the infinite block at (0,63,0)
    }
    this.applyEdits(data, cx, cz);
    return data;
  }

  // --- structures ------------------------------------------------------------

  // Deterministic village layout for a 320-block grid cell (or null).
  villageInfo(gx, gz) {
    if (hash2(gx, gz, this.seed ^ 0x7a11) > 0.42) return null;
    const cx = gx * 320 + 60 + Math.floor(hash2(gx, gz, this.seed + 3) * 200);
    const cz = gz * 320 + 60 + Math.floor(hash2(gx, gz, this.seed + 7) * 200);
    const c = this.columnInfo(cx, cz);
    if (c.desert || c.snowy || c.h < SEA + 2 || c.h > 50) return null;
    const houses = [];
    const spots = [[0, 0], [-13, -11], [11, -13], [-12, 12], [13, 11]];
    for (let i = 0; i < spots.length; i++) {
      const hx = cx + spots[i][0] + Math.floor(hash2(gx * 5 + i, gz, this.seed + 11) * 5) - 2;
      const hz = cz + spots[i][1] + Math.floor(hash2(gx, gz * 5 + i, this.seed + 13) * 5) - 2;
      const hc = this.columnInfo(hx, hz);
      if (hc.desert || hc.snowy || hc.h < SEA + 2 || Math.abs(hc.h - c.h) > 5) continue;
      houses.push({ x: hx, z: hz, y: hc.h, chest: houses.length === 0 });
    }
    return houses.length >= 2 ? { x: cx, z: cz, houses } : null;
  }

  genVillages(data, cx, cz) {
    const set = (wx, y, wz, id) => {
      const lx = wx - cx * CHUNK, lz = wz - cz * CHUNK;
      if (lx < 0 || lx >= CHUNK || lz < 0 || lz >= CHUNK || y < 0 || y >= HEIGHT) return;
      data[lx + lz * CHUNK + y * CHUNK * CHUNK] = id;
    };
    const minGX = Math.floor(cx * CHUNK / 320), maxGX = Math.floor((cx * CHUNK + 15) / 320);
    const minGZ = Math.floor(cz * CHUNK / 320), maxGZ = Math.floor((cz * CHUNK + 15) / 320);
    for (let gx = minGX - 1; gx <= maxGX + 1; gx++) {
      for (let gz = minGZ - 1; gz <= maxGZ + 1; gz++) {
        const v = this.villageInfo(gx, gz);
        if (!v) continue;
        for (const h of v.houses) {
          // skip houses that can't touch this chunk (footprint radius 3)
          if (h.x + 3 < cx * CHUNK || h.x - 3 > cx * CHUNK + 15) continue;
          if (h.z + 3 < cz * CHUNK || h.z - 3 > cz * CHUNK + 15) continue;
          this.buildHouse(set, h.x, h.y, h.z, h.chest);
        }
      }
    }
  }

  // Simple 5x5 plank cabin: log corners, glass windows, open doorway, chest.
  buildHouse(set, hx, hy, hz, withChest) {
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        // foundation + floor
        for (let y = hy - 3; y < hy; y++) set(hx + dx, y, hz + dz, B.COBBLE);
        set(hx + dx, hy, hz + dz, B.PLANK);
        const edgeX = Math.abs(dx) === 2, edgeZ = Math.abs(dz) === 2;
        for (let dy = 1; dy <= 3; dy++) {
          let id = B.AIR; // clear the interior (trees, hills…)
          if (edgeX && edgeZ) id = B.LOG;
          else if (edgeX || edgeZ) id = B.PLANK;
          set(hx + dx, hy + dy, hz + dz, id);
        }
        set(hx + dx, hy + 4, hz + dz, B.PLANK); // roof
      }
    }
    // doorway with a door on the south face, windows on east/west
    set(hx, hy + 1, hz - 2, B.DOOR + 3); // closed, panel flush with the south wall
    set(hx, hy + 2, hz - 2, B.DOOR_TOP);
    set(hx - 2, hy + 2, hz, B.GLASS);
    set(hx + 2, hy + 2, hz, B.GLASS);
    set(hx - 1, hy + 1, hz + 1, B.TORCH);
    if (withChest) set(hx + 1, hy + 1, hz + 1, B.CHEST);
  }

  genStronghold(data, cx, cz) {
    if (!this.stronghold) return;
    const { x: sx, z: sz } = this.stronghold;
    if (sx + 6 < cx * CHUNK || sx - 6 > cx * CHUNK + 15) return;
    if (sz + 6 < cz * CHUNK || sz - 6 > cz * CHUNK + 15) return;
    const set = (wx, y, wz, id) => {
      const lx = wx - cx * CHUNK, lz = wz - cz * CHUNK;
      if (lx < 0 || lx >= CHUNK || lz < 0 || lz >= CHUNK || y < 0 || y >= HEIGHT) return;
      data[lx + lz * CHUNK + y * CHUNK * CHUNK] = id;
    };
    // stone-brick chamber, y20 floor to y26 ceiling
    for (let dx = -6; dx <= 6; dx++) {
      for (let dz = -6; dz <= 6; dz++) {
        for (let y = 20; y <= 26; y++) {
          const shell = Math.abs(dx) === 6 || Math.abs(dz) === 6 || y === 20 || y === 26;
          set(sx + dx, y, sz + dz, shell ? B.STONE_BRICK : B.AIR);
        }
      }
    }
    // the dormant End portal ring (interior 3x3 at sx-1..sx+1)
    const ox = sx - 1, oz = sz - 1;
    for (let i = 0; i < 3; i++) {
      set(ox - 1, 21, oz + i, B.END_FRAME);
      set(ox + 3, 21, oz + i, B.END_FRAME);
      set(ox + i, 21, oz - 1, B.END_FRAME);
      set(ox + i, 21, oz + 3, B.END_FRAME);
    }
  }

  // --- chunk/block access --------------------------------------------------

  ensureData(cx, cz) {
    const k = key(cx, cz);
    let c = this.chunks.get(k);
    if (!c) {
      c = { cx, cz, data: this.genChunkData(cx, cz), meshO: null, meshW: null, hasMesh: false };
      this.chunks.set(k, c);
      this.rsScanChunk(c);
    }
    return c;
  }

  hasDataAt(wx, wz) {
    return this.chunks.has(key(Math.floor(wx / CHUNK), Math.floor(wz / CHUNK)));
  }

  getBlock(x, y, z) {
    if (y < 0) return B.BEDROCK;
    if (y >= HEIGHT) return B.AIR;
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    const c = this.chunks.get(key(cx, cz));
    if (!c) return B.AIR;
    const lx = x - cx * CHUNK, lz = z - cz * CHUNK;
    return c.data[lx + lz * CHUNK + y * CHUNK * CHUNK];
  }

  setBlock(x, y, z, id) {
    if (!BLOCKS[id] || y < 0 || y >= HEIGHT) return false;
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    const c = this.chunks.get(key(cx, cz));
    if (!c) return false;
    const lx = x - cx * CHUNK, lz = z - cz * CHUNK;
    const li = lx + lz * CHUNK + y * CHUNK * CHUNK;
    const old = c.data[li];
    c.data[li] = id;
    if (old !== id) this.rsTouch(x, y, z, old, id); // redstone registries
    if (old !== id) { try { rsObserve(this, x, y, z); } catch (e) {} } // watchers pulse
    if (old !== id) this.liquidTouch(x, y, z, old, id); // liquid flow queue

    const k = key(cx, cz);
    let ce = this.edits.get(k);
    if (!ce) { ce = new Map(); this.edits.set(k, ce); }
    ce.set(lx + ',' + y + ',' + lz, id);

    // mark dirty: this chunk + neighbors (incl. diagonals) when on a border,
    // since face culling and AO reach one block across.
    const dxs = lx === 0 ? [-1, 0] : lx === CHUNK - 1 ? [0, 1] : [0];
    const dzs = lz === 0 ? [-1, 0] : lz === CHUNK - 1 ? [0, 1] : [0];
    for (const dx of dxs) for (const dz of dzs) this.dirty.add(key(cx + dx, cz + dz));
    if (this.onEdit && !this._muteEdit) { try { this.onEdit(x, y, z, id); } catch (e) {} }
    if (old !== id && !this._rsLock) { // redstone networks recompute (guarded against recursion)
      this._rsLock = true;
      let acts = null;
      try { acts = updatePower(this, x, y, z); } catch (e) { console.warn('redstone', e); } finally { this._rsLock = false; }
      if (acts && acts.length && this.onRedstoneAction) for (const a of acts) { a.dim = this.dim; try { this.onRedstoneAction(a); } catch (e) {} }
    }
    return true;
  }

  // Edits that arrive from the server (another player, or the world snapshot
  // sent on join) often target chunks that are not loaded right now — a friend
  // building 500 blocks away, or the whole delta list you get when you rejoin.
  // setBlock() can only touch a loaded chunk, so those edits used to be dropped
  // silently and the terrain was then regenerated from the seed without them.
  // When the chunk is not loaded the edit goes straight into the edit map, which
  // applyEdits() replays as soon as the chunk is generated.
  applyRemoteEdit(x, y, z, id) {
    if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z)) return false;
    if (!Number.isInteger(id) || !BLOCKS[id] || y < 0 || y >= HEIGHT) return false;
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    if (this.chunks.has(key(cx, cz))) {
      const oldMute = this._muteEdit;   // never echo a remote edit back to the server
      this._muteEdit = true;
      try { return this.setBlock(x, y, z, id); } finally { this._muteEdit = oldMute; }
    }
    const lx = x - cx * CHUNK, lz = z - cz * CHUNK;
    const k = key(cx, cz);
    let ce = this.edits.get(k);
    if (!ce) { ce = new Map(); this.edits.set(k, ce); }
    ce.set(lx + ',' + y + ',' + lz, id);
    return true;
  }

  // liquid flow bookkeeping: fresh liquid is a full-strength source;
  // any change wakes adjacent liquids (dug a hole next to a lake -> it pours in)
  liquidTouch(x, y, z, old, id) {
    if (!this._liqQueue) { this._liqQueue = new Set(); this._liqDist = new Map(); }
    const k = x + ',' + y + ',' + z;
    if (id === B.WATER || id === B.LAVA) {
      this._liqQueue.add(k);
      this._liqDist.set(k, 0);
    } else if (old === B.WATER || old === B.LAVA) {
      this._liqDist.delete(k);
    }
    const nb = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    for (const [dx, dy, dz] of nb) {
      const nid = this.getBlock(x + dx, y + dy, z + dz);
      if (nid === B.WATER || nid === B.LAVA) this._liqQueue.add((x + dx) + ',' + (y + dy) + ',' + (z + dz));
    }
  }
  // redstone registries: sensors + pressed plates + timed buttons + lit notes
  rsKey(x, y, z) { return x + ',' + y + ',' + z; }
  rsTouch(x, y, z, old, id) {
    if (!this._rsSensors) {
      this._rsSensors = new Set(); this._rsPlates = new Set();
      this._rsButtons = new Map(); this._rsNotes = new Set();
    }
    const k = this.rsKey(x, y, z);
    if (old === B.SENSOR || old === B.SENSOR_ON) this._rsSensors.delete(k);
    if (id === B.SENSOR || id === B.SENSOR_ON) this._rsSensors.add(k); // both variants need dawn/dusk checks
    if (old === B.PLATE_ON && id !== B.PLATE_ON) this._rsPlates.delete(k);
    if (old === B.BUTTON_ON && id !== B.BUTTON_ON) this._rsButtons.delete(k);
    if (old === B.NOTE_BLOCK) this._rsNotes.delete(k);
    try { rsMechTouch(this, x, y, z, old, id); } catch (e) {}
  }
  // manual power recompute (comparator toggle, target expiry, follow-ups)
  rsUpdate(x, y, z) {
    if (this._rsLock) return;
    this._rsLock = true;
    let acts = null;
    try { acts = updatePower(this, x, y, z); } catch (e) { console.warn('redstone', e); } finally { this._rsLock = false; }
    if (acts && acts.length && this.onRedstoneAction) for (const a of acts) { a.dim = this.dim; try { this.onRedstoneAction(a); } catch (e) {} }
  }
  // facing/state map persistence (one per dimension, saved by main.js)
  rsDataSave() { return this._rsData ? [...this._rsData].slice(0, 20000) : []; }
  rsDataLoad(arr) {
    this._rsData = new Map();
    if (!Array.isArray(arr)) return;
    for (const [k, st] of arr) {
      if (typeof k !== 'string' || !st || typeof st !== 'object') continue;
      const clean = {};
      for (const f of ['f', 'd', 'm', 'e', 'last', 'piston']) if (Number.isInteger(st[f])) clean[f] = st[f];
      this._rsData.set(k, clean);
    }
  }
  rsScanChunk(c) { // rebuild registries for a freshly loaded chunk
    if (!this._rsSensors) {
      this._rsSensors = new Set(); this._rsPlates = new Set();
      this._rsButtons = new Map(); this._rsNotes = new Set();
    }
    const baseX = c.cx * CHUNK, baseZ = c.cz * CHUNK;
    for (let y = 0; y < HEIGHT; y++) for (let lz = 0; lz < CHUNK; lz++) for (let lx = 0; lx < CHUNK; lx++) {
      const id = c.data[lx + lz * CHUNK + y * CHUNK * CHUNK];
      const k = (baseX + lx) + ',' + y + ',' + (baseZ + lz);
      if (id === B.SENSOR || id === B.SENSOR_ON) this._rsSensors.add(k);
      else if (id === B.BUTTON_ON) this._rsButtons.set(k, 0); // stuck buttons release on next tick
      else if (id === B.PLATE_ON) this._rsPlates.add(k);
      else if (id === B.DISPENSER || id === B.DROPPER || id === B.HOPPER) {
        if (!this._rsMech) this._rsMech = new Set();
        this._rsMech.add(k);
      }
    }
  }

  // Highest non-air block; returns {y, id} or null.
  getSurface(x, z) {
    for (let y = HEIGHT - 1; y >= 0; y--) {
      const b = this.getBlock(x, y, z);
      if (b !== B.AIR) return { y, id: b };
    }
    return null;
  }

  // --- meshing ---------------------------------------------------------------

  buildChunkGeometry(c) {
    const { cx, cz, data } = c;
    const baseX = cx * CHUNK, baseZ = cz * CHUNK;
    const opq = { pos: [], nor: [], uv: [], col: [], idx: [] };
    const wat = { pos: [], nor: [], uv: [], col: [], idx: [] }; // col unused (no vertex colors)
    const lav = { pos: [], nor: [], uv: [], col: [], idx: [] };

    const get = (lx, y, lz) => {
      if (y < 0) return B.BEDROCK;
      if (y >= HEIGHT) return B.AIR;
      if (lx >= 0 && lx < CHUNK && lz >= 0 && lz < CHUNK)
        return data[lx + lz * CHUNK + y * CHUNK * CHUNK];
      return this.getBlock(baseX + lx, y, baseZ + lz);
    };
    const occ = (lx, y, lz) => isOpaque(get(lx, y, lz)) ? 1 : 0;

    for (let y = 0; y < HEIGHT; y++) {
      for (let lz = 0; lz < CHUNK; lz++) {
        for (let lx = 0; lx < CHUNK; lx++) {
          const id = data[lx + lz * CHUNK + y * CHUNK * CHUNK];
          if (id === B.AIR) continue;
          const blk = BLOCKS[id];
          const water = id === B.WATER;
          const lava = id === B.LAVA || id === B.PORTAL || id === B.END_PORTAL || blk.glow; // all render unlit/glowing

          // non-cube shapes: emit sub-boxes / crossed quads instead of cube faces
          if (blk.shape) {
            const buf = blk.glow ? lav : opq;
            if (blk.shape === 'cross') {
              emitCross(buf, lx, y, lz, blk.side);
              continue;
            }
            let conn = null;
            if (blk.shape === 'dust') {
              const wire = (nb) => nb === B.REDSTONE_DUST || nb === B.REDSTONE_DUST_ON;
              conn = {
                nx: wire(get(lx - 1, y, lz)), px: wire(get(lx + 1, y, lz)),
                nz: wire(get(lx, y, lz - 1)), pz: wire(get(lx, y, lz + 1)),
              };
            }
            if (blk.shape === 'repeater' || blk.shape === 'pistonhead' || blk.shape === 'frontplate') {
              const st = this._rsData ? this._rsData.get((baseX + lx) + ',' + y + ',' + (baseZ + lz)) : null;
              conn = blk.shape === 'repeater'
                ? { facing: blk.facing || 0, delay: (st && st.d) || 1, sub: (st && st.m) || 0 }
                : { f: (st && st.f != null) ? st.f : 0 };
            }
            if (blk.shape === 'fence' || blk.shape === 'pane') {
              const link = (nb) => nb === id || isOpaque(nb) || (blk.shape === 'pane' && nb === B.GLASS);
              conn = {
                nx: link(get(lx - 1, y, lz)), px: link(get(lx + 1, y, lz)),
                nz: link(get(lx, y, lz - 1)), pz: link(get(lx, y, lz + 1)),
              };
            }
            const cull = [
              isOpaque(get(lx + 1, y, lz)), isOpaque(get(lx - 1, y, lz)),
              isOpaque(get(lx, y + 1, lz)), isOpaque(get(lx, y - 1, lz)),
              isOpaque(get(lx, y, lz + 1)), isOpaque(get(lx, y, lz - 1)),
            ];
            let boxes = blockBoxes(id, conn);
            if (blk.doorTop) {
              // door tops mirror the bottom half's facing/swing, with their own texture
              const below = get(lx, y - 1, lz);
              const bblk = BLOCKS[below];
              if (bblk && bblk.shape === 'door' && !bblk.doorTop) {
                boxes = blockBoxes(below).map(b => ({ ...b, top: blk.top, bottom: blk.bottom, side: blk.side }));
              }
            }
            for (const box of boxes) emitBox(buf, lx, y, lz, box, cull);
            continue;
          }

          for (const f of FACES) {
            const nb = get(lx + f.dir[0], y + f.dir[1], lz + f.dir[2]);
            if (isOpaque(nb)) continue;
            if (nb === id && (water || lava || id === B.GLASS || id === B.COBWEB)) continue;

            const tile = f.dir[1] === 1 ? blk.top : f.dir[1] === -1 ? blk.bottom : blk.side;
            const r = tileUV(tile);
            const buf = water ? wat : lava ? lav : opq;
            const base = buf.pos.length / 3;

            // AO axes
            const a = f.dir[0] !== 0 ? 0 : f.dir[1] !== 0 ? 1 : 2;
            const t1 = a === 0 ? 1 : 0, t2 = a === 2 ? 1 : 2;
            const front = [lx, y, lz];
            front[a] += f.dir[a];

            const ao = [0, 0, 0, 0];
            for (let ci = 0; ci < 4; ci++) {
              const corner = f.corners[ci];
              buf.pos.push(lx + corner[0], y + corner[1], lz + corner[2]);
              buf.nor.push(f.dir[0], f.dir[1], f.dir[2]);
              buf.uv.push(corner[3] ? r.u1 : r.u0, corner[4] ? r.v1 : r.v0);
              if (!water && !lava) {
                const s1o = [...front], s2o = [...front], co = [...front];
                const sg1 = corner[t1] ? 1 : -1, sg2 = corner[t2] ? 1 : -1;
                s1o[t1] += sg1; s2o[t2] += sg2; co[t1] += sg1; co[t2] += sg2;
                const s1 = occ(s1o[0], s1o[1], s1o[2]);
                const s2 = occ(s2o[0], s2o[1], s2o[2]);
                const cc = occ(co[0], co[1], co[2]);
                const lvl = (s1 && s2) ? 3 : s1 + s2 + cc;
                ao[ci] = lvl;
                const l = f.shade * AO_VALS[lvl];
                opq.col.push(l, l, l);
              }
            }
            if (water || lava) {
              buf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
            } else if (ao[0] + ao[2] > ao[1] + ao[3]) {
              buf.idx.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
            } else {
              buf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
            }
          }
        }
      }
    }

    const makeGeo = (b, withColor) => {
      if (b.idx.length === 0) return null;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(b.pos), 3));
      g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(b.nor), 3));
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(b.uv), 2));
      if (withColor) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(b.col), 3));
      g.setIndex(b.idx);
      g.computeBoundingSphere();
      return g;
    };
    return { opaque: makeGeo(opq, true), water: makeGeo(wat, false), lava: makeGeo(lav, false) };
  }

  buildMesh(cx, cz) {
    const c = this.ensureData(cx, cz);
    this.disposeMeshes(c);
    const { opaque, water, lava } = this.buildChunkGeometry(c);
    if (opaque) {
      c.meshO = new THREE.Mesh(opaque, this.materials.opaque);
      c.meshO.position.set(cx * CHUNK, 0, cz * CHUNK);
      this.scene.add(c.meshO);
    }
    if (water) {
      c.meshW = new THREE.Mesh(water, this.materials.water);
      c.meshW.position.set(cx * CHUNK, 0, cz * CHUNK);
      c.meshW.renderOrder = 1;
      this.scene.add(c.meshW);
    }
    if (lava) {
      c.meshL = new THREE.Mesh(lava, this.materials.lava);
      c.meshL.position.set(cx * CHUNK, 0, cz * CHUNK);
      this.scene.add(c.meshL);
    }
    c.hasMesh = true;
  }

  disposeMeshes(c) {
    if (c.meshO) { this.scene.remove(c.meshO); c.meshO.geometry.dispose(); c.meshO = null; }
    if (c.meshW) { this.scene.remove(c.meshW); c.meshW.geometry.dispose(); c.meshW = null; }
    if (c.meshL) { this.scene.remove(c.meshL); c.meshL.geometry.dispose(); c.meshL = null; }
    c.hasMesh = false;
  }

  // --- per-frame management ------------------------------------------------

  update(px, pz, budgetMs = 10) {
    const pcx = Math.floor(px / CHUNK), pcz = Math.floor(pz / CHUNK);
    const R = this.renderDist;
    const t0 = performance.now();

    const missing = [];
    for (let dz = -R; dz <= R; dz++) {
      for (let dx = -R; dx <= R; dx++) {
        const c = this.chunks.get(key(pcx + dx, pcz + dz));
        if (!c || !c.hasMesh) missing.push([dx * dx + dz * dz, pcx + dx, pcz + dz]);
      }
    }
    if (missing.length) {
      missing.sort((m, n) => m[0] - n[0]);
      for (const [, cx, cz] of missing) {
        if (performance.now() - t0 > budgetMs) break;
        for (let dz = -1; dz <= 1; dz++)
          for (let dx = -1; dx <= 1; dx++) this.ensureData(cx + dx, cz + dz);
        this.buildMesh(cx, cz);
      }
    }

    if (++this._frame % 240 === 0) this.unloadFar(pcx, pcz);
  }

  flushDirty() {
    if (this.dirty.size === 0) return;
    for (const k of this.dirty) {
      const c = this.chunks.get(k);
      if (c && c.hasMesh) this.buildMesh(c.cx, c.cz);
    }
    this.dirty.clear();
  }

  // Drop every chunk mesh (used when leaving this dimension); data stays cached.
  unloadAll() {
    for (const c of this.chunks.values()) this.disposeMeshes(c);
  }

  unloadFar(pcx, pcz) {
    const R = this.renderDist;
    for (const [k, c] of this.chunks) {
      const d = Math.max(Math.abs(c.cx - pcx), Math.abs(c.cz - pcz));
      if (d > R + 3) { this.disposeMeshes(c); this.chunks.delete(k); }
      else if (d > R && c.hasMesh) this.disposeMeshes(c);
    }
  }

  // Multiplayer spawn column (cached): plaza + safe zone anchor.
  mpSpawnPos() {
    if (!this._spawnPos) {
      const s = this.findSpawn();
      const x = Math.floor(s.x), z = Math.floor(s.z);
      this._spawnPos = { x, z, h: this.columnInfo(x, z).h };
    }
    return this._spawnPos;
  }

  // Beautiful spawn plaza: round platform, paths, glow lamps, fence,
  // corner pillars, a fountain and flowers. Edits apply afterwards, so
  // player builds always win over the plaza.
  genSpawnPlaza(data, cx, cz) {
    const sp = this.mpSpawnPos();
    const sx = sp.x, sz = sp.z, H = sp.h;
    const set = (wx, y, wz, id) => {
      const lx = wx - cx * CHUNK, lz = wz - cz * CHUNK;
      if (lx < 0 || lx >= CHUNK || lz < 0 || lz >= CHUNK || y < 2 || y >= HEIGHT) return;
      data[lx + lz * CHUNK + y * CHUNK * CHUNK] = id;
    };
    const R = 8;
    for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) {
      if (dx * dx + dz * dz > R * R) continue;
      for (let y = H - 2; y <= H - 1; y++) set(sx + dx, y, sz + dz, B.COBBLE);
      let f = B.STONE_BRICK;
      if (dx === 0 || dz === 0) f = B.COBBLE; // cross paths
      if (Math.abs(dx) === 4 && Math.abs(dz) === 4) f = B.GLOWSTONE; // 4 lamps
      if (Math.abs(dx) <= 1 && Math.abs(dz) <= 1) f = B.PLANK; // welcome mat
      set(sx + dx, H, sz + dz, f);
    }
    for (let dx = -R - 1; dx <= R + 1; dx++) for (let dz = -R - 1; dz <= R + 1; dz++) {
      if (dx * dx + dz * dz > (R + 1) * (R + 1)) continue;
      for (let y = H + 1; y <= H + 8; y++) set(sx + dx, y, sz + dz, B.AIR);
    }
    for (const [dx, dz] of [[8, 0], [-8, 0], [0, 8], [0, -8], [6, 6], [6, -6], [-6, 6], [-6, -6]]) {
      set(sx + dx, H + 1, sz + dz, B.FENCE);
      set(sx + dx, H + 2, sz + dz, B.TORCH);
    }
    for (const [dx, dz] of [[5, 5], [5, -5], [-5, 5], [-5, -5]]) {
      for (let y = H + 1; y <= H + 3; y++) set(sx + dx, y, sz + dz, B.COBBLE);
      set(sx + dx, H + 4, sz + dz, B.GLOWSTONE);
    }
    const fx = sx - 5, fz = sz; // fountain (west side, spawn column stays clear)
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      set(fx + dx, H + 1, fz + dz, Math.max(Math.abs(dx), Math.abs(dz)) === 2 ? B.STONE_BRICK : B.WATER);
    }
    set(fx, H + 2, fz, B.COBBLE);
    set(fx, H + 3, fz, B.GLOWSTONE);
    const fl = [[3, 0], [0, 3], [0, -3], [2, 2], [2, -2], [-2, 2], [-2, -2], [-4, 3]];
    fl.forEach(([dx, dz], i) => set(sx + dx, H + 1, sz + dz, i % 2 ? B.DANDELION : B.POPPY));
  }

  // Find a dry spawn column near origin.
  findSpawn() {
    if (this.gen === 'flat') return { x: 8.5, y: 4, z: 8.5 };
    if (this.gen === 'oneblock') return { x: 0.5, y: 64, z: 0.5 };
    for (let r = 0; r < 40; r++) {
      for (let attempt = 0; attempt < 8; attempt++) {
        const x = (r === 0 && attempt === 0) ? 8 : Math.round((hash2(r, attempt, this.seed) - 0.5) * 2 * (r * 12 + 8));
        const z = (r === 0 && attempt === 0) ? 8 : Math.round((hash2(attempt, r, this.seed + 1) - 0.5) * 2 * (r * 12 + 8));
        const info = this.columnInfo(x, z);
        if (info.h > SEA + 1 && info.h < 58) return { x: x + 0.5, y: info.h + 1, z: z + 0.5 };
      }
    }
    return { x: 8.5, y: HEIGHT - 10, z: 8.5 };
  }
}
