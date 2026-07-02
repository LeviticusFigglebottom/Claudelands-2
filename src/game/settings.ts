// Difficulty settings — one table, consulted by enemy construction (hp),
// player damage intake, and loot luck/xp bonuses. Chosen at new game,
// changeable from the pause menu, persisted in the save.

export type DifficultyId = 'easy' | 'normal' | 'badass';

export interface DifficultyDef {
  id: DifficultyId;
  name: string;
  blurb: string;
  enemyHp: number;
  enemyDamage: number;
  lootLuckBonus: number;
  xpMult: number;
}

export const DIFFICULTIES: Record<DifficultyId, DifficultyDef> = {
  easy: {
    id: 'easy', name: 'TOURIST', blurb: 'The wasteland pulls its punches. A little.',
    enemyHp: 0.85, enemyDamage: 0.7, lootLuckBonus: 0, xpMult: 1,
  },
  normal: {
    id: 'normal', name: 'CONTRACTOR', blurb: 'The intended amount of screaming.',
    enemyHp: 1, enemyDamage: 1, lootLuckBonus: 0, xpMult: 1,
  },
  badass: {
    id: 'badass', name: 'BADASS', blurb: 'Everything hits harder. So does the loot.',
    enemyHp: 1.3, enemyDamage: 1.35, lootLuckBonus: 0.2, xpMult: 1.15,
  },
};

let current: DifficultyDef = DIFFICULTIES.normal;
export function difficulty(): DifficultyDef { return current; }
export function setDifficulty(id: string): DifficultyDef {
  current = DIFFICULTIES[(id as DifficultyId)] ?? DIFFICULTIES.normal;
  return current;
}
