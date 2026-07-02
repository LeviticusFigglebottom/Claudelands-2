// Boss encounters. Both bosses extend Enemy with phased attack patterns and
// telegraphed specials; quests spawn them via spawnBoss(). Their stat rows
// live in data/enemies.ts — this file is pure behavior.

import * as THREE from 'three';
import { Enemy, enemySpawner, enemyHooks } from './enemies';
import { ENEMIES, BOSS_GUTTERBALL, BOSS_WARDEN, BOSS_AVALANCHE, type EnemyDef } from '../data/enemies';
import { toonMat, glowMat } from '../render/toon';
import { fx } from './particles';
import { audio } from '../audio/synth';
import { splashDamage } from './combat';
import { projectiles } from './projectiles';
import { levelScale } from '../gen/weapongen';
import { state } from './state';
import { pick } from '../util/rng';

abstract class Boss extends Enemy {
  protected specialTimer = 4;
  protected phase = 0;              // advances at hp thresholds
  private barkT = 6;

  constructor(def: EnemyDef, level: number, pos: THREE.Vector3) {
    super(def, level, pos, false);
    this.aggro = true;
  }

  protected hpFraction(): number {
    return this.totalHp() / (this.maxFlesh + this.maxShield + this.maxArmor);
  }

  override update(dt: number): void {
    super.update(dt);
    if (!this.alive) return;
    const frac = this.hpFraction();
    if (this.phase === 0 && frac < 0.66) { this.phase = 1; this.onPhase(1); }
    if (this.phase === 1 && frac < 0.33) { this.phase = 2; this.onPhase(2); }
    this.specialTimer -= dt;
    if (this.specialTimer <= 0) {
      this.specialTimer = this.specialCooldown();
      this.special();
    }
    this.barkT -= dt;
    if (this.barkT <= 0) {
      this.barkT = 9 + Math.random() * 8;
      enemyHooks().bark(this.displayName, pick(Math.random as never, this.def.barks));
    }
  }

  protected abstract onPhase(phase: number): void;
  protected abstract special(): void;
  protected abstract specialCooldown(): number;
}

// ---------------------------------------------------------------------------
// GRAND DUKE GUTTERBALL — trash royalty. Charges, slams, summons mutts,
// enrages at low health. His crown is the crit zone (it's load-bearing).
export class Gutterball extends Boss {
  private charging = 0;
  private chargeDir = new THREE.Vector3();
  private crown: THREE.Mesh;

  constructor(level: number, pos: THREE.Vector3) {
    super(BOSS_GUTTERBALL, level, pos);
    // the crown: oversized golden crit zone perched on the head
    const scale = this.def.scale;
    this.crown = new THREE.Mesh(new THREE.CylinderGeometry(0.26 * scale, 0.2 * scale, 0.26 * scale, 8), toonMat({ color: 0xd8b028 }));
    this.crown.position.y = 1.95 * scale;
    this.group.add(this.crown);
    this.bodyParts.push(this.crown);
    this.critZone = this.crown;
    audio.bossRoar(false);
  }

  protected onPhase(phase: number): void {
    if (phase === 1) {
      enemyHooks().bark(this.displayName, 'GUARDS! DEVOUR THE TAX EVADER!');
      const spots = [new THREE.Vector3(4, 0, 4), new THREE.Vector3(-4, 0, 4), new THREE.Vector3(0, 0, -5)];
      for (const s of spots) enemySpawner.spawnOne(ENEMIES.scrapmutt, this.position.clone().add(s), false, 2);
    } else {
      enemyHooks().bark(this.displayName, 'NOW I’M PROPERLY FURIOUS. ROYALLY FURIOUS!');
      audio.bossRoar(false);
      // enrage: faster, trailing embers
      this.def = { ...this.def, speed: this.def.speed * 1.5, attackRate: this.def.attackRate * 1.4 };
    }
  }

  protected specialCooldown(): number { return this.phase >= 2 ? 4.5 : 7; }

  protected special(): void {
    const playerPos = enemyHooks().playerPos();
    if (Math.random() < 0.5 && playerPos.distanceTo(this.position) > 6) {
      // CHARGE: telegraph, then rush in a straight line
      this.charging = 1.1;
      this.chargeDir.copy(playerPos).sub(this.position).setY(0).normalize();
      fx.burst(this.position.clone().add(new THREE.Vector3(0, 1.5, 0)), 0xff5a5a, 20, 3, 0.14, 0.5, 2);
      enemyHooks().bark(this.displayName, 'ROYAL EXPRESS! NO STOPS!');
    } else {
      // SLAM: radial shockwave
      fx.explosion(this.position.clone(), 5, 0xffb43c);
      audio.explosion(true);
      splashDamage(this.position.clone(), 7, 10 * levelScale(this.level), 'blast', { source: 'enemy' });
    }
  }

  override update(dt: number): void {
    super.update(dt);
    if (!this.alive) return;
    if (this.charging > 0) {
      this.charging -= dt;
      this.position.addScaledVector(this.chargeDir, 14 * dt);
      this.settleToGround(true);
      this.wobble += dt * 16;
      fx.burst(this.position.clone().add(new THREE.Vector3(0, 0.4, 0)), 0xc8b498, 2, 2, 0.1, 0.4, 5);
      const playerPos = enemyHooks().playerPos();
      if (playerPos.distanceTo(this.position) < 2.6) {
        enemyHooks().damagePlayer(14 * levelScale(this.level), 'kinetic', this.position);
        this.charging = 0;
      }
    }
    if (this.phase >= 2 && Math.random() < 8 * dt) {
      fx.statusFlames(this.position, 'ember');
    }
    // crown wobbles with damage taken — telegraphs the weak point
    this.crown.rotation.z = Math.sin(this.wobble * 0.7) * 0.14;
  }
}

// ---------------------------------------------------------------------------
// HX-1 WARDEN PRIME — Helix site warden. Layer-gated phases: shields up it
// suns you with volt bursts and drones; armor phase fires rocket volleys;
// exposed core phase adds a sweeping beam. Slow, huge, relentless.
export class WardenPrime extends Boss {
  private core: THREE.Mesh;
  private beamT = 0;
  private beamLine: THREE.Line | null = null;

  constructor(level: number, pos: THREE.Vector3) {
    super(BOSS_WARDEN, level, pos);
    const scale = this.def.scale;
    // mech dressing: shoulder pylons + exposed core (crit) in the chest
    const pylonMat = toonMat({ color: 0xc8c4ba });
    for (const side of [-1, 1]) {
      const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.3 * scale, 0.7 * scale, 0.3 * scale), pylonMat);
      pylon.position.set(side * 0.55 * scale, 1.7 * scale, 0);
      this.group.add(pylon);
      this.bodyParts.push(pylon);
    }
    this.core = new THREE.Mesh(new THREE.SphereGeometry(0.22 * scale, 10, 10), glowMat(0xff9500, 0.95));
    this.core.position.set(0, 1.05 * scale, -0.3 * scale);
    this.group.add(this.core);
    this.bodyParts.push(this.core);
    this.critZone = this.core;
    audio.bossRoar(true);
  }

  protected onPhase(phase: number): void {
    if (phase === 1) {
      enemyHooks().bark(this.displayName, 'ESCALATING TO TIER-2 CUSTOMER SERVICE.');
      audio.bossRoar(true);
    } else {
      enemyHooks().bark(this.displayName, 'CORE EXPOSED. IRRELEVANT. PROBABLY.');
      // core glows hotter when exposed
      (this.core.material as THREE.MeshBasicMaterial).color.setHex(0xff3030);
    }
  }

  protected specialCooldown(): number { return this.phase === 0 ? 8 : this.phase === 1 ? 6 : 5; }

  protected special(): void {
    const playerPos = enemyHooks().playerPos();
    if (this.phase === 0) {
      // summon survey drones
      enemyHooks().bark(this.displayName, 'DEPLOYING SUBCONTRACTORS.');
      for (let i = 0; i < 2; i++) {
        enemySpawner.spawnOne(ENEMIES.helix_drone, this.position.clone().add(new THREE.Vector3((i ? 4 : -4), 0, 3)), false, 2);
      }
    } else if (this.phase === 1 || Math.random() < 0.5) {
      // rocket volley: three arcing shells at the player's position
      for (let i = 0; i < 3; i++) {
        const target = playerPos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 6, 0, (Math.random() - 0.5) * 6));
        const muzzle = this.position.clone().add(new THREE.Vector3(0, 2.4 * this.def.scale, 0));
        const aim = target.clone().sub(muzzle);
        const dist = aim.length();
        aim.normalize().multiplyScalar(18);
        aim.y += dist * 0.5;
        projectiles.spawn({
          pos: muzzle, vel: aim, damage: 9 * levelScale(this.level), element: 'blast',
          splash: 3.2, gravity: 14, fuse: -1, source: 'enemy',
        });
      }
      audio.explosion(false);
    } else {
      // beam sweep: sustained volt beam while it tracks the player
      this.beamT = 2.2;
      enemyHooks().bark(this.displayName, 'AUDITING.');
    }
  }

  override update(dt: number): void {
    super.update(dt);
    if (!this.alive) {
      if (this.beamLine) { this.beamLine.parent?.remove(this.beamLine); this.beamLine = null; }
      return;
    }
    // beam sweep damage + visual
    if (this.beamT > 0) {
      this.beamT -= dt;
      const playerPos = enemyHooks().playerPos();
      const from = this.position.clone().add(new THREE.Vector3(0, 2.2 * this.def.scale, 0));
      const to = playerPos.clone().add(new THREE.Vector3(0, 1, 0));
      fx.lightningArc(from, to);
      if (Math.random() < 0.5) fx.impact(to, 'volt');
      enemyHooks().damagePlayer(4.5 * levelScale(this.level) * dt * 4, 'volt', this.position);
      if (this.beamT <= 0 && this.beamLine) {
        this.beamLine.parent?.remove(this.beamLine);
        this.beamLine = null;
      }
    }
    // idle core pulse
    const m = this.core.material as THREE.MeshBasicMaterial;
    m.opacity = 0.7 + Math.sin(this.wobble * 2) * 0.25;
  }
}

// ---------------------------------------------------------------------------
// OLD MAN AVALANCHE — the thing under the Frosthollow. Charges downhill,
// slams out freezing novas, calls the pack, and hits like the weather.
export class OldManAvalanche extends Boss {
  private charging = 0;
  private chargeDir = new THREE.Vector3();
  private icicles: THREE.Mesh[] = [];

  constructor(level: number, pos: THREE.Vector3) {
    super(BOSS_AVALANCHE, level, pos);
    const scale = this.def.scale;
    // an icicle mantle across the shoulders — it sheds shards when he charges
    const iceMat = toonMat({ color: 0xbfe9f5 });
    for (let i = 0; i < 6; i++) {
      const ice = new THREE.Mesh(new THREE.ConeGeometry(0.09 * scale, (0.4 + Math.random() * 0.5) * scale, 5), iceMat);
      ice.position.set((i / 5 - 0.5) * 0.9 * scale, 1.55 * scale, -0.1 * scale);
      ice.rotation.x = Math.PI;
      this.group.add(ice);
      this.bodyParts.push(ice);
      this.icicles.push(ice);
    }
    // frozen beard = crit zone
    const beard = new THREE.Mesh(new THREE.BoxGeometry(0.4 * scale, 0.5 * scale, 0.18 * scale), glowMat(0x9ad8e8, 0.9));
    beard.position.set(0, 1.35 * scale, -0.24 * scale);
    this.group.add(beard);
    this.bodyParts.push(beard);
    this.critZone = beard;
    audio.bossRoar(false);
  }

  protected onPhase(phase: number): void {
    if (phase === 1) {
      enemyHooks().bark(this.displayName, 'PACK! DINNER INVITED ITSELF!');
      for (const s of [new THREE.Vector3(4, 0, 4), new THREE.Vector3(-4, 0, 4), new THREE.Vector3(0, 0, -5)]) {
        enemySpawner.spawnOne(ENEMIES.frostmutt, this.position.clone().add(s), false, 5);
      }
    } else {
      enemyHooks().bark(this.displayName, 'NO MORE WARM-UPS. ONLY COLD-DOWNS.');
      audio.bossRoar(false);
      this.def = { ...this.def, speed: this.def.speed * 1.45, attackRate: this.def.attackRate * 1.35 };
    }
  }

  protected specialCooldown(): number { return this.phase >= 2 ? 4.5 : 7; }

  protected special(): void {
    const playerPos = enemyHooks().playerPos();
    if (Math.random() < 0.5 && playerPos.distanceTo(this.position) > 6) {
      this.charging = 1.2;
      this.chargeDir.copy(playerPos).sub(this.position).setY(0).normalize();
      fx.burst(this.position.clone().add(new THREE.Vector3(0, 1.6, 0)), 0xe4f7ff, 22, 3, 0.14, 0.6, 2);
      enemyHooks().bark(this.displayName, 'AVALANCHE COMING THROUGH!');
    } else {
      // freezing slam: rime nova that slows everything it clips
      fx.explosion(this.position.clone(), 5.5, 0x9ad8e8);
      audio.explosion(true);
      audio.elemental('rime');
      splashDamage(this.position.clone(), 8, 9 * levelScale(this.level), 'rime', { source: 'enemy', elemChance: 0.9 });
    }
  }

  override update(dt: number): void {
    super.update(dt);
    if (!this.alive) return;
    if (this.charging > 0) {
      this.charging -= dt;
      this.position.addScaledVector(this.chargeDir, 15 * dt);
      this.settleToGround(true);
      this.wobble += dt * 16;
      fx.burst(this.position.clone().add(new THREE.Vector3(0, 0.4, 0)), 0xe4f7ff, 3, 2.5, 0.1, 0.5, 5);
      const playerPos = enemyHooks().playerPos();
      if (playerPos.distanceTo(this.position) < 2.8) {
        enemyHooks().damagePlayer(15 * levelScale(this.level), 'rime', this.position);
        this.charging = 0;
      }
    }
    if (this.phase >= 2 && Math.random() < 8 * dt) fx.statusFlames(this.position, 'rime');
    for (let i = 0; i < this.icicles.length; i++) {
      this.icicles[i].rotation.z = Math.sin(this.wobble * 0.6 + i) * 0.12;
    }
  }
}

// ---------------------------------------------------------------------------
export type BossId = 'gutterball' | 'warden_prime' | 'old_man_avalanche';

export function spawnBoss(id: BossId, pos: THREE.Vector3): Enemy {
  const level = state.level + 2;
  const boss = id === 'gutterball' ? new Gutterball(level, pos)
    : id === 'warden_prime' ? new WardenPrime(level, pos)
    : new OldManAvalanche(level, pos);
  enemySpawner.registerBoss(boss);
  fx.explosion(pos.clone().add(new THREE.Vector3(0, 1, 0)), 4, id === 'gutterball' ? 0xff8438 : id === 'warden_prime' ? 0x54d4ff : 0x9ad8e8);
  return boss;
}
