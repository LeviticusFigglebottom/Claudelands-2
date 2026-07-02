// The Gunsmith's SENTRY RIG — a deployable scrap turret. Honors the
// data-driven augments: rig_ember (incendiary rounds), rig_taunt (draws
// aggro), rig_twins (deploy two). Cooldown/duration scale with skills.

import * as THREE from 'three';
import { toonMat, glowMat } from '../render/toon';
import { swatch } from '../render/textures';
import { fx } from './particles';
import { audio } from '../audio/synth';
import { applyDamage, splashDamage } from './combat';
import { levelScale } from '../gen/weapongen';
import { statsys } from './stats';
import { state } from './state';
import type { Enemy } from './enemies';
import { PLAYER_CLASS } from '../data/classes';

class Turret {
  group = new THREE.Group();
  private headGroup = new THREE.Group();
  private shootTimer = 0;
  age = 0;
  duration: number;
  alive = true;
  position: THREE.Vector3;

  constructor(pos: THREE.Vector3, duration: number, private damage: number, private ember: boolean) {
    this.duration = duration;
    this.position = pos.clone();

    const legMat = toonMat({ color: 0x3a3632 });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.08), legMat);
      leg.position.set(Math.cos(a) * 0.3, 0.22, Math.sin(a) * 0.3);
      leg.rotation.z = Math.cos(a) * 0.4;
      leg.rotation.x = -Math.sin(a) * 0.4;
      this.group.add(leg);
    }
    const bodyMat = toonMat({ color: 0xffffff, map: swatch('#8a5a2a', 80) });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.3, 8), bodyMat);
    body.position.y = 0.55;
    this.group.add(body);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.26, 0.4), bodyMat);
    const barrelL = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 8), legMat);
    barrelL.geometry.rotateX(Math.PI / 2);
    barrelL.position.set(-0.09, 0, -0.35);
    const barrelR = barrelL.clone();
    barrelR.position.x = 0.09;
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), glowMat(this.ember ? 0xff6a1a : 0xffd23c, 1));
    eye.position.set(0, 0.1, -0.22);
    this.headGroup.add(head, barrelL, barrelR, eye);
    this.headGroup.position.y = 0.82;
    this.group.add(this.headGroup);

    this.group.position.copy(pos);
    this.group.traverse((o) => (o.castShadow = true));
  }

  update(dt: number, enemies: Enemy[], scene: THREE.Scene): void {
    this.age += dt;
    if (this.age >= this.duration) {
      this.alive = false;
      fx.burst(this.group.position.clone().add(new THREE.Vector3(0, 0.6, 0)), 0xffd23c, 16, 4, 0.1, 0.5, 5);
      scene.remove(this.group);
      return;
    }

    // acquire nearest living enemy in range
    let best: Enemy | null = null;
    let bestD = 26;
    for (const e of enemies) {
      if (!e.alive) continue;
      const d = e.position.distanceTo(this.position);
      if (d < bestD) { best = e; bestD = d; }
    }
    if (!best) return;

    const aim = best.position.clone().add(new THREE.Vector3(0, 1.1, 0));
    this.headGroup.lookAt(aim);

    this.shootTimer -= dt;
    if (this.shootTimer <= 0) {
      this.shootTimer = 0.18;
      const muzzle = this.group.position.clone().add(new THREE.Vector3(0, 0.82, 0));
      const dir = aim.clone().sub(muzzle).normalize();
      fx.muzzleFlash(muzzle.clone().addScaledVector(dir, 0.4), dir, this.ember ? 0xff6a1a : 0xffd23c, 0.6);
      fx.tracer(muzzle, aim, this.ember ? 0xff6a1a : 0xffe8a0);
      audio.shot('junk', 1.5);
      applyDamage(best, this.damage, this.ember ? 'ember' : 'kinetic', {
        source: 'turret',
        elemChance: this.ember ? 0.45 : 0,
        elemDps: this.damage * 0.5,
      });
    }
  }
}

export class ActionSkillSystem {
  private turrets: Turret[] = [];
  cooldownRemaining = 0;
  scene!: THREE.Scene;
  enemies: () => Enemy[] = () => [];
  groundHeight: (x: number, z: number) => number = () => 0;
  playerPos: () => THREE.Vector3 = () => new THREE.Vector3();

  // Stormcaller: Tempest Shell state
  tempestRemaining = 0;
  private arcTimer = 0;

  attach(scene: THREE.Scene): void { this.scene = scene; }

  get cooldownTotal(): number {
    return PLAYER_CLASS.actionSkill.cooldown * statsys.reduction('skillCooldown');
  }

  get tempestActive(): boolean { return this.tempestRemaining > 0; }

  get ready(): boolean { return this.cooldownRemaining <= 0 && this.turrets.length === 0 && !this.tempestActive; }
  get activeCount(): number { return this.turrets.length + (this.tempestActive ? 1 : 0); }

  /** Squall Line augment while the Shell is up. */
  get tempestHaste(): boolean { return this.tempestActive && state.hasAugment('tempest_haste'); }

  /** Eye of the Storm capstone: kills extend the Shell. */
  onKillWhileActive(): void {
    if (this.tempestActive && statsys.bonus('eyeStorm') > 0) {
      this.tempestRemaining = Math.min(this.tempestRemaining + 2, 20);
    }
  }

  /** Returns a taunt position if the Scrap Magnet augment is active. */
  tauntTarget(): THREE.Vector3 | null {
    if (!state.hasAugment('rig_taunt')) return null;
    const t = this.turrets[0];
    return t && t.alive ? t.position : null;
  }

  deploy(playerPos: THREE.Vector3, forward: THREE.Vector3): boolean {
    if (!this.ready) return false;
    if (PLAYER_CLASS.actionSkill.id === 'tempest_shell') {
      this.tempestRemaining = PLAYER_CLASS.actionSkill.duration * statsys.mult('turretDuration');
      this.cooldownRemaining = this.cooldownTotal;
      audio.elemental('volt');
      audio.turretDeploy();
      fx.burst(playerPos.clone().add(new THREE.Vector3(0, 1.4, 0)), 0x38c8ff, 34, 6, 0.14, 0.9, 3);
      return true;
    }
    const duration = PLAYER_CLASS.actionSkill.duration * statsys.mult('turretDuration');
    const damage = 6 * levelScale(state.level) * statsys.mult('turretDamage');
    const ember = state.hasAugment('rig_ember');
    const twins = state.hasAugment('rig_twins');

    const fwd = forward.clone().setY(0).normalize();
    const spots = twins
      ? [playerPos.clone().addScaledVector(fwd, 2).add(new THREE.Vector3(-fwd.z, 0, fwd.x).multiplyScalar(1.2)),
         playerPos.clone().addScaledVector(fwd, 2).add(new THREE.Vector3(fwd.z, 0, -fwd.x).multiplyScalar(1.2))]
      : [playerPos.clone().addScaledVector(fwd, 2)];

    for (const s of spots) {
      s.y = this.groundHeight(s.x, s.z);
      const t = new Turret(s, duration, damage, ember);
      this.scene.add(t.group);
      this.turrets.push(t);
      fx.burst(s.clone().add(new THREE.Vector3(0, 0.5, 0)), 0xffb43c, 20, 4, 0.12, 0.6, 6);
    }
    audio.turretDeploy();
    this.cooldownRemaining = this.cooldownTotal;
    return true;
  }

  update(dt: number): void {
    if (this.turrets.length === 0 && !this.tempestActive && this.cooldownRemaining > 0) {
      this.cooldownRemaining -= dt;
      if (this.cooldownRemaining <= 0) audio.skillReady();
    }
    for (const t of this.turrets) t.update(dt, this.enemies(), this.scene);
    this.turrets = this.turrets.filter((t) => t.alive);

    statsys.tempestHaste = this.tempestHaste;
    // Tempest Shell: crackling aura + periodic chain arcs off the player
    if (this.tempestActive) {
      this.tempestRemaining -= dt;
      const pos = this.playerPos();
      if (Math.random() < 14 * dt) {
        fx.emit(pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.2, 0.4 + Math.random() * 1.6, (Math.random() - 0.5) * 1.2)),
          new THREE.Vector3(0, 1.2, 0), 0x38c8ff, 0.09, 0.4, 0);
      }
      this.arcTimer -= dt;
      if (this.arcTimer <= 0) {
        this.arcTimer = 0.7;
        const near = this.enemies().filter((e) => e.alive && e.position.distanceTo(pos) < 14);
        near.sort((a, b) => a.position.distanceTo(pos) - b.position.distanceTo(pos));
        const targets = state.hasAugment('tempest_fork') ? near.slice(0, 2) : near.slice(0, 1);
        for (const t of targets) {
          const from = pos.clone().add(new THREE.Vector3(0, 1.5, 0));
          const to = t.position.clone().add(new THREE.Vector3(0, 1.2, 0));
          fx.lightningArc(from, to);
          applyDamage(t, 8 * levelScale(state.level) * statsys.mult('elemDamage'), 'volt', {
            source: 'player', elemChance: 0.45, elemDps: 5 * levelScale(state.level),
          });
        }
      }
      if (this.tempestRemaining <= 0) {
        // Thunderclap augment: exit nova
        if (state.hasAugment('tempest_nova')) {
          splashDamage(pos.clone(), 6, 24 * levelScale(state.level) * statsys.mult('elemDamage'), 'volt', { source: 'player', elemChance: 0.6 });
        }
        this.cooldownRemaining = this.cooldownTotal;
      }
    }
  }
}

export const actionSkill = new ActionSkillSystem();
