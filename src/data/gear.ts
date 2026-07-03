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

// ------------------------------------------------------- gear legendaries
// Named, red-texted gear that rolls whenever legendary-rarity gear drops —
// the slots weapons always hogged. Flavor sourced from the far territories.
export interface GearLegendaryDef {
  id: string;
  kind: 'shield' | 'grenade' | 'classmod' | 'relic';
  name: string;
  redText: string;
  statMult: number;                       // on top of legendary rarity
  shield?: { specialId: string; powerMult: number };
  grenade?: { deliveryId: string; element: ElementId; damageMult: number };
  classmod?: { archetypeId: string; extraPoint: boolean };
  relic?: { passives: { stat: string; label: string; base: number }[] };
}

export const GEAR_LEGENDARIES: GearLegendaryDef[] = [
  // ---- shields
  {
    id: 'gl_lantern', kind: 'shield', name: 'The Admiral’s Other Lantern', statMult: 1.2,
    redText: '“Still lit. Still regulation.”',
    shield: { specialId: 'amp', powerMult: 1.6 },
  },
  {
    id: 'gl_barnacle', kind: 'shield', name: 'Barnacle Opinion', statMult: 1.25,
    redText: '“It grew on you first.”',
    shield: { specialId: 'spike', powerMult: 1.7 },
  },
  {
    id: 'gl_glowshroom', kind: 'shield', name: 'Gloomgrove Umbrella', statMult: 1.15,
    redText: '“The mushrooms are watching. Approvingly.”',
    shield: { specialId: 'nova', powerMult: 1.6 },
  },
  // ---- grenade mods
  {
    id: 'gl_depthcharge', kind: 'grenade', name: 'Depth Charge', statMult: 1.2,
    redText: '“The bottom of the sea says HI.”',
    grenade: { deliveryId: 'bouncing', element: 'rime', damageMult: 1.35 },
  },
  {
    id: 'gl_seamsong', kind: 'grenade', name: 'Seam Song', statMult: 1.2,
    redText: '“dig. Dig. DIG.”',
    grenade: { deliveryId: 'singularity', element: 'volt', damageMult: 1.3 },
  },
  {
    id: 'gl_chowder', kind: 'grenade', name: 'Peg’s Chowder', statMult: 1.15,
    redText: '“Ask about it. ASK.”',
    grenade: { deliveryId: 'mirv', element: 'bile', damageMult: 1.25 },
  },
  // ---- class mods
  {
    id: 'gl_quartermistress', kind: 'classmod', name: 'Quartermistress’s Ledger', statMult: 1.3,
    redText: '“The paperwork survived. It always does.”',
    classmod: { archetypeId: 'cm_foreman', extraPoint: true },
  },
  {
    id: 'gl_nightshift', kind: 'classmod', name: 'Night Shift Charter', statMult: 1.3,
    redText: '“Sixty years on shift. No breaks.”',
    classmod: { archetypeId: 'cm_shootist', extraPoint: true },
  },
  // ---- relics
  {
    id: 'gl_crownshard', kind: 'relic', name: 'Crown Shard', statMult: 1,
    redText: '“A splinter of the Mother Lode’s crown. It hums when you’re winning.”',
    relic: { passives: [{ stat: 'elemDamage', label: 'Elemental Damage', base: 0.2 }, { stat: 'skillCooldown', label: 'Action Skill Cooldown', base: 0.08 }] },
  },
  {
    id: 'gl_dryboot', kind: 'relic', name: 'Peg’s Dry Boot', statMult: 1,
    redText: '“One boot. Bone dry. A miracle on a string.”',
    relic: { passives: [{ stat: 'maxHealth', label: 'Max Health', base: 0.16 }, { stat: 'lootLuck', label: 'Rare Drop Luck', base: 0.12 }] },
  },
];

export function gearLegendariesFor(kind: GearLegendaryDef['kind']): GearLegendaryDef[] {
  return GEAR_LEGENDARIES.filter((g) => g.kind === kind);
}
