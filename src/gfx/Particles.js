// Toy FX. Every effect is built from three cheap layers:
//   sprites  (fxSprites.js, one draw call) cel-shaded see-through puffs, impact flashes + shock rings,
//            cartoon stars, water droplets, spark streaks, foam splats and ripples lying on the water
//   crowns   (fxCrown.js, one draw call) translucent splash sheets that rise, flare and collapse
//   debris   (instanced lit meshes) wood chips, stone chips, glass/grass shards, fluttering confetti + leaves
// Design rules (readability first): fewer, larger shapes; puffs are translucent with a crisp rim and
// dissolve instead of piling up; soft hits bloom *behind* the target so a villager's reaction stays in
// view; every hit gets a quick flash + shock ring; nothing ever smears the lens.
// Public API (unchanged): burst(name, pos, normal, { scale, color }), emit(kind, pos, n, opts),
// flash(pos, normal, scale, color), rings.spawn(pos, { size, life }), update(dt), clear().
import * as THREE from 'three';
import { P, ACCENTS } from './palette.js';
import { viewState } from './post.js';
import { SpritePool, KIND } from './fxSprites.js';
import { CrownPool } from './fxCrown.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _t = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const backOut = (x) => 1 + 2.2 * Math.pow(x - 1, 3) + 1.2 * Math.pow(x - 1, 2);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const WATER = ['#e9fbff', '#c4f0ff', '#9fe0f7'];
const STAR_COLORS = ['#fff3b0', '#ffd166', '#ffe9a8'];

/** Instanced lit debris (chips, shards, confetti, leaves). Paper and leaves flutter down. */
class MeshPool {
  constructor(scene, geometry, material, max, { flutter = false } = {}) {
    this.max = max;
    this.flutter = flutter;
    this.shrinkFrom = flutter ? 0.78 : 0.5;
    this.mesh = new THREE.InstancedMesh(geometry, material, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, _c.set('#ffffff'));
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = true;
    this.mesh.userData.noHit = true;
    this.mesh.raycast = () => {};
    scene.add(this.mesh);
    this.n = 0;
    const f = (k) => new Float32Array(max * k);
    this.pos = f(3); this.vel = f(3); this.rot = f(3); this.spin = f(3); this.col = f(3);
    this.life = f(1); this.maxLife = f(1); this.size = f(1); this.grow = f(1);
    this.grav = f(1); this.drag = f(1); this.floor = f(1);
    // flutter: sway phase, sway rate (rad/s), sway strength (m/s^2), sway direction, terminal fall speed
    this.ph = f(1); this.fq = f(1); this.amp = f(1); this.sx = f(1); this.sz = f(1); this.vt = f(1);
    this.scalars = [this.life, this.maxLife, this.size, this.grow, this.grav, this.drag, this.floor,
      this.ph, this.fq, this.amp, this.sx, this.sz, this.vt];
  }

  spawn(p) {
    if (this.n >= this.max) return;
    const i = this.n++;
    const i3 = i * 3;
    this.pos[i3] = p.x; this.pos[i3 + 1] = p.y; this.pos[i3 + 2] = p.z;
    this.vel[i3] = p.vx; this.vel[i3 + 1] = p.vy; this.vel[i3 + 2] = p.vz;
    this.rot[i3] = Math.random() * 6; this.rot[i3 + 1] = Math.random() * 6; this.rot[i3 + 2] = Math.random() * 6;
    const sp = p.spin ?? 6;
    this.spin[i3] = (Math.random() - 0.5) * sp; this.spin[i3 + 1] = (Math.random() - 0.5) * sp * 0.4; this.spin[i3 + 2] = (Math.random() - 0.5) * sp;
    this.life[i] = 0;
    this.maxLife[i] = p.life;
    this.size[i] = p.size;
    this.grow[i] = p.grow ?? 0;
    this.grav[i] = p.gravity ?? 9.8;
    this.drag[i] = p.drag ?? 0.5;
    this.floor[i] = p.floor ?? -1e9;
    _c.set(p.color);
    this.col[i3] = _c.r; this.col[i3 + 1] = _c.g; this.col[i3 + 2] = _c.b;
    if (this.flutter) {
      const a = Math.random() * 6.283;
      this.ph[i] = Math.random() * 6.283;
      this.fq[i] = rand(1.2, 2.0) * 6.2832; // 1.2-2 swings per second, ~10-20 cm side to side
      this.amp[i] = rand(10, 16);
      this.sx[i] = Math.cos(a); this.sz[i] = Math.sin(a);
      this.vt[i] = rand(0.7, 1.25);
    }
  }

  kill(i) {
    const last = --this.n;
    if (i === last) return;
    const copy = (arr, k) => {
      for (let j = 0; j < k; j++) arr[i * k + j] = arr[last * k + j];
    };
    copy(this.pos, 3); copy(this.vel, 3); copy(this.rot, 3); copy(this.spin, 3); copy(this.col, 3);
    for (const arr of this.scalars) arr[i] = arr[last];
  }

  update(dt, cam) {
    for (let i = this.n - 1; i >= 0; i--) {
      this.life[i] += dt;
      if (this.life[i] >= this.maxLife[i]) this.kill(i);
    }
    const mesh = this.mesh;
    const cx = cam ? cam.position.x : 0, cy = cam ? cam.position.y : 0, cz = cam ? cam.position.z : 0;
    for (let i = 0; i < this.n; i++) {
      const i3 = i * 3;
      const d = Math.exp(-this.drag[i] * dt);
      this.vel[i3] *= d; this.vel[i3 + 2] *= d;
      this.vel[i3 + 1] = this.vel[i3 + 1] * d - this.grav[i] * dt;
      if (this.flutter) {
        // paper physics: slow terminal fall + side-to-side sway (reads as fluttering, not raining)
        this.ph[i] += this.fq[i] * dt;
        const sw = Math.cos(this.ph[i]) * this.amp[i] * dt;
        this.vel[i3] += this.sx[i] * sw; this.vel[i3 + 2] += this.sz[i] * sw;
        const vt = -this.vt[i];
        if (this.vel[i3 + 1] < vt) this.vel[i3 + 1] += (vt - this.vel[i3 + 1]) * (1 - Math.exp(-6 * dt));
      }
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      if (this.pos[i3 + 1] < this.floor[i]) {
        this.pos[i3 + 1] = this.floor[i];
        this.vel[i3 + 1] *= -0.3;
        this.vel[i3] *= 0.6; this.vel[i3 + 2] *= 0.6;
        this.spin[i3] *= 0.5; this.spin[i3 + 2] *= 0.5;
      }
      this.rot[i3] += this.spin[i3] * dt; this.rot[i3 + 1] += this.spin[i3 + 1] * dt; this.rot[i3 + 2] += this.spin[i3 + 2] * dt;
      const k = this.life[i] / this.maxLife[i];
      // pop in with a springy overshoot, hold, shrink out (toy-like, no alpha fades)
      const pin = Math.min(1, k * 9);
      const sf = this.shrinkFrom;
      let s = this.size[i] * (1 + this.grow[i] * k) * (pin < 1 ? backOut(pin) : 1) * (k > sf ? 1 - (k - sf) / (1 - sf) : 1);
      if (cam) {
        // debris flying at the lens (bullet-cam close-ups) shrinks away instead of filling the screen
        const dx = this.pos[i3] - cx, dy = this.pos[i3 + 1] - cy, dz = this.pos[i3 + 2] - cz;
        const dc = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dc < 1.2) s *= Math.max(0, (dc - 0.3) / 0.9);
      }
      _v.set(this.pos[i3], this.pos[i3 + 1], this.pos[i3 + 2]);
      _e.set(this.rot[i3], this.rot[i3 + 1], this.rot[i3 + 2]);
      _q.setFromEuler(_e);
      s = Math.max(0.0001, s);
      _s.set(s, s, s);
      _m.compose(_v, _q, _s);
      mesh.setMatrixAt(i, _m);
      mesh.setColorAt(i, _c.setRGB(this.col[i3], this.col[i3 + 1], this.col[i3 + 2]));
    }
    mesh.count = this.n;
    mesh.visible = this.n > 0;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  clear() {
    this.n = 0;
    this.mesh.count = 0;
    this.mesh.visible = false;
  }
}

function leafGeometry() {
  // a small folded leaf: two triangles meeting along a raised midrib
  const v = [0, 0, -0.5, 0.3, 0.06, 0, 0, 0.02, 0.5, 0, 0, -0.5, 0, 0.02, 0.5, -0.3, 0.06, 0];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

// sprite kinds by emit() name ('blob' is the legacy opaque ball: routed to 'drop' when it falls, else 'puff')
const SPRITE = { puff: KIND.PUFF, star: KIND.STAR, ring: KIND.RING, flash: KIND.FLASH, drop: KIND.DROP, spark: KIND.STREAK, streak: KIND.STREAK, foam: KIND.FOAM, wring: KIND.WRING };
// maxH: largest on-screen radius as a fraction of the viewport height (bullet-cam close-ups, 4x scope at
// 25 m): flashes and stars stay crisp accents and never become white blobs over the payoff
const SPRITE_DEFAULTS = {
  [KIND.PUFF]: { alpha: 0.9, minPx: 1.5, grav: 0, stretch: 0, maxH: 0.2 },
  [KIND.STAR]: { alpha: 1, minPx: 4, grav: 1.5, hdr: 2.2, stretch: 0, maxH: 0.06 },
  [KIND.RING]: { alpha: 0.8, minPx: 4, grav: 0, stretch: 0, maxH: 0.1 },
  [KIND.FLASH]: { alpha: 1, minPx: 6, grav: 0, hdr: 2.6, stretch: 0, maxH: 0.05 },
  [KIND.DROP]: { alpha: 0.95, minPx: 1.6, grav: 9.8, stretch: 0.07 },
  [KIND.STREAK]: { alpha: 1, minPx: 1.2, grav: 14, hdr: 2.6, stretch: 0.045 },
  [KIND.FOAM]: { alpha: 0.9, minPx: 0, grav: 0, stretch: 0 },
  [KIND.WRING]: { alpha: 0.85, minPx: 0, grav: 0, stretch: 0 },
};

export class Particles {
  constructor(scene) {
    // One MeshStandard program for all debris (roughness/emissive are uniforms); shards and chips get
    // faceted looks from non-indexed geometry (per-face normals), not flatShading.
    const lit = new THREE.MeshStandardMaterial({ roughness: 0.7, emissive: '#ffffff', emissiveIntensity: 0.04, side: THREE.DoubleSide });
    lit.name = 'fx-lit';
    // paper keeps its colour on the shadow side too (confetti must stay bright while it tumbles)
    const paper = new THREE.MeshStandardMaterial({ roughness: 0.55, side: THREE.DoubleSide, emissive: '#ffffff', emissiveIntensity: 0.14 });
    paper.name = 'fx-paper';
    this.pools = {
      shard: new MeshPool(scene, new THREE.TetrahedronGeometry(1), lit, 500),
      chip: new MeshPool(scene, new THREE.BoxGeometry(1, 0.42, 0.72).toNonIndexed(), lit, 400),
      confetti: new MeshPool(scene, new THREE.PlaneGeometry(1, 0.62), paper, 700, { flutter: true }),
      leaf: new MeshPool(scene, leafGeometry(), lit, 300, { flutter: true }),
    };
    this.sprites = new SpritePool(scene, { max: 1400 });
    this.crowns = new CrownPool(scene, { max: 12 });
    // water.js-compatible ripple API, drawn by the sprite pool (no extra draw call, advances with fx time)
    this.rings = {
      spawn: (p, { size = 0.8, life = 0.9 } = {}) => this.sprite(KIND.WRING, _t.set(p.x, p.y + 0.02, p.z), { size, life, color: '#f4feff' }),
      clear: () => {},
    };
  }

  /** One sprite with sensible per-kind defaults. */
  sprite(kind, pos, o = {}) {
    const d = SPRITE_DEFAULTS[kind];
    return this.sprites.spawn({
      kind, x: pos.x, y: pos.y, z: pos.z,
      vx: o.vx ?? 0, vy: o.vy ?? 0, vz: o.vz ?? 0,
      life: o.life ?? 0.8, size: o.size ?? 0.1, grow: o.grow, gravity: o.gravity ?? d.grav, drag: o.drag,
      color: o.color ?? '#ffffff', hdr: o.hdr ?? d.hdr, alpha: o.alpha ?? d.alpha, rot: o.rot, spin: o.spin,
      stretch: o.stretch ?? d.stretch, minPx: o.minPx ?? d.minPx, maxPx: o.maxPx ?? this.maxPx(d),
      near: o.near, floor: o.floor, pin: o.pin,
    });
  }

  maxPx(d) {
    return d.maxH ? d.maxH * (viewState.height || 900) : 0;
  }

  /** Low-level: n particles of `kind` in a cone around opts.dir (legacy option names). */
  emit(kind, pos, n, o = {}) {
    // legacy 'blob': falling ones were water drops; floating ones a vapour trail (kept faint and small so
    // a bullet-cam trail never veils the impact it leads to)
    const vapour = kind === 'blob' && (o.gravity ?? 9.8) <= 2;
    if (kind === 'blob') kind = vapour ? 'puff' : 'drop';
    const pool = this.pools[kind];
    const sk = SPRITE[kind];
    if (!pool && sk === undefined) return;
    const dir = o.dir || UP;
    const colors = [].concat(o.color || '#ffffff');
    const spread = o.spread ?? 0.8;
    _q.setFromUnitVectors(UP, dir);
    for (let i = 0; i < n; i++) {
      _v.set((Math.random() - 0.5) * 2 * spread, 1, (Math.random() - 0.5) * 2 * spread).normalize().applyQuaternion(_q);
      const sp = (o.speed ?? 3) * (0.5 + Math.random() * 0.8);
      const jitter = o.jitter ?? 0.1;
      const p = {
        x: pos.x + (Math.random() - 0.5) * jitter, y: pos.y + (Math.random() - 0.5) * jitter, z: pos.z + (Math.random() - 0.5) * jitter,
        vx: _v.x * sp, vy: _v.y * sp, vz: _v.z * sp,
        life: (o.life ?? 0.8) * (0.7 + Math.random() * 0.6),
        size: (o.size ?? 0.1) * (0.6 + Math.random() * 0.8),
        grow: o.grow, gravity: o.gravity, drag: o.drag, spin: o.spin, floor: o.floor,
        color: colors[Math.floor(Math.random() * colors.length)],
      };
      if (pool) pool.spawn(p);
      else {
        const d = SPRITE_DEFAULTS[sk];
        this.sprites.spawn({
          ...p, kind: sk, gravity: o.gravity ?? d.grav, hdr: o.hdr ?? d.hdr, alpha: o.alpha ?? (vapour ? 0.4 : d.alpha),
          stretch: o.stretch ?? d.stretch, minPx: o.minPx ?? d.minPx, maxPx: vapour ? 0.06 * (viewState.height || 900) : this.maxPx(d),
          near: o.near, spin: o.spin !== undefined ? (Math.random() - 0.5) * o.spin : 0,
        });
      }
    }
  }

  /** Quick impact flash: a 4-point sparkle and a thin shock ring (reads at 100 m, gone in 0.2 s). */
  flash(pos, normal, s = 1, color = '#ffffff') {
    const n = normal || UP;
    this.sprite(KIND.FLASH, _t.copy(pos).addScaledVector(n, 0.06), { size: 0.17 * s, life: 0.11, color, pin: 0.3, near: 1 });
    this.sprite(KIND.RING, _t.copy(pos).addScaledVector(n, 0.04), { size: 0.32 * s, life: 0.2, color: '#fff8ee', alpha: 0.75, minPx: 5, near: 1 });
  }

  /** Soft cel-shaded puffs in a cone around o.dir. */
  puffs(pos, count, o = {}) {
    const dir = o.dir || UP;
    const colors = [].concat(o.color || '#f4efe6');
    const spread = o.spread ?? 1;
    _q.setFromUnitVectors(UP, dir);
    for (let i = 0; i < count; i++) {
      _v.set((Math.random() - 0.5) * 2 * spread, 1, (Math.random() - 0.5) * 2 * spread).normalize().applyQuaternion(_q);
      const sp = (o.speed ?? 1.5) * rand(0.6, 1.2);
      const r = o.radius ?? 0.05;
      _t.copy(pos).addScaledVector(_v, r);
      this.sprite(KIND.PUFF, _t, {
        vx: _v.x * sp, vy: _v.y * sp, vz: _v.z * sp,
        size: (o.size ?? 0.2) * rand(0.8, 1.2), grow: o.grow ?? 1.2, life: (o.life ?? 0.9) * rand(0.8, 1.2),
        gravity: o.gravity ?? -0.5, drag: o.drag ?? 2.6, color: pick(colors), alpha: o.alpha ?? 0.9, pin: 0.12,
        spin: rand(-0.6, 0.6),
      });
    }
  }

  /** High-level named effects. normal = surface normal (optional). opts: { scale, color }. */
  burst(name, pos, normal, opts = {}) {
    const n = normal || UP;
    const s = opts.scale ?? 1;
    const ps = Math.sqrt(s); // puff size grows slower than the burst; big bursts get more puffs instead
    const col = opts.color ? [].concat(opts.color) : null;
    switch (name) {
      case 'dust':
        this.flash(pos, n, s, '#fff8ea');
        this.puffs(pos, Math.round(3 + 2 * s), { dir: n, speed: 1.9 * s, spread: 1.3, size: 0.21 * ps, grow: 1.3, life: 0.9, color: col || ['#efe3c8', '#e2d2ae', '#f7efdc'] });
        this.emit('chip', pos, 5, { dir: n, speed: 4.5 * s, size: 0.075 * s, gravity: 12, life: 0.75, color: ['#c9ad7f', '#a88c62'] });
        break;
      case 'grass':
        this.flash(pos, n, s, '#f4ffe0');
        this.emit('shard', pos, 10, { dir: n, speed: 3.8 * s, size: 0.085 * s, gravity: 6, drag: 1.2, life: 0.95, color: [P.grass, P.grassDark, P.grassLight] });
        this.puffs(pos, 2, { dir: n, speed: 1.2 * s, size: 0.15 * s, grow: 1.4, life: 0.7, color: ['#e9e2c7'] });
        break;
      case 'wood':
        this.flash(pos, n, s, '#fff3d6');
        this.emit('chip', pos, 10, { dir: n, speed: 5.2 * s, size: 0.11 * s, gravity: 12, life: 0.95, color: [P.wood, P.woodLight, P.woodDark] });
        this.puffs(pos, 2, { dir: n, speed: 1.1 * s, size: 0.14 * s, grow: 1.5, life: 0.65, color: ['#e8dcc0'] });
        break;
      case 'metal':
        this.flash(pos, n, s * 1.1, '#fff6c8');
        this.emit('streak', pos, 14, { dir: n, speed: 7.5 * s, spread: 1.15, size: 0.035 * s, gravity: 14, drag: 1, life: 0.5, color: ['#fff3b0', '#ffd166', '#ffffff'] });
        this.puffs(pos, 1, { dir: n, speed: 0.8, size: 0.13 * s, grow: 1.6, life: 0.6, color: ['#d8dde6'] });
        break;
      case 'stone':
        this.flash(pos, n, s, '#fffaf0');
        this.emit('chip', pos, 8, { dir: n, speed: 4.8 * s, size: 0.085 * s, gravity: 12, life: 0.85, color: [P.stone, P.stoneDark, '#e7e0d4'] });
        this.puffs(pos, Math.round(3 + 2 * s), { dir: n, speed: 1.7 * s, spread: 1.2, size: 0.19 * ps, grow: 1.3, life: 0.85, color: col || ['#ece6da', '#f4efe6'] });
        break;
      case 'glass':
        this.flash(pos, n, s, '#eefaff');
        this.emit('shard', pos, 14, { dir: n, speed: 4.2 * s, size: 0.075 * s, gravity: 11, life: 0.95, color: ['#cdefff', '#9fdcf7', '#ffffff'] });
        break;
      case 'water':
      case 'splash':
        this.splash(pos, s);
        break;
      case 'soft':
        this.soft(pos, n, s, col);
        break;
      case 'leaves':
        this.emit('leaf', pos, 12, { dir: n, speed: 2.6 * s, size: 0.2 * s, gravity: 2.5, drag: 2.2, spin: 9, life: 2, color: [P.grass, P.grassDark, P.grassLight, '#b8e07a'] });
        this.puffs(pos, 1, { dir: n, speed: 0.8, size: 0.14 * s, grow: 1.4, life: 0.6, color: ['#e6f2c8'] });
        break;
      case 'pop': {
        const c = col || ACCENTS;
        this.sprite(KIND.FLASH, pos, { size: 0.14 * s, life: 0.1, color: '#fffbe8', pin: 0.3 });
        this.sprite(KIND.RING, pos, { size: 0.5 * s, life: 0.28, color: c[0], alpha: 0.85, minPx: 5 });
        this.emit('confetti', pos, 18, { dir: UP, speed: 4 * s, spread: 1.4, size: 0.13 * s, gravity: 5, drag: 2.5, spin: 14, life: 1.6, color: c });
        break;
      }
      case 'confetti':
        this.emit('confetti', pos, Math.round(60 * s), { dir: UP, speed: 7 * s, spread: 0.9, size: 0.2, gravity: 3.2, drag: 1.6, spin: 12, life: 2.8, color: col || ACCENTS });
        break;
      case 'stars':
        this.stars(pos, s, col);
        break;
      case 'smoke':
        this.puffs(pos, Math.max(1, Math.round(2 * s)), {
          dir: UP, speed: 1.1 * ps, spread: 0.25 + 0.1 * (s - 1), size: 0.4 * ps, grow: 1.9, gravity: -0.6, drag: 1.2,
          life: 2.4, color: col || ['#f2f0ee', '#e4e2e6'], alpha: 0.8, radius: 0.02,
        });
        break;
      case 'muzzle': {
        // ~1 m from the lens: a tiny quick puff pushed forward; never inside the scope view
        if (viewState.scope > 0.3) break;
        _t.copy(pos).addScaledVector(n, 0.35);
        this.sprite(KIND.FLASH, _t, { size: 0.035, life: 0.05, color: '#fff2c8', minPx: 0, near: 0.15, pin: 0.3 });
        for (let i = 0; i < 2; i++) {
          this.sprite(KIND.PUFF, _t, {
            vx: n.x * 1.4 + rand(-0.2, 0.2), vy: n.y * 1.4 + rand(0, 0.3), vz: n.z * 1.4 + rand(-0.2, 0.2),
            size: 0.022, grow: 2.4, gravity: -0.4, drag: 4, life: 0.3, color: '#f2f2f2', alpha: 0.6, minPx: 0, near: 0.15,
          });
        }
        break;
      }
      default:
        this.burst('dust', pos, normal, opts);
    }
  }

  /** Water: a translucent crown, droplets arcing out of it, a centre jet, ripples and foam. */
  splash(pos, s) {
    const ps = Math.sqrt(s);
    const R = 0.38 * s;
    const turn = Math.random();
    // a low crown: whoever fell in pokes their head out of it instead of hiding behind a wall of water
    const fresh = this.crowns.spawn(pos, { radius: R, height: 0.8, life: 0.8 + 0.15 * s, seed: turn });
    // droplets thrown mostly upward: they fall back around the splash instead of raining over the scene
    // (those that miss the water vanish a little below the surface instead of pelting the ground)
    const nd = Math.round(6 + 4 * s);
    for (let i = 0; i < nd; i++) {
      // launched from the crown wall (not the middle) so the one who fell in is not covered
      const a = Math.random() * 6.283;
      const h = rand(0.6, 1.5) * ps, v = rand(3.0, 5.2) * ps;
      _t.set(pos.x + Math.cos(a) * R * 0.8, pos.y + 0.05, pos.z + Math.sin(a) * R * 0.8);
      this.sprite(KIND.DROP, _t, {
        vx: Math.cos(a) * h, vy: v, vz: Math.sin(a) * h, size: rand(0.045, 0.07) * ps, gravity: 11, drag: 0.3,
        life: 1.0, floor: pos.y - 0.35, color: pick(WATER), near: 1.2, pin: 0.05,
      });
    }
    if (fresh) {
      // beads flung off the crown's points (the classic milk-drop crown)
      for (let j = 0; j < 9; j++) {
        const a = (turn + j / 9) * 6.2832;
        _t.set(pos.x + Math.cos(a) * R * 0.7, pos.y + 0.25 * R, pos.z + Math.sin(a) * R * 0.7);
        const h = 1.3 * ps, v = rand(2.8, 3.6) * ps;
        this.sprite(KIND.DROP, _t, {
          vx: Math.cos(a) * h, vy: v, vz: Math.sin(a) * h, size: 0.05 * ps, gravity: 11, drag: 0.4,
          life: 0.95, floor: pos.y - 0.35, color: '#f2fdff', near: 1.2, pin: 0.08,
        });
      }
    }
    if (fresh && s >= 1.1) {
      // centre jet, nudged behind the splash centre so whoever fell in stays in view
      const cam = viewState.camera;
      if (cam) _a.subVectors(pos, cam.position).setY(0).normalize(); else _a.set(0, 0, 0);
      _t.set(pos.x, pos.y + 0.1, pos.z).addScaledVector(_a, R * 0.45);
      this.sprite(KIND.DROP, _t, { vy: 4.2 * ps, size: 0.1 * ps, stretch: 0.32, gravity: 12, life: 1.1, floor: pos.y - 0.05, color: '#dff7ff', alpha: 0.7, near: 1.2, pin: 0.05 });
    }
    _t.set(pos.x, pos.y + 0.02, pos.z);
    // ripples stay about crown-sized: small tanks and water butts should not grow rings over the grass
    this.sprite(KIND.WRING, _t, { size: R * 1.25, life: 1.0, color: '#f4feff' });
    this.sprite(KIND.WRING, _t, { size: R * 1.55, life: 1.4, color: '#f4feff', alpha: 0.6 });
    if (fresh) this.sprite(KIND.FOAM, _t, { size: R * 1.1, grow: 0.5, life: 1.4, color: '#f2fdff' });
  }

  /** Soft hits (villagers, cushions): flash + ring, and a poof that blooms BEHIND the target. */
  soft(pos, n, s, col) {
    this.flash(pos, n, 0.8 * s, '#ffffff');
    const cam = viewState.camera;
    if (cam) _a.subVectors(pos, cam.position).normalize(); else _a.copy(n).negate();
    // two axes across the view direction
    _b.crossVectors(_a, UP);
    if (_b.lengthSq() < 1e-4) _b.set(1, 0, 0);
    _b.normalize();
    _v.crossVectors(_b, _a).normalize();
    const colors = col || ['#ffffff', '#f3ecff'];
    const cnt = Math.max(3, Math.round(4 * s));
    for (let i = 0; i < cnt; i++) {
      const a = (i / cnt) * 6.283 + rand(-0.3, 0.3);
      const cx = Math.cos(a), cy = Math.sin(a);
      _t.copy(pos).addScaledVector(_a, 0.28).addScaledVector(_b, cx * 0.16 * s).addScaledVector(_v, cy * 0.16 * s);
      const sp = 1.3 * s;
      this.sprite(KIND.PUFF, _t, {
        vx: (_b.x * cx + _v.x * cy) * sp, vy: (_b.y * cx + _v.y * cy) * sp + 0.3, vz: (_b.z * cx + _v.z * cy) * sp,
        size: 0.12 * Math.sqrt(s), grow: 1.1, life: 0.5, drag: 4, gravity: -0.3, color: pick(colors), alpha: 0.85, minPx: 2,
      });
    }
  }

  /** Cartoon stars popping out in a ring and hanging for a beat; big scales become a firework. */
  stars(pos, s, col) {
    const size = 0.13 + 0.07 * s;
    const cnt = 5 + Math.round(3 * s);
    const colors = col || STAR_COLORS;
    this.sprite(KIND.FLASH, pos, { size: 0.16 * s, life: 0.12, color: '#fff6cf', pin: 0.3 });
    this.sprite(KIND.RING, pos, { size: 0.4 * s, life: 0.3, color: '#fff3b0', alpha: 0.7 });
    const hs = 2.2 * Math.pow(s, 0.8);
    for (let i = 0; i < cnt; i++) {
      const a = (i / cnt) * 6.283 + rand(-0.25, 0.25);
      const h = hs * rand(0.8, 1.15), v = rand(0.8, 1.9) * Math.sqrt(s);
      // outward + a little swirl: the ring of stars spins open like a cartoon daze
      const ca = Math.cos(a), sa = Math.sin(a);
      this.sprite(KIND.STAR, pos, {
        vx: (ca - sa * 0.55) * h, vy: v, vz: (sa + ca * 0.55) * h, size: size * rand(0.85, 1.15), gravity: 1.6, drag: 2.4,
        life: rand(0.95, 1.35), spin: rand(3, 6) * (Math.random() < 0.5 ? -1 : 1), color: pick(colors), near: 1, pin: 0.18, minPx: 6,
      });
    }
    if (s >= 1.5) {
      // firework: a sphere of glowing streaks behind the stars
      for (let i = 0; i < 18; i++) {
        _v.set(rand(-1, 1), rand(-0.6, 1), rand(-1, 1)).normalize();
        const sp = rand(4, 6.5) * s;
        this.sprite(KIND.STREAK, pos, {
          vx: _v.x * sp, vy: _v.y * sp, vz: _v.z * sp, size: 0.05 * s, gravity: 3, drag: 1.6, life: rand(0.7, 1),
          color: pick(ACCENTS), hdr: 2.4, stretch: 0.05, minPx: 1.5,
        });
      }
    }
  }

  update(dt) {
    const cam = viewState.camera;
    this.sprites.setViewHeight(viewState.height || 900);
    for (const k in this.pools) this.pools[k].update(dt, cam);
    this.sprites.update(dt, cam);
    this.crowns.update(dt);
  }

  clear() {
    for (const k in this.pools) this.pools[k].clear();
    this.sprites.clear();
    this.crowns.clear();
  }
}
