// Steve-style player character model: used by the third-person camera
// and by the inventory preview (with armor overlays).

import * as THREE from 'three';

const SKIN = 0xc8966c;
const SHIRT = 0x2fa3a0;
const SHIRT_D = 0x25847f;
const PANTS = 0x3b5bd6;
const HAIR = 0x3d2812;
const EYE = 0x20205c;

export const ARMOR_COLORS_3D = { iron: 0xdcdcdc, diamond: 0x4adfd9, gold: 0xf2cf5a };

function box(w, h, d, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color })
  );
  m.position.set(x, y, z);
  return m;
}

// Group origin at the feet; faces -z (same convention as mobs).
// Total height 1.8, like the player hitbox.
export function buildPlayerModel() {
  const group = new THREE.Group();

  // legs (hip pivots at y=0.75)
  function makeLeg(x) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.75, 0);
    pivot.add(box(0.22, 0.75, 0.22, PANTS, 0, -0.375, 0));
    const over = box(0.24, 0.7, 0.24, 0xdcdcdc, 0, -0.4, 0);
    over.visible = false;
    const boot = box(0.23, 0.22, 0.25, 0xdcdcdc, 0, -0.64, 0.01);
    boot.visible = false;
    pivot.add(box(0.23, 0.06, 0.25, 0x2b2b2b, 0, -0.73, 0.01)); // sole
    pivot.add(over, boot);
    return { pivot, over, boot };
  }
  const LL = makeLeg(-0.12), LR = makeLeg(0.12);
  group.add(LL.pivot, LR.pivot);

  // upper body (shifts down + leans when sneaking)
  const upper = new THREE.Group();
  group.add(upper);
  upper.add(box(0.5, 0.6, 0.28, SHIRT, 0, 1.05, 0));
  upper.add(box(0.54, 0.12, 0.32, SHIRT_D, 0, 1.32, 0)); // collar
  upper.add(box(0.52, 0.08, 0.3, 0x5a3a1e, 0, 0.78, 0)); // belt
  const chest = box(0.54, 0.62, 0.32, 0xdcdcdc, 0, 1.05, 0);
  chest.visible = false;
  upper.add(chest);

  function makeArm(x) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 1.3, 0);
    pivot.add(box(0.18, 0.6, 0.18, SKIN, 0, -0.28, 0));
    pivot.add(box(0.2, 0.24, 0.2, SHIRT_D, 0, -0.1, 0)); // sleeve
    pivot.add(box(0.19, 0.07, 0.19, SHIRT_D, 0, -0.5, 0)); // cuff
    pivot.add(box(0.17, 0.1, 0.17, 0xb5825c, 0, -0.6, 0)); // hand
    return pivot;
  }
  const armL = makeArm(-0.35), armR = makeArm(0.35);
  upper.add(armL, armR);

  // head
  const head = new THREE.Group();
  head.position.set(0, 1.6, 0);
  head.add(box(0.5, 0.5, 0.5, SKIN));
  head.add(box(0.52, 0.16, 0.52, HAIR, 0, 0.18, 0.01)); // hair top
  head.add(box(0.52, 0.3, 0.1, HAIR, 0, 0.05, 0.22));   // hair back
  head.add(box(0.09, 0.09, 0.02, EYE, -0.11, 0.02, -0.255));
  head.add(box(0.09, 0.09, 0.02, EYE, 0.11, 0.02, -0.255));
  head.add(box(0.12, 0.03, 0.02, 0x8a5f43, 0, -0.12, -0.255)); // mouth
  head.add(box(0.52, 0.12, 0.06, HAIR, 0, 0.22, -0.24)); // fringe
  head.add(box(0.03, 0.03, 0.01, 0xffffff, -0.13, 0.045, -0.267)); // eye shine
  head.add(box(0.03, 0.03, 0.01, 0xffffff, 0.09, 0.045, -0.267));
  const helm = box(0.56, 0.36, 0.56, 0xdcdcdc, 0, 0.09, 0);
  helm.visible = false;
  head.add(helm);
  upper.add(head);

  return {
    group, upper, head, armL, armR, legL: LL.pivot, legR: LR.pivot,
    // mats: [head, chest, legs, feet] material keys ('iron'|'diamond'|'gold') or null
    setArmor(mats) {
      const paint = (mesh, key) => {
        mesh.visible = !!key;
        if (key) mesh.material.color.setHex(ARMOR_COLORS_3D[key] ?? 0xffffff);
      };
      paint(helm, mats[0]);
      paint(chest, mats[1]);
      paint(LL.over, mats[2]); paint(LR.over, mats[2]);
      paint(LL.boot, mats[3]); paint(LR.boot, mats[3]);
    },
    dispose() {
      group.traverse(o => { if (o.isMesh && !o.userData.sharedRes) { o.geometry.dispose(); o.material.dispose(); } });
    },
  };
}

// Animate limbs: walkPhase in radians, walkAmp 0..1, swingT matches the
// main.js swing timer, sneak lowers the upper body. opts: run 0..1 (sprint
// pump + forward lean), eat 0..1 (food-to-mouth chomps, -1 = idle),
// swim 0..1 (prone freestyle), fly (arms spread, legs trail),
// air (jump/fall flail), t (seconds, for idle breathing).
export function posePlayer(m, walkPhase, walkAmp, swingT, sneak, opts = {}) {
  const { run = 0, eat = -1, swim = 0, fly = false, air = false, t = 0 } = opts;
  m.upper.scale.set(1, 1 + Math.sin(t * 2.2) * 0.01, 1); // breathe
  if (swim > 0) {
    // prone freestyle: body horizontal, windmill arms, flutter kick
    m.upper.position.y = -0.55 * swim;
    m.upper.rotation.x = -1.35 * swim;
    const w = walkPhase * 2.2;
    m.armL.rotation.set(Math.sin(w) * 1.4, 0, -0.25);
    m.armR.rotation.set(Math.sin(w + Math.PI) * 1.4, 0, 0.25);
    m.legL.rotation.x = Math.sin(w * 1.5) * 0.5;
    m.legR.rotation.x = Math.sin(w * 1.5 + Math.PI) * 0.5;
    return;
  }
  const s = Math.sin(walkPhase) * 0.75 * walkAmp * (1 + run * 0.5);
  if (fly) {
    m.armL.rotation.set(0.2, 0, -1.15); // wings out
    m.armR.rotation.set(0.2, 0, 1.15);
    m.legL.rotation.x = 0.12; // legs trail
    m.legR.rotation.x = 0.12;
    m.upper.position.y = 0;
    m.upper.rotation.x = -0.12 * Math.min(1, walkAmp + 0.3);
  } else if (air) {
    m.armL.rotation.set(-s * 0.9, 0, -0.45); // flail a little
    m.armR.rotation.set(s * 0.9, 0, 0.45);
    m.legL.rotation.x = 0.35; // tuck
    m.legR.rotation.x = -0.25;
    m.upper.position.y = sneak ? -0.24 : 0;
    m.upper.rotation.x = sneak ? 0.3 : 0;
  } else {
    m.legL.rotation.x = s;
    m.legR.rotation.x = -s;
    m.armL.rotation.set(-s * 0.9, 0, 0);
    m.armR.rotation.set(s * 0.9, 0, 0);
    m.upper.position.y = sneak ? -0.24 : 0;
    m.upper.rotation.x = sneak ? 0.3 : -0.14 * run; // sprint lean
  }
  const sw = Math.sin(Math.min(Math.max(swingT, 0), Math.PI));
  m.armR.rotation.x -= sw * 1.5; // attack swing
  if (eat >= 0) {
    // food to the mouth with chomps (callers reset head pitch every frame)
    m.armR.rotation.set(-2.1 + Math.abs(Math.sin(eat * Math.PI * 5)) * 0.35, 0, 0.3);
    m.head.rotation.x += 0.25;
  }
}
