// Path follower for people (and animals with a 'walk' action): walks along points with smooth turning,
// optional pauses (with an action), loop / ping-pong / one-way, and per-walker speed variety.
//   new Walker(person, [[0,0], [10,0], [10,8]], { loop: true, speed: 1.1, pauseAt: { 1: 3 } });
// The walker registers itself as person.controller, so person.update(dt) drives it.
import * as THREE from 'three';
import { dampAngle, damp, clamp } from './anim.js';

const toV = (p) => (p.isVector3 ? p.clone() : p.length === 2 ? new THREE.Vector3(p[0], 0, p[1]) : new THREE.Vector3(p[0], p[1], p[2]));

export class Walker {
  /**
   * opts: speed (m/s, default ~1.1 +/- variety), action ('walk' | 'run' | 'panic', auto 'run' when speed > 2.2),
   *   loop (closed path), pingPong, start (metres along the path or 0..1 when < 1 with startFraction: true),
   *   reverse (start walking backwards along the path), smooth (Catmull-Rom corners, default true),
   *   pauseAt: { index: seconds } or [{ index, duration, action, actionOptions, lookAt }],
   *   endAction ('idle'), onArrive(walker), groundY(x, z) -> y, turnRate (default 6), variety (default 0.12)
   */
  constructor(person, points, opts = {}) {
    this.person = person;
    this.opts = opts;
    const rnd = person.rng ? () => person.rng.random() : Math.random;
    const variety = opts.variety ?? 0.12;
    this.speed = (opts.speed ?? 1.1 * (person.config?.motion?.tempo ?? 1)) * (1 + (rnd() * 2 - 1) * variety);
    this.action = opts.action || (this.speed > 2.2 ? 'run' : 'walk');
    this.loop = !!opts.loop;
    this.pingPong = !!opts.pingPong;
    this.turnRate = opts.turnRate ?? 6;
    this.groundY = opts.groundY || null;
    this.endAction = opts.endAction || 'idle';
    this.lane = opts.lane ?? 0; // sideways offset (m) to the walker's right: opposite walkers pass
    this.onArrive = opts.onArrive || null;
    this.dir = opts.reverse ? -1 : 1;
    this.pauses = [];
    const pa = opts.pauseAt;
    if (Array.isArray(pa)) this.pauses = pa.map((p) => ({ ...p }));
    else if (pa) this.pauses = Object.entries(pa).map(([i, d]) => ({ index: Number(i), duration: d }));
    this.setPath(points, opts.smooth ?? true);
    let s = opts.start ?? 0;
    if (opts.startFraction) s *= this.length;
    this.s = clamp(s, 0, this.length);
    this.pauseT = 0;
    this.pause = null;
    this.done = false;
    this.paused = false;
    person.controller = this;
    person.speed = this.speed;
    person.setAction(this.action, {}, 0.2);
    this._place(0, true);
  }

  /** Replace the path (keeps the current distance clamped). */
  setPath(points, smooth = true) {
    const pts = points.map(toV);
    if (this.loop && pts.length > 2 && pts[0].distanceTo(pts[pts.length - 1]) < 1e-3) pts.pop();
    let samples;
    if (smooth && pts.length > 2) {
      const curve = new THREE.CatmullRomCurve3(pts, this.loop, 'centripetal', 0.5);
      const n = Math.max(8, Math.ceil(curve.getLength() / 0.2));
      samples = curve.getSpacedPoints(n);
      // index -> distance for pause points (nearest sample to each control point)
      this.knot = pts.map((p) => {
        let best = 0, bd = Infinity;
        samples.forEach((q, i) => { const dd = q.distanceToSquared(p); if (dd < bd) { bd = dd; best = i; } });
        return best;
      });
    } else {
      samples = this.loop ? [...pts, pts[0].clone()] : pts;
      this.knot = pts.map((_, i) => i);
    }
    this.pts = samples;
    this.cum = [0];
    for (let i = 1; i < samples.length; i++) this.cum.push(this.cum[i - 1] + samples[i].distanceTo(samples[i - 1]));
    this.length = this.cum[this.cum.length - 1];
    this.knotDist = this.knot.map((i) => this.cum[Math.min(i, this.cum.length - 1)]);
    this.s = clamp(this.s ?? 0, 0, this.length);
  }

  /** Position on the path at distance s (wraps when looping). */
  sample(s, out = new THREE.Vector3()) {
    const L = this.length;
    if (this.loop) s = ((s % L) + L) % L; else s = clamp(s, 0, L);
    let lo = 0, hi = this.cum.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (this.cum[mid] <= s) lo = mid; else hi = mid; }
    const seg = this.cum[hi] - this.cum[lo] || 1;
    return out.lerpVectors(this.pts[lo], this.pts[hi], (s - this.cum[lo]) / seg);
  }

  stop() { this.paused = true; this.person.speed = 0; this.person.setAction(this.endAction); }
  resume() { this.paused = false; this.done = false; this.person.speed = this.speed; this.person.setAction(this.action); }

  update(dt) {
    const p = this.person;
    if (this.paused || this.done) return;
    if (p.busy) { p.speed = 0; return; } // reacting: stand still, then carry on
    if (this.pauseT > 0) {
      this.pauseT -= dt;
      if (this.pauseT <= 0) {
        if (this.pause?.lookAt) p.lookAt(null);
        this.pause = null;
        p.speed = this.speed;
        p.setAction(this.action);
      }
      return;
    }
    if (p.action !== this.action) p.setAction(this.action);
    const prev = this.s;
    this.s += this.speed * this.dir * dt;
    const L = this.length;
    // pauses at control points
    for (const pz of this.pauses) {
      const d = this.knotDist[pz.index];
      if (d == null) continue;
      const crossed = this.dir > 0 ? prev < d && this.s >= d : prev > d && this.s <= d;
      const crossedWrap = this.loop && this.dir > 0 && prev > this.s + L * 0.5 && d < this.s; // wrapped past 0
      if (crossed || crossedWrap) {
        this.s = d;
        this.pause = pz;
        this.pauseT = pz.duration ?? 2;
        p.speed = 0;
        p.setAction(pz.action || 'idle', pz.actionOptions || {});
        if (pz.lookAt) p.lookAt(pz.lookAt);
        this._place(dt);
        return;
      }
    }
    if (!this.loop && (this.s >= L || this.s <= 0)) {
      if (this.pingPong) {
        this.s = clamp(this.s, 0, L);
        this.dir *= -1;
      } else {
        this.s = clamp(this.s, 0, L);
        this.done = true;
        p.speed = 0;
        p.setAction(this.endAction);
        this.onArrive?.(this);
      }
    } else if (this.loop) this.s = ((this.s % L) + L) % L;
    p.speed = this.speed;
    this._place(dt);
  }

  _place(dt, snap = false) {
    const root = this.person.root;
    const pos = this.sample(this.s, _p);
    const ahead = this.sample(this.s + this.dir * Math.max(0.5, this.speed * 0.45), _a);
    const dx = ahead.x - pos.x, dz = ahead.z - pos.z;
    if (this.lane) { // damp only the sideways offset so swapping sides (ping-pong) is a gentle side-step
      const l = Math.hypot(dx, dz) || 1;
      const ox = (-dz / l) * this.lane, oz = (dx / l) * this.lane;
      this._ox = snap || this._ox == null ? ox : damp(this._ox, ox, 4, dt);
      this._oz = snap || this._oz == null ? oz : damp(this._oz, oz, 4, dt);
      pos.x += this._ox; pos.z += this._oz;
    }
    root.position.x = pos.x;
    root.position.z = pos.z;
    root.position.y = this.groundY ? this.groundY(pos.x, pos.z) : pos.y;
    if (dx * dx + dz * dz > 1e-6) {
      const yaw = Math.atan2(dx, dz);
      root.rotation.y = snap ? yaw : dampAngle(root.rotation.y, yaw, this.turnRate, dt);
    }
    // slow down a touch in tight turns so feet do not skate
    const turn = Math.abs(((Math.atan2(dx, dz) - root.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    this.person.speed = this.pauseT > 0 || this.done ? 0 : damp(this.person.speed || this.speed, this.speed * (1 - clamp(turn, 0, 1) * 0.4), 8, dt || 0.016);
  }
}
const _p = new THREE.Vector3();
const _a = new THREE.Vector3();
