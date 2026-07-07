// Boss encounters. Both bosses extend Enemy with phased attack patterns and
// telegraphed specials; quests spawn them via spawnBoss(). Their stat rows
// live in data/enemies.ts — this file is pure behavior.

import * as THREE from 'three';
import { Enemy, enemySpawner, enemyHooks } from './enemies';
import { ENEMIES, BOSS_GUTTERBALL, BOSS_WARDEN, BOSS_AVALANCHE, BOSS_FURNACE, BOSS_BLOOM, BOSS_ANCHORHEAD, BOSS_MOTHERLODE, BOSS_UNKEEPER, BOSS_ABBOT, BOSS_GALEPRIME, type EnemyDef } from '../data/enemies';
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
    // NOT aggro on spawn: a boss holds court in its arena until the player
    // walks in (aggroRange). Chargers/burrowers were migrating rooms away
    // from their thrones to meet the player halfway.
    this.aggro = false;
  }

  protected hpFraction(): number {
    return this.totalHp() / (this.maxFlesh + this.maxShield + this.maxArmor);
  }

  override update(dt: number): void {
    // a boss holds its throne: no patrol wander until the player walks in
    if (this.alive && !this.aggro) this.patrolWait = 1;
    super.update(dt);
    if (!this.alive || this.puppet) return; // replicas mirror the authority's pattern
    if (!this.aggro) return; // holding court: no phases, no specials, no barks
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
// SAINT FURNACE — the Kindled's walking god-stove. Meteor calls, ember
// novas, offering summons; its firebox door (chest) is the crit zone.
export class SaintFurnace extends Boss {
  private firebox: THREE.Mesh;

  constructor(level: number, pos: THREE.Vector3) {
    super(BOSS_FURNACE, level, pos);
    const scale = this.def.scale;
    // furnace dressing: chimney stack + glowing firebox door (crit)
    const iron = toonMat({ color: 0x3a3430 });
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.14 * scale, 0.2 * scale, 0.9 * scale, 8), iron);
    stack.position.set(0.25 * scale, 1.95 * scale, 0.1 * scale);
    this.group.add(stack);
    this.bodyParts.push(stack);
    this.firebox = new THREE.Mesh(new THREE.BoxGeometry(0.5 * scale, 0.55 * scale, 0.1 * scale), glowMat(0xff7a1a, 0.95));
    this.firebox.position.set(0, 1.0 * scale, -0.3 * scale);
    this.group.add(this.firebox);
    this.bodyParts.push(this.firebox);
    this.critZone = this.firebox;
    audio.bossRoar(true);
  }

  protected onPhase(phase: number): void {
    if (phase === 1) {
      enemyHooks().bark(this.displayName, 'CONGREGATION! FEED THE GUEST TO ME.');
      for (const s of [new THREE.Vector3(5, 0, 4), new THREE.Vector3(-5, 0, 4), new THREE.Vector3(0, 0, -6)]) {
        enemySpawner.spawnOne(ENEMIES.fusebug, this.position.clone().add(s), false, 9);
      }
    } else {
      enemyHooks().bark(this.displayName, 'OPEN. THE. DAMPERS.');
      audio.bossRoar(true);
      this.def = { ...this.def, speed: this.def.speed * 1.4, attackRate: this.def.attackRate * 1.35 };
      (this.firebox.material as THREE.MeshBasicMaterial).color.setHex(0xffd23c);
    }
  }

  protected specialCooldown(): number { return this.phase >= 2 ? 4 : 6.5; }

  protected special(): void {
    const playerPos = enemyHooks().playerPos();
    if (Math.random() < 0.5) {
      // METEOR RAIN: arcing slag shells bracket the player
      enemyHooks().bark(this.displayName, 'DONATIONS FROM ABOVE.');
      for (let i = 0; i < 4; i++) {
        const target = playerPos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 8, 0, (Math.random() - 0.5) * 8));
        const muzzle = this.position.clone().add(new THREE.Vector3(0, 2.6 * this.def.scale, 0));
        const aim = target.clone().sub(muzzle);
        const dist = aim.length();
        aim.normalize().multiplyScalar(16);
        aim.y += dist * 0.55;
        projectiles.spawn({
          pos: muzzle, vel: aim, damage: 10 * levelScale(this.level), element: 'ember',
          splash: 3, gravity: 14, fuse: -1, source: 'enemy',
        });
      }
      audio.explosion(false);
    } else {
      // EMBER NOVA slam
      fx.explosion(this.position.clone(), 6, 0xff7a1a);
      audio.explosion(true);
      audio.elemental('ember');
      splashDamage(this.position.clone(), 8.5, 10 * levelScale(this.level), 'ember', { source: 'enemy', elemChance: 0.8 });
    }
  }

  override update(dt: number): void {
    super.update(dt);
    if (!this.alive) return;
    // always shedding sparks
    if (Math.random() < 12 * dt) fx.statusFlames(this.position, 'ember');
    const m = this.firebox.material as THREE.MeshBasicMaterial;
    m.opacity = 0.75 + Math.sin(this.wobble * 2.2) * 0.2;
  }
}

// ---------------------------------------------------------------------------
// THE BLOOM MOTHER — the Verdant's early-woken garden god. A walking flower
// the size of a shed: petal crown, vine arms, and a glowing seed-heart (crit).
export class BloomMother extends Boss {
  private heart: THREE.Mesh;
  private petals: THREE.Mesh[] = [];

  constructor(level: number, pos: THREE.Vector3) {
    super(BOSS_BLOOM, level, pos);
    const scale = this.def.scale;
    const petalMat = toonMat({ color: 0xff6aa0 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const petal = new THREE.Mesh(new THREE.ConeGeometry(0.34 * scale, 1.1 * scale, 5), petalMat);
      petal.position.set(Math.cos(a) * 0.62 * scale, 2.05 * scale, Math.sin(a) * 0.62 * scale);
      petal.rotation.z = Math.cos(a) * 1.15;
      petal.rotation.x = -Math.sin(a) * 1.15;
      this.group.add(petal);
      this.bodyParts.push(petal);
      this.petals.push(petal);
    }
    // vine arms
    const vineMat = toonMat({ color: 0x2f6a30 });
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.1 * scale, 0.16 * scale, 1.6 * scale, 6), vineMat);
      arm.position.set(side * 0.85 * scale, 1.2 * scale, 0.2 * scale);
      arm.rotation.z = side * 0.7;
      this.group.add(arm);
      this.bodyParts.push(arm);
    }
    this.heart = new THREE.Mesh(new THREE.SphereGeometry(0.3 * scale, 10, 10), glowMat(0x9adc4a, 0.95));
    this.heart.position.set(0, 2.05 * scale, 0);
    this.group.add(this.heart);
    this.bodyParts.push(this.heart);
    this.critZone = this.heart;
    audio.bossRoar(true);
  }

  protected onPhase(phase: number): void {
    if (phase === 1) {
      enemyHooks().bark(this.displayName, 'CHILDREN. THE GUEST NEEDS PLANTING.');
      for (const s of [new THREE.Vector3(5, 0, 4), new THREE.Vector3(-5, 0, 4), new THREE.Vector3(0, 0, -6), new THREE.Vector3(4, 0, -4)]) {
        enemySpawner.spawnOne(ENEMIES.sporeling, this.position.clone().add(s), false, 4);
      }
    } else {
      enemyHooks().bark(this.displayName, 'FULL. BLOOM.');
      audio.bossRoar(true);
      this.def = { ...this.def, speed: this.def.speed * 1.5, attackRate: this.def.attackRate * 1.3 };
      for (const p of this.petals) ((p.material as THREE.MeshToonMaterial).color ?? { setHex: () => 0 }).setHex(0xff2a6a);
    }
  }

  protected specialCooldown(): number { return this.phase >= 2 ? 4.2 : 6.8; }

  protected special(): void {
    const playerPos = enemyHooks().playerPos();
    if (Math.random() < 0.5) {
      // SEED RAIN: lobbed pods bracket the player
      enemyHooks().bark(this.displayName, 'SOW.');
      for (let i = 0; i < 4; i++) {
        const target = playerPos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 8, 0, (Math.random() - 0.5) * 8));
        const muzzle = this.position.clone().add(new THREE.Vector3(0, 2.4 * this.def.scale, 0));
        const aim = target.clone().sub(muzzle);
        const dist = aim.length();
        aim.normalize().multiplyScalar(15);
        aim.y += dist * 0.6;
        projectiles.spawn({
          pos: muzzle, vel: aim, damage: 9 * levelScale(this.level), element: 'bile',
          splash: 3.2, gravity: 13, fuse: -1, source: 'enemy',
        });
      }
      audio.explosion(false);
    } else {
      // SPORE NOVA
      fx.explosion(this.position.clone(), 6, 0x9adc4a);
      audio.explosion(true);
      audio.elemental('bile');
      splashDamage(this.position.clone(), 8.5, 9 * levelScale(this.level), 'bile', { source: 'enemy', elemChance: 0.85 });
    }
  }

  override update(dt: number): void {
    super.update(dt);
    if (!this.alive) return;
    if (Math.random() < 8 * dt) fx.statusFlames(this.position, 'bile');
    const m = this.heart.material as THREE.MeshBasicMaterial;
    m.opacity = 0.75 + Math.sin(this.wobble * 2) * 0.2;
  }
}

// ---------------------------------------------------------------------------
// ADMIRAL ANCHORHEAD — the PELICAN's drowned captain, promoted by the sea.
// Harpoon volleys, anchor-slam rime novas, hands on deck; his ship's lantern
// (still lit, still regulation) hangs off the anchor stock — that's the crit.
export class AdmiralAnchorhead extends Boss {
  private lantern: THREE.Mesh;
  private anchor: THREE.Group;
  private charging = 0;
  private chargeDir = new THREE.Vector3();

  constructor(level: number, pos: THREE.Vector3) {
    super(BOSS_ANCHORHEAD, level, pos);
    const scale = this.def.scale;
    const iron = toonMat({ color: 0x3a4442 });
    // the bower anchor across his back
    this.anchor = new THREE.Group();
    const shank = new THREE.Mesh(new THREE.BoxGeometry(0.12 * scale, 1.7 * scale, 0.12 * scale), iron);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.9 * scale, 0.1 * scale, 0.1 * scale), iron);
    stock.position.y = 0.7 * scale;
    for (const side of [-1, 1]) {
      const fluke = new THREE.Mesh(new THREE.ConeGeometry(0.14 * scale, 0.5 * scale, 4), iron);
      fluke.position.set(side * 0.3 * scale, -0.8 * scale, 0);
      fluke.rotation.z = side * 2.4;
      this.anchor.add(fluke);
    }
    this.anchor.add(shank, stock);
    this.anchor.position.set(0, 1.3 * scale, 0.42 * scale);
    this.anchor.rotation.z = 0.35;
    this.group.add(this.anchor);
    this.anchor.traverse((o) => { if (o instanceof THREE.Mesh) this.bodyParts.push(o); });
    // bicorn hat — management
    const bicorn = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * scale, 0.42 * scale, 0.22 * scale, 4), toonMat({ color: 0x24322e }));
    bicorn.position.y = 2.1 * scale;
    bicorn.rotation.y = Math.PI / 4;
    this.group.add(bicorn);
    this.bodyParts.push(bicorn);
    // the ship's lantern: still lit, still regulation — CRIT
    this.lantern = new THREE.Mesh(new THREE.SphereGeometry(0.22 * scale, 10, 10), glowMat(0x7dffd4, 0.95));
    this.lantern.position.set(0.55 * scale, 1.75 * scale, 0.35 * scale);
    this.group.add(this.lantern);
    this.bodyParts.push(this.lantern);
    this.critZone = this.lantern;
    audio.bossRoar(false);
  }

  protected onPhase(phase: number): void {
    if (phase === 1) {
      enemyHooks().bark(this.displayName, 'ALL HANDS! BOARDING PARTY, ASSEMBLE!');
      for (const s of [new THREE.Vector3(5, 0, 4), new THREE.Vector3(-5, 0, 4), new THREE.Vector3(0, 0, -6)]) {
        enemySpawner.spawnOne(ENEMIES.brine_husk, this.position.clone().add(s), false, 6);
      }
    } else {
      enemyHooks().bark(this.displayName, 'STORM STATIONS. THAT MEANS ME.');
      audio.bossRoar(false);
      this.def = { ...this.def, speed: this.def.speed * 1.45, attackRate: this.def.attackRate * 1.35 };
      (this.lantern.material as THREE.MeshBasicMaterial).color.setHex(0x54ffb8);
    }
  }

  protected specialCooldown(): number { return this.phase >= 2 ? 4.2 : 6.5; }

  protected special(): void {
    const playerPos = enemyHooks().playerPos();
    const roll = Math.random();
    if (roll < 0.4 && playerPos.distanceTo(this.position) > 7) {
      // KEELHAUL: drag the anchor in a straight charge, spray in the wake
      this.charging = 1.15;
      this.chargeDir.copy(playerPos).sub(this.position).setY(0).normalize();
      fx.burst(this.position.clone().add(new THREE.Vector3(0, 1.6, 0)), 0x7dffd4, 22, 3, 0.14, 0.6, 2);
      enemyHooks().bark(this.displayName, 'WEIGH ANCHOR!');
    } else if (roll < 0.7) {
      // HARPOON VOLLEY: three flat, fast bolts fanned at the player
      enemyHooks().bark(this.displayName, 'STICK THE STOWAWAY!');
      const muzzle = this.position.clone().add(new THREE.Vector3(0, 1.9 * this.def.scale, 0));
      const base = playerPos.clone().sub(muzzle).setY(0).normalize();
      for (let i = -1; i <= 1; i++) {
        const dir = base.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), i * 0.16);
        projectiles.spawn({
          pos: muzzle.clone(), vel: dir.multiplyScalar(32).add(new THREE.Vector3(0, 1.2, 0)),
          damage: 8 * levelScale(this.level), element: 'kinetic',
          splash: 0, gravity: 3, fuse: -1, source: 'enemy',
        });
      }
      audio.explosion(false);
    } else {
      // ANCHOR SLAM: freezing brine nova
      fx.explosion(this.position.clone(), 5.5, 0x54a8c8);
      audio.explosion(true);
      audio.elemental('rime');
      splashDamage(this.position.clone(), 8, 9.5 * levelScale(this.level), 'rime', { source: 'enemy', elemChance: 0.85 });
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
      fx.burst(this.position.clone().add(new THREE.Vector3(0, 0.4, 0)), 0xbfe8e0, 3, 2.5, 0.1, 0.5, 5);
      const playerPos = enemyHooks().playerPos();
      if (playerPos.distanceTo(this.position) < 2.9) {
        enemyHooks().damagePlayer(15 * levelScale(this.level), 'rime', this.position);
        this.charging = 0;
      }
    }
    // the sea drips off him constantly
    if (Math.random() < 6 * dt) fx.statusFlames(this.position, 'rime');
    this.anchor.rotation.z = 0.35 + Math.sin(this.wobble * 0.5) * 0.08;
    const m = this.lantern.material as THREE.MeshBasicMaterial;
    m.opacity = 0.75 + Math.sin(this.wobble * 2.4) * 0.2;
  }
}

// ---------------------------------------------------------------------------
// THE MOTHER LODE — the thing on level nine that the dig crew started feeding.
// A crystal-crowned burrower: shard volleys, quake novas, and a plowing
// underground charge. The resonant crown is the crit zone (it's load-bearing).
export class MotherLode extends Boss {
  private crown: THREE.Mesh;
  private spikes: THREE.Mesh[] = [];
  private burrowing = 0;
  private burrowDir = new THREE.Vector3();

  constructor(level: number, pos: THREE.Vector3) {
    super(BOSS_MOTHERLODE, level, pos);
    const scale = this.def.scale;
    // crystal spines down the back
    const shardMat = glowMat(0x54d4ff, 0.55);
    for (let i = 0; i < 7; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.12 * scale, (0.5 + Math.abs(Math.sin(i * 2.1)) * 0.6) * scale, 5), shardMat);
      spike.position.set((i / 6 - 0.5) * 0.8 * scale, 1.5 * scale + Math.sin(i * 1.4) * 0.2 * scale, 0.3 * scale);
      spike.rotation.x = -0.5;
      this.group.add(spike);
      this.bodyParts.push(spike);
      this.spikes.push(spike);
    }
    // the resonant crown — CRIT
    this.crown = new THREE.Mesh(new THREE.OctahedronGeometry(0.34 * scale, 0), glowMat(0x9ae8ff, 0.95));
    this.crown.position.y = 2.25 * scale;
    this.group.add(this.crown);
    this.bodyParts.push(this.crown);
    this.critZone = this.crown;
    audio.bossRoar(true);
  }

  protected onPhase(phase: number): void {
    if (phase === 1) {
      enemyHooks().bark(this.displayName, 'the seam calls its SHIFT.');
      for (const s of [new THREE.Vector3(5, 0, 4), new THREE.Vector3(-5, 0, 4), new THREE.Vector3(0, 0, -6), new THREE.Vector3(4, 0, -4)]) {
        enemySpawner.spawnOne(ENEMIES.gravemite, this.position.clone().add(s), false, 8);
      }
    } else {
      enemyHooks().bark(this.displayName, 'FORTISSIMO.');
      audio.bossRoar(true);
      this.def = { ...this.def, speed: this.def.speed * 1.45, attackRate: this.def.attackRate * 1.3 };
      (this.crown.material as THREE.MeshBasicMaterial).color.setHex(0xd4f4ff);
    }
  }

  protected specialCooldown(): number { return this.phase >= 2 ? 4 : 6.5; }

  protected special(): void {
    const playerPos = enemyHooks().playerPos();
    const roll = Math.random();
    if (roll < 0.38 && playerPos.distanceTo(this.position) > 7) {
      // BURROW: plow under the floor toward the player, erupt on arrival
      this.burrowing = 1.2;
      this.burrowDir.copy(playerPos).sub(this.position).setY(0).normalize();
      fx.burst(this.position.clone(), 0x8a94b8, 26, 4, 0.16, 0.7, 3);
      enemyHooks().bark(this.displayName, 'the floor is MINE. all floors are.');
    } else if (roll < 0.7) {
      // SHARD VOLLEY: charged crystal arcs bracket the player
      enemyHooks().bark(this.displayName, 'tribute, RETURNED.');
      for (let i = 0; i < 4; i++) {
        const target = playerPos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 8, 0, (Math.random() - 0.5) * 8));
        const muzzle = this.position.clone().add(new THREE.Vector3(0, 2.4 * this.def.scale, 0));
        const aim = target.clone().sub(muzzle);
        const dist = aim.length();
        aim.normalize().multiplyScalar(16);
        aim.y += dist * 0.55;
        projectiles.spawn({
          pos: muzzle, vel: aim, damage: 10 * levelScale(this.level), element: 'volt',
          splash: 3.2, gravity: 14, fuse: -1, source: 'enemy',
        });
      }
      audio.explosion(false);
    } else {
      // QUAKE NOVA
      fx.explosion(this.position.clone(), 6, 0x54d4ff);
      audio.explosion(true);
      audio.elemental('volt');
      splashDamage(this.position.clone(), 8.5, 10 * levelScale(this.level), 'volt', { source: 'enemy', elemChance: 0.8 });
    }
  }

  override update(dt: number): void {
    super.update(dt);
    if (!this.alive) {
      this.group.position.y = this.position.y; // never die half-sunk
      return;
    }
    if (this.burrowing > 0) {
      this.burrowing -= dt;
      this.position.addScaledVector(this.burrowDir, 16 * dt);
      this.settleToGround(true);
      // plowing under: sink the body, throw a bow wave of dirt
      this.group.position.y = this.position.y - 1.6;
      this.wobble += dt * 14;
      fx.burst(this.position.clone().add(new THREE.Vector3(0, 0.3, 0)), 0x48566a, 4, 3, 0.12, 0.6, 4);
      const playerPos = enemyHooks().playerPos();
      if (this.burrowing <= 0 || playerPos.distanceTo(this.position) < 3) {
        // ERUPTION
        this.burrowing = 0;
        this.group.position.y = this.position.y;
        fx.explosion(this.position.clone(), 5, 0x8a94b8);
        audio.explosion(true);
        splashDamage(this.position.clone(), 6.5, 11 * levelScale(this.level), 'blast', { source: 'enemy' });
      }
    }
    if (this.phase >= 2 && Math.random() < 8 * dt) fx.statusFlames(this.position, 'volt');
    this.crown.rotation.y += dt * 1.4;
    const m = this.crown.material as THREE.MeshBasicMaterial;
    m.opacity = 0.75 + Math.sin(this.wobble * 2.6) * 0.2;
    for (let i = 0; i < this.spikes.length; i++) {
      const sm = this.spikes[i].material as THREE.MeshBasicMaterial;
      sm.opacity = 0.45 + Math.sin(this.wobble * 2 + i * 0.9) * 0.18;
    }
  }
}

// ---------------------------------------------------------------------------
// THE UNKEEPER — Keeper Morrow of Lampfall Spire, two hundred years past his
// last lit round. He walks his old circuit with the lantern OUT, winding the
// dark the way Faro winds the light. The dead lantern on his crook is the
// crit zone: it's the only thing he'd hate to lose.
export class Unkeeper extends Boss {
  private lantern: THREE.Mesh;
  private crook: THREE.Group;
  private walking = 0;                 // THE LONG ROUND: his charge is a stride
  private walkDir = new THREE.Vector3();
  private flicker = 0;                 // crit feedback: the dead lamp remembers

  constructor(level: number, pos: THREE.Vector3) {
    super(BOSS_UNKEEPER, level, pos);
    const scale = this.def.scale;
    const iron = toonMat({ color: 0x1e1836 });
    const cloth = toonMat({ color: 0x2a2244 });
    // keeper's storm coat: a long skirt of dark cloth
    const coat = new THREE.Mesh(new THREE.CylinderGeometry(0.55 * scale, 0.85 * scale, 1.3 * scale, 8), cloth);
    coat.position.y = 0.75 * scale;
    this.group.add(coat);
    this.bodyParts.push(coat);
    // wide-brimmed keeper's hat
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.5 * scale, 0.54 * scale, 0.07 * scale, 10), iron);
    brim.position.y = 1.98 * scale;
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.24 * scale, 0.3 * scale, 0.34 * scale, 8), iron);
    crown.position.y = 2.16 * scale;
    this.group.add(brim, crown);
    this.bodyParts.push(brim, crown);
    // the crook: a tall hooked staff carried off one shoulder...
    this.crook = new THREE.Group();
    const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.06 * scale, 0.09 * scale, 3.1 * scale, 6), iron);
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.28 * scale, 0.05 * scale, 6, 12, Math.PI * 1.2), iron);
    hook.position.y = 1.6 * scale;
    hook.rotation.z = -0.4;
    this.crook.add(staff, hook);
    this.crook.position.set(0.75 * scale, 1.35 * scale, 0.1 * scale);
    this.crook.rotation.z = -0.18;
    this.group.add(this.crook);
    this.crook.traverse((o) => { if (o instanceof THREE.Mesh) this.bodyParts.push(o); });
    // ...with the dead lantern swinging from the hook — CRIT
    this.lantern = new THREE.Mesh(new THREE.BoxGeometry(0.34 * scale, 0.42 * scale, 0.34 * scale), glowMat(0x241c40, 0.9));
    this.lantern.position.set(1.05 * scale, 2.6 * scale, 0.1 * scale);
    this.group.add(this.lantern);
    this.bodyParts.push(this.lantern);
    this.critZone = this.lantern;
    audio.bossRoar(false);
  }

  protected onPhase(phase: number): void {
    if (phase === 1) {
      enemyHooks().bark(this.displayName, 'THE ROWS REMEMBER THEIR KEEPER. UP.');
      for (const s of [new THREE.Vector3(5, 0, 4), new THREE.Vector3(-5, 0, 4), new THREE.Vector3(0, 0, -6), new THREE.Vector3(4, 0, -4)]) {
        enemySpawner.spawnOne(ENEMIES.wickling, this.position.clone().add(s), false, 11);
      }
    } else {
      enemyHooks().bark(this.displayName, 'DOUBLE SHIFT.');
      audio.bossRoar(false);
      this.def = { ...this.def, speed: this.def.speed * 1.45, attackRate: this.def.attackRate * 1.35 };
      // the lantern lights — wrong: it burns dark violet
      (this.lantern.material as THREE.MeshBasicMaterial).color.setHex(0x9a6aff);
    }
  }

  protected specialCooldown(): number { return this.phase >= 2 ? 4.2 : 6.6; }

  protected special(): void {
    const playerPos = enemyHooks().playerPos();
    const roll = Math.random();
    if (roll < 0.4 && playerPos.distanceTo(this.position) > 7) {
      // THE LONG ROUND: he resumes his circuit, straight through you
      this.walking = 1.2;
      this.walkDir.copy(playerPos).sub(this.position).setY(0).normalize();
      fx.burst(this.position.clone().add(new THREE.Vector3(0, 1.6, 0)), 0x9a6aff, 22, 3, 0.14, 0.6, 2);
      enemyHooks().bark(this.displayName, 'the round CONTINUES.');
    } else if (roll < 0.72) {
      // CURFEW: lobbed panes of dead glass bracket the player
      enemyHooks().bark(this.displayName, 'CURFEW.');
      for (let i = 0; i < 4; i++) {
        const target = playerPos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 8, 0, (Math.random() - 0.5) * 8));
        const muzzle = this.position.clone().add(new THREE.Vector3(0, 2.5 * this.def.scale, 0));
        const aim = target.clone().sub(muzzle);
        const dist = aim.length();
        aim.normalize().multiplyScalar(16);
        aim.y += dist * 0.55;
        projectiles.spawn({
          pos: muzzle, vel: aim, damage: 10 * levelScale(this.level), element: 'volt',
          splash: 3.2, gravity: 14, fuse: -1, source: 'enemy',
        });
      }
      audio.explosion(false);
    } else {
      // LIGHTS OUT: the cold of a lamp dying, as a nova
      fx.explosion(this.position.clone(), 6, 0x6a5adf);
      audio.explosion(true);
      audio.elemental('rime');
      splashDamage(this.position.clone(), 8.5, 9.5 * levelScale(this.level), 'rime', { source: 'enemy', elemChance: 0.85 });
    }
  }

  private lastHp = -1;

  override update(dt: number): void {
    super.update(dt);
    if (!this.alive) return;
    if (this.walking > 0) {
      this.walking -= dt;
      this.position.addScaledVector(this.walkDir, 14.5 * dt);
      this.settleToGround(true);
      this.wobble += dt * 14;
      fx.burst(this.position.clone().add(new THREE.Vector3(0, 0.4, 0)), 0x5a4acf, 3, 2.5, 0.1, 0.5, 5);
      const playerPos = enemyHooks().playerPos();
      if (playerPos.distanceTo(this.position) < 2.9) {
        enemyHooks().damagePlayer(15 * levelScale(this.level), 'kinetic', this.position);
        this.walking = 0;
      }
    }
    if (this.phase >= 2 && Math.random() < 7 * dt) fx.statusFlames(this.position, 'volt');
    // the dead lantern sways on the hook; taking a hit makes it flicker
    // awake for half a heartbeat — the tell that you found the thing he
    // still loves (damage lands via combat.ts, so watch the hp delta)
    const hp = this.totalHp();
    if (this.lastHp >= 0 && hp < this.lastHp) this.flicker = 1;
    this.lastHp = hp;
    this.crook.rotation.z = -0.18 + Math.sin(this.wobble * 0.5) * 0.06;
    this.lantern.position.x = (1.05 + Math.sin(this.wobble * 0.5) * 0.05) * this.def.scale;
    this.flicker = Math.max(0, this.flicker - dt * 2);
    const m = this.lantern.material as THREE.MeshBasicMaterial;
    m.opacity = this.phase >= 2 ? 0.75 + Math.sin(this.wobble * 2.4) * 0.2 : 0.55 + this.flicker * 0.4;
  }
}

// ---------------------------------------------------------------------------
// THE STATIC ABBOT — Voltholm's grounded monk. Runs the Capacitorium like a
// monastery where the storm takes confession. His halo is a charged capacitor
// ring — the crit zone — and every special is a sermon: chain-lightning
// litanies, a grounding nova, and called-down judgment bolts that preview
// the SKYFALL storm mechanic in miniature.
export class StaticAbbot extends Boss {
  private halo: THREE.Mesh;
  private judgePts: THREE.Vector3[] = [];
  private judgeT = 0;

  constructor(level: number, pos: THREE.Vector3) {
    super(BOSS_ABBOT, level, pos);
    const scale = this.def.scale;
    const cloth = toonMat({ color: 0x3a3e2a });
    const brass = toonMat({ color: 0x9a8a3c });
    // the cassock: a bell of storm-waxed cloth
    const cassock = new THREE.Mesh(new THREE.CylinderGeometry(0.5 * scale, 0.95 * scale, 1.4 * scale, 8), cloth);
    cassock.position.y = 0.8 * scale;
    this.group.add(cassock);
    this.bodyParts.push(cassock);
    // a copper stole, because the storm likes a conductor
    const stole = new THREE.Mesh(new THREE.BoxGeometry(0.2 * scale, 1.2 * scale, 0.08 * scale), brass);
    stole.position.set(0.2 * scale, 1.15 * scale, 0.3 * scale);
    this.group.add(stole);
    this.bodyParts.push(stole);
    // the halo: a capacitor ring floating over the cowl — CRIT
    this.halo = new THREE.Mesh(new THREE.TorusGeometry(0.42 * scale, 0.08 * scale, 8, 18), glowMat(0xc8d24a, 0.85));
    this.halo.position.y = 2.35 * scale;
    this.halo.rotation.x = Math.PI / 2;
    this.group.add(this.halo);
    this.bodyParts.push(this.halo);
    this.critZone = this.halo;
    audio.bossRoar(false);
  }

  protected onPhase(phase: number): void {
    if (phase === 1) {
      enemyHooks().bark(this.displayName, 'BROTHERS. THE COLLECTION PLATE.');
      for (const s of [new THREE.Vector3(5, 0, 4), new THREE.Vector3(-5, 0, 4), new THREE.Vector3(0, 0, -6)]) {
        enemySpawner.spawnOne(ENEMIES.conductor, this.position.clone().add(s), false, 12);
      }
    } else {
      enemyHooks().bark(this.displayName, 'VESPERS ARE OVER. NOW WE SING LOUD.');
      audio.bossRoar(false);
      this.def = { ...this.def, speed: this.def.speed * 1.4, attackRate: this.def.attackRate * 1.4 };
      (this.halo.material as THREE.MeshBasicMaterial).color.setHex(0xffffa0);
    }
  }

  protected specialCooldown(): number { return this.phase >= 2 ? 4.4 : 6.8; }

  protected special(): void {
    const playerPos = enemyHooks().playerPos();
    const roll = Math.random();
    if (roll < 0.38) {
      // LITANY: a fan of chained volt bolts, wide then converging
      enemyHooks().bark(this.displayName, 'RESPONSORIAL. REPEAT AFTER ME.');
      const muzzle = this.position.clone().add(new THREE.Vector3(0, 2.2 * this.def.scale, 0));
      const base = playerPos.clone().sub(muzzle).setY(0).normalize();
      for (let i = -2; i <= 2; i++) {
        const dir = base.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), i * 0.16);
        dir.y = 0.06;
        projectiles.spawn({
          pos: muzzle.clone(), vel: dir.normalize().multiplyScalar(30),
          damage: 7.5 * levelScale(this.level), element: 'volt',
          splash: 1.6, gravity: 0, fuse: -1, source: 'enemy',
        });
      }
      audio.elemental('volt');
    } else if (roll < 0.72) {
      // JUDGMENT: he marks spots under and around you — bolts land a beat later
      enemyHooks().bark(this.displayName, 'THE SKY WILL NOW TAKE QUESTIONS.');
      this.judgePts = [];
      for (let i = 0; i < 3; i++) {
        const p = playerPos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 7, 0, (Math.random() - 0.5) * 7));
        p.y = enemyHooks().groundHeight(p.x, p.z);
        this.judgePts.push(p);
        fx.burst(p.clone().add(new THREE.Vector3(0, 0.4, 0)), 0xc8d24a, 14, 2, 0.1, 0.9, 1);
      }
      this.judgeT = 1.0;
    } else {
      // GROUNDING: the floor becomes the sermon
      fx.explosion(this.position.clone(), 6, 0xc8d24a);
      audio.explosion(true);
      audio.elemental('volt');
      splashDamage(this.position.clone(), 8, 9 * levelScale(this.level), 'volt', { source: 'enemy', elemChance: 0.8 });
    }
  }

  override update(dt: number): void {
    super.update(dt);
    if (!this.alive) return;
    // judgment bolts: telegraphed columns that punish standing still
    if (this.judgeT > 0) {
      this.judgeT -= dt;
      for (const p of this.judgePts) {
        if (Math.random() < 6 * dt) fx.burst(p.clone().add(new THREE.Vector3(0, 0.3, 0)), 0xf8ffc0, 3, 1.5, 0.08, 0.6, 1);
      }
      if (this.judgeT <= 0) {
        for (const p of this.judgePts) {
          fx.skyBolt(p);
          splashDamage(p.clone(), 3.4, 12 * levelScale(this.level), 'volt', { source: 'enemy', elemChance: 0.9 });
        }
        audio.explosion(true);
        this.judgePts = [];
      }
    }
    // the halo spins; faster when he's angrier
    this.halo.rotation.z += dt * (this.phase >= 2 ? 3.2 : 1.2);
    if (this.phase >= 2 && Math.random() < 7 * dt) fx.statusFlames(this.position, 'volt');
  }
}

// ---------------------------------------------------------------------------
// GALE PRIME, THE UNANCHORED — the Eyewall's tenant. A storm-harvest foreman
// who cut every mooring but one: the last shackle on its chest is the crit
// zone. Fights with the weather itself — shearing wind charges, an updraft
// nova that throws you off your aim, crosswind summons, and bottled fronts.
export class GalePrime extends Boss {
  private shackle: THREE.Mesh;
  private vanes: THREE.Group;
  private shearing = 0;
  private shearDir = new THREE.Vector3();

  constructor(level: number, pos: THREE.Vector3) {
    super(BOSS_GALEPRIME, level, pos);
    const scale = this.def.scale;
    const slate = toonMat({ color: 0x5a6a78 });
    const iron = toonMat({ color: 0x32383e });
    // a torso wrapped in wind-torn harness plates
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.62 * scale, 0.5 * scale, 1.2 * scale, 8), slate);
    barrel.position.y = 1.25 * scale;
    this.group.add(barrel);
    this.bodyParts.push(barrel);
    // turbine vanes orbit the shoulders — the storm it wears like a coat
    this.vanes = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const vane = new THREE.Mesh(new THREE.BoxGeometry(1.1 * scale, 0.08 * scale, 0.26 * scale), iron);
      const a = (i / 4) * Math.PI * 2;
      vane.position.set(Math.cos(a) * 0.95 * scale, 0, Math.sin(a) * 0.95 * scale);
      vane.rotation.y = -a;
      this.vanes.add(vane);
      this.bodyParts.push(vane);
    }
    this.vanes.position.y = 1.9 * scale;
    this.group.add(this.vanes);
    // THE LAST MOORING: one glowing shackle still bolted to the chest — CRIT
    this.shackle = new THREE.Mesh(new THREE.TorusGeometry(0.26 * scale, 0.09 * scale, 8, 14), glowMat(0x9adcff, 0.9));
    this.shackle.position.set(0, 1.3 * scale, 0.55 * scale);
    this.group.add(this.shackle);
    this.bodyParts.push(this.shackle);
    this.critZone = this.shackle;
    audio.bossRoar(true);
  }

  protected onPhase(phase: number): void {
    if (phase === 1) {
      enemyHooks().bark(this.displayName, 'CROSSWIND. MEET THE CREW I KEPT.');
      for (const s of [new THREE.Vector3(6, 0, 3), new THREE.Vector3(-6, 0, 3), new THREE.Vector3(0, 0, -7)]) {
        enemySpawner.spawnOne(Math.random() < 0.5 ? ENEMIES.zephyrite : ENEMIES.stormcrow, this.position.clone().add(s), false, 13);
      }
    } else {
      enemyHooks().bark(this.displayName, 'LAST MOORING. CUT IT IF YOU CAN.');
      audio.bossRoar(true);
      this.def = { ...this.def, speed: this.def.speed * 1.5, attackRate: this.def.attackRate * 1.35 };
      (this.shackle.material as THREE.MeshBasicMaterial).color.setHex(0xffb44a);
    }
  }

  protected specialCooldown(): number { return this.phase >= 2 ? 4.0 : 6.4; }

  protected special(): void {
    const playerPos = enemyHooks().playerPos();
    const roll = Math.random();
    if (roll < 0.35 && playerPos.distanceTo(this.position) > 7) {
      // SHEAR: it stops walking and starts weathering — a wind-wrapped charge
      this.shearing = 1.15;
      this.shearDir.copy(playerPos).sub(this.position).setY(0).normalize();
      fx.burst(this.position.clone().add(new THREE.Vector3(0, 1.8, 0)), 0x9adcff, 24, 4, 0.14, 0.6, 2);
      enemyHooks().bark(this.displayName, 'WIND ADVISORY.');
    } else if (roll < 0.66) {
      // UPDRAFT: a burst nova that damages AND throws the player off their feet
      enemyHooks().bark(this.displayName, 'OUT. THE SKY INSISTS.');
      fx.explosion(this.position.clone(), 6, 0x9adcff);
      audio.explosion(true);
      splashDamage(this.position.clone(), 9, 7.5 * levelScale(this.level), 'blast', { source: 'enemy' });
      const away = playerPos.clone().sub(this.position).setY(0);
      if (away.lengthSq() < 12 * 12 && enemyHooks().shovePlayer) {
        enemyHooks().shovePlayer!(away.x, away.z, 26);
      }
    } else {
      // BOTTLED FRONT: lobbed weather, brackets the player like mortar fire
      enemyHooks().bark(this.displayName, 'FORECAST SAYS: INCOMING.');
      for (let i = 0; i < 4; i++) {
        const target = playerPos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 9, 0, (Math.random() - 0.5) * 9));
        const muzzle = this.position.clone().add(new THREE.Vector3(0, 2.4 * this.def.scale, 0));
        const aim = target.clone().sub(muzzle);
        const dist = aim.length();
        aim.normalize().multiplyScalar(17);
        aim.y += dist * 0.5;
        projectiles.spawn({
          pos: muzzle, vel: aim, damage: 10 * levelScale(this.level), element: 'blast',
          splash: 3.4, gravity: 14, fuse: -1, source: 'enemy',
        });
      }
      audio.explosion(false);
    }
  }

  override update(dt: number): void {
    super.update(dt);
    if (!this.alive) return;
    if (this.shearing > 0) {
      this.shearing -= dt;
      this.position.addScaledVector(this.shearDir, 16 * dt);
      this.settleToGround(true);
      this.wobble += dt * 16;
      fx.burst(this.position.clone().add(new THREE.Vector3(0, 0.6, 0)), 0x9adcff, 3, 3, 0.1, 0.5, 4);
      const playerPos = enemyHooks().playerPos();
      if (playerPos.distanceTo(this.position) < 3.0) {
        enemyHooks().damagePlayer(14 * levelScale(this.level), 'kinetic', this.position);
        // the wind carries you with it, briefly
        enemyHooks().shovePlayer?.(this.shearDir.x, this.shearDir.z, 18);
        this.shearing = 0;
      }
    }
    // vanes spin with fury; phase 2 sheds constant wind streaks
    this.vanes.rotation.y += dt * (this.phase >= 2 ? 6 : 2.4);
    if (this.phase >= 2 && Math.random() < 8 * dt) {
      fx.burst(this.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, 1.5 + Math.random(), (Math.random() - 0.5) * 3)), 0xaad8c8, 2, 3, 0.08, 0.5, 3);
    }
  }
}

// ---------------------------------------------------------------------------
export type BossId = 'gutterball' | 'warden_prime' | 'old_man_avalanche' | 'saint_furnace' | 'bloom_mother' | 'admiral_anchorhead' | 'mother_lode' | 'unkeeper' | 'static_abbot' | 'gale_prime';

export function spawnBoss(id: BossId, pos: THREE.Vector3, levelOverride?: number): Enemy {
  const level = levelOverride ?? state.level + 2;
  const boss = id === 'gutterball' ? new Gutterball(level, pos)
    : id === 'warden_prime' ? new WardenPrime(level, pos)
    : id === 'old_man_avalanche' ? new OldManAvalanche(level, pos)
    : id === 'bloom_mother' ? new BloomMother(level, pos)
    : id === 'admiral_anchorhead' ? new AdmiralAnchorhead(level, pos)
    : id === 'mother_lode' ? new MotherLode(level, pos)
    : id === 'unkeeper' ? new Unkeeper(level, pos)
    : id === 'static_abbot' ? new StaticAbbot(level, pos)
    : id === 'gale_prime' ? new GalePrime(level, pos)
    : new SaintFurnace(level, pos);
  enemySpawner.registerBoss(boss);
  const flash: Record<string, number> = {
    gutterball: 0xff8438, warden_prime: 0x54d4ff, old_man_avalanche: 0x9ad8e8,
    bloom_mother: 0x9adc4a, admiral_anchorhead: 0x7dffd4, mother_lode: 0x54d4ff,
    unkeeper: 0x9a6aff, static_abbot: 0xc8d24a, gale_prime: 0x9adcff,
  };
  fx.explosion(pos.clone().add(new THREE.Vector3(0, 1, 0)), 4, flash[id] ?? 0xff7a1a);
  return boss;
}
