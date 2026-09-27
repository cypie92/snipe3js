// Suction-cup darts: a toy pop-gun held at the bottom-right of the view that aims at the cursor, a
// visible dart projectile (slight arc), darts that stick with a squash + shaft wobble ("thwock"),
// then drop off, tumble, bounce on the floor and shrink away. All darts = ONE InstancedMesh.
import * as THREE from 'three';
import { part, merge, rbox } from '../world/geo.js';
import { materials } from '../gfx/materials.js';
import { P } from '../gfx/palette.js';
import { lathe, ball, bev } from '../world/kit/props/lib.js';

const MAX = 24;
const LIFE = [6.5, 9.5];
const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const _e = new THREE.Euler();
const Z = new THREE.Vector3(0, 0, 1);
const HIDE = new THREE.Matrix4().makeScale(0, 0, 0);

/** Dart geometry: suction cup at the origin opening toward -Z, shaft + fletching along +Z. */
export function dartGeometry() {
  const L = [
    part(lathe([[0.0, 0.0], [0.075, 0.0], [0.078, 0.012], [0.06, 0.035], [0.03, 0.055], [0.022, 0.07], [0, 0.07]], 16), P.tomato, { rx: Math.PI / 2 }),
    part(new THREE.CylinderGeometry(0.019, 0.019, 0.34, 10), P.tangerine, { z: 0.24, rx: Math.PI / 2 }),
    part(new THREE.CylinderGeometry(0.021, 0.021, 0.05, 10), P.sunflower, { z: 0.1, rx: Math.PI / 2 }),
    part(ball(0.028, 1), P.sunflower, { z: 0.415 }),
  ];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    L.push(part(bev(0.012, 0.075, 0.12, 0.005), P.cobalt, { x: Math.sin(a) * 0.045, y: Math.cos(a) * 0.045, z: 0.36, rz: -a }));
  }
  return merge(L);
}

function popGun() {
  const g = new THREE.Group();
  g.name = 'popGun';
  const L = [
    part(new THREE.CylinderGeometry(0.052, 0.058, 0.36, 18), P.tomato, { z: -0.2, rx: Math.PI / 2 }),
    part(new THREE.TorusGeometry(0.056, 0.02, 8, 20), P.sunflower, { z: -0.38 }),
    part(new THREE.TorusGeometry(0.058, 0.014, 8, 20), P.sunflower, { z: -0.12 }),
    part(rbox(0.13, 0.13, 0.2, 0.05), P.cobalt, { z: 0.02 }),
    part(rbox(0.09, 0.2, 0.1, 0.04), P.sunflower, { y: -0.13, z: 0.1, rx: -0.3 }),
    part(new THREE.TorusGeometry(0.045, 0.012, 6, 14, Math.PI), P.cobalt, { y: -0.07, z: 0.03, rz: Math.PI, ry: Math.PI / 2 }),
    part(bev(0.02, 0.05, 0.02, 0.008), '#3b3f4f', { y: -0.07, z: 0.03 }),
    part(ball(0.03, 1), P.sunflower, { y: 0.075, z: 0.06 }),
    part(bev(0.03, 0.04, 0.03, 0.01), P.ink, { y: 0.075, z: -0.36 }),
  ];
  const mesh = new THREE.Mesh(merge(L), materials.toy);
  mesh.name = 'popGunMesh';
  g.add(mesh);
  // the loaded dart peeking out of the barrel (hidden right after firing)
  const loaded = new THREE.Mesh(dartGeometry(), materials.toy);
  loaded.scale.setScalar(0.62);
  loaded.position.set(0, 0, -0.43);
  loaded.name = 'loadedDart';
  g.add(loaded);
  g.userData.loaded = loaded;
  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = false;
      o.receiveShadow = false;
      o.raycast = () => {};
      o.renderOrder = 10;
    }
  });
  return g;
}

export class Darts {
  /** office: { root, camera }. floorY = room-local floor height. */
  constructor({ root, camera, floorY = 0 }) {
    this.root = root;
    this.camera = camera;
    this.floorY = floorY;
    // darts are toy-exaggerated (1.25x) so they still read from the hub camera ~15 m away
    this.mesh = new THREE.InstancedMesh(dartGeometry().scale(1.25, 1.25, 1.25), materials.toy, MAX);
    this.mesh.name = 'darts';
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.raycast = () => {};
    for (let i = 0; i < MAX; i++) this.mesh.setMatrixAt(i, HIDE);
    root.add(this.mesh);
    this.list = [];
    this.gun = popGun();
    this.gun.position.set(0.36, -0.245, -0.9);
    this.gun.scale.setScalar(0.44);
    this.view = { k: 1, ka: 1 }; // gun framing relative to a 31 deg, 16:9 camera (see fitView)
    this.gunAim = new THREE.Quaternion();
    this.recoil = 0;
    this.recoilV = 0;
    this.reload = 0;
    this._rootInv = new THREE.Matrix4();
  }

  /** Keep the pop-gun the same size and place on screen whatever the camera fov / aspect. */
  fitView(fov, aspect = 16 / 9) {
    this.view.k = Math.tan(THREE.MathUtils.degToRad(fov) / 2) / Math.tan(THREE.MathUtils.degToRad(31) / 2);
    this.view.ka = Math.min(1.2, aspect / (16 / 9));
  }

  attachGun(on) {
    if (on) this.camera.add(this.gun);
    else this.gun.removeFromParent();
  }

  /** Aim the pop-gun at a world point (smoothed in update). */
  aim(worldPoint) {
    this.camera.updateMatrixWorld();
    const local = this.camera.worldToLocal(_v.copy(worldPoint));
    _v2.copy(local).sub(this.gun.position).normalize();
    // gun barrel points down its local -Z
    this.gunAim.setFromUnitVectors(_v.set(0, 0, -1), _v2);
  }

  muzzleWorld(out = new THREE.Vector3()) {
    this.gun.updateMatrixWorld(true);
    return out.set(0, 0, -0.46).applyMatrix4(this.gun.matrixWorld);
  }

  /**
   * Fire a dart from the gun to `point` (world). normal = surface normal (world) or null.
   * attach = Object3D the dart sticks to (or null for a bounce-off). onHit(dart) at impact.
   */
  fire(point, normal, attach, { bounce = false, vanish = false, onHit } = {}) {
    const from = this.muzzleWorld();
    const dist = from.distanceTo(point);
    const d = {
      state: 'fly', t: 0, dur: THREE.MathUtils.clamp(dist / 34, 0.12, 0.36),
      from, to: point.clone(), normal: normal ? normal.clone() : null, attach, bounce, vanish, onHit,
      arc: Math.min(0.9, dist * 0.045), spin: Math.random() * Math.PI * 2, age: 0, local: new THREE.Matrix4(),
      pos: new THREE.Vector3(), quat: new THREE.Quaternion(), vel: new THREE.Vector3(), ang: new THREE.Vector3(),
      life: LIFE[0] + Math.random() * (LIFE[1] - LIFE[0]), bounces: 0, shrink: 1,
    };
    this.list.push(d);
    // too many darts: the oldest stuck one lets go
    const stuck = this.list.filter((x) => x.state === 'stuck');
    if (this.list.length > MAX - 2 && stuck.length) this.drop(stuck[0]);
    this.recoilV += 9;
    this.reload = 0.28;
    this.gun.userData.loaded.visible = false;
    return d;
  }

  drop(d) {
    if (d.state !== 'stuck') return;
    this.worldMatrixOf(d, _m);
    _m.decompose(d.pos, d.quat, _s);
    d.state = 'fall';
    d.age = 0;
    const n = d.normal || _v.set(0, 0, 1);
    d.vel.copy(n).multiplyScalar(0.8 + Math.random() * 0.6).add(_v2.set((Math.random() - 0.5) * 0.6, 0.6, (Math.random() - 0.5) * 0.4));
    d.ang.set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 12);
  }

  clear() {
    this.list.length = 0;
    for (let i = 0; i < MAX; i++) this.mesh.setMatrixAt(i, HIDE);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  worldMatrixOf(d, out) {
    if (d.attach) {
      d.attach.updateWorldMatrix(true, false);
      out.multiplyMatrices(d.attach.matrixWorld, d.local);
    } else out.copy(d.local);
    // thwock: cup squash + springy shaft wobble about the cup (dart-local frame)
    const a = d.age;
    const wob = Math.sin(a * 38) * Math.exp(-a * 5.5) * 0.32;
    const sq = 1 - Math.exp(-a * 14) * 0.45 * Math.cos(a * 30);
    _e.set(wob, wob * 0.4, 0);
    _m2.compose(_v.set(0, 0, 0), _q2.setFromEuler(_e), _s.set(1, 1, sq));
    out.multiply(_m2);
    _s.set(1, 1, 1);
    return out;
  }

  update(dt) {
    // gun: follow aim, recoil spring, reload pop
    this.gun.quaternion.slerp(this.gunAim, 1 - Math.exp(-dt * 16));
    this.recoilV += (-120 * this.recoil - 14 * this.recoilV) * dt;
    this.recoil += this.recoilV * dt;
    const { k, ka } = this.view;
    this.gun.scale.setScalar(0.44 * k);
    this.gun.position.set(0.36 * k * ka, (-0.245 - this.recoil * 0.01) * k, -0.9 + this.recoil * 0.05 * k);
    if (this.reload > 0) {
      this.reload -= dt;
      if (this.reload <= 0) this.gun.userData.loaded.visible = true;
    }
    this.root.updateWorldMatrix(true, false);
    this._rootInv.copy(this.root.matrixWorld).invert();
    let i = 0;
    for (let k = this.list.length - 1; k >= 0; k--) {
      const d = this.list[k];
      d.age += dt;
      if (d.state === 'fly') {
        d.t += dt;
        const u = Math.min(1, d.t / d.dur);
        const p = _v.lerpVectors(d.from, d.to, u);
        p.y += Math.sin(Math.PI * u) * d.arc;
        // tangent for orientation
        const u2 = Math.min(1, u + 0.02);
        const p2 = _v2.lerpVectors(d.from, d.to, u2);
        p2.y += Math.sin(Math.PI * u2) * d.arc;
        const dir = p2.sub(p).normalize();
        if (u >= 0.999) dir.subVectors(d.to, d.from).normalize();
        d.quat.setFromUnitVectors(Z, dir.negate()).multiply(_q.setFromAxisAngle(Z, d.spin + d.t * 12));
        d.pos.copy(p);
        if (u >= 1) this.impact(d);
        if (d.state === 'dead') {
          this.list.splice(k, 1);
          continue;
        }
      }
      if (d.state === 'stuck' && d.age > d.life) this.drop(d);
      if (d.state === 'fall') {
        d.vel.y -= 9.8 * dt;
        d.pos.addScaledVector(d.vel, dt);
        _q.setFromEuler(_e.set(d.ang.x * dt, d.ang.y * dt, d.ang.z * dt));
        d.quat.multiply(_q);
        const floor = this.root.position.y + this.floorY + 0.03;
        if (d.pos.y < floor) {
          d.pos.y = floor;
          if (d.bounces < 2 && d.vel.y < -0.8) {
            d.vel.y *= -0.35;
            d.vel.x *= 0.6;
            d.vel.z *= 0.6;
            d.ang.multiplyScalar(0.5);
            d.bounces++;
          } else {
            d.vel.set(0, 0, 0);
            d.ang.multiplyScalar(0.8);
          }
        }
        if (d.age > 2.4) d.shrink -= dt * 3;
        if (d.shrink <= 0) {
          this.list.splice(k, 1);
          continue;
        }
      }
      if (d.state === 'bounce') {
        d.vel.y -= 9.8 * dt;
        d.pos.addScaledVector(d.vel, dt);
        d.quat.multiply(_q.setFromEuler(_e.set(d.ang.x * dt, d.ang.y * dt, d.ang.z * dt)));
        const floor = this.root.position.y + this.floorY + 0.03;
        if (d.pos.y < floor) { d.state = 'fall'; d.age = 1.5; d.bounces = 1; d.vel.y = Math.abs(d.vel.y) * 0.3; }
      }
      if (i >= MAX) continue;
      if (d.state === 'stuck') this.worldMatrixOf(d, _m);
      else _m.compose(d.pos, d.quat, _s.setScalar(Math.max(0, d.shrink)));
      _s.set(1, 1, 1);
      _m.premultiply(this._rootInv);
      this.mesh.setMatrixAt(i++, _m);
    }
    for (let j = i; j < MAX; j++) this.mesh.setMatrixAt(j, HIDE);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  impact(d) {
    d.pos.copy(d.to);
    if (d.vanish) {
      d.state = 'dead';
      return;
    }
    if (d.bounce || !d.attach) {
      // boing: ricochet off (animals) — flies back a little and drops
      d.state = 'bounce';
      const back = _v.subVectors(d.from, d.to).normalize();
      d.vel.copy(back).multiplyScalar(2.2).add(_v2.set(0, 2.4, 0));
      d.ang.set(10, 4, 8);
      d.onHit?.(d);
      return;
    }
    // stick: orient between the flight direction and the surface normal
    const flight = _v.subVectors(d.to, d.from).normalize();
    if (d.normal) flight.lerp(_v2.copy(d.normal).negate(), 0.45).normalize();
    d.quat.setFromUnitVectors(Z, flight.negate()).multiply(_q.setFromAxisAngle(Z, d.spin));
    // cup rim sits on the surface (pull back 1 cm)
    const pos = _v2.copy(d.to).addScaledVector(flight, 0.01);
    _m.compose(pos, d.quat, _s.set(1, 1, 1));
    d.attach.updateWorldMatrix(true, false);
    d.local.copy(d.attach.matrixWorld).invert().multiply(_m);
    d.state = 'stuck';
    d.age = 0;
    d.onHit?.(d);
  }

  get count() { return this.list.length; }
}
