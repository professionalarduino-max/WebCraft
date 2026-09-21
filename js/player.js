// Minecraft Java Edition-style player physics.
// Fixed 20 ticks/second simulation with per-tick constants (velocity stored in
// blocks/second externally, converted to blocks/tick inside the tick).
// Rendering interpolates between the last two ticks.

import { moveEntity, isWaterAt, isLavaAt, collidesWithHeight } from './physics.js';
import { B, BLOCKS } from './blocks.js';

const TICK = 0.05;          // 20 ticks per second
const BPS = 1 / TICK;       // blocks/tick -> blocks/second

// per-tick constants (Java Edition)
const GRAVITY = 0.08;       // vy = (vy - 0.08) * 0.98  => terminal ~-3.92 b/t
const AIR_DRAG_Y = 0.98;
const JUMP_VEL = 0.42;      // ~1.25 block jump
const AIR_FRICTION = 0.91;
const ACCEL_GROUND = 0.1;   // => ~4.32 b/s walking on slip 0.6
const ACCEL_AIR = 0.02;     // => strong air control, ~same top speed
const SPRINT_MULT = 1.3;    // => ~5.6 b/s
const SNEAK_MULT = 0.3;     // => ~1.3 b/s
const WATER_FRICTION = 0.8;
const WATER_ACCEL = 0.022;  // => ~2.2 b/s swim
const WATER_GRAVITY = 0.02;

const EYE_STAND = 1.62;
const EYE_SNEAK = 1.27;
const EYE_SWIM = 1.0; // prone crawl: camera rides low

const HEIGHT_STAND = 1.8;
const HEIGHT_SNEAK = 1.5; // sneaking fits through 1.5-block gaps (Minecraft)

export class Player {
  constructor(world, spawn) {
    this.world = world;
    this.pos = { x: spawn.x, y: spawn.y, z: spawn.z };
    this.prevPos = { ...this.pos };
    this.spawn = { ...spawn };
    this.vel = { x: 0, y: 0, z: 0 }; // blocks/second
    this.yaw = 0;
    this.pitch = -0.1;
    this.half = 0.3;      // 0.6 wide AABB
    this.height = HEIGHT_STAND;
    this.eyeH = EYE_STAND;
    this.prevEyeH = EYE_STAND;
    this.stepHeight = 0.6;
    this.hp = 20;
    this.maxHp = 20;
    this.invulnerable = false; // spawn safe zone (set by the game each frame)
    this.gameMode = 'survival'; // 'survival' | 'creative'
    this.hunger = 20;      // 20 points = 10 drumsticks
    this.saturation = 5;
    this.exhaustion = 0;
    this.armorPoints = 0;  // set from equipped armor by main
    this.burnT = 0;        // seconds of after-burn from lava
    this.inLava = false;
    this.lavaCd = 0;
    this.fireCd = 0;
    this.regenCd = 0;
    this.starveCd = 0;
    this.air = 10;         // seconds of breath underwater
    this.drownCd = 0;
    this.lastDmg = 'generic';
    this.fly = false;
    this.sneaking = false;
    this.sprinting = false;
    this.swimming = false; // sprint-swim (Ctrl+W in water)
    this.onGround = false;
    this.inWater = false;
    this.inWeb = false;
    this.onLadder = false;
    this.eyeInWater = false;
    this.fallDist = 0;
    this.jumpDelay = 0;
    this.lastDamage = -99;
    this.lastRegen = 0;
    this.dead = false;
    this.acc = 0;          // tick accumulator
    this.renderAlpha = 1;
    this.lookFactor = 0.6 * 0.6 * 0.6 * 8 * 0.15 * Math.PI / 180; // set by prefs
    this.onDamage = null;
    this.onDeath = null;
  }

  get creative() { return this.gameMode === 'creative'; }

  // Minecraft sensitivity: f = sens*0.6+0.2; radians = delta * f^3 * 8 * 0.15deg
  look(dx, dy) {
    this.yaw -= dx * this.lookFactor;
    this.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.pitch - dy * this.lookFactor));
  }

  // interpolated eye position for rendering / raycasts
  eye() {
    const a = this.renderAlpha;
    return {
      x: this.prevPos.x + (this.pos.x - this.prevPos.x) * a,
      y: this.prevPos.y + (this.pos.y - this.prevPos.y) * a
        + this.prevEyeH + (this.eyeH - this.prevEyeH) * a,
      z: this.prevPos.z + (this.pos.z - this.prevPos.z) * a,
    };
  }

  forwardDir() {
    const cp = Math.cos(this.pitch);
    return {
      x: -Math.sin(this.yaw) * cp,
      y: Math.sin(this.pitch),
      z: -Math.cos(this.yaw) * cp,
    };
  }

  update(dt, keys, time) {
    if (this.dead) return;
    this.acc += dt;
    let ticks = 0;
    while (this.acc >= TICK && ticks < 4) {
      this.acc -= TICK;
      this.tick(keys, time);
      ticks++;
    }
    if (this.acc >= TICK) this.acc = TICK - 1e-6; // drop ticks under heavy lag
    this.renderAlpha = this.acc / TICK;
  }

  slipUnder() {
    const b = this.world.getBlock(
      Math.floor(this.pos.x), Math.floor(this.pos.y - 0.2), Math.floor(this.pos.z));
    return (BLOCKS[b] && BLOCKS[b].slip) || 0.6;
  }

  // is there ground under the AABB if it were at (px, pz), within stepHeight below?
  hasFooting(px, pz) {
    const x0 = Math.floor(px - this.half), x1 = Math.floor(px + this.half);
    const z0 = Math.floor(pz - this.half), z1 = Math.floor(pz + this.half);
    const y0 = Math.floor(this.pos.y - this.stepHeight), y1 = Math.floor(this.pos.y - 0.001);
    for (let by = y0; by <= y1; by++)
      for (let bz = z0; bz <= z1; bz++)
        for (let bx = x0; bx <= x1; bx++) {
          const blk = BLOCKS[this.world.getBlock(bx, by, bz)];
          if (blk && blk.solid) return true;
        }
    return false;
  }

  canStand() {
    return !collidesWithHeight(this.world, this, HEIGHT_STAND);
  }

  tick(keys, time) {
    if (!this.world.hasDataAt(this.pos.x, this.pos.z)) {
      this.prevPos = { ...this.pos };
      this.prevEyeH = this.eyeH;
      return;
    }
    this.prevPos = { ...this.pos };
    this.prevEyeH = this.eyeH;
    if (this.jumpDelay > 0) this.jumpDelay--;

    this.inWater = isWaterAt(this.world, this.pos.x, this.pos.y + 0.4, this.pos.z)
      || isWaterAt(this.world, this.pos.x, this.pos.y, this.pos.z);
    this.inLava = isLavaAt(this.world, this.pos.x, this.pos.y + 0.4, this.pos.z)
      || isLavaAt(this.world, this.pos.x, this.pos.y, this.pos.z);
    this.eyeInWater = isWaterAt(this.world, this.pos.x, this.pos.y + this.eyeH, this.pos.z);
    const climbAt = (yy) => {
      const blk = BLOCKS[this.world.getBlock(Math.floor(this.pos.x), Math.floor(yy), Math.floor(this.pos.z))];
      return !!(blk && blk.climb);
    };
    this.onLadder = !this.fly && (climbAt(this.pos.y + 0.05) || climbAt(this.pos.y + 1));
    const webAt = (yy) => this.world.getBlock(Math.floor(this.pos.x), Math.floor(yy), Math.floor(this.pos.z)) === B.COBWEB;
    this.inWeb = webAt(this.pos.y + 0.1) || webAt(this.pos.y + 1);

    // --- input ---
    const f = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const s = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    const jump = keys.has('Space');
    const shift = keys.has('ShiftLeft') || keys.has('ShiftRight');
    this.sneaking = shift && !this.fly;
    // sneak hitbox: 1.5 high, so you fit through 1.5-block gaps; a low
    // ceiling keeps you sneaking even after Shift is released (Minecraft)
    if (!this.sneaking && this.height < HEIGHT_STAND && !this.canStand()) this.sneaking = true;
    this.height = this.sneaking ? HEIGHT_SNEAK : HEIGHT_STAND;
    // sprint: hold Ctrl while moving forward
    const ctrl = keys.has('ControlLeft') || keys.has('ControlRight');
    this.sprinting = ctrl && f > 0 && !this.sneaking && !this.fly && !this.inWeb && this.hunger > 6;
    // sprint-swimming: Ctrl+W in deep water (prone, fast, steers with the look)
    this.swimming = this.inWater && !this.inLava && this.sprinting && !this.onGround;

    const fwdX = -Math.sin(this.yaw), fwdZ = -Math.cos(this.yaw);
    const rightX = Math.cos(this.yaw), rightZ = -Math.sin(this.yaw);
    let wx = f * fwdX + s * rightX;
    let wz = f * fwdZ + s * rightZ;
    const wlen = Math.hypot(wx, wz);
    if (wlen > 1e-6) { wx /= wlen; wz /= wlen; }

    // --- velocity in blocks/tick ---
    let vx = this.vel.x * TICK, vy = this.vel.y * TICK, vz = this.vel.z * TICK;
    const slip = this.onGround ? this.slipUnder() : 0.6;

    if (this.fly) {
      const spd = 0.5; // 10 b/s creative flight
      vx += (wx * spd - vx) * 0.5;
      vz += (wz * spd - vz) * 0.5;
      const tvy = (jump ? spd : 0) + (shift ? -spd : 0);
      vy += (tvy - vy) * 0.5;
    } else if (this.inWater || this.inLava) {
      const accel = this.inLava ? 0.012 : this.swimming ? 0.05 : WATER_ACCEL;
      vx += wx * accel;
      vz += wz * accel;
      if (this.swimming && f > 0) vy += Math.sin(this.pitch) * 0.035; // dive toward the look
      if (jump) vy += this.inLava ? 0.035 : this.swimming ? 0.07 : 0.05;
      if (this.sneaking && this.inWater) vy -= 0.045; // sneak to sink
    } else {
      const speedMult = this.sneaking ? SNEAK_MULT : this.sprinting ? SPRINT_MULT : 1;
      const accel = this.onGround
        ? ACCEL_GROUND * speedMult * Math.pow(0.6 / slip, 3)
        : ACCEL_AIR * (this.sprinting ? SPRINT_MULT : 1);
      vx += wx * accel;
      vz += wz * accel;
      if (jump && this.onGround && this.jumpDelay === 0) {
        vy = JUMP_VEL;
        this.jumpDelay = 10;
        this.exhaustion += this.sprinting ? 0.2 : 0.05;
        if (this.sprinting && f > 0) { vx += fwdX * 0.2; vz += fwdZ * 0.2; } // sprint-jump boost
      }
    }

    // --- sneak edge guard: don't walk off edges while sneaking ---
    if (this.sneaking && this.onGround && !this.fly && !this.inWater) {
      let cx = vx, cz = vz;
      while (cx !== 0 && !this.hasFooting(this.pos.x + cx, this.pos.z)) {
        cx = Math.abs(cx) <= 0.05 ? 0 : cx - Math.sign(cx) * 0.05;
      }
      while (cz !== 0 && !this.hasFooting(this.pos.x + cx, this.pos.z + cz)) {
        cz = Math.abs(cz) <= 0.05 ? 0 : cz - Math.sign(cz) * 0.05;
      }
      vx = cx; vz = cz;
    }

    // --- move (collision + 0.6 step assist) ---
    this.vel.x = vx * BPS; this.vel.y = vy * BPS; this.vel.z = vz * BPS;
    this.stepAssistGround = this.onGround && !this.fly;
    const res = moveEntity(this.world, this, TICK);
    this.onGround = res.onGround;
    vx = this.vel.x * TICK; vy = this.vel.y * TICK; vz = this.vel.z * TICK;

    // hop out of liquid at edges
    if ((this.inWater || this.inLava) && jump && res.hitWall) vy = 0.3;

    // ladders: pressing into the wall climbs (0.2/t -> ~2.35 b/s after gravity)
    if (this.onLadder && res.hitWall && !this.inWater && !this.inLava) vy = Math.max(vy, 0.2);

    // --- gravity & friction (post-move, MC order) ---
    if (this.fly) {
      // handled by the approach blend above
    } else if (this.inWater || this.inLava) {
      const fr = this.inLava ? 0.5 : WATER_FRICTION;
      vx *= fr;
      vz *= fr;
      vy = vy * fr - (this.swimming ? 0.004 : WATER_GRAVITY); // near-neutral when crawling
    } else {
      vy = (vy - GRAVITY) * AIR_DRAG_Y;
      const fr = this.onGround ? this.slipUnder() * AIR_FRICTION : AIR_FRICTION;
      vx *= fr;
      vz *= fr;
    }
    // ladders cap the slide to 3 b/s; sneaking hangs on
    if (this.onLadder && !this.fly) {
      if (vy < -0.15) vy = -0.15;
      if (this.sneaking && vy < 0) vy = 0;
    }
    // cobwebs: barely move, sink very slowly, jump to climb out
    if (this.inWeb && !this.fly) {
      vx *= 0.25; vz *= 0.25;
      vy *= 0.05;
      if (vy < -0.16) vy = -0.16;
      if (jump) vy = Math.max(vy, 0.12);
    }
    this.vel = { x: vx * BPS, y: vy * BPS, z: vz * BPS };

    // --- eye height transition (sneak) ---
    const targetEye = this.swimming ? EYE_SWIM : this.sneaking ? EYE_SNEAK : EYE_STAND;
    this.eyeH += (targetEye - this.eyeH) * 0.5;

    // --- fall damage ---
    const fell = this.prevPos.y - this.pos.y;
    if (this.fly || this.inWater || this.inLava || this.onLadder) this.fallDist = 0;
    else if (fell > 0) this.fallDist += fell;
    if (this.onGround) {
      const belowSlime = this.world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y - 0.5), Math.floor(this.pos.z)) === B.SLIME_BLOCK;
      if (belowSlime && !this.sneaking && fell > 0.12) {
        this.vel.y = Math.min(30, Math.max(6, (fell / TICK) * 0.6)); // slime bounce, no damage
      } else if (this.fallDist > 3.5 && !(belowSlime && !this.sneaking)) {
        this.damage(Math.floor(this.fallDist - 3), time, 'fall');
      }
      this.fallDist = 0;
    }

    // fell out of the world
    if (this.pos.y < -12) this.damage(100, time, 'void');

    // --- lava contact + after-burn fire ---
    this.lavaCd -= TICK; this.fireCd -= TICK;
    if (this.creative) {
      this.burnT = 0; // creative players don't catch fire
    } else if (this.inLava && !this.fly) {
      this.burnT = 3;
      if (this.lavaCd <= 0) { this.lavaCd = 0.5; this.damage(2, time, 'lava'); }
    } else if (this.inWater) {
      this.burnT = 0; // water puts the fire out
    } else if (this.burnT > 0) {
      this.burnT -= TICK;
      if (this.fireCd <= 0) { this.fireCd = 1; this.damage(1, time, 'fire'); }
    }

    // --- drowning ---
    this.drownCd -= TICK;
    if (this.eyeInWater && !this.creative) {
      this.air -= TICK;
      if (this.air <= 0) {
        this.air = 0;
        if (this.drownCd <= 0) { this.drownCd = 1; this.damage(1, time, 'drown'); }
      }
    } else {
      this.air = Math.min(10, this.air + TICK * 5);
    }

    // --- hunger (frozen at full in creative) ---
    if (this.creative) {
      this.hunger = 20;
      this.saturation = 20;
      this.exhaustion = 0;
      return;
    }
    const distMoved = Math.hypot(this.pos.x - this.prevPos.x, this.pos.z - this.prevPos.z);
    if ((this.sprinting || this.swimming) && distMoved > 0.001) this.exhaustion += 0.1 * distMoved;
    else if (this.inWater && !this.onGround && distMoved > 0.001) this.exhaustion += 0.015 * distMoved;
    while (this.exhaustion >= 4) {
      this.exhaustion -= 4;
      if (this.saturation > 0) this.saturation = Math.max(0, this.saturation - 1);
      else this.hunger = Math.max(0, this.hunger - 1);
    }
    this.regenCd -= TICK;
    this.starveCd -= TICK;
    if (this.hunger >= 18 && this.hp < this.maxHp && time - this.lastDamage > 3 && this.regenCd <= 0) {
      this.regenCd = 2;
      this.hp = Math.min(this.maxHp, this.hp + 1);
      this.exhaustion += 3; // healing costs food
    }
    if (this.hunger <= 0 && this.starveCd <= 0) {
      this.starveCd = 4;
      if (this.hp > 1) this.damage(1, time, 'starve'); // starves down to half a heart
    }
  }

  teleport(x, y, z) {
    this.pos = { x, y, z };
    this.prevPos = { ...this.pos };
    this.vel = { x: 0, y: 0, z: 0 };
    this.fallDist = 0;
  }

  // Restore hunger + saturation from food (called when eating).
  eat(foodDef) {
    if (this.hunger >= 20) return false;
    this.hunger = Math.min(20, this.hunger + foodDef.hunger);
    this.saturation = Math.min(this.hunger, this.saturation + foodDef.sat);
    if (foodDef.heal) this.hp = Math.min(this.maxHp, this.hp + foodDef.heal); // golden apple
    return true;
  }

  damage(n, time, type = 'generic', fromNet = false) {
    if (this.creative) return; // invulnerable
    if (this.dead || n <= 0) return;
    if (this.invulnerable) return; // spawn safe zone: nobody can hurt you there
    // The brief invulnerability window is a local-combat rule (mobs, fall, fire).
    // A hit confirmed by the SERVER always lands — otherwise a stuttering or
    // background tab silently ate half of the damage other players dealt.
    if (!fromNet && time - this.lastDamage < 0.5) return; // brief invulnerability
    this.lastDmg = type;
    // armor reduces combat/burn damage (4% per point, capped 80%)
    if (type === 'attack' || type === 'lava' || type === 'fire') {
      const reduction = Math.min(0.8, this.armorPoints * 0.04);
      n = Math.max(1, Math.round(n * (1 - reduction)));
    }
    this.hp -= n;
    this.lastDamage = time;
    if (this.onDamage) this.onDamage(n);
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      if (this.onDeath) this.onDeath();
    }
  }

  respawn() {
    this.pos = { ...this.spawn };
    this.prevPos = { ...this.pos };
    this.vel = { x: 0, y: 0, z: 0 };
    this.hp = this.maxHp;
    this.hunger = 20;
    this.saturation = 5;
    this.exhaustion = 0;
    this.burnT = 0;
    this.dead = false;
    this.fallDist = 0;
    this.fly = false;
    this.acc = 0;
    this.sneaking = false;
    this.height = HEIGHT_STAND;
    this.eyeH = EYE_STAND;
    this.prevEyeH = EYE_STAND;
  }
}
