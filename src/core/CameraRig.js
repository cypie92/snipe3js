// First-person perch camera: look limits, scope zoom, breathing sway, hold-breath,
// recoil spring, shake, and an override mode for cinematics (intro fly-in, bullet cam).
import * as THREE from 'three';

const DEG = Math.PI / 180;
const zoomFov = (base, zoom) => 2 * Math.atan(Math.tan((base * DEG) / 2) / zoom) / DEG;

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    camera.rotation.order = 'YXZ';
    this.baseFov = 58;
    this.position = new THREE.Vector3(0, 12, 70);
    this.yaw = 0;
    this.pitch = -0.12;
    this.yawLimit = [-Math.PI, Math.PI];
    this.pitchLimit = [-0.75, 0.35];
    this.sensitivity = 0.0021;

    this.scoped = false;
    this.scopeT = 0; // 0..1 blend
    this.zoomLevels = [2, 4];
    this.zoomIndex = 1;
    this.fovNow = this.baseFov;

    this.swayMul = 1; // upgrade-driven
    this.breathMax = 3;
    this.breath = this.breathMax;
    this.holding = false;
    this.winded = 0; // seconds of heavy sway after running out of breath

    this.recoil = 0;
    this.recoilVel = 0;
    this.recoilYaw = 0;
    this.shakeAmt = 0;
    this.t = 0;

    this.override = null; // { position, quaternion, fov }
    this._sway = new THREE.Vector2();
  }

  setPerch({ position, yaw = 0, pitch = -0.12, yawLimit, pitchLimit }) {
    this.position.copy(position);
    this.yaw = yaw;
    this.pitch = pitch;
    this.baseYaw = yaw;
    if (yawLimit) this.yawLimit = yawLimit;
    if (pitchLimit) this.pitchLimit = pitchLimit;
  }

  get zoom() {
    return this.zoomLevels[this.zoomIndex] || 1;
  }

  /** Current magnification (1 when unscoped). */
  get magnification() {
    return Math.tan((this.baseFov * DEG) / 2) / Math.tan((this.fovNow * DEG) / 2);
  }

  look(dx, dy) {
    const k = this.sensitivity * (this.fovNow / this.baseFov);
    this.yaw -= dx * k;
    this.pitch -= dy * k;
    this.clamp();
  }

  clamp() {
    this.yaw = THREE.MathUtils.clamp(this.yaw, this.yawLimit[0], this.yawLimit[1]);
    this.pitch = THREE.MathUtils.clamp(this.pitch, this.pitchLimit[0], this.pitchLimit[1]);
  }

  setScoped(on) {
    this.scoped = on;
    if (!on) this.holding = false;
  }

  setZoomIndex(i) {
    this.zoomIndex = THREE.MathUtils.clamp(i, 0, this.zoomLevels.length - 1);
  }

  cycleZoom(dir) {
    const prev = this.zoomIndex;
    this.setZoomIndex(this.zoomIndex + dir);
    return prev !== this.zoomIndex;
  }

  setHoldBreath(on) {
    if (on && (!this.scoped || this.winded > 0 || this.breath <= 0.2)) return false;
    this.holding = on;
    return true;
  }

  kick(strength = 1) {
    this.recoilVel += 1.6 * strength;
    this.recoilYaw += (Math.random() - 0.5) * 0.01 * strength;
  }

  shake(amount = 0.5) {
    this.shakeAmt = Math.max(this.shakeAmt, amount);
  }

  /** Angular sway (radians) at time t — a lazy figure-of-eight plus noise. */
  swayAt(t) {
    let a = 0.0032 * this.swayMul;
    if (!this.scoped) a *= 0.35;
    if (this.holding) a *= 0.12;
    if (this.winded > 0) a *= 2.2;
    const x = Math.sin(t * 0.83) * 1.0 + Math.sin(t * 2.1 + 1.3) * 0.25 + Math.sin(t * 5.3) * 0.05;
    const y = Math.sin(t * 1.66 + 0.4) * 0.55 + Math.sin(t * 3.7 + 2.0) * 0.18;
    return this._sway.set(x * a, y * a);
  }

  update(dt, realDt = dt) {
    this.t += dt;
    const cam = this.camera;

    // Scope blend + FOV
    const target = this.scoped ? 1 : 0;
    this.scopeT += (target - this.scopeT) * Math.min(1, realDt * 16);
    if (Math.abs(target - this.scopeT) < 0.002) this.scopeT = target;
    const wantFov = this.scoped ? zoomFov(this.baseFov, this.zoom) : this.baseFov;
    this.fovNow += (wantFov - this.fovNow) * Math.min(1, realDt * 14);

    // Breath
    if (this.holding) {
      this.breath -= realDt;
      if (this.breath <= 0) {
        this.breath = 0;
        this.holding = false;
        this.winded = 1.6;
      }
    } else {
      this.breath = Math.min(this.breathMax, this.breath + realDt * (this.winded > 0 ? 0.6 : 1.1));
      this.winded = Math.max(0, this.winded - realDt);
    }

    // Recoil spring (critically-ish damped)
    const k = 90, d = 14;
    this.recoilVel += (-k * this.recoil - d * this.recoilVel) * realDt;
    this.recoil += this.recoilVel * realDt;
    this.recoilYaw *= Math.exp(-realDt * 8);
    this.shakeAmt *= Math.exp(-realDt * 6);

    if (this.override) {
      const o = this.override;
      cam.position.copy(o.position);
      cam.quaternion.copy(o.quaternion);
      cam.fov = o.fov ?? this.baseFov;
      cam.updateProjectionMatrix();
      return;
    }

    const sway = this.swayAt(this.t);
    const recoilScale = this.scoped ? 0.06 : 0.035;
    const sh = this.shakeAmt;
    cam.position.copy(this.position);
    cam.position.y += Math.sin(this.t * 1.3) * 0.02; // gentle breathing bob
    cam.rotation.set(
      this.pitch + sway.y + this.recoil * recoilScale + (Math.random() - 0.5) * sh * 0.02,
      this.yaw + sway.x + this.recoilYaw + (Math.random() - 0.5) * sh * 0.02,
      0,
    );
    if (Math.abs(cam.fov - this.fovNow) > 1e-4) {
      cam.fov = this.fovNow;
      cam.updateProjectionMatrix();
    }
  }

  /** World-space aim ray through the reticle (includes sway/recoil = what you see is what you hit). */
  getAimRay(origin = new THREE.Vector3(), dir = new THREE.Vector3()) {
    this.camera.updateMatrixWorld();
    origin.setFromMatrixPosition(this.camera.matrixWorld);
    dir.set(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
    return { origin, dir };
  }

  /** Point the view at a world position (used by debug/automation and hints). */
  lookAtPoint(p) {
    const d = new THREE.Vector3().subVectors(p, this.position);
    this.yaw = Math.atan2(-d.x, -d.z);
    this.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
    this.clamp();
  }
}
