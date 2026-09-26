// In-game HUD: crosshair, scope overlay, clipboard, timer/par, coins, spanners, ammo, toasts, hints.
import * as THREE from 'three';

const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};
const fmt = (s) => {
  s = Math.max(0, Math.floor(s));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
const _v = new THREE.Vector3();

export class Hud {
  constructor(game, root) {
    this.game = game;
    this.root = el('div', 'hud hidden');
    root.appendChild(this.root);

    this.cross = el('div', 'crosshair', '<i></i>');
    this.scope = el('div', 'scope');
    this.mask = el('canvas', 'mask');
    this.reticle = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.reticle.setAttribute('viewBox', '-100 -100 200 200');
    this.reticle.innerHTML = RETICLE;
    this.zoomBadge = el('div', 'badge zoom', '4×');
    this.rangeBadge = el('div', 'badge range', '— m');
    this.breath = el('div', 'breath', '<b></b>');
    this.breathLabel = el('div', 'breath-label', 'SHIFT · steady');
    this.scope.append(this.mask, this.reticle, this.zoomBadge, this.rangeBadge, this.breath, this.breathLabel);

    this.clip = el('div', 'clipboard', `<div class="board"><div class="clip"></div><div class="paper">
      <h3 class="loc">Today's Jobs</h3><div class="sub">Odd jobs &amp; long shots</div><ul class="jobs"></ul>
      <div class="brief-go"><button class="btn">Start the shift ▶</button><span>or click anywhere · clues stay on the clipboard (Tab)</span></div></div></div>
      <div class="tab-hint">TAB · clues / hide</div>`);
    this.jobsEl = this.clip.querySelector('.jobs');
    this.briefBtn = this.clip.querySelector('.brief-go .btn');
    this.briefDim = el('div', 'brief-dim hidden');
    this.radioEl = el('div', 'radio hidden', '<div class="r-head">📻 Jack\'s radio</div><div class="r-title"></div><div class="r-text"></div><div class="r-foot">Press <b>H</b> again to mark it on screen</div>');
    this.coachEl = el('div', 'coach hidden', '<span class="c-step"></span><span class="c-text"></span>');

    this.top = el('div', 'topbar', `<div class="chip timer"><small>TIME</small><span class="t">00:00</span></div>
      <div class="chip par"><small>PAR</small><span class="p">03:00</span></div>`);
    this.timerChip = this.top.querySelector('.timer');
    this.timerText = this.top.querySelector('.t');
    this.parText = this.top.querySelector('.p');

    this.tr = el('div', 'corner-tr', `<div class="chip coins"><span class="coin"></span><span class="c">0</span></div>
      <div class="spanners"></div><div class="chip hints"><small>HINTS · H</small><span class="h">2</span></div>`);
    this.coinText = this.tr.querySelector('.c');
    this.spannersEl = this.tr.querySelector('.spanners');
    this.hintText = this.tr.querySelector('.h');

    this.ammo = el('div', 'ammo', `<div class="label">R · reload</div><div class="rounds"></div><div class="reloadbar"><b></b></div>`);
    this.roundsEl = this.ammo.querySelector('.rounds');
    this.reloadBar = this.ammo.querySelector('.reloadbar');
    this.reloadFill = this.reloadBar.querySelector('b');

    this.help = el('div', 'help', `<div><kbd>Mouse</kbd>look <kbd>LMB</kbd>shoot <kbd>RMB</kbd>scope <kbd>Wheel</kbd>zoom</div>
      <div><kbd>Shift</kbd>steady aim <kbd>R</kbd>reload <kbd>H</kbd>hint <kbd>Tab</kbd>jobs <kbd>Esc</kbd>pause</div>`);
    this.prompt = el('div', 'prompt hidden', 'Click to aim');
    this.toasts = el('div', 'toasts');
    this.flashEl = el('div', 'flash');
    this.hintMarker = el('div', 'hint-marker hidden');
    this.hintArrow = el('div', 'hint-arrow hidden');
    this.bars = el('div', 'bars', '<div class="slowmo">SLOW-MO</div>');
    this.clockOffEl = el('div', 'clockoff hidden', `<div class="co-title">Shift done! <span class="co-left"></span></div>
      <div class="co-sub">Keep hunting for secrets &amp; Golden Spanners, or</div>
      <button class="btn co-btn">Clock off <kbd>ENTER</kbd></button>`);
    this.clockOffEl.querySelector('.co-btn').addEventListener('click', () => game.clockOff());

    this.touch = el('div', 'touch hidden', `<button class="tb pause">❚❚</button><button class="tb jobs">📋</button>
      <button class="tb hint">?</button><button class="tb reload">R</button><button class="tb zin">+</button>
      <button class="tb zout">−</button><button class="tb scopeb">◎</button><button class="tb fire">FIRE</button>`);
    const tap = (cls, fn) => this.touch.querySelector(cls).addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      fn();
    });
    tap('.fire', () => game.state === 'play' && !game.paused && game.shooting.fire());
    tap('.scopeb', () => game.setScope(!game.rig.scoped));
    tap('.zin', () => game.rig.cycleZoom(1));
    tap('.zout', () => (game.rig.zoomIndex === 0 ? game.setScope(false) : game.rig.cycleZoom(-1)));
    tap('.reload', () => game.rifle.reload());
    tap('.hint', () => game.useHint());
    tap('.jobs', () => this.toggleClipboard());
    tap('.pause', () => (game.paused ? game.resume() : game.pause()));

    this.root.append(this.briefDim, this.scope, this.cross, this.radioEl, this.coachEl, this.clip, this.top, this.tr, this.ammo, this.help, this.prompt,
      this.toasts, this.flashEl, this.hintMarker, this.hintArrow, this.touch, this.clockOffEl);
    root.appendChild(this.bars);

    this.lastSec = -1;
    this.range = 150;
    this.rangeTimer = 0;
    this.hint = null;
    this.helpTimer = 0;
    this.maskSize = '';
    addEventListener('resize', () => this.layoutScope());
  }

  show(on) {
    this.root.classList.toggle('hidden', !on);
    if (on) this.layoutScope();
  }

  /** Called when a level starts. */
  setup(level) {
    this.clip.querySelector('.loc').textContent = level.def.name;
    this.clip.querySelector('.sub').textContent = `${level.def.location} · ${level.def.day || 'Odd jobs & long shots'}`;
    this.parText.textContent = fmt(level.def.parTime);
    this.renderJobs();
    this.renderSpanners();
    this.renderRounds();
    this.helpTimer = 0;
    this.help.style.opacity = '1';
    this.setClipMode('expanded');
    this.clipAuto = 0;
    this.radioEl.classList.add('hidden');
    this.coach(null);
    this.clearHint();
  }

  renderJobs(flashId) {
    const jobs = this.game.jobs;
    this.jobsEl.innerHTML = '';
    for (const j of jobs.list) {
      const secret = j.bonus && j.state !== 'done';
      const li = el('li', `${j.state}${jobs.isLocked(j) ? ' locked' : ''}${secret ? ' secret' : ''}${j.id === flashId ? ' justdone' : ''}`);
      const prog = j.needed > 1 && j.state === 'open' ? ` <span style="opacity:.6">(${j.progress}/${j.needed})</span>` : '';
      li.innerHTML = `<div class="box"></div><div class="title">${secret ? 'Secret job ???' : j.title}${prog}</div>
        <div class="clue">${secret ? 'Something odd is going on somewhere…' : jobs.isLocked(j) ? 'Finish another job first.' : j.clue}</div>`;
      this.jobsEl.appendChild(li);
    }
  }

  renderSpanners() {
    const ctx = this.game.level?.ctx;
    const total = ctx ? ctx.collectibles.length : 0;
    const got = this.game.scoring.spanners;
    this.spannersEl.innerHTML = '';
    for (let i = 0; i < total; i++) this.spannersEl.appendChild(el('div', `spanner${i < got ? ' got' : ''}`, '🔧'));
  }

  renderRounds() {
    const r = this.game.rifle;
    if (this.roundsEl.children.length !== r.magSize) {
      this.roundsEl.innerHTML = '';
      for (let i = 0; i < r.magSize; i++) this.roundsEl.appendChild(el('div', 'round'));
    }
    [...this.roundsEl.children].forEach((c, i) => c.classList.toggle('spent', i >= r.ammo));
  }

  onShot() {
    this.renderRounds();
  }

  toast(text, sub = '', cls = '') {
    const t = el('div', `toast ${cls}`, `${text}${sub ? `<small>${sub}</small>` : ''}`);
    this.toasts.appendChild(t);
    setTimeout(() => t.remove(), 2000);
    while (this.toasts.children.length > 3) this.toasts.firstChild.remove();
  }

  flash(kind) {
    this.flashEl.className = 'flash';
    void this.flashEl.offsetWidth;
    this.flashEl.className = `flash ${kind}`;
  }

  /** Centre-stage clipboard between the intro swoop and the first click. */
  setBriefing(on) {
    this.clip.classList.toggle('briefing', on);
    this.briefDim.classList.toggle('hidden', !on);
    for (const e of [this.top, this.tr, this.ammo, this.help, this.cross]) e.style.visibility = on ? 'hidden' : '';
    this.setClipMode(on ? 'expanded' : 'compact');
    if (!on) this.helpTimer = 0;
  }

  /** Spoken hint nudge (tier 1). */
  radio(title, text) {
    this.radioEl.querySelector('.r-title').textContent = title;
    this.radioEl.querySelector('.r-text').textContent = `“${text}”`;
    this.radioEl.classList.remove('hidden');
    this.radioEl.style.animation = 'none';
    void this.radioEl.offsetWidth;
    this.radioEl.style.animation = '';
    clearTimeout(this.radioTimer);
    this.radioTimer = setTimeout(() => this.radioEl.classList.add('hidden'), 9000);
  }

  /** Tutorial coach mark (null hides it). */
  coach(html, n, total) {
    if (!html) {
      this.coachEl.classList.add('hidden');
      return;
    }
    this.coachEl.querySelector('.c-step').textContent = `${n}/${total}`;
    this.coachEl.querySelector('.c-text').innerHTML = html;
    this.coachEl.classList.remove('hidden');
    this.coachEl.style.animation = 'none';
    void this.coachEl.offsetWidth;
    this.coachEl.style.animation = '';
  }

  showClockOff(on, left = 0) {
    this.clockOffEl.classList.toggle('hidden', !on);
    if (on) this.clockOffEl.querySelector('.co-left').textContent = left ? `${left} secret${left > 1 ? 's' : ''} left` : '';
  }

  setCinematic(on) {
    this.bars.classList.toggle('on', on);
    this.root.style.opacity = on ? '0' : '1';
  }

  setClipboard(open) {
    this.setClipMode(open ? 'compact' : 'closed');
  }

  /** compact = titles only, expanded = titles + clues (2 columns when long), closed = tucked away. */
  setClipMode(mode) {
    this.clipMode = mode;
    const c = this.clip.classList;
    c.toggle('compact', mode === 'compact');
    c.toggle('expanded', mode === 'expanded');
    c.toggle('closed', mode === 'closed');
    c.toggle('wide', mode === 'expanded' && this.game.jobs.list.length > 7);
  }

  toggleClipboard() {
    this.clipAuto = 0;
    const next = { compact: 'expanded', expanded: 'closed', closed: 'compact' }[this.clipMode] || 'compact';
    this.setClipMode(next);
  }

  showHint(job, worldPos) {
    this.hint = { job, pos: worldPos.clone(), t: 0 };
  }

  clearHint() {
    this.hint = null;
    this.hintMarker.classList.add('hidden');
    this.hintArrow.classList.add('hidden');
  }

  layoutScope() {
    const w = innerWidth, h = innerHeight;
    const key = `${w}x${h}`;
    if (key === this.maskSize) return;
    this.maskSize = key;
    const R = Math.min(w, h) * 0.47;
    this.R = R;
    const c = this.mask;
    c.width = w;
    c.height = h;
    c.style.width = `${w + 4}px`;
    c.style.height = `${h + 4}px`;
    const g = c.getContext('2d');
    g.fillStyle = '#07070b';
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'destination-out';
    const grad = g.createRadialGradient(w / 2, h / 2, R * 0.9, w / 2, h / 2, R);
    grad.addColorStop(0, 'rgba(0,0,0,1)');
    grad.addColorStop(0.75, 'rgba(0,0,0,0.9)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(w / 2, h / 2, R, 0, Math.PI * 2);
    g.fill();
    g.globalCompositeOperation = 'source-over';
    // inner lens shading ring
    const ring = g.createRadialGradient(w / 2, h / 2, R * 0.7, w / 2, h / 2, R);
    ring.addColorStop(0, 'rgba(10,10,20,0)');
    ring.addColorStop(1, 'rgba(10,10,20,0.55)');
    g.fillStyle = ring;
    g.beginPath();
    g.arc(w / 2, h / 2, R, 0, Math.PI * 2);
    g.fill();
    this.reticle.setAttribute('width', 2 * R);
    this.reticle.setAttribute('height', 2 * R);
    Object.assign(this.zoomBadge.style, { left: `${w / 2 + R * 0.5}px`, top: `${h / 2 - R * 0.72}px` });
    Object.assign(this.rangeBadge.style, { left: `${w / 2 + R * 0.12}px`, top: `${h / 2 + R * 0.2}px` });
    Object.assign(this.breath.style, { left: `${w / 2 - R * 0.8}px`, top: `${h / 2 - R * 0.28}px`, height: `${R * 0.56}px` });
    Object.assign(this.breathLabel.style, { left: `${w / 2 - R * 0.8 - 30}px`, top: `${h / 2 + R * 0.3}px` });
  }

  update(dt) {
    const g = this.game;
    const rig = g.rig;
    const scoped = rig.scopeT > 0.5;

    // Scope overlay
    this.scope.classList.toggle('on', rig.scopeT > 0.35);
    const s = 1.25 - 0.25 * THREE.MathUtils.smoothstep(rig.scopeT, 0.35, 1);
    this.scope.style.transform = `scale(${s})`;
    this.cross.style.opacity = rig.scopeT < 0.3 ? '1' : '0';
    this.clip.classList.toggle('small', scoped);
    if (scoped) {
      this.zoomBadge.textContent = `${rig.zoom}×`;
      const b = rig.breath / rig.breathMax;
      this.breath.firstChild.style.height = `${b * 100}%`;
      this.breath.classList.toggle('winded', rig.winded > 0);
      this.rangeTimer -= dt;
      if (this.rangeTimer <= 0) {
        this.rangeTimer = 0.12;
        const r = g.shooting.range();
        this.rangeBadge.textContent = r ? `${Math.round(r)} m` : '— m';
        this.range = r || 150;
      }
    }

    // Timer / par
    const t = g.scoring.shiftTime;
    const sec = Math.floor(t);
    if (sec !== this.lastSec) {
      this.lastSec = sec;
      this.timerText.textContent = fmt(t);
      this.timerChip.classList.toggle('over', t > g.scoring.parTime);
    }
    this.coinText.textContent = String(g.scoring.coins);
    this.hintText.textContent = String(g.hintsLeft ?? 0);

    // Ammo / reload
    const rifle = g.rifle;
    this.reloadBar.classList.toggle('on', rifle.state === 'reloading');
    if (rifle.state === 'reloading') this.reloadFill.style.width = `${rifle.progress * 100}%`;
    if (this._ammo !== rifle.ammo || this._mag !== rifle.magSize) {
      this._ammo = rifle.ammo;
      this._mag = rifle.magSize;
      this.renderRounds();
    }

    // Touch controls
    const touch = g.input.touchMode;
    this.touch.classList.toggle('hidden', !touch);
    if (touch) {
      this.help.style.display = 'none';
      this.touch.classList.toggle('scoped', g.rig.scoped);
    }

    // Clipboard starts expanded so the clues get read, then tucks into compact mode.
    if (this.clipAuto > 0 && g.state === 'play') {
      this.clipAuto -= dt;
      if (this.clipAuto <= 0 && this.clipMode === 'expanded') this.setClipMode('compact');
    }

    // Help fades
    this.helpTimer += dt;
    if (this.helpTimer > 14) this.help.style.opacity = '0.28';

    // Pointer prompt
    const needLock = g.state === 'play' && !g.input.locked && !g.input.usingFallback && !g.input.touchMode;
    this.prompt.classList.toggle('hidden', !needLock);

    // Hint marker/arrow
    if (this.hint) {
      this.hint.t += dt;
      if (this.hint.t > 7 || this.hint.job.state !== 'open') {
        this.clearHint();
      } else {
        const w = innerWidth, h = innerHeight;
        _v.copy(this.hint.pos).project(g.camera);
        const behind = _v.z > 1;
        const onScreen = !behind && Math.abs(_v.x) < 0.92 && Math.abs(_v.y) < 0.9;
        if (onScreen) {
          this.hintMarker.classList.remove('hidden');
          this.hintArrow.classList.add('hidden');
          this.hintMarker.style.transform = `translate(${(_v.x * 0.5 + 0.5) * w}px, ${(-_v.y * 0.5 + 0.5) * h}px)`;
        } else {
          this.hintMarker.classList.add('hidden');
          this.hintArrow.classList.remove('hidden');
          let x = _v.x, y = _v.y;
          if (behind) { x = -x; y = -y; }
          const a = Math.atan2(y, x);
          const ex = Math.cos(a), ey = Math.sin(a);
          const k = Math.min(0.85 / Math.abs(ex || 1e-6), 0.8 / Math.abs(ey || 1e-6));
          const px = (ex * k * 0.5 + 0.5) * w, py = (-ey * k * 0.5 + 0.5) * h;
          this.hintArrow.style.transform = `translate(${px}px, ${py}px) rotate(${-a + Math.PI / 2}rad)`;
        }
      }
    }
  }
}

const RETICLE = `
  <defs>
    <radialGradient id="glint" cx="30%" cy="25%" r="40%"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
  </defs>
  <circle r="99" fill="url(#glint)"/>
  <g stroke="#15151f" stroke-linecap="round">
    <line x1="-100" y1="0" x2="-58" y2="0" stroke-width="3.2"/><line x1="58" y1="0" x2="100" y2="0" stroke-width="3.2"/>
    <line x1="0" y1="58" x2="0" y2="100" stroke-width="3.2"/><line x1="0" y1="-100" x2="0" y2="-58" stroke-width="1.6"/>
    <line x1="-58" y1="0" x2="-4" y2="0" stroke-width=".55"/><line x1="4" y1="0" x2="58" y2="0" stroke-width=".55"/>
    <line x1="0" y1="-58" x2="0" y2="-4" stroke-width=".55"/><line x1="0" y1="4" x2="0" y2="58" stroke-width=".55"/>
  </g>
  <g fill="#15151f">
    ${[-45, -30, -15, 15, 30, 45].map((d) => `<circle cx="${d}" cy="0" r="1.05"/><circle cx="0" cy="${d}" r="1.05"/>`).join('')}
  </g>
  <g stroke="#15151f" stroke-width=".5">
    ${[8, 23, 38].map((d) => `<line x1="-1.6" y1="${d}" x2="1.6" y2="${d}"/>`).join('')}
  </g>
  <circle r="1.25" fill="#ff5a4e" stroke="#15151f" stroke-width=".35"/>
  <circle r="99.3" fill="none" stroke="#15151f" stroke-width="1.6"/>
`;
