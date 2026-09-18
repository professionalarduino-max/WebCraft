// Furnace block entities: per-position smelting state that keeps running on
// world time (input slot, fuel slot, output slot, burn + progress timers).

import { I, SMELTING, FUEL, SMELT_TIME, maxStack } from './items.js';
import { encSlot as enc, decSlot as dec } from './inventory.js';


export class Furnaces {
  constructor() {
    this.map = new Map(); // "x,y,z" -> {slots:[input,fuel,output], burn, burnMax, progress}
  }

  key(x, y, z) { return x + ',' + y + ',' + z; }

  get(key, create = false) {
    let s = this.map.get(key);
    if (!s && create) {
      s = { slots: [null, null, null], burn: 0, burnMax: 0, progress: 0 };
      this.map.set(key, s);
    }
    return s || null;
  }

  // Remove the state (furnace broken); returns the contained stacks.
  breakAt(key) {
    const s = this.map.get(key);
    this.map.delete(key);
    return s ? s.slots.filter(Boolean) : [];
  }

  // Advance all furnaces. Returns true if any slot contents changed
  // (so an open furnace UI knows to re-render).
  tick(dt) {
    let changed = false;
    for (const s of this.map.values()) {
      const inp = s.slots[0];
      const result = inp ? SMELTING[inp.id] : undefined;
      const out = s.slots[2];
      const outOk = result !== undefined && (!out || (out.id === result && out.n < maxStack(result)));

      // ignite new fuel when there's something to smelt
      if (s.burn <= 0 && outOk && s.slots[1]) {
        const fuel = s.slots[1];
        const t = FUEL[fuel.id] || 0;
        if (t > 0) {
          s.burn = s.burnMax = t;
          if (fuel.id === I.LAVA_BUCKET) s.slots[1] = { id: I.BUCKET, n: 1 };
          else { fuel.n--; if (!fuel.n) s.slots[1] = null; }
          changed = true;
        }
      }

      if (s.burn > 0) {
        s.burn -= dt;
        if (outOk) {
          s.progress += dt;
          if (s.progress >= SMELT_TIME) {
            s.progress -= SMELT_TIME;
            s.slots[2] = out ? { id: out.id, n: out.n + 1 } : { id: result, n: 1 };
            inp.n--;
            if (!inp.n) s.slots[0] = null;
            changed = true;
          }
        } else {
          s.progress = 0;
        }
      } else {
        s.burn = 0;
        s.progress = Math.max(0, s.progress - dt * 2);
      }
    }
    return changed;
  }

  serialize() {
    const out = [];
    for (const [k, s] of this.map) {
      if (s.slots.some(Boolean) || s.burn > 0) {
        out.push([k, { slots: s.slots.map(enc), burn: s.burn, burnMax: s.burnMax, progress: s.progress }]);
      }
    }
    return out;
  }

  load(data) {
    if (!Array.isArray(data)) return;
    for (const [k, v] of data) {
      this.map.set(k, {
        slots: (v.slots || []).map(dec).concat([null, null, null]).slice(0, 3),
        burn: v.burn || 0, burnMax: v.burnMax || 0, progress: v.progress || 0,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Chests: 27-slot containers keyed by position (village loot + player-built).

export class Chests {
  constructor(size = 27) {
    this.size = size;
    this.map = new Map(); // key -> {slots: Array(size)}
  }

  key(x, y, z) { return x + ',' + y + ',' + z; }

  // Returns [state, isNew] — main fills loot on first open of worldgen chests.
  get(key, create = false) {
    let s = this.map.get(key);
    if (!s && create) {
      s = { slots: new Array(this.size).fill(null) };
      this.map.set(key, s);
      return [s, true];
    }
    return [s || null, false];
  }

  breakAt(key) {
    const s = this.map.get(key);
    this.map.delete(key);
    return s ? s.slots.filter(Boolean) : [];
  }

  serialize() {
    const out = [];
    for (const [k, s] of this.map) {
      out.push([k, s.slots.map(enc)]);
    }
    return out;
  }

  load(data) {
    if (!Array.isArray(data)) return;
    for (const [k, slots] of data) {
      this.map.set(k, { slots: (slots || []).map(dec).concat(new Array(this.size).fill(null)).slice(0, this.size) });
    }
  }
}
