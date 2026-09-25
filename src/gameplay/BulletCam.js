// Slow-motion bullet cam for the shot that finishes a level.
import * as THREE from 'three';
import { sound } from '../core/sound.js';
import { part, merge, cyl, sphere } from '../world/geo.js';
import { materials } from '../gfx/materials.js';

const _p = new THREE.Vector3();
const _look = new THREE.Vector3();
const _m = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);

export class BulletCam {
  constructor(game) {
    this.game = game;
    this.active = null;
    const g = merge([
      part(cyl(0.04, 0.04, 0.16, 12), '#d9a441', { rx: Math.PI / 2 }),
      part(sphere(0.04, 12, 8), '#e8b95a', { z: -0.08, sz: 1.8 }),
    ]);
    this.bullet = new THREE.Mesh(g, materials.metal);
    this.bullet.userData.noHit = true;
    this.bullet.visible = false;
    game.scene.add(this.bullet);
  }

  play(from, to, onImpact) {
    const g = this.game;
    const dir = new THREE.Vector3().subVectors(to, from);
    const dist = dir.length();
    dir.normalize();
    const side = new THREE.Vector3().crossVectors(dir, UP).normalize();
    this.active = {
      from: from.clone(), to: to.clone(), dir, side, dist, t: 0,
      duration: THREE.MathUtils.clamp(dist / 55, 1.3, 2.4), onImpact, impacted: false, hold: 0,
    };
    this.bullet.visible = true;
    this.bullet.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir);
    g.rig.override = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), fov: 40 };
    g.hud.setCinematic(true);
    g.paused = false;
    sound.sfx('whoosh');
    sound.duck(0.8, 2.5);
  }

  /** Runs on real (unscaled) time while active. Returns true while the cam owns the camera. */
  update(realDt) {
    const a = this.active;
    if (!a) return false;
    const g = this.game;
    const o = g.rig.override;
    if (!a.impacted) {
      a.t += realDt;
      // ease-in-out travel, extra-slow at the very end for drama
      const k = THREE.MathUtils.smootherstep(Math.min(1, a.t / a.duration), 0, 1);
      _p.lerpVectors(a.from, a.to, k);
      this.bullet.position.copy(_p);
      this.bullet.rotateZ(realDt * 25);
      const orbit = k * Math.PI * 0.6;
      const off = a.side.clone().multiplyScalar(Math.cos(orbit) * 0.55).addScaledVector(UP, 0.18 + Math.sin(orbit) * 0.4);
      o.position.copy(_p).addScaledVector(a.dir, -1.3).add(off);
      _look.copy(_p).addScaledVector(a.dir, 2.5);
      _m.lookAt(o.position, _look, UP);
      o.quaternion.setFromRotationMatrix(_m);
      o.fov = 40 + k * 8;
      if (Math.random() < realDt * 30) g.fx.emit('blob', _p, 1, { speed: 0.2, size: 0.05, grow: 3, gravity: 0, drag: 3, life: 0.8, color: '#ffffff' });
      if (a.t >= a.duration) {
        a.impacted = true;
        this.bullet.visible = false;
        a.onImpact();
        g.rig.shake(0.6);
        // pull back to admire the result
        a.camFrom = o.position.clone();
        a.camTo = a.to.clone().addScaledVector(a.dir, -9).addScaledVector(UP, 2.5).addScaledVector(a.side, 3);
      }
    } else {
      a.hold += realDt;
      const k = THREE.MathUtils.smootherstep(Math.min(1, a.hold / 1.2), 0, 1);
      o.position.lerpVectors(a.camFrom, a.camTo, k);
      _m.lookAt(o.position, a.to, UP);
      o.quaternion.slerp(new THREE.Quaternion().setFromRotationMatrix(_m), Math.min(1, realDt * 6));
      o.fov = 48;
      if (a.hold > 2.6) this.stop();
    }
    return true;
  }

  stop() {
    this.active = null;
    this.bullet.visible = false;
    this.game.rig.override = null;
    this.game.hud.setCinematic(false);
  }
}
