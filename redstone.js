import { B, BLOCKS } from './blocks.js';

// Directions 0..5: +x -x +y -y +z -z. Repeater/comparator facings 0..3 map to DIRS6 [0,1,4,5].
export const DIRS6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
export const REPDIRS = [0, 1, 4, 5]; // rep facing 0..3 -> DIRS6 index (output direction)

export const isWire = (id) => id === B.REDSTONE_DUST || id === B.REDSTONE_DUST_ON;
export const isTorch = (id) => id === B.RTORCH || id === B.RTORCH_OFF;
export const isRep = (id) => id >= B.REPEATER && id <= B.REPEATER + 7;
export const isComp = (id) => id >= B.COMPARATOR && id <= B.COMPARATOR + 7;
export const isObs = (id) => id === B.OBSERVER || id === B.OBSERVER_ON;
const isRepOn = (id) => id >= B.REPEATER + 4 && id <= B.REPEATER + 7;
const isCompOn = (id) => id >= B.COMPARATOR + 4 && id <= B.COMPARATOR + 7;
const repFacing = (id) => (id - B.REPEATER) % 4;
const compFacing = (id) => (id - B.COMPARATOR) % 4;
const isPiston = (id) => id === B.PISTON || id === B.STICKY_PISTON;
const isBulb = (id) => id === B.BULB || id === B.BULB_ON;

// blocks a piston can never push (others are pushable unless they hold block-data)
const UNPUSHABLE = new Set([
  B.BEDROCK, B.OBSIDIAN, B.PISTON, B.STICKY_PISTON, B.PISTON_HEAD,
  B.END_FRAME,
].filter((v) => v !== undefined && v !== null));

const k3 = (x, y, z) => x + ',' + y + ',' + z;
const rsData = (world) => (world._rsData || (world._rsData = new Map()));
const rsLvls = (world) => (world._rsLevels || (world._rsLevels = new Map()));
const rsPend = (world) => (world._rsPend || (world._rsPend = new Map()));
const rsTgt = (world) => (world._rsTarget || (world._rsTarget = new Map()));
const rsFoll = (world) => (world._rsFollow || (world._rsFollow = new Set()));
const faceOf = (world, x, y, z) => {
  const st = rsData(world).get(k3(x, y, z));
  return st && st.f != null ? st.f : -1;
};

// static (variant-driven) emission, no direction. Torches handled by caller via the fixpoint map.
function staticEmit(world, x, y, z, id) {
  if (id === B.LEVER_ON) return 15;
  if (id === B.RTORCH) return 15;
  if (id === B.REDSTONE_BLOCK) return 15;
  if (id === B.BUTTON_ON) return 15;
  if (id === B.PLATE_ON) return 15;
  if (id === B.SENSOR_ON) return 15;
  if (id === B.BULB_ON) return 15;
  if (id === B.TARGET) {
    const e = rsTgt(world).get(k3(x, y, z));
    if (e && (world._rsNow || 0) < e.until) return e.lvl;
    return 0;
  }
  if (id === B.DIODE) {
    const v = world.getVar ? (world.getVar(x, y, z) ? 1 : 0) : 0;
    return v ? 15 : 0;
  }
  return 0;
}

// directed output of source cell (sx,sy,sz) toward direction (dx,dy,dz): repeaters,
// comparators (stored level), observers. Everything else: 0.
export function directedInto(world, sx, sy, sz, dx, dy, dz) {
  const id = world.getBlock(sx, sy, sz);
  const di = dx === 1 ? 0 : dx === -1 ? 1 : dy === 1 ? 2 : dy === -1 ? 3 : dz === 1 ? 4 : 5;
  if (isRep(id)) return (isRepOn(id) && REPDIRS[repFacing(id)] === di) ? 15 : 0;
  if (isComp(id)) return REPDIRS[compFacing(id)] === di ? (rsLvls(world).get(k3(sx, sy, sz)) | 0) : 0;
  if (id === B.OBSERVER_ON) return faceOf(world, sx, sy, sz) === di ? 15 : 0;
  return 0;
}

// live power level AT a cell (for machines/edges). Variant-current, no scheduling.
export function powerLevelAt(world, x, y, z) {
  let best = 0;
  for (const [dx, dy, dz] of DIRS6) {
    const nx = x + dx, ny = y + dy, nz = z + dz;
    const id = world.getBlock(nx, ny, nz);
    if (id === undefined) continue;
    const e = staticEmit(world, nx, ny, nz, id);
    if (e > best) best = e;
    if (best >= 15) return 15;
    if (id === B.REDSTONE_DUST_ON) return 15;
    const di = directedInto(world, nx, ny, nz, -dx, -dy, -dz);
    if (di > best) best = di;
    if (best >= 15) return 15;
    const bl = blockLevelAt(world, nx, ny, nz, id);
    if (bl > best) best = bl;
    if (best >= 15) return 15;
  }
  return best;
}

// weak power carried by a solid conductor cell (level-based, 1 block only)
export function blockLevelAt(world, x, y, z, id) {
  if (id === undefined) id = world.getBlock(x, y, z);
  const blk = BLOCKS[id];
  const conductor = blk && blk.opaque && !isWire(id) && !isTorch(id) && !isRep(id) && !isComp(id) && !isObs(id) && !isPiston(id) && !isBulb(id) && id !== B.TARGET;
  if (!conductor) return staticEmit(world, x, y, z, id);
  let best = staticEmit(world, x, y, z, id);
  for (const [dx, dy, dz] of DIRS6) {
    const nx = x + dx, ny = y + dy, nz = z + dz;
    const nid = world.getBlock(nx, ny, nz);
    if (nid === undefined) continue;
    if (nid === B.REDSTONE_DUST_ON) return 15;
    const e = Math.max(staticEmit(world, nx, ny, nz, nid), directedInto(world, nx, ny, nz, -dx, -dy, -dz));
    if (e > best) best = e;
    if (best >= 15) return 15;
  }
  return best;
}

// emission of neighbor cell (x,y,z) specifically toward direction (dx,dy,dz):
// static sources + lit dust + directed devices.
function emitToward(world, x, y, z, dx, dy, dz, dustPow, torchOn) {
  const id = world.getBlock(x, y, z);
  if (id === undefined) return 0;
  if (isTorch(id)) return (torchOn ? torchOn.get(k3(x, y, z)) : id === B.RTORCH) ? 15 : 0;
  if (isWire(id)) return dustPow ? (dustPow.get(k3(x, y, z)) | 0) : (id === B.REDSTONE_DUST_ON ? 15 : 0);
  return Math.max(staticEmit(world, x, y, z, id), directedInto(world, x, y, z, dx, dy, dz));
}

const isReceiver = (id) => id === B.LAMP || id === B.LAMP_ON || id === B.NOTE_BLOCK || id === B.TNT || id === B.DOOR_WOOD_B || id === B.DOOR_WOOD_BOT_OPEN || id === B.DOOR_IRON_B || id === B.DOOR_IRON_BOT_OPEN;

// power at a cell during updatePower (reads dust/torch fixpoint maps, directed devices, conductors)
function poweredAt(world, x, y, z, dustPow, torchOn, emitCache) {
  let best = 0;
  for (const [dx, dy, dz] of DIRS6) {
    const nx = x + dx, ny = y + dy, nz = z + dz;
    if (world.getBlock(nx, ny, nz) === undefined) continue;
    const ck = k3(nx, ny, nz);
    let e;
    if (emitCache && emitCache.has(ck)) e = emitCache.get(ck);
    else {
      e = Math.max(
        emitToward(world, nx, ny, nz, -dx, -dy, -dz, dustPow, torchOn),
        blockLevelAt(world, nx, ny, nz)
      );
      if (emitCache) emitCache.set(ck, e);
    }
    if (e > best) best = e;
    if (best >= 15) return 15;
  }
  return best;
}

// recompute redstone in a region around (x,y,z). Returns action list for main.js.
export function updatePower(world, x, y, z) {
  const actions = [];
  const dust = new Map(), torch = new Map(), recv = new Map();
  const rep = new Map(), comp = new Map(), bulb = new Map(), piston = new Map();
  const seen = new Set(), stack = [[x, y, z]];
  const fileCell = (cx, cy, cz) => {
    const id = world.getBlock(cx, cy, cz);
    if (id === undefined) return 'none';
    const k = k3(cx, cy, cz);
    let kind = 'other';
    if (isWire(id)) { if (!dust.has(k)) dust.set(k, { x: cx, y: cy, z: cz, id }); kind = 'wire'; }
    else if (isTorch(id)) { if (!torch.has(k)) torch.set(k, { x: cx, y: cy, z: cz, id }); kind = 'torch'; }
    else if (isRep(id)) { if (!rep.has(k)) rep.set(k, { x: cx, y: cy, z: cz, id }); kind = 'rep'; }
    else if (isComp(id)) { if (!comp.has(k)) comp.set(k, { x: cx, y: cy, z: cz, id }); kind = 'comp'; }
    else if (isBulb(id)) { if (!bulb.has(k)) bulb.set(k, { x: cx, y: cy, z: cz, id }); kind = 'bulb'; }
    else if (isPiston(id)) { if (!piston.has(k)) piston.set(k, { x: cx, y: cy, z: cz, id }); kind = 'piston'; }
    else if (isReceiver(id)) { if (!recv.has(k)) recv.set(k, { x: cx, y: cy, z: cz, id }); kind = 'recv'; }
    else if (isObs(id)) kind = 'obs';
    else {
      const blk = BLOCKS[id];
      if (blk && blk.opaque) kind = 'cond';
    }
    if ((kind === 'other' || kind === 'obs') && !seen.has(k)) { seen.add(k); return kind; }
    if (!seen.has(k)) { seen.add(k); stack.push([cx, cy, cz]); }
    return kind;
  };
  const pushNeighborsOf = (cx, cy, cz, allowDown) => {
    for (const [dx, dy, dz] of DIRS6) {
      if (dy !== 0 && !allowDown && (world.getBlock(cx, cy, cz) === B.REDSTONE_DUST || world.getBlock(cx, cy, cz) === B.REDSTONE_DUST_ON)) continue;
      fileCell(cx + dx, cy + dy, cz + dz);
    }
  };
  fileCell(x, y, z);
  let guard = 0;
  while (stack.length && guard++ < 1400) {
    const [cx, cy, cz] = stack.pop();
    const id = world.getBlock(cx, cy, cz);
    if (id === undefined) continue;
    pushNeighborsOf(cx, cy, cz, !isWire(id));
    if (BLOCKS[id] && BLOCKS[id].opaque && !isWire(id)) {
      for (const [dx, dy, dz] of DIRS6) {
        const nx = cx + dx, ny = cy + dy, nz = cz + dz;
        if (world.getBlock(nx, ny, nz) === undefined) continue;
        if (fileCell(nx, ny, nz) === 'cond') {
          for (const [ex, ey, ez] of DIRS6) {
            if (ex === -dx && ey === -dy && ez === -dz) continue;
            fileCell(nx + ex, ny + ey, nz + ez);
          }
        }
      }
    }
  }
  // fixpoint: dust levels + torch states
  const dustPow = new Map(), torchOn = new Map();
  for (const [k, c] of dust) dustPow.set(k, c.id === B.REDSTONE_DUST_ON ? 15 : 0);
  for (const [k, c] of torch) torchOn.set(k, c.id === B.RTORCH);
  for (let iter = 0; iter < 24; iter++) {
    let changed = false;
    for (const [k, c] of dust) {
      let best = 0;
      for (const [dx, dy, dz] of DIRS6) {
        if (dy !== 0) continue;
        const nx = c.x + dx, ny = c.y, nz = c.z + dz;
        const e = Math.max(
          emitToward(world, nx, ny, nz, -dx, 0, -dz, dustPow, torchOn),
          blockLevelAt(world, nx, ny, nz)
        );
        const cand = (isWire(world.getBlock(nx, ny, nz)) ? e - 1 : e);
        if (cand > best) best = cand;
        if (best >= 15) break;
      }
      best = Math.max(0, Math.min(15, best));
      if (best !== dustPow.get(k)) { dustPow.set(k, best); changed = true; }
    }
    for (const [k, c] of torch) {
      const on = poweredAt(world, c.x, c.y, c.z, dustPow, torchOn, null) <= 0;
      if (on !== torchOn.get(k)) { torchOn.set(k, on); changed = true; }
    }
    if (!changed) break;
  }
  // apply: dust variants
  for (const [k, c] of dust) {
    const want = (dustPow.get(k) | 0) > 0 ? B.REDSTONE_DUST_ON : B.REDSTONE_DUST;
    if (want !== c.id) world.setBlock(c.x, c.y, c.z, want);
  }
  // apply: torch variants
  for (const [k, c] of torch) {
    const want = torchOn.get(k) ? B.RTORCH : B.RTORCH_OFF;
    if (want !== c.id) world.setBlock(c.x, c.y, c.z, want);
  }
  const now = world._rsNow || 0;
  let recheck = false;
  const emitCache = new Map();
  const powAt = (cx, cy, cz) => poweredAt(world, cx, cy, cz, dustPow, torchOn, emitCache);
  // apply: repeater inputs -> delayed pending (output handled by directedInto)
  for (const [k, c] of rep) {
    const di = REPDIRS[repFacing(c.id)];
    const bx = c.x - DIRS6[di][0], by = c.y - DIRS6[di][1], bz = c.z - DIRS6[di][2];
    const backId = world.getBlock(bx, by, bz);
    let input = 0;
    if (backId !== undefined) {
      input = Math.max(
        emitToward(world, bx, by, bz, DIRS6[di][0], DIRS6[di][1], DIRS6[di][2], dustPow, torchOn),
        blockLevelAt(world, bx, by, bz, backId)
      );
    }
    const want = input > 0 ? 1 : 0;
    const isOn = isRepOn(c.id);
    const pend = rsPend(world).get(k);
    if ((want === 1) !== isOn && (!pend || pend.kind !== 'rep' || pend.want !== want)) {
      const st = rsData(world).get(k);
      const delay = (st && st.d) || 1;
      rsPend(world).set(k, { at: now + 0.1 * delay, kind: 'rep', want });
    }
  }
  // apply: comparator logic (instant output level)
  for (const [k, c] of comp) {
    const di = REPDIRS[compFacing(c.id)];
    const [fdx, fdy, fdz] = DIRS6[di];
    const st = rsData(world).get(k);
    const sub = st && st.m ? 1 : 0;
    const back = compBack(world, c.x - fdx, c.y - fdy, c.z - fdz, fdx, fdy, fdz, dustPow, torchOn);
    let side = 0;
    const perp = di <= 1 ? [[0, 0, 1], [0, 0, -1]] : [[1, 0, 0], [-1, 0, 0]];
    for (const [px, py, pz] of perp) {
      const sx = c.x + px, sy = c.y + py, sz = c.z + pz;
      const sid = world.getBlock(sx, sy, sz);
      if (sid === undefined) continue;
      const sk = k3(sx, sy, sz);
      let v = 0;
      if (isWire(sid)) v = dustPow.get(sk) | 0;
      else v = Math.max(staticEmit(world, sx, sy, sz, sid), directedInto(world, sx, sy, sz, -px, -py, -pz), blockLevelAt(world, sx, sy, sz, sid));
      if (v > side) side = v;
    }
    const out = sub ? Math.max(0, back - side) : (back >= side ? back : 0);
    const prev = rsLvls(world).get(k);
    if (prev !== out) { rsLvls(world).set(k, out); recheck = true; }
    const want = out > 0 ? B.COMPARATOR + 4 + compFacing(c.id) : B.COMPARATOR + compFacing(c.id);
    if (want !== c.id) world.setBlock(c.x, c.y, c.z, want);
  }
  // apply: bulbs toggle on rising edge
  for (const [k, c] of bulb) {
    const input = powAt(c.x, c.y, c.z) > 0 ? 1 : 0;
    const st = rsData(world).get(k) || {};
    if (input && !st.last) {
      world.setBlock(c.x, c.y, c.z, c.id === B.BULB ? B.BULB_ON : B.BULB);
      recheck = true;
    }
    if ((st.last | 0) !== input) { st.last = input; rsData(world).set(k, st); }
  }
  // apply: pistons extend / retract
  for (const [k, c] of piston) {
    const pw = powAt(c.x, c.y, c.z) > 0;
    const st = rsData(world).get(k);
    if (!st || st.f == null) continue;
    if (pw && !st.e) {
      if (tryPush(world, c.x, c.y, c.z, st.f, c.id)) {
        st.e = 1;
        rsData(world).set(k, st);
        actions.push({ t: 'piston', x: c.x, y: c.y, z: c.z });
        recheck = true;
      }
    } else if (!pw && st.e) {
      doRetract(world, c.x, c.y, c.z, st.f, c.id);
      st.e = 0;
      rsData(world).set(k, st);
      actions.push({ t: 'piston', x: c.x, y: c.y, z: c.z });
      recheck = true;
    }
  }
  // apply: receivers (lamp/door/tnt/note)
  for (const [k, c] of recv) {
    const pw = powAt(c.x, c.y, c.z) > 0;
    if (c.id === B.LAMP || c.id === B.LAMP_ON) {
      const want = pw ? B.LAMP_ON : B.LAMP;
      if (want !== c.id) world.setBlock(c.x, c.y, c.z, want);
    } else if (c.id === B.TNT) {
      if (pw) actions.push({ t: 'tnt', x: c.x, y: c.y, z: c.z });
    } else if (c.id === B.NOTE_BLOCK) {
      if (pw && !world._rsNoteOn?.has(k)) actions.push({ t: 'note', x: c.x, y: c.y, z: c.z });
      if (pw) { if (!world._rsNoteOn) world._rsNoteOn = new Set(); world._rsNoteOn.add(k); }
      else world._rsNoteOn?.delete(k);
    } else if (c.id === B.DOOR_WOOD_B || c.id === B.DOOR_IRON_B) {
      if (pw) actions.push({ t: 'door', x: c.x, y: c.y, z: c.z, open: true });
    } else if (c.id === B.DOOR_WOOD_BOT_OPEN || c.id === B.DOOR_IRON_BOT_OPEN) {
      if (!pw) actions.push({ t: 'door', x: c.x, y: c.y, z: c.z, open: false });
    }
  }
  if (recheck) {
    const foll = rsFoll(world);
    for (const [k] of bulb) foll.add(k);
    for (const [k] of comp) foll.add(k);
    for (const [k] of piston) foll.add(k);
  }
  return actions;
}

// comparator back input: exact dust level, container fullness, directed device, or static
function compBack(world, bx, by, bz, fdx, fdy, fdz, dustPow, torchOn) {
  const bid = world.getBlock(bx, by, bz);
  if (bid === undefined) return 0;
  if (isWire(bid)) return dustPow.get(k3(bx, by, bz)) | 0;
  if (typeof world.getContainerFullness === 'function') {
    const full = world.getContainerFullness(bx, by, bz);
    if (full > 0) return full;
  }
  return Math.max(
    emitToward(world, bx, by, bz, fdx, fdy, fdz, dustPow, torchOn),
    blockLevelAt(world, bx, by, bz, bid)
  );
}

// push chain starting at cell (x,y,z) one step along (dx,dy,dz). Returns moved list or null.
function pushBlocks(world, x, y, z, dx, dy, dz) {
  const chain = [];
  let cx = x, cy = y, cz = z;
  for (let i = 0; i < 13; i++) {
    const id = world.getBlock(cx, cy, cz);
    if (id === undefined) return null;
    if (id === B.AIR) break;
    if (UNPUSHABLE.has(id)) return null;
    if (world.hasDataAt && world.hasDataAt(cx, cy, cz)) return null;
    chain.push({ x: cx, y: cy, z: cz, id });
    cx += dx; cy += dy; cz += dz;
  }
  if (chain.length > 12) return null;
  const last = chain[chain.length - 1];
  if (last) {
    const beyond = world.getBlock(last.x + dx, last.y + dy, last.z + dz);
    if (beyond === undefined || beyond !== B.AIR) return null;
  }
  const data = rsData(world), lvls = rsLvls(world), pend = rsPend(world);
  for (let i = chain.length - 1; i >= 0; i--) {
    const c = chain[i];
    const tx = c.x + dx, ty = c.y + dy, tz = c.z + dz;
    const ck = k3(c.x, c.y, c.z), tk = k3(tx, ty, tz);
    const saved = data.get(ck), savedLvl = lvls.get(ck), savedPend = pend.get(ck);
    world.setBlock(tx, ty, tz, c.id);
    if (saved !== undefined) data.set(tk, saved);
    if (savedLvl !== undefined) lvls.set(tk, savedLvl);
    if (savedPend !== undefined) pend.set(tk, savedPend);
    if (typeof world.moveContainer === 'function') world.moveContainer(ck, tk);
    world.setBlock(c.x, c.y, c.z, B.AIR);
  }
  return chain;
}

function tryPush(world, px, py, pz, f, baseId) {
  const [dx, dy, dz] = DIRS6[f];
  const moved = pushBlocks(world, px + dx, py + dy, pz + dz, dx, dy, dz);
  if (!moved) return false;
  const hx = px + dx, hy = py + dy, hz = pz + dz;
  world.setBlock(hx, hy, hz, B.PISTON_HEAD);
  rsData(world).set(k3(hx, hy, hz), { f, piston: baseId });
  return true;
}

function doRetract(world, px, py, pz, f, baseId) {
  const [dx, dy, dz] = DIRS6[f];
  const hx = px + dx, hy = py + dy, hz = pz + dz;
  if (world.getBlock(hx, hy, hz) !== B.PISTON_HEAD) return;
  if (baseId === B.STICKY_PISTON) {
    const bx = hx + dx, by = hy + dy, bz = hz + dz;
    const bid = world.getBlock(bx, by, bz);
    if (bid !== undefined && bid !== B.AIR && !UNPUSHABLE.has(bid) && !(world.hasDataAt && world.hasDataAt(bx, by, bz))) {
      const data = rsData(world), lvls = rsLvls(world), pend = rsPend(world);
      const ck = k3(bx, by, bz), tk = k3(hx, hy, hz);
      const saved = data.get(ck), savedLvl = lvls.get(ck), savedPend = pend.get(ck);
      world.setBlock(bx, by, bz, B.AIR);
      world.setBlock(hx, hy, hz, bid);
      if (saved !== undefined) data.set(tk, saved);
      if (savedLvl !== undefined) lvls.set(tk, savedLvl);
      if (savedPend !== undefined) pend.set(tk, savedPend);
      if (typeof world.moveContainer === 'function') world.moveContainer(ck, tk);
      return;
    }
  }
  world.setBlock(hx, hy, hz, B.AIR);
}

// family of a block id for facing-map cleanup (variant swaps keep data)
export function rsFamily(id) {
  if (isRep(id)) return 'rep';
  if (isComp(id)) return 'comp';
  if (isObs(id)) return 'obs';
  if (id === B.PISTON || id === B.STICKY_PISTON) return 'piston';
  if (id === B.PISTON_HEAD) return 'head';
  if (id === B.DISPENSER) return 'disp';
  if (id === B.DROPPER) return 'drop';
  if (id === B.HOPPER) return 'hop';
  if (isBulb(id)) return 'bulb';
  return null;
}

// bookkeeping after a cell change: drop facing data on family change, file machines,
// kill stale pendings. Called by World.setBlock (outer + nested).
export function rsTouch(world, x, y, z, oldId, newId) {
  const k = k3(x, y, z);
  const of = rsFamily(oldId), nf = rsFamily(newId);
  const rd = rsData(world); // always exists from here on
  if (of && of !== nf) rd.delete(k); // keep pre-seeded data on fresh placement
  if (oldId !== newId) {
    rsPend(world).delete(k);
    rsTgt(world).delete(k);
    world._rsNoteOn?.delete(k);
  }
  const mech = world._rsMech || (world._rsMech = new Set());
  if (newId === B.DISPENSER || newId === B.DROPPER || newId === B.HOPPER) mech.add(k);
  else mech.delete(k);
}

// neighbors watching this cell pulse. Only schedules (no swaps) - tick applies.
export function rsObserve(world, x, y, z) {
  const now = world._rsNow || 0;
  const pend = rsPend(world);
  for (let i = 0; i < 6; i++) {
    const [dx, dy, dz] = DIRS6[i];
    const nx = x + dx, ny = y + dy, nz = z + dz;
    if (world.getBlock(nx, ny, nz) !== B.OBSERVER) continue;
    const nk = k3(nx, ny, nz);
    let f = faceOf(world, nx, ny, nz);
    if (f < 0) f = i ^ 1; // default: face the changed cell
    if (f !== (i ^ 1)) continue; // observer input looks at (x,y,z)?
    if (pend.has(nk)) continue;
    pend.set(nk, { at: now, kind: 'obsOn' });
  }
}
// per-frame redstone tick: buttons/plates/sensors/tnt/note registries + pendings + follows.
// api: { setBlock, getBlock, time, daylight, onAction, noteAt, tntAt }
export function tickRedstone(world, api) {
  const t = api.time;
  // plates: press under entities, release when clear
  if (api.entities) {
    const pressed = new Set();
    for (const e of api.entities) {
      const p = e && e.pos;
      if (!p) continue;
      for (const py of [Math.floor(p.y), Math.floor(p.y - 0.3)]) {
        const bx = Math.floor(p.x), bz = Math.floor(p.z);
        if (world.getBlock(bx, py, bz) === B.PLATE) {
          api.setBlock(bx, py, bz, B.PLATE_ON);
          pressed.add(k3(bx, py, bz));
        }
      }
    }
    for (const k of (world._rsPlates || [])) {
      if (pressed.has(k)) continue;
      world._rsPlates.delete(k);
      const [x, y, z] = k.split(',').map(Number);
      if (world.getBlock(x, y, z) === B.PLATE_ON) api.setBlock(x, y, z, B.PLATE);
    }
  }
  for (const [k, e] of (world._rsButtons || [])) {
    const until = (e && typeof e === 'object') ? e.until : e;
    if (t < until) continue;
    world._rsButtons.delete(k);
    const [x, y, z] = k.split(',').map(Number);
    if (world.getBlock(x, y, z) === B.BUTTON_ON) api.setBlock(x, y, z, B.BUTTON);
  }
  for (const k of (world._rsSensors || [])) {
    const [x, y, z] = k.split(',').map(Number);
    const want = api.daylight >= 8 ? B.SENSOR_ON : B.SENSOR;
    if (world.getBlock(x, y, z) !== want) api.setBlock(x, y, z, want);
  }
  for (const [k, p] of rsPend(world)) {
    if (t < p.at) continue;
    rsPend(world).delete(k);
    const [x, y, z] = k.split(',').map(Number);
    const id = world.getBlock(x, y, z);
    if (p.kind === 'obsOn') {
      if (id === B.OBSERVER) {
        api.setBlock(x, y, z, B.OBSERVER_ON);
        rsPend(world).set(k, { at: t + 0.15, kind: 'obsOff' });
      }
    } else if (p.kind === 'obsOff') {
      if (id === B.OBSERVER_ON) api.setBlock(x, y, z, B.OBSERVER);
    } else if (p.kind === 'rep') {
      if (isRep(id)) {
        const f = repFacing(id);
        const want = p.want ? B.REPEATER + 4 + f : B.REPEATER + f;
        if (want !== id) api.setBlock(x, y, z, want);
      }
    }
  }
  for (const [k, e] of rsTgt(world)) {
    if (t < e.until) continue;
    rsTgt(world).delete(k);
    const [x, y, z] = k.split(',').map(Number);
    if (world.getBlock(x, y, z) === B.TARGET && typeof world.rsUpdate === 'function') world.rsUpdate(x, y, z);
  }
  const foll = rsFoll(world);
  if (foll.size && typeof world.rsUpdate === 'function') {
    const arr = [...foll].slice(0, 16);
    for (const k of arr) foll.delete(k);
    for (const k of arr) {
      const [x, y, z] = k.split(',').map(Number);
      world.rsUpdate(x, y, z);
    }
  }
}
