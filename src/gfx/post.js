// Custom post effects for the Renderer (pmndrs postprocessing):
//   GradeEffect     display-space colour grade (lift/gain/gamma, S-curve contrast, saturation + vibrance),
//                   depth-based silhouette darkening for readability, tinted vignette. Merges into one pass.
//   ScopeLensEffect radial chromatic aberration toward the scope rim (convolution; zero cost when unscoped).
//   OverlayPass     draws the first-person viewmodel after AO (no AO halos / self-occlusion blotches) and
//                   writes its depth into the composer's stable depth so later passes see it.
import * as THREE from 'three';
import { Effect, EffectAttribute, BlendFunction, Pass } from 'postprocessing';

export const VIEWMODEL_LAYER = 5;

const gradeFrag = /* glsl */ `
uniform vec3 uLift;
uniform vec3 uGain;
uniform float uGamma;
uniform float uContrast;
uniform float uSaturation;
uniform float uVibrance;
uniform vec4 uVignette;      // inner radius, outer radius, strength, scope amount (0..1)
uniform vec3 uVignetteColor;
uniform float uScopeRadius;  // scope circle radius in screen-height units
uniform vec4 uOutline;       // strength, width (texels), fade start (m), fade end (m)
uniform vec3 uOutlineColor;
uniform float uOutlineThreshold;

float invDist(const in vec2 uv) {
  return -1.0 / getViewZ(readDepth(uv));
}

void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
  vec3 c = clamp(inputColor.rgb, 0.0, 1.0);

#ifdef OUTLINE
  // Silhouette darkening: 1/z is affine across any plane in screen space, so its Laplacian is ~0 on flat
  // surfaces and creases and large only where this pixel sits in front of what surrounds it.
  float w0 = -1.0 / getViewZ(depth);
  vec2 o = texelSize * uOutline.y;
  float lap = (4.0 * w0 - invDist(uv + vec2(o.x, 0.0)) - invDist(uv - vec2(o.x, 0.0))
    - invDist(uv + vec2(0.0, o.y)) - invDist(uv - vec2(0.0, o.y))) / w0;
  float e = smoothstep(uOutlineThreshold, uOutlineThreshold * 3.0, lap);
  e *= 1.0 - smoothstep(uOutline.z, uOutline.w, 1.0 / w0);
  c *= mix(vec3(1.0), uOutlineColor, e * uOutline.x);
#endif

  // grade in a perceptual (gamma 2.2) space
  c = pow(c, vec3(1.0 / 2.2));
  c = uGain * (c + uLift * (1.0 - c));
  c = pow(clamp(c, 0.0, 1.0), vec3(uGamma));
  c = mix(c, c * c * (3.0 - 2.0 * c), uContrast);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float chroma = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
  c = mix(vec3(l), c, uSaturation + uVibrance * (1.0 - chroma) * (1.0 - chroma));

  // tinted vignette; when scoped it becomes a lens falloff toward the scope rim
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
  float r = length(p);
  float v = smoothstep(uVignette.x, uVignette.y, r) * uVignette.z;
  float lens = smoothstep(uScopeRadius * 0.45, uScopeRadius * 1.02, r) * 0.42 * uVignette.w;
  c = mix(c, c * uVignetteColor, clamp(v + lens, 0.0, 1.0));

  c = pow(clamp(c, 0.0, 1.0), vec3(2.2));
  outputColor = vec4(c, inputColor.a);
}
`;

export class GradeEffect extends Effect {
  constructor({ outline = true } = {}) {
    super('GradeEffect', gradeFrag, {
      blendFunction: BlendFunction.SRC,
      attributes: outline ? EffectAttribute.DEPTH : EffectAttribute.NONE,
      defines: outline ? new Map([['OUTLINE', '1']]) : new Map(),
      uniforms: new Map([
        ['uLift', new THREE.Uniform(new THREE.Vector3())],
        ['uGain', new THREE.Uniform(new THREE.Vector3(1, 1, 1))],
        ['uGamma', new THREE.Uniform(1)],
        ['uContrast', new THREE.Uniform(0)],
        ['uSaturation', new THREE.Uniform(1)],
        ['uVibrance', new THREE.Uniform(0)],
        ['uVignette', new THREE.Uniform(new THREE.Vector4(0.45, 1.05, 0.25, 0))],
        ['uVignetteColor', new THREE.Uniform(new THREE.Color('#3b3560'))],
        ['uScopeRadius', new THREE.Uniform(0.47)],
        ['uOutline', new THREE.Uniform(new THREE.Vector4(0.3, 1, 140, 320))],
        ['uOutlineColor', new THREE.Uniform(new THREE.Color('#2e2a4a'))],
        ['uOutlineThreshold', new THREE.Uniform(0.02)],
      ]),
    });
    this.hasOutline = outline;
  }

  /** Apply a grade settings object (see Renderer GRADE_DEFAULTS). */
  apply(g) {
    const u = this.uniforms;
    u.get('uLift').value.set(...g.lift);
    u.get('uGain').value.set(...g.gain);
    u.get('uGamma').value = g.gamma;
    u.get('uContrast').value = g.contrast;
    u.get('uSaturation').value = g.saturation;
    u.get('uVibrance').value = g.vibrance;
    const v = u.get('uVignette').value;
    v.x = g.vignette[0]; v.y = g.vignette[1]; v.z = g.vignette[2];
    u.get('uVignetteColor').value.set(g.vignetteColor);
    const o = u.get('uOutline').value;
    o.x = g.outline; o.z = g.outlineFade[0]; o.w = g.outlineFade[1];
    u.get('uOutlineColor').value.set(g.outlineColor);
    u.get('uOutlineThreshold').value = g.outlineThreshold;
  }

  set outlineWidth(px) { this.uniforms.get('uOutline').value.y = px; }
  set scope(amount) { this.uniforms.get('uVignette').value.w = amount; }
  set scopeRadius(r) { this.uniforms.get('uScopeRadius').value = r; }
}

const lensFrag = /* glsl */ `
uniform float uAmount;       // 0 = off
uniform float uScopeRadius;  // screen-height units
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  outputColor = inputColor;
  if (uAmount > 0.0) {
    vec2 d = uv - 0.5;
    float r = length(d * vec2(aspect, 1.0)) / uScopeRadius;
    vec2 s = d * uAmount * r * r * r;
    outputColor.r = texture2D(inputBuffer, uv + s).r;
    outputColor.b = texture2D(inputBuffer, uv - s * 0.8).b;
  }
}
`;

/** Radial chromatic aberration that grows toward the scope rim (true lens fringing, not a fixed shift). */
export class ScopeLensEffect extends Effect {
  constructor() {
    super('ScopeLensEffect', lensFrag, {
      blendFunction: BlendFunction.SRC,
      attributes: EffectAttribute.CONVOLUTION,
      uniforms: new Map([['uAmount', new THREE.Uniform(0)], ['uScopeRadius', new THREE.Uniform(0.47)]]),
    });
  }

  set amount(v) { this.uniforms.get('uAmount').value = v; }
  set scopeRadius(r) { this.uniforms.get('uScopeRadius').value = r; }
}

/**
 * Renders objects on VIEWMODEL_LAYER on top of the current buffer (after AO), then again into the
 * composer's stable depth target so outline/DOF passes treat them as the nearest surface.
 */
export class OverlayPass extends Pass {
  constructor(scene, camera, depthTarget = null) {
    super('OverlayPass', scene, camera);
    this.needsSwap = false;
    this.depthTarget = depthTarget;
    this.cam = new THREE.PerspectiveCamera();
    this.cam.matrixAutoUpdate = false;
    this.cam.matrixWorldAutoUpdate = false;
    this.cam.layers.set(VIEWMODEL_LAYER);
    this.root = null;
  }

  render(renderer, inputBuffer) {
    if (!this.root || !this.root.visible) return;
    const scene = this.scene;
    const src = this.camera;
    const cam = this.cam;
    cam.projectionMatrix.copy(src.projectionMatrix);
    cam.projectionMatrixInverse.copy(src.projectionMatrixInverse);
    cam.matrixWorld.copy(src.matrixWorld);
    cam.matrixWorldInverse.copy(src.matrixWorldInverse);
    cam.near = src.near;
    cam.far = src.far;

    const autoUpdate = renderer.shadowMap.autoUpdate;
    const worldAuto = scene.matrixWorldAutoUpdate;
    const background = scene.background;
    const autoClear = renderer.autoClear;
    renderer.shadowMap.autoUpdate = false; // the main pass already rendered this frame's shadow map
    scene.matrixWorldAutoUpdate = false; // matrices are current from the main pass
    scene.background = null;
    renderer.autoClear = false;

    renderer.setRenderTarget(this.renderToScreen ? null : inputBuffer);
    renderer.clearDepth();
    renderer.render(scene, cam);
    if (this.depthTarget) {
      renderer.setRenderTarget(this.depthTarget);
      renderer.render(scene, cam);
    }

    renderer.shadowMap.autoUpdate = autoUpdate;
    scene.matrixWorldAutoUpdate = worldAuto;
    scene.background = background;
    renderer.autoClear = autoClear;
  }
}

/** Put an object tree on the viewmodel layer (it then renders only in the OverlayPass). */
export function setOverlayLayer(root) {
  root.traverse((o) => o.layers.set(VIEWMODEL_LAYER));
}
