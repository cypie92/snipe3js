// Jack's van + telescopic crow's-nest perch.
//
//   const perch = createPerch({ seed: 1 });          // eyeHeight defaults to 12
//   perch.root.position.set(p.x, p.y - perch.eyeHeight, p.z); // p = the level's perch (eye) position
//   perch.root.rotation.y = yaw;                      // local -Z = the direction the player faces
//   scene.add(perch.root);
//   perch.update(dt, t);                              // every frame (pennant, legs, beacons, sway)
//   perch.setRaise(k);                                // 0 = stowed on the van roof, 1 = eye at eyeHeight
//
// Extras: perch.raiseTo(k, seconds) -> Promise (self-animated), perch.setSpeed(mps) (wheels roll
// for a drive-in), perch.eye (Object3D at the eye; follows the settle wobble), perch.getEyePosition(v).
// root.userData.noHit = true by default so the railing never steals shots (pass hittable: true).
import * as THREE from 'three';
import { buildVan, VAN } from './van.js';
import { buildMast } from './mast.js';
import { buildNest, NEST } from './nest.js';

const clamp01 = (x) => Math.min(1, Math.max(0, x));

export { NEST, VAN };

export function createPerch({ seed = 1, eyeHeight = 12, raise = 1, hittable = false } = {}) {
  const root = new THREE.Group();
  root.name = 'perch';
  const van = buildVan({ seed });
  root.add(van.group);

  // mast + nest live in a "sway" group pivoting on the van roof (settle wobble after raising)
  const sway = new THREE.Group();
  sway.name = 'perchSway';
  sway.position.set(0, VAN.roofY, 0);
  root.add(sway);
  const inner = new THREE.Group();
  inner.position.y = -VAN.roofY;
  sway.add(inner);

  const floorY = eyeHeight - NEST.eye;
  const mast = buildMast({ fullTop: floorY - NEST.coneH, baseTop: VAN.roofY + 0.36, collapsedTop: VAN.roofY + 0.44, ladderAbove: NEST.coneH + 0.42, hatchZ: -0.8 });
  inner.add(mast.group);
  const nest = buildNest({ seed });
  inner.add(nest.group);

  if (!hittable) {
    root.userData.noHit = true;
    root.traverse((o) => { if (o.isMesh) o.raycast = () => {}; });
  }

  const st = { k: -1, prevK: 0, vel: 0, moving: 0, tween: null, ax: 0, az: 0, vx: 0, vz: 0, t: 0 };

  function applyRaise(k) {
    van.setLegs(clamp01(k / 0.2));
    const top = mast.setExtension((k - 0.16) / 0.84);
    nest.group.position.y = top + NEST.coneH;
  }

  const perch = {
    root, eyeHeight, eye: nest.eye, van: van.group, mast: mast.group, nest: nest.group,
    get raise() { return st.k; },

    /** Pose the rig instantly: legs deploy over k 0..0.2, then the mast telescopes up to k = 1. */
    setRaise(k) {
      k = clamp01(k);
      if (k === st.k) return;
      if (st.k >= 0) st.moving = 0.5;
      // "clunk" when the mast tops out: guaranteed little settle wobble
      if (k >= 1 && st.k >= 0 && st.k < 1) { st.vx -= 0.035; st.vz += 0.018; }
      st.k = k;
      applyRaise(k);
    },

    /** Self-animated raise/lower. Resolves when done. */
    raiseTo(k, seconds = 5) {
      st.tween?.resolve();
      return new Promise((resolve) => {
        st.tween = { from: Math.max(0, st.k), to: clamp01(k), t: 0, dur: Math.max(0.01, seconds), resolve };
      });
    },

    /** Van speed in m/s (wheels roll, body bobs). */
    setSpeed(v) { van.speed = v; },

    getEyePosition(target = new THREE.Vector3()) {
      return nest.eye.getWorldPosition(target);
    },

    update(dt, t = (st.t += dt)) {
      if (st.tween) {
        const tw = st.tween;
        tw.t += dt;
        const x = clamp01(tw.t / tw.dur);
        const e = x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
        perch.setRaise(tw.from + (tw.to - tw.from) * e);
        if (x >= 1) { st.tween = null; tw.resolve(); }
      }
      // settle wobble: a damped spring kicked by changes in the raise speed
      if (dt > 0) {
        const kNow = Math.max(0, st.k);
        const vel = (kNow - st.prevK) / dt;
        const acc = (vel - st.vel) / dt;
        st.prevK = kNow;
        st.vel = vel;
        const kick = THREE.MathUtils.clamp(acc, -40, 40) * kNow;
        const w = Math.PI * 2 * 1.15, z = 0.1;
        st.vx += (-w * w * st.ax - 2 * z * w * st.vx - kick * 0.0035) * dt;
        st.vz += (-w * w * st.az - 2 * z * w * st.vz + kick * 0.002) * dt;
        st.ax += st.vx * dt;
        st.az += st.vz * dt;
        if (Math.abs(st.ax) + Math.abs(st.vx) + Math.abs(st.az) + Math.abs(st.vz) < 1e-6) st.ax = st.az = st.vx = st.vz = 0;
        sway.rotation.set(st.ax, 0, st.az);
      }
      st.moving = Math.max(0, st.moving - dt);
      van.beaconsOn = st.moving > 0;
      van.tick(dt, t);
      nest.tick(dt, t);
    },

    /** Triangles / draw calls (visible meshes; instanced counted once per draw). */
    stats() {
      let tris = 0, calls = 0;
      root.traverseVisible((o) => {
        if (!o.isMesh) return;
        const g = o.geometry;
        const n = (g.index ? g.index.count : g.attributes.position.count) / 3;
        tris += n * (o.isInstancedMesh ? o.count : 1);
        calls++;
      });
      return { tris: Math.round(tris), calls };
    },
  };

  perch.setRaise(raise);
  st.prevK = st.k;
  return perch;
}
