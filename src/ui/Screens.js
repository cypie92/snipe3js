// DOM screens: title, office job board, workshop, intro card, pause/settings, results.
import { UPGRADES } from '../gameplay/Progression.js';
import { sound } from '../core/sound.js';

const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};
const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const stars = (n, max = 4) => '★'.repeat(n) + '<span style="opacity:.25">' + '★'.repeat(Math.max(0, max - n)) + '</span>';

export const PIDGE_SVG = `<svg viewBox="0 0 180 180" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="88" cy="150" rx="58" ry="26" fill="#2b2b3a" opacity=".12"/>
  <ellipse cx="86" cy="122" rx="52" ry="44" fill="#9aa7c7" stroke="#2b2b3a" stroke-width="4"/>
  <path d="M60 118 q-18 18 -8 40 q22 -6 30 -28z" fill="#8391b4" stroke="#2b2b3a" stroke-width="4" stroke-linejoin="round"/>
  <ellipse cx="94" cy="92" rx="34" ry="16" fill="#58b8a8" stroke="#2b2b3a" stroke-width="4"/>
  <ellipse cx="100" cy="92" rx="18" ry="8" fill="#a26bd1" opacity=".75"/>
  <circle cx="98" cy="64" r="34" fill="#b3bdd6" stroke="#2b2b3a" stroke-width="4"/>
  <path d="M128 66 l18 6 l-18 6z" fill="#3d3d4f" stroke="#2b2b3a" stroke-width="3" stroke-linejoin="round"/>
  <ellipse cx="126" cy="64" rx="5" ry="4" fill="#fff"/>
  <circle cx="111" cy="60" r="10" fill="#ff9f1c" stroke="#2b2b3a" stroke-width="3"/>
  <circle cx="113" cy="60" r="4.5" fill="#2b2b3a"/><circle cx="115" cy="58" r="1.6" fill="#fff"/>
  <path d="M100 48 q12 -6 22 2" stroke="#2b2b3a" stroke-width="4" fill="none" stroke-linecap="round"/>
  <path d="M62 44 q34 -26 68 0 v8 h-68z" fill="#2f3e6b" stroke="#2b2b3a" stroke-width="4" stroke-linejoin="round"/>
  <path d="M96 52 h40 q6 0 4 5 h-44z" fill="#1c2340" stroke="#2b2b3a" stroke-width="3" stroke-linejoin="round"/>
  <circle cx="96" cy="38" r="6" fill="#ffc93c" stroke="#2b2b3a" stroke-width="2.5"/>
  <rect x="112" y="104" width="46" height="56" rx="5" fill="#c98a4b" stroke="#2b2b3a" stroke-width="4" transform="rotate(12 135 132)"/>
  <rect x="118" y="112" width="34" height="42" rx="3" fill="#fffaf0" stroke="#2b2b3a" stroke-width="2.5" transform="rotate(12 135 132)"/>
  <path d="M124 124 h22 M123 132 h18 M122 140 h20" stroke="#3a6ee8" stroke-width="2.5" transform="rotate(12 135 132)"/>
  <path d="M100 150 q14 8 26 -2" fill="#8391b4" stroke="#2b2b3a" stroke-width="4" stroke-linejoin="round"/>
  <path d="M70 162 v10 m-6 0 h12 M98 162 v10 m-6 0 h12" stroke="#ff7b6b" stroke-width="4" stroke-linecap="round"/>
</svg>`;

const QUOTES = {
  S: ['Impeccable. Not a feather out of place.', 'Textbook. I may frame this report.', 'Flawless. Suspiciously flawless.'],
  A: ['Very tidy work. Almost impressive.', 'Good show. A smidge slow, mind.', 'Solid. I only frowned twice.'],
  B: ["Satisfactory. I've seen worse. From pigeons.", 'Acceptable. Just about.', 'Fine. Mostly fine. Ish.'],
  C: ['Hmm. The job got done. Some of it.', 'I have… notes.', 'Did you hold that rifle backwards?'],
  D: ["I'll be writing a strongly-worded report.", 'Were you even trying?', 'The village would like a word.'],
};

export class Screens {
  constructor(game, root) {
    this.game = game;
    this.root = root;
    this.current = null;
  }

  clear() {
    this.current?.remove();
    this.current = null;
  }

  mount(node) {
    this.clear();
    this.current = node;
    this.root.appendChild(node);
    node.querySelectorAll('.btn, .flyer').forEach((b) => {
      b.addEventListener('mouseenter', () => sound.sfx('uiHover'));
      b.addEventListener('click', () => sound.sfx('uiClick'));
    });
    return node;
  }

  title(onStart) {
    const s = el('div', 'screen title-screen', `
      <div class="logo"><div class="l1">JACK</div><div class="l2">of all</div><div class="l3">BLASTS</div></div>
      <div class="tagline">Odd jobs. Long shots. Nobody gets hurt.</div>
      <button class="btn start">Click to start</button>
      <div class="credits">A fan-made tribute inspired by <i>Sniper Dan</i> (Denki / PQube) · all art &amp; sound procedurally made in three.js</div>`);
    s.querySelector('.start').addEventListener('click', onStart);
    return this.mount(s);
  }

  office(levels, { onPlay, onWorkshop, onSettings }) {
    const prog = this.game.progress;
    const s = el('div', 'screen office dim', `
      <div class="corkboard"><h1>Jack's Odd Jobs · Job Board</h1><div class="flyers"></div></div>
      <div class="bar">
        <div class="chip"><span class="coin"></span>${prog.coins}</div>
        <div class="chip" style="color:#e39b1b">★ ${prog.stars}</div>
        <button class="btn teal workshop">Workshop</button>
        <button class="btn alt settings">Settings</button>
      </div>`);
    const flyers = s.querySelector('.flyers');
    for (const def of levels) {
      const rec = prog.level(def.id);
      const locked = prog.stars < (def.unlockStars || 0);
      const f = el('div', `flyer${locked ? ' locked' : ''}`, `
        <div class="thumb" style="background:${def.thumb || 'linear-gradient(#bfe3ff,#7cc653)'}">${def.icon || '🏘️'}</div>
        <h2>${def.name}</h2><div class="loc">${def.location}</div>
        <div class="meta"><span class="stars">${stars(rec.stars || 0)}</span><span>PAR ${fmt(def.parTime)}</span></div>
        ${rec.grade ? `<div class="gradebadge">${rec.grade}</div>` : ''}
        ${locked ? `<div class="lock">🔒 Needs ${def.unlockStars} ★</div>` : ''}`);
      if (!locked) f.addEventListener('click', () => onPlay(def.id));
      flyers.appendChild(f);
    }
    s.querySelector('.workshop').addEventListener('click', onWorkshop);
    s.querySelector('.settings').addEventListener('click', onSettings);
    return this.mount(s);
  }

  workshop(onBack) {
    const prog = this.game.progress;
    const s = el('div', 'screen workshop dim', `<div class="panel">
      <h2>🔧 Workshop</h2><div class="sub">Spend your hard-earned coins. You have <b class="c">${prog.coins}</b> coins.</div>
      <div class="list"></div><div style="display:flex;justify-content:flex-end;margin-top:14px"><button class="btn back">Back to the board</button></div></div>`);
    const list = s.querySelector('.list');
    const render = () => {
      list.innerHTML = '';
      s.querySelector('.c').textContent = prog.coins;
      for (const key of Object.keys(UPGRADES)) {
        const u = UPGRADES[key];
        const lvl = prog.upgradeLevel(key);
        const cost = prog.nextCost(key);
        const row = el('div', 'upg', `<div class="name">${u.name}</div>
          <div class="pips">${u.levels.map((_, i) => `<div class="pip${i <= lvl ? ' on' : ''}"></div>`).join('')}</div>
          <button class="btn buy" ${cost == null || prog.coins < cost ? 'disabled' : ''}>${cost == null ? 'MAXED' : `<span class="coin" style="width:16px;height:16px;vertical-align:-2px"></span> ${cost}`}</button>
          <div class="desc">${u.desc}</div>`);
        row.querySelector('.buy').addEventListener('click', () => {
          if (prog.buy(key)) {
            sound.sfx('cash');
            this.game.applyUpgrades();
            render();
          }
        });
        list.appendChild(row);
      }
    };
    render();
    s.querySelector('.back').addEventListener('click', onBack);
    return this.mount(s);
  }

  /** Shown while a location is built (covers the synchronous build hitch). */
  loading(def) {
    const s = el('div', 'screen loading-card dim', `<div class="panel" style="text-align:center">
      <div style="font-size:54px;line-height:1;animation:bob 1s ease-in-out infinite">🚐</div>
      <h2 style="margin:6px 0 0">Driving to ${def?.name || 'the next job'}…</h2>
      <div class="sub">${def?.location || ''} · pack a flask, it's a busy one</div></div>`);
    return this.mount(s);
  }

  intro(def) {
    const s = el('div', 'screen intro', `<div class="card"><div class="kicker">${def.day || 'Tuesday morning'}</div>
      <h1>${def.name}</h1><div class="where">${def.location} · ${this.game.jobs.main.length} jobs · Par ${fmt(def.parTime)}</div></div>`);
    this.mount(s);
    setTimeout(() => {
      if (this.current === s) this.clear();
    }, 3400);
    return s;
  }

  pause({ onResume, onRestart, onQuit }) {
    const st = this.game.progress.data.settings;
    const s = el('div', 'screen pause dim', `<div class="panel">
      <h2>Tea break ☕</h2><div class="sub">The village can wait a minute.</div>
      <div class="col">
        <button class="btn resume">Back to work</button>
        <button class="btn alt restart">Restart shift</button>
        <button class="btn alt quit">Back to the office</button>
      </div>
      <div class="settings">
        <label>Look speed</label><input class="sens" type="range" min="0.3" max="2.5" step="0.05" value="${st.sensitivity}">
        <label>Volume</label><input class="vol" type="range" min="0" max="1" step="0.05" value="${st.volume}">
        <label>Music</label><input class="mus" type="range" min="0" max="1" step="0.05" value="${st.music}">
        <label>Graphics</label><select class="q">${['auto', 'high', 'medium', 'low'].map((q) => `<option ${q === st.quality ? 'selected' : ''}>${q}</option>`).join('')}</select>
      </div></div>`);
    s.querySelector('.resume').addEventListener('click', onResume);
    s.querySelector('.restart').addEventListener('click', onRestart);
    s.querySelector('.quit').addEventListener('click', onQuit);
    this.bindSettings(s);
    return this.mount(s);
  }

  settings(onBack) {
    const st = this.game.progress.data.settings;
    const s = el('div', 'screen pause dim', `<div class="panel"><h2>Settings</h2>
      <div class="settings">
        <label>Look speed</label><input class="sens" type="range" min="0.3" max="2.5" step="0.05" value="${st.sensitivity}">
        <label>Volume</label><input class="vol" type="range" min="0" max="1" step="0.05" value="${st.volume}">
        <label>Music</label><input class="mus" type="range" min="0" max="1" step="0.05" value="${st.music}">
        <label>Graphics</label><select class="q">${['auto', 'high', 'medium', 'low'].map((q) => `<option ${q === st.quality ? 'selected' : ''}>${q}</option>`).join('')}</select>
      </div>
      <div class="col"><button class="btn back">Done</button></div></div>`);
    s.querySelector('.back').addEventListener('click', onBack);
    this.bindSettings(s);
    return this.mount(s);
  }

  bindSettings(s) {
    const g = this.game;
    const st = g.progress.data.settings;
    const save = () => {
      g.progress.save();
      g.applySettings();
    };
    s.querySelector('.sens').addEventListener('input', (e) => { st.sensitivity = Number(e.target.value); save(); });
    s.querySelector('.vol').addEventListener('input', (e) => { st.volume = Number(e.target.value); save(); });
    s.querySelector('.mus').addEventListener('input', (e) => { st.music = Number(e.target.value); save(); });
    s.querySelector('.q').addEventListener('change', (e) => { st.quality = e.target.value; save(); g.applyQuality(); });
  }

  results({ def, summary, counts, time, badHits, accuracy, spanners, spannersTotal, newBest }, { onOffice, onRetry, onNext }) {
    const rows = [
      ['Jobs done', `${counts.done}/${counts.total}${counts.failed ? ` · ${counts.failed} failed` : ''}`, `+${summary.jobCoins}`],
      ['Time', `${fmt(time)} <span style="opacity:.6">(par ${fmt(def.parTime)})</span>`, summary.timeBonus ? `+${summary.timeBonus}` : '—'],
      ['Accuracy', `${Math.round(accuracy * 100)}%`, `+${summary.accBonus}`],
      ['Bad hits', `${badHits}`, badHits ? `<span class="neg">−${summary.badPenalty}</span>` : '—'],
      ['Golden spanners', `${spanners}/${spannersTotal}`, ''],
      ['Grade bonus', summary.grade, `+${summary.gradeBonus}`],
    ];
    const s = el('div', 'screen results dim', `<div class="panel">
      ${newBest ? '<div class="newbest">NEW BEST!</div>' : ''}
      <h2>Shift report · ${def.name}</h2>
      <div class="tally">${rows.map((r) => `<div class="row"><span>${r[0]}</span><span>${r[1]}</span><b>${r[2]}</b></div>`).join('')}
        <div class="row total"><span>Coins earned</span><b><span class="coin"></span> <span class="tot">0</span></b></div></div>
      <div class="inspector">${PIDGE_SVG}<div class="stamp ${summary.grade}">${summary.grade}</div><div class="quote"></div></div>
      <div class="actions"><button class="btn alt office">Office</button><button class="btn alt retry">Retry</button>${onNext ? '<button class="btn next">Next job ▶</button>' : ''}</div></div>`);
    this.mount(s);
    const rowsEl = [...s.querySelectorAll('.tally .row')];
    let i = 0;
    const step = () => {
      if (this.current !== s) return;
      if (i < rowsEl.length) {
        rowsEl[i].classList.add('in');
        sound.sfx('tick');
        i++;
        setTimeout(step, 260);
        return;
      }
      // count up coins
      const tot = s.querySelector('.tot');
      const target = summary.total;
      const t0 = performance.now();
      const count = () => {
        const k = Math.min(1, (performance.now() - t0) / 900);
        tot.textContent = Math.round(target * k);
        if (k < 1) requestAnimationFrame(count);
        else {
          sound.sfx('cash');
          setTimeout(() => {
            const st = s.querySelector('.stamp');
            st.classList.add('slam');
            setTimeout(() => {
              sound.sfx('stamp');
              if (summary.grade === 'S') sound.sfx('fanfare');
              const q = s.querySelector('.quote');
              const list = QUOTES[summary.grade];
              q.textContent = `“${list[Math.floor(Math.random() * list.length)]}”`;
              q.classList.add('in');
              s.querySelector('.actions').classList.add('in');
            }, 320);
          }, 350);
        }
      };
      count();
    };
    setTimeout(step, 450);
    s.querySelector('.office').addEventListener('click', onOffice);
    s.querySelector('.retry').addEventListener('click', onRetry);
    s.querySelector('.next')?.addEventListener('click', onNext);
    return s;
  }
}
