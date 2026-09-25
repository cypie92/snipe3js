// Mouse/keyboard/touch input. Pointer lock when available; drag-to-look fallback otherwise
// (click without dragging = fire). Emits: fire, scopeDown, scopeUp, zoom(dir), key(code), unlock, lock.
import { Emitter } from './Events.js';

const DRAG_THRESHOLD = 6;

export class Input extends Emitter {
  constructor(canvas) {
    super();
    this.canvas = canvas;
    this.keys = new Set();
    this.dx = 0;
    this.dy = 0;
    this.locked = false;
    this.active = false; // gameplay input enabled
    this.lockFailed = false;
    this.drag = null;
    this.mouse = { x: 0, y: 0 };
    this.touchMode = false;
    this.bind();
  }

  get usingFallback() {
    return this.lockFailed || !('pointerLockElement' in document);
  }

  bind() {
    const c = this.canvas;
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === c;
      if (this.locked && !was) this.emit('lock');
      if (!this.locked && was) this.emit('unlock');
    });
    document.addEventListener('pointerlockerror', () => {
      this.lockFailed = true;
      this.emit('lockfailed');
    });

    c.addEventListener('contextmenu', (e) => e.preventDefault());

    c.addEventListener('mousedown', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this.emit('pointerdown', e);
      if (!this.active) return;
      if (e.button === 2) {
        this.emit('scopeDown');
        return;
      }
      if (e.button !== 0) return;
      if (this.locked) {
        this.emit('fire');
      } else if (this.usingFallback) {
        this.drag = { x: e.clientX, y: e.clientY, moved: 0 };
      } else {
        this.requestLock();
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (!this.active) return;
      if (e.button === 2) this.emit('scopeUp');
      if (e.button === 0 && this.drag) {
        if (this.drag.moved < DRAG_THRESHOLD) this.emit('fire');
        this.drag = null;
      }
    });

    window.addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      if (!this.active) return;
      if (this.locked) {
        // Ignore absurd spikes some browsers emit when (re)locking.
        if (Math.abs(e.movementX) < 400 && Math.abs(e.movementY) < 400) {
          this.dx += e.movementX;
          this.dy += e.movementY;
        }
      } else if (this.drag) {
        const mx = e.clientX - this.drag.x;
        const my = e.clientY - this.drag.y;
        this.drag.moved += Math.abs(mx) + Math.abs(my);
        this.drag.x = e.clientX;
        this.drag.y = e.clientY;
        this.dx -= mx; // drag the world
        this.dy -= my;
      }
    });

    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        if (this.active) this.emit('zoom', e.deltaY < 0 ? 1 : -1);
      },
      { passive: false },
    );

    window.addEventListener('keydown', (e) => {
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      this.emit('key', e.code, e);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      this.emit('keyup', e.code, e);
    });
    window.addEventListener('blur', () => this.keys.clear());

    // Touch: one finger drags the view, tap fires (on-screen buttons handle scope/zoom).
    c.addEventListener(
      'touchstart',
      (e) => {
        this.touchMode = true;
        if (!this.active) return;
        const t = e.changedTouches[0];
        this.drag = { x: t.clientX, y: t.clientY, moved: 0, id: t.identifier };
      },
      { passive: true },
    );
    c.addEventListener(
      'touchmove',
      (e) => {
        if (!this.active || !this.drag) return;
        for (const t of e.changedTouches) {
          if (t.identifier !== this.drag.id) continue;
          const mx = t.clientX - this.drag.x;
          const my = t.clientY - this.drag.y;
          this.drag.moved += Math.abs(mx) + Math.abs(my);
          this.drag.x = t.clientX;
          this.drag.y = t.clientY;
          this.dx -= mx * 1.4;
          this.dy -= my * 1.4;
        }
      },
      { passive: true },
    );
    c.addEventListener('touchend', (e) => {
      if (!this.active || !this.drag) return;
      for (const t of e.changedTouches) {
        if (t.identifier === this.drag.id) {
          if (this.drag.moved < DRAG_THRESHOLD * 2) this.emit('fire');
          this.drag = null;
        }
      }
    });
  }

  requestLock() {
    if (this.usingFallback || this.touchMode) return;
    try {
      const p = this.canvas.requestPointerLock?.({ unadjustedMovement: true });
      if (p && p.catch) {
        p.catch(() => {
          // Retry without raw input (unsupported on some platforms), then give up -> drag mode.
          const p2 = this.canvas.requestPointerLock?.();
          if (p2 && p2.catch) p2.catch(() => { this.lockFailed = true; this.emit('lockfailed'); });
        });
      }
    } catch {
      this.lockFailed = true;
    }
  }

  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  consume() {
    const d = { dx: this.dx, dy: this.dy };
    this.dx = 0;
    this.dy = 0;
    return d;
  }

  down(code) {
    return this.keys.has(code);
  }
}
