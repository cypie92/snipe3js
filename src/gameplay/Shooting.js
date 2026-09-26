// Firing, hit resolution and impact feedback.
import * as THREE from 'three';
import { sound } from '../core/sound.js';

export const BULLET_SPEED = 620; // m/s — fast enough that leading targets is rarely needed
const UP = new THREE.Vector3(0, 1, 0);

const SURFACE_SOUND = {
  wood: 'hitWood', metal: 'hitMetal', stone: 'hitStone', glass: 'hitGlass', water: 'hitWater',
  soft: 'hitSoft', grass: 'hitGround', dust: 'hitGround', leaves: 'hitSoft',
};

export function resolveHittable(obj) {
  for (let o = obj; o; o = o.parent) if (o.userData?.hit) return { object: o, hit: o.userData.hit };
  return null;
}

export function findSurface(obj) {
  for (let o = obj; o; o = o.parent) if (o.userData?.surface) return o.userData.surface;
  return null;
}

function isShootable(obj) {
  if (obj.userData.noHit) return false;
  if (!obj.visible && !obj.userData.collider) return false;
  for (let o = obj.parent; o; o = o.parent) {
    if (!o.visible || o.userData?.noHit) return false;
  }
  return true;
}

function guessSurface(hit) {
  const n = hit.face?.normal;
  if (n && hit.object.isMesh) {
    const wn = n.clone().transformDirection(hit.object.matrixWorld);
    if (wn.y > 0.8 && hit.point.y < 1.5) return 'dust';
  }
  return 'stone';
}

export class Shooting {
  constructor(game) {
    this.game = game;
    this.ray = new THREE.Raycaster();
    this.ray.near = 0.3;
    this._o = new THREE.Vector3();
    this._d = new THREE.Vector3();
  }

  /** First shootable intersection along a ray (or null). */
  pick(origin, dir, far = 1500) {
    const root = this.game.raycastRoot;
    if (!root) return null;
    this.ray.set(origin, dir);
    this.ray.far = far;
    const hits = this.ray.intersectObject(root, true);
    for (const h of hits) if (isShootable(h.object)) return h;
    return null;
  }

  /** Distance to whatever is under the reticle (for range readout / DOF). */
  range() {
    const { origin, dir } = this.game.rig.getAimRay(this._o, this._d);
    const h = this.pick(origin, dir, 2000);
    return h ? h.distance : null;
  }

  fire() {
    const g = this.game;
    const { rifle, rig } = g;
    if (!rifle.canFire) {
      if (rifle.ammo === 0 && rifle.state === 'ready') {
        sound.sfx('dryfire');
        rifle.reload();
      }
      return false;
    }
    rifle.fire();
    g.scoring.shots++;
    const { origin, dir } = rig.getAimRay(new THREE.Vector3(), new THREE.Vector3());
    const hit = this.pick(origin, dir);
    if (hit) hit.origin = origin.clone(); // lets reactions turn to face the shooter
    const end = hit ? hit.point.clone() : origin.clone().addScaledVector(dir, 900);
    const dist = origin.distanceTo(end);
    const travel = Math.max(0.035, dist / BULLET_SPEED);
    const muzzle = g.viewmodel.muzzleWorld(rig, new THREE.Vector3());

    g.tracers.spawn(muzzle, end, travel);
    g.fx.burst('muzzle', muzzle, dir);
    g.viewmodel.fire();
    rig.kick(1);
    sound.sfx('shot'); // the audio engine ducks music on shots itself
    g.hud.onShot();
    g.events.emit('shot', { origin, dir, hit });

    const target = hit ? resolveHittable(hit.object) : null;
    if (target?.hit.kind === 'job' && g.jobs.wouldFinish(target.hit.job) && g.bulletCam && !g.skipBulletCam) {
      g.bulletCam.play(muzzle, end, () => this.impact(hit, target));
    } else {
      g.tweens.delay(travel, () => this.impact(hit, target));
    }
    return true;
  }

  impact(hit, target) {
    const g = this.game;
    if (!hit) return;
    const p = hit.point;
    const n = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : UP.clone();
    for (const f of g.level?.ctx.flocks || []) f.scare?.(p);
    g.events.emit('impact', { point: p, hit, target });

    const sceneryHit = (surface) => {
      const s = surface || findSurface(hit.object) || guessSurface(hit);
      g.fx.burst(s, p, n);
      sound.sfx(SURFACE_SOUND[s] || 'hitGround', { position: p });
    };

    if (!target) {
      sceneryHit();
      return;
    }
    const spec = target.hit;
    switch (spec.kind) {
      case 'job':
      case 'fail': {
        const res = g.jobs.hit(spec.job, target.object, hit, spec.kind === 'fail');
        if (res === 'complete' || res === 'progress') g.scoring.useful++;
        if (res === 'progress') {
          g.fx.burst('stars', p, n, { scale: 0.6 });
          sound.sfx('ding', { position: p });
        } else if (res === 'already' || res === 'locked' || res === 'ignore') {
          sceneryHit();
          if (res === 'locked') g.popups.text(p, 'Not yet…', { cls: 'pop-info' });
        } else if (res === 'fail') {
          sceneryHit();
        }
        break;
      }
      case 'bystander': {
        g.scoring.badHits++;
        spec.actor?.react?.(hit);
        spec.onHit?.(hit);
        g.fx.burst('soft', p, n);
        g.fx.burst('stars', p.clone().add(new THREE.Vector3(0, 0.3, 0)), UP, { scale: 0.4 });
        g.popups.text(p, 'BAD HIT!', { cls: 'pop-bad' });
        sound.sfx('badHit', { position: p });
        sound.sfx('oi', { position: p });
        g.hud.flash('bad');
        g.events.emit('badHit', spec);
        break;
      }
      case 'prop': {
        spec.onHit?.(hit, target.object);
        sceneryHit(spec.surface);
        if (spec.once) delete target.object.userData.hit;
        break;
      }
      case 'collectible':
        g.scoring.useful++;
        g.collect(target.object, spec);
        break;
      case 'ui':
        spec.onHit?.(hit, target.object);
        sceneryHit(spec.surface || 'wood');
        break;
      default:
        sceneryHit();
    }
  }
}
