// Shared item/actor type definitions. Everything an item *is* lives in plain
// data so instances serialize trivially and generation stays data-driven.

// ---------------------------------------------------------------- elements
export type ElementId = 'kinetic' | 'ember' | 'bile' | 'volt' | 'rime' | 'blast';
export type DefenseLayer = 'shield' | 'armor' | 'flesh';

// ---------------------------------------------------------------- weapons
export type WeaponType = 'pistol' | 'smg' | 'shotgun' | 'ar' | 'sniper' | 'launcher';
export type PartSlot = 'body' | 'barrel' | 'grip' | 'stock' | 'sight' | 'mag' | 'accessory';

/** Multiplicative/additive stat modifiers a part contributes. */
export interface StatMods {
  damage?: number;       // multiplicative
  fireRate?: number;     // multiplicative
  accuracy?: number;     // multiplicative (higher = tighter)
  recoil?: number;       // multiplicative (lower = less kick)
  magSize?: number;      // multiplicative
  reloadTime?: number;   // multiplicative (lower = faster)
  critBonus?: number;    // additive (0.15 = +15% crit damage)
  pellets?: number;      // additive pellet count
  elemChance?: number;   // additive elemental proc chance
  projSpeed?: number;    // multiplicative
  zoom?: number;         // additive zoom factor
}

/** Visual recipe knobs consumed by gunmesh.ts. */
export interface PartLook {
  len?: number;          // relative length scale for barrels/stocks
  fat?: number;          // relative thickness
  shape?: string;        // named silhouette variant ('box'|'tube'|'hex'|'cluster'|'blade'|'drum'|'stick'|'scope'|'ring'|'post'|...)
  detail?: number;       // greeble density 0..1
}

export interface WeaponPartDef {
  id: string;
  name: string;          // shown on the item card parts list
  maker: string;         // manufacturer whose style this part carries
  slot: PartSlot;
  types: WeaponType[];   // which weapon types can roll it
  grade: number;         // 0..2 — higher rarity unlocks higher grades
  mods: StatMods;
  look: PartLook;
  tip?: string;          // one-line card note for special behavior
}

export interface WeaponInstance {
  kind: 'weapon';
  seed: number;
  level: number;
  rarity: string;                 // rarity id
  type: WeaponType;
  maker: string;                  // manufacturer id (from body part)
  element: ElementId;
  parts: Record<PartSlot, WeaponPartDef>;
  name: string;
  redText?: string;
  legendaryId?: string;
  /** Chaos-gear modifier id (see data/modifiers.ts) — stats already include it. */
  modifier?: string;
  stats: WeaponStats;
  value: number;                  // cash value
}

export interface WeaponStats {
  damage: number;        // per pellet
  pellets: number;
  fireRate: number;      // shots/sec
  accuracy: number;      // 0..100 displayed; drives spread
  magSize: number;
  reloadTime: number;    // seconds
  critBonus: number;
  recoil: number;        // kick multiplier (lower = steadier)
  elemChance: number;    // 0..1
  elemDps: number;       // status DPS if procced
  projSpeed: number;     // 0 = hitscan
  zoom: number;
  splashRadius: number;  // >0 = AoE on impact
  auto: boolean;
}

// ---------------------------------------------------------------- gear
export interface ShieldInstance {
  kind: 'shield';
  seed: number; level: number; rarity: string; maker: string;
  name: string; redText?: string;
  capacity: number; rechargeRate: number; rechargeDelay: number;
  special?: { id: string; label: string; power: number };
  value: number;
}

export interface GrenadeModInstance {
  kind: 'grenade';
  seed: number; level: number; rarity: string; maker: string;
  name: string; redText?: string;
  delivery: string; deliveryLabel: string;
  element: ElementId;
  damage: number; radius: number; fuse: number; childCount: number;
  value: number;
}

export interface ClassModInstance {
  kind: 'classmod';
  seed: number; level: number; rarity: string; maker: string;
  name: string; redText?: string; className: string; classId: string;
  skillBoosts: { skillId: string; skillName: string; points: number }[];
  passives: { stat: string; label: string; amount: number }[];
  value: number;
}

export interface RelicInstance {
  kind: 'relic';
  seed: number; level: number; rarity: string;
  name: string; flavor: string;
  passives: { stat: string; label: string; amount: number }[];
  value: number;
}

export type ItemInstance = WeaponInstance | ShieldInstance | GrenadeModInstance | ClassModInstance | RelicInstance;

// ---------------------------------------------------------------- events
export interface DamageEvent {
  amount: number;
  element: ElementId;
  crit: boolean;
  killed: boolean;
  worldPos: { x: number; y: number; z: number };
}
