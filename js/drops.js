// Dropped item entities: spawned by broken blocks and slain mobs,
// bob and spin on the ground, get magneted to the player, and picked up.

import * as THREE from 'three';
import { moveEntity, isLavaAt } from './physics.js';
import { ITEMS } from './items.js';

const MAX_DROPS = 150;
const LIFETIME = 90;

export class DropManager {
  // resources: { blockGeometry(id) -> BufferGeometry, blockMaterial, itemTexture(id) -> Texture }
  constructor(scene, world, resources) {
    this.scene = scene;
    this.world = world;
    this.res = resources;
    this.list = [];
  }

  // opts.stack: spawn one entity holding all n items (Q-drops)
  // opts.throwDir: initial velocity direction (thrown from the player)
  // opts.ttl: seconds before despawn (death drops linger longer)
  // hide/show all drop meshes when the player switches dimension
  setActive(v) {
    for (const e of this.list) e.mesh.visible = v;
  }

  spawn(id, n, x, y, z, opts = {}) {
    const entities = opts.stack ? [n] : new Array(n).fill(1);
    const created = [];
    for (const count of entities) {
      if (this.list.length >= MAX_DROPS) {
        const old = this.list.shift();
        this.scene.remove(old.mesh);
      }
      const mesh = this._makeMesh(id);
      const e = {
        id, n: count,
        pos: { x: x + (Math.random() - 0.5) * 0.3, y, z: z + (Math.random() - 0.5) * 0.3 },
        vel: opts.throwDir
          ? { x: opts.throwDir.x * 4, y: opts.throwDir.y * 4 + 2, z: opts.throwDir.z * 4 }
          : { x: (Math.random() - 0.5) * 2.5, y: 2.5 + Math.random() * 1.5, z: (Math.random() - 0.5) * 2.5 },
        half: 0.12, height: 0.24,
        age: 0, ttl: opts.ttl || LIFETIME,
        dmg: opts.dmg || 0, nid: opts.nid || null, tag: opts.tag || null,
        retry: opts.throwDir ? 1.2 : 0, spin: Math.random() * Math.PI * 2,
        mesh,
      };
      mesh.position.set(e.pos.x, e.pos.y, e.pos.z);
      this.scene.add(mesh);
      this.list.push(e);
      created.push(e);
    }
    return created;
  }

  removeByNid(nid) {
    if (nid == null) return;
    const i = this.list.findIndex(e => e.nid === nid);
    if (i >= 0) this._remove(i);
  }

  _makeMesh(id) {
    const it = ITEMS[id];
    if (it && it.kind === 'block') {
      const m = new THREE.Mesh(this.res.blockGeometry(id), this.res.blockMaterial);
      m.scale.setScalar(0.25);
      return m;
    }
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(0.4, 0.4),
      new THREE.MeshBasicMaterial({ map: this.res.itemTexture(id), transparent: true, alphaTest: 0.1, side: THREE.DoubleSide })
    );
    return m;
  }

  // ctx: {player, inventory, onPickup(id)}
  update(dt, ctx) {
    const p = ctx.player;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      if (!this.world.hasDataAt(e.pos.x, e.pos.z)) continue; // unloaded: freeze (age too)
      e.age += dt;
      if (e.age > e.ttl) { this._remove(i); continue; }

      // magnet toward the player, pickup when close
      if (e.retry > 0) e.retry -= dt;
      const dx = p.pos.x - e.pos.x, dy = (p.pos.y + 0.4) - e.pos.y, dz = p.pos.z - e.pos.z;
      const dist = Math.hypot(dx, dy, dz);
      if (e.age > 0.4 && e.retry <= 0 && !p.dead) {
        if (dist < 1.1) {
          // fill partial stacks first; if the inventory is full the item stays
          const leftover = ctx.inventory.add(e.id, e.n, e.dmg || 0, e.tag || null);
          if (leftover < e.n && ctx.onPickup) ctx.onPickup(e.id);
          if (leftover === 0) {
            if (e.nid && ctx.sendGone) { try { ctx.sendGone(e.nid); } catch (_) {} }
            this._remove(i); continue;
          }
          e.n = leftover;
          e.retry = 1.5;
        } else if (dist < 2.6) {
          const pull = (26 + 18 * Math.max(0, dy / dist)) * dt / Math.max(dist, 0.4);
          e.vel.x += dx * pull; e.vel.y += dy * pull; e.vel.z += dz * pull;
        }
      }

      e.vel.y -= 18 * dt;
      if (e.vel.y < -30) e.vel.y = -30;
      const { onGround } = moveEntity(this.world, e, dt);
      if (onGround) {
        const f = 1 - Math.min(1, 8 * dt);
        e.vel.x *= f; e.vel.z *= f;
      }
      if (e.pos.y < -20) { this._remove(i); continue; }
      if (isLavaAt(this.world, e.pos.x, e.pos.y + 0.1, e.pos.z)) { this._remove(i); continue; } // burned up

      e.spin += dt * 2.2;
      e.mesh.position.set(e.pos.x, e.pos.y + 0.12 + Math.sin(e.age * 2.5) * 0.05, e.pos.z);
      e.mesh.rotation.y = e.spin;
    }
  }

  _remove(i) {
    const e = this.list[i];
    this.scene.remove(e.mesh);
    if (e.mesh.geometry.type === 'PlaneGeometry') e.mesh.geometry.dispose();
    this.list.splice(i, 1);
  }

  // persist ground items across reloads (so death drops survive a refresh)
  serialize() {
    return this.list.map(e => [
      e.id, e.n,
      +e.pos.x.toFixed(1), +e.pos.y.toFixed(1), +e.pos.z.toFixed(1),
      Math.round(e.age), e.ttl, e.dmg || 0, e.tag || null,
    ]);
  }

  load(rows) {
    for (const r of rows || []) {
      if (!Array.isArray(r) || !ITEMS[r[0]] || !(r[1] > 0)) continue;
      this.spawn(r[0], r[1], r[2], r[3], r[4], { stack: true, ttl: r[6], dmg: r[7] || 0, tag: r[8] || null });
      const e = this.list[this.list.length - 1];
      e.age = r[5] || 0;
      e.vel = { x: 0, y: 0, z: 0 };
    }
  }
}
