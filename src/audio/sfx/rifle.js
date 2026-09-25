// Rifle & scope foley. Recipes receive a Voice (see ../Voice.js); times are relative seconds.
import { points } from '../dsp.js';

// short metallic "clack": filtered click + ringing modes + a little low thunk
function clack(v, t, f, peak, low = 200) {
  v.burst({ t, a: 0.0004, d: 0.035, peak, filters: [{ type: 'bandpass', f, q: 2.2 }] });
  v.burst({ t, a: 0.0002, d: 0.008, peak: peak * 0.6, filters: [{ type: 'highpass', f: 4000, q: 0.7 }] });
  v.modal({ t, f: f * 0.93, peak: peak * 0.22, partials: [[1, 0.7, 0.09], [1.71, 0.45, 0.06], [2.63, 0.3, 0.05], [3.93, 0.2, 0.04]] });
  v.tone({ t, f: low, f1: low * 0.6, glide: 0.03, a: 0.001, d: 0.06, peak: peak * 0.55 });
}

// metal-on-metal slide ("shhk")
function slide(v, t, f0, f1, dur, peak) {
  v.burst({ t, a: dur * 0.35, h: dur * 0.3, r: dur * 0.35, peak, filters: [{ type: 'bandpass', f: f0, f1, glide: dur, q: 2 }, { type: 'highpass', f: 900 }] });
}

// breath through the mouth: pink noise through two moving formant bands
function breath(v, t, dur, { f1, f2, rise, peak, shape }) {
  const env = v.gain(0, v.out);
  points(env.gain, v.at(t), shape.map(([p, a]) => [p * dur, a * peak]));
  const hp = v.filter('highpass', 250, 0.7);
  const b1 = v.filter('bandpass', f1, 1.3, env);
  const b2 = v.filter('bandpass', f2, 2.2, env);
  hp.connect(b1);
  hp.connect(b2);
  b1.frequency.setValueAtTime(f1, v.at(t));
  b2.frequency.setValueAtTime(f2, v.at(t));
  b1.frequency.linearRampToValueAtTime(f1 * rise, v.at(t + dur));
  b2.frequency.linearRampToValueAtTime(f2 * rise, v.at(t + dur));
  v.noise('pink', t, dur + 0.02, hp);
}

export default {
  // Crisp transient + noise crack + low thump + body + slap-back echo (off the village walls).
  shot(v) {
    v.punch(1.6);
    const mix = v.gain(1, v.out);
    const echo = v.echo({ time: v.rr(0.12, 0.16), feedback: 0.3, lp: 1700, hp: 220, wet: 0.3, dur: 1.3 });
    mix.connect(echo);
    // 1. transient click
    v.burst({ a: 0.0002, d: 0.01, peak: 0.55, filters: [{ type: 'highpass', f: 2800, q: 0.7 }, { type: 'lowpass', f: 9000 }], dest: mix });
    // 2. crack: band-passed noise sweeping down, top end rolled off so it is not harsh
    v.burst({ a: 0.0005, d: 0.14, peak: 0.9, filters: [{ type: 'bandpass', pts: [[0, 3400], [0.1, 750]], q: 0.75 }, { type: 'lowpass', f: 6500, q: 0.5 }], dest: mix });
    // 3. low thump (pitch-dropping sine through a little drive for punch)
    const drv = v.shaper(2.2, mix);
    v.tone({ f: 135, f1: 44, glide: 0.11, a: 0.0015, d: 0.3, peak: 0.75, dest: drv });
    // 4. body boom
    v.burst({ kind: 'brown', a: 0.002, d: 0.42, peak: 0.9, filters: [{ type: 'lowpass', pts: [[0, 900], [0.3, 160]], q: 0.6 }], dest: mix });
    // 5. distant rolling tail
    v.burst({ t: 0.02, kind: 'pink', a: 0.04, d: 0.9, peak: 0.12, filters: [{ type: 'lowpass', f: 420, q: 0.5 }], dest: v.out });
  },

  // Bolt action: open (clack + slide back), close (slide forward + heavier clack).
  bolt(v) {
    v.punch(1.8);
    clack(v, 0, v.rr(2600, 2900), 0.5, 260);
    slide(v, 0.045, 1700, 3400, 0.08, 0.14);
    slide(v, 0.2, 3300, 1700, 0.07, 0.12);
    clack(v, 0.28, v.rr(1850, 2050), 0.6, 170);
  },

  // Magazine out (release click + slide) ... magazine in (slide + solid seat).
  reload(v) {
    clack(v, 0, 3300, 0.32, 300);
    slide(v, 0.03, 2400, 1100, 0.14, 0.14);
    v.burst({ t: 0.16, kind: 'pink', a: 0.003, d: 0.06, peak: 0.12, filters: [{ type: 'bandpass', f: 700, q: 1.5 }] });
    slide(v, 0.42, 1100, 2300, 0.08, 0.12);
    clack(v, 0.5, 1900, 0.6, 150);
    clack(v, 0.57, 3600, 0.15, 400);
  },

  dryfire(v) {
    v.burst({ a: 0.0003, d: 0.03, peak: 1, filters: [{ type: 'bandpass', f: 3600, q: 2 }] });
    v.modal({ f: 3000, peak: 0.3, partials: [[1, 0.8, 0.08], [2.3, 0.4, 0.05]] });
    v.tone({ f: 650, f1: 380, glide: 0.02, a: 0.001, d: 0.05, peak: 0.5 });
  },

  // Soft whoosh up + lens clink.
  scopeIn(v) {
    v.burst({ kind: 'pink', a: 0.11, h: 0.02, r: 0.09, peak: 0.45, filters: [{ type: 'bandpass', f: 450, f1: 2100, glide: 0.2, q: 1.1 }] });
    v.modal({ t: 0.15, f: v.rr(3300, 3600), peak: 0.1, partials: [[1, 0.9, 0.3], [1.52, 0.5, 0.22], [2.41, 0.35, 0.15], [3.1, 0.2, 0.1]] });
    v.tone({ t: 0.15, f: 170, f1: 120, glide: 0.04, a: 0.002, d: 0.07, peak: 0.16 });
  },
  scopeOut(v) {
    v.modal({ f: v.rr(3000, 3300), peak: 0.14, partials: [[1, 0.9, 0.22], [1.52, 0.5, 0.15], [2.41, 0.3, 0.1]] });
    v.burst({ t: 0.01, kind: 'pink', a: 0.06, h: 0.02, r: 0.13, peak: 0.8, filters: [{ type: 'bandpass', f: 1900, f1: 420, glide: 0.2, q: 1.1 }] });
  },

  // tiny ratchet tick of the zoom ring
  zoom(v) {
    for (const [t, k] of [[0, 1], [0.028, 0.6]]) {
      v.burst({ t, a: 0.0003, d: 0.018, peak: k, filters: [{ type: 'bandpass', f: 4300, q: 2 }] });
      v.tone({ t, f: 2500, a: 0.001, d: 0.03, peak: 0.3 * k });
    }
  },

  breathIn(v) {
    breath(v, 0, 0.62, { f1: 950, f2: 2300, rise: 1.15, peak: 0.55, shape: [[0.15, 0.4], [0.75, 1], [1, 0]] });
  },
  breathOut(v) {
    breath(v, 0, 0.85, { f1: 780, f2: 1900, rise: 0.85, peak: 0.5, shape: [[0.08, 1], [0.45, 0.7], [1, 0]] });
  },

  // lub-dub
  heartbeat(v) {
    const lp = v.filter('lowpass', 260, 0.7, v.out);
    for (const [t, pk] of [[0, 0.95], [0.25, 0.6]]) {
      v.tone({ t, f: 72, f1: 38, glide: 0.09, a: 0.004, d: 0.22, peak: pk, dest: lp });
      v.burst({ t, kind: 'brown', a: 0.004, d: 0.1, peak: pk * 0.5, filters: [{ type: 'lowpass', f: 160, q: 0.7 }], dest: lp });
    }
  },
};
