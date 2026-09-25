// Persistent progression: coins, upgrades, per-level bests, settings (localStorage, fail-safe).
const KEY = 'jack-of-all-blasts-save-v1';

export const UPGRADES = {
  mag: { name: 'Big Magazine', desc: 'More rounds before reloading.', levels: [3, 5, 7, 10], costs: [0, 120, 320, 650], unit: 'rounds' },
  reload: { name: 'Speed Loader', desc: 'Reload faster.', levels: [2.2, 1.7, 1.25, 0.9], costs: [0, 100, 260, 540], unit: 's' },
  bolt: { name: 'Slick Bolt', desc: 'Cycle the bolt faster between shots.', levels: [0.95, 0.72, 0.52, 0.36], costs: [0, 100, 260, 540], unit: 's' },
  zoom: { name: 'Hawk-Eye Scope', desc: 'Unlock higher magnification.', levels: [[2, 4], [2, 4, 8], [2, 4, 8, 12]], costs: [0, 180, 520], unit: '' },
  steady: { name: 'Steady Hands', desc: 'Less sway and longer breath hold.', levels: [1.0, 0.75, 0.55, 0.4], costs: [0, 140, 340, 680], unit: 'x' },
  hints: { name: 'Binocular Tips', desc: 'More hints per shift.', levels: [2, 3, 4], costs: [0, 150, 380], unit: '' },
};

const DEFAULT = () => ({
  coins: 0,
  totalCoins: 0,
  upgrades: { mag: 1, reload: 0, bolt: 0, zoom: 1, steady: 0, hints: 0 },
  levels: {}, // id -> { grade, bestTime, stars, spanners: [] , plays }
  settings: { sensitivity: 1, volume: 0.8, music: 0.6, quality: 'auto', invertY: false },
  seenTutorial: false,
});

export class Progression {
  constructor() {
    this.data = DEFAULT();
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.data = { ...DEFAULT(), ...JSON.parse(raw) };
    } catch {
      /* storage unavailable: play without saving */
    }
    this.data.upgrades = { ...DEFAULT().upgrades, ...this.data.upgrades };
    this.data.settings = { ...DEFAULT().settings, ...this.data.settings };
  }

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* ignore */
    }
  }

  get coins() {
    return this.data.coins;
  }

  addCoins(n) {
    this.data.coins += n;
    this.data.totalCoins += n;
    this.save();
  }

  level(id) {
    return this.data.levels[id] || { grade: null, bestTime: null, stars: 0, spanners: [], plays: 0 };
  }

  get stars() {
    return Object.values(this.data.levels).reduce((s, l) => s + (l.stars || 0), 0);
  }

  recordLevel(id, { grade, time, stars, spanners }) {
    const order = ['D', 'C', 'B', 'A', 'S'];
    const prev = this.level(id);
    const better = !prev.grade || order.indexOf(grade) > order.indexOf(prev.grade);
    this.data.levels[id] = {
      grade: better ? grade : prev.grade,
      bestTime: prev.bestTime == null ? time : Math.min(prev.bestTime, time),
      stars: Math.max(prev.stars || 0, stars),
      spanners: [...new Set([...(prev.spanners || []), ...spanners])],
      plays: (prev.plays || 0) + 1,
    };
    this.save();
    return { newBest: better };
  }

  upgradeLevel(key) {
    return this.data.upgrades[key] ?? 0;
  }

  upgradeValue(key) {
    const u = UPGRADES[key];
    return u.levels[Math.min(this.upgradeLevel(key), u.levels.length - 1)];
  }

  nextCost(key) {
    const u = UPGRADES[key];
    const lvl = this.upgradeLevel(key);
    return lvl + 1 < u.levels.length ? u.costs[lvl + 1] : null;
  }

  buy(key) {
    const cost = this.nextCost(key);
    if (cost == null || this.data.coins < cost) return false;
    this.data.coins -= cost;
    this.data.upgrades[key]++;
    this.save();
    return true;
  }

  /** Stats for Rifle.apply() and CameraRig. */
  rifleStats() {
    return {
      magSize: this.upgradeValue('mag'),
      reloadTime: this.upgradeValue('reload'),
      boltTime: this.upgradeValue('bolt'),
      zoomLevels: this.upgradeValue('zoom'),
      swayMul: this.upgradeValue('steady'),
      breathMax: 3 + this.upgradeLevel('steady'),
      hints: this.upgradeValue('hints'),
    };
  }

  reset() {
    this.data = DEFAULT();
    this.save();
  }
}
