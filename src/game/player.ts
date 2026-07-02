// The player: pointer-lock FPS controller, health/shield with gear stats,
// weapon viewmodel (procedurally assembled from the equipped roll), firing
// (hitscan + projectile), manufacturer gimmicks (laser_focus tightening,
// throw_reload, crit_ricochet, always_elemental ammo draw), reload/swap
// animation, ADS, grenades, and Fight For Your Life.

import * as THREE from 'three';
import type { WeaponInstance, ElementId } from './types';
import { state, bus } from './state';
import { statsys } from './stats';
import { juice, JUICE } from './juice';
import { audio } from '../audio/synth';
import { fx } from './particles';
import { buildGunMesh } from '../gen/gunmesh';
import { makerById } from '../data/manufacturers';
import { applyDamage, splashDamage, combatNow, type Damageable, type StatusEffect } from './combat';
import { projectiles } from './projectiles';
import { enemySpawner, type Enemy } from './enemies';
import { ELEMENTS } from '../data/elements';
import { WEAPON_TYPES } from '../data/weapons';
import { clamp, damp, lerp } from '../util/maff';
import { LEGENDARIES } from '../data/legendaries';

const EYE_HEIGHT = 1.65;
const CROUCHLESS_RADIUS = 0.45;

export interface WorldQuery {
  groundHeight: (x: number, z: number) => number;
  resolveCollision: (pos: THREE.Vector3, radius: number) => void;
  raycastStatics: (ray: THREE.Raycaster) => THREE.Intersection | null;
  arenaHalf: number;
}

export class Player implements Damageable {
  // Damageable
  position = new THREE.Vector3(0, 0, 30);
  alive = true;
  shield = 0; maxShield = 0;
  armor = 0; maxArmor = 0;
  flesh = 100; maxFlesh = 100;
  statuses: StatusEffect[] = [];
  slowUntil = 0;
  isPlayer = true;

  camera: THREE.PerspectiveCamera;
  private yaw = 0; // spawn facing the arena, back to the vendor plaza
  private pitch = 0;
  private velY = 0;
  private grounded = true;
  private keys = new Set<string>();
  private mouseDown = false;
  private adsHeld = false;
  adsAmount = 0;

  // weapon handling
  viewmodel = new THREE.Group();
  private gunMesh: THREE.Group | null = null;
  private magazine = 0;
  private reloadT = -1;
  private swapT = -1;
  private fireTimer = 0;
  private focusHeat = 0;       // lumen laser_focus
  private overkillBank = 0;    // Overkill capstone
  private shieldDelayT = 0;
  private baseFov = 75;
  private bobT = 0;
  private lastShotElement: ElementId = 'kinetic';

  // fight for your life
  downed = false;
  downedT = 0;
  downedMax = 10;

  paused = false; // set by UI panels

  world!: WorldQuery;
  onAmmoPickup: () => void = () => {};

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.baseFov = camera.fov;
    camera.add(this.viewmodel);
    this.viewmodel.position.set(0.28, -0.26, -0.5);
    // pose the camera at spawn immediately so pre-start frames (title
    // backdrop, slow first render) already show the arena, not the origin
    camera.position.set(this.position.x, this.position.y + EYE_HEIGHT, this.position.z);
    camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  // ------------------------------------------------------------------ input
  bindInput(el: HTMLElement): void {
    document.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
    });
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
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  keyPressed(code: string): boolean { return this.keys.has(code); }
  consumeKey(code: string): boolean {
    if (this.keys.has(code)) { this.keys.delete(code); return true; }
    return false;
  }

  // ------------------------------------------------------------------ gear
  recomputeVitals(): void {
    const sh = state.shield;
    this.maxShield = sh ? sh.capacity * statsys.mult('shieldCapacity') : 0;
    if (sh?.special?.id === 'fortify') this.maxShield *= 0.5;
    const hpBase = 90 + state.level * 12;
    this.maxFlesh = hpBase * statsys.mult('maxHealth') * (sh?.special?.id === 'fortify' ? 1 + sh.special.power / 200 : 1);
    this.shield = Math.min(this.shield, this.maxShield);
    this.flesh = Math.min(this.flesh, this.maxFlesh);
  }

  equipWeapon(w: WeaponInstance | null, instant = false): void {
    if (this.gunMesh) { this.viewmodel.remove(this.gunMesh); this.gunMesh = null; }
    if (w) {
      this.gunMesh = buildGunMesh(w);
      this.viewmodel.add(this.gunMesh);
      this.magazine = Math.min(w.stats.magSize, this.magazine === -1 ? w.stats.magSize : w.stats.magSize);
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

  damage(amount: number, element: string): void {
    if (this.downed || !this.alive) return;
    const el = (element in ELEMENTS ? element : 'kinetic') as ElementId;
    let dmg = amount;
    const sh = state.shield;
    if (sh?.special?.id === 'adaptive') dmg *= 0.82; // simplified adaptive
    this.shieldDelayT = (sh?.rechargeDelay ?? 3) * 1;
    const hadShield = this.shield > 0;
    applyDamage(this, dmg, el, { noNumbers: true, source: 'enemy', noChain: true });
    juice.addTrauma(0.32);
    document.getElementById('vignette-hurt')?.classList.add('hurt');
    setTimeout(() => document.getElementById('vignette-hurt')?.classList.remove('hurt'), 180);
    if (hadShield && this.shield <= 0 && sh?.special?.id === 'nova') {
      splashDamage(this.position.clone(), 5, sh.special.power, 'blast', { source: 'player' });
    }
    if (this.flesh <= 0 && !this.downed) this.enterDowned();
  }

  onDeath(): void {
    // Reached when damage lands via combat paths that skip damage() (e.g.
    // enemy splash). Players never die outright — they go down.
    this.alive = true;
    if (!this.downed) this.enterDowned();
  }

  private enterDowned(): void {
    this.downed = true;
    this.flesh = 1;
    this.alive = true; // stays targetable-ish but we gate enemy damage above
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
    this.position.set(0, 0, 30);
    state.money = Math.floor(state.money * 0.9); // the Re-Constructor's cut
  }

  // ------------------------------------------------------------------ update
  update(dt: number): void {
    const speedStat = statsys.mult('moveSpeed');
    const downedFactor = this.downed ? 0.35 : 1;
    const speed = 7.2 * speedStat * downedFactor * (this.keys.has('ShiftLeft') && !this.downed ? 1.45 : 1);

    // movement
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
      this.position.y = ground;
      this.velY = 0;
      this.grounded = true;
    }

    // collide with props & arena bounds
    this.world.resolveCollision(this.position, CROUCHLESS_RADIUS);
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

    // downed timer
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
    this.bobT += dt * (moving ? 9 : 2);
    const [sx, sy, roll] = juice.sample();
    const bobY = Math.sin(this.bobT * 2) * (moving ? 0.03 : 0.006) * (1 - this.adsAmount);
    const downedDrop = this.downed ? 0.7 : 0;
    this.camera.position.set(this.position.x + sx, this.position.y + EYE_HEIGHT - downedDrop + bobY + sy, this.position.z);
    this.camera.rotation.set(this.pitch - juice.recoilPitch, this.yaw, roll, 'YXZ');

    // viewmodel pose
    const vmAds = new THREE.Vector3(0, -0.145, -0.4);
    const vmHip = new THREE.Vector3(0.28, -0.26, -0.5);
    this.viewmodel.position.lerpVectors(vmHip, vmAds, this.adsAmount);
    this.viewmodel.position.z += juice.recoilBack;
    this.viewmodel.position.y += Math.sin(this.bobT) * (moving ? 0.012 : 0.004) * (1 - this.adsAmount);
    this.viewmodel.rotation.set(-juice.recoilPitch * 2.2, 0, 0);

    // reload / swap animation
    if (this.reloadT >= 0 && w) {
      const total = w.stats.reloadTime * statsys.reduction('reloadSpeed');
      this.reloadT += dt;
      const f = clamp(this.reloadT / total, 0, 1);
      this.viewmodel.rotation.x += Math.sin(f * Math.PI) * -0.9;
      this.viewmodel.position.y -= Math.sin(f * Math.PI) * 0.15;
      if (this.reloadT > total * 0.55 && this.reloadT - dt <= total * 0.55) audio.reloadClack(1);
      if (f >= 1) {
        this.finishReload();
      }
    }
    if (this.swapT > 0) {
      this.swapT -= dt;
      this.viewmodel.position.y -= this.swapT * 0.9;
      this.viewmodel.rotation.x -= this.swapT * 1.6;
    }

    // firing
    this.fireTimer -= dt;
    this.focusHeat = Math.max(0, this.focusHeat - dt * 1.4);
    if (this.mouseDown && !this.paused) this.tryFire();
    if (!this.mouseDown && w && !w.stats.auto) this.canSemiFire = true;
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
    this.canSemiFire = false;
    this.fireTimer = 1 / (stats.fireRate * statsys.mult('fireRate') * (this.slowUntil > combatNow() ? 0.7 : 1));

    // ammo draw (Ætheric pulls 2 for empowered shots)
    let ammoCost = maker.gimmick === 'always_elemental' && this.magazine >= 2 ? 2 : 1;
    if (Math.random() < statsys.bonus('freeAmmoChance')) ammoCost = 0;
    this.magazine -= ammoCost;

    // muzzle world position
    this.camera.updateMatrixWorld(true);
    const muzzleLocal = new THREE.Vector3(0, -0.05, -0.7);
    const muzzle = this.viewmodel.localToWorld(muzzleLocal.clone());
    const camDir = new THREE.Vector3();
    this.camera.getWorldDirection(camDir);

    // accuracy -> spread cone (deg); lumen focus tightens with sustained fire
    let acc = stats.accuracy;
    if (maker.gimmick === 'laser_focus') {
      acc = Math.min(99, acc + this.focusHeat * 6);
      this.focusHeat = Math.min(4, this.focusHeat + 0.5);
    }
    const spreadDeg = (100 - acc) * 0.05 * (1 - this.adsAmount * 0.5) * (this.grounded ? 1 : 1.6);

    const dmgMult = statsys.mult('gunDamage')
      * (ELEMENTS[w.element].splash || stats.splashRadius > 0 ? statsys.mult('splashDamage') : 1)
      * (w.element !== 'kinetic' ? statsys.mult('elemDamage') : 1);

    let dmg = stats.damage * dmgMult;
    // Last Word legendary: damage climbs as mag empties
    const leg = w.legendaryId ? LEGENDARIES.find((l) => l.id === w.legendaryId) : null;
    if (leg?.effect.kind === 'money_shot') {
      dmg *= 1 + (stats.magSize - this.magazine) * leg.effect.multPerMissing;
    }
    if (this.overkillBank > 0) {
      dmg += this.overkillBank;
      this.overkillBank = 0;
    }
    // amp shield
    const sh = state.shield;
    if (sh?.special?.id === 'amp' && this.shield >= this.maxShield * 0.98) dmg += sh.special.power;

    // fire each pellet
    for (let i = 0; i < stats.pellets; i++) {
      const dir = camDir.clone();
      const s = THREE.MathUtils.degToRad(spreadDeg);
      dir.x += (Math.random() - 0.5) * s;
      dir.y += (Math.random() - 0.5) * s;
      dir.z += (Math.random() - 0.5) * s;
      dir.normalize();
      if (stats.projSpeed > 0) {
        this.fireProjectile(w, muzzle, dir, dmg, leg?.effect.kind === 'meteor');
      } else {
        this.fireHitscan(w, muzzle, dir, dmg, leg);
      }
    }

    // feel + sound + flash
    const punch = clamp(dmg / (30 * Math.pow(1.11, state.level)), 0.3, 2.2);
    const recoilScale = maker.gimmick === 'laser_focus' ? 0.1 : 1;
    juice.kickRecoil(0.02 * punch * recoilScale * (w.stats.recoil ?? 1), 0.05 * punch * recoilScale);
    juice.kickFov(JUICE.fovKickFire * punch);
    juice.addTrauma(0.05 * punch);
    audio.shot(maker.shotSound, 0.95 + Math.random() * 0.1);
    fx.muzzleFlash(muzzle, camDir, w.element !== 'kinetic' ? ELEMENTS[w.element].color : 0xffd23c, punch);

    if (this.magazine <= 0) this.startReload();
  }

  private fireHitscan(w: WeaponInstance, muzzle: THREE.Vector3, dir: THREE.Vector3, dmg: number, leg: (typeof LEGENDARIES)[number] | null | undefined): void {
    const ray = new THREE.Raycaster(this.camera.position.clone(), dir, 0.1, 200);
    const { enemy, point, isCrit, distance } = this.raycastEnemies(ray);
    const staticHit = this.world.raycastStatics(ray);

    let end: THREE.Vector3;
    if (enemy && point && (!staticHit || distance < staticHit.distance)) {
      end = point;
      const critMult = this.currentCritMult;
      const dealt = applyDamage(enemy, dmg, w.element, {
        crit: isCrit, critMult,
        elemChance: w.stats.elemChance, elemDps: w.stats.elemDps * statsys.mult('elemDamage'),
        source: 'player',
      });
      fx.impact(point, w.element);
      this.afterHit(w, enemy, point, dmg, dealt, isCrit, leg);
    } else if (staticHit) {
      end = staticHit.point;
      fx.impact(end, w.element === 'kinetic' ? 'kinetic' : w.element);
      fx.burst(end, 0xc8b498, 5, 2.5, 0.06, 0.4, 8); // dust
    } else {
      end = muzzle.clone().addScaledVector(dir, 90);
    }

    fx.tracer(muzzle, end, w.element !== 'kinetic' ? ELEMENTS[w.element].color : 0xffe8b0);

    if (w.stats.splashRadius > 0 && (staticHit || enemy)) {
      splashDamage(end, w.stats.splashRadius, dmg * 0.55, w.element === 'kinetic' ? 'blast' : w.element, { source: 'player', elemChance: w.stats.elemChance * 0.5 });
    }
  }

  private afterHit(w: WeaponInstance, enemy: Enemy, point: THREE.Vector3, dmg: number, dealt: number, isCrit: boolean, leg: (typeof LEGENDARIES)[number] | null | undefined): void {
    document.getElementById('hitmarker')?.classList.add(isCrit ? 'show-crit' : 'show');
    setTimeout(() => document.getElementById('hitmarker')?.classList.remove('show', 'show-crit'), 90);

    if (isCrit) state.recordGrit('crit');

    // vampire legendary
    if (leg?.effect.kind === 'vampire') this.heal(dealt * leg.effect.leech);

    // echo round legendary: the hit repeats
    if (leg?.effect.kind === 'echo_round') {
      const delay = leg.effect.delay * 1000;
      setTimeout(() => {
        if (enemy.alive) {
          applyDamage(enemy, dmg * 0.5, w.element, { source: 'player', noChain: true });
          fx.impact(enemy.position.clone().add(new THREE.Vector3(0, 1.2, 0)), w.element);
        }
      }, delay);
    }

    // cordwood ricochet on crit
    const maker = makerById(w.maker);
    if (maker.gimmick === 'crit_ricochet' && isCrit) {
      const others = enemySpawner.enemies.filter((e) => e.alive && e !== enemy && e.position.distanceTo(enemy.position) < 14);
      if (others.length) {
        const next = others[Math.floor(Math.random() * others.length)];
        fx.tracer(point, next.position.clone().add(new THREE.Vector3(0, 1.2, 0)), 0xd8b878);
        applyDamage(next, dmg * 0.6, 'kinetic', { source: 'player' });
      }
    }

    // overkill capstone: bank overflow damage
    if (!enemy.alive && statsys.bonus('overkill') > 0) {
      this.overkillBank = Math.max(0, dealt - 0); // simplified: bank a slice of the hit
      this.overkillBank = dealt * 0.25;
    }

    // jackpot capstone
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

  raycastEnemies(ray: THREE.Raycaster): { enemy: Enemy | null; point: THREE.Vector3 | null; isCrit: boolean; distance: number } {
    let bestEnemy: Enemy | null = null;
    let bestPoint: THREE.Vector3 | null = null;
    let bestDist = Infinity;
    let isCrit = false;
    for (const e of enemySpawner.enemies) {
      if (!e.alive) continue;
      e.group.updateMatrixWorld(true); // enemies move before render; keep hits honest
      const hits = ray.intersectObject(e.group, true);
      for (const h of hits) {
        if ((h.object as THREE.Sprite).isSprite) continue; // ignore health bars
        if (h.distance < bestDist) {
          bestDist = h.distance;
          bestEnemy = e;
          bestPoint = h.point;
          isCrit = h.object === e.critZone;
        }
        break;
      }
    }
    return { enemy: bestEnemy, point: bestPoint, isCrit, distance: bestDist };
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
    audio.reloadClack(0);
  }

  private finishReload(): void {
    const w = state.activeWeapon;
    this.reloadT = -1;
    if (!w) return;
    const reserve = state.ammo.get(w.type) ?? 0;
    const magBonus = statsys.mult('magSize');
    const magMax = Math.round(w.stats.magSize * magBonus);
    const need = magMax - this.magazine;
    const take = Math.min(need, reserve);
    this.magazine += take;
    state.ammo.set(w.type, reserve - take);
  }

  /** BRISKCO: yeet the current gun; it explodes scaled by leftover mag. */
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
    // digistruct a fresh copy after a beat
    this.reloadT = 0;
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
