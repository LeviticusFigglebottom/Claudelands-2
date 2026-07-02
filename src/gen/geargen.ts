// Generators for non-gun gear: shields, grenade mods, class mods, relics.
// Same recipe as weapons: seed + level + rarity -> parts from data tables.

import { mulberry32, freshSeed, pick, weightedPick, chance, type Rng } from '../util/rng';
import { rarityById, type RarityDef } from '../data/rarity';
import { rollRarity, levelScale } from './weapongen';
import { MAKER_LIST, makerById } from '../data/manufacturers';
import { SHIELD_SPECIALS, SHIELD_BASE, GRENADE_DELIVERIES, GRENADE_BASE, GRENADE_ELEMENTS, CLASSMOD_ARCHETYPES, RELIC_ARCHETYPES } from '../data/gear';
import { PLAYER_CLASS } from '../data/classes';
import type { ClassModInstance, GrenadeModInstance, RelicInstance, ShieldInstance } from '../game/types';

const SHIELD_NOUNS = ['Bulwark', 'Umbrella', 'Turtle Deal', 'Optimism Engine', 'Nope Field', 'Second Opinion'];
const GRENADE_NOUNS = ['Farewell Note', 'Party Starter', 'Loud Apology', 'Bad News', 'Care Package', 'Icebreaker'];

function pickRarity(rng: Rng, rarityId: string | undefined, luck: number): RarityDef {
  return rarityId ? rarityById(rarityId) : rollRarity(rng, luck);
}

export function generateShield(level: number, rarityId?: string, luck = 0, seed = freshSeed()): ShieldInstance {
  const rng = mulberry32(seed);
  const rarity = pickRarity(rng, rarityId, luck);
  const maker = pick(rng, MAKER_LIST);
  const scale = levelScale(level) * rarity.statMult;

  const capacity = Math.round(SHIELD_BASE.capacity * scale * (0.85 + rng() * 0.3));
  const rechargeRate = Math.round(SHIELD_BASE.rechargeRate * scale * (0.85 + rng() * 0.3));
  const rechargeDelay = +(SHIELD_BASE.rechargeDelay * (1.15 - rng() * 0.3) * (1 - rarity.tier * 0.04)).toFixed(1);

  let special: ShieldInstance['special'];
  if (rarity.tier >= 2 || chance(rng, 0.25)) {
    const pool = SHIELD_SPECIALS.filter((s) => s.makers.includes(maker.id));
    const def = pool.length ? weightedPick(rng, pool.map((s) => ({ item: s, w: s.weight }))) : pick(rng, SHIELD_SPECIALS);
    const power = def.id === 'berserk' ? 15 + rarity.tier * 8 : capacity * (0.4 + rarity.tier * 0.15);
    special = { id: def.id, label: def.label(power), power };
  }

  return {
    kind: 'shield', seed, level, rarity: rarity.id, maker: maker.id,
    name: `${makerById(maker.id).name.split(' ')[0]} ${pick(rng, SHIELD_NOUNS)}`,
    capacity, rechargeRate, rechargeDelay, special,
    value: Math.round((10 + rarity.tier * 25) * levelScale(level)) * 3,
  };
}

export function generateGrenadeMod(level: number, rarityId?: string, luck = 0, seed = freshSeed()): GrenadeModInstance {
  const rng = mulberry32(seed);
  const rarity = pickRarity(rng, rarityId, luck);
  const maker = pick(rng, MAKER_LIST);
  const delivery = weightedPick(rng, GRENADE_DELIVERIES.map((d) => ({ item: d, w: d.weight })));
  const element = pick(rng, GRENADE_ELEMENTS);
  const scale = levelScale(level) * rarity.statMult;

  return {
    kind: 'grenade', seed, level, rarity: rarity.id, maker: maker.id,
    name: `${delivery.label} ${pick(rng, GRENADE_NOUNS)}`,
    redText: rarity.tier >= 3 ? `“${delivery.blurb}”` : undefined,
    delivery: delivery.id, deliveryLabel: delivery.label,
    element,
    damage: Math.round(GRENADE_BASE.damage * delivery.damageMult * scale * (0.9 + rng() * 0.2)),
    radius: +(GRENADE_BASE.radius * delivery.radiusMult).toFixed(1),
    fuse: delivery.fuse,
    childCount: delivery.childCount,
    value: Math.round((8 + rarity.tier * 20) * levelScale(level)) * 3,
  };
}

export function generateClassMod(level: number, rarityId?: string, luck = 0, seed = freshSeed()): ClassModInstance {
  const rng = mulberry32(seed);
  const rarity = pickRarity(rng, rarityId, luck);
  const arch = pick(rng, CLASSMOD_ARCHETYPES);
  const cls = PLAYER_CLASS;

  // boost 1-2 random skills from the class's trees
  const allSkills = cls.trees.flatMap((t) => t.skills).filter((s) => s.kind !== 'augment' && s.maxPoints > 1);
  const boostCount = rarity.tier >= 3 ? 2 : 1;
  const boosted = new Set<string>();
  const skillBoosts: ClassModInstance['skillBoosts'] = [];
  for (let i = 0; i < boostCount && allSkills.length; i++) {
    const s = pick(rng, allSkills.filter((x) => !boosted.has(x.id)));
    boosted.add(s.id);
    skillBoosts.push({ skillId: s.id, skillName: s.name, points: 1 + Math.floor(rarity.tier / 2) });
  }

  return {
    kind: 'classmod', seed, level, rarity: rarity.id, maker: 'lumen',
    name: `${arch.name}’s Charter`,
    className: cls.name, classId: cls.id,
    skillBoosts,
    passives: arch.passives.map((p) => ({ stat: p.stat, label: p.label, amount: +(p.base * rarity.statMult * (0.9 + rng() * 0.2)).toFixed(3) })),
    value: Math.round((12 + rarity.tier * 22) * levelScale(level)) * 3,
  };
}

export function generateRelic(level: number, rarityId?: string, luck = 0, seed = freshSeed()): RelicInstance {
  const rng = mulberry32(seed);
  const rarity = pickRarity(rng, rarityId, luck);
  const arch = pick(rng, RELIC_ARCHETYPES);
  return {
    kind: 'relic', seed, level, rarity: rarity.id,
    name: arch.name,
    flavor: arch.flavor,
    passives: arch.passives.map((p) => ({ stat: p.stat, label: p.label, amount: +(p.base * rarity.statMult * (0.9 + rng() * 0.2)).toFixed(3) })),
    value: Math.round((10 + rarity.tier * 24) * levelScale(level)) * 3,
  };
}
