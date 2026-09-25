// Bullet tracers: a bright slug that travels to the target + a fading vapour trail.
import * as THREE from 'three';

const _q = new THREE.Quaternion();
const _d = new THREE.Vector3();
const Z = new THREE.Vector3(0, 0, 1);

export class Tracers {
  constructor(scene) {
    this.scene = scene;
    const geo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5);
    this.geo = geo;
    this.slugMat = new THREE.MeshBasicMaterial({ color: '#fff2c0', toneMapped: false, transparent: true, depthWrite: false });
    this.trailMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.35, depthWrite: false });
    this.active = [];
  }

  spawn(from, to, travel = 0.15) {
    const dist = from.distanceTo(to);
    const slug = new THREE.Mesh(this.geo, this.slugMat.clone());
    const trail = new THREE.Mesh(this.geo, this.trailMat.clone());
    for (const m of [slug, trail]) {
      m.userData.noHit = true;
      m.frustumCulled = false;
      this.scene.add(m);
    }
    _d.subVectors(to, from).normalize();
    _q.setFromUnitVectors(Z, _d);
    slug.quaternion.copy(_q);
    trail.quaternion.copy(_q);
    trail.position.copy(from);
    const slugLen = Math.min(6, Math.max(1.2, dist * 0.08));
    this.active.push({ from: from.clone(), dir: _d.clone(), dist, slug, trail, t: 0, travel: Math.max(0.03, travel), slugLen, fade: 0 });
  }

  update(dt, camera) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const a = this.active[i];
      a.t += dt;
      const k = Math.min(1, a.t / a.travel);
      const head = a.dist * k;
      // Thickness scales with distance to camera so it stays visible but thin.
      const camDist = camera ? camera.position.distanceTo(a.from) : 10;
      const w = 0.012 + camDist * 0.0004;
      const tail = Math.max(0, head - a.slugLen);
      a.slug.position.copy(a.from).addScaledVector(a.dir, tail);
      a.slug.scale.set(w * 1.6, w * 1.6, Math.max(0.01, head - tail));
      a.trail.scale.set(w * 0.8, w * 0.8, Math.max(0.01, head));
      if (k >= 1) {
        a.fade += dt;
        a.slug.visible = false;
        a.trail.material.opacity = 0.35 * Math.max(0, 1 - a.fade / 0.35);
        a.trail.scale.x = a.trail.scale.y = w * (0.8 + a.fade * 3);
        if (a.fade > 0.35) {
          this.scene.remove(a.slug, a.trail);
          a.slug.material.dispose();
          a.trail.material.dispose();
          this.active.splice(i, 1);
        }
      }
    }
  }

  clear() {
    for (const a of this.active) this.scene.remove(a.slug, a.trail);
    this.active = [];
  }
}
