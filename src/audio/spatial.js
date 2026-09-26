// Simple positional audio: stereo pan + distance attenuation + air absorption (low-pass), from a
// three.js-style camera (reads matrixWorld/fov/zoom only, so no three.js import is needed).
import { clamp } from './dsp.js';

export const SPATIAL = { refDistance: 25, rolloff: 0.35, minGain: 0.18, panWidth: 0.8 };

/** [x, y, z] from an Object3D, Vector3-like {x,y,z} or array; null if unusable. */
export function posOf(p) {
  if (!p) return null;
  let x, y, z;
  if (Array.isArray(p)) [x, y, z] = p;
  else if (p.isObject3D) {
    p.updateWorldMatrix?.(true, false);
    const m = p.matrixWorld?.elements;
    if (!m) return null;
    x = m[12]; y = m[13]; z = m[14];
  } else ({ x, y, z } = p);
  return [x, y, z].every(Number.isFinite) ? [x, y, z] : null;
}

/** Scope "focus" (1 = unzoomed): tracks the widest fov seen in `state.maxFov`. */
export function camFocus(cam, state) {
  let focus = cam.zoom || 1;
  if (cam.fov) {
    state.maxFov = Math.max(state.maxFov || 0, cam.fov);
    focus *= Math.tan((state.maxFov * Math.PI) / 360) / Math.tan((cam.fov * Math.PI) / 360);
  }
  return Math.max(1, focus);
}

/** { gain, pan, lowpass } for a source at `pos` heard from `cam`. */
export function spatialize(pos, cam, state = {}, cfg = SPATIAL) {
  const res = { gain: 1, pan: 0, lowpass: 20000 };
  const e = cam?.matrixWorld?.elements;
  const p = posOf(pos);
  if (!p || !e) return res;
  const dx = p[0] - e[12], dy = p[1] - e[13], dz = p[2] - e[14];
  const dist = Math.hypot(dx, dy, dz) || 1e-4;
  const right = (dx * e[0] + dy * e[1] + dz * e[2]) / ((Math.hypot(e[0], e[1], e[2]) || 1) * dist);
  const front = -(dx * e[8] + dy * e[9] + dz * e[10]) / ((Math.hypot(e[8], e[9], e[10]) || 1) * dist);
  // scoped in: things you look at feel closer (focus), but never louder than point-blank
  const d = dist / Math.sqrt(camFocus(cam, state));
  res.gain = Math.max(cfg.minGain, 1 / (1 + (cfg.rolloff * Math.max(0, d - cfg.refDistance)) / cfg.refDistance));
  res.pan = clamp(right, -1, 1) * cfg.panWidth;
  res.lowpass = 20000 / (1 + d / 55);
  if (front < 0) {
    res.lowpass *= 0.6 + 0.4 * (1 + front);
    res.gain *= 0.85 + 0.15 * (1 + front);
  }
  return res;
}
