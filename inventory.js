// Minecraft Java Edition-style slot inventory.
// 36 slots (0-8 hotbar, 9-35 main), a 3x3 crafting grid holding real item
// stacks (2x2 mode uses cells 0,1,3,4), and a cursor stack held on the mouse.
// Each slot is null or {id, n}.

import { ITEMS, maxStack, ARMOR_SLOTS, SMELTING, FUEL } from './items.js';
import { B } from './blocks.js';

export const encSlot = (s) => {
  if (!s) return null;
  const a = (s.d > 0 || s.tag) ? [s.id, s.n, s.d || 0] : [s.id, s.n];
  if (s.tag) a.push(s.tag); // shulker box contents ride along
  return a;
};
export const decSlot = (v) => (v && v[1] > 0 ? { id: +v[0], n: +v[1], ...(v[2] > 0 ? { d: +v[2] } : null), ...(v[3] ? { tag: v[3] } : null) } : null);
const enc = encSlot, dec = decSlot;
const sameTag = (a, b) => (!a && !b) || (!!a && !!b && JSON.stringify(a) === JSON.stringify(b));

export class Inventory {
  constructor() {
    this.slots = new Array(36).fill(null); // 0-8 = hotbar, 9-35 = main
    this.craft = new Array(9).fill(null);  // 3x3 crafting grid
    this.armor = new Array(4).fill(null);  // head, chest, legs, feet
    this.cursor = null;                    // stack "picked up" by the mouse
    this.container = null;                 // open furnace state {slots:[in,fuel,out]}
    this.onChange = null;
  }

  _c() { if (this.onChange) this.onChange(); }

  _arr(area) {
    if (area === 'craft') return this.craft;
    if (area === 'armor') return this.armor;
    if (area === 'furn') return this.container ? this.container.slots : null;
    return this.slots;
  }

  get(area, idx) { const a = this._arr(area); return (a && a[idx]) || null; }
  set(area, idx, s) { const a = this._arr(area); if (a) a[idx] = (s && s.n > 0) ? s : null; }

  // slot placement rules: armor slots only accept matching pieces,
  // furnace output (idx 2) is take-only; chests (27 slots) accept anything
  _accepts(area, idx, id) {
    if (area === 'armor') {
      const it = ITEMS[id];
      return !!(it && it.kind === 'armor' && ARMOR_SLOTS.indexOf(it.slot) === idx);
    }
    if (area === 'furn' && idx === 2 && this.container && this.container.slots.length === 3) return false;
    if (area === 'furn' && this.container && this.container.shulker && id === B.SHULKER_BOX) return false; // no nesting
    return true;
  }

  armorPoints() {
    let p = 0;
    for (const s of this.armor) if (s) p += ITEMS[s.id].defense || 0;
    return p;
  }

  // total in main slots (not craft grid / cursor)
  count(id) {
    let n = 0;
    for (const s of this.slots) if (s && s.id === id) n += s.n;
    return n;
  }

  // Item pickup: fill partial stacks first, then empty slots (hotbar first).
  // Returns the leftover count that did not fit (0 = all stored).
  add(id, n, dmg = 0, tag = null) {
    let left = n;
    const lim = maxStack(id);
    for (const s of this.slots) {
      if (left <= 0) break;
      if (s && s.id === id && s.n < lim && sameTag(s.tag, tag)) {
        const t = Math.min(left, lim - s.n);
        s.n += t; left -= t;
      }
    }
    for (let i = 0; i < 36 && left > 0; i++) {
      if (!this.slots[i]) {
        const t = Math.min(left, lim);
        this.slots[i] = { id, n: t, ...(dmg > 0 ? { d: dmg } : null), ...(tag ? { tag } : null) };
        left -= t;
      }
    }
    if (left !== n) this._c();
    return left;
  }

  // Remove n of id from main slots; all-or-nothing.
  consume(id, n) {
    if (this.count(id) < n) return false;
    let left = n;
    for (let i = 0; i < 36 && left > 0; i++) {
      const s = this.slots[i];
      if (s && s.id === id) {
        const t = Math.min(left, s.n);
        s.n -= t; left -= t;
        if (!s.n) this.slots[i] = null;
      }
    }
    this._c();
    return true;
  }

  // Take up to n items out of a slot; returns {id, n} or null.
  takeFrom(area, idx, n) {
    const s = this.get(area, idx);
    if (!s) return null;
    const t = Math.min(n, s.n);
    s.n -= t;
    const id = s.id;
    if (!s.n) this.set(area, idx, null);
    this._c();
    return { id, n: t, ...(s.d ? { d: s.d } : null), ...(s.tag ? { tag: s.tag } : null) };
  }

  // --- Minecraft mouse semantics -------------------------------------------

  // Left click: pick up stack / place stack / merge / swap.
  leftClick(area, idx) {
    const s = this.get(area, idx);
    if (!this.cursor) {
      if (s) { this.cursor = s; this.set(area, idx, null); }
    } else if (!this._accepts(area, idx, this.cursor.id)) {
      // take-only / mismatched slot: allow merging OUT of it if ids match
      if (s && s.id === this.cursor.id && sameTag(s.tag, this.cursor.tag)) {
        const lim = maxStack(s.id);
        const t = Math.min(s.n, lim - this.cursor.n);
        this.cursor.n += t; s.n -= t;
        if (!s.n) this.set(area, idx, null);
      }
    } else if (!s) {
      this.set(area, idx, this.cursor);
      this.cursor = null;
    } else if (s.id === this.cursor.id && sameTag(s.tag, this.cursor.tag)) {
      const lim = maxStack(s.id);
      const t = Math.min(this.cursor.n, lim - s.n);
      s.n += t; this.cursor.n -= t;
      if (!this.cursor.n) this.cursor = null;
    } else {
      const tmp = this.cursor;
      this.cursor = s;
      this.set(area, idx, tmp);
    }
    this._c();
  }

  // Right click: pick up half / place one.
  rightClick(area, idx) {
    const s = this.get(area, idx);
    if (!this.cursor) {
      if (s) {
        const t = Math.ceil(s.n / 2);
        this.cursor = { id: s.id, n: t, ...(s.d ? { d: s.d } : null), ...(s.tag ? { tag: s.tag } : null) };
        s.n -= t;
        if (!s.n) this.set(area, idx, null);
      }
    } else if (!this._accepts(area, idx, this.cursor.id)) {
      // no-op on take-only / mismatched slots
    } else if (!s) {
      this.set(area, idx, { id: this.cursor.id, n: 1, ...(this.cursor.d ? { d: this.cursor.d } : null), ...(this.cursor.tag ? { tag: this.cursor.tag } : null) });
      this.cursor.n--;
      if (!this.cursor.n) this.cursor = null;
    } else if (s.id === this.cursor.id && s.n < maxStack(s.id) && sameTag(s.tag, this.cursor.tag)) {
      s.n++;
      this.cursor.n--;
      if (!this.cursor.n) this.cursor = null;
    }
    this._c();
  }

  // Double click: pull every matching stack into the cursor (up to the limit).
  collectAll() {
    if (!this.cursor) return;
    const id = this.cursor.id;
    const lim = maxStack(id);
    const pull = (arr) => {
      for (let i = 0; i < arr.length; i++) {
        const s = arr[i];
        if (s && s.id === id && this.cursor.n < lim && sameTag(s.tag, this.cursor.tag)) {
          const t = Math.min(s.n, lim - this.cursor.n);
          s.n -= t; this.cursor.n += t;
          if (!s.n) arr[i] = null;
        }
      }
    };
    pull(this.slots);
    pull(this.craft);
    this._c();
  }

  // Hover + number key: swap a slot with a hotbar slot.
  swapWithHotbar(area, idx, hb) {
    if (area === 'inv' && idx === hb) return;
    const a = this.get(area, idx);
    this.set(area, idx, this.slots[hb]);
    this.slots[hb] = a;
    this._c();
  }

  // move a stack into one specific slot (merge or place); true if fully moved
  _moveInto(fromArea, fromIdx, toArea, toIdx) {
    const s = this.get(fromArea, fromIdx);
    if (!s) return false;
    if (!this._accepts(toArea, toIdx, s.id)) return false;
    const t = this.get(toArea, toIdx);
    const lim = maxStack(s.id);
    if (!t) {
      this.set(toArea, toIdx, { id: s.id, n: s.n, ...(s.d ? { d: s.d } : null), ...(s.tag ? { tag: s.tag } : null) });
      this.set(fromArea, fromIdx, null);
      return true;
    }
    if (t.id === s.id && t.n < lim && sameTag(t.tag, s.tag)) {
      const mv = Math.min(s.n, lim - t.n);
      t.n += mv; s.n -= mv;
      if (!s.n) { this.set(fromArea, fromIdx, null); return true; }
    }
    return false;
  }

  // Shift-click quick move: furnace routing > armor equip > hotbar <-> main.
  quickMove(area, idx) {
    const s = this.get(area, idx);
    if (!s) return;
    let targets;
    if (area !== 'inv') {
      targets = [...Array(36).keys()]; // out of craft/armor/furnace -> inventory
    } else {
      // into an open container: furnace routes by purpose, chest takes anything
      if (this.container) {
        const cs = this.container.slots;
        if (cs.length === 3) {
          if (SMELTING[s.id] !== undefined && this._moveInto('inv', idx, 'furn', 0)) { this._c(); return; }
          if (FUEL[s.id] && this._moveInto('inv', idx, 'furn', 1)) { this._c(); return; }
        } else {
          for (let ci = 0; ci < cs.length; ci++) {
            if (this._moveInto('inv', idx, 'furn', ci)) { this._c(); return; }
          }
          this._c();
          return;
        }
      }
      // auto-equip armor
      const it = ITEMS[s.id];
      if (it && it.kind === 'armor') {
        const ai = ARMOR_SLOTS.indexOf(it.slot);
        if (ai !== -1 && !this.armor[ai]) {
          this.armor[ai] = s;
          this.set(area, idx, null);
          this._c();
          return;
        }
      }
      targets = idx < 9 ? Array.from({ length: 27 }, (_, i) => i + 9) : [...Array(9).keys()];
    }
    const lim = maxStack(s.id);
    for (const i of targets) {
      const t = this.slots[i];
      if (t && t.id === s.id && t.n < lim && sameTag(t.tag, s.tag)) {
        const mv = Math.min(s.n, lim - t.n);
        t.n += mv; s.n -= mv;
        if (!s.n) { this.set(area, idx, null); this._c(); return; }
      }
    }
    for (const i of targets) {
      if (!this.slots[i]) {
        this.slots[i] = { id: s.id, n: s.n, ...(s.d ? { d: s.d } : null), ...(s.tag ? { tag: s.tag } : null) };
        this.set(area, idx, null);
        this._c();
        return;
      }
    }
    this._c(); // partial merge only
  }

  // Return crafting grid + cursor to the inventory (on close).
  // Returns stacks that did not fit, for dropping into the world.
  returnAll() {
    const leftovers = [];
    for (let i = 0; i < 9; i++) {
      const s = this.craft[i];
      if (s) {
        this.craft[i] = null;
        const left = this.add(s.id, s.n, s.d || 0, s.tag || null);
        if (left > 0) leftovers.push({ id: s.id, n: left, ...(s.d ? { d: s.d } : null), ...(s.tag ? { tag: s.tag } : null) });
      }
    }
    if (this.cursor) {
      const c = this.cursor;
      this.cursor = null;
      const left = this.add(c.id, c.n, c.d || 0, c.tag || null);
      if (left > 0) leftovers.push({ id: c.id, n: left, ...(c.d ? { d: c.d } : null), ...(c.tag ? { tag: c.tag } : null) });
    }
    this._c();
    return leftovers;
  }

  serialize() {
    return { v: 3, slots: this.slots.map(enc), craft: this.craft.map(enc), armor: this.armor.map(enc), cursor: enc(this.cursor) };
  }

  static from(data) {
    const inv = new Inventory();
    if (!data) return inv;
    if (data.v === 2 || data.v === 3) {
      (data.slots || []).slice(0, 36).forEach((v, i) => { inv.slots[i] = dec(v); });
      (data.craft || []).slice(0, 9).forEach((v, i) => { inv.craft[i] = dec(v); });
      (data.armor || []).slice(0, 4).forEach((v, i) => { inv.armor[i] = dec(v); });
      inv.cursor = dec(data.cursor);
      return inv;
    }
    // migrate v1 format ({counts: [[id,n]], hotbar: [id|null]})
    if (data.counts) {
      const counts = new Map(data.counts.map(([id, n]) => [+id, n]));
      (data.hotbar || []).slice(0, 9).forEach((id, i) => {
        if (id == null) return;
        const have = counts.get(+id) || 0;
        if (have <= 0) return;
        const t = Math.min(have, maxStack(+id));
        inv.slots[i] = { id: +id, n: t };
        counts.set(+id, have - t);
      });
      for (const [id, n] of counts) if (n > 0) inv.add(id, n);
    }
    return inv;
  }
}
