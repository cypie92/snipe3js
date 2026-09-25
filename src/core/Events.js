// Tiny event emitter.
export class Emitter {
  constructor() {
    this.map = new Map();
  }
  on(evt, fn) {
    if (!this.map.has(evt)) this.map.set(evt, new Set());
    this.map.get(evt).add(fn);
    return () => this.off(evt, fn);
  }
  once(evt, fn) {
    const off = this.on(evt, (...a) => {
      off();
      fn(...a);
    });
    return off;
  }
  off(evt, fn) {
    this.map.get(evt)?.delete(fn);
  }
  emit(evt, ...args) {
    const set = this.map.get(evt);
    if (set) for (const fn of [...set]) fn(...args);
  }
  clear() {
    this.map.clear();
  }
}
