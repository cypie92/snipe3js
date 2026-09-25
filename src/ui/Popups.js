// World-anchored DOM popups: floating "+40" coins, "BAD HIT!", speech bubbles, "!?" icons.
import * as THREE from 'three';

const _v = new THREE.Vector3();
const _box = new THREE.Box3();

export class Popups {
  constructor(parent, camera) {
    this.camera = camera;
    this.layer = document.createElement('div');
    this.layer.className = 'popups';
    parent.appendChild(this.layer);
    this.items = [];
  }

  /** Floating text at a world position. cls: pop-coins | pop-bad | pop-info | pop-big */
  text(pos, text, { cls = 'pop-info', duration = 1.3 } = {}) {
    const el = document.createElement('div');
    el.className = `pop ${cls}`;
    el.textContent = text;
    el.style.animationDuration = `${duration}s`;
    this.layer.appendChild(el);
    this.items.push({ el, pos: pos.clone(), t: 0, duration });
  }

  /** Speech bubble that follows an object. */
  bubble(obj, text, { duration = 2.6, cls = '' } = {}) {
    const el = document.createElement('div');
    el.className = `bubble ${cls}`;
    el.textContent = text;
    this.layer.appendChild(el);
    this.items.push({ el, obj, t: 0, duration, bubble: true });
  }

  update(dt) {
    const w = innerWidth, h = innerHeight;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      if (it.t >= it.duration || (it.obj && !it.obj.parent)) {
        it.el.remove();
        this.items.splice(i, 1);
        continue;
      }
      if (it.obj) {
        _box.setFromObject(it.obj);
        _v.set((_box.min.x + _box.max.x) / 2, _box.max.y + 0.35, (_box.min.z + _box.max.z) / 2);
      } else _v.copy(it.pos);
      _v.project(this.camera);
      const visible = _v.z < 1 && Math.abs(_v.x) < 1.2 && Math.abs(_v.y) < 1.2;
      it.el.style.display = visible ? '' : 'none';
      if (!visible) continue;
      it.el.style.transform = `translate(${(_v.x * 0.5 + 0.5) * w}px, ${(-_v.y * 0.5 + 0.5) * h}px)`;
      if (it.bubble) it.el.style.opacity = String(Math.min(1, (it.duration - it.t) * 3, it.t * 6));
    }
  }

  clear() {
    for (const it of this.items) it.el.remove();
    this.items = [];
  }
}
