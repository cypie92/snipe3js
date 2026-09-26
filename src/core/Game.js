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
import { createPerch } from '../world/perch/index.js';
import { Office } from '../hub/Office.js';

const UP = new THREE.Vector3(0, 1, 0);
const nextFrames = (n = 1) => new Promise((r) => {
  const f = () => (--n <= 0 ? r() : requestAnimationFrame(f));
  requestAnimationFrame(f);
});
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
    // Jack's van + crow's nest: parked at each level's perch (never hittable).
    this.perch = createPerch({ seed: 1 });
    this.scene.add(this.perch.root);

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

  /** First-shift coach marks: scope -> zoom/steady -> fix something. Non-blocking. */
  tickTutorial(dt) {
    const tu = this.tutorial;
    tu.t += dt;
    const steps = [
      { text: 'Right-click (or Q) to look through your scope', done: () => this.rig.scoped },
      { text: 'Scroll to zoom · hold <b>Shift</b> to steady your aim', done: () => tu.t > 6 || this.rig.zoomIndex !== tu.zoom0 || this.rig.holding },
      { text: 'Spot a problem from the clipboard, then <b>left-click</b> to fix it!', done: () => this.jobs.counts().done > 0 || tu.t > 25 },
    ];
    if (tu.step >= steps.length) {
      this.hud.coach(null);
      this.tutorial = null;
      this.progress.data.seenTutorial = true;
      this.progress.save();
      return;
    }
    const s = steps[tu.step];
    if (tu.shown !== tu.step) {
      tu.shown = tu.step;
      tu.t = 0;
      tu.zoom0 = this.rig.zoomIndex;
      this.hud.coach(s.text, tu.step + 1, steps.length);
    }
    if (tu.t > 0.6 && s.done()) {
      tu.step++;
      sound.sfx('ding');
    }
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
        if ((code === 'Enter' || code === 'NumpadEnter') && this.shiftDone) this.clockOff();
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
      this.hitStop(0.085);
      this.rig.shake(0.25);
      this.hud.flash('good');
      this.hud.renderJobs(job.id);
      if (job.bonus) this.tweens.delay(0.8, () => this.checkHuntDone());
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
    sound.setListener(this.camera);
    this.applySettings();
    document.addEventListener('visibilitychange', () => (document.hidden ? sound.suspend() : sound.resume()));
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
    this.office?.exit();
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

  officeLevels() {
    return boardLevels().map((l) => ({ id: l.id, name: l.name, location: l.location, unlockStars: l.unlockStars || 0, parTime: l.parTime }));
  }

  /** The 3D office hub: menus are navigated by shooting suction darts at things. */
  showOffice() {
    this.state = 'office';
    this.paused = false;
    this.hud.show(false);
    this.input.active = false;
    this.input.exitLock();
    this.rig.setScoped(false);
    this.screens.clear();
    this.office ??= new Office({
      scene: this.scene, camera: this.camera, canvas: this.canvas, env: this.env, sound,
      ui: this.screenRoot.parentElement, progress: this.progress, levels: this.officeLevels(),
      radioOn: this.progress.data.settings.music > 0, onAction: (a) => this.onOfficeAction(a),
    });
    this.office.refresh({ levels: this.officeLevels(), progress: this.progress });
    sound.stopLoops(0.4);
    this.office.enter();
    this.office.setInteractive(true);
    this.rig.override = this.office.view;
    sound.music(this.office.radioOn ? 'menu' : null);
    sound.ambience('office');
  }

  onOfficeAction(a) {
    if (a.type === 'play') {
      sound.unlock();
      this.office.exit();
      this.startLevel(a.id);
    } else if (a.type === 'workshop') {
      this.office.setInteractive(false);
      this.screens.workshop(() => {
        this.screens.clear();
        this.office.refresh();
        this.office.setInteractive(true);
      });
    } else if (a.type === 'settings') {
      this.office.setInteractive(false);
      this.screens.settings(() => {
        this.screens.clear();
        this.office.setInteractive(true);
      });
    } else if (a.type === 'radio') {
      sound.music(a.on ? 'menu' : null);
    }
  }

  disposeLevel() {
    sound.stopLoops(0.2);
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
    const groundY = perch.groundY ?? perch.position.y - 12;
    const eyeHeight = perch.position.y - groundY;
    if (Math.abs(eyeHeight - this.perch.eyeHeight) > 1e-3) {
      // rebuild so the crow's nest puts the eye exactly at this level's perch height
      this.scene.remove(this.perch.root);
      this.perch = createPerch({ seed: 1, eyeHeight });
      this.scene.add(this.perch.root);
    }
    this.perch.root.position.set(perch.position.x, groundY, perch.position.z);
    this.perch.root.rotation.y = perch.yaw ?? 0;
    this.perch.setRaise(1);
    this.level = { def, ctx, perch, out, pristine: true };
    this.scoring.spannersTotal = ctx.collectibles.length;
    this.renderer.renderer.compile(this.scene, this.camera);
    return this.level;
  }

  async startLevel(id, { skipIntro = false } = {}) {
    this.office?.exit();
    this.screens.clear();
    this.state = 'loading';
    this.input.active = false;
    // The title/office backdrop already built this level: reuse it instead of a ~5 s rebuild.
    const reuse = this.level?.def.id === id && this.level.pristine;
    if (!reuse) {
      this.screens.loading(getLevel(id));
      await nextFrames(2); // let the card paint before the heavy synchronous build
      await this.loadLevel(id);
      this.screens.clear();
    }
    this.level.pristine = false;
    const def = this.level.def;
    this.scoring.reset(def.parTime);
    this.scoring.spannersTotal = this.level.ctx.collectibles.length;
    this.rifle.reset();
    this.shiftDone = false;
    this.hud.showClockOff(false);
    this.hintsLeft = this.maxHints;
    this.hintFocus = null;
    this.rig.setScoped(false);
    this.rig.scopeT = 0;
    this.rig.fovNow = this.rig.baseFov;
    this.hud.setup(this.level);
    this.markReady();
    sound.ambience(def.ambience || 'village');
    sound.music('level');
    if (!skipIntro) {
      await this.playIntro();
      await this.briefing();
    } else {
      this.hud.setClipMode('compact');
    }
    this.state = 'play';
    this.hud.show(true);
    this.input.active = true;
    if (!this.progress.data.seenTutorial && !skipIntro) this.tutorial = { step: 0, t: 0 };
    this.events.emit('levelStart', this.level);
  }

  /** After the swoop: the clipboard sits centre-stage so the clues get read. Click starts the shift. */
  briefing() {
    this.state = 'briefing';
    this.hud.show(true);
    this.hud.setBriefing(true);
    return new Promise((resolve) => {
      const go = (e) => {
        if (e.type === 'keydown' && !['Enter', 'NumpadEnter', 'Space'].includes(e.code)) return;
        if (e.type === 'mousedown' && e.button !== 0) return;
        this.canvas.removeEventListener('mousedown', go);
        this.hud.briefBtn.removeEventListener('click', go);
        removeEventListener('keydown', go);
        this.hud.setBriefing(false);
        this.input.requestLock(); // inside the user gesture
        sound.unlock();
        sound.sfx('uiClick');
        resolve();
      };
      this.canvas.addEventListener('mousedown', go);
      this.hud.briefBtn.addEventListener('click', go);
      addEventListener('keydown', go);
    });
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
    const shot = { radius: 120, height: 75, arc: 1.6, ...(this.level.out.intro || {}) };
    sound.sfx('whoosh');
    return new Promise((resolve) => {
      this.tweens.run(dur, (k) => {
        const e = THREE.MathUtils.smootherstep(k, 0, 1);
        const a = (1 - e) * shot.arc + (perch.yaw ?? 0);
        const r = THREE.MathUtils.lerp(shot.radius, end.distanceTo(center), e);
        const start = new THREE.Vector3(center.x + Math.sin(a) * r, THREE.MathUtils.lerp(shot.height, end.y, e), center.z + Math.cos(a) * r);
        o.position.copy(start).lerp(end, THREE.MathUtils.smoothstep(k, 0.55, 1));
        m.lookAt(o.position, center, UP);
        const q = new THREE.Quaternion().setFromRotationMatrix(m);
        o.quaternion.copy(q).slerp(endQ, THREE.MathUtils.smoothstep(k, 0.6, 1));
        o.fov = THREE.MathUtils.lerp(50, this.rig.baseFov, e);
        // the crow's nest telescopes up while the camera swoops in (done before we arrive)
        this.perch.setRaise(THREE.MathUtils.smoothstep(k, 0.15, 0.7));
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

  hitStop(seconds) {
    this.hitStopT = Math.max(this.hitStopT || 0, seconds);
  }

  /** All main jobs resolved: stop the par clock. If secrets/spanners remain, let the player
   *  keep hunting and clock off when they like; otherwise go straight to the report. */
  finishLevel() {
    if (this.state !== 'play' || this.shiftDone) return;
    this.shiftDone = true;
    this.scoring.finishTime = this.scoring.time;
    this.hud.toast('ALL JOBS DONE!', 'Shift complete', 'big gold');
    this.tweens.delay(0.5, () => {
      sound.sfx('crowdCheer');
      sound.sfx('jobDone', { pitch: 1.25 });
    });
    if (this.secretsRemaining() > 0) {
      this.tweens.delay(2.2, () => this.state === 'play' && this.hud.showClockOff(true, this.secretsRemaining()));
    } else {
      this.clockOff(1.4);
    }
  }

  secretsRemaining() {
    const ctx = this.level?.ctx;
    if (!ctx) return 0;
    const spanners = ctx.collectibles.filter((c) => !c.userData.collected).length;
    const secrets = this.jobs.list.filter((j) => j.bonus && j.state === 'open').length;
    return spanners + secrets;
  }

  /** End the shift and show the report (after the bullet-cam if one is playing). */
  clockOff(delay = 0.6) {
    if (this.state !== 'play') return;
    this.state = 'outro';
    this.input.active = false;
    this.hud.showClockOff(false);
    const wait = () => (this.bulletCam.active ? this.tweens.delay(0.2, wait) : this.tweens.delay(delay, () => this.showResults()));
    this.tweens.delay(0.4, wait);
  }

  /** During the post-shift hunt, finding the last secret clocks off automatically. */
  checkHuntDone() {
    if (!this.shiftDone || this.state !== 'play') return;
    const left = this.secretsRemaining();
    if (left === 0) {
      this.hud.toast('EVERYTHING FOUND!', 'Clocking off…', 'gold');
      this.clockOff(2.0);
    } else this.hud.showClockOff(true, left);
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
      grade: summary.grade, time: this.scoring.shiftTime, stars: summary.stars,
      spanners: this.level.ctx.collectibles.filter((c) => c.userData.collected).map((c) => c.userData.collectedId || c.name),
    });
    sound.music('results');
    const idx = boardLevels().findIndex((l) => l.id === def.id);
    const next = boardLevels()[idx + 1];
    const canNext = next && this.progress.stars >= (next.unlockStars || 0);
    this.screens.results({
      def, summary, counts, time: this.scoring.shiftTime, badHits: this.scoring.badHits,
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

  /** H = a spoken nudge for the next unsolved job (free); H again while it shows = a marker (costs a hint). */
  useHint() {
    const open = this.jobs.main.filter((j) => j.state === 'open' && !this.jobs.isLocked(j));
    if (!open.length) return;
    const f = this.hintFocus;
    const recent = f && f.job.state === 'open' && performance.now() - f.at < 10000;
    if (recent && (f.job.hintTier || 0) === 1) {
      this.markHint(f.job);
      return;
    }
    const job = open.find((j) => !j.hintTier && j.hint) || open.find((j) => (j.hintTier || 0) < 2) || open[0];
    if (job.hint && !job.hintTier) {
      job.hintTier = 1;
      this.hintFocus = { job, at: performance.now() };
      this.scoring.hintsUsed++;
      this.hud.radio(job.title, job.hint);
      sound.sfx('whistle');
      return;
    }
    this.markHint(job);
  }

  markHint(job) {
    if (this.hintsLeft <= 0) {
      this.hud.toast('No markers left', 'Upgrade Binocular Tips in the Workshop');
      return;
    }
    job.hintTier = 2;
    job.hinted = true;
    this.hintsLeft--;
    this.scoring.hintsUsed++;
    this.hintFocus = null;
    this.hud.showHint(job, this.jobPosition(job));
    this.hud.toast('MARKED', job.title);
    sound.sfx('ding');
  }

  collect(obj, spec) {
    if (obj.userData.collected) return;
    obj.userData.collected = true;
    obj.userData.collectedId = spec.id;
    delete obj.userData.hit;
    this.scoring.spanners++;
    const p = obj.getWorldPosition(new THREE.Vector3());
    this.fx.burst('stars', p, UP, { scale: 1.3 });
    this.popups.text(p, 'GOLDEN SPANNER!', { cls: 'pop-big' });
    this.hud.toast('GOLDEN SPANNER!', `${this.scoring.spanners} of ${this.scoring.spannersTotal} found`, 'gold');
    this.hud.renderSpanners();
    sound.sfx('collect');
    spec.onCollect?.(obj);
    this.tweens.delay(0.8, () => this.checkHuntDone());
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
    if (this.hitStopT > 0) {
      this.hitStopT -= realDt;
      dt *= 0.04; // a beat of near-freeze sells the impact
    }
    if (this.bulletCam.active) dt *= 0.12;

    const { dx, dy } = this.input.consume();
    if (this.state === 'play' && !this.paused && !this.bulletCam.active) {
      const inv = this.progress.data.settings.invertY ? -1 : 1;
      this.rig.look(dx, dy * inv);
      this.viewmodel.sway(dx, dy);
    }
    if (this.state === 'office' && this.office) {
      this.office.update(realDt, this.time);
      // a dart may have just started a level inside update(): only keep the office camera if we're still here
      if (this.state === 'office') this.rig.override = this.office.view;
    } else if (this.state === 'title' || this.state === 'results') this.orbitCamera(realDt);
    else if (this.rig.override && this.state !== 'intro' && !this.bulletCam.active) this.rig.override = null;

    this.rig.update(dt, this.frozen ? 0 : realDt);
    if (dt > 0) {
      this.time += dt;
      this.rifle.update(dt);
      this.tweens.update(dt);
      if (this.state !== 'office') this.level?.ctx.update(dt, this.time);
      if (this.state === 'play') this.scoring.time += dt;
    }
    this.bulletCam.update(this.frozen ? 0 : realDt);
    windUniforms.uTime.value = this.time;
    this.perch.update(dt, this.time);
    this.fx.update(dt);
    this.tracers.update(dt, this.camera);
    this.env.update(dt, this.camera);
    this.viewmodel.enabled = this.state === 'play' || this.state === 'outro';
    this.viewmodel.update(this.frozen ? 0 : realDt, this.rig, this.rifle);
    this.hud.update(realDt);
    this.popups.update(realDt);
    this.renderer.setScope(this.rig.scopeT, this.hud.range);
    // hold-breath: muffled mix + heartbeat loop (the audio engine owns both)
    const holding = this.rig.holding && this.state === 'play';
    if (holding !== this.wasHolding) {
      this.wasHolding = holding;
      sound.holdBreath(holding);
    }
    if (this.tutorial && this.state === 'play' && !this.paused) this.tickTutorial(realDt);
    this.popups.scope = { on: this.rig.scopeT > 0.5, R: this.hud.R || 0 };
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
