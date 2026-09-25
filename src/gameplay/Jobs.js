// Job (contract) registry and state machine for a level.
import { Emitter } from '../core/Events.js';

let uid = 0;

export class Jobs extends Emitter {
  constructor() {
    super();
    this.list = [];
    this.byId = new Map();
  }

  reset() {
    this.list = [];
    this.byId.clear();
    this.clear();
  }

  /**
   * def: { id, title, clue, hint, reward=40, targets=[], failTargets=[], needed=1, requires=[],
   *        bonus=false, onHit(hit, target, job) -> 'complete'|'fail'|'progress'|'ignore'|undefined,
   *        onComplete(job), onFail(job), focus: Object3D|Vector3 (where hints point) }
   */
  add(def) {
    const job = {
      id: def.id || `job${++uid}`,
      title: def.title || 'Odd job',
      clue: def.clue || '',
      hint: def.hint || '',
      reward: def.reward ?? 40,
      targets: [].concat(def.targets || []).filter(Boolean),
      failTargets: [].concat(def.failTargets || []).filter(Boolean),
      needed: def.needed || 1,
      progress: 0,
      requires: [].concat(def.requires || []),
      bonus: !!def.bonus,
      state: 'open',
      onHit: def.onHit,
      onComplete: def.onComplete,
      onFail: def.onFail,
      focus: def.focus || null,
      hinted: false,
      doneAt: 0,
    };
    for (const t of job.targets) t.userData.hit = { kind: 'job', job };
    for (const t of job.failTargets) t.userData.hit = { kind: 'fail', job };
    this.list.push(job);
    this.byId.set(job.id, job);
    return job;
  }

  get(id) {
    return this.byId.get(id);
  }

  get main() {
    return this.list.filter((j) => !j.bonus);
  }

  isLocked(job) {
    return job.requires.some((id) => this.byId.get(id)?.state !== 'done');
  }

  /** Called by Shooting when a job target (or fail target) is hit. Returns the outcome string. */
  hit(job, target, hit, isFailTarget = false) {
    if (job.state !== 'open') return 'already';
    if (this.isLocked(job)) return 'locked';
    let result;
    if (isFailTarget) result = 'fail';
    else result = job.onHit ? job.onHit(hit, target, job) : 'complete';
    if (result === undefined) result = 'complete';
    if (result === 'progress') {
      job.progress++;
      this.emit('progress', job);
      if (job.progress >= job.needed) result = 'complete';
    }
    if (result === 'complete') this.complete(job);
    else if (result === 'fail') this.fail(job);
    return result;
  }

  /** Would this shot finish the level? (used to trigger the bullet-cam before resolving) */
  wouldFinish(job) {
    if (!job || job.state !== 'open' || job.bonus || this.isLocked(job)) return false;
    if (job.needed - job.progress > 1) return false;
    return this.main.filter((j) => j.state === 'open').length === 1;
  }

  complete(job, silent = false) {
    if (job.state !== 'open') return;
    job.state = 'done';
    job.progress = job.needed;
    job.onComplete?.(job);
    this.emit('complete', job, silent);
    this.checkAll();
  }

  fail(job) {
    if (job.state !== 'open') return;
    job.state = 'failed';
    job.onFail?.(job);
    this.emit('fail', job);
    this.checkAll();
  }

  checkAll() {
    const main = this.main;
    if (main.length && main.every((j) => j.state !== 'open')) this.emit('allResolved');
  }

  counts() {
    const main = this.main;
    return {
      total: main.length,
      done: main.filter((j) => j.state === 'done').length,
      failed: main.filter((j) => j.state === 'failed').length,
      bonusTotal: this.list.length - main.length,
      bonusDone: this.list.filter((j) => j.bonus && j.state === 'done').length,
    };
  }
}
