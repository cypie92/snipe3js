// DOM layer for the office: sticker crosshair that follows the mouse, sticker tooltip for the
// hovered object, coin/star chips, a hint sticker and comic "THWOCK!" pops. Pointer-events: none.
const CSS = `
.hub-hud { position: fixed; inset: 0; pointer-events: none; z-index: 6; overflow: hidden;
  font-family: Fredoka, 'Arial Rounded MT Bold', 'Trebuchet MS', sans-serif; color: #2b2b3a; }
.hub-hud.off { display: none; }
.hub-chips { position: absolute; left: 18px; top: 16px; display: flex; gap: 10px; }
.hub-chip { background: #fff8ee; border: 3px solid #2b2b3a; border-radius: 16px; box-shadow: 0 4px 0 #2b2b3a;
  padding: 3px 14px 3px 8px; font-weight: 700; font-size: 22px; display: flex; gap: 8px; align-items: center;
  font-variant-numeric: tabular-nums; transform: rotate(-1.5deg); }
.hub-chip:nth-child(2) { transform: rotate(1.2deg); }
.hub-chip i { width: 22px; height: 22px; border-radius: 50%; display: inline-block; border: 2.5px solid #2b2b3a;
  background: radial-gradient(circle at 35% 35%, #ffe590 0 30%, #ffc93c 31%); box-sizing: border-box; }
.hub-chip b { color: #e39b1b; font-size: 24px; line-height: 1; -webkit-text-stroke: 1.5px #2b2b3a; }
.hub-hint { position: absolute; left: 50%; bottom: 18px; transform: translateX(-50%) rotate(-1deg);
  background: #2b2b3a; color: #fff8ee; border-radius: 14px; padding: 6px 16px; font-size: 17px; font-weight: 600;
  letter-spacing: .2px; box-shadow: 0 4px 0 rgba(43,43,58,.35); transition: opacity .6s; white-space: nowrap; }
.hub-hint em { font-style: normal; color: #ffc93c; }
.hub-cross { position: absolute; left: 0; top: 0; width: 64px; height: 64px; margin: -32px 0 0 -32px;
  transition: transform .16s cubic-bezier(.3,1.6,.5,1); will-change: transform; }
.hub-cross svg { width: 100%; height: 100%; overflow: visible; }
.hub-cross .ring { fill: none; stroke: #fff8ee; stroke-width: 9; }
.hub-cross .ink { fill: none; stroke: #2b2b3a; stroke-width: 4.5; stroke-linecap: round; }
.hub-cross .dot { fill: #ff5a4e; stroke: #2b2b3a; stroke-width: 2.5; }
.hub-cross .lock { fill: none; stroke: #ffc93c; stroke-width: 6; opacity: 0; transition: opacity .15s; }
.hub-cross.hot .lock { opacity: 1; }
.hub-cross.hot svg { animation: hubspin 2.4s linear infinite; }
.hub-cross.hide { opacity: 0; }
@keyframes hubspin { to { transform: rotate(360deg); } }
.hub-tip { position: absolute; left: 0; top: 0; min-width: 150px; max-width: 300px; background: #fff8ee;
  border: 3px solid #2b2b3a; border-radius: 16px; box-shadow: 0 5px 0 #2b2b3a; padding: 8px 14px 10px;
  transform-origin: 0 0; opacity: 0; transition: opacity .12s; }
.hub-tip.on { opacity: 1; animation: hubpop .32s cubic-bezier(.3,1.7,.5,1); }
.hub-tip .t { font-weight: 700; font-size: 22px; line-height: 1.1; letter-spacing: .2px; }
.hub-tip .s { font-family: 'Patrick Hand', 'Comic Sans MS', cursive; font-size: 19px; line-height: 1.12; color: #4a4a5e; margin-top: 2px; }
.hub-tip .c { display: inline-flex; align-items: center; gap: 7px; margin-top: 7px; background: #2b2b3a; color: #fff8ee;
  border-radius: 10px; padding: 2px 10px 3px 6px; font-weight: 600; font-size: 14px; letter-spacing: .3px; }
.hub-tip .c i { width: 14px; height: 14px; border-radius: 50%; border: 3px solid #ff5a4e; box-sizing: border-box;
  box-shadow: inset 0 0 0 2px #fff8ee; background: #ff5a4e; }
.hub-tip .band { position: absolute; left: -3px; right: -3px; top: -3px; height: 9px; border-radius: 16px 16px 0 0;
  border: 3px solid #2b2b3a; border-bottom: none; }
.hub-tip .stars { color: #e39b1b; letter-spacing: 1px; font-size: 18px; -webkit-text-stroke: 1px #2b2b3a; }
.hub-tip .stars span { color: #e9e1cf; }
.hub-pop { position: absolute; font-weight: 700; font-size: 30px; color: #ffc93c; -webkit-text-stroke: 2px #2b2b3a;
  paint-order: stroke; text-shadow: 0 3px 0 #2b2b3a; white-space: nowrap; transform: translate(-50%, -50%);
  animation: hubthwock .8s cubic-bezier(.2,1.4,.4,1) forwards; }
@keyframes hubpop { from { transform: var(--rot) scale(.55); } to { transform: var(--rot) scale(1); } }
@keyframes hubthwock { 0% { transform: translate(-50%, -50%) scale(.3) rotate(-14deg); opacity: 1; }
  30% { transform: translate(-50%, -80%) scale(1.15) rotate(-6deg); opacity: 1; }
  100% { transform: translate(-50%, -140%) scale(1) rotate(-4deg); opacity: 0; } }
`;

const CROSS_SVG = `<svg viewBox="-32 -32 64 64">
  <g class="lock"><circle r="27" stroke-dasharray="10 7"/></g>
  <circle class="ring" r="17"/><circle class="ink" r="17"/>
  <path class="ring" d="M0 -30v9M0 21v9M-30 0h9M21 0h9"/><path class="ink" d="M0 -30v9M0 21v9M-30 0h9M21 0h9"/>
  <circle class="dot" r="4.5"/></svg>`;

export class HubHud {
  constructor(container = document.body) {
    if (!document.getElementById('hub-hud-css')) {
      const st = document.createElement('style');
      st.id = 'hub-hud-css';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    const el = document.createElement('div');
    el.className = 'hub-hud off';
    el.innerHTML = `<div class="hub-chips"><div class="hub-chip coins"><i></i><span>0</span></div><div class="hub-chip stars"><b>★</b><span>0</span></div></div>
      <div class="hub-hint">Aim with the mouse, <em>click to fire a dart</em> at what you want!</div>
      <div class="hub-tip"><div class="band"></div><div class="t"></div><div class="s"></div></div>
      <div class="hub-cross">${CROSS_SVG}</div>`;
    container.appendChild(el);
    this.el = el;
    this.cross = el.querySelector('.hub-cross');
    this.tip = el.querySelector('.hub-tip');
    this.hint = el.querySelector('.hub-hint');
    this.tipKey = null;
    this.x = -100;
    this.y = -100;
  }

  show(on) { this.el.classList.toggle('off', !on); }

  setChips(coins, stars) {
    this.el.querySelector('.coins span').textContent = coins ?? 0;
    this.el.querySelector('.stars span').textContent = stars ?? 0;
  }

  setPointer(x, y, visible = true) {
    this.x = x;
    this.y = y;
    this.cross.style.left = `${x}px`;
    this.cross.style.top = `${y}px`;
    this.cross.classList.toggle('hide', !visible);
    this.placeTip();
  }

  /** info = { key, title, sub, cta, color, stars?: [n, max] } | null */
  setHover(info) {
    this.cross.classList.toggle('hot', !!info);
    const key = info ? `${info.key}|${info.title}|${info.sub}|${info.cta}` : null;
    if (key === this.tipKey) return;
    this.tipKey = key;
    if (!info) {
      this.tip.classList.remove('on');
      return;
    }
    const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
    this.tip.querySelector('.band').style.background = info.color || '#ffc93c';
    this.tip.querySelector('.t').textContent = info.title || '';
    let sub = esc(info.sub);
    if (info.stars) {
      const [n, max] = info.stars;
      sub = `<span class="stars">${'★'.repeat(n)}<span>${'★'.repeat(Math.max(0, max - n))}</span></span> ${sub}`;
    }
    this.tip.querySelector('.s').innerHTML = sub;
    let c = this.tip.querySelector('.c');
    if (info.cta) {
      if (!c) {
        c = document.createElement('div');
        c.className = 'c';
        this.tip.appendChild(c);
      }
      c.innerHTML = `<i></i>${esc(info.cta)}`;
    } else c?.remove();
    const rot = `rotate(${((info.key || '').length % 3) - 1.5}deg)`;
    this.tip.style.setProperty('--rot', rot);
    this.tip.classList.remove('on');
    void this.tip.offsetWidth; // restart the pop animation
    this.tip.classList.add('on');
    this.placeTip();
  }

  placeTip() {
    if (!this.tipKey) return;
    const w = this.tip.offsetWidth || 220, h = this.tip.offsetHeight || 90;
    let x = this.x + 34, y = this.y + 26;
    if (x + w > innerWidth - 10) x = this.x - w - 30;
    if (y + h > innerHeight - 10) y = this.y - h - 24;
    this.tip.style.left = `${Math.max(8, x)}px`;
    this.tip.style.top = `${Math.max(8, y)}px`;
  }

  kick() {
    this.cross.style.transform = 'scale(1.45) rotate(18deg)';
    setTimeout(() => { this.cross.style.transform = ''; }, 90);
  }

  pop(x, y, text = 'THWOCK!', color) {
    const p = document.createElement('div');
    p.className = 'hub-pop';
    p.textContent = text;
    if (color) p.style.color = color;
    p.style.left = `${x}px`;
    p.style.top = `${y}px`;
    this.el.appendChild(p);
    setTimeout(() => p.remove(), 850);
  }

  hideHint() { this.hint.style.opacity = '0'; }

  destroy() { this.el.remove(); }
}
