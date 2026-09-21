// Seeded RNG + classic Perlin noise (2D/3D) + fBm helpers.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Deterministic hash of integer coords -> [0,1)
export function hash2(x, z, seed) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function hash3(x, y, z, seed) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 2654435761) ^ Math.imul(z | 0, 668265263) ^ Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Hot-path helpers: module-level (no per-call closure allocation, no property
// lookups) so chunk generation stays fast. The maths is exactly the same as
// before — only the bookkeeping around it is cheaper.
const fadeAt = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const lerpTo = (t, a, b) => a + t * (b - a);
function gradAt(hash, x, y, z) {
  const h = hash & 15;
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : (h === 12 || h === 14 ? x : z);
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

export class Perlin {
  constructor(seed = 0) {
    const rand = mulberry32(seed);
    const perm = new Uint8Array(256);
    for (let i = 0; i < 256; i++) perm[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = (rand() * (i + 1)) | 0;
      const t = perm[i]; perm[i] = perm[j]; perm[j] = t;
    }
    this.p = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.p[i] = perm[i & 255];
  }

  fade(t) { return fadeAt(t); }

  grad(hash, x, y, z) { return gradAt(hash, x, y, z); }

  noise3(x, y, z) {
    const p = this.p;
    const xf = Math.floor(x), yf = Math.floor(y), zf = Math.floor(z);
    const X = xf & 255, Y = yf & 255, Z = zf & 255;
    x -= xf; y -= yf; z -= zf;
    const u = fadeAt(x), v = fadeAt(y), w = fadeAt(z);
    const A = p[X] + Y, AA = p[A] + Z, AB = p[A + 1] + Z;
    const B = p[X + 1] + Y, BA = p[B] + Z, BB = p[B + 1] + Z;
    return lerpTo(w,
      lerpTo(v,
        lerpTo(u, gradAt(p[AA], x, y, z), gradAt(p[BA], x - 1, y, z)),
        lerpTo(u, gradAt(p[AB], x, y - 1, z), gradAt(p[BB], x - 1, y - 1, z))),
      lerpTo(v,
        lerpTo(u, gradAt(p[AA + 1], x, y, z - 1), gradAt(p[BA + 1], x - 1, y, z - 1)),
        lerpTo(u, gradAt(p[AB + 1], x, y - 1, z - 1), gradAt(p[BB + 1], x - 1, y - 1, z - 1))));
  }

  // noise3(x, y, 0): the z-weight is exactly 0 there, so the far half of the
  // trilinear blend cannot contribute anything and is skipped (2D terrain and
  // every fbm2 call in the world generator run through here).
  noise2(x, y) {
    const p = this.p;
    const xf = Math.floor(x), yf = Math.floor(y);
    const X = xf & 255, Y = yf & 255, Z = 0;
    x -= xf; y -= yf;
    const u = fadeAt(x), v = fadeAt(y);
    const A = p[X] + Y, AA = p[A] + Z, AB = p[A + 1] + Z;
    const B = p[X + 1] + Y, BA = p[B] + Z, BB = p[B + 1] + Z;
    return lerpTo(v,
      lerpTo(u, gradAt(p[AA], x, y, 0), gradAt(p[BA], x - 1, y, 0)),
      lerpTo(u, gradAt(p[AB], x, y - 1, 0), gradAt(p[BB], x - 1, y - 1, 0)));
  }
}

export function fbm2(noise, x, y, octaves = 4, lacunarity = 2, gain = 0.5) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise.noise2(x * freq, y * freq);
    norm += amp;
    amp *= gain; freq *= lacunarity;
  }
  return sum / norm;
}
