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
  private barrelFlip = false;
  age = 0;
  duration: number;
  alive = true;
  position: THREE.Vector3;

  // damage is a THUNK: re-read every shot, so the rig keeps pace with the
  // player's level and any skill points spent while it's standing
  constructor(pos: THREE.Vector3, duration: number, private damage: () => number, private ember: boolean) {
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

    // lookAt() points the head's local +z at the target, so the barrels and
    // eye live on +z — the muzzles genuinely face what the rig is shooting
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.26, 0.4), bodyMat);
    const barrelL = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 8), legMat);
    barrelL.geometry.rotateX(Math.PI / 2);
    barrelL.position.set(-0.09, 0, 0.35);
    const barrelR = barrelL.clone();
    barrelR.position.x = 0.09;
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), glowMat(this.ember ? 0xff6a1a : 0xffd23c, 1));
    eye.position.set(0, 0.1, 0.22);
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
      // fire from the actual barrel tips, alternating left/right
      this.barrelFlip = !this.barrelFlip;
      this.headGroup.updateWorldMatrix(true, false);
      const muzzle = this.headGroup.localToWorld(new THREE.Vector3(this.barrelFlip ? 0.09 : -0.09, 0, 0.6));
      const dir = aim.clone().sub(muzzle).normalize();
      fx.muzzleFlash(muzzle, dir, this.ember ? 0xff6a1a : 0xffd23c, 0.6);
      fx.tracer(muzzle, aim, this.ember ? 0xff6a1a : 0xffe8a0);
      audio.shot('junk', 1.5);
      const dmg = this.damage();
      applyDamage(best, dmg, this.ember ? 'ember' : 'kinetic', {
        source: 'turret',
        elemChance: this.ember ? 0.45 : 0,
        elemDps: dmg * 0.5,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// RIVET — the Houndmaster's bounding scrap-hound. Chases the nearest living
// enemy and mauls on a short cadence; honors hound_ember / hound_fetch.
class Hound {
  group = new THREE.Group();
  age = 0;
  alive = true;
  position: THREE.Vector3;
  private biteTimer = 0;
  private bobT = Math.random() * 6;

  constructor(pos: THREE.Vector3, public duration: number, private damage: () => number, private ember: boolean, private fetch: boolean,
    private groundAt: (x: number, z: number) => number, private heal: (amt: number) => void) {
    this.position = pos.clone();
    const rust = toonMat({ color: 0xffffff, map: swatch('#8a5a2a', 80) });
    const dark = toonMat({ color: 0x3a3632 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.42, 1.05), rust);
    torso.position.y = 0.55;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.44), rust);
    head.position.set(0, 0.72, -0.62);
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, 0.36), dark);
    jaw.position.set(0, 0.58, -0.66);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), glowMat(this.ember ? 0xff6a1a : 0xffd23c, 1));
    eye.position.set(0.09, 0.76, -0.82);
    const eye2 = eye.clone(); eye2.position.x = -0.09;
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.4), dark);
    tail.position.set(0, 0.68, 0.6);
    tail.rotation.x = 0.6;
    this.group.add(torso, head, jaw, eye, eye2, tail);
    for (let i = 0; i < 4; i++) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.42, 0.1), dark);
      leg.position.set((i % 2 === 0 ? -1 : 1) * 0.26, 0.21, (i < 2 ? -1 : 1) * 0.38);
      this.group.add(leg);
    }
    this.group.position.copy(pos);
    this.group.traverse((o) => (o.castShadow = true));
  }

  update(dt: number, enemies: Enemy[], scene: THREE.Scene, ownerPos: THREE.Vector3): void {
    this.age += dt;
    this.bobT += dt;
    if (this.age >= this.duration) {
      this.alive = false;
      fx.burst(this.group.position.clone().add(new THREE.Vector3(0, 0.5, 0)), 0xffb43c, 16, 4, 0.1, 0.5, 5);
      scene.remove(this.group);
      return;
    }
    // pick a target: nearest living enemy within a generous chase range
    let best: Enemy | null = null;
    let bestD = 34;
    for (const e of enemies) {
      if (!e.alive) continue;
      const d = e.position.distanceTo(this.position);
      if (d < bestD) { best = e; bestD = d; }
    }
    const goal = best ? best.position : ownerPos.clone().add(new THREE.Vector3(1.4, 0, 1.4));
    const dir = goal.clone().sub(this.position).setY(0);
    const dist = dir.length();
    if (dist > (best ? 1.4 : 2.4)) {
      dir.normalize();
      this.position.addScaledVector(dir, Math.min(dist, 8.5 * dt));
      this.group.rotation.y = Math.atan2(dir.x, dir.z) + Math.PI;
    }
    this.position.y = this.groundAt(this.position.x, this.position.z) + Math.abs(Math.sin(this.bobT * 9)) * 0.22;
    this.group.position.copy(this.position);

    this.biteTimer -= dt;
    if (best && bestD < 2 && this.biteTimer <= 0) {
      this.biteTimer = 0.7;
      fx.impact(best.position.clone().add(new THREE.Vector3(0, 0.9, 0)), this.ember ? 'ember' : 'kinetic');
      audio.shot('junk', 2.2);
      const dmg = this.damage();
      applyDamage(best, dmg, this.ember ? 'ember' : 'kinetic', {
        source: 'turret',
        elemChance: this.ember ? 0.45 : 0,
        elemDps: dmg * 0.5,
      });
      if (this.fetch) this.heal(dmg * 0.03);
    }
  }
}

export class ActionSkillSystem {
  private turrets: Turret[] = [];
  private hounds: Hound[] = [];
  cooldownRemaining = 0;
  scene!: THREE.Scene;
  enemies: () => Enemy[] = () => [];
  groundHeight: (x: number, z: number) => number = () => 0;
  playerPos: () => THREE.Vector3 = () => new THREE.Vector3();
  healPlayer: (amt: number) => void = () => {};
  playerMaxHealth: () => number = () => 100;

  // Stormcaller: Tempest Shell state
  tempestRemaining = 0;
  private arcTimer = 0;

  // Ravager: Red Mist state
  mistRemaining = 0;
  private slamTimer = 0;

  attach(scene: THREE.Scene): void { this.scene = scene; }

  get cooldownTotal(): number {
    return PLAYER_CLASS.actionSkill.cooldown * statsys.reduction('skillCooldown');
  }

  get tempestActive(): boolean { return this.tempestRemaining > 0; }
  get mistActive(): boolean { return this.mistRemaining > 0; }

  get ready(): boolean {
    return this.cooldownRemaining <= 0 && this.turrets.length === 0 && this.hounds.length === 0 && !this.tempestActive && !this.mistActive;
  }
  get activeCount(): number { return this.turrets.length + this.hounds.length + (this.tempestActive ? 1 : 0) + (this.mistActive ? 1 : 0); }

  /** Incoming damage multiplier — Red Mist sheds 40% while active. */
  incomingScale(): number { return this.mistActive ? 0.6 : 1; }

  /** Squall Line augment while the Shell is up. */
  get tempestHaste(): boolean { return this.tempestActive && state.hasAugment('tempest_haste'); }

  /** "Kills extend the active skill" capstones (Shell, Hound, Mist share it). */
  onKillWhileActive(): void {
    if (statsys.bonus('eyeStorm') <= 0) return;
    if (this.tempestActive) this.tempestRemaining = Math.min(this.tempestRemaining + 2, 20);
    if (this.mistActive) this.mistRemaining = Math.min(this.mistRemaining + 2, 20);
    for (const h of this.hounds) h.duration = Math.min(h.duration + 2, h.age + 20);
  }

  /** Returns a taunt position if the Scrap Magnet augment is active. */
  tauntTarget(): THREE.Vector3 | null {
    if (!state.hasAugment('rig_taunt')) return null;
    const t = this.turrets[0];
    return t && t.alive ? t.position : null;
  }

  deploy(playerPos: THREE.Vector3, forward: THREE.Vector3): boolean {
    if (!this.ready) return false;
    if (PLAYER_CLASS.actionSkill.id === 'red_mist') {
      this.mistRemaining = PLAYER_CLASS.actionSkill.duration * statsys.mult('turretDuration');
      this.slamTimer = 0.4;
      this.cooldownRemaining = this.cooldownTotal;
      audio.turretDeploy();
      audio.elemental('blast');
      fx.burst(playerPos.clone().add(new THREE.Vector3(0, 1, 0)), 0xff3a2a, 40, 7, 0.16, 1, 4);
      return true;
    }
    if (PLAYER_CLASS.actionSkill.id === 'iron_hound') {
      const duration = PLAYER_CLASS.actionSkill.duration * statsys.mult('turretDuration');
      // live thunk: base bite grows with the player's level, skill %s on top
      const damage = () => 9 * levelScale(state.level) * statsys.mult('turretDamage');
      const ember = state.hasAugment('hound_ember');
      const fetch = state.hasAugment('hound_fetch');
      const twins = state.hasAugment('hound_twins');
      const fwd = forward.clone().setY(0).normalize();
      const spots = twins
        ? [playerPos.clone().addScaledVector(fwd, 1.8).add(new THREE.Vector3(-fwd.z, 0, fwd.x)),
           playerPos.clone().addScaledVector(fwd, 1.8).add(new THREE.Vector3(fwd.z, 0, -fwd.x))]
        : [playerPos.clone().addScaledVector(fwd, 1.8)];
      for (const s of spots) {
        s.y = this.groundHeight(s.x, s.z);
        const h = new Hound(s, duration, damage, ember, fetch, (x, z) => this.groundHeight(x, z), (amt) => this.healPlayer(amt));
        this.scene.add(h.group);
        this.hounds.push(h);
        fx.burst(s.clone().add(new THREE.Vector3(0, 0.5, 0)), 0xffb43c, 20, 4, 0.12, 0.6, 6);
      }
      audio.turretDeploy();
      this.cooldownRemaining = this.cooldownTotal;
      return true;
    }
    if (PLAYER_CLASS.actionSkill.id === 'tempest_shell') {
      this.tempestRemaining = PLAYER_CLASS.actionSkill.duration * statsys.mult('turretDuration');
      this.cooldownRemaining = this.cooldownTotal;
      audio.elemental('volt');
      audio.turretDeploy();
      fx.burst(playerPos.clone().add(new THREE.Vector3(0, 1.4, 0)), 0x38c8ff, 34, 6, 0.14, 0.9, 3);
      return true;
    }
    const duration = PLAYER_CLASS.actionSkill.duration * statsys.mult('turretDuration');
    // live thunk: base rounds grow with the player's level, skill %s on top
    const damage = () => 6 * levelScale(state.level) * statsys.mult('turretDamage');
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
    if (this.turrets.length === 0 && this.hounds.length === 0 && !this.tempestActive && !this.mistActive && this.cooldownRemaining > 0) {
      this.cooldownRemaining -= dt;
      if (this.cooldownRemaining <= 0) audio.skillReady();
    }
    for (const t of this.turrets) t.update(dt, this.enemies(), this.scene);
    this.turrets = this.turrets.filter((t) => t.alive);
    for (const h of this.hounds) h.update(dt, this.enemies(), this.scene, this.playerPos());
    this.hounds = this.hounds.filter((h) => h.alive);

    // Red Mist: rolling ground slams around the player
    if (this.mistActive) {
      this.mistRemaining -= dt;
      const pos = this.playerPos();
      if (Math.random() < 10 * dt) {
        fx.emit(pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.4, 0.3 + Math.random() * 1.4, (Math.random() - 0.5) * 1.4)),
          new THREE.Vector3(0, 1, 0), 0xff3a2a, 0.1, 0.4, 0);
      }
      this.slamTimer -= dt;
      if (this.slamTimer <= 0) {
        this.slamTimer = 1.1;
        const radius = state.hasAugment('mist_quake') ? 9 : 5.5;
        const dmg = 15 * levelScale(state.level) * statsys.mult('turretDamage') * statsys.mult('splashDamage');
        const anyNear = this.enemies().some((e) => e.alive && e.position.distanceTo(pos) < radius);
        splashDamage(pos.clone(), radius, dmg, 'blast', { source: 'player', elemChance: 0 });
        fx.burst(pos.clone().add(new THREE.Vector3(0, 0.2, 0)), 0xff5a3a, 26, radius * 0.8, 0.12, 0.5, 2);
        audio.shot('heavy', 0.8);
        if (anyNear && state.hasAugment('mist_leech')) this.healPlayer(this.playerMaxHealth() * 0.03);
      }
      if (this.mistRemaining <= 0) this.cooldownRemaining = this.cooldownTotal;
    }

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
