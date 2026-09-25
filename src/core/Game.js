// Game: owns every system, the state machine (title -> office -> level -> results) and the frame loop.
import * as THREE from 'three';
import { Renderer } from './Renderer.js';
import { CameraRig } from './CameraRig.js';
import { Input } from './Input.js';
import { Tweens } from './tween.js';
import { Emitter } from './Events.js';
import { LevelContext } from './LevelContext.js';
import { sound, loadAudio } from './sound.js';
import { Environment } from '../gfx/Environment.js';
import { materials } from '../gfx/materials.js';
import { applyWind, windUniforms } from '../gfx/wind.js';
import { Particles } from '../gfx/Particles.js';
import { Tracers } from '../gfx/Tracer.js';
import { Rifle } from '../gameplay/Rifle.js';
import { Shooting } from '../gameplay/Shooting.js';
import { Jobs } from '../gameplay/Jobs.js';
import { Scoring } from '../gameplay/Scoring.js';
import { Progression } from '../gameplay/Progression.js';
import { BulletCam } from '../gameplay/BulletCam.js';
import { Viewmodel } from '../gameplay/Viewmodel.js';
import { Hud } from '../ui/Hud.js';
import { Screens } from '../ui/Screens.js';
import { Popups } from '../ui/Popups.js';
import { LEVELS, getLevel, boardLevels } from '../levels/index.js';

const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3();
const _box = new THREE.Box3();

export class Game {
  constructor({ canvas, ui, params }) {
    this.params = params;
    this.canvas = canvas;
    this.progress = new Progression();
    this.renderer = new Renderer({ canvas, quality: this.resolveQuality() });
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 3500);
    this.scene.add(this.camera);
    this.env = new Environment(this.scene, this.renderer.renderer, { shadowMapSize: this.renderer.q.shadowMapSize });
    this.renderer.attach(this.scene, this.camera);
    this.renderer.renderer.info.autoReset = false;

    applyWind(materials.foliage);
    this.rig = new CameraRig(this.camera);
    this.input = new Input(canvas);
    this.tweens = new Tweens();
    this.events = new Emitter();
    this.fx = new Particles(this.scene);
    this.tracers = new Tracers(this.scene);
    this.rifle = new Rifle();
    this.jobs = new Jobs();
    this.scoring = new Scoring();
    this.shooting = new Shooting(this);
    this.viewmodel = new Viewmodel(this.camera);
    this.bulletCam = new BulletCam(this);

    this.hud = new Hud(this, ui);
    this.popups = new Popups(ui, this.camera);
    this.screenRoot = document.createElement('div');
    this.screenRoot.className = 'screens';
    this.screenRoot.style.cssText = 'position:absolute;inset:0;pointer-events:none';
    ui.appendChild(this.screenRoot);
    this.screens = new Screens(this, this.screenRoot);

    this.state = 'boot';
    this.level = null;
    this.raycastRoot = null;
    this.time = 0;
    this.timeScale = 1;
    this.frozen = false;
    this.paused = false;
    this.hintsLeft = 0;
    this.ready = false;
    this.fps = 60;
    this.lastNow = performance.now();
    this.orbitT = 0;

    this.applyUpgrades();
    this.applySettings();
    this.bindInput();
    this.bindJobs();
    this.rifle.on('fire', () => this.tweens.delay(0.22, () => sound.sfx('bolt')));
    this.rifle.on('reloadStart', () => sound.sfx('reload'));
    addEventListener('resize', () => this.resize());
    this.resize();
    this.renderer.renderer.setAnimationLoop((t) => this.frame(t));
  }

  // ---------------------------------------------------------------- setup
  resolveQuality() {
    const q = this.params.get('quality') || this.progress.data.settings.quality;
    if (q && q !== 'auto') return q;
    const mobile = matchMedia('(pointer: coarse)').matches;
    return mobile ? 'low' : 'high';
  }

  applyQuality() {
    const q = this.resolveQuality();
    if (q === this.renderer.quality) return;
    this.renderer.setQuality(q);
    const size = this.renderer.q.shadowMapSize;
    if (this.env.sun.shadow.mapSize.x !== size) {
      this.env.sun.shadow.mapSize.set(size, size);
      this.env.sun.shadow.map?.dispose();
      this.env.sun.shadow.map = null;
    }
    this.resize();
  }

  /** Auto mode only: step quality down if the frame rate stays low during play. */
  adaptQuality(realDt) {
    if (this.params.get('quality') || this.progress.data.settings.quality !== 'auto') return;
    if (this.state !== 'play' || this.paused) return;
    const a = (this.adapt ||= { t: 0, frames: 0, cooldown: 3 });
    a.cooldown -= realDt;
    if (a.cooldown > 0) return;
    a.t += realDt;
    a.frames++;
    if (a.t < 4) return;
    const fps = a.frames / a.t;
    a.t = 0;
    a.frames = 0;
    const order = ['high', 'medium', 'low'];
    const i = order.indexOf(this.renderer.quality);
    if (fps < 36 && i < 2) {
      this.renderer.setQuality(order[i + 1]);
      this.resize();
      a.cooldown = 5;
      this.hud.toast('Graphics adjusted', `Switched to ${order[i + 1]} quality for smoother play`);
    }
  }

  applyUpgrades() {
    const s = this.progress.rifleStats();
    this.rifle.apply(s);
    this.rig.zoomLevels = s.zoomLevels;
    this.rig.setZoomIndex(Math.min(this.rig.zoomIndex, s.zoomLevels.length - 1));
    this.rig.swayMul = s.swayMul;
    this.rig.breathMax = s.breathMax;
    this.maxHints = s.hints;
  }

  applySettings() {
    const st = this.progress.data.settings;
    this.rig.sensitivity = 0.0021 * st.sensitivity;
    sound.setVolumes({ master: st.volume, music: st.music });
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  bindInput() {
    const inp = this.input;
    inp.on('fire', () => {
      if (this.state === 'play' && !this.paused && !this.bulletCam.active) this.shooting.fire();
    });
    inp.on('scopeDown', () => {
      if (this.state !== 'play' || this.paused) return;
      this.scopeDownAt = performance.now();
      if (!this.rig.scoped) {
        this.setScope(true);
        this.scopeToggled = false;
      } else if (this.scopeToggled) {
        this.setScope(false);
        this.scopeToggled = false;
        this.ignoreScopeUp = true;
      }
    });
    inp.on('scopeUp', () => {
      if (this.ignoreScopeUp) {
        this.ignoreScopeUp = false;
        return;
      }
      if (!this.rig.scoped) return;
      if (performance.now() - (this.scopeDownAt || 0) < 250) this.scopeToggled = true;
      else this.setScope(false);
    });
    inp.on('zoom', (dir) => {
      if (this.state !== 'play' || this.paused) return;
      if (!this.rig.scoped) {
        if (dir > 0) {
          this.setScope(true);
          this.scopeToggled = true;
        }
        return;
      }
      if (dir < 0 && this.rig.zoomIndex === 0) {
        this.setScope(false);
        this.scopeToggled = false;
        return;
      }
      if (this.rig.cycleZoom(dir)) sound.sfx('zoom');
    });
    inp.on('key', (code) => {
      if (this.state === 'play') {
        if (code === 'KeyR' && this.rifle.reload()) sound.sfx('reload');
        if (code === 'Tab' || code === 'KeyJ') this.hud.toggleClipboard();
        if (code === 'KeyH') this.useHint();
        if (code === 'Space' && !this.paused && !this.bulletCam.active) this.shooting.fire();
        if (code === 'KeyQ' || code === 'KeyE') {
          this.setScope(!this.rig.scoped);
          this.scopeToggled = this.rig.scoped;
        }
        const m = code.match(/^Digit([1-4])$/);
        if (m && Number(m[1]) <= this.rig.zoomLevels.length) {
          this.rig.setZoomIndex(Number(m[1]) - 1);
          if (!this.rig.scoped) {
            this.setScope(true);
            this.scopeToggled = true;
          } else sound.sfx('zoom');
        }
        if (code === 'Escape' || code === 'KeyP') {
          if (this.paused) this.resume();
          else if (!this.input.locked) this.pause();
        }
      }
      if (code === 'ShiftLeft' || code === 'ShiftRight') {
        if (this.rig.setHoldBreath(true)) sound.sfx('breathIn');
      }
    });
    inp.on('keyup', (code) => {
      if ((code === 'ShiftLeft' || code === 'ShiftRight') && this.rig.holding) {
        this.rig.setHoldBreath(false);
        sound.sfx('breathOut');
      }
    });
    inp.on('unlock', () => {
      if (this.state === 'play' && !this.paused && !this.bulletCam.active) this.pause();
    });
  }

  setScope(on) {
    if (on === this.rig.scoped) return;
    this.rig.setScoped(on);
    sound.sfx(on ? 'scopeIn' : 'scopeOut');
    if (!on && this.rig.holding) this.rig.setHoldBreath(false);
  }

  bindJobs() {
    const j = this.jobs;
    j.on('complete', (job, silent) => {
      if (silent) {
        this.hud.renderJobs(job.id);
        return;
      }
      this.scoring.addCoins(job.reward, job.title);
      const p = this.jobPosition(job);
      this.popups.text(p, `+${job.reward}`, { cls: 'pop-coins' });
      this.fx.burst('confetti', p, UP, { scale: 0.6 });
      this.fx.burst('stars', p, UP, { scale: 0.8 });
      this.hud.toast(job.bonus ? 'SECRET JOB!' : 'JOB DONE!', job.title, job.bonus ? 'gold' : 'good');
      this.hud.flash('good');
      this.hud.renderJobs(job.id);
      sound.sfx('jobDone');
      this.tweens.delay(0.35, () => sound.sfx('cash'));
    });
    j.on('fail', (job) => {
      this.hud.toast('JOB FAILED', job.title, 'bad');
      this.hud.flash('bad');
      this.hud.renderJobs(job.id);
      sound.sfx('fail');
    });
    j.on('progress', (job) => this.hud.renderJobs(job.id));
    j.on('allResolved', () => this.finishLevel());
  }

  // ---------------------------------------------------------------- flow
  async boot() {
    await loadAudio();
    this.applySettings();
    const direct = this.params.get('level');
    if (direct && getLevel(direct)) {
      await this.startLevel(direct, { skipIntro: this.params.get('skipIntro') === '1' });
    } else {
      await this.loadLevel(LEVELS[0].id);
      const screen = this.params.get('screen');
      if (screen === 'office') this.showOffice();
      else this.showTitle();
    }
    this.markReady();
  }

  markReady() {
    if (this.ready) return;
    this.ready = true;
    document.getElementById('loading')?.remove();
    console.log('[game] ready');
  }

  showTitle() {
    this.state = 'title';
    this.hud.show(false);
    this.input.active = false;
    this.screens.title(() => {
      sound.unlock();
      sound.sfx('uiClick');
      this.showOffice();
    });
    sound.music('menu');
  }

  showOffice() {
    this.state = 'office';
    this.paused = false;
    this.hud.show(false);
    this.input.active = false;
    this.input.exitLock();
    this.rig.setScoped(false);
    this.screens.office(boardLevels(), {
      onPlay: (id) => {
        sound.unlock();
        this.startLevel(id);
      },
      onWorkshop: () => this.screens.workshop(() => this.showOffice()),
      onSettings: () => this.screens.settings(() => this.showOffice()),
    });
    sound.music('menu');
    sound.ambience(null);
  }

  disposeLevel() {
    if (!this.level) return;
    this.scene.remove(this.level.ctx.root);
    this.level.ctx.root.traverse((o) => {
      if (o.isMesh && o.geometry && !o.geometry.userData?.shared) o.geometry.dispose();
    });
    this.level = null;
    this.raycastRoot = null;
  }

  async loadLevel(id) {
    const def = getLevel(id);
    this.disposeLevel();
    this.jobs.reset();
    this.bindJobs();
    this.tweens.clear();
    this.fx.clear();
    this.tracers.clear();
    this.popups.clear();
    this.bulletCam.stop();
    this.scoring.reset(def.parTime);
    const ctx = new LevelContext(this, def);
    const out = (await def.build(ctx)) || {};
    this.scene.add(ctx.root);
    this.raycastRoot = ctx.root;
    this.env.apply(def.preset || 'morning');
    this.env.setShadowFocus(out.shadowCenter || new THREE.Vector3(0, 0, -5), out.shadowRadius || 95);
    const perch = out.perch || { position: new THREE.Vector3(0, 12, 70), yaw: 0, pitch: -0.12 };
    this.rig.setPerch(perch);
    this.level = { def, ctx, perch, out };
    this.scoring.spannersTotal = ctx.collectibles.length;
    this.renderer.renderer.compile(this.scene, this.camera);
    return this.level;
  }

  async startLevel(id, { skipIntro = false } = {}) {
    this.screens.clear();
    this.state = 'loading';
    this.input.active = false;
    await this.loadLevel(id);
    const def = this.level.def;
    this.rifle.reset();
    this.hintsLeft = this.maxHints;
    this.rig.setScoped(false);
    this.rig.scopeT = 0;
    this.rig.fovNow = this.rig.baseFov;
    this.hud.setup(this.level);
    this.markReady();
    sound.ambience(def.ambience || 'village');
    sound.music('level');
    if (!skipIntro) await this.playIntro();
    this.state = 'play';
    this.hud.show(true);
    this.input.active = true;
    this.events.emit('levelStart', this.level);
  }

  /** Camera swoops in from the sky to the perch while the title card shows. */
  playIntro() {
    const def = this.level.def;
    const perch = this.level.perch;
    this.state = 'intro';
    this.hud.show(false);
    this.screens.intro(def);
    const o = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), fov: 50 };
    this.rig.override = o;
    const end = perch.position.clone();
    const endQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(perch.pitch ?? -0.12, perch.yaw ?? 0, 0, 'YXZ'));
    const center = this.level.out.shadowCenter || new THREE.Vector3(0, 0, -5);
    const m = new THREE.Matrix4();
    const dur = 4.2;
    sound.sfx('whoosh');
    return new Promise((resolve) => {
      this.tweens.run(dur, (k) => {
        const e = THREE.MathUtils.smootherstep(k, 0, 1);
        const a = (1 - e) * 1.6 + (perch.yaw ?? 0);
        const r = THREE.MathUtils.lerp(120, end.distanceTo(center), e);
        const start = new THREE.Vector3(center.x + Math.sin(a) * r, THREE.MathUtils.lerp(75, end.y, e), center.z + Math.cos(a) * r);
        o.position.copy(start).lerp(end, THREE.MathUtils.smoothstep(k, 0.55, 1));
        m.lookAt(o.position, center, UP);
        const q = new THREE.Quaternion().setFromRotationMatrix(m);
        o.quaternion.copy(q).slerp(endQ, THREE.MathUtils.smoothstep(k, 0.6, 1));
        o.fov = THREE.MathUtils.lerp(50, this.rig.baseFov, e);
      }, {
        onComplete: () => {
          this.rig.override = null;
          resolve();
        },
      });
    });
  }

  pause() {
    if (this.paused || this.state !== 'play') return;
    this.paused = true;
    this.input.exitLock();
    this.rig.setScoped(false);
    this.screens.pause({
      onResume: () => this.resume(),
      onRestart: () => {
        this.paused = false;
        this.startLevel(this.level.def.id, { skipIntro: true });
      },
      onQuit: () => this.showOffice(),
    });
    sound.duck(0.6, 100);
  }

  resume() {
    this.paused = false;
    this.screens.clear();
    this.input.requestLock();
    sound.duck(0, 0.1);
  }

  finishLevel() {
    if (this.state !== 'play') return;
    this.state = 'outro';
    this.input.active = false;
    const wait = () => (this.bulletCam.active ? this.tweens.delay(0.2, wait) : this.tweens.delay(1.4, () => this.showResults()));
    this.hud.toast('ALL JOBS DONE!', 'Shift complete', 'big gold');
    this.tweens.delay(0.4, wait);
  }

  showResults() {
    const def = this.level.def;
    this.state = 'results';
    this.input.active = false;
    this.input.exitLock();
    this.rig.setScoped(false);
    this.hud.show(false);
    const counts = this.jobs.counts();
    const summary = this.scoring.summary(counts);
    this.progress.addCoins(summary.total);
    const { newBest } = this.progress.recordLevel(def.id, {
      grade: summary.grade, time: this.scoring.time, stars: summary.stars,
      spanners: this.level.ctx.collectibles.filter((c) => c.userData.collected).map((c) => c.userData.hit?.id || c.name),
    });
    sound.music('results');
    const idx = boardLevels().findIndex((l) => l.id === def.id);
    const next = boardLevels()[idx + 1];
    const canNext = next && this.progress.stars >= (next.unlockStars || 0);
    this.screens.results({
      def, summary, counts, time: this.scoring.time, badHits: this.scoring.badHits,
      accuracy: this.scoring.accuracy(), spanners: this.scoring.spanners, spannersTotal: this.scoring.spannersTotal, newBest,
    }, {
      onOffice: () => this.showOffice(),
      onRetry: () => this.startLevel(def.id, { skipIntro: true }),
      onNext: canNext ? () => this.startLevel(next.id) : null,
    });
  }

  // ---------------------------------------------------------------- gameplay helpers
  jobPosition(job) {
    const f = job.focus || job.targets[0];
    if (!f) return new THREE.Vector3();
    if (f.isVector3) return f.clone();
    _box.setFromObject(f);
    if (_box.isEmpty()) return f.getWorldPosition(new THREE.Vector3());
    return _box.getCenter(new THREE.Vector3());
  }

  useHint() {
    if (this.hintsLeft <= 0) {
      this.hud.toast('No hints left', 'Upgrade Binocular Tips in the Workshop');
      return;
    }
    const open = this.jobs.main.filter((j) => j.state === 'open' && !this.jobs.isLocked(j));
    if (!open.length) return;
    const job = open.find((j) => !j.hinted) || open[0];
    job.hinted = true;
    this.hintsLeft--;
    this.scoring.hintsUsed++;
    this.hud.showHint(job, this.jobPosition(job));
    this.hud.toast('HINT', job.title);
    sound.sfx('whistle');
  }

  collect(obj, spec) {
    if (obj.userData.collected) return;
    obj.userData.collected = true;
    delete obj.userData.hit;
    this.scoring.spanners++;
    const p = obj.getWorldPosition(new THREE.Vector3());
    this.fx.burst('stars', p, UP, { scale: 1.3 });
    this.popups.text(p, 'GOLDEN SPANNER!', { cls: 'pop-big' });
    this.hud.toast('GOLDEN SPANNER!', `${this.scoring.spanners} of ${this.scoring.spannersTotal} found`, 'gold');
    this.hud.renderSpanners();
    sound.sfx('collect');
    spec.onCollect?.(obj);
    const s0 = obj.scale.x;
    this.tweens.run(0.6, (k) => {
      obj.scale.setScalar(s0 * (1 + Math.sin(k * Math.PI) * 0.8) * (1 - k * k));
      obj.position.y += 0.02;
      obj.rotation.y += 0.3;
    }, { onComplete: () => (obj.visible = false) });
  }

  // ---------------------------------------------------------------- loop
  frame(now) {
    const realDt = Math.min(0.05, Math.max(0, (now - this.lastNow) / 1000));
    this.lastNow = now;
    if (realDt > 0) this.fps += (1 / realDt - this.fps) * 0.05;
    this.adaptQuality(realDt);

    let dt = this.paused || this.frozen ? 0 : realDt * this.timeScale;
    if (this.bulletCam.active) dt *= 0.12;

    const { dx, dy } = this.input.consume();
    if (this.state === 'play' && !this.paused && !this.bulletCam.active) {
      const inv = this.progress.data.settings.invertY ? -1 : 1;
      this.rig.look(dx, dy * inv);
      this.viewmodel.sway(dx, dy);
    }
    if (this.state === 'title' || this.state === 'office') this.orbitCamera(realDt);
    else if (this.rig.override && this.state !== 'intro' && !this.bulletCam.active) this.rig.override = null;

    this.rig.update(dt, this.frozen ? 0 : realDt);
    if (dt > 0) {
      this.time += dt;
      this.rifle.update(dt);
      this.tweens.update(dt);
      this.level?.ctx.update(dt, this.time);
      if (this.state === 'play') this.scoring.time += dt;
    }
    this.bulletCam.update(this.frozen ? 0 : realDt);
    windUniforms.uTime.value = this.time;
    this.fx.update(dt);
    this.tracers.update(dt, this.camera);
    this.env.update(dt, this.camera);
    this.viewmodel.update(this.frozen ? 0 : realDt, this.rig, this.rifle);
    this.hud.update(realDt);
    this.popups.update(realDt);
    this.renderer.setScope(this.rig.scopeT, this.hud.range);
    sound.update();
    this.renderer.renderer.info.reset();
    this.renderer.render(realDt);
  }

  orbitCamera(dt) {
    this.orbitT += dt;
    const c = this.level?.out.shadowCenter || new THREE.Vector3(0, 0, -5);
    const a = this.orbitT * 0.05 + 0.6;
    const o = this.rig.override || (this.rig.override = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), fov: 45 });
    o.position.set(c.x + Math.sin(a) * 105, 48, c.z + Math.cos(a) * 105);
    const m = new THREE.Matrix4().lookAt(o.position, _v.copy(c).setY(4), UP);
    o.quaternion.setFromRotationMatrix(m);
    o.fov = 45;
  }
}
