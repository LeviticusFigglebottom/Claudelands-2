// Enemy actors — pass 2. Procedural faction bodies with animated limbs,
// patrol/aggro AI (the world is populated, not wave-spawned), flyers and
// suicide bombers, hit flinches, and element-flavored deaths (rime shatter,
// ember ash, volt arcs, bile puddle). Districts repopulate on their own
// cadence via the spawner; bosses are subclassed in boss.ts.

import * as THREE from 'three';
import { ENEMIES, BADASS_CHANCE, BADASS_HP_MULT, BADASS_DMG_MULT, BADASS_SCALE, type EnemyDef } from '../data/enemies';
import { WORLD, districtAt, type DistrictDef } from '../data/world';
import { levelScale } from '../gen/weapongen';
import { toonMat, glowMat } from '../render/toon';
import { swatch } from '../render/textures';
import { fx } from './particles';
import { audio } from '../audio/synth';
import { debris } from './debris';
import { tickStatuses, slowFactor, splashDamage, type Damageable, type StatusEffect } from './combat';
import { projectiles } from './projectiles';
import { state } from './state';
import { weightedPick, pick, chance } from '../util/rng';
import { ELEMENTS } from '../data/elements';
import { difficulty } from './settings';
import { terrainHeight } from '../data/world';
import type { ElementId } from './types';

export interface EnemyHooks {
  playerPos: () => THREE.Vector3;
  damagePlayer: (amount: number, element: string, from?: THREE.Vector3) => void;
  groundHeight: (x: number, z: number) => number;
  onKilled: (enemy: Enemy, overkill: number) => void;
  bark: (name: string, line: string) => void;
  tauntTarget: () => THREE.Vector3 | null;
  /** True when nothing solid stands between two points (statics + terrain). */
  hasLOS: (from: THREE.Vector3, to: THREE.Vector3) => boolean;
  /** Candidate hide spots near a point, on the far side of props from a threat. */
  coverSpots: (near: THREE.Vector3, threat: THREE.Vector3, maxDist: number) => THREE.Vector3[];
}

let hooks: EnemyHooks;
export function setEnemyHooks(h: EnemyHooks): void { hooks = h; }
export function enemyHooks(): EnemyHooks { return hooks; }

type Limb = { mesh: THREE.Mesh; baseY: number; baseX: number; swing: number };

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
  critZone!: THREE.Mesh;
  /** Set on elite packs spawned for a side quest; recordKill matches on it. */
  questTag?: string;
  bodyParts: THREE.Mesh[] = [];
  homeDistrict: DistrictDef | null = null;
  aggro = false;
  killedBy: ElementId = 'kinetic';
  protected attackTimer = 0;
  private barkTimer = 4 + Math.random() * 8;
  protected wobble = Math.random() * 10;
  private healthBar: THREE.Sprite;
  private healthCtx: CanvasRenderingContext2D;
  private healthTex: THREE.CanvasTexture;
  private limbs: Limb[] = [];
  private flinchT = 0;
  private lastTotalHp = 0;
  private patrolTarget = new THREE.Vector3();
  private patrolWait = 0;
  private flashMats: THREE.MeshToonMaterial[] = [];
  private beepT = 0; // fusebug

  // ---- tactical brain (gunners/lobbers) ----
  private tactic: 'advance' | 'strafe' | 'toCover' | 'hold' | 'peek' = 'advance';
  private tacticT = 0.4;
  private strafeSign = Math.random() < 0.5 ? 1 : -1;
  private coverPos: THREE.Vector3 | null = null;
  private peekPos: THREE.Vector3 | null = null;
  private peekCycles = 0;
  private coverCooldown = 0;
  private grenadeT = 5 + Math.random() * 7;
  private crouchK = 0;
  private noLosT = 0;
  /** Dropped aggro and walking home; proximity re-aggro is briefly disabled. */
  private leashing = false;
  private leashCooldown = 0;

  constructor(def: EnemyDef, level: number, pos: THREE.Vector3, badass = false) {
    this.def = def;
    this.level = level;
    this.badass = badass;
    this.position.copy(pos);
    this.homeDistrict = districtAt(pos.x, pos.z);

    const hpBudget = 55 * def.hpMult * levelScale(level) * (badass ? BADASS_HP_MULT : 1) * difficulty().enemyHp;
    this.maxFlesh = Math.max(1, hpBudget * def.flesh);
    this.maxShield = hpBudget * def.shield;
    this.maxArmor = hpBudget * def.armor;
    this.flesh = this.maxFlesh; this.shield = this.maxShield; this.armor = this.maxArmor;
    this.lastTotalHp = this.totalHp();

    this.buildBody();
    // buildBody assigns critZone explicitly; fall back to last part if not
    if (!this.critZone) this.critZone = this.bodyParts[this.bodyParts.length - 1];

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
    this.pickPatrolTarget();
  }

  totalHp(): number { return this.flesh + this.shield + this.armor; }

  protected addLimb(mesh: THREE.Mesh, swing: number): void {
    this.limbs.push({ mesh, baseY: mesh.position.y, baseX: mesh.rotation.x, swing });
  }

  private mat(color: number, hexSwatch?: string): THREE.MeshToonMaterial {
    const m = toonMat({ color, map: hexSwatch ? swatch(hexSwatch, 70) : null });
    this.flashMats.push(m);
    return m;
  }

  protected buildBody(): void {
    const scale = this.def.scale * (this.badass ? BADASS_SCALE : 1);
    const hex = '#' + this.def.tint.toString(16).padStart(6, '0');
    const helix = this.def.faction === 'helix';
    const bodyMat = this.mat(this.badass ? 0xffb43c : 0xffffff, hex);
    const darkMat = this.mat(helix ? 0x4a5458 : 0x33302c);
    const critMat = this.mat(helix ? 0x2ba8a0 : 0xc8b8a8, helix ? undefined : '#b8a890');

    switch (this.def.behavior) {
      case 'flyer': {
        // hovering drone: hull disc + rotor ring + sensor eye (crit)
        const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.36 * scale, 0.5 * scale, 0.3 * scale, 8), bodyMat);
        hull.position.y = 2.6;
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62 * scale, 0.07 * scale, 6, 14), darkMat);
        ring.position.y = 2.72;
        ring.rotation.x = Math.PI / 2;
        const fins = new THREE.Mesh(new THREE.BoxGeometry(1.5 * scale, 0.04, 0.14 * scale), darkMat);
        fins.position.y = 2.72;
        fins.name = 'rotor';
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.16 * scale, 8, 8), critMat);
        eye.position.set(0, 2.5, -0.4 * scale);
        const glow = new THREE.Mesh(new THREE.SphereGeometry(0.08 * scale, 6, 6), glowMat(0xff3030, 1));
        glow.position.copy(eye.position).z -= 0.1 * scale;
        glow.layers.set(1);
        this.group.add(hull, ring, fins, eye, glow);
        this.bodyParts.push(hull, ring, fins, eye);
        this.critZone = eye;
        break;
      }
      case 'suicide': {
        // fusebug: round charge with legs and a blinking fuse
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.32 * scale, 8, 8), bodyMat);
        body.position.y = 0.32 * scale;
        for (let i = 0; i < 4; i++) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06 * scale, 0.3 * scale, 0.06 * scale), darkMat);
          const a = (i / 4) * Math.PI * 2 + 0.4;
          leg.position.set(Math.cos(a) * 0.3 * scale, 0.15 * scale, Math.sin(a) * 0.3 * scale);
          leg.rotation.z = Math.cos(a) * 0.6;
          this.group.add(leg);
          this.bodyParts.push(leg);
          this.addLimb(leg, 1.4);
        }
        const fuse = new THREE.Mesh(new THREE.SphereGeometry(0.1 * scale, 6, 6), glowMat(0xff3030, 1));
        fuse.position.y = 0.94 * scale;
        fuse.name = 'fuse';
        fuse.layers.set(1);
        // the fuse housing pokes ABOVE the body sphere so it's actually shootable
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.22 * scale, 0.2 * scale, 0.22 * scale), critMat);
        head.position.y = 0.74 * scale;
        this.group.add(body, fuse, head);
        this.bodyParts.push(body, head);
        this.critZone = head;
        break;
      }
      default: {
        if (this.def.id === 'scrapmutt' || this.def.id === 'frostmutt') {
          const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5 * scale, 0.45 * scale, 1.0 * scale), bodyMat);
          torso.position.y = 0.5 * scale;
          for (let i = 0; i < 4; i++) {
            const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1 * scale, 0.5 * scale, 0.1 * scale), darkMat);
            leg.position.set((i % 2 === 0 ? -1 : 1) * 0.2 * scale, 0.25 * scale, (i < 2 ? -1 : 1) * 0.35 * scale);
            this.group.add(leg); this.bodyParts.push(leg);
            this.addLimb(leg, i < 2 ? 1 : -1);
          }
          const head = new THREE.Mesh(new THREE.BoxGeometry(0.32 * scale, 0.3 * scale, 0.45 * scale), critMat);
          head.position.set(0, 0.62 * scale, -0.62 * scale);
          const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.26 * scale, 0.08 * scale, 0.3 * scale), darkMat);
          jaw.position.set(0, 0.5 * scale, -0.68 * scale);
          this.group.add(torso, jaw, head);
          this.bodyParts.push(torso, jaw, head);
          this.critZone = head;
        } else if (helix) {
          // helix stinger/warden: angular white chassis, teal joints
          const legs = new THREE.Mesh(new THREE.BoxGeometry(0.36 * scale, 0.66 * scale, 0.3 * scale), darkMat);
          legs.position.y = 0.33 * scale;
          const torso = new THREE.Mesh(new THREE.BoxGeometry(0.66 * scale, 0.62 * scale, 0.42 * scale), bodyMat);
          torso.position.y = 1.0 * scale;
          const chestLight = new THREE.Mesh(new THREE.CircleGeometry(0.09 * scale, 8), glowMat(0x2ba8a0, 0.95));
          chestLight.position.set(0, 1.08 * scale, -0.22 * scale);
          chestLight.rotation.y = Math.PI;
          const armL = new THREE.Mesh(new THREE.BoxGeometry(0.13 * scale, 0.6 * scale, 0.15 * scale), darkMat);
          armL.position.set(-0.44 * scale, 1.0 * scale, 0);
          const armR = armL.clone();
          armR.position.x = 0.44 * scale;
          if (this.def.id === 'helix_stinger') {
            const blade = new THREE.Mesh(new THREE.ConeGeometry(0.06 * scale, 0.7 * scale, 4), bodyMat);
            blade.position.set(0.44 * scale, 0.6 * scale, -0.2 * scale);
            blade.rotation.x = 2.4;
            this.group.add(blade);
            this.bodyParts.push(blade);
          }
          const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5 * scale, 4), darkMat);
          antenna.position.set(-0.2 * scale, 1.75 * scale, 0);
          const head = new THREE.Mesh(new THREE.BoxGeometry(0.34 * scale, 0.26 * scale, 0.3 * scale), critMat);
          head.position.y = 1.5 * scale;
          this.group.add(legs, torso, chestLight, armL, armR, antenna, head);
          this.bodyParts.push(legs, torso, armL, armR, antenna, head);
          this.critZone = head;
          this.addLimb(armL, 1); this.addLimb(armR, -1); this.addLimb(legs, 0);
          if (this.def.armor > 0) {
            const plate = new THREE.Mesh(new THREE.BoxGeometry(0.8 * scale, 0.7 * scale, 0.12 * scale), this.mat(0xc8c4ba, '#b8b4aa'));
            plate.position.set(0, 1.0 * scale, -0.28 * scale);
            this.group.add(plate); this.bodyParts.push(plate);
          }
        } else {
          // humanoid rustborn
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
          this.critZone = head;
          this.addLimb(armL, 1); this.addLimb(armR, -1);
          // armored brutes: the head hides behind plate — their weak point is
          // the glowing boiler valve on the BACK. Flank them.
          if (this.def.behavior === 'brute' && this.def.armor > 0) {
            const valve = new THREE.Mesh(new THREE.SphereGeometry(0.16 * scale, 8, 8), glowMat(0xffb43c, 0.95));
            valve.position.set(0, 1.15 * scale, 0.28 * scale);
            const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * scale, 0.05 * scale, 0.3 * scale, 6), darkMat);
            pipe.position.set(0, 1.35 * scale, 0.26 * scale);
            this.group.add(valve, pipe);
            this.bodyParts.push(valve);
            this.critZone = valve;
          }
          if (this.def.behavior === 'gunner' || this.def.behavior === 'lobber') {
            const gun = new THREE.Mesh(new THREE.BoxGeometry(0.1 * scale, 0.12 * scale, 0.5 * scale), darkMat);
            gun.position.set(0.42 * scale, 1.0 * scale, -0.3 * scale);
            this.group.add(gun); this.bodyParts.push(gun);
          }
          if (this.def.armor > 0) {
            const plate = new THREE.Mesh(new THREE.BoxGeometry(0.7 * scale, 0.8 * scale, 0.1 * scale), this.mat(0x8a8478, '#7a7468'));
            plate.position.set(0, 1.05 * scale, -0.24 * scale);
            this.group.add(plate); this.bodyParts.push(plate);
          }
        }
        if (this.def.shield > 0) {
          const bubble = new THREE.Mesh(new THREE.SphereGeometry(1.1 * scale, 10, 10),
            new THREE.MeshBasicMaterial({ color: 0x54d4ff, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false }));
          bubble.position.y = 1.0 * scale;
          bubble.name = 'shield_bubble';
          bubble.layers.set(1);
          this.group.add(bubble);
        }
      }
    }
    this.group.traverse((o) => { o.castShadow = true; });
  }

  get displayName(): string {
    return this.badass ? this.def.badassName : this.def.name;
  }

  private pickPatrolTarget(): void {
    const d = this.homeDistrict;
    if (!d) { this.patrolTarget.copy(this.position); return; }
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * d.radius * 0.8;
    this.patrolTarget.set(d.cx + Math.cos(a) * r, 0, d.cz + Math.sin(a) * r);
    this.patrolWait = 1 + Math.random() * 3;
  }

  update(dt: number): void {
    if (!this.alive) return;
    tickStatuses(this, dt);
    if (!this.alive) return;

    // hit flinch detection: any hp drop triggers flash + stagger + aggro
    const hp = this.totalHp();
    if (hp < this.lastTotalHp - 0.5) {
      this.flinchT = 0.18;
      this.aggro = true;
      for (const m of this.flashMats) m.emissive.setHex(0x662222);
    }
    this.lastTotalHp = hp;
    if (this.flinchT > 0) {
      this.flinchT -= dt;
      if (this.flinchT <= 0) for (const m of this.flashMats) m.emissive.setHex(0x000000);
    }

    const slow = slowFactor(this);
    const playerPos = hooks.playerPos();
    const distToPlayer = this.position.distanceTo(playerPos);

    // aggro check (leashing enemies ignore proximity for a beat)
    this.leashCooldown = Math.max(0, this.leashCooldown - dt);
    if (!this.aggro && this.leashCooldown <= 0 && distToPlayer < this.def.aggroRange * (this.badass ? 1.2 : 1)) {
      this.aggro = true;
      this.leashing = false;
      if (chance(Math.random as never, 0.6)) hooks.bark(this.displayName, pick(Math.random as never, this.def.barks));
    }

    // leash: nobody chases you to the ends of the earth. Past the home
    // district's edge they give up, shrug, heal, and wander back.
    if (this.aggro && this.homeDistrict && this.def.dropTier < 3 && !hooks.tauntTarget()) {
      const dh = Math.hypot(this.position.x - this.homeDistrict.cx, this.position.z - this.homeDistrict.cz);
      if (dh > this.homeDistrict.radius + 32) {
        this.aggro = false;
        this.leashing = true;
        this.leashCooldown = 5;
        this.flesh = this.maxFlesh; this.shield = this.maxShield; this.armor = this.maxArmor;
        this.patrolTarget.set(this.homeDistrict.cx, 0, this.homeDistrict.cz);
        this.patrolWait = 0;
        this.tactic = 'advance'; this.coverPos = null;
        if (chance(Math.random as never, 0.4)) hooks.bark(this.displayName, 'eh. not worth the walk.');
      }
    }

    if (!this.aggro) {
      this.patrolUpdate(dt, slow);
    } else {
      this.combatUpdate(dt, slow, playerPos, distToPlayer);
    }

    // crouch visual: settle low behind cover, pop back up to fight
    const wantCrouch = this.tactic === 'hold' ? 1 : 0;
    this.crouchK += (wantCrouch - this.crouchK) * Math.min(1, dt * 7);
    if (this.crouchK > 0.01) this.group.scale.y = 1 - this.crouchK * 0.28;
    else if (this.group.scale.y !== 1) this.group.scale.y = 1;

    // limb swing driven by wobble accumulated in movement
    for (const l of this.limbs) {
      l.mesh.rotation.x = l.baseX + Math.sin(this.wobble) * 0.55 * l.swing;
    }
    const rotor = this.group.getObjectByName('rotor');
    if (rotor) rotor.rotation.y += dt * 20;
    // fusebug blink accelerates near the player
    if (this.def.behavior === 'suicide') {
      this.beepT -= dt;
      const urgency = Math.max(0.12, Math.min(1, distToPlayer / 14));
      if (this.beepT <= 0 && this.aggro) {
        this.beepT = urgency * 0.55;
        if (distToPlayer < 26) audio.fuseBeep(1.4 - urgency * 0.5);
        const fuse = this.group.getObjectByName('fuse') as THREE.Mesh | undefined;
        if (fuse) fuse.visible = !fuse.visible;
      }
    }

    // ambient barks
    this.barkTimer -= dt;
    if (this.barkTimer <= 0 && distToPlayer < 26 && this.aggro) {
      this.barkTimer = 8 + Math.random() * 14;
      if (chance(Math.random as never, 0.55)) hooks.bark(this.displayName, pick(Math.random as never, this.def.barks));
    }

    const bubble = this.group.getObjectByName('shield_bubble') as THREE.Mesh | undefined;
    if (bubble) bubble.visible = this.shield > 0;

    this.drawHealthBar(distToPlayer);
  }

  private patrolUpdate(dt: number, slow: number): void {
    if (this.leashing && this.homeDistrict) {
      const dh = Math.hypot(this.position.x - this.homeDistrict.cx, this.position.z - this.homeDistrict.cz);
      if (dh < this.homeDistrict.radius * 0.75) { this.leashing = false; this.pickPatrolTarget(); }
    }
    if (this.patrolWait > 0 && !this.leashing) {
      this.patrolWait -= dt;
      this.settleToGround();
      return;
    }
    const to = this.patrolTarget.clone().sub(this.position); to.y = 0;
    if (to.length() < 1.5) { this.pickPatrolTarget(); return; }
    const dir = to.normalize();
    const speed = this.def.speed * (this.leashing ? 0.7 : 0.35) * slow;
    this.moveBlocked(dir, speed * dt);
    this.wobble += dt * 5 * slow;
    this.group.rotation.y = Math.atan2(dir.x, dir.z) + Math.PI;
    this.settleToGround(true);
  }

  /** Move along dir, refusing steep uphill (ridge walls). Flyers ignore. */
  protected moveBlocked(dir: THREE.Vector3, dist: number): void {
    if (this.def.behavior === 'flyer') {
      this.position.addScaledVector(dir, dist);
      return;
    }
    const hBefore = terrainHeight(this.position.x, this.position.z);
    const nx = this.position.x + dir.x * dist, nz = this.position.z + dir.z * dist;
    if (terrainHeight(nx, nz) - hBefore > dist * 1.1) return;
    this.position.x = nx;
    this.position.z = nz;
  }

  protected settleToGround(moving = false): void {
    const gy = hooks.groundHeight(this.position.x, this.position.z);
    if (this.def.behavior === 'flyer') {
      this.group.position.copy(this.position);
      this.group.position.y = gy + Math.sin(this.wobble * 0.6) * 0.3;
      this.position.y = this.group.position.y;
      return;
    }
    this.group.position.copy(this.position);
    this.group.position.y = gy + (moving ? Math.abs(Math.sin(this.wobble)) * 0.08 : 0);
    this.position.y = this.group.position.y;
  }

  protected combatUpdate(dt: number, slow: number, playerPos: THREE.Vector3, distToPlayer: number): void {
    const taunt = hooks.tauntTarget();
    const targetPos = taunt ?? playerPos;
    const toTarget = targetPos.clone().sub(this.position); toTarget.y = 0;
    const dist = toTarget.length();
    this.wobble += dt * 8 * slow;

    const def = this.def;
    const speed = def.speed * slow * (this.badass ? 1.1 : 1);
    const engage = def.attackRange;

    this.group.rotation.y = Math.atan2(toTarget.x, toTarget.z) + Math.PI;

    // suicide: detonate at range
    if (def.behavior === 'suicide' && dist < engage) {
      this.detonate();
      return;
    }

    // ranged humanoids get the full tactical brain
    if ((def.behavior === 'gunner' || def.behavior === 'lobber') && def.projectile) {
      this.rangedBrain(dt, slow, targetPos, dist, speed, taunt !== null);
      return;
    }

    if (dist > engage) {
      const dir = toTarget.normalize();
      if (def.behavior === 'flyer') {
        // flyers strafe sinusoidally while closing
        const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(Math.sin(this.wobble * 0.7) * 0.6);
        dir.add(side).normalize();
      } else if (def.behavior === 'rusher') {
        // rushers serpentine instead of beelining — harder to track, more alive
        const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(Math.sin(this.wobble * 1.15) * 0.38);
        dir.add(side).normalize();
      }
      this.moveBlocked(dir, speed * dt);
      this.wobble += dt * 2;
      this.settleToGround(true);
    } else {
      this.settleToGround();
      this.attackTimer -= dt * slow;
      if (this.attackTimer <= 0) {
        // flyers need a sightline; melee lunges connect regardless
        if (def.behavior === 'flyer' && def.projectile && !this.sightline(targetPos)) return;
        this.attackTimer = 1 / def.attackRate;
        this.attack(targetPos, taunt !== null);
      }
    }
  }

  /** Muzzle→head line-of-sight through the world's statics. Eye-height on
   *  both ends so gentle dune crests don't read as walls. */
  private sightline(targetPos: THREE.Vector3): boolean {
    const h = this.def.behavior === 'flyer' ? 2.6 : 1.5;
    const muzzle = this.position.clone().add(new THREE.Vector3(0, h * this.def.scale, 0));
    return hooks.hasLOS(muzzle, targetPos.clone().add(new THREE.Vector3(0, 1.5, 0)));
  }

  /** The gunner/lobber brain: hold a fighting band, strafe while shooting,
   *  break for cover when hurt, peek out in bursts, and frag campers. */
  private rangedBrain(dt: number, slow: number, targetPos: THREE.Vector3, dist: number, speed: number, attackingTurret: boolean): void {
    const def = this.def;
    const engage = def.attackRange;
    const los = this.sightline(targetPos);
    this.noLosT = los ? 0 : this.noLosT + dt;
    this.tacticT -= dt;
    this.coverCooldown -= dt;
    this.attackTimer -= dt * slow;

    const hpFrac = this.totalHp() / (this.maxFlesh + this.maxShield + this.maxArmor);

    // hurt in the open → look for something to hide behind
    if ((this.tactic === 'advance' || this.tactic === 'strafe') && hpFrac < 0.55 && this.coverCooldown <= 0) {
      this.coverCooldown = 6 + Math.random() * 4;
      const spots = hooks.coverSpots(this.position, targetPos, 20);
      const spot = spots.find((s) => s.distanceTo(targetPos) > 7);
      if (spot) {
        this.coverPos = spot.clone();
        this.tactic = 'toCover';
        this.peekCycles = 0;
        if (chance(Math.random as never, 0.4)) hooks.bark(this.displayName, pick(Math.random as never, ['COVER! COVER!', 'nope nope nope', 'regrouping!!']));
      }
    }

    // frag out: campers get flushed, and so do you
    if (def.grenades) {
      this.grenadeT -= dt;
      // always when the target hides; sometimes just because
      if (this.grenadeT <= 0 && dist < 26 && dist > 6 && (!los || Math.random() < 0.4)) {
        this.grenadeT = 8 + Math.random() * 6;
        this.throwFrag(targetPos);
      }
    }

    switch (this.tactic) {
      case 'advance': {
        if (this.tacticT <= 0) {
          // in the fighting band with a sightline → start working angles
          if (los && dist < engage * 1.05 && dist > engage * 0.35) {
            this.tactic = 'strafe';
            this.strafeSign = Math.random() < 0.5 ? 1 : -1;
            this.tacticT = 1.1 + Math.random() * 1.6;
          } else {
            this.tacticT = 0.5 + Math.random() * 0.5;
          }
        }
        const dir = targetPos.clone().sub(this.position).setY(0).normalize();
        if (dist > engage * 0.8) {
          this.moveBlocked(dir, speed * dt);
          this.settleToGround(true);
        } else if (!los) {
          // close enough but blind: flank — sidestep while drifting closer
          const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(this.strafeSign)
            .addScaledVector(dir, 0.45).normalize();
          this.moveBlocked(side, speed * 0.9 * dt);
          this.settleToGround(true);
          if (this.noLosT > 2.2) { this.strafeSign *= -1; this.noLosT = 0.6; }
        } else {
          this.settleToGround();
        }
        break;
      }
      case 'strafe': {
        if (this.tacticT <= 0) {
          if (Math.random() < 0.35) this.strafeSign *= -1;
          this.tactic = Math.random() < 0.25 ? 'advance' : 'strafe';
          this.tacticT = 1.1 + Math.random() * 1.6;
        }
        const dir = targetPos.clone().sub(this.position).setY(0).normalize();
        const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(this.strafeSign);
        // orbit with a gentle correction back into the band
        const radial = dist > engage * 0.85 ? 0.45 : dist < engage * 0.45 ? -0.55 : 0;
        const move = side.add(dir.multiplyScalar(radial)).normalize();
        this.moveBlocked(move, speed * 0.8 * dt);
        this.settleToGround(true);
        if (!los && this.noLosT > 1.4) { this.tactic = 'advance'; this.tacticT = 0.6; }
        break;
      }
      case 'toCover': {
        if (!this.coverPos) { this.tactic = 'advance'; break; }
        const to = this.coverPos.clone().sub(this.position).setY(0);
        if (to.length() < 1.1) {
          this.tactic = 'hold';
          this.tacticT = 1 + Math.random() * 1.2;
        } else {
          this.moveBlocked(to.normalize(), speed * 1.15 * dt);
          this.settleToGround(true);
          this.group.rotation.y = Math.atan2(to.x, to.z) + Math.PI; // face the run
        }
        break;
      }
      case 'hold': {
        this.settleToGround();
        // catch a breath behind the prop
        this.flesh = Math.min(this.maxFlesh, this.flesh + this.maxFlesh * 0.05 * dt);
        // flanked? cover only works if it's between you and the threat
        if (dist < 7 || this.sightline(targetPos)) { this.tactic = 'strafe'; this.coverPos = null; break; }
        if (this.tacticT <= 0) {
          const dir = targetPos.clone().sub(this.position).setY(0).normalize();
          const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(this.strafeSign * 2.1);
          this.peekPos = this.position.clone().add(side);
          this.tactic = 'peek';
          this.tacticT = 1.5 + Math.random() * 0.7;
        }
        break;
      }
      case 'peek': {
        if (!this.peekPos) { this.tactic = 'strafe'; break; }
        const to = this.peekPos.clone().sub(this.position).setY(0);
        if (to.length() > 0.5) {
          this.moveBlocked(to.normalize(), speed * 1.1 * dt);
          this.settleToGround(true);
        } else {
          this.settleToGround();
        }
        if (this.tacticT <= 0) {
          this.peekCycles++;
          if (this.peekCycles >= 2 + Math.floor(Math.random() * 2) || !this.coverPos) {
            this.tactic = 'strafe';
            this.coverPos = null;
          } else {
            // duck back behind the prop
            this.peekPos = null;
            this.tactic = 'toCover';
          }
        }
        break;
      }
    }

    // fire control: gunners need the sightline; lobbers arc OVER cover —
    // that's their whole job
    const canFire = def.behavior === 'lobber'
      ? dist < engage * 1.2
      : los && dist < engage * 1.15 && this.tactic !== 'toCover' && this.tactic !== 'hold';
    if (canFire && this.attackTimer <= 0) {
      this.attackTimer = 1 / def.attackRate;
      this.attack(targetPos, attackingTurret);
    }
  }

  /** A cooked frag, lobbed in an arc — with a warning glint and a beep. */
  private throwFrag(targetPos: THREE.Vector3): void {
    const def = this.def;
    const dmg = 11 * def.damageMult * levelScale(this.level) * (this.badass ? BADASS_DMG_MULT : 1);
    const muzzle = this.position.clone().add(new THREE.Vector3(0, 1.5 * def.scale, 0));
    const aim = targetPos.clone().sub(muzzle);
    const dist = aim.length();
    aim.normalize().multiplyScalar(13);
    aim.y += dist * 0.5;
    projectiles.spawn({
      pos: muzzle, vel: aim, damage: dmg, element: 'blast',
      splash: 3.6, gravity: 15, fuse: 1.25, bounces: 1, source: 'enemy',
    });
    fx.burst(muzzle, 0xffd23c, 6, 2.5, 0.08, 0.3, 3);
    audio.fuseBeep(1.2);
    if (chance(Math.random as never, 0.5)) hooks.bark(this.displayName, pick(Math.random as never, ['CATCH!', 'present for ya!', 'knock knock!']));
  }

  private detonate(): void {
    this.alive = false;
    splashDamage(this.position.clone().add(new THREE.Vector3(0, 0.5, 0)), 3.4,
      9 * this.def.damageMult * levelScale(this.level), 'blast', { source: 'enemy' });
    debris.groundDecal(this.position.x, this.position.z, 'scorch', 2.2);
    hooks.onKilled(this, 0);
  }

  protected attack(targetPos: THREE.Vector3, attackingTurret: boolean): void {
    const def = this.def;
    const dmg = 7 * def.damageMult * levelScale(this.level) * (this.badass ? BADASS_DMG_MULT : 1);
    const h = def.behavior === 'flyer' ? 2.6 : 1.3;
    const muzzle = this.position.clone().add(new THREE.Vector3(0, h * def.scale, 0));
    if (def.behavior === 'rusher' || def.behavior === 'brute') {
      // lunge: quick forward hop + swipe flash
      fx.burst(muzzle, 0xffffff, 6, 3, 0.07, 0.25, 4);
      this.wobble += 2;
      const d = targetPos.distanceTo(this.position);
      if (d < def.attackRange + 0.8 && !attackingTurret) hooks.damagePlayer(dmg * 1.4, 'kinetic', this.position);
    } else if (def.projectile) {
      const aim = targetPos.clone().add(new THREE.Vector3(0, attackingTurret ? 0.5 : 1.2, 0)).sub(muzzle);
      if (def.projectile.arc) {
        const dist = aim.length();
        aim.normalize().multiplyScalar(def.projectile.speed);
        aim.y += dist * 0.45;
        projectiles.spawn({
          pos: muzzle, vel: aim, damage: dmg, element: def.projectile.element,
          splash: 2.5, gravity: 14, fuse: -1, source: 'enemy',
        });
      } else {
        aim.normalize();
        aim.x += (Math.random() - 0.5) * 0.08; aim.y += (Math.random() - 0.5) * 0.05;
        projectiles.spawn({
          pos: muzzle, vel: aim.multiplyScalar(def.projectile.speed), damage: dmg,
          element: def.projectile.element, splash: 0, gravity: 0, source: 'enemy',
        });
      }
      fx.muzzleFlash(muzzle, targetPos.clone().sub(muzzle).normalize(), ELEMENTS[def.projectile.element].color, 0.7);
    }
  }

  private drawHealthBar(distToPlayer: number): void {
    const visible = distToPlayer < 32 && (this.flesh < this.maxFlesh || this.shield < this.maxShield || this.armor < this.maxArmor);
    this.healthBar.visible = visible;
    if (!visible) return;
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
  }

  onDeath(killedBy: ElementId, overkill: number): void {
    this.killedBy = killedBy;
    hooks.onKilled(this, overkill);
  }
}

// ---------------------------------------------------------------------------

interface Gib { mesh: THREE.Mesh; vel: THREE.Vector3; spin: THREE.Vector3; life: number; frozen: boolean }

// Borderlands-style encounters: each hostile district holds a staged fight —
// a couple of waves that trigger when you arrive, then STAY dead until you
// actually leave and come back. No trickle-respawn behind your back.
interface Encounter {
  def: DistrictDef;
  state: 'dormant' | 'engaged' | 'cleared';
  wavesLeft: number;
  waveDelay: number;   // countdown to the next reinforcement wave
  awayT: number;       // how long the player has been far away since clearing
}

export class EnemySpawner {
  enemies: Enemy[] = [];
  private gibs: Gib[] = [];
  private encounters: Encounter[] = [];
  boss: Enemy | null = null;
  scene!: THREE.Scene;

  attach(scene: THREE.Scene): void {
    this.scene = scene;
    this.refreshDistricts();
  }

  /** Re-read districts from the active map (call on map switch). Everything
   *  re-arms — leaving a map and returning is the canonical "revisit". */
  refreshDistricts(): void {
    this.encounters = WORLD.districts
      .filter((d) => d.spawnTable.length > 0)
      .map((def) => ({ def, state: 'dormant' as const, wavesLeft: 0, waveDelay: 0, awayT: 0 }));
  }

  /** Clear all live enemies and gibs (map switch). */
  reset(): void {
    for (const e of this.enemies) this.scene.remove(e.group);
    this.enemies = [];
    for (const g of this.gibs) this.scene.remove(g.mesh);
    this.gibs = [];
    this.boss = null;
  }

  /** Count of enemies currently hunting the player — drives the music. */
  aggroCount(): number {
    let n = 0;
    for (const e of this.enemies) if (e.alive && e.aggro) n++;
    return n;
  }

  aliveCount(): number { return this.enemies.filter((e) => e.alive).length; }

  /** Race mode etc.: true pauses district repopulation entirely. */
  suppressed = false;

  /** Enemies alive that call this district home. */
  private aliveIn(districtId: string): number {
    let n = 0;
    for (const e of this.enemies) if (e.alive && e.homeDistrict?.id === districtId) n++;
    return n;
  }

  /** One encounter wave: a spread of the district's table, spawned away
   *  from the player. The final wave brings a guaranteed badass. */
  private spawnWave(enc: Encounter, count: number, finalWave: boolean): void {
    const playerPos = enemyHooks().playerPos();
    const d = enc.def;
    for (let i = 0; i < count; i++) {
      const entry = weightedPick(Math.random as never, d.spawnTable.map((s) => ({ item: s, w: s.weight })));
      const def = ENEMIES[entry.enemyId];
      if (!def) continue;
      for (let tries = 0; tries < 8; tries++) {
        const a = Math.random() * Math.PI * 2;
        const r = d.radius * (0.3 + Math.random() * 0.55);
        const pos = new THREE.Vector3(d.cx + Math.cos(a) * r, 0, d.cz + Math.sin(a) * r);
        if (pos.distanceTo(playerPos) < 18) continue;
        this.spawnOne(def, pos, finalWave && i === 0 && d.maxAlive >= 6 ? true : undefined, d.levelOffset);
        break;
      }
    }
  }

  update(dt: number): void {
    const playerPos = enemyHooks().playerPos();

    // staged encounters per district
    for (const enc of this.suppressed ? [] : this.encounters) {
      const d = enc.def;
      const distToDistrict = Math.hypot(playerPos.x - d.cx, playerPos.z - d.cz);
      switch (enc.state) {
        case 'dormant': {
          if (distToDistrict < d.radius + 22) {
            enc.state = 'engaged';
            enc.wavesLeft = d.maxAlive >= 7 ? 2 : 1;   // 2–3 waves total
            this.spawnWave(enc, d.maxAlive, enc.wavesLeft === 0);
          }
          break;
        }
        case 'engaged': {
          const alive = this.aliveIn(d.id);
          if (enc.wavesLeft > 0 && alive <= Math.max(1, Math.floor(d.maxAlive * 0.2))) {
            enc.waveDelay -= dt;
            if (enc.waveDelay <= 0) {
              enc.wavesLeft--;
              enc.waveDelay = 2.4 + Math.random() * 1.4;
              this.spawnWave(enc, Math.max(2, Math.ceil(d.maxAlive * 0.75)), enc.wavesLeft === 0);
              if (distToDistrict < d.radius + 40) enemyHooks().bark(d.name, 'REINFORCEMENTS!');
            }
          } else {
            enc.waveDelay = 2.4 + Math.random() * 1.4;
          }
          if (enc.wavesLeft === 0 && alive === 0) {
            enc.state = 'cleared';
            enc.awayT = 0;
          }
          break;
        }
        case 'cleared': {
          // stays cleared until you genuinely leave and come back
          if (distToDistrict > d.radius + 80) {
            enc.awayT += dt;
            if (enc.awayT > 25) enc.state = 'dormant';
          } else {
            enc.awayT = 0;
          }
          break;
        }
      }
    }

    for (const e of this.enemies) e.update(dt);
    this.enemies = this.enemies.filter((e) => {
      if (!e.alive) this.scene.remove(e.group);
      return e.alive;
    });
    if (this.boss && !this.boss.alive) this.boss = null;

    // gib physics
    for (let i = this.gibs.length - 1; i >= 0; i--) {
      const g = this.gibs[i];
      g.life -= dt;
      if (!g.frozen) {
        g.vel.y -= 22 * dt;
        g.mesh.position.addScaledVector(g.vel, dt);
        g.mesh.rotation.x += g.spin.x * dt; g.mesh.rotation.y += g.spin.y * dt; g.mesh.rotation.z += g.spin.z * dt;
        const gy = enemyHooks().groundHeight(g.mesh.position.x, g.mesh.position.z);
        if (g.mesh.position.y < gy + 0.1) {
          g.mesh.position.y = gy + 0.1;
          g.vel.multiplyScalar(0.4);
          g.vel.y = Math.abs(g.vel.y) * 0.3;
        }
      }
      if (g.life <= 0) { this.scene.remove(g.mesh); this.gibs.splice(i, 1); }
    }
  }

  spawnOne(def: EnemyDef, pos: THREE.Vector3, forceBadass?: boolean, levelOffset = 0): Enemy {
    const level = Math.max(1, state.level + levelOffset + Math.floor(Math.random() * 2) - 1);
    const badass = forceBadass ?? Math.random() < BADASS_CHANCE;
    const e = new Enemy(def, level, pos, badass);
    this.scene.add(e.group);
    this.enemies.push(e);
    fx.burst(pos.clone().add(new THREE.Vector3(0, 1, 0)), def.faction === 'helix' ? 0x54d4ff : 0xff8438, 14, 4, 0.12, 0.5, 5);
    if (badass) enemyHooks().bark(e.displayName, 'A BADASS APPROACHES.');
    return e;
  }

  registerBoss(boss: Enemy): void {
    this.scene.add(boss.group);
    this.enemies.push(boss);
    this.boss = boss;
  }

  /** Element-flavored death burst. */
  gibBurst(e: Enemy): void {
    const killedBy = e.killedBy;
    const center = e.position.clone().add(new THREE.Vector3(0, 1.2 * e.def.scale, 0));
    audio.explosion(false);

    if (killedBy === 'rime') {
      // frozen solid: gibs become pale ice chunks that hang, then shatter
      audio.elemental('rime');
      for (const part of e.bodyParts) {
        const mesh = part.clone();
        mesh.material = toonMat({ color: 0xbfe9f5 });
        mesh.position.copy(e.group.position).add(part.position);
        mesh.rotation.copy(part.rotation);
        this.scene.add(mesh);
        this.gibs.push({
          mesh,
          vel: new THREE.Vector3((Math.random() - 0.5) * 2, 1 + Math.random() * 2, (Math.random() - 0.5) * 2),
          spin: new THREE.Vector3(Math.random() * 3, Math.random() * 3, Math.random() * 3),
          life: 0.8 + Math.random() * 0.5,
          frozen: false,
        });
      }
      fx.burst(center, 0xe4f7ff, 30, 5, 0.1, 0.9, 4);
      fx.burst(center, 0xffffff, 12, 2, 0.06, 1.1, 2);
      return;
    }
    if (killedBy === 'ember') {
      // burns to ash: fewer gibs, big ash/ember plume, smolder decal
      fx.burst(center, 0xff6a1a, 30, 5, 0.14, 0.8, 3, 0.9);
      fx.burst(center, 0x3a3230, 24, 3, 0.18, 1.4, 1.5, 1);
      debris.groundDecal(e.position.x, e.position.z, 'scorch', 1.6);
      audio.elemental('ember');
      this.launchGibs(e, 0.4, 4);
      return;
    }
    if (killedBy === 'bile') {
      fx.burst(center, 0x7dff2a, 26, 4.5, 0.14, 0.8, 10);
      debris.groundDecal(e.position.x, e.position.z, 'bile', 2);
      audio.elemental('bile');
      this.launchGibs(e, 0.6, 6);
      return;
    }
    if (killedBy === 'volt') {
      for (let i = 0; i < 4; i++) {
        const off = new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 2.5, (Math.random() - 0.5) * 3);
        fx.lightningArc(center, center.clone().add(off));
      }
      audio.elemental('volt');
      this.launchGibs(e, 1, 10);
      return;
    }
    // kinetic / blast: the full gib fountain
    this.launchGibs(e, 1, 8);
    fx.burst(center, 0xe04040, 22, 6, 0.14, 0.7, 9);
  }

  private launchGibs(e: Enemy, keepFraction: number, force: number): void {
    for (const part of e.bodyParts) {
      if (Math.random() > keepFraction) continue;
      const mesh = part.clone();
      mesh.position.copy(e.group.position).add(part.position);
      mesh.rotation.copy(part.rotation);
      this.scene.add(mesh);
      this.gibs.push({
        mesh,
        vel: new THREE.Vector3((Math.random() - 0.5) * force, force * 0.6 + Math.random() * force * 0.6, (Math.random() - 0.5) * force),
        spin: new THREE.Vector3(Math.random() * 12, Math.random() * 12, Math.random() * 12),
        life: 1.6 + Math.random(),
        frozen: false,
      });
    }
  }
}

export const enemySpawner = new EnemySpawner();
