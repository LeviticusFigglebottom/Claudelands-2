// Weapon type archetypes + the global part pools. A generated gun = body
// (fixes the manufacturer) + barrel/grip/stock/sight/mag (+accessory), each
// part pulled from these pools filtered by weapon type. Parts carry BOTH
// stat mods and a mesh recipe, so the roll changes look and feel together.
// Pass 2+ adds guns by adding rows here — generation code never changes.

import type { StatMods, WeaponPartDef, WeaponType } from '../game/types';

export interface WeaponTypeDef {
  id: WeaponType;
  name: string;
  base: {
    damage: number; fireRate: number; accuracy: number; magSize: number;
    reloadTime: number; pellets: number; critBonus: number; elemChance: number;
    projSpeed: number; // 0 = hitscan
    zoom: number; auto: boolean; splashRadius: number;
  };
  ammoPool: number;     // max carried ammo
  dropWeight: number;
}

export const WEAPON_TYPES: Record<WeaponType, WeaponTypeDef> = {
  pistol: {
    id: 'pistol', name: 'Pistol',
    base: { damage: 14, fireRate: 4.2, accuracy: 82, magSize: 12, reloadTime: 1.4, pellets: 1, critBonus: 0.1, elemChance: 0.12, projSpeed: 0, zoom: 1.4, auto: false, splashRadius: 0 },
    ammoPool: 240, dropWeight: 24,
  },
  smg: {
    id: 'smg', name: 'SMG',
    base: { damage: 8, fireRate: 11, accuracy: 70, magSize: 28, reloadTime: 1.7, pellets: 1, critBonus: 0.05, elemChance: 0.15, projSpeed: 0, zoom: 1.3, auto: true, splashRadius: 0 },
    ammoPool: 360, dropWeight: 20,
  },
  shotgun: {
    id: 'shotgun', name: 'Shotgun',
    base: { damage: 9, fireRate: 1.6, accuracy: 48, magSize: 6, reloadTime: 2.2, pellets: 7, critBonus: 0.05, elemChance: 0.08, projSpeed: 0, zoom: 1.15, auto: false, splashRadius: 0 },
    ammoPool: 120, dropWeight: 18,
  },
  ar: {
    id: 'ar', name: 'Rifle',
    base: { damage: 12, fireRate: 7.5, accuracy: 76, magSize: 32, reloadTime: 2.0, pellets: 1, critBonus: 0.08, elemChance: 0.1, projSpeed: 0, zoom: 1.6, auto: true, splashRadius: 0 },
    ammoPool: 420, dropWeight: 22,
  },
  sniper: {
    id: 'sniper', name: 'Sniper',
    base: { damage: 52, fireRate: 1.1, accuracy: 96, magSize: 5, reloadTime: 2.6, pellets: 1, critBonus: 0.6, elemChance: 0.14, projSpeed: 0, zoom: 3.5, auto: false, splashRadius: 0 },
    ammoPool: 60, dropWeight: 10,
  },
  launcher: {
    id: 'launcher', name: 'Launcher',
    base: { damage: 110, fireRate: 0.8, accuracy: 70, magSize: 3, reloadTime: 3.2, pellets: 1, critBonus: 0, elemChance: 0.2, projSpeed: 34, zoom: 1.5, auto: false, splashRadius: 4 },
    ammoPool: 21, dropWeight: 6,
  },
};

export const WEAPON_TYPE_LIST = Object.values(WEAPON_TYPES);

const ALL: WeaponType[] = ['pistol', 'smg', 'shotgun', 'ar', 'sniper', 'launcher'];
const LONG: WeaponType[] = ['shotgun', 'ar', 'sniper', 'launcher'];

// ---------------------------------------------------------------------------
// BODIES — one per manufacturer; fixes maker identity. Look comes mostly from
// the maker's finish/silhouette; the body itself sets the receiver mass.
export const BODY_PARTS: WeaponPartDef[] = [
  { id: 'body_vulkram', name: 'Foundry Block', maker: 'vulkram', slot: 'body', types: ALL, grade: 0, mods: {}, look: { fat: 1.25, shape: 'brick', detail: 0.8 } },
  { id: 'body_lumen', name: 'Cleanroom Chassis', maker: 'lumen', slot: 'body', types: ALL, grade: 0, mods: {}, look: { fat: 0.85, shape: 'sleek', detail: 0.3 } },
  { id: 'body_ratworks', name: 'Skrap Reseevur', maker: 'ratworks', slot: 'body', types: ALL, grade: 0, mods: {}, look: { fat: 1.1, shape: 'cobbled', detail: 1.0 } },
  { id: 'body_aetheric', name: 'Resonance Core', maker: 'aetheric', slot: 'body', types: ALL, grade: 0, mods: {}, look: { fat: 0.95, shape: 'coiled', detail: 0.6 } },
  { id: 'body_cordwood', name: 'Heirloom Frame', maker: 'cordwood', slot: 'body', types: ALL, grade: 0, mods: {}, look: { fat: 0.9, shape: 'classic', detail: 0.4 } },
  { id: 'body_briskco', name: 'Injection-Mold Shell', maker: 'briskco', slot: 'body', types: ALL, grade: 0, mods: {}, look: { fat: 1.0, shape: 'toy', detail: 0.2 } },
];

// ---------------------------------------------------------------------------
// BARRELS
export const BARREL_PARTS: WeaponPartDef[] = [
  { id: 'brl_stub', name: 'Sawed Stub', maker: 'ratworks', slot: 'barrel', types: ALL, grade: 0, mods: { damage: 0.92, fireRate: 1.12, accuracy: 0.85 }, look: { len: 0.55, fat: 1.15, shape: 'tube' } },
  { id: 'brl_standard', name: 'Field Barrel', maker: 'cordwood', slot: 'barrel', types: ALL, grade: 0, mods: {}, look: { len: 1.0, fat: 1.0, shape: 'tube' } },
  { id: 'brl_long', name: 'Marksman Bore', maker: 'lumen', slot: 'barrel', types: ALL, grade: 1, mods: { damage: 1.08, accuracy: 1.2, fireRate: 0.94 }, look: { len: 1.45, fat: 0.85, shape: 'hex' } },
  { id: 'brl_heavy', name: 'Mortar Throat', maker: 'vulkram', slot: 'barrel', types: ALL, grade: 1, mods: { damage: 1.22, fireRate: 0.85, recoil: 1.2 }, look: { len: 1.1, fat: 1.5, shape: 'brick' } },
  { id: 'brl_vented', name: 'Vented Shroud', maker: 'briskco', slot: 'barrel', types: ALL, grade: 1, mods: { fireRate: 1.15, recoil: 0.85 }, look: { len: 1.05, fat: 1.1, shape: 'vented' } },
  { id: 'brl_coil', name: 'Flux Coil', maker: 'aetheric', slot: 'barrel', types: ALL, grade: 1, mods: { elemChance: 0.15, damage: 1.05 }, look: { len: 1.2, fat: 1.0, shape: 'coil' } },
  { id: 'brl_cluster', name: 'Hydra Cluster', maker: 'ratworks', slot: 'barrel', types: ['shotgun', 'launcher'], grade: 2, mods: { pellets: 2, accuracy: 0.8, damage: 0.9 }, look: { len: 0.9, fat: 1.4, shape: 'cluster' }, tip: 'Fires extra projectiles.' },
  { id: 'brl_railspine', name: 'Rail Spine', maker: 'lumen', slot: 'barrel', types: ['sniper', 'ar', 'pistol'], grade: 2, mods: { damage: 1.18, accuracy: 1.3, critBonus: 0.15, fireRate: 0.9 }, look: { len: 1.6, fat: 0.7, shape: 'rail' } },
];

// ---------------------------------------------------------------------------
// GRIPS
export const GRIP_PARTS: WeaponPartDef[] = [
  { id: 'grp_taped', name: 'Taped Grip', maker: 'ratworks', slot: 'grip', types: ALL, grade: 0, mods: { reloadTime: 1.05, magSize: 1.1 }, look: { shape: 'stick' } },
  { id: 'grp_ergo', name: 'Ergo Grip', maker: 'lumen', slot: 'grip', types: ALL, grade: 0, mods: { reloadTime: 0.92, recoil: 0.92 }, look: { shape: 'curve' } },
  { id: 'grp_iron', name: 'Iron Fist Grip', maker: 'vulkram', slot: 'grip', types: ALL, grade: 1, mods: { damage: 1.06, recoil: 1.08 }, look: { shape: 'block' } },
  { id: 'grp_walnut', name: 'Walnut Grip', maker: 'cordwood', slot: 'grip', types: ALL, grade: 1, mods: { critBonus: 0.1, reloadTime: 0.95 }, look: { shape: 'classic' } },
  { id: 'grp_gel', name: 'Gel-Print Grip', maker: 'briskco', slot: 'grip', types: ALL, grade: 1, mods: { reloadTime: 0.85 }, look: { shape: 'toy' } },
  { id: 'grp_sigil', name: 'Sigil Grip', maker: 'aetheric', slot: 'grip', types: ALL, grade: 2, mods: { elemChance: 0.1, reloadTime: 0.9 }, look: { shape: 'rune' } },
];

// ---------------------------------------------------------------------------
// STOCKS
export const STOCK_PARTS: WeaponPartDef[] = [
  { id: 'stk_none', name: 'No Stock', maker: 'ratworks', slot: 'stock', types: ALL, grade: 0, mods: { accuracy: 0.88, recoil: 1.15, reloadTime: 0.95 }, look: { len: 0, shape: 'none' } },
  { id: 'stk_wire', name: 'Wire Skeleton', maker: 'briskco', slot: 'stock', types: ALL, grade: 0, mods: { recoil: 0.95 }, look: { len: 0.8, shape: 'wire' } },
  { id: 'stk_plated', name: 'Plated Shoulder', maker: 'vulkram', slot: 'stock', types: LONG, grade: 1, mods: { recoil: 0.8, accuracy: 1.08, fireRate: 0.96 }, look: { len: 1.1, fat: 1.3, shape: 'brick' } },
  { id: 'stk_carbon', name: 'Carbon Spine', maker: 'lumen', slot: 'stock', types: ALL, grade: 1, mods: { recoil: 0.75, accuracy: 1.12 }, look: { len: 1.0, fat: 0.8, shape: 'sleek' } },
  { id: 'stk_walnut', name: 'Walnut Stock', maker: 'cordwood', slot: 'stock', types: LONG, grade: 1, mods: { accuracy: 1.15, critBonus: 0.08 }, look: { len: 1.15, fat: 1.0, shape: 'classic' } },
  { id: 'stk_resonant', name: 'Resonant Brace', maker: 'aetheric', slot: 'stock', types: ALL, grade: 2, mods: { elemChance: 0.08, recoil: 0.85, accuracy: 1.06 }, look: { len: 1.0, fat: 0.9, shape: 'rune' } },
];

// ---------------------------------------------------------------------------
// SIGHTS
export const SIGHT_PARTS: WeaponPartDef[] = [
  { id: 'sgt_iron', name: 'Iron Sights', maker: 'cordwood', slot: 'sight', types: ALL, grade: 0, mods: {}, look: { shape: 'post' } },
  { id: 'sgt_bent_nail', name: 'Bent Nail', maker: 'ratworks', slot: 'sight', types: ALL, grade: 0, mods: { accuracy: 0.95, fireRate: 1.05 }, look: { shape: 'nail' } },
  { id: 'sgt_reflex', name: 'Reflex Ring', maker: 'briskco', slot: 'sight', types: ALL, grade: 1, mods: { accuracy: 1.08, zoom: 0.3 }, look: { shape: 'ring' } },
  { id: 'sgt_prism', name: 'Prism Optic', maker: 'lumen', slot: 'sight', types: ALL, grade: 1, mods: { accuracy: 1.12, zoom: 0.8, critBonus: 0.08 }, look: { shape: 'scope' } },
  { id: 'sgt_longeye', name: 'Longeye Scope', maker: 'vulkram', slot: 'sight', types: ['sniper', 'ar', 'launcher'], grade: 2, mods: { zoom: 1.8, accuracy: 1.15 }, look: { shape: 'bigscope' } },
  { id: 'sgt_third_eye', name: 'Third Eye', maker: 'aetheric', slot: 'sight', types: ALL, grade: 2, mods: { zoom: 0.6, elemChance: 0.08, critBonus: 0.1 }, look: { shape: 'orb' } },
];

// ---------------------------------------------------------------------------
// MAGAZINES
export const MAG_PARTS: WeaponPartDef[] = [
  { id: 'mag_box', name: 'Box Mag', maker: 'lumen', slot: 'mag', types: ALL, grade: 0, mods: {}, look: { shape: 'box' } },
  { id: 'mag_rust_drum', name: 'Rusty Drum', maker: 'ratworks', slot: 'mag', types: ALL, grade: 1, mods: { magSize: 1.6, reloadTime: 1.25 }, look: { shape: 'drum', fat: 1.3 } },
  { id: 'mag_quick', name: 'Quickwell', maker: 'briskco', slot: 'mag', types: ALL, grade: 1, mods: { reloadTime: 0.75, magSize: 0.85 }, look: { shape: 'slim' } },
  { id: 'mag_brass', name: 'Brass Tube', maker: 'cordwood', slot: 'mag', types: ALL, grade: 0, mods: { magSize: 0.85, damage: 1.06 }, look: { shape: 'tube' } },
  { id: 'mag_siege', name: 'Siege Canister', maker: 'vulkram', slot: 'mag', types: ALL, grade: 2, mods: { magSize: 1.3, damage: 1.08, reloadTime: 1.2 }, look: { shape: 'canister', fat: 1.2 } },
  { id: 'mag_phial', name: 'Element Phial', maker: 'aetheric', slot: 'mag', types: ALL, grade: 2, mods: { elemChance: 0.12, magSize: 1.1 }, look: { shape: 'phial' } },
];

// ---------------------------------------------------------------------------
// ACCESSORIES (rarity-gated slot — the "spice" roll)
export const ACCESSORY_PARTS: WeaponPartDef[] = [
  { id: 'acc_bayonet', name: 'Welded Bayonet', maker: 'ratworks', slot: 'accessory', types: ALL, grade: 0, mods: { damage: 1.1 }, look: { shape: 'blade' }, tip: 'Pointy end goes in the other guy.' },
  { id: 'acc_laser', name: 'Beam Designator', maker: 'lumen', slot: 'accessory', types: ALL, grade: 1, mods: { accuracy: 1.18 }, look: { shape: 'laser' } },
  { id: 'acc_muzzle_brake', name: 'Muzzle Brake', maker: 'vulkram', slot: 'accessory', types: ALL, grade: 1, mods: { recoil: 0.72 }, look: { shape: 'brake' } },
  { id: 'acc_hair_trigger', name: 'Hair Trigger', maker: 'cordwood', slot: 'accessory', types: ALL, grade: 1, mods: { fireRate: 1.18 }, look: { shape: 'trigger' } },
  { id: 'acc_catalyst', name: 'Catalyst Bead', maker: 'aetheric', slot: 'accessory', types: ALL, grade: 2, mods: { elemChance: 0.2 }, look: { shape: 'bead' } },
  { id: 'acc_double_tap', name: 'Double-Tap Cam', maker: 'briskco', slot: 'accessory', types: ['pistol', 'smg', 'ar'], grade: 2, mods: { pellets: 1, damage: 0.82, magSize: 1.1 }, look: { shape: 'cam' }, tip: 'Two for the price of 1.4.' },
];

export const PART_POOLS: Record<string, WeaponPartDef[]> = {
  body: BODY_PARTS,
  barrel: BARREL_PARTS,
  grip: GRIP_PARTS,
  stock: STOCK_PARTS,
  sight: SIGHT_PARTS,
  mag: MAG_PARTS,
  accessory: ACCESSORY_PARTS,
};

/** Stat keys that combine multiplicatively. */
export const MULT_KEYS: (keyof StatMods)[] = ['damage', 'fireRate', 'accuracy', 'recoil', 'magSize', 'reloadTime', 'projSpeed'];
/** Stat keys that combine additively. */
export const ADD_KEYS: (keyof StatMods)[] = ['critBonus', 'pellets', 'elemChance', 'zoom'];
