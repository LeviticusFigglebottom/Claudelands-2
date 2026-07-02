// Projectile sim: rockets, grenades (all delivery types), thrown BRISKCO
// guns, and enemy shots. Simple ballistic integration + sphere-vs-target
// checks; collisions with the arena floor/props resolved against colliders
// provided by world.ts.

import * as THREE from 'three';
import { fx } from './particles';
import { splashDamage, damageTarget, type Damageable, type HitOpts } from './combat';
import { ELEMENTS } from '../data/elements';
import { glowMat } from '../render/toon';
import { FX_LAYER } from '../render/post';
import { audio } from '../audio/synth';
import type { ElementId } from './types';

export interface Projectile {
  mesh: THREE.Object3D;
  vel: THREE.Vector3;
  gravity: number;
  element: ElementId;
  damage: number;
  splash: number;         // radius; 0 = direct-hit only
  fuse: number;           // <=0 explodes on contact; >0 timed
  age: number;
  bounces: number;
  source: HitOpts['source'];
  sticky: boolean;
  stuckTo: Damageable | null;
  singularity: boolean;
  transfusion: boolean;
  childCount: number;     // mirv
  meteor: boolean;        // legendary: second delayed blast
  homing: boolean;
  dead: boolean;
  onExplode?: (p: Projectile) => void;
}

export class ProjectileSystem {
  list: Projectile[] = [];
  scene!: THREE.Scene;
  targets: () => Damageable[] = () => [];
  player!: Damageable & { position: THREE.Vector3 };
  groundHeight: (x: number, z: number) => number = () => 0;
  /** Sphere-vs-world test (walls/props): returns outward push normal. */
  collideSphere: (pos: THREE.Vector3, r: number) => THREE.Vector3 | null = () => null;
  healPlayer: (amount: number) => void = () => {};

  attach(scene: THREE.Scene): void { this.scene = scene; }

  /** Clear all live projectiles (map switch). */
  reset(): void {
    for (const p of this.list) if (!p.dead) this.scene.remove(p.mesh);
    this.list = [];
  }

  spawn(opts: Partial<Projectile> & { pos: THREE.Vector3; vel: THREE.Vector3; damage: number; element: ElementId }): Projectile {
    const color = ELEMENTS[opts.element].color;
    let mesh = opts.mesh;
    if (!mesh) {
      mesh = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), glowMat(color, 0.95));
      mesh.layers.set(FX_LAYER);
    }
    mesh.position.copy(opts.pos);
    this.scene.add(mesh);
    const p: Projectile = {
      mesh,
      vel: opts.vel.clone(),
      gravity: opts.gravity ?? 0,
      element: opts.element,
      damage: opts.damage,
      splash: opts.splash ?? 0,
      fuse: opts.fuse ?? -1,
      age: 0,
      bounces: opts.bounces ?? 0,
      source: opts.source ?? 'player',
      sticky: opts.sticky ?? false,
      stuckTo: null,
      singularity: opts.singularity ?? false,
      transfusion: opts.transfusion ?? false,
      childCount: opts.childCount ?? 0,
      meteor: opts.meteor ?? false,
      homing: opts.homing ?? false,
      dead: false,
      onExplode: opts.onExplode,
    };
    this.list.push(p);
    return p;
  }

  update(dt: number): void {
    const targets = this.targets();
    for (const p of this.list) {
      if (p.dead) continue;
      p.age += dt;
      if (p.age > 10) { this.kill(p); continue; }

      if (p.stuckTo) {
        p.mesh.position.copy(p.stuckTo.position).add(new THREE.Vector3(0, 1, 0));
      } else {
        p.vel.y -= p.gravity * dt;
        p.mesh.position.addScaledVector(p.vel, dt);
        p.mesh.rotation.x += dt * 6;
        p.mesh.rotation.y += dt * 4;
      }

      // exhaust trail for fast projectiles
      if (p.gravity === 0 && Math.random() < 30 * dt) {
        fx.emit(p.mesh.position, new THREE.Vector3(0, 0.5, 0), ELEMENTS[p.element].colorAlt, 0.08, 0.35, 0);
      }

      // timed fuse: blink + beep as it runs down
      if (p.fuse > 0) {
        if (p.age >= p.fuse) { this.explode(p); continue; }
        const remaining = p.fuse - p.age;
        const blinkRate = remaining < 0.5 ? 14 : 6;
        p.mesh.visible = Math.sin(p.age * blinkRate * Math.PI) > -0.4;
        const beepStep = remaining < 0.5 ? 0.15 : 0.4;
        if (Math.floor(p.age / beepStep) !== Math.floor((p.age - dt) / beepStep) && p.source === 'player') {
          audio.fuseBeep(1 + (1 - remaining / p.fuse) * 0.8);
        }
      }

      // wall/prop bounce
      if (!p.stuckTo) {
        const n = this.collideSphere(p.mesh.position, 0.16);
        if (n) {
          if (p.fuse > 0 || p.bounces > 0) {
            // reflect off the wall
            const dot = p.vel.dot(n);
            p.vel.addScaledVector(n, -1.6 * dot).multiplyScalar(0.55);
            p.mesh.position.addScaledVector(n, 0.2);
            audio.bounce();
            if (p.bounces > 0) p.bounces--;
          } else {
            this.explode(p);
            continue;
          }
        }
      }

      // ground collision
      const gy = this.groundHeight(p.mesh.position.x, p.mesh.position.z);
      if (p.mesh.position.y <= gy + 0.12 && !p.stuckTo) {
        if (p.bounces > 0) {
          p.bounces--;
          p.mesh.position.y = gy + 0.13;
          p.vel.y = Math.abs(p.vel.y) * 0.55;
          p.vel.x *= 0.7; p.vel.z *= 0.7;
        } else if (p.fuse > 0) {
          // timed grenade rests on the ground
          p.mesh.position.y = gy + 0.12;
          p.vel.set(0, 0, 0);
        } else {
          this.explode(p);
          continue;
        }
      }

      // target collision
      const hitTargets = p.source === 'enemy' ? [this.player] : targets;
      for (const t of hitTargets) {
        if (!t.alive) continue;
        const d = p.mesh.position.distanceTo(t.position.clone().add(new THREE.Vector3(0, 1, 0)));
        if (d < 1.1) {
          if (p.sticky && !p.stuckTo) { p.stuckTo = t; p.vel.set(0, 0, 0); break; }
          if (p.fuse <= 0) { this.explode(p, t); }
          break;
        }
      }
    }
    this.list = this.list.filter((p) => !p.dead);
  }

  explode(p: Projectile, direct?: Damageable): void {
    if (p.dead) return;
    const pos = p.mesh.position.clone();

    if (p.singularity) {
      // yank everyone toward the point before the pop
      fx.burst(pos, 0xc06bff, 24, -6, 0.12, 0.4, 0); // inward-ish visual
      for (const t of this.targets()) {
        if (!t.alive || t.isPlayer) continue;
        const d = t.position.distanceTo(pos);
        if (d < p.splash * 2.2) {
          const pull = pos.clone().sub(t.position).setY(0).normalize().multiplyScalar(Math.min(d, 4));
          t.position.add(pull);
        }
      }
    }

    if (direct && p.splash <= 0) {
      damageTarget(direct, p.damage, p.element, { source: p.source, elemChance: 0.5 }, pos);
      fx.impact(pos, p.element, true);
    } else {
      const before = this.aliveFleshTotal();
      splashDamage(pos, Math.max(p.splash, 1.2), p.damage, p.element, { source: p.source, elemChance: 0.45 });
      if (p.transfusion) {
        const dealt = Math.max(0, before - this.aliveFleshTotal());
        if (dealt > 0) this.healPlayer(dealt * 0.35);
      }
    }

    if (p.childCount > 0) {
      for (let i = 0; i < p.childCount; i++) {
        const a = (i / p.childCount) * Math.PI * 2;
        this.spawn({
          pos: pos.clone().add(new THREE.Vector3(0, 0.4, 0)),
          vel: new THREE.Vector3(Math.cos(a) * 5, 6, Math.sin(a) * 5),
          damage: p.damage * 0.6,
          element: p.element,
          splash: p.splash * 0.7,
          gravity: 16,
          fuse: 0.8,
          source: p.source,
        });
      }
    }

    if (p.meteor) {
      const meteorPos = pos.clone();
      setTimeout(() => {
        splashDamage(meteorPos, p.splash * 1.2, p.damage * 0.8, 'blast', { source: p.source });
      }, 650);
    }

    p.onExplode?.(p);
    this.kill(p);
  }

  private aliveFleshTotal(): number {
    let sum = 0;
    for (const t of this.targets()) if (t.alive && !t.isPlayer) sum += t.flesh;
    return sum;
  }

  private kill(p: Projectile): void {
    p.dead = true;
    this.scene.remove(p.mesh);
  }
}

export const projectiles = new ProjectileSystem();
