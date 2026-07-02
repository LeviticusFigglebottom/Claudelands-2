// Rarity tiers. One consistent color per tier everywhere: loot beams, item
// cards, borders, pickup feed, audio sting brightness. Tier index doubles as
// the "ceremony level" of the drop.

export interface RarityDef {
  id: string;
  name: string;
  tier: number;            // 0..5
  color: number;
  css: string;
  weight: number;          // base drop weight (world drops)
  statMult: number;        // flat stat bonus multiplier
  minGrade: number;        // minimum part grade rolled
  accessoryChance: number; // chance the accessory slot is filled
  elemChanceBonus: number; // bonus chance the gun is elemental
}

export const RARITIES: Record<string, RarityDef> = {
  common:    { id: 'common',    name: 'Common',    tier: 0, color: 0xffffff, css: '#e8e8e8', weight: 100, statMult: 1.00, minGrade: 0, accessoryChance: 0.00, elemChanceBonus: 0.00 },
  uncommon:  { id: 'uncommon',  name: 'Uncommon',  tier: 1, color: 0x3ddc4e, css: '#3ddc4e', weight: 36,  statMult: 1.12, minGrade: 0, accessoryChance: 0.15, elemChanceBonus: 0.10 },
  rare:      { id: 'rare',      name: 'Rare',      tier: 2, color: 0x2f7dff, css: '#4f95ff', weight: 11,  statMult: 1.26, minGrade: 1, accessoryChance: 0.45, elemChanceBonus: 0.25 },
  epic:      { id: 'epic',      name: 'Epic',      tier: 3, color: 0xb04bff, css: '#c06bff', weight: 3.2, statMult: 1.42, minGrade: 1, accessoryChance: 0.80, elemChanceBonus: 0.45 },
  legendary: { id: 'legendary', name: 'Legendary', tier: 4, color: 0xff9500, css: '#ffa21f', weight: 0.55, statMult: 1.60, minGrade: 2, accessoryChance: 1.00, elemChanceBonus: 0.60 },
  // Top tier reserved for future named uniques — the slot machine's jackpot lamp.
  opaline:   { id: 'opaline',   name: 'Opaline',   tier: 5, color: 0x7ffff2, css: '#8ffff4', weight: 0.03, statMult: 1.85, minGrade: 2, accessoryChance: 1.00, elemChanceBonus: 0.80 },
};

export const RARITY_LIST = Object.values(RARITIES).sort((a, b) => a.tier - b.tier);

export function rarityById(id: string): RarityDef { return RARITIES[id] ?? RARITIES.common; }
