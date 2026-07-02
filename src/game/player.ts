// The player — pass 2. Pointer-lock FPS controller with terrain-aware
// movement, footsteps/landing feel, weapon sway, manufacturer-flavored
// reload animations (with physical mag drops + shell casings), firing
// (hitscan + projectile) with surface decals, gimmicks, ADS, grenades,
// damage-direction feedback, and Fight For Your Life.

import * as THREE from 'three';
import type { WeaponInstance, ElementId } from './types';
import { state, bus } from './state';
import { statsys } from './stats';
import { juice, JUICE } from './juice';
import { audio } from '../audio/synth';
import { fx } from './particles';
import { debris } from './debris';
import { buildGunMesh } from '../gen/gunmesh';
import { makerById } from '../data/manufacturers';
import { applyDamage, splashDamage, combatNow, type Damageable, type StatusEffect } from './combat';
import { projectiles } from './projectiles';
import { enemySpawner, type Enemy } from './enemies';
import { ELEMENTS } from '../data/elements';
import { clamp, damp, lerp } from '../util/maff';
import { LEGENDARIES } from '../data/legendaries';
import { actionSkill } from './actionskill';
import { difficulty } from './settings';
import type { StaticHit, ExplosiveBarrel } from './world';

const EYE_HEIGHT = 1.65;
const PLAYER_RADIUS = 0.45;

export interface WorldQuery {
  groundHeight: (x: number, z: number) => number;
  resolveCollision: (pos: THREE.Vector3, radius: number) => void;
  raycastStatics: (ray: THREE.Raycaster) => StaticHit | null;
  barrels: () => ExplosiveBarrel[];
  arenaHalf: number;
}

export interface HitscanTarget {
  target: Damageable;
  enemy: Enemy | null;      // set when the target is an actual enemy
  point: THREE.Vector3;
  isCrit: boolean;
  distance: number;
}

export class Player implements Damageable {
  position = new THREE.Vector3(0, 0, 112);
  alive = true;
  shield = 0; maxShield = 0;
  armor = 0; maxArmor = 0;
  flesh = 100; maxFlesh = 100;
  statuses: StatusEffect[] = [];
  slowUntil = 0;
  isPlayer = true;

  camera: THREE.PerspectiveCamera;
  yaw = 0; // spawn at the north road looking south into Gutterlight
  pitch = 0;
  private velY = 0;
  private grounded = true;
  private wasGrounded = true;
  private keys = new Set<string>();
  mouseDown = false;
  private adsHeld = false;
  adsAmount = 0;

  // weapon handling
  viewmodel = new THREE.Group();
  private gunMesh: THREE.Group | null = null;
  private magazine = 0;
  private reloadT = -1;
  private magDropped = false;
  private swapT = -1;
  private fireTimer = 0;
  private focusHeat = 0;
  private fireHeat = 0;           // sustained-fire bloom for the crosshair
  private overkillBank = 0;
  private shieldDelayT = 0;
  private baseFov = 75;
  private bobT = 0;
  private stepT = 0;
  private landDip = 0;
  private swayX = 0;
  private swayY = 0;
  lastSpreadDeg = 1;

  // fight for your life
  downed = false;
  downedT = 0;
  downedMax = 10;

  paused = false;

  world!: WorldQuery;
  /** Set by UI: receives world-space angle of incoming damage. */
  onHurtFrom: ((relAngle: number) => void) | null = null;
  /** Set by main: where to respawn after bleeding out. */
  respawnPoint = new THREE.Vector3(0, 0, 112);

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.baseFov = camera.fov;
    camera.add(this.viewmodel);
    this.viewmodel.position.set(0.28, -0.26, -0.5);
    camera.position.set(this.position.x, this.position.y + EYE_HEIGHT, this.position.z);
    camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  // ------------------------------------------------------------------ input
  bindInput(el: HTMLElement): void {
    document.addEventListener('keydown', (e) => this.keys.add(e.code));
    document.addEventListener('keyup', (e) => this.keys.delete(e.code));
    el.addEventListener('mousedown', (e) => {
      if (this.paused) return;
      if (e.button === 0) this.mouseDown = true;
      if (e.button === 2) this.adsHeld = true;
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
      if (e.button === 2) this.adsHeld = false;
    });
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== el || this.paused) return;
      const sens = 0.0021 * (1 - this.adsAmount * 0.55);
      this.yaw -= e.movementX * sens;
      this.pitch = clamp(this.pitch - e.movementY * sens, -1.45, 1.45);
      // viewmodel sway lags behind the look
      this.swayX = clamp(this.swayX + e.movementX * 0.0004, -0.03, 0.03);
      this.swayY = clamp(this.swayY + e.movementY * 0.0004, -0.03, 0.03);
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // ------------------------------------------------------------------ gear
  recomputeVitals(): void {
    const sh = state.shield;
    this.maxShield = sh ? sh.capacity * statsys.mult('shieldCapacity') : 0;
    if (sh?.special?.id === 'fortify') this.maxShield *= 0.5;
    const hpBase = 100 + state.level * 14;
    this.maxFlesh = hpBase * statsys.mult('maxHealth') * (sh?.special?.id === 'fortify' ? 1 + sh.special.power / 200 : 1);
    this.shield = Math.min(this.shield, this.maxShield);
    this.flesh = Math.min(this.flesh, this.maxFlesh);
  }

  equipWeapon(w: WeaponInstance | null, instant = false): void {
    if (this.gunMesh) { this.viewmodel.remove(this.gunMesh); this.gunMesh = null; }
    if (w) {
      this.gunMesh = buildGunMesh(w);
      this.viewmodel.add(this.gunMesh);
      this.magazine = w.stats.magSize;
      this.reloadT = -1;
      if (!instant) this.swapT = 0.35;
    }
  }

  get magazineCount(): number { return this.magazine; }

  get currentCritMult(): number {
    const w = state.activeWeapon;
    return 2 + (w?.stats.critBonus ?? 0) + statsys.bonus('critDamage');
  }

  // ------------------------------------------------------------------ vitals
  heal(amount: number): void {
    if (!this.alive) return;
    this.flesh = Math.min(this.maxFlesh, this.flesh + amount);
  }

  damage(amount: number, element: string, from?: THREE.Vector3): void {
    if (this.downed || !this.alive) return;
    const el = (element in ELEMENTS ? element : 'kinetic') as ElementId;
    let dmg = amount * difficulty().enemyDamage;
    const sh = state.shield;
    if (sh?.special?.id === 'adaptive') dmg *= 0.82;
    // Lightning Rod capstone: shielded hits arc back at the nearest enemy
    if (this.shield > 0 && statsys.bonus('lightningRod') > 0 && from) {
      const near = enemySpawner.enemies.filter((e) => e.alive);
      near.sort((a, b) => a.position.distanceTo(this.position) - b.position.distanceTo(this.position));
      if (near[0]) {
        fx.lightningArc(this.position.clone().add(new THREE.Vector3(0, 1.4, 0)), near[0].position.clone().add(new THREE.Vector3(0, 1.2, 0)));
        applyDamage(near[0], dmg * 0.2, 'volt', { source: 'player', noChain: true });
      }
    }
    this.shieldDelayT = sh?.rechargeDelay ?? 3;
    const hadShield = this.shield > 0;
    applyDamage(this, dmg, el, { noNumbers: true, source: 'enemy', noChain: true });
    juice.addTrauma(0.32);
    document.getElementById('vignette-hurt')?.classList.add('hurt');
    setTimeout(() => document.getElementById('vignette-hurt')?.classList.remove('hurt'), 180);
    if (from && this.onHurtFrom) {
      const worldAngle = Math.atan2(from.x - this.position.x, from.z - this.position.z);
      const facing = this.yaw + Math.PI;
      let rel = worldAngle - facing;
      while (rel > Math.PI) rel -= Math.PI * 2;
      while (rel < -Math.PI) rel += Math.PI * 2;
      this.onHurtFrom(rel);
    }
    if (hadShield && this.shield <= 0 && sh?.special?.id === 'nova') {
      splashDamage(this.position.clone(), 5, sh.special.power, 'blast', { source: 'player' });
    }
    if (this.flesh <= 0 && !this.downed) this.enterDowned();
  }

  onDeath(): void {
    this.alive = true;
    if (!this.downed) this.enterDowned();
  }

  private enterDowned(): void {
    this.downed = true;
    this.flesh = 1;
    this.alive = true;
    this.downedT = 0;
    this.downedMax = 10 * statsys.mult('fflTime');
    audio.downed();
    bus.emit('downed', {});
  }

  secondWind(): void {
    if (!this.downed) return;
    this.downed = false;
    this.flesh = this.maxFlesh * 0.4;
    this.shield = this.maxShield * 0.3;
    audio.secondWind();
    bus.emit('secondwind', {});
  }

  respawn(): void {
    this.downed = false;
    this.flesh = this.maxFlesh;
    this.shield = this.maxShield;
    this.position.copy(this.respawnPoint);
    state.money = Math.floor(state.money * 0.9);
  }

  // ------------------------------------------------------------------ update
  update(dt: number): void {
    const speedStat = statsys.mult('moveSpeed');
    const downedFactor = this.downed ? 0.35 : 1;
    const sprinting = this.keys.has('ShiftLeft') && !this.downed && !this.adsHeld;
    const speed = 7.2 * speedStat * downedFactor * (sprinting ? 1.45 : 1);

    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const move = new THREE.Vector3();
    if (!this.paused) {
      if (this.keys.has('KeyW')) move.add(fwd);
      if (this.keys.has('KeyS')) move.sub(fwd);
      if (this.keys.has('KeyD')) move.add(right);
      if (this.keys.has('KeyA')) move.sub(right);
    }
    const moving = move.lengthSq() > 0;
    if (moving) move.normalize().multiplyScalar(speed * dt);
    // slope blocking: ridge walls and steep terrain reject uphill movement
    if (moving) {
      const hBefore = this.world.groundHeight(this.position.x, this.position.z);
      const hAfter = this.world.groundHeight(this.position.x + move.x, this.position.z + move.z);
      if (this.grounded && hAfter - hBefore > move.length() * 1.1) {
        // try sliding along each axis before rejecting outright
        const hX = this.world.groundHeight(this.position.x + move.x, this.position.z);
        const hZ = this.world.groundHeight(this.position.x, this.position.z + move.z);
        if (hX - hBefore <= Math.abs(move.x) * 1.1) move.z = 0;
        else if (hZ - hBefore <= Math.abs(move.z) * 1.1) move.x = 0;
        else move.set(0, 0, 0);
      }
    }
    this.position.add(move);

    // gravity & jump
    const ground = this.world.groundHeight(this.position.x, this.position.z);
    if (!this.paused && this.keys.has('Space') && this.grounded && !this.downed) {
      this.velY = 8.2;
      this.grounded = false;
    }
    this.velY -= 24 * dt;
    this.position.y += this.velY * dt;
    if (this.position.y <= ground) {
      // landing feel
      if (!this.wasGrounded && this.velY < -4) {
        audio.land(this.velY < -11);
        this.landDip = Math.min(0.22, -this.velY * 0.014);
        if (this.velY < -11) juice.addTrauma(0.15);
      }
      this.position.y = ground;
      this.velY = 0;
      this.grounded = true;
    } else if (this.position.y > ground + 0.05) {
      this.grounded = false;
    }
    this.wasGrounded = this.grounded;

    // footsteps
    if (moving && this.grounded && !this.paused) {
      this.stepT -= dt * (sprinting ? 1.5 : 1);
      if (this.stepT <= 0) {
        this.stepT = 0.38;
        audio.footstep();
      }
    }
    this.landDip = damp(this.landDip, 0, 8, dt);

    // collide with props & world bounds
    this.world.resolveCollision(this.position, PLAYER_RADIUS);
    const half = this.world.arenaHalf - 1;
    this.position.x = clamp(this.position.x, -half, half);
    this.position.z = clamp(this.position.z, -half, half);

    // shield recharge
    const sh = state.shield;
    if (sh && !this.downed) {
      if (this.shieldDelayT > 0) this.shieldDelayT -= dt;
      else if (this.shield < this.maxShield) {
        this.shield = Math.min(this.maxShield, this.shield + sh.rechargeRate * statsys.mult('shieldRate') * dt);
      }
    }
    statsys.roidBonus = sh?.special?.id === 'berserk' && this.shield <= 0 ? sh.special.power / 100 : 0;

    if (this.downed) {
      this.downedT += dt;
      if (this.downedT >= this.downedMax) this.respawnFromDowned();
    }

    // ADS
    const targetAds = this.adsHeld && !this.downed && this.reloadT < 0 ? 1 : 0;
    this.adsAmount = damp(this.adsAmount, targetAds, 12, dt);
    const w = state.activeWeapon;
    const zoom = w ? 1 + (w.stats.zoom - 1) * this.adsAmount : 1;
    this.camera.fov = this.baseFov / zoom + juice.fovKick;
    this.camera.updateProjectionMatrix();

    // camera transform
    this.bobT += dt * (moving ? (sprinting ? 11 : 9) : 2);
    const [sx, sy, roll] = juice.sample();
    const bobY = Math.sin(this.bobT * 2) * (moving ? 0.03 : 0.006) * (1 - this.adsAmount);
    const downedDrop = this.downed ? 0.7 : 0;
    const sprintRoll = sprinting && moving ? Math.sin(this.bobT) * 0.008 : 0;
    this.camera.position.set(
      this.position.x + sx,
      this.position.y + EYE_HEIGHT - downedDrop + bobY + sy - this.landDip,
      this.position.z,
    );
    this.camera.rotation.set(this.pitch - juice.recoilPitch, this.yaw, roll + sprintRoll, 'YXZ');

    // viewmodel pose: hip/ads lerp + sway + bob + land dip
    const vmAds = new THREE.Vector3(0, -0.145, -0.4);
    const vmHip = new THREE.Vector3(0.28, -0.26, -0.5);
    this.viewmodel.position.lerpVectors(vmHip, vmAds, this.adsAmount);
    this.viewmodel.position.z += juice.recoilBack;
    this.viewmodel.position.x += this.swayX * (1 - this.adsAmount * 0.7);
    this.viewmodel.position.y += this.swayY * (1 - this.adsAmount * 0.7)
      + Math.sin(this.bobT) * (moving ? 0.012 : 0.004) * (1 - this.adsAmount)
      - this.landDip * 0.5;
    this.viewmodel.rotation.set(-juice.recoilPitch * 2.2 + this.swayY * 1.4, this.swayX * 1.6, this.swayX * 0.8);
    this.swayX = damp(this.swayX, 0, 7, dt);
    this.swayY = damp(this.swayY, 0, 7, dt);

    // reload / swap animation
    if (this.reloadT >= 0 && w) this.animateReload(dt, w);
    if (this.swapT > 0) {
      this.swapT -= dt;
      this.viewmodel.position.y -= this.swapT * 0.9;
      this.viewmodel.rotation.x -= this.swapT * 1.6;
    }

    // firing
    this.fireTimer -= dt;
    this.focusHeat = Math.max(0, this.focusHeat - dt * 1.4);
    this.fireHeat = Math.max(0, this.fireHeat - dt * 3);
    if (this.mouseDown && !this.paused) this.tryFire();
    if (!this.mouseDown && w && !w.stats.auto) this.canSemiFire = true;

    // crosshair spread readout
    if (w) {
      const acc = w.stats.accuracy;
      this.lastSpreadDeg = (100 - acc) * 0.05 * (1 - this.adsAmount * 0.5) * (this.grounded ? 1 : 1.6) + this.fireHeat * 0.4;
    }
  }

  /** Manufacturer-flavored reload keyframes. Phase f in [0,1]. */
  private animateReload(dt: number, w: WeaponInstance): void {
    const maker = makerById(w.maker);
    const total = w.stats.reloadTime * statsys.reduction('reloadSpeed');
    this.reloadT += dt;
    const f = clamp(this.reloadT / total, 0, 1);
    const vm = this.viewmodel;

    // physical mag drop partway through, for mag-fed styles
    if (!this.magDropped && f > 0.3 && (maker.reloadStyle === 'smooth_snap' || maker.reloadStyle === 'slap_rattle' || maker.reloadStyle === 'heavy_clunk')) {
      this.magDropped = true;
      this.camera.updateMatrixWorld(true);
      debris.droppedMag(vm.localToWorld(new THREE.Vector3(0, -0.15, -0.25)));
    }

    switch (maker.reloadStyle) {
      case 'heavy_clunk': { // VULKRAM: slow tilt, hard seat at the end
        vm.rotation.x += Math.sin(f * Math.PI) * -0.7;
        vm.position.y -= Math.sin(f * Math.PI) * 0.18;
        if (f > 0.85) vm.position.y += Math.sin((f - 0.85) / 0.15 * Math.PI) * 0.03; // the CHUNK
        break;
      }
      case 'smooth_snap': { // LUMEN: quick clean dip
        vm.rotation.x += Math.sin(f * Math.PI) * -0.45;
        vm.position.y -= Math.sin(f * Math.PI) * 0.1;
        break;
      }
      case 'slap_rattle': { // RATWORKS: two angry dips
        vm.rotation.x += Math.sin(f * Math.PI * 2) * -0.5;
        vm.position.y -= Math.abs(Math.sin(f * Math.PI * 2)) * 0.12;
        vm.rotation.z += Math.sin(f * Math.PI * 4) * 0.06;
        break;
      }
      case 'hum_glow': { // ÆTHERIC: slow roll while the phial recharges
        vm.rotation.z += Math.sin(f * Math.PI) * 0.6;
        vm.position.y -= Math.sin(f * Math.PI) * 0.08;
        if (Math.random() < 8 * dt) {
          this.camera.updateMatrixWorld(true);
          fx.emit(vm.localToWorld(new THREE.Vector3(0, 0, -0.3)), new THREE.Vector3(0, 0.4, 0), ELEMENTS[w.element].color, 0.05, 0.4, 0);
        }
        break;
      }
      case 'lever_flick': { // CORDWOOD: forward flip-cock
        vm.rotation.x += Math.sin(f * Math.PI) * (f < 0.5 ? 1.6 : 0.4) * -1;
        vm.position.z += Math.sin(f * Math.PI) * 0.08;
        break;
      }
      default: { // toss_new handled by throwGunReload; generic dip fallback
        vm.rotation.x += Math.sin(f * Math.PI) * -0.9;
        vm.position.y -= Math.sin(f * Math.PI) * 0.15;
      }
    }

    if (this.reloadT > total * 0.55 && this.reloadT - dt <= total * 0.55) audio.reloadClack(1);
    if (f >= 1) this.finishReload();
  }

  private respawnFromDowned(): void {
    this.respawn();
    document.dispatchEvent(new CustomEvent('player-respawned'));
  }

  private canSemiFire = true;

  // ------------------------------------------------------------------ firing
  private tryFire(): void {
    const w = state.activeWeapon;
    if (!w || this.reloadT >= 0 || this.swapT > 0) return;
    if (!w.stats.auto && !this.canSemiFire) return;
    if (this.fireTimer > 0) return;

    if (this.magazine <= 0) {
      this.startReload();
      return;
    }

    const maker = makerById(w.maker);
    const stats = w.stats;
    const tempest = actionSkill.tempestActive;
    this.canSemiFire = false;
    this.fireTimer = 1 / (stats.fireRate * statsys.mult('fireRate') * (this.slowUntil > combatNow() ? 0.7 : 1));

    let ammoCost = maker.gimmick === 'always_elemental' && this.magazine >= 2 ? 2 : 1;
    if (Math.random() < statsys.bonus('freeAmmoChance')) ammoCost = 0;
    if (tempest && statsys.bonus('liveWire') > 0) ammoCost = 0; // Live Wire capstone
    this.magazine -= ammoCost;

    this.camera.updateMatrixWorld(true);
    const muzzle = this.viewmodel.localToWorld(new THREE.Vector3(0, -0.05, -0.7));
    const camDir = new THREE.Vector3();
    this.camera.getWorldDirection(camDir);

    let acc = stats.accuracy;
    if (maker.gimmick === 'laser_focus') {
      acc = Math.min(99, acc + this.focusHeat * 6);
      this.focusHeat = Math.min(4, this.focusHeat + 0.5);
    }
    this.fireHeat = Math.min(4, this.fireHeat + 0.6);
    const spreadDeg = (100 - acc) * 0.05 * (1 - this.adsAmount * 0.5) * (this.grounded ? 1 : 1.6);
    this.lastSpreadDeg = spreadDeg + this.fireHeat * 0.4;

    const dmgMult = statsys.mult('gunDamage')
      * (ELEMENTS[w.element].splash || stats.splashRadius > 0 ? statsys.mult('splashDamage') : 1)
      * (w.element !== 'kinetic' ? statsys.mult('elemDamage') : 1);

    let dmg = stats.damage * dmgMult;
    const leg = w.legendaryId ? LEGENDARIES.find((l) => l.id === w.legendaryId) : null;
    if (leg?.effect.kind === 'money_shot') {
      dmg *= 1 + (stats.magSize - this.magazine) * leg.effect.multPerMissing;
    }
    if (this.overkillBank > 0) {
      dmg += this.overkillBank;
      this.overkillBank = 0;
    }
    const sh = state.shield;
    if (sh?.special?.id === 'amp' && this.shield >= this.maxShield * 0.98) dmg += sh.special.power;

    // Tempest Shell: every shot becomes chaining Volt while active
    const fireWeapon: WeaponInstance = tempest && w.element !== 'volt'
      ? { ...w, element: 'volt', stats: { ...w.stats, elemChance: Math.min(1, w.stats.elemChance + 0.35), elemDps: Math.max(w.stats.elemDps, w.stats.damage * 0.35) } }
      : w;

    for (let i = 0; i < stats.pellets; i++) {
      const dir = camDir.clone();
      const s = THREE.MathUtils.degToRad(spreadDeg);
      dir.x += (Math.random() - 0.5) * s;
      dir.y += (Math.random() - 0.5) * s;
      dir.z += (Math.random() - 0.5) * s;
      dir.normalize();
      if (stats.projSpeed > 0) {
        this.fireProjectile(fireWeapon, muzzle, dir, dmg, leg?.effect.kind === 'meteor');
      } else {
        this.fireHitscan(fireWeapon, muzzle, dir, dmg, leg);
      }
    }

    // feel + sound + flash + casing
    const punch = clamp(dmg / (30 * Math.pow(1.11, state.level)), 0.3, 2.2);
    const recoilScale = maker.gimmick === 'laser_focus' ? 0.1 : 1;
    juice.kickRecoil(0.02 * punch * recoilScale * (w.stats.recoil ?? 1), 0.05 * punch * recoilScale);
    juice.kickFov(JUICE.fovKickFire * punch);
    juice.addTrauma(0.05 * punch);
    audio.shot(maker.shotSound, 0.95 + Math.random() * 0.1);
    fx.muzzleFlash(muzzle, camDir, w.element !== 'kinetic' ? ELEMENTS[w.element].color : 0xffd23c, punch);
    if (maker.gimmick !== 'always_elemental') {
      const rightDir = new THREE.Vector3(-camDir.z, 0.2, camDir.x).normalize();
      debris.casing(muzzle.clone().addScaledVector(camDir, -0.25), rightDir);
    }

    if (this.magazine <= 0) this.startReload();
  }

  private fireHitscan(w: WeaponInstance, muzzle: THREE.Vector3, dir: THREE.Vector3, dmg: number, leg: (typeof LEGENDARIES)[number] | null | undefined): void {
    const ray = new THREE.Raycaster(this.camera.position.clone(), dir, 0.1, 220);
    const hit = this.raycastTargets(ray);
    const staticHit = this.world.raycastStatics(ray);

    let end: THREE.Vector3;
    if (hit && (!staticHit || hit.distance < staticHit.distance)) {
      end = hit.point;
      const critMult = this.currentCritMult;
      const dealt = applyDamage(hit.target, dmg, w.element, {
        crit: hit.isCrit, critMult,
        elemChance: w.stats.elemChance, elemDps: w.stats.elemDps * statsys.mult('elemDamage'),
        source: 'player',
      });
      fx.impact(hit.point, w.element);
      if (hit.enemy) this.afterHit(w, hit.enemy, hit.point, dmg, dealt, hit.isCrit, leg);
      else {
        document.getElementById('hitmarker')?.classList.add('show');
        setTimeout(() => document.getElementById('hitmarker')?.classList.remove('show'), 90);
      }
    } else if (staticHit) {
      end = staticHit.point;
      fx.impact(end, w.element);
      fx.burst(end, 0xc8b498, 5, 2.5, 0.06, 0.4, 8);
      debris.decal(end, staticHit.normal, w.element === 'kinetic' ? 'hole' : 'scorch', w.element === 'kinetic' ? 0.8 : 1.4);
    } else {
      end = muzzle.clone().addScaledVector(dir, 90);
    }

    fx.tracer(muzzle, end, w.element !== 'kinetic' ? ELEMENTS[w.element].color : 0xffe8b0);

    if (w.stats.splashRadius > 0 && (staticHit || hit)) {
      splashDamage(end, w.stats.splashRadius, dmg * 0.55, w.element === 'kinetic' ? 'blast' : w.element, { source: 'player', elemChance: w.stats.elemChance * 0.5 });
    }
  }

  private afterHit(w: WeaponInstance, enemy: Enemy, point: THREE.Vector3, dmg: number, dealt: number, isCrit: boolean, leg: (typeof LEGENDARIES)[number] | null | undefined): void {
    document.getElementById('hitmarker')?.classList.add(isCrit ? 'show-crit' : 'show');
    setTimeout(() => document.getElementById('hitmarker')?.classList.remove('show', 'show-crit'), 90);

    if (isCrit) state.recordGrit('crit');
    if (leg?.effect.kind === 'vampire') this.heal(dealt * leg.effect.leech);

    if (leg?.effect.kind === 'echo_round') {
      const delay = leg.effect.delay * 1000;
      setTimeout(() => {
        if (enemy.alive) {
          applyDamage(enemy, dmg * 0.5, w.element, { source: 'player', noChain: true });
          fx.impact(enemy.position.clone().add(new THREE.Vector3(0, 1.2, 0)), w.element);
        }
      }, delay);
    }

    const maker = makerById(w.maker);
    if (maker.gimmick === 'crit_ricochet' && isCrit) {
      const others = enemySpawner.enemies.filter((e) => e.alive && e !== enemy && e.position.distanceTo(enemy.position) < 14);
      if (others.length) {
        const next = others[Math.floor(Math.random() * others.length)];
        fx.tracer(point, next.position.clone().add(new THREE.Vector3(0, 1.2, 0)), 0xd8b878);
        applyDamage(next, dmg * 0.6, 'kinetic', { source: 'player' });
      }
    }

    if (!enemy.alive && statsys.bonus('overkill') > 0) {
      this.overkillBank = dealt * 0.25;
    }
    if (!enemy.alive && isCrit && statsys.bonus('jackpot') > 0) {
      this.magazine = w.stats.magSize;
      state.money += 25 + state.level * 5;
      audio.cash();
    }
  }

  private fireProjectile(w: WeaponInstance, muzzle: THREE.Vector3, dir: THREE.Vector3, dmg: number, meteor: boolean): void {
    projectiles.spawn({
      pos: muzzle,
      vel: dir.clone().multiplyScalar(w.stats.projSpeed),
      damage: dmg,
      element: w.element === 'kinetic' ? 'blast' : w.element,
      splash: Math.max(w.stats.splashRadius, 2.5),
      gravity: 2,
      source: 'player',
      meteor,
    });
  }

  /** Raycast enemies + explosive barrels; nearest wins. */
  raycastTargets(ray: THREE.Raycaster): HitscanTarget | null {
    let best: HitscanTarget | null = null;
    for (const e of enemySpawner.enemies) {
      if (!e.alive) continue;
      e.group.updateMatrixWorld(true);
      const hits = ray.intersectObject(e.group, true);
      for (const h of hits) {
        if ((h.object as THREE.Sprite).isSprite) continue;
        if (!best || h.distance < best.distance) {
          best = { target: e, enemy: e, point: h.point, isCrit: h.object === e.critZone, distance: h.distance };
        }
        break;
      }
    }
    for (const b of this.world.barrels()) {
      if (!b.alive) continue;
      b.group.updateMatrixWorld(true);
      const hits = ray.intersectObject(b.group, true);
      if (hits.length && (!best || hits[0].distance < best.distance)) {
        best = { target: b, enemy: null, point: hits[0].point, isCrit: false, distance: hits[0].distance };
      }
    }
    return best;
  }

  // ------------------------------------------------------------------ reload
  startReload(): void {
    const w = state.activeWeapon;
    if (!w || this.reloadT >= 0) return;
    const reserve = state.ammo.get(w.type) ?? 0;
    if (this.magazine >= w.stats.magSize || reserve <= 0) {
      if (reserve <= 0 && this.magazine <= 0) audio.dryFire();
      return;
    }
    const maker = makerById(w.maker);
    if (maker.gimmick === 'throw_reload') {
      this.throwGunReload(w);
      return;
    }
    this.reloadT = 0;
    this.magDropped = false;
    audio.reloadClack(0);
  }

  private finishReload(): void {
    const w = state.activeWeapon;
    this.reloadT = -1;
    if (!w) return;
    const reserve = state.ammo.get(w.type) ?? 0;
    const magMax = Math.round(w.stats.magSize * statsys.mult('magSize'));
    const need = magMax - this.magazine;
    const take = Math.min(need, reserve);
    this.magazine += take;
    state.ammo.set(w.type, reserve - take);
  }

  private throwGunReload(w: WeaponInstance): void {
    const leftover = this.magazine;
    this.magazine = 0;
    audio.gunThrow();
    const thrownMesh = buildGunMesh(w);
    thrownMesh.scale.setScalar(1.4);
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    projectiles.spawn({
      pos: this.camera.position.clone().addScaledVector(dir, 0.6),
      vel: dir.multiplyScalar(16).add(new THREE.Vector3(0, 3, 0)),
      damage: w.stats.damage * (3 + leftover * 0.5) * statsys.mult('gunDamage'),
      element: w.element === 'kinetic' ? 'blast' : w.element,
      splash: 3.2,
      gravity: 12,
      source: 'player',
      mesh: thrownMesh,
    });
    this.reloadT = 0;
    this.magDropped = true; // no mag to drop — the whole gun left
    audio.reloadClack(0);
  }

  // ------------------------------------------------------------------ misc
  throwGrenade(): void {
    const gm = state.grenadeMod;
    if (state.grenades <= 0) { audio.uiError(); return; }
    state.grenades--;
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const element: ElementId = gm?.element ?? 'blast';
    const dmg = (gm?.damage ?? 70) * statsys.mult('grenadeDamage') * Math.pow(1.11, Math.max(0, state.level - (gm?.level ?? state.level)));
    projectiles.spawn({
      pos: this.camera.position.clone().addScaledVector(dir, 0.5),
      vel: dir.multiplyScalar(14).add(new THREE.Vector3(0, 4, 0)),
      damage: dmg,
      element,
      splash: gm?.radius ?? 4,
      gravity: 16,
      fuse: gm?.fuse ?? 1.6,
      bounces: gm?.delivery === 'bouncing' ? 1 : 0,
      sticky: gm?.delivery === 'sticky',
      singularity: gm?.delivery === 'singularity',
      transfusion: gm?.delivery === 'transfusion',
      childCount: gm?.childCount ?? 0,
      source: 'player',
    });
    audio.gunThrow();
  }

  get forward(): THREE.Vector3 {
    const d = new THREE.Vector3();
    this.camera.getWorldDirection(d);
    return d;
  }
}
