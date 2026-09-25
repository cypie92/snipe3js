// Bolt-action rifle state: magazine, bolt cycle, reload. Stats come from upgrades.
import { Emitter } from '../core/Events.js';

export class Rifle extends Emitter {
  constructor(stats = {}) {
    super();
    this.apply(stats);
    this.ammo = this.magSize;
    this.reserve = Infinity;
    this.state = 'ready'; // ready | bolting | reloading
    this.timer = 0;
    this.stateTime = 0;
  }

  apply({ magSize = 5, reloadTime = 1.8, boltTime = 0.75 } = {}) {
    this.magSize = magSize;
    this.reloadTime = reloadTime;
    this.boltTime = boltTime;
    if (this.ammo > magSize) this.ammo = magSize;
  }

  reset(reserve = Infinity) {
    this.ammo = this.magSize;
    this.reserve = reserve;
    this.state = 'ready';
    this.timer = 0;
  }

  get canFire() {
    return this.state === 'ready' && this.ammo > 0;
  }

  /** 0..1 progress of the current bolt/reload action (for HUD). */
  get progress() {
    return this.stateTime > 0 ? 1 - this.timer / this.stateTime : 1;
  }

  fire() {
    if (!this.canFire) return false;
    this.ammo--;
    this.set('bolting', this.boltTime);
    this.emit('fire');
    return true;
  }

  reload() {
    if (this.state === 'reloading' || this.ammo >= this.magSize || this.reserve <= 0) return false;
    this.set('reloading', this.reloadTime);
    this.emit('reloadStart');
    return true;
  }

  set(state, time) {
    this.state = state;
    this.timer = time;
    this.stateTime = time;
  }

  update(dt) {
    if (this.state === 'ready') return;
    this.timer -= dt;
    if (this.timer > 0) return;
    if (this.state === 'bolting') {
      this.state = 'ready';
      this.emit('boltDone');
      if (this.ammo === 0) this.reload();
    } else if (this.state === 'reloading') {
      const need = this.magSize - this.ammo;
      const take = Math.min(need, this.reserve);
      this.ammo += take;
      if (this.reserve !== Infinity) this.reserve -= take;
      this.state = 'ready';
      this.emit('reloadDone');
    }
  }
}
