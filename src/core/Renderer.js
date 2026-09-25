// WebGL renderer + post-processing stack (pmndrs postprocessing + N8AO).
// Pass order: Render -> AO -> DOF (scope) -> [bloom, tone map, grade, vignette] -> SMAA -> lens (scope).
import * as THREE from 'three';
import {
  EffectComposer, RenderPass, EffectPass, BloomEffect, SMAAEffect, SMAAPreset,
  ToneMappingEffect, ToneMappingMode, VignetteEffect, HueSaturationEffect,
  BrightnessContrastEffect, ChromaticAberrationEffect, DepthOfFieldEffect,
} from 'postprocessing';
import { N8AOPostPass } from 'n8ao';

export const QUALITY = {
  low: { pixelRatio: 1, ao: false, bloom: false, smaa: false, dof: false, shadowMapSize: 2048 },
  medium: { pixelRatio: 1.25, ao: true, aoHalfRes: true, bloom: true, smaa: true, dof: false, shadowMapSize: 2048 },
  high: { pixelRatio: 1.75, ao: true, aoHalfRes: true, bloom: true, smaa: true, dof: true, shadowMapSize: 4096 },
};

export class Renderer {
  constructor({ canvas, quality = 'high', tone = 'NEUTRAL' } = {}) {
    this.toneName = tone;
    this.toneMode = ToneMappingMode[tone] ?? ToneMappingMode.NEUTRAL;
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
    this.size = new THREE.Vector2(1, 1);
  }

  /** Switch quality preset at runtime (pixel ratio + post stack). */
  setQuality(name) {
    if (!QUALITY[name]) return;
    this.quality = name;
    this.q = QUALITY[name];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.q.pixelRatio));
    this.build();
    if (this.size.x > 1) this.setSize(this.size.x, this.size.y);
  }

  attach(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.build();
  }

  setCamera(camera) {
    this.camera = camera;
    this.build();
  }

  build() {
    const { renderer: r, scene, camera, q } = this;
    if (this.composer) this.composer.dispose();
    const composer = new EffectComposer(r, { frameBufferType: THREE.HalfFloatType });
    composer.addPass(new RenderPass(scene, camera));

    this.ao = null;
    if (q.ao) {
      const s = r.getDrawingBufferSize(new THREE.Vector2());
      const ao = new N8AOPostPass(scene, camera, Math.max(1, s.x), Math.max(1, s.y));
      Object.assign(ao.configuration, {
        aoRadius: 2.0, distanceFalloff: 1.0, intensity: 2.4, halfRes: !!q.aoHalfRes, gammaCorrection: false,
      });
      ao.configuration.color = new THREE.Color('#2c2f5a');
      ao.setQualityMode('Medium');
      composer.addPass(ao);
      this.ao = ao;
    }

    this.dof = null;
    this.dofPass = null;
    if (q.dof) {
      this.dof = new DepthOfFieldEffect(camera, { focusDistance: 60, focusRange: 25, bokehScale: 2.5, resolutionScale: 0.5 });
      this.dofPass = new EffectPass(camera, this.dof);
      this.dofPass.enabled = false;
      composer.addPass(this.dofPass);
    }

    // Lens chromatic aberration lives in the always-on grade pass (the last pass must stay enabled,
    // pmndrs only routes the last-added pass to the screen). Offset is zero when not scoped.
    this.ca = new ChromaticAberrationEffect({ offset: new THREE.Vector2(0, 0), radialModulation: true, modulationOffset: 0.35 });
    const grade = [this.ca];
    this.bloom = null;
    if (q.bloom) {
      this.bloom = new BloomEffect({ intensity: 0.45, luminanceThreshold: 0.86, luminanceSmoothing: 0.18, mipmapBlur: true, radius: 0.72 });
      grade.push(this.bloom);
    }
    this.tone = new ToneMappingEffect({ mode: this.toneMode });
    this.hueSat = new HueSaturationEffect({ saturation: this.toneName === 'NEUTRAL' ? -0.04 : 0.14 });
    this.contrast = new BrightnessContrastEffect({ brightness: 0.0, contrast: 0.08 });
    this.vignette = new VignetteEffect({ offset: 0.3, darkness: 0.32 });
    grade.push(this.tone, this.hueSat, this.contrast, this.vignette);
    composer.addPass(new EffectPass(camera, ...grade));

    if (q.smaa) composer.addPass(new EffectPass(camera, new SMAAEffect({ preset: SMAAPreset.HIGH })));

    this.composer = composer;
    if (this.size.x > 1) composer.setSize(this.size.x, this.size.y);
  }

  setSize(w, h) {
    this.size.set(w, h);
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
  }

  /** amount 0..1 scope blend; focus = world distance of what is under the reticle. */
  setScope(amount, focus) {
    this.scope = amount;
    if (focus) this.focusDistance += (focus - this.focusDistance) * 0.25;
    this.ca.offset.set(0.0022 * amount, 0.0012 * amount);
    if (this.dofPass) {
      this.dofPass.enabled = amount > 0.5;
      this.dof.cocMaterial.focusDistance = this.focusDistance;
      this.dof.cocMaterial.focusRange = Math.max(6, this.focusDistance * 0.3);
      this.dof.bokehScale = 2.2 * amount;
    }
    this.vignette.darkness = 0.32 + 0.25 * amount;
  }

  render(dt) {
    this.composer.render(dt);
  }

  get info() {
    return this.renderer.info;
  }
}
