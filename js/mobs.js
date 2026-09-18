// Mobs: passive animals (pig, sheep, cow) that wander, and zombies that
// spawn at night, chase the player, and burn in daylight.

import * as THREE from 'three';
import { moveEntity, isWaterAt, isLavaAt, rayVsEntity } from './physics.js';
import { B, isSolid } from './blocks.js';
import { I } from './items.js';

// [itemId, min, max] rolls per mob type
const DROP_TABLE = {
  pig: [[I.PORKCHOP, 1, 2]],
  sheep: [[B.WOOL, 1, 2], [I.MUTTON, 1, 1]],
  cow: [[I.BEEF, 1, 2]],
  zombie: [[I.FLESH, 0, 2]],
  spider: [[I.STRING, 0, 2]],
  blaze: [[I.BLAZE_ROD, 0, 1]],
  enderman: [[I.ENDER_PEARL, 1, 2]],
  creeper: [[I.GUNPOWDER, 0, 2]],
  chicken: [[I.RAW_CHICKEN, 1, 2]],
  skeleton: [[I.ARROW, 0, 2], [I.BONE, 0, 2]],
  slime: [],
  slime_small: [[I.SLIMEBALL, 0, 2]],
};

const GRAVITY = 26;

const TYPES = {
  pig: { hp: 10, speed: 1.7, half: 0.35, height: 0.85, color: 0xf0a2a0 },
  sheep: { hp: 8, speed: 1.5, half: 0.4, height: 1.0, color: 0xe8e8e8 },
  cow: { hp: 10, speed: 1.5, half: 0.4, height: 1.25, color: 0x6e4a2f },
  zombie: { hp: 20, speed: 2.7, half: 0.3, height: 1.8, color: 0x5da357, dmg: 3 },
  spider: { hp: 16, speed: 2.9, half: 0.6, height: 0.9, color: 0x352a24, dmg: 2 },
  blaze: { hp: 20, speed: 1.6, half: 0.35, height: 1.6, color: 0xe8a428 },
  enderman: { hp: 40, speed: 3.4, half: 0.35, height: 2.9, color: 0xbb44dd, dmg: 5 },
  creeper: { hp: 20, speed: 1.85, half: 0.3, height: 1.7, color: 0x4aa84a },
  chicken: { hp: 4, speed: 2.2, half: 0.25, height: 0.7, color: 0xf2f2f2 },
  skeleton: { hp: 20, speed: 2.4, half: 0.3, height: 1.9, color: 0xcfcfcf, dmg: 3 },
  slime: { hp: 16, speed: 2.6, half: 0.55, height: 1.1, color: 0x62c462, dmg: 3 },
  slime_small: { hp: 6, speed: 2.2, half: 0.3, height: 0.6, color: 0x62c462, dmg: 0 },
};

function box(w, h, d, color, x, y, z) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color })
  );
  m.position.set(x, y, z);
  return m;
}

// leg with pivot at the hip so it can swing
function leg(w, h, color, x, y, z) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, z);
  pivot.add(box(w, h, w, color, 0, -h / 2, 0));
  return pivot;
}

function eyes(head, hw, hz, color = 0x1a1a1a) {
  // hw: head half width, hz: front face z offset (local to head)
  head.add(box(0.07, 0.07, 0.02, color, -hw * 0.45, 0.05, hz));
  head.add(box(0.07, 0.07, 0.02, color, hw * 0.45, 0.05, hz));
}

function slimeModel(g, s) {
  const green = 0x62c462, dark = 0x2f8a3f;
  g.add(box(0.9 * s, 0.75 * s, 0.9 * s, green, 0, 0.42 * s, 0)); // jelly body
  const head = box(0.5 * s, 0.4 * s, 0.1 * s, green, 0, 0.55 * s, -0.42 * s); // face plate
  head.add(box(0.1 * s, 0.14 * s, 0.02, dark, -0.12 * s, 0.02, -0.06 * s));
  head.add(box(0.1 * s, 0.14 * s, 0.02, dark, 0.12 * s, 0.02, -0.06 * s));
  g.add(head);
  return { legs: [], head };
}

// Models face -z (matches yaw math). Group origin at the feet.
const MODELS = {
  pig(g) {
    const c = 0xf0a2a0;
    g.add(box(0.65, 0.45, 1.0, c, 0, 0.5, 0.05));
    const head = box(0.45, 0.42, 0.4, c, 0, 0.62, -0.62);
    eyes(head, 0.22, -0.21);
    head.add(box(0.18, 0.14, 0.06, 0xd9827e, 0, -0.08, -0.22));
    g.add(head);
    g.add(box(0.07, 0.07, 0.18, 0xd9827e, 0, 0.58, 0.6)); // curly tail nub
    const legs = [
      leg(0.16, 0.3, c, -0.2, 0.3, -0.3), leg(0.16, 0.3, c, 0.2, 0.3, -0.3),
      leg(0.16, 0.3, c, -0.2, 0.3, 0.35), leg(0.16, 0.3, c, 0.2, 0.3, 0.35),
    ];
    legs.forEach(l => g.add(l));
    return { legs, head };
  },
  sheep(g) {
    const wool = 0xe8e8e8, skin = 0xd9c2a7;
    g.add(box(0.75, 0.55, 1.1, wool, 0, 0.72, 0.05));
    const head = box(0.32, 0.32, 0.35, skin, 0, 0.95, -0.68);
    eyes(head, 0.16, -0.18);
    head.add(box(0.36, 0.12, 0.38, wool, 0, 0.2, 0)); // wool cap
    g.add(head);
    const legs = [
      leg(0.14, 0.45, skin, -0.2, 0.45, -0.32), leg(0.14, 0.45, skin, 0.2, 0.45, -0.32),
      leg(0.14, 0.45, skin, -0.2, 0.45, 0.38), leg(0.14, 0.45, skin, 0.2, 0.45, 0.38),
    ];
    legs.forEach(l => g.add(l));
    return { legs, head };
  },
  cow(g) {
    const body = 0x5d3f28, face = 0xcfc5b8;
    g.add(box(0.75, 0.55, 1.15, body, 0, 0.85, 0.05));
    const head = box(0.4, 0.38, 0.35, body, 0, 1.08, -0.72);
    eyes(head, 0.2, -0.18);
    head.add(box(0.26, 0.16, 0.05, face, 0, -0.12, -0.19));
    head.add(box(0.07, 0.1, 0.07, 0xd8d0c0, -0.17, 0.22, 0)); // horns
    head.add(box(0.07, 0.1, 0.07, 0xd8d0c0, 0.17, 0.22, 0));
    g.add(head);
    const legs = [
      leg(0.16, 0.58, body, -0.22, 0.58, -0.35), leg(0.16, 0.58, body, 0.22, 0.58, -0.35),
      leg(0.16, 0.58, body, -0.22, 0.58, 0.4), leg(0.16, 0.58, body, 0.22, 0.58, 0.4),
    ];
    legs.forEach(l => g.add(l));
    return { legs, head };
  },
  enderman(g) {
    const dark = 0x15151a;
    const legs = [
      leg(0.16, 1.35, dark, -0.12, 1.35, 0), leg(0.16, 1.35, dark, 0.12, 1.35, 0),
    ];
    legs.forEach(l => g.add(l));
    g.add(box(0.5, 0.85, 0.28, dark, 0, 1.78, 0));
    g.add(box(0.12, 1.15, 0.12, dark, -0.33, 1.6, 0));
    g.add(box(0.12, 1.15, 0.12, dark, 0.33, 1.6, 0));
    const head = box(0.42, 0.42, 0.42, dark, 0, 2.45, 0);
    head.add(box(0.32, 0.07, 0.02, 0xdd66ff, 0, 0.02, -0.215)); // glowing eyes
    g.add(head);
    return { legs, head };
  },
  blaze(g) {
    const gold = 0xe8a428, dark = 0xb87818;
    const head = box(0.45, 0.45, 0.45, gold, 0, 1.25, 0);
    eyes(head, 0.22, -0.23, 0x2a1400);
    g.add(head);
    const rods = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      rods.add(box(0.12, 0.55, 0.12, dark, Math.cos(a) * 0.35, 0.6, Math.sin(a) * 0.35));
    }
    g.add(rods);
    return { legs: [], head, rods };
  },
  spider(g) {
    const c = 0x2f2823, dark = 0x201a16;
    const head = box(0.5, 0.4, 0.45, c, 0, 0.45, -0.55);
    // two rows of glowing red eyes
    head.add(box(0.08, 0.08, 0.02, 0xd83030, -0.15, 0.02, -0.235));
    head.add(box(0.08, 0.08, 0.02, 0xd83030, 0.15, 0.02, -0.235));
    head.add(box(0.06, 0.06, 0.02, 0x8a1616, -0.05, 0.1, -0.235));
    head.add(box(0.06, 0.06, 0.02, 0x8a1616, 0.05, 0.1, -0.235));
    g.add(head);
    g.add(box(0.55, 0.4, 0.5, c, 0, 0.45, -0.1));    // thorax
    g.add(box(0.75, 0.5, 0.95, dark, 0, 0.5, 0.55)); // abdomen
    const legs = [];
    for (let i = 0; i < 4; i++) {
      const z = -0.35 + i * 0.22;
      const l = leg(0.09, 0.5, dark, -0.3, 0.5, z);
      const r = leg(0.09, 0.5, dark, 0.3, 0.5, z);
      l.rotation.z = 0.5;  // splay outward
      r.rotation.z = -0.5;
      // interleave so adjacent legs swing in opposite phases
      if (i % 2) legs.push(r, l); else legs.push(l, r);
    }
    legs.forEach(l => g.add(l));
    return { legs, head };
  },
  chicken(g) {
    const white = 0xf2f2f2, beak = 0xe8a428, comb = 0xd83a2e;
    g.add(box(0.4, 0.35, 0.5, white, 0, 0.32, 0.05)); // body
    const head = box(0.28, 0.28, 0.28, white, 0, 0.58, -0.22);
    eyes(head, 0.14, -0.15);
    head.add(box(0.12, 0.1, 0.1, beak, 0, -0.04, -0.18)); // beak
    head.add(box(0.08, 0.1, 0.12, comb, 0, 0.18, 0)); // comb
    g.add(head);
    const tail = box(0.2, 0.24, 0.07, white, 0, 0.52, 0.32); // tail feathers
    tail.rotation.x = -0.6;
    g.add(tail);
    g.add(box(0.08, 0.2, 0.3, white, -0.24, 0.32, 0.05)); // wings
    g.add(box(0.08, 0.2, 0.3, white, 0.24, 0.32, 0.05));
    const legs = [leg(0.06, 0.16, beak, -0.1, 0.16, 0), leg(0.06, 0.16, beak, 0.1, 0.16, 0)];
    legs.forEach(l => g.add(l));
    return { legs, head };
  },
  skeleton(g) {
    const bone = 0xcfcfcf, dark = 0x8a8a8a;
    const legs = [
      leg(0.14, 0.7, bone, -0.12, 0.7, 0), leg(0.14, 0.7, bone, 0.12, 0.7, 0),
    ];
    legs.forEach(l => g.add(l));
    g.add(box(0.44, 0.55, 0.24, bone, 0, 1.0, 0)); // ribs
    g.add(box(0.12, 0.5, 0.12, bone, -0.3, 1.05, -0.1)); // arm holding the bow
    g.add(box(0.12, 0.5, 0.12, bone, 0.3, 1.0, 0));
    g.add(box(0.06, 0.55, 0.06, dark, -0.3, 1.05, -0.45)); // bow
    const head = box(0.4, 0.4, 0.4, bone, 0, 1.5, 0);
    head.add(box(0.09, 0.11, 0.02, 0x1a1a1a, -0.1, 0.02, -0.21));
    head.add(box(0.09, 0.11, 0.02, 0x1a1a1a, 0.1, 0.02, -0.21));
    g.add(head);
    return { legs, head };
  },
  slime(g) {
    return slimeModel(g, 1);
  },
  slime_small(g) {
    return slimeModel(g, 0.5);
  },
  creeper(g) {
    const green = 0x4aa84a, dark = 0x2f7a3f, face = 0x1a3a1a;
    const legs = [
      leg(0.22, 0.4, dark, -0.28, 0.4, -0.28), leg(0.22, 0.4, dark, 0.28, 0.4, -0.28),
      leg(0.22, 0.4, dark, -0.28, 0.4, 0.28), leg(0.22, 0.4, dark, 0.28, 0.4, 0.28),
    ];
    legs.forEach(l => g.add(l));
    g.add(box(0.65, 0.85, 0.4, green, 0, 1.02, 0));
    const head = box(0.5, 0.5, 0.5, green, 0, 1.65, 0);
    head.add(box(0.1, 0.1, 0.02, face, -0.12, 0.08, -0.26));
    head.add(box(0.1, 0.1, 0.02, face, 0.12, 0.08, -0.26));
    head.add(box(0.08, 0.1, 0.02, face, 0, -0.05, -0.26));
    head.add(box(0.08, 0.16, 0.02, face, -0.08, -0.14, -0.26));
    head.add(box(0.08, 0.16, 0.02, face, 0.08, -0.14, -0.26));
    g.add(head);
    return { legs, head };
  },
  zombie(g) {
    const skin = 0x5da357, shirt = 0x2f7ba6, pants = 0x35506e;
    const legs = [
      leg(0.2, 0.75, pants, -0.13, 0.75, 0), leg(0.2, 0.75, pants, 0.13, 0.75, 0),
    ];
    legs.forEach(l => g.add(l));
    g.add(box(0.5, 0.6, 0.26, shirt, 0, 1.05, 0));
    // arms stretched forward
    g.add(box(0.16, 0.16, 0.65, skin, -0.33, 1.28, -0.3));
    g.add(box(0.16, 0.16, 0.65, skin, 0.33, 1.28, -0.3));
    const head = box(0.45, 0.45, 0.45, skin, 0, 1.6, 0);
    eyes(head, 0.22, -0.23, 0x330000);
    g.add(head);
    return { legs, head };
  },
};

let nextId = 1;

export class Mob {
  constructor(type, x, y, z) {
    const t = TYPES[type];
    this.id = nextId++;
    this.type = type;
    this.hostile = type === 'zombie' || type === 'blaze' || type === 'enderman' || type === 'spider' || type === 'creeper' ||
      type === 'skeleton' || type === 'slime' || type === 'slime_small';
    this.flying = type === 'blaze';
    this.shootCd = 2 + Math.random() * 2;
    this.fuseT = 0;
    this.hissed = false;
    this.hp = t.hp;
    this.speed = t.speed;
    this.half = t.half;
    this.height = t.height;
    this.color = t.color;
    this.pos = { x, y, z };
    this.vel = { x: 0, y: 0, z: 0 };
    this.yaw = Math.random() * Math.PI * 2;
    this.targetYaw = this.yaw;
    this.moveT = 0;      // >0 while walking
    this.idleT = Math.random() * 2;
    this.walkPhase = 0;
    this.jumpCd = 0;
    this.attackCd = 0;
    this.eggT = 25 + Math.random() * 35; // chickens lay eggs
    this.hopT = Math.random() * 0.5;     // slime hop rhythm
    this.flashT = 0;
    this.dead = false;

    this.group = new THREE.Group();
    this.parts = MODELS[type](this.group);
    this.group.position.set(x, y, z);
    // per-mob materials so hurt-flash doesn't affect the whole species
    this.mats = [];
    this.group.traverse(o => {
      if (o.isMesh) {
        o.material = o.material.clone();
        this.mats.push({ m: o.material, c: o.material.color.getHex() });
      }
    });
  }

  update(dt, ctx) {
    const { world, player, daylight, time } = ctx;
    if (!world.hasDataAt(this.pos.x, this.pos.z)) return; // chunk unloaded: freeze

    this.jumpCd -= dt;
    this.attackCd -= dt;

    // --- AI ---
    let wantSpeed = 0;
    if (this.flying) {
      // blaze: hover near the player, lob fireballs
      const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      this.shootCd -= dt;
      if (!player.dead && !player.creative && dist < 24) {
        this.targetYaw = Math.atan2(-dx, -dz);
        if (dist > 9) wantSpeed = this.speed;
        else if (dist < 5) wantSpeed = -this.speed * 0.5;
        if (this.shootCd <= 0 && dist < 16) {
          this.shootCd = 2.5 + Math.random() * 1.5;
          if (ctx.shoot) ctx.shoot(this);
        }
        if (dist < 1.4 && this.attackCd <= 0) {
          this.attackCd = 1.2;
          player.damage(2, time, 'fire');
          player.burnT = Math.max(player.burnT, 1.5);
          if (ctx.sfx) ctx.sfx.hurt();
        }
      } else {
        wantSpeed = this.wander(dt) * 0.5;
      }
    } else if (this.hostile) {
      const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      const spider = this.type === 'spider';
      const creeper = this.type === 'creeper';
      const skeleton = this.type === 'skeleton';
      const slime = this.type === 'slime' || this.type === 'slime_small';
      // burn in daylight (spiders don't burn — they just turn docile; creepers never burn)
      if (daylight > 0.5 && !spider && !creeper && !slime) {
        this.burnT += dt;
        if (this.burnT > 0.4) {
          this.hp -= 3 * dt;
          this.flashT = 0.1;
          if (this.hp <= 0) this.dead = true;
        }
      }
      // spiders are neutral in daylight unless already hurt
      const docile = spider && daylight > 0.5 && this.hp >= TYPES.spider.hp;
      if (!player.dead && !player.creative && !docile && dist < 24) {
        this.targetYaw = Math.atan2(-dx, -dz);
        if (creeper) {
          const igniteRange = 3;
          if (dist < igniteRange) {
            wantSpeed = 0;
            this.fuseT += dt;
          } else {
            wantSpeed = this.speed;
            this.fuseT = Math.max(0, this.fuseT - dt * 2); // backing away fizzles the fuse
          }
          if (this.fuseT > 0 && !this.hissed) {
            this.hissed = true;
            if (ctx.sfx) ctx.sfx.fuse();
          } else if (this.fuseT <= 0) {
            this.hissed = false;
          }
          if (this.fuseT >= 1.5) {
            this.dead = true;
            if (ctx.explode) {
              ctx.explode(Math.floor(this.pos.x), Math.floor(this.pos.y), Math.floor(this.pos.z), 3.2);
            }
          }
        } else if (slime) {
          // slimes bounce toward the player in hops
          this.hopT -= dt;
          if (this.hopT <= 0) {
            this.hopT = 0.5 + Math.random() * 0.5;
            this.vel.y = this.type === 'slime' ? 8.5 : 7;
            wantSpeed = this.speed;
          }
        } else if (skeleton) {
          // skeletons keep bow range and loose arrows
          this.shootCd -= dt;
          if (dist > 12) wantSpeed = this.speed;
          else if (dist < 4) wantSpeed = -this.speed * 0.6;
          if (this.shootCd <= 0 && dist < 17 && dist > 2.5 && !player.dead) {
            this.shootCd = 1.6 + Math.random() * 1.2;
            if (ctx.shootArrow) ctx.shootArrow(this);
          }
        } else {
          wantSpeed = this.speed;
          const dy = Math.abs((player.pos.y) - this.pos.y);
          if (dist < 1.6 && dy < 2 && this.attackCd <= 0) {
            this.attackCd = 1.1;
            player.damage(TYPES[this.type].dmg || 3, time, 'attack');
            // knock the player back
            const kx = dx / (dist || 1), kz = dz / (dist || 1);
            player.vel.x += kx * 7;
            player.vel.z += kz * 7;
            player.vel.y += 3.5;
            if (ctx.sfx) ctx.sfx.hurt();
          }
        }
      } else {
        wantSpeed = this.wander(dt);
        if (creeper) this.fuseT = Math.max(0, this.fuseT - dt * 2);
      }
    } else {
      wantSpeed = this.wander(dt);
    }

    // chickens lay an egg every ~half minute
    if (this.type === 'chicken' && !this.dead) {
      this.eggT -= dt;
      if (this.eggT <= 0) {
        this.eggT = 30 + Math.random() * 30;
        if (ctx.drops) ctx.drops.spawn(I.EGG, 1, this.pos.x, this.pos.y + 0.5, this.pos.z);
        if (ctx.sfx && ctx.sfx.pop) ctx.sfx.pop();
      }
    }

    // smooth turn
    let dyaw = this.targetYaw - this.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    this.yaw += dyaw * Math.min(1, 8 * dt);

    // --- physics ---
    const inWater = isWaterAt(world, this.pos.x, this.pos.y + 0.3, this.pos.z);
    const mx = -Math.sin(this.yaw) * wantSpeed;
    const mz = -Math.cos(this.yaw) * wantSpeed;
    const blend = Math.min(1, 10 * dt);
    this.vel.x += (mx - this.vel.x) * blend;
    this.vel.z += (mz - this.vel.z) * blend;
    if (this.flying) {
      // hover: drift toward the player's eye level + a gentle bob
      const targetY = (ctx.player.pos.y + 1.5) + Math.sin(this.walkPhase + this.id) * 0.5;
      const dy = targetY - this.pos.y;
      this.vel.y += (Math.max(-2, Math.min(2, dy)) - this.vel.y) * Math.min(1, 3 * dt);
      this.walkPhase += dt * 1.5;
    } else if (inWater) {
      this.vel.y += (2.2 - this.vel.y) * Math.min(1, 3 * dt); // float up / bob
    } else {
      this.vel.y -= GRAVITY * dt;
      if (this.vel.y < -50) this.vel.y = -50;
    }
    const { onGround, hitWall } = moveEntity(world, this, dt);
    if (hitWall && onGround && !this.flying && wantSpeed > 0 && this.jumpCd <= 0) {
      this.vel.y = 7.5; // hop up 1-block steps
      this.jumpCd = 0.5;
    }
    if (this.pos.y < -20) this.dead = true;

    // mobs burn in lava (blazes are fireproof)
    if (!this.flying && isLavaAt(world, this.pos.x, this.pos.y + 0.2, this.pos.z)) {
      this.hp -= 4 * dt;
      this.flashT = 0.15;
      this.burnT = 1;
      if (this.hp <= 0) this.dead = true;
    }

    // --- animation ---
    const hspeed = Math.hypot(this.vel.x, this.vel.z);
    if (!this.flying) this.walkPhase += hspeed * dt * 3.2;
    const swing = Math.sin(this.walkPhase * Math.PI) * Math.min(1, hspeed) * 0.55;
    this.parts.legs.forEach((l, i) => { l.rotation.x = (i % 2 === 0 ? swing : -swing); });
    if (this.parts.rods) this.parts.rods.rotation.y += dt * 2.5;

    this.group.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.group.rotation.y = this.yaw;
    if (this.type === 'creeper') this.group.scale.setScalar(1 + Math.min(this.fuseT, 1.5) / 1.5 * 0.65);
    else if (this.type === 'slime' || this.type === 'slime_small') { // jelly squish
      const q = Math.abs(Math.sin(this.walkPhase * 2));
      this.group.scale.set(1 + q * 0.08, 1 - q * 0.12, 1 + q * 0.08);
    }

    // hurt/burn flash
    if (this.flashT > 0) {
      this.flashT -= dt;
      const red = this.burnT > 0.4 ? 0xff7722 : 0xff3333;
      this.mats.forEach(({ m }) => m.color.setHex(red));
      if (this.flashT <= 0) this.mats.forEach(({ m, c }) => m.color.setHex(c));
    } else if (this.type === 'creeper' && this.fuseT > 0) {
      const flash = Math.floor(this.fuseT * 12) % 2 === 0;
      this.mats.forEach(({ m, c }) => m.color.setHex(flash ? 0xffffff : c));
    } else if (this.type === 'creeper') {
      this.mats.forEach(({ m, c }) => m.color.setHex(c));
    }
  }

  wander(dt) {
    this.idleT -= dt;
    if (this.moveT > 0) {
      this.moveT -= dt;
      return this.speed * 0.8;
    }
    if (this.idleT <= 0) {
      if (Math.random() < 0.55) {
        this.targetYaw = Math.random() * Math.PI * 2;
        this.moveT = 1.5 + Math.random() * 3;
      }
      this.idleT = 1 + Math.random() * 3;
    }
    return 0;
  }

  hurt(dmg, kbX, kbZ, ctx) {
    this.hp -= dmg;
    this.flashT = 0.25;
    this.vel.x += kbX * 8;
    this.vel.z += kbZ * 8;
    this.vel.y = 5;
    if (this.hostile) this.targetYaw = Math.atan2(-(ctx.player.pos.x - this.pos.x), -(ctx.player.pos.z - this.pos.z));
    if (this.hp <= 0) { this.dead = true; return; }
    // endermen blink away when struck
    if (this.type === 'enderman' && ctx.world && Math.random() < 0.6) {
      for (let tries = 0; tries < 8; tries++) {
        const nx = Math.floor(this.pos.x + (Math.random() - 0.5) * 24);
        const nz = Math.floor(this.pos.z + (Math.random() - 0.5) * 24);
        if (!ctx.world.hasDataAt(nx, nz)) continue;
        const s = ctx.world.getSurface(nx, nz);
        if (!s || s.id === B.WATER || s.id === B.LAVA) continue;
        if (ctx.particles) ctx.particles.burst(this.pos.x, this.pos.y + 1.4, this.pos.z, [0.7, 0.25, 0.85], 14, 3);
        this.pos = { x: nx + 0.5, y: s.y + 1.02, z: nz + 0.5 };
        this.vel = { x: 0, y: 0, z: 0 };
        break;
      }
    }
  }

  dispose(scene) {
    scene.remove(this.group);
    this.group.traverse(o => {
      if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); }
    });
  }
}

const shotGeo = new THREE.BoxGeometry(0.28, 0.28, 0.28);
const shotMat = new THREE.MeshBasicMaterial({ color: 0xff8c1a });
const arrowGeo = new THREE.BoxGeometry(0.08, 0.08, 0.6);
const arrowMat = new THREE.MeshBasicMaterial({ color: 0xd8d0c0 });

export class MobManager {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.mobs = [];
    this.shots = []; // blaze fireballs
    this.spawnT = 2;
    this.passiveCap = 8;
    this.zombieCap = 6;
    this.spiderCap = 4;
    this.blazeCap = 5;
    this.creeperCap = 5;
    this.skeletonCap = 5;
    this.slimeCap = 3;
  }

  // hide/show everything when the player switches dimension
  setActive(v) {
    for (const m of this.mobs) m.group.visible = v;
    for (const s of this.shots) s.mesh.visible = v;
  }

  spawnArrow(mob, player) {
    const ox = mob.pos.x, oy = mob.pos.y + 1.5, oz = mob.pos.z;
    const tx = player.pos.x - ox, ty = (player.pos.y + 1.3) - oy, tz = player.pos.z - oz;
    const len = Math.hypot(tx, ty, tz) || 1;
    const mesh = new THREE.Mesh(arrowGeo, arrowMat);
    mesh.position.set(ox, oy, oz);
    mesh.lookAt(ox + tx, oy + ty, oz + tz);
    this.scene.add(mesh);
    this.shots.push({
      kind: 'arrow', dmg: 4,
      pos: { x: ox, y: oy, z: oz },
      vel: { x: (tx / len) * 16, y: (ty / len) * 16, z: (tz / len) * 16 },
      ttl: 3, mesh,
    });
  }

  spawnShot(mob, player) {
    const ox = mob.pos.x, oy = mob.pos.y + 1.2, oz = mob.pos.z;
    const tx = player.pos.x - ox, ty = (player.pos.y + 1.2) - oy, tz = player.pos.z - oz;
    const len = Math.hypot(tx, ty, tz) || 1;
    const mesh = new THREE.Mesh(shotGeo, shotMat);
    mesh.position.set(ox, oy, oz);
    this.scene.add(mesh);
    this.shots.push({
      pos: { x: ox, y: oy, z: oz },
      vel: { x: (tx / len) * 11, y: (ty / len) * 11, z: (tz / len) * 11 },
      ttl: 4, mesh,
    });
  }

  updateShots(dt, ctx) {
    const p = ctx.player;
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.ttl -= dt;
      s.pos.x += s.vel.x * dt; s.pos.y += s.vel.y * dt; s.pos.z += s.vel.z * dt;
      s.mesh.position.set(s.pos.x, s.pos.y, s.pos.z);
      if (s.kind !== 'arrow') { s.mesh.rotation.x += dt * 8; s.mesh.rotation.y += dt * 6; }
      const hitPlayer = !p.dead && !p.creative &&
        Math.abs(s.pos.x - p.pos.x) < 0.6 && Math.abs(s.pos.z - p.pos.z) < 0.6 &&
        s.pos.y > p.pos.y - 0.2 && s.pos.y < p.pos.y + 2.0;
      const b = ctx.world.getBlock(Math.floor(s.pos.x), Math.floor(s.pos.y), Math.floor(s.pos.z));
      const hitBlock = isSolid(b);
      if (hitPlayer) {
        const arrow = s.kind === 'arrow';
        p.damage(arrow ? (s.dmg || 4) : 4, ctx.time, arrow ? 'attack' : 'fire');
        if (!arrow) p.burnT = Math.max(p.burnT, 2);
        if (ctx.sfx) ctx.sfx.hurt();
      }
      if (s.ttl <= 0 || hitPlayer || hitBlock) {
        if (ctx.particles) ctx.particles.burst(s.pos.x, s.pos.y, s.pos.z, s.kind === 'arrow' ? [0.8, 0.8, 0.8] : [1, 0.55, 0.1], 8, 2.5);
        this.scene.remove(s.mesh);
        this.shots.splice(i, 1);
      }
    }
  }

  update(dt, ctx) {
    ctx.shoot = (mob) => { this.spawnShot(mob, ctx.player); if (ctx.sfx) ctx.sfx.fireball(); };
    ctx.shootArrow = (mob) => { this.spawnArrow(mob, ctx.player); if (ctx.sfx && ctx.sfx.bow) ctx.sfx.bow(); };
    for (const m of this.mobs) m.update(dt, ctx);
    this.updateShots(dt, ctx);

    // remove dead / distant
    const p = ctx.player.pos;
    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const m = this.mobs[i];
      const far = Math.hypot(m.pos.x - p.x, m.pos.z - p.z) > 80;
      if (m.dead || far) {
        if (m.dead && m.type === 'slime') { // big slimes split into two small ones
          for (let k = 0; k < 2; k++) {
            const baby = this.forceSpawn('slime_small', m.pos.x + (Math.random() - 0.5), m.pos.y + 0.5, m.pos.z + (Math.random() - 0.5));
            baby.vel.y = 6;
          }
        }
        if (m.dead && ctx.particles) {
          const c = new THREE.Color(m.color);
          ctx.particles.burst(m.pos.x, m.pos.y + m.height / 2, m.pos.z, [c.r, c.g, c.b], 16, 3);
          if (ctx.sfx) ctx.sfx.pop();
          if (ctx.drops) {
            for (const [id, min, max] of DROP_TABLE[m.type] || []) {
              const n = min + Math.floor(Math.random() * (max - min + 1));
              if (n > 0) ctx.drops.spawn(id, n, m.pos.x, m.pos.y + 0.4, m.pos.z);
            }
          }
        }
        m.dispose(this.scene);
        this.mobs.splice(i, 1);
      }
    }

    // spawn attempts
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 2;
      this.trySpawn(ctx);
    }
  }

  trySpawn(ctx) {
    const { player, daylight } = ctx;

    const ang = Math.random() * Math.PI * 2;
    const dist = 24 + Math.random() * 24;
    const x = Math.floor(player.pos.x + Math.cos(ang) * dist);
    const z = Math.floor(player.pos.z + Math.sin(ang) * dist);
    if (!this.world.hasDataAt(x, z)) return;

    // the nether spawns blazes in mid-air pockets
    if (this.world.dim === 'nether') {
      const blazes = this.mobs.filter(m => m.type === 'blaze').length;
      if (blazes >= this.blazeCap) return;
      for (let y = 30; y < 52; y++) {
        if (this.world.getBlock(x, y, z) === B.AIR && this.world.getBlock(x, y + 1, z) === B.AIR) {
          const mob = new Mob('blaze', x + 0.5, y + 0.01, z + 0.5);
          this.mobs.push(mob);
          this.scene.add(mob.group);
          return;
        }
      }
      return;
    }

    // the End: endermen roam the island
    if (this.world.dim === 'end') {
      if (this.mobs.filter(m => m.type === 'enderman').length >= 4) return;
      const surf = this.world.getSurface(x, z);
      if (!surf || surf.id !== B.END_STONE) return;
      const mob = new Mob('enderman', x + 0.5, surf.y + 1.01, z + 0.5);
      this.mobs.push(mob);
      this.scene.add(mob.group);
      return;
    }

    const night = daylight < 0.25;
    const passives = this.mobs.filter(m => !m.hostile).length;
    const zombies = this.mobs.filter(m => m.type === 'zombie').length;
    const spiders = this.mobs.filter(m => m.type === 'spider').length;
    const endermen = this.mobs.filter(m => m.type === 'enderman').length;
    const creepers = this.mobs.filter(m => m.type === 'creeper').length;
    const skeletons = this.mobs.filter(m => m.type === 'skeleton').length;
    const slimes = this.mobs.filter(m => m.type === 'slime').length;

    let type = null;
    if (night && Math.random() < 0.75) {
      if (endermen < 2 && Math.random() < 0.22) type = 'enderman';
      else if (skeletons < this.skeletonCap && Math.random() < 0.3) type = 'skeleton';
      else if (slimes < this.slimeCap && Math.random() < 0.2) type = 'slime';
      else if (spiders < this.spiderCap && Math.random() < 0.35) type = 'spider';
      else if (creepers < this.creeperCap && Math.random() < 0.35) type = 'creeper';
      else if (zombies < this.zombieCap) type = 'zombie';
    } else if (passives < this.passiveCap) {
      type = ['pig', 'sheep', 'cow', 'chicken'][(Math.random() * 4) | 0];
    }
    if (!type) return;

    const surf = this.world.getSurface(x, z);
    if (!surf || surf.id === B.WATER || surf.id === B.LEAVES) return;
    if (surf.y >= 70) return;
    // passive animals prefer grass
    if (!TYPES[type]) return;
    if (['pig', 'sheep', 'cow', 'chicken'].includes(type) && surf.id !== B.GRASS && surf.id !== B.SAND && surf.id !== B.SNOW) return;

    const mob = new Mob(type, x + 0.5, surf.y + 1.01, z + 0.5);
    this.mobs.push(mob);
    this.scene.add(mob.group);
  }

  // Ray vs all mob AABBs; returns {mob, t} or null.
  raycast(ox, oy, oz, dx, dy, dz, maxT) {
    let best = null;
    for (const m of this.mobs) {
      const t = rayVsEntity(ox, oy, oz, dx, dy, dz, m, maxT);
      if (t !== null && (!best || t < best.t)) best = { mob: m, t };
    }
    return best;
  }

  anyOverlapping(bx, by, bz) {
    for (const m of this.mobs) {
      if (bx + 1 > m.pos.x - m.half && bx < m.pos.x + m.half &&
        by + 1 > m.pos.y && by < m.pos.y + m.height &&
        bz + 1 > m.pos.z - m.half && bz < m.pos.z + m.half) return true;
    }
    return false;
  }

  // For debugging / testing from the console.
  forceSpawn(type, x, y, z) {
    const mob = new Mob(type, x, y, z);
    this.mobs.push(mob);
    this.scene.add(mob.group);
    return mob;
  }
}

// ---------------------------------------------------------------------------
// The Ender Dragon: a boss that circles the End's pillars and swoops at you.

export class Dragon {
  constructor(scene) {
    this.scene = scene;
    this.hp = 200;
    this.maxHp = 200;
    this.pos = { x: 0, y: 50, z: -26 };
    this.vel = { x: 0, y: 0, z: 0 };
    this.yaw = 0;
    this.state = 'circle';
    this.angle = 0;
    this.swoopT = 14; // grace period after arriving
    this.attackCd = 0;
    this.flashT = 0;
    this.flapT = 0;
    this.dead = false;
    this.onDeath = null;

    const g = this.group = new THREE.Group();
    const dark = 0x16121c, grey = 0x2a2433;
    this.parts = {};
    g.add(box(1.4, 1.1, 3.2, dark, 0, 0, 0)); // body
    const head = box(0.9, 0.8, 1.3, dark, 0, 0.25, -2.2);
    head.add(box(0.55, 0.35, 0.7, grey, 0, -0.2, -0.8)); // snout
    head.add(box(0.16, 0.1, 0.04, 0xdd66ff, -0.28, 0.12, -0.66));
    head.add(box(0.16, 0.1, 0.04, 0xdd66ff, 0.28, 0.12, -0.66));
    g.add(head);
    const wingL = new THREE.Group();
    wingL.position.set(-0.7, 0.4, -0.2);
    wingL.add(box(3.4, 0.12, 2.2, grey, -1.7, 0, 0));
    g.add(wingL);
    const wingR = new THREE.Group();
    wingR.position.set(0.7, 0.4, -0.2);
    wingR.add(box(3.4, 0.12, 2.2, grey, 1.7, 0, 0));
    g.add(wingR);
    let tz = 1.8;
    for (const s of [0.7, 0.55, 0.4]) {
      g.add(box(s, s, 1.1, dark, 0, 0.1, tz));
      tz += 1.0;
    }
    this.parts = { head, wingL, wingR };
    this.mats = [];
    g.traverse(o => {
      if (o.isMesh) {
        o.material = o.material.clone();
        this.mats.push({ m: o.material, c: o.material.color.getHex() });
      }
    });
    g.position.set(this.pos.x, this.pos.y, this.pos.z);
    scene.add(g);
  }

  update(dt, ctx) {
    if (this.dead) return;
    const p = ctx.player;
    this.attackCd -= dt;

    let target;
    if (this.state === 'circle') {
      this.angle += dt * 0.28;
      target = {
        x: Math.cos(this.angle) * 26,
        y: 47 + Math.sin(this.angle * 2.3) * 4,
        z: Math.sin(this.angle) * 26,
      };
      this.swoopT -= dt;
      // only hunt players who are over the island proper — the rim platform is safe
      const overIsland = Math.hypot(p.pos.x, p.pos.z) < 44;
      if (this.swoopT <= 0 && !p.dead && overIsland) {
        this.state = 'swoop';
        this.swoopTarget = { x: p.pos.x, y: p.pos.y + 1, z: p.pos.z };
      }
    } else {
      target = this.swoopTarget;
      const d = Math.hypot(target.x - this.pos.x, target.y - this.pos.y, target.z - this.pos.z);
      if (d < 3 || p.dead) {
        this.state = 'circle';
        this.swoopT = 6 + Math.random() * 6;
      }
    }

    const speed = this.state === 'swoop' ? 15 : 9;
    const dx = target.x - this.pos.x, dy = target.y - this.pos.y, dz = target.z - this.pos.z;
    const dl = Math.hypot(dx, dy, dz) || 1;
    const blend = Math.min(1, 2.2 * dt);
    this.vel.x += ((dx / dl) * speed - this.vel.x) * blend;
    this.vel.y += ((dy / dl) * speed - this.vel.y) * blend;
    this.vel.z += ((dz / dl) * speed - this.vel.z) * blend;
    this.pos.x += this.vel.x * dt;
    this.pos.y = Math.max(34, this.pos.y + this.vel.y * dt);
    this.pos.z += this.vel.z * dt;

    // wing-clip damage
    const pd = Math.hypot(p.pos.x - this.pos.x, (p.pos.y + 0.9) - this.pos.y, p.pos.z - this.pos.z);
    if (!p.dead && !p.creative && pd < 2.8 && this.attackCd <= 0) {
      this.attackCd = 1.5;
      p.damage(6, ctx.time, 'attack');
      const kx = (p.pos.x - this.pos.x) / (pd || 1), kz = (p.pos.z - this.pos.z) / (pd || 1);
      p.vel.x += kx * 14; p.vel.z += kz * 14; p.vel.y += 8;
      if (ctx.sfx) ctx.sfx.hurt();
    }

    // orient along velocity, flap wings
    this.yaw = Math.atan2(-this.vel.x, -this.vel.z);
    this.flapT += dt * (this.state === 'swoop' ? 9 : 5);
    const flap = Math.sin(this.flapT) * 0.55;
    this.parts.wingL.rotation.z = -flap;
    this.parts.wingR.rotation.z = flap;
    this.group.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.group.rotation.y = this.yaw;

    if (this.flashT > 0) {
      this.flashT -= dt;
      this.mats.forEach(({ m }) => m.color.setHex(0xff3333));
      if (this.flashT <= 0) this.mats.forEach(({ m, c }) => m.color.setHex(c));
    }
  }

  // generous hitbox for punches/swords
  rayHit(ox, oy, oz, dx, dy, dz, maxT) {
    return rayVsEntity(ox, oy, oz, dx, dy, dz,
      { pos: { x: this.pos.x, y: this.pos.y - 1.3, z: this.pos.z }, half: 2.0, height: 2.6 }, maxT);
  }

  hurt(dmg, ctx) {
    if (this.dead) return;
    this.hp -= dmg;
    this.flashT = 0.25;
    if (ctx && ctx.particles) ctx.particles.burst(this.pos.x, this.pos.y, this.pos.z, [0.7, 0.25, 0.85], 8, 3);
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      if (this.onDeath) this.onDeath();
    }
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  }
}
