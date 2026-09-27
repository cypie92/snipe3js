// WebGL renderer + post-processing stack (pmndrs postprocessing + N8AO).
// Pass order (high): Render -> N8AO (half res) -> DOF (half res: scoped = focus on the reticle target,
//   unscoped = subtle "miniature" blur of the far backdrop only) -> Overlay (first-person rifle, drawn after AO) ->
//   Grade pass [scope lens CA | FXAA, silhouette darkening, bloom, tone map, grade + vignette] -> SMAA.
// The LAST pass must always stay enabled (pmndrs only routes the last pass to the screen); optional passes
// (DOF, overlay) sit in the middle. Quality presets only change which passes exist and their resolution.
// Runtime switches (setScope, setToggles, setGrade) only touch uniforms/enabled flags: no shader recompiles.
// Shadow casters are culled per frame against the view (see installShadowCulling): only casters whose shadow
// can land on screen are drawn into the sun's shadow map.
import * as THREE from 'three';
import {
  EffectComposer, RenderPass, EffectPass, BloomEffect, SMAAEffect, SMAAPreset, FXAAEffect,
  ToneMappingEffect, ToneMappingMode, DepthOfFieldEffect, EffectAttribute,
} from 'postprocessing';
import { N8AOPostPass } from 'n8ao';
import { EdgeEffect, GradeEffect, ScopeLensEffect, OverlayPass, VIEWMODEL_LAYER, viewState } from '../gfx/post.js';

// Budget notes (1080p, DPR 1): high = main + 4096 shadow + N8AO(half) + DOF(half) + bloom mips + grade + SMAA
// (~10 full-screen equivalents); medium = main + 2048 shadow + N8AO Low(half) + bloom + grade (~5);
// low = main + 2048 shadow + one grade pass with FXAA (~2). Pixel ratio caps: 1.5 / 1.25 / 1.
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
    tilt: true, outline: true, lens: true, overlay: true, shadowMapSize: 4096, shadowRadius: 3,
  },
};

/** Look defaults. Environment presets may override any key via scene.userData.grade. */
export const GRADE_DEFAULTS = {
  exposure: 1.03,
  lift: [0.012, 0.01, 0.075], // shadows drift toward blue-purple, never black
  gain: [1.02, 1.0, 0.975], // a touch of sunshine in the highlights
  gamma: 1.0,
  contrast: 0.16,
  saturation: 1.05,
  vibrance: 0.22, // boosts dull colours more than already-saturated ones (no neon clipping)
  green: [0.92, 0.01, 1.02], // calmer yellow-greens: saturation x, hue shift (turns), lightness x
  vignette: [0.55, 1.15, 0.22],
  vignetteColor: '#3b3560',
  ground: [0.3, 0.42, 0.0], // graduated ground filter: strength, ramp from uv.y 0.42 down to the bottom edge
  groundColor: '#8f9bd6', // multiplies: deepens + cools the near foreground
  outline: 0.34,
  outlineColor: '#35305a',
  outlineThreshold: 0.022,
  outlineFade: [150, 330],
  bloom: { intensity: 0.55, threshold: 1.05, smoothing: 0.35, radius: 0.72 },
  // unscoped "miniature" DOF (toggles.tilt): only the far backdrop softens (blur ramps in over [0]..[1] m).
  // Nothing near the lens is ever blurred (crow's-nest rail, office, bullet-cam and intro close-ups), and
  // the whole 25-150 m playfield stays sharp.
  tilt: { far: [160, 420], bokeh: 1.6 },
  ao: { radius: 3.2, falloff: 1.0, intensity: 3.6, color: '#2a2552' },
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
    // Scene materials always render into the composer's linear HalfFloat buffer, never to the screen.
    // WebGLRenderer.compile() builds programs for the *current* target, and with the screen bound it
    // compiles sRGB-output variants that are never used (doubling the program count while the real
    // variants still compile on the first frame). Precompile against the composer buffer instead.
    for (const fn of ['compile', 'compileAsync']) {
      const orig = r[fn].bind(r);
      r[fn] = (...args) => {
        const prev = r.getRenderTarget();
        if (prev === null && this.composer) r.setRenderTarget(this.composer.inputBuffer);
        try {
          return orig(...args);
        } finally {
          r.setRenderTarget(prev);
        }
      };
    }
    this.renderer = r;
    this.scope = 0;
    this.focusDistance = 60;
    this.focusTarget = 60;
    this.size = new THREE.Vector2(1, 1);
    this.grade = clone(GRADE_DEFAULTS);
    this.gradeSource = null;
    this.toggles = { ao: true, bloom: true, outline: true, grade: true, dof: true, lens: true, tilt: !!this.q.tilt };
    this.viewmodel = null;
    this.vmSearch = 0;
    this.shadowCull = true; // view-dependent shadow caster culling (A/B: renderer.shadowCull = false)
    this.dofNearSkip = true; // miniature DOF skips its near-field passes (A/B: renderer.dofNearSkip = false)
    this.shadowStats = { casters: 0, culled: 0 };
    this._clear = new THREE.Color();
    this.installShadowCulling();
  }

  /** Switch quality preset at runtime (pixel ratio, post stack, shadow map resolution). */
  setQuality(name) {
    if (!QUALITY[name]) return;
    this.quality = name;
    this.q = QUALITY[name];
    this.toggles.tilt = !!this.q.tilt;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.q.pixelRatio));
    this.applyShadowQuality();
    this.build();
    if (this.size.x > 1) this.setSize(this.size.x, this.size.y);
  }

  attach(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    viewState.camera = camera;
    this.applyShadowQuality();
    this.build();
  }

  setCamera(camera) {
    this.camera = camera;
    viewState.camera = camera;
    this.build();
  }

  /**
   * Render this object tree (the first-person rifle) in its own pass after AO: no AO halos or
   * self-occlusion blotches on a model 0.3 m from the lens. Found automatically when it is a child of
   * the camera named 'viewmodel'; call this to be explicit.
   */
  setViewmodel(root) {
    this.viewmodel = root;
    if (!root) return;
    // with the overlay pass it lives on its own layer; without it (low) it renders in the main pass
    const layer = this.overlayPass ? VIEWMODEL_LAYER : 0;
    root.traverse((o) => o.layers.set(layer));
    if (this.overlayPass) this.overlayPass.root = root;
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
      // Never auto-enable transparency mode: it traverses the scene every frame and, once it finds any
      // transparent material, re-renders the whole scene twice per frame. (Setting transparencyAware=false
      // while it is already false does not clear the auto-detect flag, so clear it explicitly.)
      ao.autoDetectTransparency = false;
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
      coc.uniforms.uNear = { value: new THREE.Vector2(-2, -1) };
      coc.uniforms.uFar = { value: new THREE.Vector2(1e6, 2e6) };
      const src = coc.fragmentShader;
      coc.fragmentShader = src
        .replace('uniform float focusRange;', 'uniform float focusRange;uniform vec2 uNear;uniform vec2 uFar;')
        .replace(/float signedDistance=distance-focusDistance;.*?gl_FragColor\.rg=magnitude\*vec2\(step\(signedDistance,0\.0\),step\(0\.0,signedDistance\)\);/,
          'gl_FragColor.rg=vec2(1.0-smoothstep(uNear.x,uNear.y,distance),smoothstep(uFar.x,uFar.y,distance));');
      this.cocPatched = coc.fragmentShader !== src;
      coc.needsUpdate = true;
      this.patchFarOnly(this.dof);
      this.dofPass = new EffectPass(camera, this.dof);
      this.dofPass.enabled = false;
      composer.addPass(this.dofPass);
      this.passes.push(q.tilt ? 'dof(half: scoped + miniature)' : 'dof(half: scoped)');
    }

    this.overlayPass = null;
    if (q.overlay) {
      this.overlayPass = new OverlayPass(scene, camera, composer.depthRenderTarget);
      composer.addPass(this.overlayPass);
      this.passes.push('overlay(viewmodel)');
    }
    if (this.viewmodel) this.setViewmodel(this.viewmodel);

    // Grade pass: one merged shader. pmndrs orders merged effects CONVOLUTION > DEPTH > NONE (stable):
    //   [scope lens CA | FXAA] -> silhouette darkening -> bloom -> tone map -> display-space grade.
    // FXAA is promoted to the convolution tier so it always sees raw, consistent input.
    const effects = [];
    this.lens = null;
    this.fxaa = null;
    if (q.lens) effects.push((this.lens = new ScopeLensEffect()));
    else if (q.aa === 'fxaa') {
      this.fxaa = new FXAAEffect();
      this.fxaa.setAttributes(EffectAttribute.CONVOLUTION);
      effects.push(this.fxaa);
    }
    this.edgeFx = q.outline ? new EdgeEffect() : null;
    if (this.edgeFx) effects.push(this.edgeFx);
    this.bloom = null;
    if (q.bloom) {
      const b = this.grade.bloom;
      this.bloom = new BloomEffect({
        intensity: b.intensity, luminanceThreshold: b.threshold, luminanceSmoothing: b.smoothing, mipmapBlur: true, radius: b.radius,
      });
      // NaN guard: one bad pixel must never be smeared into big black blocks by the bloom mip chain.
      const lum = this.bloom.luminanceMaterial;
      lum.fragmentShader = lum.fragmentShader.replace('vec4 texel=texture2D(inputBuffer,vUv);',
        'vec4 texel=texture2D(inputBuffer,vUv);texel.rgb=(any(isnan(texel.rgb))||any(isinf(texel.rgb)))?vec3(0.0):min(texel.rgb,vec3(64.0));');
      lum.needsUpdate = true;
      effects.push(this.bloom);
    }
    this.tone = new ToneMappingEffect({ mode: this.toneMode });
    this.gradeFx = new GradeEffect();
    effects.push(this.tone, this.gradeFx);
    const gradePass = new EffectPass(camera, ...effects);
    composer.addPass(gradePass);
    this.passes.push(`grade(${effects.map((e) => e.name.replace('Effect', '')).join('+')})`);

    this.warm = 3; // run the whole DOF chain for a few frames so every one of its shaders compiles at load

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
      const neutral = { ...g, lift: [0, 0, 0], gain: [1, 1, 1], gamma: 1, contrast: 0, saturation: 1, vibrance: 0, green: [1, 0, 1], ground: [0, 0.45, 0] };
      this.gradeFx.apply(t.grade ? g : neutral);
      this.gradeFx.scopeRadius = SCOPE_RADIUS * Math.min(1, this.size.x / Math.max(1, this.size.y));
    }
    if (this.edgeFx) {
      this.edgeFx.apply(g, t.outline);
      this.edgeFx.width = Math.max(1, this.renderer.getPixelRatio());
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
    viewState.height = h; // CSS px: particles keep minimum / maximum on-screen sizes in these units
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
    if (this.viewmodel || !this.camera) return;
    if (this.vmSearch++ % 30) return;
    const vm = this.camera.children.find((c) => c.name === 'viewmodel');
    if (vm) this.setViewmodel(vm);
  }

  render(dt = 1 / 60) {
    this.syncGrade();
    this.findViewmodel();
    const zoom = Math.tan(THREE.MathUtils.degToRad(29)) / Math.tan(THREE.MathUtils.degToRad((this.camera.fov || 58) / 2));
    // Scope lens effects follow the real magnification: the smallest scope is 2x, while cinematics that
    // override the camera (bullet-cam fov 40-48 = ~1.3-1.5x) stay clean even if scopeT is still 1.
    const a = this.scope * THREE.MathUtils.smoothstep(zoom, 1.7, 1.95);
    // Smooth focus pull (critically damped-ish, frame-rate independent).
    this.focusDistance += (this.focusTarget - this.focusDistance) * (1 - Math.exp(-Math.max(dt, 1 / 240) * 7));
    // silhouettes matter most for small far objects; at high zoom targets are big, so ease off
    if (this.edgeFx) this.edgeFx.strengthScale = 1 - 0.5 * THREE.MathUtils.smoothstep(zoom, 2, 8) * THREE.MathUtils.smoothstep(a, 0.3, 1);
    if (this.dofPass) {
      const scoped = a > 0.02 && this.toggles.dof;
      const mini = !scoped && this.toggles.tilt && this.cocPatched;
      const warm = this.warm > 0;
      if (this.warm > 0) this.warm--;
      this.dofPass.enabled = scoped || mini || warm;
      // miniature = far-only: the near-field passes are skipped (their output would be zero anyway)
      this.dofFarOnly = mini && !warm && this.dofNearSkip;
      const coc = this.dof.cocMaterial;
      if (warm && !scoped && !mini) {
        if (this.cocPatched) {
          coc.uniforms.uNear.value.set(-2, -1);
          coc.uniforms.uFar.value.set(1e6, 2e6);
        }
        this.dof.bokehScale = 0;
      }
      if (scoped) {
        const f = this.focusDistance;
        // generous in-focus plateau (+-18% of the focus distance) so the target's neighbours stay readable
        const R = THREE.MathUtils.clamp(f * 0.6, 10, 90);
        if (this.cocPatched) {
          coc.uniforms.uNear.value.set(f - R, f - R * 0.3);
          coc.uniforms.uFar.value.set(f + R * 0.3, f + R);
        } else {
          coc.focusDistance = f;
          coc.focusRange = R;
        }
        // Narrower field of view = shallower depth of field (like a real long lens).
        this.dof.bokehScale = THREE.MathUtils.smoothstep(a, 0.02, 1) * THREE.MathUtils.clamp(1.0 + zoom * 0.1, 1.2, 1.8);
      } else if (mini) {
        const tl = this.grade.tilt;
        coc.uniforms.uNear.value.set(-2, -1); // never blur anything close to the lens
        coc.uniforms.uFar.value.set(tl.far[0], tl.far[1]);
        this.dof.bokehScale = tl.bokeh;
      }
    }
    if (this.lens) this.lens.amount = this.toggles.lens ? 0.005 * THREE.MathUtils.smoothstep(a, 0.3, 1) : 0;
    if (this.gradeFx) this.gradeFx.scope = THREE.MathUtils.smoothstep(a, 0.3, 1);
    this.composer.render(dt);
    this.sanitizeAO();
  }

  /**
   * Miniature mode only blurs the far backdrop, so the DOF's near-field work (CoC blur + two near bokeh
   * passes, 6 draws at half res) would only ever produce zeros: skip it and clear the near CoC buffer once
   * so a stale scoped frame can never bleed into the composite.
   */
  patchFarOnly(dof) {
    this.dofFarOnly = false;
    // internals of pmndrs DepthOfFieldEffect (6.x): if they ever change, keep the stock (full) update
    if (!dof.cocPass || !dof.maskPass || !dof.bokehFarBasePass || !dof.bokehFarFillPass || !dof.renderTargetCoCBlurred) return;
    let nearClean = false;
    const full = dof.update.bind(dof);
    dof.update = (renderer, inputBuffer, deltaTime) => {
      if (!this.dofFarOnly) {
        nearClean = false;
        return full(renderer, inputBuffer, deltaTime);
      }
      dof.cocPass.render(renderer, null, dof.renderTargetCoC);
      dof.maskPass.render(renderer, inputBuffer, dof.renderTargetMasked);
      dof.bokehFarBasePass.render(renderer, dof.renderTargetMasked, dof.renderTarget);
      dof.bokehFarFillPass.render(renderer, dof.renderTarget, dof.renderTargetFar);
      if (!nearClean) {
        this.clearTarget(dof.renderTargetCoCBlurred);
        nearClean = true;
      }
    };
  }

  clearTarget(rt) {
    const r = this.renderer;
    const prev = r.getRenderTarget();
    r.getClearColor(this._clear);
    const alpha = r.getClearAlpha();
    r.setRenderTarget(rt);
    r.setClearColor(0x000000, 0);
    r.clear(true, false, false);
    r.setClearColor(this._clear, alpha);
    r.setRenderTarget(prev);
  }

  /**
   * View-dependent shadow caster culling. The sun's shadow frustum spans the whole level, but a caster only
   * matters this frame if its shadow can land inside the camera view: its bounding sphere is swept along
   * the light down to the ground and the capsule is tested against the view frustum. Casters that fail are
   * skipped for this shadow render only (restored right after). Walls, roofs and props between a caster
   * and the ground all lie on the swept capsule, so a visible shadow is never dropped. Scoped views skip
   * most of the level; the overview skips what lies beside and behind the camera.
   */
  installShadowCulling() {
    const sm = this.renderer.shadowMap;
    const orig = sm.render.bind(sm);
    const frustum = new THREE.Frustum();
    const m = new THREE.Matrix4();
    const sph = new THREE.Sphere();
    const L = new THREE.Vector3();
    const T = new THREE.Vector3();
    const end = new THREE.Vector3();
    const skipped = [];
    let casters = [];
    let scanScene = null;
    let scanKids = -1;
    let scanIn = 0;
    const GROUND = -1.5; // lowest receiver (m)
    const visibleCapsule = (c, e, rad) => {
      for (const pl of frustum.planes) {
        if (pl.distanceToPoint(c) < -rad && pl.distanceToPoint(e) < -rad) return false;
      }
      return true;
    };
    sm.render = (lights, scene, camera) => {
      if (!this.shadowCull || (!sm.autoUpdate && !sm.needsUpdate) || !sm.enabled || lights.length !== 1 || !lights[0].isDirectionalLight || !camera?.isPerspectiveCamera) {
        return orig(lights, scene, camera);
      }
      const light = lights[0];
      L.setFromMatrixPosition(light.matrixWorld).sub(T.setFromMatrixPosition(light.target.matrixWorld)).normalize();
      if (L.y < 0.08) return orig(lights, scene, camera); // grazing sun: shadows too long to bound
      // re-collect casters when the scene changes (a level or the office was added/removed) and every
      // 30 frames otherwise; anything not collected yet is simply rendered (never wrongly culled)
      if (scanScene !== scene || scanKids !== scene.children.length || scanIn-- <= 0) {
        casters = [];
        scene.traverse((o) => { if (o.castShadow && o.frustumCulled && (o.isMesh || o.isLine || o.isPoints)) casters.push(o); });
        scanScene = scene;
        scanKids = scene.children.length;
        scanIn = 30;
      }
      m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(m);
      for (const o of casters) {
        if (!o.castShadow || !o.visible) continue;
        if (o.boundingSphere !== undefined) {
          if (o.boundingSphere === null) o.computeBoundingSphere();
          sph.copy(o.boundingSphere);
        } else {
          const g = o.geometry;
          if (!g) continue;
          if (g.boundingSphere === null) g.computeBoundingSphere();
          sph.copy(g.boundingSphere);
        }
        sph.applyMatrix4(o.matrixWorld);
        const rad = sph.radius * 1.1 + 0.35; // wind sway / animation slack
        const t = Math.max(0, (sph.center.y - GROUND + rad) / L.y);
        end.copy(sph.center).addScaledVector(L, -t);
        if (!visibleCapsule(sph.center, end, rad)) {
          o.castShadow = false;
          skipped.push(o);
        }
      }
      this.shadowStats.casters = casters.length;
      this.shadowStats.culled = skipped.length;
      try {
        return orig(lights, scene, camera);
      } finally {
        for (const o of skipped) o.castShadow = true;
        skipped.length = 0;
      }
    };
  }

  /**
   * NaN guard at the earliest post stage: N8AO's composite is the first pass that reads the scene colour,
   * so a stray NaN from any custom shader is zeroed there before the DOF blur or bloom could spread it into
   * big black blocks. N8AO (re)creates this material lazily (first frame), so patch whatever is current.
   */
  sanitizeAO() {
    const m = this.ao?.effectCompositerQuad?.material;
    if (!m || m.userData.nanSafe) return;
    m.userData.nanSafe = true;
    const line = 'vec4 sceneTexel = texture2D(sceneDiffuse, vUv);';
    if (!m.fragmentShader.includes(line)) return;
    m.fragmentShader = m.fragmentShader.replace(line,
      `${line}\n        if (any(isnan(sceneTexel)) || any(isinf(sceneTexel))) sceneTexel = vec4(0.0, 0.0, 0.0, 1.0);`);
    m.needsUpdate = true;
  }

  /** Pass list + buffer sizes (perf notes / look-dev HUD). */
  stats() {
    const s = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    return {
      quality: this.quality, buffer: `${s.x}x${s.y}`, passes: this.passes.join(' > '),
      shadowCasters: this.shadowStats.casters, shadowCulled: this.shadowStats.culled,
    };
  }

  get info() {
    return this.renderer.info;
  }
}
