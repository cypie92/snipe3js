// Procedural sticker icons ("!?", "!", "?", "z", note, heart, anger cloud) drawn on canvas and shown
// as camera-facing sprites, plus the soft contact-shadow blob used under every character.
// Tell stickers keep a minimum ON-SCREEN size (a fraction of the view height) so they read from the
// perch unscoped at 40-100 m, and never get smaller than their natural world size when scoped / close.
// All textures/materials are created once and shared by every character.
import * as THREE from 'three';
import { P } from '../../gfx/palette.js';
import { clamp, easeOutBack, smooth } from './anim.js';

const INK = P.ink;
const S = 256;
const cache = new Map();
const CREAM = '#fff8ee';

/** Global tell-sticker tuning (the level / tech-art may tweak it). */
export const TELL = {
  screen: 0.045, // minimum sticker height as a fraction of the viewport height
  maxWorld: 5.5, // cap on the enlarged world size (m)
  zScreen: 0.034, // snore "z" size as a fraction of the viewport height
};

// ---- camera tracking: the last camera that rendered a character (react() falls back to it) ----
export const view = { camera: null, position: new THREE.Vector3(), has: false };
/** Record the rendering camera whenever `obj` is drawn (chains an existing onBeforeRender). */
export function trackView(obj) {
  const prev = obj.onBeforeRender;
  obj.onBeforeRender = function (renderer, scene, camera, ...rest) {
    if (camera && camera.isPerspectiveCamera) {
      view.camera = camera;
      view.position.setFromMatrixPosition(camera.matrixWorld);
      view.has = true;
    }
    prev.call(this, renderer, scene, camera, ...rest);
  };
}

const _fw = new THREE.Vector3();
const _fc = new THREE.Vector3();
const _fsize = new THREE.Vector2();
/**
 * Sprite onBeforeRender: grow the sprite (and its offset from the anchor) so it is at least
 * `userData.px` * viewport-height tall on screen. userData: { anchor, off, size (animated), full }.
 */
function fitToScreen(renderer, scene, camera) {
  const u = this.userData;
  if (!camera?.isPerspectiveCamera || !u.anchor) return;
  _fw.copy(u.anchor).applyMatrix4(this.parent.matrixWorld);
  const dist = _fw.distanceTo(_fc.setFromMatrixPosition(camera.matrixWorld));
  renderer.getSize(_fsize);
  const worldPerPx = (2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / (camera.zoom * Math.max(1, _fsize.y));
  const parentScale = this.parent.matrixWorld.getMaxScaleOnAxis();
  const need = Math.min(u.px * _fsize.y * worldPerPx, TELL.maxWorld) / parentScale;
  const f = Math.max(1, need / Math.max(1e-4, u.full));
  this.scale.set(u.size * f, u.size * f, 1);
  this.position.copy(u.off).multiplyScalar(f).add(u.anchor);
  this.updateMatrixWorld();
}

function canvas() {
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  return c;
}

// Paint a glyph three times: hard ink drop shadow, ink outline, colour fill (sticker style).
function sticker(ctx, drawShape, fill, { outline = 14, shadow = 9 } = {}) {
  ctx.save();
  ctx.translate(0, shadow);
  drawShape(ctx, INK, outline * 2);
  ctx.restore();
  drawShape(ctx, INK, outline * 2);
  drawShape(ctx, fill, 0);
}

function bang(x, y, h) {
  return (ctx, col, grow) => {
    const g = grow / 2;
    ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineJoin = 'round'; ctx.lineWidth = grow || 1;
    ctx.beginPath();
    const tw = h * 0.15, bw = h * 0.075;
    ctx.moveTo(x - tw, y + h * 0.04);
    ctx.quadraticCurveTo(x, y - h * 0.08, x + tw, y + h * 0.04);
    ctx.lineTo(x + bw, y + h * 0.6);
    ctx.quadraticCurveTo(x, y + h * 0.68, x - bw, y + h * 0.6);
    ctx.closePath();
    ctx.fill(); if (grow) ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y + h * 0.84, h * 0.1 + g, 0, Math.PI * 2);
    ctx.fill();
  };
}

function question(x, y, h) {
  return (ctx, col, grow) => {
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.lineWidth = h * 0.17 + grow;
    ctx.beginPath();
    ctx.arc(x, y + h * 0.26, h * 0.2, Math.PI * 1.08, Math.PI * 2.25);
    ctx.quadraticCurveTo(x - h * 0.01, y + h * 0.45, x, y + h * 0.58);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y + h * 0.84, h * 0.1 + grow / 2, 0, Math.PI * 2);
    ctx.fill();
  };
}

function zed(x, y, w, h) {
  return (ctx, col, grow) => {
    ctx.strokeStyle = col; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.lineWidth = h * 0.2 + grow;
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.lineTo(x, y + h); ctx.lineTo(x + w, y + h);
    ctx.stroke();
  };
}

function note(x, y, h) {
  return (ctx, col, grow) => {
    ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.ellipse(x, y + h * 0.8, h * 0.19 + grow / 2, h * 0.14 + grow / 2, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = h * 0.09 + grow;
    ctx.beginPath();
    ctx.moveTo(x + h * 0.15, y + h * 0.78); ctx.lineTo(x + h * 0.15, y + h * 0.05);
    ctx.quadraticCurveTo(x + h * 0.45, y + h * 0.15, x + h * 0.42, y + h * 0.42);
    ctx.stroke();
  };
}

function heart(x, y, s) {
  return (ctx, col, grow) => {
    ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineJoin = 'round'; ctx.lineWidth = grow || 1;
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.3);
    ctx.bezierCurveTo(x, y, x - s * 0.5, y, x - s * 0.5, y + s * 0.32);
    ctx.bezierCurveTo(x - s * 0.5, y + s * 0.6, x - s * 0.1, y + s * 0.72, x, y + s * 0.92);
    ctx.bezierCurveTo(x + s * 0.1, y + s * 0.72, x + s * 0.5, y + s * 0.6, x + s * 0.5, y + s * 0.32);
    ctx.bezierCurveTo(x + s * 0.5, y, x, y, x, y + s * 0.3);
    ctx.fill(); if (grow) ctx.stroke();
  };
}

function grump(x, y, s) {
  // little storm cloud with a lightning bolt (grumpy mood, family friendly)
  return (ctx, col, grow) => {
    ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const g = grow / 2;
    for (const [cx, cy, r] of [[-0.28, 0.02, 0.2], [0, -0.12, 0.27], [0.3, 0.0, 0.21], [0.08, 0.1, 0.22], [-0.12, 0.12, 0.18]]) {
      ctx.beginPath(); ctx.arc(x + cx * s, y + cy * s, r * s + g, 0, Math.PI * 2); ctx.fill();
    }
    if (col !== INK) { ctx.fillStyle = P.sunflower; }
    ctx.beginPath();
    const b = [[0.02, 0.2], [-0.1, 0.46], [0.02, 0.44], [-0.06, 0.7], [0.16, 0.36], [0.04, 0.38], [0.12, 0.2]];
    b.forEach(([bx, by], i) => (i ? ctx.lineTo(x + bx * s, y + by * s) : ctx.moveTo(x + bx * s, y + by * s)));
    ctx.closePath();
    ctx.lineWidth = grow || 1;
    ctx.fill(); if (grow) ctx.stroke();
  };
}

// Cream speech-bubble badge with a thick ink outline + hard drop shadow; the tail points down.
function badge(ctx, fill = CREAM) {
  const shape = (c, grow) => {
    c.beginPath();
    c.arc(128, 104, 90 + grow, Math.PI * 0.62, Math.PI * 2.38);
    c.lineTo(128, 236 + grow * 1.4);
    c.closePath();
  };
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.fillStyle = INK;
  ctx.translate(0, 8); shape(ctx, 12); ctx.fill(); ctx.translate(0, -8);
  shape(ctx, 12); ctx.fill();
  ctx.fillStyle = fill; shape(ctx, 0); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.8)'; // glossy highlight
  ctx.beginPath(); ctx.ellipse(92, 58, 30, 14, -0.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function flashDraw(ctx) {
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.18, 'rgba(255,250,220,0.95)');
  g.addColorStop(0.45, 'rgba(255,240,180,0.3)');
  g.addColorStop(1, 'rgba(255,240,180,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  for (let i = 0; i < 4; i++) { // star spikes
    ctx.save(); ctx.translate(128, 128); ctx.rotate(i * Math.PI / 4);
    ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(0, -124); ctx.lineTo(6, 0); ctx.lineTo(0, 124); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}

const DRAW = {
  flash: flashDraw,
  surprise(ctx) { // "!?"
    badge(ctx);
    sticker(ctx, bang(96, 36, 134), P.tomato, { outline: 9, shadow: 5 });
    sticker(ctx, question(158, 36, 134), P.cobalt, { outline: 9, shadow: 5 });
  },
  bang(ctx) { badge(ctx, '#fff1d6'); sticker(ctx, bang(128, 30, 146), P.tomato, { outline: 10, shadow: 6 }); },
  question(ctx) { badge(ctx); sticker(ctx, question(128, 30, 146), P.cobalt, { outline: 10, shadow: 6 }); },
  z(ctx) { sticker(ctx, zed(58, 58, 140, 130), CREAM, { outline: 16, shadow: 9 }); },
  note(ctx) { badge(ctx); sticker(ctx, note(110, 32, 144), P.violet, { outline: 10, shadow: 6 }); },
  heart(ctx) { badge(ctx, '#ffe4ef'); sticker(ctx, heart(128, 44, 128), P.bubblegum, { outline: 10, shadow: 6 }); },
  anger(ctx) { sticker(ctx, grump(128, 100, 200), '#9aa8c4', { outline: 14, shadow: 8 }); },
};
/** Friendly names for tell stickers. */
export const ICON_ALIASES = { '!': 'bang', '?': 'question', '!?': 'surprise', '?!': 'surprise', '♪': 'note', note: 'note', z: 'z', zz: 'z', '♥': 'heart', grr: 'anger' };
export const iconType = (t) => ICON_ALIASES[t] || t;

export function iconMaterial(type) {
  const key = `icon:${type}`;
  if (!cache.has(key)) {
    const c = canvas();
    DRAW[type](c.getContext('2d'));
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false });
    m.name = key;
    cache.set(key, m);
  }
  return cache.get(key);
}

/** Soft white double ring lying on the water (swimmers, floating birds). Uses the blob-shadow quad. */
export function rippleMaterial() {
  if (!cache.has('ripple')) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    const ring = (r, w, a) => {
      const g = ctx.createRadialGradient(64, 64, Math.max(0, r - w), 64, 64, r + w);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.5, `rgba(255,255,255,${a})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(64, 64, r + w, 0, Math.PI * 2); ctx.arc(64, 64, Math.max(0, r - w), 0, Math.PI * 2, true); ctx.fill();
    };
    ring(34, 7, 0.95);
    ring(54, 6, 0.55);
    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.MeshBasicMaterial({
      color: '#f4fbff', alphaMap: tex, transparent: true, opacity: 0.7, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    mat.name = 'ripple';
    cache.set('ripple', mat);
  }
  return cache.get('ripple');
}

/** Camera flash burst sprite (additive). */
export function makeFlash() {
  if (!cache.has('flashMat')) {
    const m = iconMaterial('flash').clone();
    m.blending = THREE.AdditiveBlending;
    m.map = iconMaterial('flash').map;
    cache.set('flashMat', m);
  }
  const s = new THREE.Sprite(cache.get('flashMat'));
  s.position.set(-0.05, 0.06, 0.05);
  s.raycast = () => {};
  s.visible = false;
  s.renderOrder = 11;
  return s;
}

/** Shared soft contact-shadow blob (unit size, lies on the ground). */
export function blobShadow(size = 1) {
  if (!cache.has('blob')) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.8)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.MeshBasicMaterial({
      color: '#2c2f5a', alphaMap: tex, transparent: true, opacity: 0.3, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    mat.name = 'blobShadow';
    cache.set('blob', { geo: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), mat });
  }
  const { geo, mat } = cache.get('blob');
  const m = new THREE.Mesh(geo, mat);
  m.scale.set(size, 1, size);
  m.position.y = 0.012;
  m.renderOrder = -1;
  m.castShadow = false;
  m.receiveShadow = false;
  m.raycast = () => {};
  m.name = 'blob';
  return m;
}

/**
 * Many blob shadows in ONE draw call (used by Crowd / PigeonFlock). Characters created with
 * { shadow: false } get a slot via attach(character); positions update every frame in update().
 */
export class BlobShadows {
  constructor(capacity = 64) {
    blobShadow(1); // make sure the shared geo/material exist
    const { geo, mat } = cache.get('blob');
    this.mesh = new THREE.InstancedMesh(geo, mat, capacity);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1;
    this.mesh.raycast = () => {};
    this.mesh.name = 'blob-shadows';
    this.list = [];
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
  }

  attach(ch) {
    if (this.list.length >= this.mesh.instanceMatrix.count) return;
    this.list.push(ch);
    this.mesh.count = this.list.length;
  }

  /** Call after the characters updated. Characters must share this mesh's parent space. */
  update() {
    const m = this._m;
    this.list.forEach((ch, i) => {
      const st = ch.shadowState;
      if (!st || !st.visible) { m.makeScale(0, 0, 0); this.mesh.setMatrixAt(i, m); return; }
      const r = ch.root;
      this._p.set(st.x, 0, st.z).applyAxisAngle(Y, r.rotation.y).add(r.position);
      this._p.y += 0.013;
      this._s.set(st.size, 1, st.size * (st.sz || 1));
      this._q.setFromAxisAngle(Y, r.rotation.y);
      m.compose(this._p, this._q, this._s);
      this.mesh.setMatrixAt(i, m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
const Y = new THREE.Vector3(0, 1, 0);

/**
 * A pop-up sticker above a character's head. Created lazily: no draw call until shown.
 *   icon.show('surprise', 1.6); icon.update(dt) each frame.
 */
export class IconPop {
  constructor(parent, height = 2, size = 0.62) {
    this.parent = parent;
    this.height = height;
    this.size = size;
    this.base = new THREE.Vector3(); // anchor in parent space (the owner can keep it on the head)
    this.sprite = null;
    this.t = 0;
    this.dur = 0;
    this.active = false;
  }

  show(type, dur = 1.6, size = this.size) {
    type = iconType(type);
    if (!this.sprite) {
      this.sprite = new THREE.Sprite(iconMaterial(type));
      this.sprite.raycast = () => {};
      this.sprite.renderOrder = 10;
      this.sprite.center.set(0.5, 0); // grow upward from just above the head
      Object.assign(this.sprite.userData, { anchor: new THREE.Vector3(), off: new THREE.Vector3(), size: 0, full: size, px: TELL.screen });
      this.sprite.onBeforeRender = fitToScreen;
      this.parent.add(this.sprite);
    }
    this.type = type;
    this.sprite.material = iconMaterial(type);
    this.sprite.visible = true;
    this.curSize = size;
    this.t = 0;
    this.dur = dur;
    this.active = true;
    this.update(0);
  }

  hide() { this.dur = Math.min(this.dur, this.t + 0.2); }

  update(dt) {
    if (!this.active) return;
    this.t += dt;
    const t = this.t;
    const inK = easeOutBack(t / 0.28, 2.6);
    const outK = 1 - smooth((t - (this.dur - 0.22)) / 0.22);
    const k = clamp(Math.min(inK, outK), 0, 2);
    const s = this.curSize * k * (1 + Math.sin(t * 9) * 0.04);
    const u = this.sprite.userData;
    u.anchor.set(0, this.height, 0).add(this.base);
    u.off.set(Math.sin(t * 3.1) * 0.03, Math.sin(t * 4.2) * 0.04 + (1 - Math.min(1, inK)) * -0.15, 0);
    u.size = s; u.full = this.curSize; u.px = TELL.screen * (this.curSize / this.size);
    this.sprite.scale.set(s, s, 1);
    this.sprite.position.copy(u.anchor).add(u.off);
    this.sprite.material.rotation = 0;
    if (t >= this.dur) { this.active = false; this.sprite.visible = false; }
  }
}

/** Floating "z z z" for sleepers: 3 sprites rising, drifting and shrinking in a loop. */
export class Snore {
  constructor(parent) {
    this.parent = parent;
    this.sprites = null;
    this.on = false;
    this.origin = new THREE.Vector3(0.2, 1.6, 0.1);
    this.base = new THREE.Vector3(); // added to origin (owner may track the head)
  }

  set(on) {
    if (on && !this.sprites) {
      this.sprites = [0, 1, 2].map(() => {
        const s = new THREE.Sprite(iconMaterial('z'));
        s.raycast = () => {};
        s.renderOrder = 10;
        Object.assign(s.userData, { anchor: new THREE.Vector3(), off: new THREE.Vector3(), size: 0, full: 0.46, px: TELL.zScreen });
        s.onBeforeRender = fitToScreen;
        this.parent.add(s);
        return s;
      });
    }
    this.on = on;
    if (this.sprites) for (const s of this.sprites) s.visible = on;
  }

  update(t) {
    if (!this.on || !this.sprites) return;
    const per = 2.4;
    this.sprites.forEach((s, i) => {
      const k = (((t / per) + i / 3) % 1 + 1) % 1;
      const size = (0.16 + 0.3 * k) * Math.min(1, (1 - k) * 4) * Math.min(1, k * 8);
      const u = s.userData;
      u.anchor.copy(this.origin).add(this.base);
      u.off.set(k * 0.35 + Math.sin(k * 7 + i) * 0.07, k * 0.75, 0);
      u.size = size; u.px = TELL.zScreen;
      s.scale.set(size, size, 1);
      s.position.copy(u.anchor).add(u.off);
      s.material.rotation = 0;
    });
  }
}
