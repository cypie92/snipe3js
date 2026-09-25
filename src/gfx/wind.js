// Gentle wind sway for foliage (patched into materials.foliage). World-space, position-coherent
// displacement so merged / instanced / flat-shaded geometry never cracks.
export const windUniforms = { uTime: { value: 0 }, uWind: { value: 1 } };

export function applyWind(material, { amount = 1 } = {}) {
  material.userData.wind = amount;
  material.customProgramCacheKey = () => `wind-${amount}`;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniforms.uTime;
    shader.uniforms.uWind = windUniforms.uWind;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWind;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          vec4 wp = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            wp = instanceMatrix * wp;
          #endif
          wp = modelMatrix * wp;
          float h = clamp(wp.y - 0.3, 0.0, 8.0);
          float t = uTime;
          float gust = 0.6 + 0.4 * sin(t * 0.35 + wp.x * 0.02);
          float sx = sin(t * 1.25 + wp.x * 0.21 + wp.z * 0.13) + 0.45 * sin(t * 2.9 + wp.z * 0.47);
          float sz = sin(t * 1.05 + wp.z * 0.19 + 1.7) + 0.35 * sin(t * 3.3 + wp.x * 0.39);
          float leaf = sin(t * 7.0 + wp.x * 2.3 + wp.y * 3.1 + wp.z * 1.7);
          float k = ${amount.toFixed(3)} * uWind * gust;
          transformed.x += (sx * 0.028 * h + leaf * 0.018) * k;
          transformed.z += (sz * 0.022 * h + leaf * 0.012) * k;
          transformed.y += leaf * 0.01 * k;
        }`,
      );
  };
  material.needsUpdate = true;
  return material;
}
