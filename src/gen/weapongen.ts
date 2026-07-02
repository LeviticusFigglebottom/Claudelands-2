// The slot machine. Rolls a weapon from (level, rarity, seed): picks a body
// (=> manufacturer), fills part slots from pools filtered by weapon type and
// rarity grade, aggregates stat mods multiplicatively/additively, applies
// manufacturer bias + gimmick rules, names the thing, prices it.

import { mulberry32, freshSeed, weightedPick, pick, chance, type Rng } from '../util/rng';
import { RARITY_LIST, rarityById, type RarityDef } from '../data/rarity';
import { MANUFACTURERS, makerById } from '../data/manufacturers';
import { PART_POOLS, WEAPON_TYPES, WEAPON_TYPE_LIST, MULT_KEYS, ADD_KEYS } from '../data/weapons';
import { COMBAT_ELEMENTS, ELEMENTS } from '../data/elements';
import { legendaryFor } from '../data/legendaries';
import { QUALITY_PREFIXES, ELEMENT_PREFIXES, EPIC_RED_TEXT } from '../data/flavor';
import type { ElementId, PartSlot, StatMods, WeaponInstance, WeaponPartDef, WeaponStats, WeaponType } from '../game/types';

/** Damage growth per level — the treadmill that makes drops matter. */
export function levelScale(level: number): number {
  return Math.pow(1.11, level - 1);
}

export function rollRarity(rng: Rng, luck = 0): RarityDef {
  const table = RARITY_LIST.map((r) => ({
    item: r,
    w: r.tier === 0 ? r.weight : r.weight * (1 + luck * r.tier),
  }));
  return weightedPick(rng, table);
}

function pickPart(rng: Rng, slot: PartSlot, type: WeaponType, minGrade: number): WeaponPartDef {
  const pool = PART_POOLS[slot].filter((p) => p.types.includes(type));
  const graded = pool.filter((p) => p.grade >= minGrade);
  const usable = graded.length > 0 ? graded : pool;
  return pick(rng, usable);
}

export interface GenOpts {
  level: number;
  rarityId?: string;
  type?: WeaponType;
  makerId?: string;
  seed?: number;
  luck?: number;
}

export function generateWeapon(opts: GenOpts): WeaponInstance {
  const seed = opts.seed ?? freshSeed();
  const rng = mulberry32(seed);
  const level = Math.max(1, Math.round(opts.level));
  const rarity = opts.rarityId ? rarityById(opts.rarityId) : rollRarity(rng, opts.luck ?? 0);

  const typeDef = opts.type
    ? WEAPON_TYPES[opts.type]
    : weightedPick(rng, WEAPON_TYPE_LIST.map((t) => ({ item: t, w: t.dropWeight })));

  // Legendary+ guns are defined by their signature: it fixes maker & type.
  const legendary = rarity.tier >= 4 ? legendaryFor(typeDef.id, rng()) : null;

  const bodyPool = PART_POOLS.body;
  const body = legendary
    ? bodyPool.find((b) => b.maker === legendary.maker) ?? pick(rng, bodyPool)
    : opts.makerId
      ? bodyPool.find((b) => b.maker === opts.makerId) ?? pick(rng, bodyPool)
      : pick(rng, bodyPool);
  const maker = makerById(body.maker);
  const realType = legendary ? WEAPON_TYPES[legendary.type] : typeDef;

  const parts: Record<PartSlot, WeaponPartDef> = {
    body,
    barrel: pickPart(rng, 'barrel', realType.id, rarity.minGrade),
    grip: pickPart(rng, 'grip', realType.id, rarity.minGrade),
    stock: pickPart(rng, 'stock', realType.id, rarity.minGrade),
    sight: pickPart(rng, 'sight', realType.id, rarity.minGrade),
    mag: pickPart(rng, 'mag', realType.id, rarity.minGrade),
    accessory: undefined as unknown as WeaponPartDef,
  };
  if (chance(rng, rarity.accessoryChance)) {
    parts.accessory = pickPart(rng, 'accessory', realType.id, 0);
  } else {
    delete (parts as Partial<Record<PartSlot, WeaponPartDef>>).accessory;
  }

  // ---- element roll ----
  let element: ElementId = 'kinetic';
  const elemRoll = rng();
  const gimmick = maker.gimmick;
  if (legendary?.forceElement) element = legendary.forceElement;
  else if (gimmick === 'always_elemental') element = pick(rng, COMBAT_ELEMENTS);
  else if (gimmick === 'crit_ricochet') element = 'kinetic'; // Cordwood never rolls elements
  else if (elemRoll < 0.22 + rarity.elemChanceBonus) element = pick(rng, COMBAT_ELEMENTS);

  // ---- aggregate stats ----
  const mods: Required<StatMods> = {
    damage: 1, fireRate: 1, accuracy: 1, recoil: 1, magSize: 1, reloadTime: 1,
    critBonus: 0, pellets: 0, elemChance: 0, projSpeed: 1, zoom: 0,
  };
  const contributions: StatMods[] = [maker.bias, ...Object.values(parts).map((p) => p.mods)];
  for (const c of contributions) {
    for (const k of MULT_KEYS) if (c[k] !== undefined) mods[k] *= c[k]!;
    for (const k of ADD_KEYS) if (c[k] !== undefined) mods[k] += c[k]!;
  }

  const b = realType.base;
  const jitter = 0.92 + rng() * 0.16; // same roll, slightly different serial number
  const stats: WeaponStats = {
    damage: b.damage * mods.damage * rarity.statMult * levelScale(level) * jitter,
    pellets: Math.max(1, Math.round(b.pellets + mods.pellets + (legendary?.effect.kind === 'pellet_storm' ? legendary.effect.pellets : 0))),
    fireRate: b.fireRate * mods.fireRate,
    accuracy: Math.min(99, b.accuracy * mods.accuracy),
    magSize: Math.max(2, Math.round(b.magSize * mods.magSize)),
    reloadTime: Math.max(0.4, b.reloadTime * mods.reloadTime),
    critBonus: b.critBonus + mods.critBonus,
    recoil: mods.recoil,
    elemChance: element === 'kinetic' ? 0 : Math.min(1, b.elemChance + mods.elemChance + rarity.elemChanceBonus * 0.3 + (gimmick === 'always_elemental' ? 0.25 : 0)),
    elemDps: 0,
    projSpeed: b.projSpeed * mods.projSpeed,
    zoom: b.zoom + mods.zoom,
    splashRadius: b.splashRadius + (gimmick === 'splash' ? Math.max(1.6, b.splashRadius) : 0),
    auto: b.auto,
  };
  if (element !== 'kinetic') {
    stats.elemDps = stats.damage * ELEMENTS[element].dotFraction * Math.max(1, stats.pellets * 0.5);
  }

  // ---- name ----
  let name: string;
  let redText: string | undefined;
  if (legendary) {
    name = legendary.name;
    redText = legendary.redText;
  } else {
    const noun = pick(rng, maker.namePool);
    const elemPre = element !== 'kinetic' && chance(rng, 0.7) ? pick(rng, ELEMENT_PREFIXES[element]) : null;
    const qualPre = QUALITY_PREFIXES[rarity.id]?.length ? pick(rng, QUALITY_PREFIXES[rarity.id]) : null;
    name = [elemPre ?? qualPre, noun].filter(Boolean).join(' ');
    if (rarity.tier === 3 && chance(rng, 0.5)) redText = pick(rng, EPIC_RED_TEXT);
  }

  const value = Math.round((14 + rarity.tier * 30) * levelScale(level) * (0.8 + rng() * 0.4)) * 3;

  return {
    kind: 'weapon',
    seed, level,
    rarity: rarity.id,
    type: realType.id,
    maker: maker.id,
    element,
    parts,
    name,
    redText,
    legendaryId: legendary?.id,
    stats,
    value,
  };
}

/** Convenience: starter peashooter so the player is never unarmed. */
export function starterWeapon(): WeaponInstance {
  return generateWeapon({ level: 1, rarityId: 'common', type: 'pistol', makerId: 'cordwood', seed: 1337 });
}
