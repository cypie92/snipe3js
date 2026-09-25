// First-person rifle + Jack's gloved hands. Chunky toy rifle, bolt/reload/recoil animation,
// weapon inertia; slides to centre and hides when the scope comes up.
import * as THREE from 'three';
import { part, merge, rbox, cyl, sphere, torus } from '../world/geo.js';
import { materials } from '../gfx/materials.js';
import { P } from '../gfx/palette.js';

const WALNUT = '#9a5b2e';
const WALNUT_L = '#b8743f';
const GUN = '#4b5b82';
const GUN_L = '#8793b0';
const SCOPE = '#3a6ee8';
const RING = '#ffc93c';
const GLOVE = '#ff8a3d';
const CUFF = '#ffd166';
const SLEEVE = '#3a6ee8';

export class Viewmodel {
  constructor(camera) {
    this.camera = camera;
    this.root = new THREE.Group();
    this.root.name = 'viewmodel';
    this.root.userData.noHit = true;
    camera.add(this.root);

    this.gun = new THREE.Group();
    this.root.add(this.gun);

    const Z = Math.PI / 2;
    const wood = merge([
      part(rbox(0.085, 0.15, 0.36, 0.035), [WALNUT, WALNUT_L], { y: -0.03, z: 0.2 }), // butt stock
      part(rbox(0.07, 0.05, 0.2, 0.02), WALNUT_L, { y: 0.045, z: 0.2 }), // cheek rest
      part(rbox(0.066, 0.12, 0.08, 0.025), WALNUT, { y: -0.07, z: 0.02, rx: -0.35 }), // grip
      part(rbox(0.08, 0.07, 0.46, 0.03), [WALNUT, WALNUT_L], { y: -0.005, z: -0.36 }), // fore-end
    ]);
    const steel = merge([
      part(rbox(0.075, 0.075, 0.26, 0.02), GUN, { y: 0.02, z: -0.08 }), // receiver
      part(cyl(0.017, 0.022, 0.62, 12), GUN, { rx: Z, y: 0.025, z: -0.68 }), // barrel
      part(cyl(0.026, 0.026, 0.06, 12), GUN_L, { rx: Z, y: 0.025, z: -0.98 }), // muzzle brake
      part(cyl(0.034, 0.034, 0.34, 16), SCOPE, { rx: Z, y: 0.105, z: -0.16 }), // scope tube
      part(cyl(0.052, 0.036, 0.09, 16), SCOPE, { rx: Z, y: 0.105, z: -0.37 }), // objective bell
      part(cyl(0.055, 0.055, 0.025, 16), RING, { rx: Z, y: 0.105, z: -0.41 }), // bell rim
      part(cyl(0.044, 0.034, 0.07, 16), SCOPE, { rx: Z, y: 0.105, z: 0.04 }), // eyepiece
      part(cyl(0.047, 0.047, 0.022, 16), RING, { rx: Z, y: 0.105, z: 0.07 }), // eyepiece rim
      part(cyl(0.02, 0.02, 0.05, 10), RING, { y: 0.15, z: -0.16 }), // turret top
      part(cyl(0.02, 0.02, 0.05, 10), RING, { rz: Z, x: 0.045, y: 0.105, z: -0.16 }), // turret side
      part(rbox(0.05, 0.04, 0.03, 0.01), GUN_L, { y: 0.07, z: -0.27 }), // ring
      part(rbox(0.05, 0.04, 0.03, 0.01), GUN_L, { y: 0.07, z: -0.03 }), // ring
      part(torus(0.035, 0.008, 6, 14, Math.PI), GUN, { rz: Math.PI, y: -0.035, z: -0.02, ry: Z }), // trigger guard
    ]);
    const lens = merge([
      part(cyl(0.046, 0.046, 0.004, 16), '#9fdcf7', { rx: Z, y: 0.105, z: -0.416 }),
    ]);
    this.gun.add(new THREE.Mesh(wood, materials.toy), new THREE.Mesh(steel, materials.glossy), new THREE.Mesh(lens, materials.glass));

    // Bolt handle (animated)
    this.bolt = new THREE.Group();
    this.bolt.position.set(0.04, 0.03, -0.02);
    const boltGeo = merge([
      part(cyl(0.008, 0.008, 0.08, 8), GUN_L, { rz: Z, x: 0.04 }),
      part(sphere(0.018, 12, 8), GUN_L, { x: 0.085 }),
    ]);
    this.bolt.add(new THREE.Mesh(boltGeo, materials.glossy));
    this.gun.add(this.bolt);

    // Hands (mittens) + sleeves
    const hands = merge([
      part(rbox(0.1, 0.085, 0.12, 0.035), GLOVE, { x: 0.005, y: -0.085, z: 0.05, rx: -0.3 }), // right hand on grip
      part(rbox(0.035, 0.035, 0.07, 0.015), GLOVE, { x: -0.045, y: -0.045, z: 0.01, ry: 0.4 }), // thumb
      part(rbox(0.11, 0.06, 0.05, 0.02), CUFF, { x: 0.01, y: -0.1, z: 0.13, rx: -0.3 }), // cuff
      part(rbox(0.11, 0.09, 0.13, 0.04), GLOVE, { x: 0.0, y: -0.06, z: -0.46 }), // left hand under fore-end
      part(rbox(0.12, 0.06, 0.05, 0.02), CUFF, { x: 0.0, y: -0.09, z: -0.38 }),
      part(cyl(0.055, 0.06, 0.5, 12), SLEEVE, { rx: 1.25, x: 0.03, y: -0.2, z: 0.36 }), // right sleeve
      part(cyl(0.055, 0.06, 0.55, 12), SLEEVE, { rx: 1.05, rz: 0.35, x: -0.06, y: -0.26, z: -0.18 }), // left sleeve
    ]);
    this.gun.add(new THREE.Mesh(hands, materials.toy));

    this.root.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = false;
        o.receiveShadow = false;
        o.userData.noHit = true;
      }
    });

    this.gun.scale.setScalar(0.52);
    this.hip = new THREE.Vector3(0.2, -0.19, -0.44);
    this.ads = new THREE.Vector3(0.0, -0.085, -0.22);
    this.recoil = 0;
    this.recoilVel = 0;
    this.lag = new THREE.Vector2();
    this.lagVel = new THREE.Vector2();
    this.muzzleLocal = new THREE.Vector3(0, 0.025, -1.02); // in gun space (scaled with the gun)
    this.t = 0;
  }

  fire() {
    this.recoilVel += 3.2;
  }

  /** Feed mouse deltas for weapon inertia. */
  sway(dx, dy) {
    this.lagVel.x += dx * 0.00004;
    this.lagVel.y += dy * 0.00004;
  }

  update(dt, rig, rifle) {
    this.t += dt;
    const s = rig.scopeT;
    this.root.visible = s < 0.65 && !rig.override && this.enabled !== false;

    // recoil + inertia springs
    this.recoilVel += (-160 * this.recoil - 16 * this.recoilVel) * dt;
    this.recoil += this.recoilVel * dt;
    this.lagVel.x += (-60 * this.lag.x - 10 * this.lagVel.x) * dt;
    this.lagVel.y += (-60 * this.lag.y - 10 * this.lagVel.y) * dt;
    this.lag.x += this.lagVel.x * dt;
    this.lag.y += this.lagVel.y * dt;

    const g = this.gun;
    g.position.lerpVectors(this.hip, this.ads, THREE.MathUtils.smoothstep(s, 0, 1));
    g.position.x -= this.lag.x;
    g.position.y += this.lag.y + Math.sin(this.t * 1.6) * 0.004;
    g.position.z += this.recoil * 0.06;
    g.rotation.set(this.recoil * 0.12 + this.lag.y * 2, -0.05 * (1 - s) - this.lag.x * 2, 0.04 * (1 - s));

    // bolt cycle / reload poses
    let boltRot = 0, boltSlide = 0;
    if (rifle.state === 'bolting') {
      const p = rifle.progress;
      boltRot = p < 0.25 ? p / 0.25 : p > 0.8 ? (1 - p) / 0.2 : 1;
      boltSlide = p < 0.25 ? 0 : p < 0.5 ? (p - 0.25) / 0.25 : p < 0.8 ? 1 - (p - 0.5) / 0.3 : 0;
      g.rotation.z += 0.08 * Math.sin(p * Math.PI);
    }
    if (rifle.state === 'reloading') {
      const p = rifle.progress;
      const k = Math.sin(Math.min(1, p) * Math.PI);
      g.rotation.z += 0.55 * k;
      g.rotation.x -= 0.25 * k;
      g.position.y -= 0.1 * k;
    }
    this.bolt.rotation.z = boltRot * 1.2;
    this.bolt.position.z = -0.02 + boltSlide * 0.09;
  }

  /** Where tracers start: the barrel tip, or just under the reticle when scoped. */
  muzzleWorld(rig, out) {
    const cam = this.camera;
    cam.updateMatrixWorld();
    if (rig.scopeT > 0.5) {
      out.set(0, -0.12, -1.2).applyMatrix4(cam.matrixWorld);
      return out;
    }
    this.gun.updateMatrixWorld();
    return out.copy(this.muzzleLocal).applyMatrix4(this.gun.matrixWorld);
  }
}

export { P };
