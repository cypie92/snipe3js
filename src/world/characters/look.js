// Character look: the shared character material (materials.toy + a warm rim that fades in with camera
// distance, so far-away folk separate from busy backgrounds while close-ups stay untouched) and a
// global character scale. One extra shader program for all characters; no extra draw calls.
import * as THREE from 'three';
import { materials } from '../../gfx/materials.js';

/** Shared rim uniforms: change them at runtime with setCharacterLook(). */
export const LOOK = {
  uRimStrength: { value: 0.45 },
  uRimPower: { value: 2.4 },
  uRimNear: { value: 25 }, // rim starts to appear (m from camera)
  uRimFar: { value: 85 }, // full strength beyond this
  uRimColor: { value: new THREE.Color('#fff1d8') },
};

/** Tune the distance rim: { rim, power, near, far, color }. rim: 0 disables it. */
export function setCharacterLook({ rim, power, near, far, color } = {}) {
  if (rim != null) LOOK.uRimStrength.value = rim;
  if (power != null) LOOK.uRimPower.value = power;
  if (near != null) LOOK.uRimNear.value = near;
  if (far != null) LOOK.uRimFar.value = far;
  if (color != null) LOOK.uRimColor.value.set(color);
}

/** Global size multiplier for characters created from now on (e.g. 1.1 for a far-away level). */
export const CHARACTER = { scale: 1 };
export function setCharacterScale(k = 1) { CHARACTER.scale = k; }

export function injectRim(shader) {
  Object.assign(shader.uniforms, LOOK);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>
uniform float uRimStrength; uniform float uRimPower; uniform float uRimNear; uniform float uRimFar; uniform vec3 uRimColor;`)
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  {
    float rimK = uRimStrength * smoothstep(uRimNear, uRimFar, length(vViewPosition));
    if (rimK > 0.0) {
      float facing = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
      totalEmissiveRadiance += uRimColor * pow(1.0 - facing, uRimPower) * rimK;
    }
  }`);
}

let charMat = null;
/** The material every character mesh uses (vertex colours, satin toy plastic + distance rim). */
export function characterMaterial() {
  if (!charMat) {
    charMat = materials.toy.clone();
    charMat.name = 'toy-character';
    charMat.onBeforeCompile = injectRim;
    charMat.customProgramCacheKey = () => 'toy-character';
  }
  return charMat;
}
