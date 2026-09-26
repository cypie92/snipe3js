// Shared materials. Most geometry is vertex-coloured and uses toy/facet so it batches well.
import * as THREE from 'three';

// NaN-safe flat shading (all flatShading materials: facet, foliage, backdrop, particles...).
// three computes flat normals as normalize(cross(dFdx(p), dFdy(p))); for tiny/far or degenerate
// triangles the cross product collapses to zero and the normal becomes NaN, which bloom then smears
// into large black blocks. Fall back to world-up (in view space) when the derivatives are degenerate.
{
  const FLAT = 'vec3 normal = normalize( cross( fdx, fdy ) );';
  const chunk = THREE.ShaderChunk.normal_fragment_begin;
  if (chunk.includes(FLAT)) {
    THREE.ShaderChunk.normal_fragment_begin = chunk.replace(FLAT, `vec3 flatN = cross( fdx, fdy );
	float flatL = length( flatN );
	vec3 normal = flatL > 1e-5 * length( fdx ) * length( fdy ) && flatL > 1e-20
		? flatN / flatL : normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );`);
  } else {
    console.warn('[materials] flat-normal guard not applied (three chunk changed)');
  }
}

const toy = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.0 });
toy.name = 'toy';

const facet = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.0, flatShading: true });
facet.name = 'facet';

// Foliage gets its own material so the tech-art pass can add wind sway without touching kit code.
const foliage = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.0, flatShading: true });
foliage.name = 'foliage';

const glossy = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0.0 });
glossy.name = 'glossy';

const metal = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.6 });
metal.name = 'metal';

const glass = new THREE.MeshStandardMaterial({ color: '#9fdcf7', roughness: 0.08, metalness: 0.1, envMapIntensity: 1.6 });
glass.name = 'glass';

const unlit = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true });
unlit.name = 'unlit';

const emissiveCache = new Map();
/** Glowing material (lamps, neon, fire). Bloom picks these up. */
function emissive(color = '#ffe6a0', intensity = 2.0) {
  const key = `${color}|${intensity}`;
  if (!emissiveCache.has(key)) {
    const m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.5 });
    m.name = `emissive-${key}`;
    emissiveCache.set(key, m);
  }
  return emissiveCache.get(key);
}

const solidCache = new Map();
/** Plain single-colour material (for the rare object that cannot use vertex colours). */
function solid(color, { roughness = 0.62, metalness = 0, transparent = false, opacity = 1 } = {}) {
  const key = `${color}|${roughness}|${metalness}|${opacity}`;
  if (!solidCache.has(key)) {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness, transparent, opacity });
    solidCache.set(key, m);
  }
  return solidCache.get(key);
}

export const materials = { toy, facet, foliage, glossy, metal, glass, unlit, emissive, solid };
