// Light engine: block light (torches, lamps, lava...) and sky light.
//
// Before this module the game had no light at all: a torch was just a bright
// texture, caves and the surface looked the same and night was one flat
// dimming of the whole screen. Now every chunk keeps two small arrays:
//
//   c.light  - block light 0..15, flood-filled from light sources
//   c.sky    - sky light 0..15, poured down each column from the sky
//
// The mesher bakes max(block, sky) into the vertex colours, so caves are dark,
// torch-lit rooms glow, and a roof really does cast a shadow.
//
// Block light is a standard BFS with an increase queue (spread) and a decrease
// queue (a light source was removed / an opaque block appeared). Sky light is
// computed per column: a column is 15 all the way down to its first opaque
// block, then fades by one per block, which makes dug shafts, caves and
// overhangs appropriately dark.
//
// Everything after this line is engine: it spreads only where light actually
// gets brighter, so it costs a few hundred operations per placed block and the
// work is drained with a per-frame time budget (process()).

import { isOpaque, lightOf, lightAtten } from './blocks.js';

// brightness curve baked into vertex colours: 15 near the source -> 1.0,
// 0 in a pitch black cave -> a faint silhouette instead of a black hole
export const LIGHT_CURVE = new Float32Array(16);
for (let i = 0; i < 16; i++) LIGHT_CURVE[i] = 0.055 + 0.945 * Math.pow(i / 15, 1.55);

const NEIGH = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

export class LightEngine {
  constructor(world, key, CS, H) {
    this.world = world;
    this.key = key;
    this.CS = CS;               // 16
    this.H = H;                 // 80
    this.addQ = [];             // x, y, z, level
    this.remQ = [];             // x, y, z, level
    this.touched = new Set();   // chunk keys whose light changed (need a remesh)
    this.stats = { spread: 0, removed: 0, budgetHits: 0 };
  }

  // ---- storage ------------------------------------------------------------
  _arr(kind, cx, cz) {
    const c = this._chunkAt(cx, cz);
    return c ? c[kind] : null;
  }

  // Last chunk looked at (consecutive cells are almost always in the same one):
  // this keeps string keys and map lookups out of the hot path.
  _chunkAt(cx, cz) {
    const c = this._last;
    if (c && c.cx === cx && c.cz === cz) return c;
    const ch = this.world.chunks.get(this.key(cx, cz)) || null;
    this._last = ch;
    return ch;
  }

  // block id at world coordinates, without the string-keyed map lookup
  _idAt(x, y, z) {
    const ch = this._chunkAt(x >> 4, z >> 4);
    if (!ch) return 0;
    return ch.data[(x & 15) + (z & 15) * 16 + y * 256];
  }

  _at(kind, x, y, z) {
    if (y < 0) return 0;
    if (y >= this.H) return kind === 'sky' ? 15 : 0;   // open sky above the world
    const a = this._arr(kind, x >> 4, z >> 4);
    return a ? a[(x & 15) + (z & 15) * 16 + y * 256] : 0;
  }

  _loaded(x, z) {
    const c = this._chunkAt(x >> 4, z >> 4);
    return !!(c && c.light);
  }

  _set(kind, x, y, z, v) {
    const cx = x >> 4, cz = z >> 4;
    const a = this._arr(kind, cx, cz);
    if (!a) return;
    a[(x & 15) + (z & 15) * 16 + y * 256] = v;
    this.touched.add(this.key(cx, cz));
  }

  get(x, y, z) { return this._at('light', x, y, z); }          // block light
  getSky(x, y, z) { return this._at('sky', x, y, z); }         // sky light
  combined(x, y, z) { return Math.max(this.get(x, y, z), this.getSky(x, y, z)); }
  brightness(x, y, z) { return LIGHT_CURVE[this.combined(x, y, z)]; }

  // ---- sky light ----------------------------------------------------------
  // one column: 15 down to the first opaque block, then -1 per block below it
  skyColumn(cx, cz, lx, lz) {
    const c = this.world.chunks.get(this.key(cx, cz));
    if (!c || !c.sky) return;
    const { data, sky } = c;
    const H = this.H;
    const col = lx + lz * this.CS;   // y is the outer index (see the data layout)
    let top = H;
    for (let y = H - 1; y >= 0; y--) {
      if (isOpaque(data[col + y * 256])) { top = y; break; }
    }
    for (let y = H - 1; y >= 0; y--) {
      const i = col + y * 256;
      sky[i] = y > top ? 15 : (isOpaque(data[i]) ? 0 : Math.max(0, 15 - (top - y)));
    }
  }

  skyOfChunk(c) {
    for (let lz = 0; lz < this.CS; lz++)
      for (let lx = 0; lx < this.CS; lx++) this.skyColumn(c.cx, c.cz, lx, lz);
    this.touched.add(this.key(c.cx, c.cz));
  }

  // ---- queues -------------------------------------------------------------
  _spread(x, y, z, level) { this.addQ.push(x, y, z, level); }

  _remove(x, y, z, level) { this.remQ.push(x, y, z, level); }

  // seed one block that emits light (or a cell that must pass light on)
  addSource(x, y, z, level) {
    if (level <= 0) return;
    const cur = this.get(x, y, z);
    if (level > cur) this._set('light', x, y, z, level);
    this._spread(x, y, z, Math.max(level, cur));
  }

  // take the light away from a cell and let its neighbours re-fill
  removeSource(x, y, z) {
    const cur = this.get(x, y, z);
    if (cur === 0) { this._spreadNeighbours(x, y, z); return; }
    this._set('light', x, y, z, 0);
    this._remove(x, y, z, cur);
  }

  _spreadNeighbours(x, y, z) {
    for (const [dx, dy, dz] of NEIGH) {
      const l = this.get(x + dx, y + dy, z + dz);
      if (l > 1) this._spread(x + dx, y + dy, z + dz, l);
    }
  }

  // ---- chunk lifecycle ----------------------------------------------------
  // A brand new chunk: compute its sky, light its own sources and let the
  // neighbouring chunks pour their light across the border.
  initChunk(c) {
    const CS = this.CS, H = this.H;
    c.light = c.light || new Uint8Array(CS * CS * H);
    c.sky = c.sky || new Uint8Array(CS * CS * H);
    this.skyOfChunk(c);

    const baseX = c.cx * CS, baseZ = c.cz * CS;
    const total = CS * CS * H;
    for (let i = 0; i < total; i++) {
      const id = c.data[i];
      if (!id) continue;
      const lv = lightOf(id);
      if (lv > 0) {
        c.light[i] = lv;
        const y = (i / 256) | 0;
        const r = i - y * 256;
        const lx = r & 15, lz = r >> 4;
        this._spread(baseX + lx, y, baseZ + lz, lv);
      }
    }
    // light arriving from already-lit neighbours (a torch 3 blocks away in the
    // next chunk must reach into this one)
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nb = this._chunkAt(c.cx + dx, c.cz + dz);
      if (!nb || !nb.light) continue;                  // only loaded neighbours
      const side = nb.light;
      for (let t = 0; t < CS; t++) {
        const lx = dx === 1 ? 15 : dx === -1 ? 0 : t;
        const lz = dz === 1 ? 15 : dz === -1 ? 0 : t;
        const col = lx + lz * CS;
        for (let y = 0; y < H; y++) {
          const l = side[col + y * 256];
          if (l > 1) this._spread(baseX + lx + dx, y, baseZ + lz + dz, l - 1);
        }
      }
    }
  }

  // A block changed: re-run the sky column and sort out the block light.
  onBlockChange(x, y, z, oldId, newId) {
    const cx = x >> 4, cz = z >> 4;
    this.skyColumn(cx, cz, x & 15, z & 15);
    this.touched.add(this.key(cx, cz));

    const wasOpaque = isOpaque(oldId), nowOpaque = isOpaque(newId);
    const oldEmit = lightOf(oldId), newEmit = lightOf(newId);

    if (oldEmit > 0) this.removeSource(x, y, z);
    if (nowOpaque) {
      // the cell itself can no longer hold light (and must not let it through)
      if (this.get(x, y, z) > 0) this.removeSource(x, y, z);
    } else if (wasOpaque) {
      // a wall came down: light from the neighbours flows in again
      this._spreadNeighbours(x, y, z);
    }
    if (newEmit > 0) {
      this._set('light', x, y, z, newEmit);
      this._spread(x, y, z, newEmit);
    }
  }

  // ---- work -----------------------------------------------------------------
  // Drain the queues for at most `budgetMs`, then tell the world which chunk
  // meshes have to be rebuilt. Unfinished work simply continues next frame.
  process(budgetMs = 3, maxCells = 20000) {
    const t0 = performance.now();
    let cells = 0;
    // A background tab reports very coarse timestamps, so a tight time check can
    // fire after a single cell — the work would then crawl at one block per
    // frame. Always finish a batch of cells and only look at the clock between
    // batches, which keeps progress predictable either way.
    const outOfTime = () => {
      cells++;
      if (cells >= maxCells) return true;
      return (cells & 63) === 0 && performance.now() - t0 > budgetMs;
    };
    // 1) removals first: light that must go away before new light is poured in
    while (this.remQ.length) {
      const level = this.remQ.pop();
      const z = this.remQ.pop(), y = this.remQ.pop(), x = this.remQ.pop();
      for (const [dx, dy, dz] of NEIGH) {
        const nx = x + dx, ny = y + dy, nz = z + dz;
        if (ny < 0 || ny >= this.H || !this._loaded(nx, nz)) continue;
        const nl = this.get(nx, ny, nz);
        if (nl === 0) continue;
        if (nl < level) {
          this._set('light', nx, ny, nz, 0);
          this.remQ.push(nx, ny, nz, nl);
          this.stats.removed++;
        } else {
          this._spread(nx, ny, nz, nl);   // lit from somewhere else: re-pour
        }
      }
      if (outOfTime()) { this.stats.budgetHits++; break; }
    }
    // 2) spreading: push light outward, one level per block, more through water
    while (this.addQ.length) {
      this.addQ.pop();  // the level it had when it was queued is not used:
      const z = this.addQ.pop(), y = this.addQ.pop(), x = this.addQ.pop();
      // read the CURRENT light of the cell instead. A cell can also be queued
      // while a removal is still running, and using the stale level would bring
      // back light that has already been taken away.
      const lv = this.get(x, y, z);
      if (lv <= 1) continue;
      for (const [dx, dy, dz] of NEIGH) {
        const nx = x + dx, ny = y + dy, nz = z + dz;
        if (ny < 0 || ny >= this.H) continue;
        if (!this._loaded(nx, nz)) continue;       // chunk not loaded: nothing to light
        const att = lightAtten(this._idAt(nx, ny, nz));
        if (att <= 0) continue;                    // solid: no light gets in
        const nl = lv - att;
        if (nl > this.get(nx, ny, nz)) {
          this._set('light', nx, ny, nz, nl);
          this.addQ.push(nx, ny, nz, nl);
          this.stats.spread++;
        }
      }
      if (outOfTime()) { this.stats.budgetHits++; break; }
    }
    // hand the caller the list of chunks whose light changed and start over
    const out = this.touched.size ? [...this.touched] : null;
    this.touched.clear();
    return out;
  }

  // Rebuild every loaded chunk's light from scratch (used when a whole world
  // arrives at once, e.g. a snapshot from the server).
  relightAll() {
    this.addQ.length = 0;
    this.remQ.length = 0;
    for (const c of this.world.chunks.values()) {
      c.light = c.light || new Uint8Array(this.CS * this.CS * this.H);
      c.light.fill(0);
      this.skyOfChunk(c);
      const baseX = c.cx * this.CS, baseZ = c.cz * this.CS;
      for (let y = 0; y < this.H; y++) {
        for (let lz = 0; lz < this.CS; lz++) {
          for (let lx = 0; lx < this.CS; lx++) {
            const lv = lightOf(c.data[lx + lz * this.CS + y * 256]);
            if (lv <= 0) continue;
            c.light[lx + lz * this.CS + y * 256] = lv;
            this._spread(baseX + lx, y, baseZ + lz, lv);
          }
        }
      }
    }
  }

  pending() { return (this.addQ.length + this.remQ.length) / 4; }
}
