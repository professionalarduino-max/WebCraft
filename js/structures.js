// Instant structures: use a structure item and a whole build appears.
// Each builder returns [dx, dy, dz, blockId] rows, dy = 0 at the base.
// Fixed orientation: the front/door always faces +z.

import { B, WOOL_IDS } from './blocks.js';

// stair id: base + facing (0:+x high, 1:+z high, 2:-x high, 3:-z high)
const ST = (base, f) => base + f;
const RED = WOOL_IDS[14], BLUE = WOOL_IDS[11], YELLOW = WOOL_IDS[4], GREEN = WOOL_IDS[12];

function box(out, x0, y0, z0, x1, y1, z1, id) {
  for (let y = y0; y <= y1; y++)
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++) out.push([x, y, z, id]);
}

// perimeter walls of a rect (no floor/ceiling), with holes skipped via skip(set of "x,y,z")
function ring(out, x0, y0, z0, x1, y1, z1, id, skip = null) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      for (const z of [z0, z1]) {
        if (!skip || !skip.has(x + ',' + y + ',' + z)) out.push([x, y, z, id]);
      }
    }
    for (let z = z0 + 1; z <= z1 - 1; z++) {
      for (const x of [x0, x1]) {
        if (!skip || !skip.has(x + ',' + y + ',' + z)) out.push([x, y, z, id]);
      }
    }
  }
}

// nest one build inside another at an offset
function place(out, rows, ox, oy, oz) {
  for (const [x, y, z, id] of rows) out.push([x + ox, y + oy, z + oz, id]);
}

// crenellation along a straight run (no corner dupes: call per edge)
function crenelX(out, x0, x1, y, z, id) {
  for (let x = x0; x <= x1; x += 2) out.push([x, y, z, id]);
}
function crenelZ(out, x, y, z0, z1, id) {
  for (let z = z0; z <= z1; z += 2) out.push([x, y, z, id]);
}

// ---------------------------------------------------------------- house ---
// 11x8 cottage: log frame, gabled stair roof, porch, chimney, furnished
function buildHouse() {
  const o = [];
  // floor: cobble border, planks, red rug
  for (let x = 0; x <= 10; x++) {
    for (let z = 0; z <= 7; z++) {
      const border = x === 0 || x === 10 || z === 0 || z === 7;
      const rug = x >= 4 && x <= 6 && z >= 2 && z <= 4;
      o.push([x, 0, z, rug ? RED : border ? B.COBBLE : B.PLANK]);
    }
  }
  // walls y1..3 with log frame + windows + door
  const skip = new Set(['5,1,7', '5,2,7', '2,2,7', '8,2,7', '2,2,0', '8,2,0', '0,2,3', '10,2,3']);
  for (let y = 1; y <= 3; y++) {
    for (let x = 0; x <= 10; x++) {
      for (const z of [0, 7]) {
        if (skip.has(x + ',' + y + ',' + z)) continue;
        const post = x === 0 || x === 5 || x === 10;
        o.push([x, y, z, post ? B.DARK_LOG : B.PLANK]);
      }
    }
    for (let z = 1; z <= 6; z++) {
      for (const x of [0, 10]) {
        if (skip.has(x + ',' + y + ',' + z)) continue;
        o.push([x, y, z, B.PLANK]);
      }
    }
  }
  for (const [wx, wz] of [[2, 7], [8, 7], [2, 0], [8, 0], [0, 3], [10, 3]]) o.push([wx, 2, wz, B.GLASS_PANE]);
  o.push([5, 1, 7, B.DOOR + 1], [5, 2, 7, B.DOOR_TOP]);
  // porch: deck, posts, awning
  box(o, 3, 0, 8, 7, 0, 8, B.COBBLE_SLAB);
  box(o, 3, 1, 8, 3, 2, 8, B.FENCE);
  box(o, 7, 1, 8, 7, 2, 8, B.FENCE);
  box(o, 2, 3, 8, 8, 3, 9, B.OAK_SLAB);
  // gabled stairs roof, ridge along X (chimney hole at x=8 on the north slope)
  for (let x = -1; x <= 11; x++) {
    if (x !== 8) o.push([x, 4, 2, ST(B.OAK_STAIRS, 1)]);
    o.push([x, 5, 1, ST(B.OAK_STAIRS, 1)]);
    o.push([x, 6, 0, ST(B.OAK_STAIRS, 1)]);
    o.push([x, 7, -1, ST(B.OAK_STAIRS, 1)]);
    o.push([x, 4, 5, ST(B.OAK_STAIRS, 3)]);
    o.push([x, 5, 6, ST(B.OAK_STAIRS, 3)]);
    o.push([x, 6, 7, ST(B.OAK_STAIRS, 3)]);
    o.push([x, 7, 8, ST(B.OAK_STAIRS, 3)]);
  }
  box(o, -1, 7, 3, 11, 7, 4, B.LOG); // ridge beam
  box(o, -1, 8, 3, 11, 8, 4, B.OAK_SLAB); // ridge cap
  for (const gx of [0, 10]) { // gable triangles (skip cells the stairs occupy)
    const gskip = new Set([`${gx},4,2`, `${gx},5,1`, `${gx},6,0`, `${gx},4,5`, `${gx},5,6`, `${gx},6,7`]);
    for (let z = 1; z <= 6; z++) if (!gskip.has(`${gx},4,${z}`)) o.push([gx, 4, z, B.PLANK]);
    for (let z = 2; z <= 5; z++) if (!gskip.has(`${gx},5,${z}`)) o.push([gx, 5, z, B.PLANK]);
    for (let z = 3; z <= 4; z++) o.push([gx, 6, z, B.PLANK]);
  }
  box(o, 8, 4, 2, 8, 9, 2, B.BRICKS); // chimney
  o.push([8, 10, 2, B.COBBLE_SLAB]);
  // interior
  o.push([2, 1, 1, B.BED], [3, 1, 1, B.BED], [1, 1, 1, B.CHEST]);
  o.push([5, 1, 1, B.CRAFTING_TABLE], [8, 1, 1, B.FURNACE]);
  o.push([6, 1, 1, B.BOOKSHELF], [7, 1, 1, B.BOOKSHELF]);
  o.push([5, 1, 5, B.FENCE], [5, 2, 5, B.GLOWSTONE]); // table lamp
  return o;
}

// --------------------------------------------------------------- castle ---
// 21x21 fortress: 4 detailed towers, buttressed walls, portcullis gate,
// courtyard with paths, a well and lamp posts
function buildCastle() {
  const o = [];
  const bannerCols = [RED, BLUE, YELLOW, GREEN];
  let bi = 0;
  for (const [tx, tz] of [[0, 0], [15, 0], [0, 15], [15, 15]]) {
    box(o, tx, 0, tz, tx + 5, 0, tz + 5, B.STONE_BRICK); // floor
    const bskip = new Set(); // bar windows on every face at y6
    for (const wx of [tx + 2, tx + 3]) {
      bskip.add(`${wx},6,${tz}`).add(`${wx},6,${tz + 5}`);
    }
    for (const wz of [tz + 2, tz + 3]) {
      bskip.add(`${tx},6,${wz}`).add(`${tx + 5},6,${wz}`);
    }
    for (let y = 1; y <= 9; y++) {
      for (let x = tx; x <= tx + 5; x++) {
        for (const z of [tz, tz + 5]) {
          if (bskip.has(x + ',' + y + ',' + z)) continue;
          const corner = (x === tx || x === tx + 5);
          o.push([x, y, z, corner ? B.CHISELED_BRICKS : B.STONE_BRICK]);
        }
      }
      for (let z = tz + 1; z <= tz + 4; z++) {
        for (const x of [tx, tx + 5]) {
          if (bskip.has(x + ',' + y + ',' + z)) continue;
          o.push([x, y, z, B.STONE_BRICK]);
        }
      }
    }
    for (const c of bskip) {
      const [x, y, z] = c.split(',').map(Number);
      o.push([x, y, z, B.IRON_BARS]);
    }
    box(o, tx, 10, tz, tx + 5, 10, tz + 5, B.STONE_BRICK); // cap
    crenelX(o, tx, tx + 5, 11, tz, B.STONE_BRICK);
    crenelX(o, tx, tx + 5, 11, tz + 5, B.STONE_BRICK);
    o.push([tx, 11, tz + 2, B.STONE_BRICK], [tx + 5, 11, tz + 2, B.STONE_BRICK]);
    box(o, tx + 1, 12, tz + 1, tx + 4, 12, tz + 4, B.STONE_BRICK_SLAB); // roof
    o.push([tx + 2, 13, tz + 2, B.GLOWSTONE]); // beacon
    // banners on both outer faces
    const col = bannerCols[bi++ % 4];
    const ox = tx === 0 ? tx - 1 : tx + 6, oz = tz === 0 ? tz - 1 : tz + 6;
    const bx = tx === 0 ? tx + 2 : tx + 3, bz = tz === 0 ? tz + 2 : tz + 3;
    box(o, bx, 7, oz, bx + 1, 9, oz, col);
    box(o, ox, 7, bz, ox, 9, bz + 1, col);
  }
  // walls with buttresses + crenellation
  const gateSkip = new Set();
  for (let y = 1; y <= 4; y++) for (let x = 9; x <= 11; x++) gateSkip.add(`${x},${y},20`);
  gateSkip.add('8,5,20').add('12,5,20'); // lamp cells
  for (let y = 1; y <= 6; y++) {
    for (let x = 6; x <= 14; x++) {
      if (!gateSkip.has(`${x},${y},0`)) o.push([x, y, 0, B.STONE_BRICK]); // back
      if (!gateSkip.has(`${x},${y},20`)) o.push([x, y, 20, B.STONE_BRICK]); // front
    }
    for (let z = 6; z <= 14; z++) {
      o.push([0, y, z, B.STONE_BRICK]);
      o.push([20, y, z, B.STONE_BRICK]);
    }
  }
  crenelX(o, 6, 14, 7, 0, B.STONE_BRICK);
  crenelX(o, 6, 14, 7, 20, B.STONE_BRICK);
  crenelZ(o, 0, 7, 6, 14, B.STONE_BRICK);
  crenelZ(o, 20, 7, 6, 14, B.STONE_BRICK);
  for (const bx of [6, 10, 14]) { // outer buttresses
    box(o, bx, 1, -1, bx, 7, -1, B.STONE_BRICK);
    if (bx !== 10) box(o, bx, 1, 21, bx, 7, 21, B.STONE_BRICK);
  }
  for (const bz of [6, 10, 14]) {
    box(o, -1, 1, bz, -1, 7, bz, B.STONE_BRICK);
    box(o, 21, 1, bz, 21, 7, bz, B.STONE_BRICK);
  }
  box(o, 9, 1, 20, 11, 3, 20, B.IRON_BARS); // portcullis
  o.push([8, 5, 20, B.GLOWSTONE], [12, 5, 20, B.GLOWSTONE]); // gate lamps
  box(o, 7, 3, 19, 7, 5, 19, RED); // courtyard banners
  box(o, 13, 3, 19, 13, 5, 19, BLUE);
  // courtyard: gravel cross paths, a well, lamp posts
  for (let z = 1; z <= 19; z++) o.push([10, 0, z, B.GRAVEL]);
  for (let x = 1; x <= 19; x++) if (x !== 10) o.push([x, 0, 10, B.GRAVEL]);
  place(o, buildWell(), 9, 1, 9);
  for (const [lx, lz] of [[4, 4], [16, 4], [4, 16], [16, 16]]) {
    o.push([lx, 1, lz, B.FENCE], [lx, 2, lz, B.SEA_LANTERN]);
  }
  return o;
}

// ----------------------------------------------------------------- well ---
// mossy stone well with posts and a gabled stair roof
function buildWell() {
  const o = [];
  for (let x = 0; x <= 2; x++) {
    for (let z = 0; z <= 2; z++) {
      if (x === 1 && z === 1) continue;
      const corner = (x !== 1 && z !== 1);
      o.push([x, 0, z, corner ? B.COBBLE : B.MOSSY_COBBLE]);
      o.push([x, 1, z, corner ? B.MOSSY_COBBLE : B.COBBLE]);
    }
  }
  o.push([1, 0, 1, B.WATER]);
  for (const [cx, cz] of [[0, 0], [2, 0], [0, 2], [2, 2]]) o.push([cx, 2, cz, B.FENCE]);
  for (let x = -1; x <= 3; x++) {
    o.push([x, 3, 0, ST(B.OAK_STAIRS, 1)]);
    o.push([x, 3, 2, ST(B.OAK_STAIRS, 3)]);
  }
  box(o, -1, 4, 1, 3, 4, 1, B.OAK_SLAB);
  return o;
}

// --------------------------------------------------------------- portal ---
// nether gate: obsidian frame with crying corners, amethyst pillars,
// magma platform, glowing braziers
function buildPortal() {
  const o = [];
  for (let x = -1; x <= 5; x++) {
    for (let z = -3; z <= 3; z++) {
      const corner = (x === -1 || x === 5) && (z === -3 || z === 3);
      const edgeMid = (x === -1 || x === 5) && z === 0;
      o.push([x, 0, z, corner ? B.MAGMA : edgeMid ? B.OBSIDIAN : B.NETHERRACK]);
    }
  }
  for (let x = 0; x <= 3; x++) {
    for (let y = 1; y <= 5; y++) {
      const edge = x === 0 || x === 3 || y === 1 || y === 5;
      if (!edge) continue;
      const corner = (x === 0 || x === 3) && (y === 1 || y === 5);
      o.push([x, y, 0, corner ? B.CRYING_OBSIDIAN : B.OBSIDIAN]);
    }
  }
  box(o, 1, 2, 0, 2, 4, 0, B.PORTAL); // lit and ready
  for (const px of [-1, 5]) {
    box(o, px, 1, 0, px, 4, 0, B.OBSIDIAN);
    o.push([px, 5, 0, B.AMETHYST]);
  }
  for (const [lx, lz] of [[-1, -3], [5, -3], [-1, 3], [5, 3]]) o.push([lx, 1, lz, B.GLOWSTONE]);
  return o;
}

// ---------------------------------------------------------------- villa ---
// modern 15x11 villa: panoramic panes, dark frieze, pool with deck,
// garden, grand bone entrance, two rooms
function buildVilla() {
  const o = [];
  const pillarsX = new Set([0, 3, 6, 9, 12, 14]);
  // floor with dark inlay stripes
  for (let x = 0; x <= 14; x++) {
    for (let z = 0; z <= 10; z++) {
      o.push([x, 0, z, x % 5 === 4 ? B.DARK_PLANK : B.QUARTZ_BLOCK]);
    }
  }
  // walls: quartz pillars, glass panes, tinted frieze
  for (let y = 1; y <= 3; y++) {
    for (let x = 0; x <= 14; x++) {
      for (const z of [0, 10]) {
        if (z === 10 && x === 7 && y <= 2) continue; // doorway
        o.push([x, y, z, pillarsX.has(x) ? B.QUARTZ_BLOCK : y === 3 ? B.TINTED_GLASS : B.GLASS_PANE]);
      }
    }
    for (let z = 1; z <= 9; z++) {
      for (const x of [0, 14]) {
        o.push([x, y, z, z === 5 ? B.QUARTZ_BLOCK : y === 3 ? B.TINTED_GLASS : B.GLASS_PANE]);
      }
    }
  }
  o.push([7, 1, 10, B.DOOR + 1], [7, 2, 10, B.DOOR_TOP]);
  box(o, 0, 4, 0, 14, 4, 10, B.QUARTZ_BLOCK); // flat roof
  ring(o, 0, 5, 0, 14, 5, 10, B.QUARTZ_BLOCK); // rim
  // partition with a wide opening (z=1..9: the z=0/10 cells are wall pillars)
  for (let y = 1; y <= 3; y++) {
    for (let z = 1; z <= 9; z++) {
      if (y <= 2 && (z === 4 || z === 5)) continue;
      o.push([9, y, z, B.QUARTZ_BLOCK]);
    }
  }
  // pool with deck + umbrella + chairs
  for (let x = -6; x <= -1; x++) {
    for (let z = 3; z <= 7; z++) {
      const edge = x === -6 || x === -1 || z === 3 || z === 7;
      o.push([x, 0, z, edge ? B.QUARTZ_BLOCK : B.WATER]);
    }
  }
  for (let x = -7; x <= -1; x++) {
    for (let z = 2; z <= 8; z++) {
      if (x >= -6 && z >= 3 && z <= 7) continue;
      o.push([x, 0, z, B.QUARTZ_BLOCK]);
    }
  }
  box(o, -4, 1, 5, -4, 2, 5, B.FENCE);
  box(o, -5, 3, 4, -3, 3, 6, B.WOOL);
  o.push([-4, 1, 3, ST(B.OAK_STAIRS, 3)], [-2, 1, 3, ST(B.OAK_STAIRS, 3)]);
  // garden path + hedges + grand entrance
  box(o, 6, 0, 11, 8, 0, 13, B.GRAVEL);
  box(o, 3, 1, 11, 4, 1, 13, B.LEAVES);
  box(o, 10, 1, 11, 11, 1, 13, B.LEAVES);
  box(o, 5, 1, 11, 5, 2, 11, B.BONE_BLOCK);
  box(o, 9, 1, 11, 9, 2, 11, B.BONE_BLOCK);
  box(o, 5, 3, 11, 9, 3, 11, B.QUARTZ_BLOCK);
  // interior: living + kitchen, floor lamps
  o.push([2, 1, 1, B.BED], [3, 1, 1, B.BED], [1, 1, 1, B.CHEST]);
  o.push([5, 1, 1, B.CRAFTING_TABLE], [6, 1, 1, B.BOOKSHELF], [7, 1, 1, B.BOOKSHELF]);
  o.push([11, 1, 1, B.CRAFTING_TABLE], [13, 1, 1, B.FURNACE], [10, 1, 1, B.CHEST]);
  o.push([4, 1, 5, B.FENCE], [4, 2, 5, B.SEA_LANTERN]);
  o.push([12, 1, 6, B.FENCE], [12, 2, 6, B.SEA_LANTERN]);
  return o;
}


// glass office tower with quartz bands, lobby, canopy, roof mast
function towerBlock(o, x0, z0, w, d, h) {
  const x1 = x0 + w - 1, z1 = z0 + d - 1;
  const doorX = x0 + ((w / 2) | 0);
  for (let y = 1; y <= h; y++) {
    for (let x = x0; x <= x1; x++) {
      for (const z of [z0, z1]) {
        if (z === z1 && x === doorX && y <= 2) continue;
        const corner = x === x0 || x === x1;
        o.push([x, y, z, corner || y % 4 === 0 ? B.QUARTZ_BLOCK : B.GLASS]);
      }
    }
    for (let z = z0 + 1; z <= z1 - 1; z++) {
      for (const x of [x0, x1]) {
        o.push([x, y, z, y % 4 === 0 ? B.QUARTZ_BLOCK : B.GLASS]);
      }
    }
  }
  o.push([doorX, 1, z1, B.DOOR + 1], [doorX, 2, z1, B.DOOR_TOP]);
  box(o, doorX - 1, 3, z1 + 1, doorX + 1, 3, z1 + 2, B.STONE_SLAB); // canopy
  for (let x = doorX - 1; x <= doorX + 1; x++) o.push([x, 0, z1 + 1, ST(B.STONE_STAIRS, 3)]); // steps
  for (const [lx, lz] of [[x0 + 1, z0 + 1], [x1 - 1, z0 + 1], [x0 + 1, z1 - 1], [x1 - 1, z1 - 1]])
    o.push([lx, 1, lz, B.SEA_LANTERN]); // lobby lights
  box(o, x0, h + 1, z0, x1, h + 1, z1, B.QUARTZ_BLOCK); // roof
  ring(o, x0, h + 2, z0, x1, h + 2, z1, B.QUARTZ_BLOCK); // rim
  for (const [ax, az] of [[x0 + 1, z0 + 1], [x1 - 1, z0 + 1], [x0 + 1, z1 - 1], [x1 - 1, z1 - 1]])
    o.push([ax, h + 2, az, B.IRON_BLOCK]); // AC units
  const mx = x0 + ((w / 2) | 0), mz = z0 + ((d / 2) | 0);
  box(o, mx, h + 2, mz, mx, h + 4, mz, B.FENCE);
  o.push([mx, h + 5, mz, B.REDSTONE_BLOCK]); // antenna beacon
}

// modern row house: quartz base, pane walls, tinted top band
function rowHouse(o, x0, z0, w, d, h) {
  const x1 = x0 + w - 1, z1 = z0 + d - 1;
  const doorX = x0 + ((w / 2) | 0);
  for (let y = 1; y <= h; y++) {
    for (let x = x0; x <= x1; x++) {
      for (const z of [z0, z1]) {
        if (z === z1 && x === doorX && y <= 2) continue;
        const corner = x === x0 || x === x1;
        o.push([x, y, z, corner || y === 1 ? B.QUARTZ_BLOCK : y === h ? B.TINTED_GLASS : B.GLASS_PANE]);
      }
    }
    for (let z = z0 + 1; z <= z1 - 1; z++) {
      for (const x of [x0, x1]) {
        o.push([x, y, z, y === 1 ? B.QUARTZ_BLOCK : y === h ? B.TINTED_GLASS : B.GLASS_PANE]);
      }
    }
  }
  o.push([doorX, 1, z1, B.DOOR + 1], [doorX, 2, z1, B.DOOR_TOP]);
  box(o, x0, h + 1, z0, x1, h + 1, z1, B.QUARTZ_BLOCK);
  ring(o, x0, h + 2, z0, x1, h + 2, z1, B.QUARTZ_BLOCK);
}

// ----------------------------------------------------------------- city ---
// 64x64 modern city: glass towers, marked roads, park with fountain,
// parking, mall, houses, street lamps (paste on flat ground!)
function buildCity() {
  const o = [];
  const inXBand = (z) => (z >= 12 && z <= 16) || (z >= 44 && z <= 48);
  const inZBand = (x) => (x >= 12 && x <= 16) || (x >= 44 && x <= 48);
  for (const zb of [12, 44]) { // X-roads with crosswalks + center dashes
    for (let x = 0; x <= 63; x++) {
      for (let z = zb; z <= zb + 4; z++) {
        let id = B.SMOOTH_STONE;
        if (inZBand(x) && x % 2 === 0) id = B.WOOL;
        else if (z === zb + 2 && x % 6 < 3) id = YELLOW;
        o.push([x, 0, z, id]);
      }
    }
  }
  for (const xb of [12, 44]) { // Z-roads (skip X-road crossings)
    for (let z = 0; z <= 63; z++) {
      if (inXBand(z)) continue;
      for (let x = xb; x <= xb + 4; x++) {
        o.push([x, 0, z, x === xb + 2 && z % 6 < 3 ? YELLOW : B.SMOOTH_STONE]);
      }
    }
  }
  for (const zb of [12, 44]) { // sidewalks along X-roads
    for (const z of [zb - 1, zb + 5]) {
      for (let x = 0; x <= 63; x++) {
        if (inZBand(x)) continue;
        o.push([x, 0, z, B.QUARTZ_BLOCK]);
      }
    }
  }
  const inXWalk = (z) => z === 11 || z === 17 || z === 43 || z === 49;
  for (const xb of [12, 44]) { // sidewalks along Z-roads
    for (const x of [xb - 1, xb + 5]) {
      for (let z = 0; z <= 63; z++) {
        if (inXBand(z) || inXWalk(z)) continue;
        o.push([x, 0, z, B.QUARTZ_BLOCK]);
      }
    }
  }
  towerBlock(o, 24, 24, 12, 12, 22); // downtown tower
  towerBlock(o, 19, 0, 10, 10, 9);   // offices
  towerBlock(o, 32, 0, 10, 10, 8);
  towerBlock(o, 1, 20, 9, 21, 4);    // mall
  towerBlock(o, 51, 20, 11, 21, 3);  // mall 2
  towerBlock(o, 52, 52, 10, 10, 12); // second tower
  rowHouse(o, 19, 51, 7, 10, 5);     // row houses
  rowHouse(o, 27, 51, 7, 10, 5);
  rowHouse(o, 35, 51, 7, 10, 5);
  rowHouse(o, 1, 51, 8, 7, 4);       // houses
  rowHouse(o, 1, 58, 8, 5, 4);
  for (let x = 50; x <= 63; x++) { // parking lot
    for (let z = 0; z <= 10; z++) {
      o.push([x, 0, z, z === 5 && x % 6 < 3 ? YELLOW : B.SMOOTH_STONE]);
    }
  }
  for (let x = 0; x <= 10; x++) { // park lawn (pond cut out)
    for (let z = 0; z <= 10; z++) {
      if (x >= 3 && x <= 7 && z >= 3 && z <= 7) continue;
      o.push([x, 0, z, B.GRASS]);
    }
  }
  for (let x = 3; x <= 7; x++) { // pond
    for (let z = 3; z <= 7; z++) {
      const edge = x === 3 || x === 7 || z === 3 || z === 7;
      o.push([x, 0, z, edge ? B.QUARTZ_BLOCK : B.WATER]);
    }
  }
  box(o, 5, 1, 5, 5, 2, 5, B.QUARTZ_BLOCK); // fountain pillar
  o.push([5, 3, 5, B.SEA_LANTERN]);
  for (const [tx, tz] of [[1, 8], [8, 1]]) { // park trees
    box(o, tx, 1, tz, tx, 3, tz, B.LOG);
    for (let y = 3; y <= 4; y++)
      for (let ox = -1; ox <= 1; ox++)
        for (let oz = -1; oz <= 1; oz++) {
          if (ox === 0 && oz === 0 && y === 3) continue;
          if (Math.abs(ox) === 1 && Math.abs(oz) === 1 && y === 4) continue;
          o.push([tx + ox, y, tz + oz, B.LEAVES]);
        }
  }
  o.push([5, 1, 9, ST(B.OAK_STAIRS, 1)], [6, 1, 9, ST(B.OAK_STAIRS, 3)]); // loveseat
  const lamp = (x, z) => { o.push([x, 1, z, B.FENCE], [x, 2, z, B.FENCE], [x, 3, z, B.SEA_LANTERN]); };
  for (const zb of [12, 44]) {
    for (const z of [zb - 1, zb + 5]) {
      for (let x = 2; x <= 62; x += 8) {
        if (inZBand(x)) continue;
        lamp(x, z);
      }
    }
  }
  for (const xb of [12, 44]) {
    for (const x of [xb - 1, xb + 5]) {
      for (let z = 6; z <= 62; z += 8) {
        if (inXBand(z)) continue;
        lamp(x, z);
      }
    }
  }
  for (let x = 28; x <= 31; x++) { // plaza path to downtown (steps cut out)
    for (let z = 36; z <= 42; z++) {
      if (z === 36 && x >= 29 && x <= 31) continue;
      o.push([x, 0, z, B.QUARTZ_BLOCK]);
    }
  }
  for (const [px, pz] of [[22, 22], [38, 22], [22, 38], [38, 38]])
    box(o, px, 1, pz, px + 1, 1, pz + 1, B.LEAVES); // planters
  return o;
}

export const STRUCT_BUILDERS = {
  house: buildHouse,
  castle: buildCastle,
  well: buildWell,
  portal: buildPortal,
  villa: buildVilla,
  city: buildCity,
};
