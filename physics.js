// Shared AABB-vs-voxel physics for the player and mobs.
// Entities: pos = feet center {x,y,z}, vel {x,y,z}, half (xz half-width), height.

import { B, BLOCKS, isSolid, blockBoxes } from './blocks.js';

const EPS = 0.001;
const AXES = ['x', 'z', 'y'];

// Collision boxes of a block in cell-local 0..1 coords. Stairs collide with
// their real two-box shape; slabs (and other colHeight blocks) with a single
// reduced-height box; everything else with the full cell.
const FULL_BOX = [{ x0: 0, y0: 0, z0: 0, x1: 1, y1: 1, z1: 1 }];
const colBoxCache = [];
function colBoxesOf(id) {
  let boxes = colBoxCache[id];
  if (!boxes) {
    const blk = BLOCKS[id];
    boxes = blk.shape === 'stairs' ? blockBoxes(id)
      : blk.colHeight ? [{ x0: 0, y0: 0, z0: 0, x1: 1, y1: blk.colHeight, z1: 1 }]
        : FULL_BOX;
    colBoxCache[id] = boxes;
  }
  return boxes;
}

function boxCollides(world, e) {
  const minX = e.pos.x - e.half, maxX = e.pos.x + e.half;
  const minY = e.pos.y, maxY = e.pos.y + e.height;
  const minZ = e.pos.z - e.half, maxZ = e.pos.z + e.half;
  const x0 = Math.floor(minX), x1 = Math.floor(maxX);
  const y0 = Math.floor(minY), y1 = Math.floor(maxY);
  const z0 = Math.floor(minZ), z1 = Math.floor(maxZ);
  for (let by = y0; by <= y1; by++)
    for (let bz = z0; bz <= z1; bz++)
      for (let bx = x0; bx <= x1; bx++) {
        const id = world.getBlock(bx, by, bz);
        if (!isSolid(id)) continue;
        for (const b of colBoxesOf(id))
          if (bx + b.x0 < maxX && bx + b.x1 > minX && by + b.y0 < maxY &&
            by + b.y1 > minY && bz + b.z0 < maxZ && bz + b.z1 > minZ) return true;
      }
  return false;
}

// Entities may set e.stepHeight (blocks) + e.stepAssistGround (bool) to
// automatically step up low obstacles (Minecraft: 0.6). Full 1-block walls
// still stop movement.
// Would entity `e` collide if its AABB height were `height`? (sneak headroom check)
export function collidesWithHeight(world, e, height) {
  const h = e.height;
  e.height = height;
  const hit = boxCollides(world, e);
  e.height = h;
  return hit;
}

export function moveEntity(world, e, dt) {
  let onGround = false, hitWall = false;
  const maxDisp = Math.max(Math.abs(e.vel.x), Math.abs(e.vel.y), Math.abs(e.vel.z)) * dt;
  const steps = Math.max(1, Math.ceil(maxDisp / 0.4));
  const sdt = dt / steps;

  for (let s = 0; s < steps; s++) {
    for (const a of AXES) {
      const d = e.vel[a] * sdt;
      if (d === 0) continue;
      e.pos[a] += d;

      const minX = e.pos.x - e.half, maxX = e.pos.x + e.half;
      const minY = e.pos.y, maxY = e.pos.y + e.height;
      const minZ = e.pos.z - e.half, maxZ = e.pos.z + e.half;
      const x0 = Math.floor(minX), x1 = Math.floor(maxX);
      const y0 = Math.floor(minY), y1 = Math.floor(maxY);
      const z0 = Math.floor(minZ), z1 = Math.floor(maxZ);

      let collided = false;
      let bound = d > 0 ? Infinity : -Infinity;
      let stepTop = -Infinity;
      for (let by = y0; by <= y1; by++) {
        for (let bz = z0; bz <= z1; bz++) {
          for (let bx = x0; bx <= x1; bx++) {
            const id = world.getBlock(bx, by, bz);
            if (!isSolid(id)) continue;
            for (const b of colBoxesOf(id)) {
              if (bx + b.x0 >= maxX || bx + b.x1 <= minX || by + b.y0 >= maxY ||
                by + b.y1 <= minY || bz + b.z0 >= maxZ || bz + b.z1 <= minZ) continue;
              collided = true;
              const lo = a === 'x' ? bx + b.x0 : a === 'y' ? by + b.y0 : bz + b.z0;
              const hi = a === 'x' ? bx + b.x1 : a === 'y' ? by + b.y1 : bz + b.z1;
              bound = d > 0 ? Math.min(bound, lo) : Math.max(bound, hi);
              if (a !== 'y') stepTop = Math.max(stepTop, by + b.y1);
            }
          }
        }
      }
      if (collided) {
        // try stepping up low obstacles instead of stopping
        if (a !== 'y' && e.stepHeight > 0 && e.stepAssistGround) {
          const lift = stepTop - e.pos.y;
          if (lift > 0 && lift <= e.stepHeight + 1e-4) {
            const savedY = e.pos.y;
            e.pos.y = stepTop + EPS;
            if (!boxCollides(world, e)) continue; // stepped up, keep the move
            e.pos.y = savedY;
          }
        }
        if (a === 'y') {
          if (d > 0) e.pos.y = bound - e.height - EPS;
          else { e.pos.y = bound + EPS; onGround = true; }
        } else {
          e.pos[a] = d > 0 ? bound - e.half - EPS : bound + e.half + EPS;
          hitWall = true;
        }
        e.vel[a] = 0;
      }
    }
  }
  return { onGround, hitWall };
}

export function isWaterAt(world, x, y, z) {
  return world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z)) === B.WATER;
}

export function isLavaAt(world, x, y, z) {
  return world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z)) === B.LAVA;
}

// Does block cell (bx,by,bz) overlap entity's AABB?
export function blockOverlapsEntity(bx, by, bz, e) {
  return bx + 1 > e.pos.x - e.half && bx < e.pos.x + e.half &&
    by + 1 > e.pos.y && by < e.pos.y + e.height &&
    bz + 1 > e.pos.z - e.half && bz < e.pos.z + e.half;
}

// Ray vs entity AABB, returns t or null.
export function rayVsEntity(ox, oy, oz, dx, dy, dz, e, maxT) {
  const minX = e.pos.x - e.half, maxX = e.pos.x + e.half;
  const minY = e.pos.y, maxY = e.pos.y + e.height;
  const minZ = e.pos.z - e.half, maxZ = e.pos.z + e.half;
  let t0 = 0, t1 = maxT;
  const slab = (o, d, mn, mx) => {
    if (Math.abs(d) < 1e-9) return o >= mn && o <= mx;
    let ta = (mn - o) / d, tb = (mx - o) / d;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    return t0 <= t1;
  };
  if (!slab(ox, dx, minX, maxX)) return null;
  if (!slab(oy, dy, minY, maxY)) return null;
  if (!slab(oz, dz, minZ, maxZ)) return null;
  return t0;
}
