// "Wet" materials for characters in water: identical to materials.toy, but every fragment whose
// skinned, mesh-local height is below 0 is discarded. A character's mesh-local y = 0 is its root, so a
// swimmer whose root sits ON the water surface shows only what is above the water (head, shoulders,
// splashing arms) whatever the water shader does. A matching depth material keeps the underwater part
// out of the shadow map. Shared by every wet character (one extra shader program, no extra draw calls).
import * as THREE from 'three';
import { materials } from '../../gfx/materials.js';

let wet = null;
let wetDepth = null;

function inject(shader) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying float vWetY;')
    .replace('#include <skinning_vertex>', '#include <skinning_vertex>\nvWetY = transformed.y;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying float vWetY;')
    .replace('void main() {', 'void main() {\n  if (vWetY < 0.0) discard;');
}

/** Toy material that hides everything below the character's root (mesh-local y < 0). */
export function wetMaterial() {
  if (!wet) {
    wet = materials.toy.clone();
    wet.name = 'toy-wet';
    wet.onBeforeCompile = inject;
    wet.customProgramCacheKey = () => 'toy-wet';
  }
  return wet;
}

/** Shadow-map depth material with the same waterline cut. */
export function wetDepthMaterial() {
  if (!wetDepth) {
    wetDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    wetDepth.name = 'depth-wet';
    wetDepth.onBeforeCompile = inject;
    wetDepth.customProgramCacheKey = () => 'depth-wet';
  }
  return wetDepth;
}

/** Switch a character mesh between dry and wet rendering. */
export function setWet(mesh, on) {
  if (!!mesh.userData.wet === !!on) return;
  mesh.userData.wet = !!on;
  if (on) {
    mesh.userData.dryMaterial = mesh.material;
    mesh.material = wetMaterial();
    mesh.customDepthMaterial = wetDepthMaterial();
  } else {
    mesh.material = mesh.userData.dryMaterial || materials.toy;
    mesh.customDepthMaterial = undefined;
  }
}
