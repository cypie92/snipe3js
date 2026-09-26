// WebGL renderer + post-processing stack (pmndrs postprocessing + N8AO).
// Pass order (high):  Render -> N8AO -> [DOF, only while scoped] -> Overlay (first-person rifle, after AO)
//   -> Grade pass [scope lens CA, bloom, tone map, grade + silhouette darkening + vignette] -> SMAA (last).
// The LAST pass must always stay enabled (pmndrs only routes the last pass to the screen); optional passes
// (DOF, overlay) sit in the middle. Quality presets only change which passes exist and their resolution.
import * as THREE from 'three';
import {
  EffectComposer, RenderPass, EffectPass, BloomEffect, SMAAEffect, SMAAPreset, FXAAEffect,
  ToneMappingEffect, ToneMappingMode, DepthOfFieldEffect,
} from 'postprocessing';
import { N8AOPostPass } from 'n8ao';
import { GradeEffect, ScopeLensEffect, OverlayPass, setOverlayLayer, viewState } from '../gfx/post.js';

// Budget notes (1920x1080, DPR 1): high ~ 13 full-screen-equivalent passes (AO half-res), medium ~ 8, low ~ 2.
export const QUALITY = {
  low: {
    pixelRatio: 1, ao: false, bloom: false, aa: 'fxaa', dof: false, outline: false, lens: false,
    overlay: false, shadowMapSize: 2048, shadowRadius: 1.5,
  },
  medium: {
    pixelRatio: 1.25, ao: true, aoHalfRes: true, aoQuality: 'Low', bloom: true, aa: 'fxaa', dof: false,
    outline: true, lens: false, overlay: true, shadowMapSize: 2048, shadowRadius: 2,
  },
  high: {
    pixelRatio: 1.5, ao: true, aoHalfRes: true, aoQuality: 'Medium', bloom: true, aa: 'smaa', dof: true,
    outline: true, lens: true, overlay: true, shadowMapSize: 4096, shadowRadius: 3,
  },
};

/** Look defaults. Environment presets may override any key via scene.userData.grade. */
export const GRADE_DEFAULTS = {
  exposure: 1.0,
  lift: [0.018, 0.012, 0.045], // shadows drift toward blue-purple, never black
  gain: [1.02, 1.0, 0.975], // a touch of sunshine in the highlights
  gamma: 1.0,
  contrast: 0.14,
  saturation: 1.04,
  vibrance: 0.22, // boosts dull colours more than already-saturated ones (no neon clipping)
  green: [0.84, 0.012, 0.97], // calmer yellow-greens: saturation x, hue shift (turns), lightness x
  vignette: [0.55, 1.15, 0.22],
  vignetteColor: '#3b3560',
  outline: 0.34,
  outlineColor: '#35305a',
  outlineThreshold: 0.022,
  outlineFade: [150, 330],
  bloom: { intensity: 0.55, threshold: 1.05, smoothing: 0.35, radius: 0.72 },
  ao: { radius: 2.6, falloff: 1.0, intensity: 3.0, color: '#2a2552' },
};

const clone = (o) => JSON.parse(JSON.stringify(o));
const SCOPE_RADIUS = 0.47; // HUD scope circle radius as a fraction of min(width, height)

export class Renderer {
  constructor({ canvas, quality = 'high', tone = 'NEUTRAL' } = {}) {
    this.toneName = ToneMappingMode[tone] !== undefined ? tone : 'NEUTRAL';
    this.toneMode = ToneMappingMode[this.toneName];
    this.quality = QUALITY[quality] ? quality : 'high';
    this.q = QUALITY[this.quality];
    const r = new THREE.WebGLRenderer({
      canvas, powerPreference: 'high-performance', antialias: false, stencil: false, depth: false,
    });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.q.pixelRatio));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NoToneMapping; // done in post
    this.renderer = r;
    this.scope = 0;
    this.focusDistance = 60;
    this.focusTarget = 60;
    this.size = new THREE.Vector2(1, 1);
    this.grade = clone(GRADE_DEFAULTS);
    this.gradeSource = null;
    this.toggles = { ao: true, bloom: true, outline: true, grade: true, dof: true, lens: true, tilt: false };
    this.viewmodel = null;
    this.vmSearch = 0;
  }

  /** Switch quality preset at runtime (pixel ratio, post stack, shadow map resolution). */
  setQuality(name) {
    if (!QUALITY[name]) return;
    this.quality = name;
    this.q = QUALITY[name];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.q.pixelRatio));
    this.applyShadowQuality();
    this.build();
    if (this.size.x > 1) this.setSize(this.size.x, this.size.y);
  }

  attach(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.applyShadowQuality();
    this.build();
  }

  setCamera(camera) {
    this.camera = camera;
    this.build();
  }

  /**
   * Render this object tree (the first-person rifle) in its own pass after AO: no AO halos or
   * self-occlusion blotches on a model 0.3 m from the lens. Found automatically when it is a child of
   * the camera named 'viewmodel'; call this to be explicit.
   */
  setViewmodel(root) {
    this.viewmodel = root;
    if (root && this.overlayPass) {
      setOverlayLayer(root);
      this.overlayPass.root = root;
    }
  }

  /** Live grade tweaks (look-dev). Partial objects merge into the current grade. */
  setGrade(partial = {}) {
    for (const [k, v] of Object.entries(partial)) {
      this.grade[k] = v && typeof v === 'object' && !Array.isArray(v) ? { ...this.grade[k], ...v } : v;
    }
    this.applyGrade();
  }

  /** A/B switches for look-dev: { ao, bloom, outline, grade, dof, lens, tilt (unscoped miniature DOF) }. */
  setToggles(t = {}) {
    for (const k of Object.keys(this.toggles)) if (k in t) this.toggles[k] = !!t[k];
    this.applyGrade();
  }

  applyShadowQuality() {
    const { q, scene } = this;
    if (!scene) return;
    scene.traverse((o) => {
      if (!o.isDirectionalLight || !o.castShadow) return;
      const s = o.shadow;
      s.radius = q.shadowRadius;
      if (s.mapSize.x !== q.shadowMapSize) {
        s.mapSize.set(q.shadowMapSize, q.shadowMapSize);
        s.map?.dispose();
        s.map = null;
      }
      o.userData.refreshShadow?.();
    });
  }

  build() {
    const { renderer: r, scene, camera, q } = this;
    if (!scene || !camera) return;
    if (this.composer) this.composer.dispose();
    const composer = new EffectComposer(r, { frameBufferType: THREE.HalfFloatType });
    this.composer = composer;
    composer.addPass(new RenderPass(scene, camera));
    this.passes = ['render'];

    this.ao = null;
    if (q.ao) {
      const s = r.getDrawingBufferSize(new THREE.Vector2());
      const ao = new N8AOPostPass(scene, camera, Math.max(1, s.x), Math.max(1, s.y));
      // Never auto-enable transparency mode: it re-renders the whole scene twice per frame.
      ao.configuration.transparencyAware = false;
      ao.configuration.gammaCorrection = false;
      ao.configuration.halfRes = !!q.aoHalfRes;
      ao.setQualityMode(q.aoQuality || 'Medium');
      composer.addPass(ao);
      this.ao = ao;
      this.passes.push(`n8ao(${q.aoQuality}${q.aoHalfRes ? ',half' : ''})`);
    }

    this.dof = null;
    this.dofPass = null;
    if (q.dof) {
      this.dof = new DepthOfFieldEffect(camera, { focusDistance: 60, focusRange: 25, bokehScale: 0, resolutionScale: 0.5 });
      // Circle of confusion with separate near/far ramps (world metres): scoped = an in-focus plateau
      // around the reticle target; optional unscoped "miniature" mode = only the very near foreground and
      // the far backdrop soften, the whole 25-150 m playfield stays sharp.
      const coc = this.dof.cocMaterial;
      coc.uniforms.uNear = { value: new THREE.Vector2(0, 0) };
      coc.uniforms.uFar = { value: new THREE.Vector2(1e6, 2e6) };
      const src = coc.fragmentShader;
      coc.fragmentShader = src
        .replace('uniform float focusRange;', 'uniform float focusRange;uniform vec2 uNear;uniform vec2 uFar;')
        .replace(/float signedDistance=distance-focusDistance;.*?gl_FragColor\.rg=magnitude\*vec2\(step\(signedDistance,0\.0\),step\(0\.0,signedDistance\)\);/,
          'gl_FragColor.rg=vec2(1.0-smoothstep(uNear.x,uNear.y,distance),smoothstep(uFar.x,uFar.y,distance));');
      this.cocPatched = coc.fragmentShader !== src;
      coc.needsUpdate = true;
      this.dofPass = new EffectPass(camera, this.dof);
      this.dofPass.enabled = false;
      composer.addPass(this.dofPass);
      this.passes.push('dof(scoped,half)');
    }

    this.overlayPass = null;
    if (q.overlay) {
      this.overlayPass = new OverlayPass(scene, camera, composer.depthRenderTarget);
      composer.addPass(this.overlayPass);
      if (this.viewmodel) this.setViewmodel(this.viewmodel);
      this.passes.push('overlay(viewmodel)');
    }

    // Grade pass: one merged shader. Convolution effects (lens CA / FXAA) must come first.
    const effects = [];
    this.lens = null;
    this.fxaa = null;
    if (q.lens) effects.push((this.lens = new ScopeLensEffect()));
    else if (q.aa === 'fxaa') effects.push((this.fxaa = new FXAAEffect()));
    this.bloom = null;
    if (q.bloom) {
      const b = this.grade.bloom;
      this.bloom = new BloomEffect({
        intensity: b.intensity, luminanceThreshold: b.threshold, luminanceSmoothing: b.smoothing, mipmapBlur: true, radius: b.radius,
      });
      effects.push(this.bloom);
    }
    this.tone = new ToneMappingEffect({ mode: this.toneMode });
    this.gradeFx = new GradeEffect({ outline: !!q.outline });
    effects.push(this.tone, this.gradeFx);
    const gradePass = new EffectPass(camera, ...effects);
    composer.addPass(gradePass);
    this.passes.push(`grade(${effects.map((e) => e.name.replace('Effect', '')).join('+')})`);

    let last = gradePass;
    if (q.aa === 'smaa') {
      last = new EffectPass(camera, new SMAAEffect({ preset: SMAAPreset.HIGH }));
      composer.addPass(last);
      this.passes.push('smaa');
    }
    last.dithering = true; // 8-bit output: dither away sky/fog gradient banding

    this.applyGrade();
    if (this.size.x > 1) composer.setSize(this.size.x, this.size.y);
  }

  applyGrade() {
    const g = this.grade;
    const t = this.toggles;
    this.renderer.toneMappingExposure = g.exposure;
    if (this.gradeFx) {
      const neutral = { ...g, lift: [0, 0, 0], gain: [1, 1, 1], gamma: 1, contrast: 0, saturation: 1, vibrance: 0, green: [1, 0, 1] };
      this.gradeFx.apply(t.grade ? g : neutral);
      if (!t.outline) this.gradeFx.uniforms.get('uOutline').value.x = 0;
      this.gradeFx.outlineWidth = Math.max(1, this.renderer.getPixelRatio());
      this.gradeFx.scopeRadius = SCOPE_RADIUS * Math.min(1, this.size.x / Math.max(1, this.size.y));
    }
    if (this.lens) this.lens.scopeRadius = SCOPE_RADIUS * Math.min(1, this.size.x / Math.max(1, this.size.y));
    if (this.bloom) {
      const b = g.bloom;
      this.bloom.intensity = t.bloom ? b.intensity : 0;
      this.bloom.luminanceMaterial.threshold = b.threshold;
      this.bloom.luminanceMaterial.smoothing = b.smoothing;
    }
    if (this.ao) {
      const a = g.ao;
      const c = this.ao.configuration;
      c.aoRadius = a.radius;
      c.distanceFalloff = a.falloff;
      c.intensity = a.intensity;
      c.color = new THREE.Color(a.color);
      this.ao.enabled = t.ao;
    }
  }

  setSize(w, h) {
    this.size.set(w, h);
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
    this.applyGrade();
  }

  /** amount 0..1 scope blend; focus = world distance of what is under the reticle. */
  setScope(amount, focus) {
    this.scope = amount;
    viewState.scope = amount;
    if (focus) this.focusTarget = focus;
    if (amount < 0.01) this.focusDistance = this.focusTarget; // start each scope-in already focused
  }

  /** Pick up per-preset grade overrides that Environment publishes on scene.userData.grade. */
  syncGrade() {
    const src = this.scene?.userData.grade || null;
    if (src === this.gradeSource) return;
    this.gradeSource = src;
    this.grade = clone(GRADE_DEFAULTS);
    if (src) this.setGrade(src);
    else this.applyGrade();
  }

  findViewmodel() {
    if (this.viewmodel || !this.camera || !this.overlayPass) return;
    if (this.vmSearch++ % 30) return;
    const vm = this.camera.children.find((c) => c.name === 'viewmodel');
    if (vm) this.setViewmodel(vm);
  }

  render(dt = 1 / 60) {
    this.syncGrade();
    this.findViewmodel();
    const a = this.scope;
    // Smooth focus pull (critically damped-ish, frame-rate independent).
    this.focusDistance += (this.focusTarget - this.focusDistance) * (1 - Math.exp(-Math.max(dt, 1 / 240) * 7));
    if (this.dofPass) {
      const scoped = a > 0.02 && this.toggles.dof;
      const mini = !scoped && this.toggles.tilt && this.cocPatched;
      this.dofPass.enabled = scoped || mini;
      const coc = this.dof.cocMaterial;
      if (scoped) {
        const f = this.focusDistance;
        const R = THREE.MathUtils.clamp(f * 0.5, 8, 80);
        if (this.cocPatched) {
          coc.uniforms.uNear.value.set(f - R, f - R * 0.22);
          coc.uniforms.uFar.value.set(f + R * 0.22, f + R);
        } else {
          coc.focusDistance = f;
          coc.focusRange = R;
        }
        // Narrower field of view = shallower depth of field (like a real long lens).
        const zoom = Math.tan(THREE.MathUtils.degToRad(29)) / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
        this.dof.bokehScale = THREE.MathUtils.smoothstep(a, 0.02, 1) * THREE.MathUtils.clamp(1.1 + zoom * 0.16, 1.3, 2.4);
      } else if (mini) {
        coc.uniforms.uNear.value.set(5, 14);
        coc.uniforms.uFar.value.set(230, 560);
        this.dof.bokehScale = 1.3;
      }
    }
    if (this.lens) this.lens.amount = this.toggles.lens ? 0.012 * THREE.MathUtils.smoothstep(a, 0.3, 1) : 0;
    if (this.gradeFx) this.gradeFx.scope = THREE.MathUtils.smoothstep(a, 0.3, 1);
    this.composer.render(dt);
  }

  /** Pass list + buffer sizes (perf notes / look-dev HUD). */
  stats() {
    const s = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    return { quality: this.quality, buffer: `${s.x}x${s.y}`, passes: this.passes.join(' > ') };
  }

  get info() {
    return this.renderer.info;
  }
}
