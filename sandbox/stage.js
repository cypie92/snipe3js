// Asset preview "photo studio" that uses the game's real renderer, post stack and lighting.
// URL params:
//   preset=morning|noon|golden   quality=low|medium|high
//   cam=close|scope|top|wide     dist=<m> (scope distance)   zoom=<x> (scope zoom)   yaw=<deg>
//   focus=<index>  (which grid item the camera frames; default = centre of grid)
//   labels=0 to hide labels
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Renderer } from '../src/core/Renderer.js';
import { Environment } from '../src/gfx/Environment.js';
import { materials } from '../src/gfx/materials.js';
import { P } from '../src/gfx/palette.js';

export async function createStage(opts = {}) {
  const params = new URLSearchParams(location.search);
  const num = (k, d) => (params.has(k) ? Number(params.get(k)) : d);
  document.body.style.cssText = 'margin:0;overflow:hidden;background:#000;font-family:sans-serif';
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'display:block;width:100vw;height:100vh';
  document.body.appendChild(canvas);

  const renderer = new Renderer({ canvas, quality: params.get('quality') || opts.quality || 'high', tone: params.get('tone') || undefined });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 4000);
  const env = new Environment(scene, renderer.renderer, { shadowMapSize: renderer.q.shadowMapSize });
  env.apply(params.get('preset') || opts.preset || 'morning');

  if (opts.ground !== false) {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(800, 800).rotateX(-Math.PI / 2), materials.solid(P.grass, { roughness: 0.95 }));
    ground.receiveShadow = true;
    ground.name = 'ground';
    scene.add(ground);
  }
  renderer.attach(scene, camera);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;

  const labelLayer = document.createElement('div');
  labelLayer.style.cssText = 'position:fixed;inset:0;pointer-events:none';
  document.body.appendChild(labelLayer);
  const labels = [];
  const showLabels = params.get('labels') !== '0' && opts.labels !== false;

  const updaters = [];
  const items = [];
  const stage = {
    THREE, scene, camera, renderer, env, controls, params, items,
    /** Add an object at (x, z). */
    add(obj, x = 0, z = 0, ry = 0, label) {
      obj.position.x += x;
      obj.position.z += z;
      obj.rotation.y += ry;
      scene.add(obj);
      obj.traverse((o) => {
        if (o.isMesh) { o.castShadow = o.castShadow !== false; o.receiveShadow = true; }
      });
      if (typeof obj.update === 'function') updaters.push((dt, t) => obj.update(dt, t));
      if (obj.userData?.update) updaters.push(obj.userData.update);
      items.push(obj);
      if (label && showLabels) {
        const el = document.createElement('div');
        el.textContent = label;
        el.style.cssText = 'position:absolute;transform:translate(-50%,-100%);font:600 12px sans-serif;color:#fff;background:rgba(43,43,58,.75);padding:2px 6px;border-radius:6px;white-space:nowrap';
        labelLayer.appendChild(el);
        labels.push({ el, obj });
      }
      return obj;
    },
    /** Lay out [{object, label}] or objects in a grid. */
    grid(list, spacing = 8, cols) {
      const n = list.length;
      cols = cols || Math.ceil(Math.sqrt(n));
      const rows = Math.ceil(n / cols);
      list.forEach((it, i) => {
        const obj = it.object || it;
        const label = it.label || obj.name;
        const c = i % cols;
        const r = Math.floor(i / cols);
        stage.add(obj, (c - (cols - 1) / 2) * spacing, (r - (rows - 1) / 2) * spacing, 0, label);
      });
      stage.extent = Math.max(cols, rows) * spacing;
    },
    onUpdate(fn) { updaters.push(fn); },
    /** Frame the camera per URL params (cam=close|scope|top|wide). */
    frame(target = new THREE.Vector3(), size = stage.extent || 10) {
      const cam = params.get('cam') || opts.cam || 'close';
      const yaw = THREE.MathUtils.degToRad(num('yaw', opts.yaw ?? 25));
      const focusIdx = params.get('focus');
      if (focusIdx != null && items[Number(focusIdx)]) {
        const box = new THREE.Box3().setFromObject(items[Number(focusIdx)]);
        box.getCenter(target);
        size = box.getSize(new THREE.Vector3()).length();
      }
      if (cam === 'scope') {
        // What the player sees: from a 12 m perch, `dist` metres away, through `zoom`x.
        const dist = num('dist', 80);
        const zoom = num('zoom', 4);
        camera.fov = 2 * THREE.MathUtils.radToDeg(Math.atan(Math.tan(THREE.MathUtils.degToRad(55 / 2)) / zoom));
        camera.position.set(target.x + Math.sin(yaw) * dist, 12, target.z + Math.cos(yaw) * dist);
      } else if (cam === 'top') {
        camera.fov = 40;
        camera.position.set(target.x + 0.01, size * 1.6, target.z + 0.01);
      } else if (cam === 'wide') {
        camera.fov = 55;
        camera.position.set(target.x + Math.sin(yaw) * size * 0.9, size * 0.45 + 6, target.z + Math.cos(yaw) * size * 0.9);
      } else {
        camera.fov = 35;
        const d = size * 1.25 + 2;
        camera.position.set(target.x + Math.sin(yaw) * d, size * 0.55 + 1.5, target.z + Math.cos(yaw) * d);
      }
      camera.updateProjectionMatrix();
      controls.target.copy(target);
      camera.lookAt(target);
      controls.update();
    },
  };

  function resize() {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  const clock = new THREE.Clock();
  let frames = 0;
  let t = 0;
  const tmp = new THREE.Vector3();
  function loop() {
    const dt = Math.min(clock.getDelta(), 1 / 20);
    t += dt;
    for (const fn of updaters) fn(dt, t);
    controls.update();
    env.update(dt, camera);
    renderer.render(dt);
    for (const { el, obj } of labels) {
      const box = new THREE.Box3().setFromObject(obj);
      tmp.set((box.min.x + box.max.x) / 2, box.max.y + 0.3, (box.min.z + box.max.z) / 2).project(camera);
      el.style.display = tmp.z < 1 ? 'block' : 'none';
      el.style.left = `${(tmp.x * 0.5 + 0.5) * innerWidth}px`;
      el.style.top = `${(-tmp.y * 0.5 + 0.5) * innerHeight}px`;
    }
    if (++frames === 3) window.__ready = true;
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  window.__stage = stage;
  return stage;
}
