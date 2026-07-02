// Enemy archetypes for the Rustborn — the scrap-cult bandits squatting in
// Gully Seven. Each row sets AI behavior, defense layers, silhouette params,
// barks, and drop-tier. Badass variants are generated from these by scaling.

import type { ElementId } from '../game/types';

export type EnemyBehavior = 'rusher' | 'gunner' | 'lobber' | 'brute';

export interface EnemyDef {
  id: string;
  name: string;
  badassName: string;        // name of the elite variant
  behavior: EnemyBehavior;
  // defense layers (fractions of total HP budget)
  flesh: number;
  shield: number;            // 0 = none
  armor: number;             // 0 = none
  hpMult: number;            // vs level baseline
  damageMult: number;
  speed: number;             // m/s
  attackRange: number;       // m — gunners hold range, rushers melee
  attackRate: number;        // attacks/sec
  scale: number;             // visual size
  tint: number;              // body color
  dropTier: number;          // 0 = trash, 1 = tough, 2 = badass, 3 = boss
  xp: number;                // base XP at level 1
  barks: string[];
  projectile?: { speed: number; element: ElementId };
  weight: number;            // spawn weight
}

export const ENEMIES: Record<string, EnemyDef> = {
  scrapmutt: {
    id: 'scrapmutt', name: 'Scrap Mutt', badassName: 'Big Damn Mutt',
    behavior: 'rusher',
    flesh: 1, shield: 0, armor: 0,
    hpMult: 0.6, damageMult: 0.8, speed: 6.4, attackRange: 1.8, attackRate: 1.2,
    scale: 0.7, tint: 0x8a6a4a, dropTier: 0, xp: 8,
    barks: ['*happy growling*', '*ANGRY happy growling*', '*sound of teeth having a good time*'],
    weight: 30,
  },
  rustpunk: {
    id: 'rustpunk', name: 'Rust Punk', badassName: 'Big Damn Punk',
    behavior: 'gunner',
    flesh: 1, shield: 0, armor: 0,
    hpMult: 1.0, damageMult: 1.0, speed: 3.6, attackRange: 16, attackRate: 0.9,
    scale: 1.0, tint: 0x9c6a3a, dropTier: 0, xp: 12,
    barks: ['Fresh meat for the Pile!', 'I called dibs on yer boots!', 'You look like money!', 'The Rust takes all!', 'My gun’s held together with SPIT!'],
    projectile: { speed: 30, element: 'kinetic' },
    weight: 30,
  },
  shieldhead: {
    id: 'shieldhead', name: 'Shieldhead', badassName: 'Big Damn Shieldhead',
    behavior: 'gunner',
    flesh: 0.55, shield: 0.45, armor: 0,
    hpMult: 1.3, damageMult: 1.0, speed: 3.2, attackRange: 14, attackRate: 0.8,
    scale: 1.05, tint: 0x4a6a8a, dropTier: 1, xp: 18,
    barks: ['Can’t touch THIS bubble!', 'Shield’s at a hundred and SMUG percent!', 'Static tickles!'],
    projectile: { speed: 32, element: 'volt' },
    weight: 14,
  },
  boilerbruiser: {
    id: 'boilerbruiser', name: 'Boiler Bruiser', badassName: 'Big Damn Bruiser',
    behavior: 'brute',
    flesh: 0.4, shield: 0, armor: 0.6,
    hpMult: 2.6, damageMult: 1.6, speed: 2.6, attackRange: 2.4, attackRate: 0.6,
    scale: 1.5, tint: 0x6a5a4a, dropTier: 1, xp: 30,
    barks: ['*sound of a furnace with opinions*', 'I AM THE WALL!', 'Boiler’s HOT, meat’s SOFT!'],
    weight: 8,
  },
  lobber: {
    id: 'lobber', name: 'Grease Lobber', badassName: 'Big Damn Lobber',
    behavior: 'lobber',
    flesh: 1, shield: 0, armor: 0,
    hpMult: 0.9, damageMult: 1.3, speed: 3.0, attackRange: 18, attackRate: 0.4,
    scale: 0.95, tint: 0x7a8a3a, dropTier: 1, xp: 16,
    barks: ['CATCH!', 'Delivery feeee!', 'It’s raining GREASE, hallelujah!'],
    projectile: { speed: 16, element: 'ember' },
    weight: 10,
  },
};

export const MINIBOSS: EnemyDef = {
  id: 'gutterball', name: 'Grand Duke Gutterball', badassName: 'Grand Duke Gutterball',
  behavior: 'brute',
  flesh: 0.35, shield: 0.25, armor: 0.4,
  hpMult: 14, damageMult: 2.2, speed: 3.4, attackRange: 3.0, attackRate: 0.7,
  scale: 2.3, tint: 0x8a3a5a, dropTier: 3, xp: 250,
  barks: ['KNEEL BEFORE TRASH ROYALTY!', 'I taxed this gully FAIR and SQUARE!', 'My crown! Is! LOAD-BEARING!', 'You’re littering! In MY kingdom!'],
  weight: 0,
};

export const ENEMY_LIST = Object.values(ENEMIES);

/** Chance a spawn is promoted to a Badass (bigger, meaner, better loot). */
export const BADASS_CHANCE = 0.06;
export const BADASS_HP_MULT = 4;
export const BADASS_DMG_MULT = 1.7;
export const BADASS_SCALE = 1.45;
