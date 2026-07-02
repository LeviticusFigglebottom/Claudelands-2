// Enemy actors: procedural scrap-bandit bodies (with a crit-zone head),
// a small state machine per behavior archetype (rusher/gunner/lobber/brute),
// badass promotion, gib-burst deaths that trigger the loot fountain, barks,
// and the wave spawner driven by zone data.

import * as THREE from 'three';
import { ENEMIES, MINIBOSS, BADASS_CHANCE, BADASS_HP_MULT, BADASS_DMG_MULT, BADASS_SCALE, type EnemyDef } from '../data/enemies';
import type { ZoneDef } from '../data/zone';
import { levelScale } from '../gen/weapongen';
import { toonMat } from '../render/toon';
import { swatch } from '../render/textures';
import { fx } from './particles';
import { audio } from '../audio/synth';
import { tickStatuses, slowFactor, applyDamage, type Damageable, type StatusEffect, combatNow } from './combat';
import { projectiles } from './projectiles';
import { bus, state } from './state';
import { weightedPick, mulberry32, freshSeed, pick, chance } from '../util/rng';
import { ELEMENTS } from '../data/elements';

export interface EnemyHooks {
  playerPos: () => THREE.Vector3;
  damagePlayer: (amount: number, element: string) => void;
  groundHeight: (x: number, z: number) => number;
  onKilled: (enemy: Enemy, overkill: number) => void; // loot/xp hookup
  bark: (name: string, line: string) => void;
  /** Optional turret the AI may prefer to attack (Scrap Magnet augment). */
  tauntTarget: () => THREE.Vector3 | null;
}

let hooks: EnemyHooks;
export function setEnemyHooks(h: EnemyHooks): void { hooks = h; }

export class Enemy implements Damageable {
  def: EnemyDef;
  level: number;
  badass: boolean;
  group = new THREE.Group();
  position = new THREE.Vector3();
  alive = true;
  shield = 0; maxShield = 0;
  armor = 0; maxArmor = 0;
  flesh = 1; maxFlesh = 1;
  statuses: StatusEffect[] = [];
  slowUntil = 0;
  critZone: THREE.Mesh;              // headshots land here
  bodyParts: THREE.Mesh[] = [];      // become gibs on death
  private attackTimer = 0;
  private barkTimer = 4 + Math.random() * 8;
  private wobble = Math.random() * 10;
  private healthBar: THREE.Sprite;
  private healthCtx: CanvasRenderingContext2D;
  private healthTex: THREE.CanvasTexture;

  constructor(def: EnemyDef, level: number, pos: THREE.Vector3, badass = false) {
    this.def = def;
    this.level = level;
    this.badass = badass;
    this.position.copy(pos);

    const hpBudget = 55 * def.hpMult * levelScale(level) * (badass ? BADASS_HP_MULT : 1);
    this.maxFlesh = Math.max(1, hpBudget * def.flesh);
    this.maxShield = hpBudget * def.shield;
    this.maxArmor = hpBudget * def.armor;
    this.flesh = this.maxFlesh; this.shield = this.maxShield; this.armor = this.maxArmor;

    this.buildBody();
    this.critZone = this.bodyParts[this.bodyParts.length - 1]; // head is last

    // floating health bar (canvas sprite)
    const c = document.createElement('canvas'); c.width = 128; c.height = 20;
    this.healthCtx = c.getContext('2d')!;
    this.healthTex = new THREE.CanvasTexture(c);
    const mat = new THREE.SpriteMaterial({ map: this.healthTex, transparent: true, depthWrite: false });
    this.healthBar = new THREE.Sprite(mat);
    this.healthBar.scale.set(1.4, 0.22, 1);
    this.healthBar.position.y = 2.5 * def.scale * (badass ? BADASS_SCALE : 1);
    this.healthBar.layers.set(1);
    this.group.add(this.healthBar);
    this.group.position.copy(pos);
  }

  private buildBody(): void {
    const rng = mulberry32(freshSeed());
    const scale = this.def.scale * (this.badass ? BADASS_SCALE : 1);
    const hex = '#' + this.def.tint.toString(16).padStart(6, '0');
    const bodyMat = toonMat({ color: this.badass ? 0xffb43c : 0xffffff, map: swatch(hex, 80) });
    const darkMat = toonMat({ color: 0x33302c });
    const critMat = toonMat({ color: 0xc8b8a8, map: swatch('#b8a890', 40) });

    const isMutt = this.def.id === 'scrapmutt';
    if (isMutt) {
      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5 * scale, 0.45 * scale, 1.0 * scale), bodyMat);
      torso.position.y = 0.5 * scale;
      for (let i = 0; i < 4; i++) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1 * scale, 0.5 * scale, 0.1 * scale), darkMat);
        leg.position.set((i % 2 === 0 ? -1 : 1) * 0.2 * scale, 0.25 * scale, (i < 2 ? -1 : 1) * 0.35 * scale);
        this.group.add(leg); this.bodyParts.push(leg);
      }
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.32 * scale, 0.3 * scale, 0.45 * scale), critMat);
      head.position.set(0, 0.62 * scale, -0.62 * scale);
      const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.26 * scale, 0.08 * scale, 0.3 * scale), darkMat);
      jaw.position.set(0, 0.5 * scale, -0.68 * scale);
      this.group.add(torso, jaw, head);
      this.bodyParts.push(torso, jaw, head);
    } else {
      // humanoid scrapper: legs, torso, arms, spiky pauldron, head
      const legs = new THREE.Mesh(new THREE.BoxGeometry(0.42 * scale, 0.7 * scale, 0.26 * scale), darkMat);
      legs.position.y = 0.35 * scale;
      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6 * scale, 0.75 * scale, 0.34 * scale), bodyMat);
      torso.position.y = 1.05 * scale;
      const armL = new THREE.Mesh(new THREE.BoxGeometry(0.14 * scale, 0.62 * scale, 0.16 * scale), bodyMat);
      armL.position.set(-0.4 * scale, 1.05 * scale, 0);
      const armR = armL.clone();
      armR.position.x = 0.4 * scale;
      const pauldron = new THREE.Mesh(new THREE.ConeGeometry(0.16 * scale, 0.3 * scale, 5), darkMat);
      pauldron.position.set(-0.42 * scale, 1.5 * scale, 0);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.3 * scale, 0.32 * scale, 0.3 * scale), critMat);
      head.position.y = 1.62 * scale;
      this.group.add(legs, torso, armL, armR, pauldron, head);
      this.bodyParts.push(legs, torso, armL, armR, pauldron, head);
      if (this.def.behavior === 'gunner' || this.def.behavior === 'lobber') {
        const gun = new THREE.Mesh(new THREE.BoxGeometry(0.1 * scale, 0.12 * scale, 0.5 * scale), darkMat);
        gun.position.set(0.42 * scale, 1.0 * scale, -0.3 * scale);
        this.group.add(gun); this.bodyParts.push(gun);
      }
      if (this.def.shield > 0) {
        // visible shield bubble while shields hold
        const bubble = new THREE.Mesh(new THREE.SphereGeometry(1.1 * scale, 10, 10),
          new THREE.MeshBasicMaterial({ color: 0x54d4ff, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false }));
        bubble.position.y = 1.0 * scale;
        bubble.name = 'shield_bubble';
        bubble.layers.set(1);
        this.group.add(bubble);
      }
      if (this.def.armor > 0) {
        const plate = new THREE.Mesh(new THREE.BoxGeometry(0.7 * scale, 0.8 * scale, 0.1 * scale), toonMat({ color: 0x8a8478, map: swatch('#7a7468', 60) }));
        plate.position.set(0, 1.05 * scale, -0.24 * scale);
        this.group.add(plate); this.bodyParts.push(plate);
      }
    }
    this.group.traverse((o) => { o.castShadow = true; });
    void rng;
  }

  get displayName(): string {
    return this.badass ? this.def.badassName : this.def.name;
  }

  update(dt: number): void {
    if (!this.alive) return;
    tickStatuses(this, dt);
    if (!this.alive) return; // DoT may have killed us

    const slow = slowFactor(this);
    const playerPos = hooks.playerPos();
    const taunt = hooks.tauntTarget();
    const targetPos = taunt ?? playerPos;
    const toTarget = targetPos.clone().sub(this.position); toTarget.y = 0;
    const dist = toTarget.length();
    this.wobble += dt * 8 * slow;

    const def = this.def;
    const speed = def.speed * slow * (this.badass ? 1.1 : 1);
    const engage = def.attackRange;

    // face target
    this.group.rotation.y = Math.atan2(toTarget.x, toTarget.z) + Math.PI;

    if (dist > engage) {
      const dir = toTarget.normalize();
      this.position.addScaledVector(dir, speed * dt);
      // bob while moving — cheap life
      this.group.position.copy(this.position);
      this.group.position.y = hooks.groundHeight(this.position.x, this.position.z) + Math.abs(Math.sin(this.wobble)) * 0.08;
    } else {
      this.group.position.copy(this.position);
      this.group.position.y = hooks.groundHeight(this.position.x, this.position.z);
      this.attackTimer -= dt * slow;
      if (this.attackTimer <= 0) {
        this.attackTimer = 1 / def.attackRate;
        this.attack(targetPos, taunt !== null);
      }
    }
    this.position.y = this.group.position.y;

    // barks
    this.barkTimer -= dt;
    if (this.barkTimer <= 0 && dist < 26) {
      this.barkTimer = 8 + Math.random() * 14;
      if (chance(Math.random as never, 0.6)) hooks.bark(this.displayName, pick(Math.random as never, def.barks));
    }

    // shield bubble follows shield state
    const bubble = this.group.getObjectByName('shield_bubble') as THREE.Mesh | undefined;
    if (bubble) bubble.visible = this.shield > 0;

    this.drawHealthBar();
  }

  private attack(targetPos: THREE.Vector3, attackingTurret: boolean): void {
    const def = this.def;
    const dmg = 7 * def.damageMult * levelScale(this.level) * (this.badass ? BADASS_DMG_MULT : 1);
    const muzzle = this.position.clone().add(new THREE.Vector3(0, 1.3 * def.scale, 0));
    if (def.behavior === 'rusher' || def.behavior === 'brute') {
      // lunge visual + melee hit if still close
      fx.burst(muzzle, 0xffffff, 6, 3, 0.07, 0.25, 4);
      const d = targetPos.distanceTo(this.position);
      if (d < def.attackRange + 0.8 && !attackingTurret) hooks.damagePlayer(dmg * 1.4, 'kinetic');
    } else if (def.projectile) {
      const aim = targetPos.clone().add(new THREE.Vector3(0, attackingTurret ? 0.5 : 1.2, 0)).sub(muzzle);
      if (def.behavior === 'lobber') {
        const dist = aim.length();
        aim.normalize().multiplyScalar(def.projectile.speed);
        aim.y += dist * 0.45; // arc it
        projectiles.spawn({
          pos: muzzle, vel: aim, damage: dmg, element: def.projectile.element,
          splash: 2.5, gravity: 14, fuse: -1, source: 'enemy',
        });
      } else {
        aim.normalize();
        // lead-free, slightly inaccurate hitscan-ish bolt
        aim.x += (Math.random() - 0.5) * 0.08; aim.y += (Math.random() - 0.5) * 0.05;
        projectiles.spawn({
          pos: muzzle, vel: aim.multiplyScalar(def.projectile.speed), damage: dmg,
          element: def.projectile.element, splash: 0, gravity: 0, source: 'enemy',
        });
      }
      fx.muzzleFlash(muzzle, targetPos.clone().sub(muzzle).normalize(), ELEMENTS[def.projectile.element].color, 0.7);
    }
  }

  private drawHealthBar(): void {
    const ctx = this.healthCtx;
    ctx.clearRect(0, 0, 128, 20);
    ctx.fillStyle = 'rgba(10,10,14,0.75)';
    ctx.fillRect(0, 0, 128, 20);
    const total = this.maxFlesh + this.maxShield + this.maxArmor;
    let x = 2;
    const seg = (val: number, max: number, color: string) => {
      if (max <= 0) return;
      const w = (max / total) * 124;
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(x, 3, w, 14);
      ctx.fillStyle = color;
      ctx.fillRect(x, 3, w * Math.max(0, val / max), 14);
      x += w;
    };
    seg(this.flesh, this.maxFlesh, this.badass ? '#ff7034' : '#e04040');
    seg(this.armor, this.maxArmor, '#d8b028');
    seg(this.shield, this.maxShield, '#54d4ff');
    this.healthTex.needsUpdate = true;
    const dist = hooks.playerPos().distanceTo(this.position);
    this.healthBar.visible = dist < 30 && (this.flesh < this.maxFlesh || this.shield < this.maxShield || this.armor < this.maxArmor);
  }

  onDeath(killedBy: never, overkill: number): void {
    // gib burst: launch body parts as physics-lite chunks (handled by spawner)
    hooks.onKilled(this, overkill);
  }
}

// ---------------------------------------------------------------------------

interface Gib { mesh: THREE.Mesh; vel: THREE.Vector3; spin: THREE.Vector3; life: number }

export class EnemySpawner {
  enemies: Enemy[] = [];
  private gibs: Gib[] = [];
  private waveIdx = 0;
  private waveTimer = 0;
  private pendingBudget = 0;
  private spawnTick = 0;
  private bossSpawned = false;
  boss: Enemy | null = null;
  scene!: THREE.Scene;
  zone!: ZoneDef;

  attach(scene: THREE.Scene, zone: ZoneDef): void {
    this.scene = scene;
    this.zone = zone;
    this.waveTimer = zone.waves[0]?.delay ?? 5;
  }

  update(dt: number): void {
    // wave pacing
    if (this.waveIdx < this.zone.waves.length) {
      this.waveTimer -= dt;
      if (this.waveTimer <= 0) {
        this.pendingBudget += this.zone.waves[this.waveIdx].budget;
        this.waveIdx++;
        if (this.waveIdx < this.zone.waves.length) this.waveTimer = this.zone.waves[this.waveIdx].delay;
      }
    } else if (this.pendingBudget <= 0 && this.aliveCount() === 0 && !this.bossSpawned) {
      this.spawnBoss();
    } else if (this.aliveCount() < 3 && this.pendingBudget <= 0 && this.bossSpawned && (!this.boss || !this.boss.alive)) {
      // endless trickle after the boss falls — the gully never stays quiet
      this.pendingBudget += 30;
    }

    // drip spawns from budget
    this.spawnTick -= dt;
    if (this.pendingBudget > 0 && this.spawnTick <= 0 && this.aliveCount() < this.zone.maxAlive) {
      this.spawnTick = 1.1;
      const entry = weightedPick(Math.random as never, this.zone.spawnTable.map((s) => ({ item: s, w: s.weight })));
      const def = ENEMIES[entry.enemyId];
      this.pendingBudget -= def.weight * 0.5 + 8;
      this.spawnOne(def);
    }

    for (const e of this.enemies) e.update(dt);
    this.enemies = this.enemies.filter((e) => {
      if (!e.alive) this.scene.remove(e.group);
      return e.alive;
    });

    // gib physics
    for (let i = this.gibs.length - 1; i >= 0; i--) {
      const g = this.gibs[i];
      g.life -= dt;
      g.vel.y -= 22 * dt;
      g.mesh.position.addScaledVector(g.vel, dt);
      g.mesh.rotation.x += g.spin.x * dt; g.mesh.rotation.y += g.spin.y * dt; g.mesh.rotation.z += g.spin.z * dt;
      if (g.mesh.position.y < 0.1) { g.mesh.position.y = 0.1; g.vel.multiplyScalar(0.4); g.vel.y = Math.abs(g.vel.y) * 0.3; }
      if (g.life <= 0) { this.scene.remove(g.mesh); this.gibs.splice(i, 1); }
    }
  }

  aliveCount(): number { return this.enemies.filter((e) => e.alive).length; }

  private spawnPoint(): THREE.Vector3 {
    const spawners = this.zone.pois.filter((p) => p.kind === 'spawner');
    const s = spawners[Math.floor(Math.random() * spawners.length)];
    return new THREE.Vector3(s.x + (Math.random() - 0.5) * 6, 0, s.z + (Math.random() - 0.5) * 6);
  }

  spawnOne(def: EnemyDef, forcePos?: THREE.Vector3, forceBadass?: boolean): Enemy {
    const pos = forcePos ?? this.spawnPoint();
    const level = Math.max(1, state.level + Math.floor(Math.random() * 3) - 1);
    const badass = forceBadass ?? Math.random() < BADASS_CHANCE;
    const e = new Enemy(def, level, pos, badass);
    this.scene.add(e.group);
    this.enemies.push(e);
    fx.burst(pos.clone().add(new THREE.Vector3(0, 1, 0)), 0xff8438, 14, 4, 0.12, 0.5, 5); // spawn poof
    if (badass) hooks.bark(e.displayName, 'A BADASS APPROACHES.');
    return e;
  }

  private spawnBoss(): void {
    this.bossSpawned = true;
    const gate = this.zone.pois.find((p) => p.kind === 'boss_gate')!;
    this.boss = this.spawnOne(MINIBOSS, new THREE.Vector3(gate.x, 0, gate.z), false);
    hooks.bark(MINIBOSS.name, pick(Math.random as never, MINIBOSS.barks));
    audio.explosion(true);
  }

  /** Called by the loot system after onKilled — visual send-off. */
  gibBurst(e: Enemy): void {
    audio.explosion(false);
    for (const part of e.bodyParts) {
      const mesh = part.clone();
      mesh.position.copy(e.group.position).add(part.position);
      mesh.rotation.copy(part.rotation);
      this.scene.add(mesh);
      this.gibs.push({
        mesh,
        vel: new THREE.Vector3((Math.random() - 0.5) * 8, 4 + Math.random() * 6, (Math.random() - 0.5) * 8),
        spin: new THREE.Vector3(Math.random() * 12, Math.random() * 12, Math.random() * 12),
        life: 1.6 + Math.random(),
      });
    }
    fx.burst(e.position.clone().add(new THREE.Vector3(0, 1.2, 0)), 0xe04040, 22, 6, 0.14, 0.7, 9);
  }
}

export const enemySpawner = new EnemySpawner();
