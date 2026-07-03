// Enemy archetypes — pass 2. Two factions: the RUSTBORN scrap-cult and the
// HELIX COMBINE's automated security. Each row sets AI behavior, defense
// layers, silhouette params, barks, and drop tier. Badass variants are
// generated from these by scaling; bosses get their own pattern logic in
// game/boss.ts but their stat rows live here.

import type { ElementId } from '../game/types';

export type EnemyBehavior = 'rusher' | 'gunner' | 'lobber' | 'brute' | 'flyer' | 'suicide';
export type Faction = 'rustborn' | 'helix' | 'frostborn' | 'kindled' | 'verdant';

export interface EnemyDef {
  id: string;
  name: string;
  badassName: string;
  faction: Faction;
  behavior: EnemyBehavior;
  flesh: number;
  shield: number;
  armor: number;
  hpMult: number;
  damageMult: number;
  speed: number;
  attackRange: number;
  attackRate: number;
  aggroRange: number;
  scale: number;
  tint: number;
  dropTier: number;          // 0 trash, 1 tough, 2 badass, 3 boss
  xp: number;
  barks: string[];
  projectile?: { speed: number; element: ElementId; arc?: boolean };
  /** Ranged troops that carry frag grenades — they flush out campers. */
  grenades?: boolean;
  weight: number;
}

export const ENEMIES: Record<string, EnemyDef> = {
  // ------------------------------------------------------------- RUSTBORN
  scrapmutt: {
    id: 'scrapmutt', name: 'Scrap Mutt', badassName: 'Big Damn Mutt',
    faction: 'rustborn', behavior: 'rusher',
    flesh: 1, shield: 0, armor: 0,
    hpMult: 0.6, damageMult: 0.8, speed: 6.6, attackRange: 1.8, attackRate: 1.2, aggroRange: 24,
    scale: 0.7, tint: 0x8a6a4a, dropTier: 0, xp: 8,
    barks: ['*happy growling*', '*ANGRY happy growling*', '*sound of teeth having a good time*'],
    weight: 30,
  },
  rustpunk: {
    id: 'rustpunk', name: 'Rust Punk', badassName: 'Big Damn Punk',
    faction: 'rustborn', behavior: 'gunner',
    flesh: 1, shield: 0, armor: 0,
    hpMult: 1.0, damageMult: 1.0, speed: 3.6, attackRange: 16, attackRate: 0.9, aggroRange: 26,
    scale: 1.0, tint: 0x9c6a3a, dropTier: 0, xp: 12,
    barks: ['Fresh meat for the Pile!', 'I called dibs on yer boots!', 'You look like money!', 'The Rust takes all!', 'My gun’s held together with SPIT!'],
    projectile: { speed: 30, element: 'kinetic' },
    weight: 30,
  },
  shieldhead: {
    id: 'shieldhead', name: 'Shieldhead', badassName: 'Big Damn Shieldhead',
    faction: 'rustborn', behavior: 'gunner', grenades: true,
    flesh: 0.55, shield: 0.45, armor: 0,
    hpMult: 1.3, damageMult: 1.0, speed: 3.2, attackRange: 14, attackRate: 0.8, aggroRange: 26,
    scale: 1.05, tint: 0x4a6a8a, dropTier: 1, xp: 18,
    barks: ['Can’t touch THIS bubble!', 'Shield’s at a hundred and SMUG percent!', 'Static tickles!'],
    projectile: { speed: 32, element: 'volt' },
    weight: 14,
  },
  boilerbruiser: {
    id: 'boilerbruiser', name: 'Boiler Bruiser', badassName: 'Big Damn Bruiser',
    faction: 'rustborn', behavior: 'brute',
    flesh: 0.4, shield: 0, armor: 0.6,
    hpMult: 2.6, damageMult: 1.6, speed: 2.7, attackRange: 2.4, attackRate: 0.6, aggroRange: 22,
    scale: 1.5, tint: 0x6a5a4a, dropTier: 1, xp: 30,
    barks: ['*sound of a furnace with opinions*', 'I AM THE WALL!', 'Boiler’s HOT, meat’s SOFT!'],
    weight: 8,
  },
  lobber: {
    id: 'lobber', name: 'Grease Lobber', badassName: 'Big Damn Lobber',
    faction: 'rustborn', behavior: 'lobber',
    flesh: 1, shield: 0, armor: 0,
    hpMult: 0.9, damageMult: 1.3, speed: 3.0, attackRange: 18, attackRate: 0.4, aggroRange: 28,
    scale: 0.95, tint: 0x7a8a3a, dropTier: 1, xp: 16,
    barks: ['CATCH!', 'Delivery feeee!', 'It’s raining GREASE, hallelujah!'],
    projectile: { speed: 16, element: 'ember', arc: true },
    weight: 10,
  },
  pyrepunk: {
    id: 'pyrepunk', name: 'Pyre Punk', badassName: 'Big Damn Pyre',
    faction: 'rustborn', behavior: 'gunner',
    flesh: 1, shield: 0, armor: 0,
    hpMult: 1.1, damageMult: 1.15, speed: 3.8, attackRange: 13, attackRate: 1.1, aggroRange: 26,
    scale: 1.0, tint: 0xa84a24, dropTier: 1, xp: 16,
    barks: ['Burn deposit! Non-refundable!', 'The Rust said: MAKE IT CRISPY!', 'Smells like promotion!'],
    projectile: { speed: 26, element: 'ember' },
    weight: 12,
  },
  fusebug: {
    id: 'fusebug', name: 'Fusebug', badassName: 'Big Damn Fusebug',
    faction: 'rustborn', behavior: 'suicide',
    flesh: 0.5, shield: 0, armor: 0,
    hpMult: 0.35, damageMult: 2.2, speed: 8.2, attackRange: 2.2, attackRate: 1, aggroRange: 30,
    scale: 0.55, tint: 0xc8b428, dropTier: 0, xp: 10,
    barks: ['*escalating beeping*', '*the sound of bad decisions accelerating*', 'HUGS!!!'],
    weight: 12,
  },
  // ------------------------------------------------------------- HELIX COMBINE
  helix_drone: {
    id: 'helix_drone', name: 'Helix Survey Drone', badassName: 'Helix Audit Drone',
    faction: 'helix', behavior: 'flyer',
    flesh: 0.35, shield: 0.65, armor: 0,
    hpMult: 0.9, damageMult: 1.0, speed: 5.2, attackRange: 15, attackRate: 1.1, aggroRange: 30,
    scale: 0.8, tint: 0xe8e4da, dropTier: 1, xp: 16,
    barks: ['UNSCHEDULED BIOMASS DETECTED.', 'YOUR TRESPASS HAS BEEN INVOICED.', 'SMILE FOR VALUATION.'],
    projectile: { speed: 34, element: 'volt' },
    weight: 22,
  },
  helix_stinger: {
    id: 'helix_stinger', name: 'Helix Stinger', badassName: 'Helix Enforcement Stinger',
    faction: 'helix', behavior: 'rusher',
    flesh: 0.4, shield: 0.6, armor: 0,
    hpMult: 0.8, damageMult: 1.2, speed: 7.0, attackRange: 2.0, attackRate: 1.3, aggroRange: 28,
    scale: 0.85, tint: 0x2ba8a0, dropTier: 1, xp: 15,
    barks: ['COMPLIANCE VIA STABBING.', 'THIS HURTS YOU MORE THAN ME. VERIFIED.', '*corporate skittering*'],
    weight: 16,
  },
  lattice_warden: {
    id: 'lattice_warden', name: 'Lattice Warden', badassName: 'Lattice Warden PLUS',
    faction: 'helix', behavior: 'gunner', grenades: true,
    flesh: 0.25, shield: 0.15, armor: 0.6,
    hpMult: 2.8, damageMult: 1.5, speed: 2.4, attackRange: 18, attackRate: 0.55, aggroRange: 30,
    scale: 1.6, tint: 0xc8c4ba, dropTier: 2, xp: 34,
    barks: ['ASSET DENIAL IN PROGRESS.', 'YOU ARE STANDING IN COMPANY AIR.', 'DEPLOYING CUSTOMER SERVICE.'],
    projectile: { speed: 24, element: 'blast' },
    weight: 8,
  },
  // ------------------------------------------------------------- FROSTBORN
  snowmad: {
    id: 'snowmad', name: 'Snowmad', badassName: 'Big Damn Snowmad',
    faction: 'frostborn', behavior: 'gunner', grenades: true,
    flesh: 1, shield: 0, armor: 0,
    hpMult: 1.15, damageMult: 1.1, speed: 3.5, attackRange: 15, attackRate: 0.9, aggroRange: 26,
    scale: 1.05, tint: 0x5a7a9a, dropTier: 0, xp: 14,
    barks: ['The cold keeps what it catches!', 'Yer coat! I claim yer COAT!', 'Winter voted, and you LOST!', 'Fresh meat! Pre-chilled!'],
    projectile: { speed: 30, element: 'kinetic' },
    weight: 28,
  },
  frostmutt: {
    id: 'frostmutt', name: 'Frostbite Mutt', badassName: 'Big Damn Frostmutt',
    faction: 'frostborn', behavior: 'rusher',
    flesh: 1, shield: 0, armor: 0,
    hpMult: 0.7, damageMult: 0.9, speed: 6.8, attackRange: 1.8, attackRate: 1.2, aggroRange: 26,
    scale: 0.75, tint: 0xb8d0dc, dropTier: 0, xp: 10,
    barks: ['*frosty happy growling*', '*sound of icicle teeth*', '*a sneeze, but menacing*'],
    weight: 26,
  },
  icicle_lobber: {
    id: 'icicle_lobber', name: 'Icicle Lobber', badassName: 'Big Damn Icicler',
    faction: 'frostborn', behavior: 'lobber',
    flesh: 1, shield: 0, armor: 0,
    hpMult: 1.0, damageMult: 1.3, speed: 3.0, attackRange: 18, attackRate: 0.4, aggroRange: 28,
    scale: 0.95, tint: 0x8ab4cc, dropTier: 1, xp: 18,
    barks: ['CATCH! IT’S POINTY!', 'Hail delivery! Extra hail!', 'Compliments of the Hollow!'],
    projectile: { speed: 16, element: 'rime', arc: true },
    weight: 12,
  },
  frost_shrike: {
    id: 'frost_shrike', name: 'Frost Shrike', badassName: 'Big Damn Shrike',
    faction: 'frostborn', behavior: 'flyer',
    flesh: 0.7, shield: 0.3, armor: 0,
    hpMult: 0.9, damageMult: 1.05, speed: 5.4, attackRange: 14, attackRate: 1.0, aggroRange: 30,
    scale: 0.8, tint: 0xd8e8f0, dropTier: 1, xp: 17,
    barks: ['*a shriek like skates on bad ice*', '*wings made of winter*', '*SKREE, but colder*'],
    projectile: { speed: 32, element: 'rime' },
    weight: 20,
  },
  avalanche_bruiser: {
    id: 'avalanche_bruiser', name: 'Avalanche Bruiser', badassName: 'Big Damn Avalanche',
    faction: 'frostborn', behavior: 'brute',
    flesh: 0.45, shield: 0, armor: 0.55,
    hpMult: 2.8, damageMult: 1.6, speed: 2.7, attackRange: 2.4, attackRate: 0.6, aggroRange: 22,
    scale: 1.55, tint: 0x9ab4c8, dropTier: 1, xp: 34,
    barks: ['I AM THE WEATHER!', '*glacial cracking noises*', 'The mountain sent me PERSONALLY!'],
    weight: 8,
  },
  // ------------------------------------------------------------- THE KINDLED
  ashwalker: {
    id: 'ashwalker', name: 'Ashwalker', badassName: 'Big Damn Ashwalker',
    faction: 'kindled', behavior: 'gunner', grenades: true,
    flesh: 1, shield: 0, armor: 0,
    hpMult: 1.2, damageMult: 1.15, speed: 3.6, attackRange: 15, attackRate: 0.95, aggroRange: 27,
    scale: 1.05, tint: 0x5a4038, dropTier: 0, xp: 16,
    barks: ['The Furnace sees you, fuel!', 'Burn bright, burn BRIEF!', 'Yer ashes will feed the Saint!', 'Kindling! KINDLING!'],
    projectile: { speed: 28, element: 'ember' },
    weight: 26,
  },
  ash_shrike: {
    id: 'ash_shrike', name: 'Ash Shrike', badassName: 'Big Damn Cinder Shrike',
    faction: 'kindled', behavior: 'flyer',
    flesh: 0.75, shield: 0.25, armor: 0,
    hpMult: 0.95, damageMult: 1.1, speed: 5.4, attackRange: 14, attackRate: 1.0, aggroRange: 30,
    scale: 0.8, tint: 0x8a5a3a, dropTier: 1, xp: 18,
    barks: ['*a shriek full of sparks*', '*wings trailing smoke*', '*SKREE, but flammable*'],
    projectile: { speed: 32, element: 'ember' },
    weight: 16,
  },
  cinderhulk: {
    id: 'cinderhulk', name: 'Cinderhulk', badassName: 'Big Damn Cinderhulk',
    faction: 'kindled', behavior: 'brute',
    flesh: 0.4, shield: 0, armor: 0.6,
    hpMult: 3.0, damageMult: 1.7, speed: 2.8, attackRange: 2.5, attackRate: 0.6, aggroRange: 22,
    scale: 1.6, tint: 0x4a3a34, dropTier: 1, xp: 38,
    barks: ['I AM PRE-HEATED!', '*sound of a walking bonfire*', 'The Saint breathes through ME!'],
    weight: 9,
  },
};

// ------------------------------------------------------------------ bosses
export const BOSS_GUTTERBALL: EnemyDef = {
  id: 'gutterball', name: 'Grand Duke Gutterball', badassName: 'Grand Duke Gutterball',
  faction: 'rustborn', behavior: 'brute',
  flesh: 0.45, shield: 0.15, armor: 0.4,
  hpMult: 22, damageMult: 2.0, speed: 3.6, attackRange: 3.2, attackRate: 0.8, aggroRange: 60,
  scale: 2.4, tint: 0x8a3a5a, dropTier: 3, xp: 400,
  barks: ['KNEEL BEFORE TRASH ROYALTY!', 'I taxed this gully FAIR and SQUARE!', 'My crown! Is! LOAD-BEARING!', 'You’re littering! In MY kingdom!'],
  weight: 0,
};

export const BOSS_WARDEN: EnemyDef = {
  id: 'warden_prime', name: 'HX-1 WARDEN PRIME', badassName: 'HX-1 WARDEN PRIME',
  faction: 'helix', behavior: 'brute',
  flesh: 0.3, shield: 0.3, armor: 0.4,
  hpMult: 34, damageMult: 2.4, speed: 2.6, attackRange: 4.5, attackRate: 0.7, aggroRange: 70,
  scale: 3.1, tint: 0xe8e4da, dropTier: 3, xp: 800,
  barks: ['SITE CLEANUP: INITIATED.', 'YOUR WARRANTY DOES NOT COVER THIS.', 'CALCULATING ACCEPTABLE LOSSES: YOU.', 'THANK YOU FOR CHOOSING HELIX.'],
  projectile: { speed: 22, element: 'blast', arc: true },
  weight: 0,
};

export const BOSS_AVALANCHE: EnemyDef = {
  id: 'old_man_avalanche', name: 'OLD MAN AVALANCHE', badassName: 'OLD MAN AVALANCHE',
  faction: 'frostborn', behavior: 'brute',
  flesh: 0.5, shield: 0, armor: 0.5,
  hpMult: 30, damageMult: 2.3, speed: 3.4, attackRange: 3.4, attackRate: 0.8, aggroRange: 65,
  scale: 2.7, tint: 0xcfe0ec, dropTier: 3, xp: 700,
  barks: ['WINTER TAKES ITS TIME. I DON’T.', 'I buried better hikers than you!', 'The Hollow feeds ME first!', 'Hear that rumble? That’s FAMILY.'],
  weight: 0,
};

export const BOSS_FURNACE: EnemyDef = {
  id: 'saint_furnace', name: 'SAINT FURNACE', badassName: 'SAINT FURNACE',
  faction: 'kindled', behavior: 'brute',
  flesh: 0.35, shield: 0, armor: 0.65,
  hpMult: 40, damageMult: 2.5, speed: 3.2, attackRange: 3.6, attackRate: 0.8, aggroRange: 70,
  scale: 3.0, tint: 0x4a3a34, dropTier: 3, xp: 1200,
  barks: ['THE FURNACE ACCEPTS ALL DONATIONS.', 'YOU ARRIVE PRE-SEASONED. THOUGHTFUL.', 'MY CONGREGATION BURNS FOR YOU. LITERALLY.', 'ASH TO ASH. YOU FIRST.'],
  weight: 0,
};

// ------------------------------------------------------------- VERDANT
// Veldt Minor's crazed tribals: masked stalkers, blowdart lurkers, chanting
// shamans, totem-hauling bruisers, spore bombs, and razor-billed birds.
ENEMIES.frond_stalker = {
  id: 'frond_stalker', name: 'Frond Stalker', badassName: 'Big Damn Stalker',
  faction: 'verdant', behavior: 'rusher',
  flesh: 1, shield: 0, armor: 0,
  hpMult: 0.9, damageMult: 1.0, speed: 6.2, attackRange: 2.0, attackRate: 1.1, aggroRange: 26,
  scale: 0.95, tint: 0x3a7a3a, dropTier: 0, xp: 14,
  barks: ['The canopy HUNGERS!', 'Skin for the garden!', '*enthusiastic leaf noises*', 'You smell DELICIOUS and WRONG!'],
  weight: 30,
};
ENEMIES.dartlurker = {
  id: 'dartlurker', name: 'Dart Lurker', badassName: 'Big Damn Lurker',
  faction: 'verdant', behavior: 'gunner',
  flesh: 1, shield: 0, armor: 0,
  hpMult: 1.0, damageMult: 1.0, speed: 3.4, attackRange: 17, attackRate: 0.85, aggroRange: 27,
  scale: 1.0, tint: 0x4a8a4a, dropTier: 0, xp: 15,
  barks: ['Pfft. Pfft. PFFT!', 'The frog told me your NAME!', 'Hold still, the dart is SHY!', 'Green takes you!'],
  projectile: { speed: 26, element: 'bile' },
  weight: 28,
};
ENEMIES.shaman = {
  id: 'shaman', name: 'Grove Shaman', badassName: 'High Shaman',
  faction: 'verdant', behavior: 'lobber',
  flesh: 1, shield: 0.6, armor: 0,
  hpMult: 1.2, damageMult: 1.15, speed: 3.0, attackRange: 20, attackRate: 0.6, aggroRange: 28,
  scale: 1.05, tint: 0x5a9a3a, dropTier: 1, xp: 22,
  barks: ['The bloom demands MULCH!', 'Chant with me or BE the chant!', 'Your bones will make EXCELLENT trellis!', 'GROW! GROW! GROW!'],
  projectile: { speed: 18, element: 'bile', arc: true },
  weight: 16,
};
ENEMIES.totem_bruiser = {
  id: 'totem_bruiser', name: 'Totem Hauler', badassName: 'Idol-Bearer',
  faction: 'verdant', behavior: 'brute',
  flesh: 1, shield: 0, armor: 0.8,
  hpMult: 2.6, damageMult: 1.5, speed: 2.6, attackRange: 2.6, attackRate: 0.55, aggroRange: 24,
  scale: 1.5, tint: 0x6a8a4a, dropTier: 1, xp: 34,
  barks: ['THE TOTEM SPEAKS THROUGH ME!', 'HEAVY IS THE FAITH!', '*wooden creaking, but angry*'],
  weight: 12,
};
ENEMIES.sporeling = {
  id: 'sporeling', name: 'Sporeling', badassName: 'Bloom Bomb',
  faction: 'verdant', behavior: 'suicide',
  flesh: 1, shield: 0, armor: 0,
  hpMult: 0.5, damageMult: 1.6, speed: 7.2, attackRange: 1.6, attackRate: 1, aggroRange: 30,
  scale: 0.6, tint: 0x9adc4a, dropTier: 0, xp: 10,
  barks: ['*giggling puffball sounds*', '*the smell of mushrooms, weaponized*'],
  weight: 16,
};
ENEMIES.razorbeak = {
  id: 'razorbeak', name: 'Razorbeak', badassName: 'Big Damn Bird',
  faction: 'verdant', behavior: 'flyer',
  flesh: 1, shield: 0, armor: 0,
  hpMult: 0.8, damageMult: 0.9, speed: 7.6, attackRange: 12, attackRate: 0.8, aggroRange: 30,
  scale: 0.9, tint: 0xff6a4a, dropTier: 0, xp: 16,
  barks: ['*a parrot repeating your last scream*', 'PRETTY BIRD! PRETTY VIOLENT BIRD!'],
  projectile: { speed: 24, element: 'kinetic' },
  weight: 14,
};

ENEMIES.strangler = {
  id: 'strangler', name: 'Vine Strangler', badassName: 'Old Growth',
  faction: 'verdant', behavior: 'rusher',
  flesh: 1, shield: 0, armor: 0.4,
  hpMult: 1.8, damageMult: 1.3, speed: 5.2, attackRange: 2.4, attackRate: 0.8, aggroRange: 26,
  scale: 1.3, tint: 0x2f6a30, dropTier: 1, xp: 26,
  barks: ['*creaking, closing in*', 'The Tangle wants a HUG.', 'Rooted? No. YOU will be.'],
  weight: 18,
};
ENEMIES.thorn_hurler = {
  id: 'thorn_hurler', name: 'Thorn Hurler', badassName: 'Pincushion Prime',
  faction: 'verdant', behavior: 'lobber',
  flesh: 1, shield: 0, armor: 0,
  hpMult: 1.1, damageMult: 1.2, speed: 3.2, attackRange: 21, attackRate: 0.65, aggroRange: 28,
  scale: 1.05, tint: 0x6a9a2a, dropTier: 1, xp: 24,
  barks: ['Catch! With your FACE!', 'The garden shares its POINTIER blessings!', '*the sound of a hedge losing its temper*'],
  projectile: { speed: 19, element: 'bile', arc: true },
  weight: 14,
};

export const BOSS_BLOOM: EnemyDef = {
  id: 'bloom_mother', name: 'The Bloom Mother', badassName: 'The Bloom Mother',
  faction: 'verdant', behavior: 'brute',
  flesh: 1, shield: 0, armor: 0.6,
  hpMult: 26, damageMult: 1.9, speed: 2.5, attackRange: 3.2, attackRate: 0.5, aggroRange: 60,
  scale: 3.1, tint: 0x3f8a3f, dropTier: 3, xp: 660,
  barks: ['MY GARDEN. MY GUESTS. MY MULCH.', 'BLOOM FOR ME.', 'the petals part. the petals JUDGE.'],
  weight: 0,
};

export const ENEMY_LIST = Object.values(ENEMIES);

export const BADASS_CHANCE = 0.06;
export const BADASS_HP_MULT = 4;
export const BADASS_DMG_MULT = 1.7;
export const BADASS_SCALE = 1.45;
