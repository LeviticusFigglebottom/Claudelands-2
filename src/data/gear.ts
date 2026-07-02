// Non-gun gear data: shield parts/specials, grenade deliveries, class-mod
// and relic tables. Same philosophy as weapons.ts — instances are assembled
// from these rows by geargen.ts.

import type { ElementId } from '../game/types';

// ---------------------------------------------------------------- shields
export interface ShieldSpecialDef {
  id: string;
  label: (power: number) => string;
  weight: number;
  makers: string[]; // which manufacturers roll it
}

export const SHIELD_SPECIALS: ShieldSpecialDef[] = [
  { id: 'nova', label: (p) => `NOVA: exploding blast (${Math.round(p)} dmg) when depleted`, weight: 3, makers: ['vulkram', 'aetheric'] },
  { id: 'spike', label: (p) => `SPIKE: melee attackers take ${Math.round(p)} damage`, weight: 3, makers: ['ratworks', 'vulkram'] },
  { id: 'amp', label: (p) => `AMP: full-shield shots deal +${Math.round(p)} bonus damage`, weight: 2, makers: ['lumen', 'aetheric'] },
  { id: 'adaptive', label: () => `ADAPTIVE: -30% damage from the last element that hit you`, weight: 2, makers: ['lumen', 'briskco'] },
  { id: 'fortify', label: (p) => `FORTIFY: +${Math.round(p)} max health instead of shield tricks`, weight: 2, makers: ['cordwood'] },
  { id: 'berserk', label: (p) => `ROID: +${Math.round(p)}% gun damage while shield is down`, weight: 2, makers: ['ratworks'] },
];

export const SHIELD_BASE = { capacity: 60, rechargeRate: 14, rechargeDelay: 3.2 };

// ---------------------------------------------------------------- grenades
export interface GrenadeDeliveryDef {
  id: string;
  label: string;
  blurb: string;
  weight: number;
  fuse: number;
  childCount: number;   // e.g. mirv children
  radiusMult: number;
  damageMult: number;
}

export const GRENADE_DELIVERIES: GrenadeDeliveryDef[] = [
  { id: 'lobbed', label: 'Lobbed', blurb: 'A classic. Goes where you throw it, mostly.', weight: 5, fuse: 1.6, childCount: 0, radiusMult: 1, damageMult: 1 },
  { id: 'bouncing', label: 'Bouncing Betty', blurb: 'Hops up before detonating. Enthusiastic.', weight: 3, fuse: 1.2, childCount: 0, radiusMult: 1.15, damageMult: 1.05 },
  { id: 'mirv', label: 'MIRV', blurb: 'The gift that gives four more gifts.', weight: 2, fuse: 1.4, childCount: 4, radiusMult: 0.8, damageMult: 0.65 },
  { id: 'singularity', label: 'Singularity', blurb: 'Politely gathers everyone for the occasion.', weight: 2, fuse: 1.1, childCount: 0, radiusMult: 1.3, damageMult: 0.85 },
  { id: 'sticky', label: 'Sticky', blurb: 'Commitment issues? Not this one.', weight: 3, fuse: 2.0, childCount: 0, radiusMult: 0.9, damageMult: 1.25 },
  { id: 'transfusion', label: 'Transfusion', blurb: 'Steals health. Gives it to someone prettier (you).', weight: 2, fuse: 1.4, childCount: 0, radiusMult: 1, damageMult: 0.8 },
];

export const GRENADE_BASE = { damage: 90, radius: 4.5 };

// ---------------------------------------------------------------- class mods
export interface ClassModArchetype {
  id: string;
  name: string;       // e.g. "Foreman" — combined with class name on card
  passives: { stat: string; label: string; base: number }[];
}

export const CLASSMOD_ARCHETYPES: ClassModArchetype[] = [
  { id: 'cm_foreman', name: 'Foreman', passives: [{ stat: 'gunDamage', label: 'Gun Damage', base: 0.08 }, { stat: 'reloadSpeed', label: 'Reload Speed', base: 0.08 }] },
  { id: 'cm_tinkerer', name: 'Tinkerer', passives: [{ stat: 'skillCooldown', label: 'Action Skill Cooldown', base: 0.1 }, { stat: 'turretDamage', label: 'Sentry Damage', base: 0.12 }] },
  { id: 'cm_shootist', name: 'Shootist', passives: [{ stat: 'critDamage', label: 'Crit Damage', base: 0.12 }, { stat: 'fireRate', label: 'Fire Rate', base: 0.06 }] },
  { id: 'cm_scrapper', name: 'Scrapper', passives: [{ stat: 'maxHealth', label: 'Max Health', base: 0.1 }, { stat: 'shieldRate', label: 'Shield Recharge', base: 0.1 }] },
];

// ---------------------------------------------------------------- relics
export interface RelicArchetype {
  id: string;
  name: string;
  flavor: string;
  passives: { stat: string; label: string; base: number }[];
}

export const RELIC_ARCHETYPES: RelicArchetype[] = [
  { id: 'rl_lucky_tooth', name: 'Lucky Tooth', flavor: 'Somebody’s molar on a string. It has seen things.', passives: [{ stat: 'lootLuck', label: 'Rare Drop Luck', base: 0.15 }] },
  { id: 'rl_tin_heart', name: 'Tin Heart', flavor: 'Rattles when danger is near. Also when you walk. Or breathe.', passives: [{ stat: 'maxHealth', label: 'Max Health', base: 0.12 }] },
  { id: 'rl_hot_coal', name: 'Pocket Coal', flavor: 'Still warm. Nobody knows why. Stop asking.', passives: [{ stat: 'elemDamage', label: 'Elemental Damage', base: 0.12 }] },
  { id: 'rl_stopwatch', name: 'Cracked Stopwatch', flavor: 'Runs backwards on Tuesdays.', passives: [{ stat: 'skillCooldown', label: 'Action Skill Cooldown', base: 0.12 }] },
];

export const GRENADE_ELEMENTS: ElementId[] = ['ember', 'bile', 'volt', 'rime', 'blast'];
