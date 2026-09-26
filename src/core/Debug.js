// window.__game — automation/debug API used by tools/capture.mjs and reviewers.
import * as THREE from 'three';

const D2R = Math.PI / 180;

export function installDebug(game) {
  const findObject = (key) => {
    const root = game.level?.ctx.root;
    if (!root) return null;
    const job = game.jobs.get(key);
    if (job) return job.focus || job.targets[0];
    return root.getObjectByName(key);
  };
  const worldPos = (o) => {
    if (!o) return null;
    if (o.isVector3) return o.clone();
    const box = new THREE.Box3().setFromObject(o);
    return box.isEmpty() ? o.getWorldPosition(new THREE.Vector3()) : box.getCenter(new THREE.Vector3());
  };
  let statsEl = null;

  const api = {
    game,
    get ready() { return game.ready; },
    get state() { return game.state; },
    levels: () => game.levels?.map?.((l) => l.id),
    startLevel: (id, opts = { skipIntro: true }) => game.startLevel(id, opts),
    office: () => game.showOffice(),
    title: () => game.showTitle(),
    results: () => game.showResults(),
    look(yawDeg, pitchDeg) {
      game.rig.yaw = yawDeg * D2R;
      game.rig.pitch = pitchDeg * D2R;
      game.rig.clamp();
    },
    scope(on = true, zoomIndex) {
      if (zoomIndex != null) game.rig.setZoomIndex(zoomIndex);
      game.rig.setScoped(on);
      game.rig.scopeT = on ? 1 : 0;
      game.rig.fovNow = on ? 2 * Math.atan(Math.tan((game.rig.baseFov * D2R) / 2) / game.rig.zoom) / D2R : game.rig.baseFov;
    },
    /** Aim at a job id or an object name. Returns world position or null. */
    aimAt(key) {
      const p = worldPos(findObject(key));
      if (p) game.rig.lookAtPoint(p);
      return p && p.toArray();
    },
    /** Aim at a job's target and shoot it (sway suppressed for determinism). */
    shootJob(id) {
      const job = game.jobs.get(id);
      if (!job) return false;
      const t = job.targets.find((o) => o.visible !== false) || job.targets[0];
      const p = worldPos(t);
      game.rig.lookAtPoint(p);
      game.rig.swayMul = 0;
      game.rig.recoil = 0;
      game.rig.recoilVel = 0;
      game.rig.recoilYaw = 0;
      game.rig.update(0.0001);
      game.rifle.state = 'ready';
      if (game.rifle.ammo === 0) game.rifle.ammo = game.rifle.magSize;
      const ok = game.shooting.fire();
      game.applyUpgrades();
      return ok;
    },
    fire: () => game.shooting.fire(),
    jobs: () => game.jobs.list.map((j) => ({ id: j.id, title: j.title, state: j.state, bonus: j.bonus, pos: worldPos(j.focus || j.targets[0])?.toArray() })),
    completeJob(id) {
      const j = game.jobs.get(id);
      if (j) game.jobs.complete(j);
    },
    completeAll() {
      for (const j of game.jobs.main) if (j.state === 'open') game.jobs.complete(j);
    },
    freeze(on = true) {
      game.frozen = on;
      // deterministic framing for captures: no breathing sway / recoil while frozen
      if (on) {
        game.rig.swayMul = 0;
        game.rig.recoil = game.rig.recoilVel = game.rig.recoilYaw = 0;
      } else game.applyUpgrades();
    },
    /** Advance the simulation `seconds` without rendering (fixed 1/30 steps). */
    step(seconds = 1) {
      const dt = 1 / 30;
      for (let t = 0; t < seconds; t += dt) {
        game.time += dt;
        game.tweens.update(dt);
        game.level?.ctx.update(dt, game.time);
        game.fx.update(dt);
        game.tracers.update(dt, game.camera);
        game.rifle.update(dt);
        game.bulletCam.update(dt);
      }
    },
    setTimeScale(s) { game.timeScale = s; },
    stats() {
      const info = game.renderer.renderer.info;
      return {
        fps: Math.round(game.fps), calls: info.render.calls, triangles: info.render.triangles,
        geometries: info.memory.geometries, textures: info.memory.textures, programs: info.programs?.length,
        state: game.state,
      };
    },
    showStats(on = true) {
      if (!on) { statsEl?.remove(); statsEl = null; return; }
      if (statsEl) return;
      statsEl = document.createElement('div');
      statsEl.style.cssText = 'position:fixed;left:8px;top:50%;z-index:99;font:12px monospace;color:#fff;background:rgba(0,0,0,.55);padding:6px 8px;border-radius:6px;pointer-events:none;white-space:pre';
      document.body.appendChild(statsEl);
      const tick = () => {
        if (!statsEl) return;
        const s = api.stats();
        statsEl.textContent = `fps ${s.fps}\ncalls ${s.calls}\ntris ${(s.triangles / 1000).toFixed(0)}k\ngeo ${s.geometries} tex ${s.textures}`;
        setTimeout(tick, 250);
      };
      tick();
    },
  };
  window.__game = api;
  if (game.params.get('debug') === '1') api.showStats(true);
  return api;
}
