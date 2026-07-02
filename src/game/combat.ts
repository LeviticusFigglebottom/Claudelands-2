// Damage resolution: element-vs-defense-layer matrix, crits, status effects
// (DoT burn/corrode, volt chains, rime slow+amp), splash, and the hooks that
// fan out to damage numbers, juice, audio, and loot. Enemies carry three
// stacked defense layers (shield -> armor -> flesh) that deplete in order.

import * as THREE from 'three';
import { ELEMENTS, RIME_AMP, RIME_SLOW, VOLT_CHAIN_FRACTION, VOLT_CHAIN_RANGE } from '../data/elements';
import type { DefenseLayer, ElementId } from './types';
import { fx } from './particles';
import { audio } from '../audio/synth';
import { juice, JUICE } from './juice';

export interface StatusEffect {
  element: ElementId;
  dps: number;
  remaining: number;
}

export interface Damageable {
  position: THREE.Vector3;
  alive: boolean;
  shield: number; maxShield: number;
  armor: number; maxArmor: number;
  flesh: number; maxFlesh: number;
  statuses: StatusEffect[];
  slowUntil: number;
  /** applied by combat on kill */
  onDeath(killedBy: ElementId, overkill: number): void;
  isPlayer?: boolean;
}

export interface HitOpts {
  crit?: boolean;
  critMult?: number;       // total crit multiplier (weapon+skills)
  elemChance?: number;     // proc chance for status
  elemDps?: number;
  noNumbers?: boolean;
  noChain?: boolean;       // prevent volt chain recursion
  source?: 'player' | 'turret' | 'enemy' | 'world';
}

export type NumberSpawner = (worldPos: THREE.Vector3, amount: number, element: ElementId, crit: boolean, kind?: 'damage' | 'heal' | 'immune') => void;

let spawnNumber: NumberSpawner = () => {};
export function setNumberSpawner(fn: NumberSpawner): void { spawnNumber = fn; }

let allTargets: () => Damageable[] = () => [];
export function setTargetProvider(fn: () => Damageable[]): void { allTargets = fn; }

let gameTime = 0;
export function tickCombatClock(dt: number): void { gameTime += dt; }
export function combatNow(): number { return gameTime; }

/**
 * Damage aimed at the player routes through Player.damage() (shield delay,
 * hurt flash, direction indicator) instead of raw applyDamage.
 */
let playerRouter: ((amount: number, element: ElementId, from?: THREE.Vector3) => void) | null = null;
export function setPlayerDamageRouter(fn: (amount: number, element: ElementId, from?: THREE.Vector3) => void): void {
  playerRouter = fn;
}
export function damageTarget(target: Damageable, amount: number, element: ElementId, opts: HitOpts = {}, from?: THREE.Vector3): number {
  if (target.isPlayer && playerRouter) {
    playerRouter(amount, element, from);
    return amount;
  }
  return applyDamage(target, amount, element, opts);
}

/** Returns actual damage dealt. The heart of the matrix. */
export function applyDamage(target: Damageable, baseAmount: number, element: ElementId, opts: HitOpts = {}): number {
  if (!target.alive) return 0;
  const e = ELEMENTS[element];
  let amount = baseAmount;

  // Rime status amplifies all incoming damage
  if (target.slowUntil > gameTime) amount *= RIME_AMP;

  const critMult = opts.crit ? (opts.critMult ?? 2) : 1;
  amount *= critMult;

  let remaining = amount;
  let total = 0;
  const layerOrder: DefenseLayer[] = ['shield', 'armor', 'flesh'];
  for (const layer of layerOrder) {
    if (remaining <= 0) break;
    const pool = layer === 'shield' ? target.shield : layer === 'armor' ? target.armor : target.flesh;
    if (pool <= 0) continue;
    const mult = e.vs[layer];
    const scaled = remaining * mult;
    const consumed = Math.min(pool, scaled);
    if (layer === 'shield') target.shield -= consumed;
    else if (layer === 'armor') target.armor -= consumed;
    else target.flesh -= consumed;
    total += consumed;
    // leftover raw damage that punched through this layer
    remaining = mult > 0 ? (scaled - consumed) / mult : 0;
    if (layer === 'shield' && target.shield <= 0 && consumed > 0) {
      fx.burst(target.position.clone().add(new THREE.Vector3(0, 1, 0)), 0x54d4ff, 14, 4, 0.1, 0.5, 3); // shield-break pop
    }
  }

  if (!opts.noNumbers) {
    spawnNumber(target.position.clone().add(new THREE.Vector3(0, 1.6, 0)), total, element, !!opts.crit);
  }

  // ---- status proc ----
  if (element !== 'kinetic' && (opts.elemChance ?? 0) > 0 && Math.random() < (opts.elemChance ?? 0)) {
    procStatus(target, element, opts.elemDps ?? baseAmount * e.dotFraction);
  }

  // ---- volt chain ----
  if (element === 'volt' && !opts.noChain && total > 0) {
    const near = allTargets().filter((t) => t !== target && t.alive && !t.isPlayer && t.position.distanceTo(target.position) < VOLT_CHAIN_RANGE);
    if (near.length > 0) {
      const next = near[Math.floor(Math.random() * near.length)];
      fx.lightningArc(target.position.clone().add(new THREE.Vector3(0, 1.2, 0)), next.position.clone().add(new THREE.Vector3(0, 1.2, 0)));
      applyDamage(next, baseAmount * VOLT_CHAIN_FRACTION, 'volt', { ...opts, noChain: true, crit: false });
    }
  }

  // ---- death ----
  if (target.alive && target.flesh <= 0 && target.maxFlesh > 0) {
    const overkill = -target.flesh;
    target.alive = false;
    target.onDeath(element, overkill);
    if (opts.source === 'player' || opts.source === 'turret') {
      juice.addHitstop(opts.crit ? JUICE.hitstopCrit : JUICE.hitstopKill);
      audio.kill();
    }
  } else if ((opts.source === 'player') && total > 0) {
    audio.hit(!!opts.crit);
  }

  return total;
}

export function procStatus(target: Damageable, element: ElementId, dps: number): void {
  const e = ELEMENTS[element];
  if (e.dotDuration <= 0 && !e.slows) return;
  if (e.slows) target.slowUntil = gameTime + e.dotDuration;
  if (e.dotFraction > 0) {
    const existing = target.statuses.find((s) => s.element === element);
    if (existing) {
      existing.remaining = e.dotDuration;
      existing.dps = Math.max(existing.dps, dps);
    } else {
      target.statuses.push({ element, dps, remaining: e.dotDuration });
    }
  }
  audio.elemental(element);
}

/** Tick DoTs + status VFX for one target. Call per frame per enemy. */
export function tickStatuses(target: Damageable, dt: number): void {
  if (!target.alive) return;
  for (let i = target.statuses.length - 1; i >= 0; i--) {
    const s = target.statuses[i];
    s.remaining -= dt;
    applyDamage(target, s.dps * dt, s.element, { noNumbers: Math.random() > 0.06, noChain: true, source: 'world' });
    if (Math.random() < 12 * dt) fx.statusFlames(target.position, s.element);
    if (s.remaining <= 0) target.statuses.splice(i, 1);
  }
  if (target.slowUntil > gameTime && Math.random() < 8 * dt) fx.statusFlames(target.position, 'rime');
}

export function slowFactor(target: Damageable): number {
  return target.slowUntil > gameTime ? 1 - RIME_SLOW : 1;
}

/** Radial splash: damages all targets in radius with falloff. */
export function splashDamage(center: THREE.Vector3, radius: number, amount: number, element: ElementId, opts: HitOpts = {}): void {
  fx.explosion(center, radius, ELEMENTS[element].color);
  audio.explosion(radius > 4);
  if (opts.source === 'player' || opts.source === 'turret') juice.addTrauma(0.25);
  for (const t of allTargets()) {
    if (!t.alive) continue;
    if (opts.source !== 'enemy' && t.isPlayer) continue;
    if (opts.source === 'enemy' && !t.isPlayer) continue;
    const d = t.position.distanceTo(center);
    if (d > radius) continue;
    const falloff = 1 - (d / radius) * 0.6;
    damageTarget(t, amount * falloff, element, { ...opts, crit: false }, center);
  }
}
