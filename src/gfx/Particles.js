// Pooled, instanced particle system with chunky toy-like particles (blobs, shards, confetti, sparks).
import * as THREE from 'three';
import { P, ACCENTS } from './palette.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

class Pool {
  constructor(scene, geometry, material, max) {
    this.max = max;
    this.mesh = new THREE.InstancedMesh(geometry, material, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, _c.set('#ffffff'));
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.userData.noHit = true;
    scene.add(this.mesh);
    this.n = 0;
    const f = (k) => new Float32Array(max * k);
    this.pos = f(3); this.vel = f(3); this.rot = f(3); this.spin = f(3);
    this.life = f(1); this.maxLife = f(1); this.size = f(1); this.grow = f(1);
    this.grav = f(1); this.drag = f(1); this.col = f(3); this.floor = f(1);
  }

  spawn(p) {
    if (this.n >= this.max) return;
    const i = this.n++;
    const i3 = i * 3;
    this.pos[i3] = p.x; this.pos[i3 + 1] = p.y; this.pos[i3 + 2] = p.z;
    this.vel[i3] = p.vx; this.vel[i3 + 1] = p.vy; this.vel[i3 + 2] = p.vz;
    this.rot[i3] = Math.random() * 6; this.rot[i3 + 1] = Math.random() * 6; this.rot[i3 + 2] = Math.random() * 6;
    const sp = p.spin ?? 6;
    this.spin[i3] = (Math.random() - 0.5) * sp; this.spin[i3 + 1] = (Math.random() - 0.5) * sp; this.spin[i3 + 2] = (Math.random() - 0.5) * sp;
    this.life[i] = 0;
    this.maxLife[i] = p.life;
    this.size[i] = p.size;
    this.grow[i] = p.grow ?? 0;
    this.grav[i] = p.gravity ?? 9.8;
    this.drag[i] = p.drag ?? 0.5;
    this.floor[i] = p.floor ?? -1e9;
    _c.set(p.color);
    this.col[i3] = _c.r; this.col[i3 + 1] = _c.g; this.col[i3 + 2] = _c.b;
  }

  kill(i) {
    const last = --this.n;
    if (i === last) return;
    const copy = (arr, k) => {
      for (let j = 0; j < k; j++) arr[i * k + j] = arr[last * k + j];
    };
    copy(this.pos, 3); copy(this.vel, 3); copy(this.rot, 3); copy(this.spin, 3); copy(this.col, 3);
    copy(this.life, 1); copy(this.maxLife, 1); copy(this.size, 1); copy(this.grow, 1);
    copy(this.grav, 1); copy(this.drag, 1); copy(this.floor, 1);
  }

  update(dt) {
    for (let i = this.n - 1; i >= 0; i--) {
      this.life[i] += dt;
      if (this.life[i] >= this.maxLife[i]) this.kill(i);
    }
    const mesh = this.mesh;
    for (let i = 0; i < this.n; i++) {
      const i3 = i * 3;
      const d = Math.exp(-this.drag[i] * dt);
      this.vel[i3] *= d; this.vel[i3 + 2] *= d;
      this.vel[i3 + 1] = this.vel[i3 + 1] * d - this.grav[i] * dt;
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
      // pop in fast, hold, shrink out
      const env = Math.min(1, k * 8) * (k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1);
      const s = Math.max(0.0001, this.size[i] * (1 + this.grow[i] * k) * env);
      _e.set(this.rot[i3], this.rot[i3 + 1], this.rot[i3 + 2]);
      _q.setFromEuler(_e);
      _v.set(this.pos[i3], this.pos[i3 + 1], this.pos[i3 + 2]);
      _s.set(s, s, s);
      _m.compose(_v, _q, _s);
      mesh.setMatrixAt(i, _m);
      mesh.setColorAt(i, _c.setRGB(this.col[i3], this.col[i3 + 1], this.col[i3 + 2]));
    }
    mesh.count = this.n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
}

export class Particles {
  constructor(scene) {
    const lit = new THREE.MeshStandardMaterial({ roughness: 0.75, flatShading: true });
    const glow = new THREE.MeshBasicMaterial({ toneMapped: false });
    const paper = new THREE.MeshStandardMaterial({ roughness: 0.6, side: THREE.DoubleSide });
    this.pools = {
      blob: new Pool(scene, new THREE.IcosahedronGeometry(1, 0), lit, 900),
      shard: new Pool(scene, new THREE.TetrahedronGeometry(1), lit, 600),
      chip: new Pool(scene, new THREE.BoxGeometry(1, 0.35, 0.7), lit, 400),
      confetti: new Pool(scene, new THREE.PlaneGeometry(1, 0.62), paper, 700),
      spark: new Pool(scene, new THREE.OctahedronGeometry(1, 0), glow, 500),
    };
  }

  /** Low-level: n particles of kind with options. */
  emit(kind, pos, n, o = {}) {
    const pool = this.pools[kind];
    const dir = o.dir || UP;
    const colors = [].concat(o.color || '#ffffff');
    for (let i = 0; i < n; i++) {
      // random direction in a cone around dir
      const spread = o.spread ?? 0.8;
      _v.set((Math.random() - 0.5) * 2 * spread, 1, (Math.random() - 0.5) * 2 * spread).normalize();
      _q.setFromUnitVectors(UP, dir);
      _v.applyQuaternion(_q);
      const sp = (o.speed ?? 3) * (0.5 + Math.random() * 0.8);
      const jitter = o.jitter ?? 0.1;
      pool.spawn({
        x: pos.x + (Math.random() - 0.5) * jitter, y: pos.y + (Math.random() - 0.5) * jitter, z: pos.z + (Math.random() - 0.5) * jitter,
        vx: _v.x * sp, vy: _v.y * sp, vz: _v.z * sp,
        life: (o.life ?? 0.8) * (0.7 + Math.random() * 0.6),
        size: (o.size ?? 0.1) * (0.6 + Math.random() * 0.8),
        grow: o.grow, gravity: o.gravity, drag: o.drag, spin: o.spin, floor: o.floor,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }
  }

  /** High-level named effects. normal = surface normal (optional). */
  burst(name, pos, normal, opts = {}) {
    const n = normal || UP;
    const s = opts.scale ?? 1;
    switch (name) {
      case 'dust':
        this.emit('blob', pos, 7, { dir: n, speed: 1.6 * s, size: 0.18 * s, grow: 2.2, gravity: -0.4, drag: 2.2, life: 0.9, color: ['#efe3c8', '#e2d2ae', '#f7efdc'] });
        this.emit('chip', pos, 4, { dir: n, speed: 4 * s, size: 0.06 * s, gravity: 12, life: 0.7, color: ['#c9ad7f', '#a88c62'] });
        break;
      case 'grass':
        this.emit('shard', pos, 8, { dir: n, speed: 3.5 * s, size: 0.07 * s, gravity: 6, drag: 1.2, life: 0.9, color: [P.grass, P.grassDark, P.grassLight] });
        this.emit('blob', pos, 4, { dir: n, speed: 1.2 * s, size: 0.14 * s, grow: 2, gravity: -0.3, drag: 2.5, life: 0.7, color: ['#e9e2c7'] });
        break;
      case 'wood':
        this.emit('chip', pos, 9, { dir: n, speed: 5 * s, size: 0.09 * s, gravity: 12, life: 0.9, color: [P.wood, P.woodLight, P.woodDark] });
        this.emit('blob', pos, 3, { dir: n, speed: 1 * s, size: 0.12 * s, grow: 2, gravity: -0.3, drag: 2.5, life: 0.6, color: ['#e8dcc0'] });
        break;
      case 'metal':
        this.emit('spark', pos, 12, { dir: n, speed: 7 * s, spread: 1.1, size: 0.035 * s, gravity: 14, drag: 1, life: 0.45, color: ['#fff3b0', '#ffd166', '#ffffff'] });
        this.emit('blob', pos, 2, { dir: n, speed: 0.8, size: 0.1 * s, grow: 2, gravity: -0.4, drag: 2, life: 0.6, color: ['#d8dde6'] });
        break;
      case 'stone':
        this.emit('chip', pos, 8, { dir: n, speed: 4.5 * s, size: 0.07 * s, gravity: 12, life: 0.8, color: [P.stone, P.stoneDark, '#e7e0d4'] });
        this.emit('blob', pos, 5, { dir: n, speed: 1.4 * s, size: 0.16 * s, grow: 2, gravity: -0.3, drag: 2.4, life: 0.8, color: ['#ece6da'] });
        break;
      case 'glass':
        this.emit('shard', pos, 14, { dir: n, speed: 4 * s, size: 0.06 * s, gravity: 11, life: 0.9, color: ['#cdefff', '#9fdcf7', '#ffffff'] });
        break;
      case 'water':
      case 'splash':
        this.emit('blob', pos, 14, { dir: UP, speed: 4.5 * s, spread: 0.5, size: 0.09 * s, gravity: 11, drag: 0.4, life: 0.8, color: ['#bfeeff', '#8fdcf7', '#ffffff'] });
        this.emit('blob', pos, 5, { dir: UP, speed: 0.8, size: 0.2 * s, grow: 1.5, gravity: 0, drag: 3, life: 0.5, color: ['#e9fbff'] });
        break;
      case 'soft':
        this.emit('blob', pos, 6, { dir: n, speed: 1.5 * s, size: 0.14 * s, grow: 1.5, gravity: 0.5, drag: 2, life: 0.6, color: ['#ffffff', '#f3ecff'] });
        break;
      case 'leaves':
        this.emit('shard', pos, 12, { dir: n, speed: 2.5 * s, size: 0.1 * s, gravity: 2.2, drag: 2.2, spin: 10, life: 1.6, color: [P.grass, P.grassDark, P.grassLight, '#b8e07a'] });
        break;
      case 'pop':
        this.emit('confetti', pos, 16, { dir: UP, speed: 4 * s, spread: 1.4, size: 0.12 * s, gravity: 5, drag: 2.5, spin: 14, life: 1.3, color: [].concat(opts.color || ACCENTS) });
        break;
      case 'confetti':
        this.emit('confetti', pos, Math.round(60 * s), { dir: UP, speed: 7 * s, spread: 0.9, size: 0.2, gravity: 3.2, drag: 1.6, spin: 12, life: 2.6, color: ACCENTS });
        break;
      case 'stars':
        this.emit('spark', pos, 26, { dir: UP, speed: 3.5 * s, spread: 1.4, size: 0.07 * s, gravity: 1.5, drag: 2, life: 1.1, color: ['#fff3b0', '#ffd166', '#ffe9a8', '#ffffff'] });
        this.emit('blob', pos, 6, { dir: UP, speed: 1.5, size: 0.18 * s, grow: 2, gravity: -0.5, drag: 2, life: 0.8, color: ['#fff6cf'] });
        break;
      case 'smoke':
        this.emit('blob', pos, Math.round(3 * s), { dir: UP, speed: 1.2, spread: 0.25, size: 0.35 * s, grow: 2.5, gravity: -0.6, drag: 1.2, life: 2.5, color: opts.color || ['#f2f0ee', '#e4e2e6'] });
        break;
      case 'muzzle':
        this.emit('blob', pos, 4, { dir: n, speed: 2.5, spread: 0.3, size: 0.07, grow: 3, gravity: -0.5, drag: 3, life: 0.5, color: ['#eeeeee', '#d9d9d9'] });
        break;
      default:
        this.burst('dust', pos, normal, opts);
    }
  }

  update(dt) {
    for (const k in this.pools) this.pools[k].update(dt);
  }

  clear() {
    for (const k in this.pools) {
      this.pools[k].n = 0;
      this.pools[k].mesh.count = 0;
    }
  }
}
