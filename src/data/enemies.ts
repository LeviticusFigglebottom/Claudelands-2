// Enemy archetypes — pass 2. Two factions: the RUSTBORN scrap-cult and the
// HELIX COMBINE's automated security. Each row sets AI behavior, defense
// layers, silhouette params, barks, and drop tier. Badass variants are
// generated from these by scaling; bosses get their own pattern logic in
// game/boss.ts but their stat rows live here.

import type { ElementId } from '../game/types';

export type EnemyBehavior = 'rusher' | 'gunner' | 'lobber' | 'brute' | 'flyer' | 'suicide';
export type Faction = 'rustborn' | 'helix' | 'frostborn' | 'kindled' | 'verdant' | 'brine' | 'hollow' | 'vitrified';

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

// ------------------------------------------------------------- THE DROWNED (brine)
// Shipwreck Shallows: the hauler PELICAN's crew never stopped working the
// cargo — they just stopped needing air. Barnacled deckhands, harpooneers,
// tide-chanting mates, plus the local wildlife that got a taste for them.
ENEMIES.brine_husk = {
  id: 'brine_husk', name: 'Brine Husk', badassName: 'Big Damn Deckhand',
  faction: 'brine', behavior: 'rusher',
  flesh: 1, shield: 0, armor: 0.2,
  hpMult: 1.1, damageMult: 1.05, speed: 5.2, attackRange: 2.0, attackRate: 1.0, aggroRange: 26,
  scale: 1.0, tint: 0x5a8a82, dropTier: 0, xp: 16,
  barks: ['*wet, committed gurgling*', 'Shift... isn’t... OVER...', 'Back... to... WORK...', '*the sound of a lung with tenure*'],
  weight: 30,
};
ENEMIES.harpooneer = {
  id: 'harpooneer', name: 'Harpooneer', badassName: 'Big Damn Harpooneer',
  faction: 'brine', behavior: 'gunner',
  flesh: 1, shield: 0, armor: 0,
  hpMult: 1.05, damageMult: 1.2, speed: 3.3, attackRange: 18, attackRate: 0.7, aggroRange: 28,
  scale: 1.0, tint: 0x4a7a8a, dropTier: 0, xp: 16,
  barks: ['Thar she WALKS!', 'First stick’s free! The rest cost BLOOD!', 'I never miss twice. Once, often!', 'The Admiral wants you FILED under C. For CHUM!'],
  projectile: { speed: 34, element: 'kinetic' },
  weight: 26,
};
ENEMIES.tidecaller = {
  id: 'tidecaller', name: 'Tidecaller', badassName: 'High Tidecaller',
  faction: 'brine', behavior: 'lobber',
  flesh: 1, shield: 0.55, armor: 0,
  hpMult: 1.2, damageMult: 1.15, speed: 3.0, attackRange: 20, attackRate: 0.55, aggroRange: 28,
  scale: 1.05, tint: 0x54a8c8, dropTier: 1, xp: 24,
  barks: ['The tide comes IN. You go UNDER.', 'The Undertow keeps the books now!', 'Every wave is a page of the LEDGER!', 'Wet is a PROMOTION!'],
  projectile: { speed: 17, element: 'rime', arc: true },
  weight: 15,
};
ENEMIES.snapjaw = {
  id: 'snapjaw', name: 'Snapjaw', badassName: 'Big Damn Snapjaw',
  faction: 'brine', behavior: 'rusher',
  flesh: 1, shield: 0, armor: 0.35,
  hpMult: 0.8, damageMult: 0.95, speed: 7.2, attackRange: 1.8, attackRate: 1.25, aggroRange: 28,
  scale: 0.7, tint: 0xd87a4a, dropTier: 0, xp: 12,
  barks: ['*castanet noises with intent*', '*a shell sprinting*', '*click click CLICK*'],
  weight: 22,
};
ENEMIES.gullwing = {
  id: 'gullwing', name: 'Gullwing', badassName: 'Big Damn Gull',
  faction: 'brine', behavior: 'flyer',
  flesh: 1, shield: 0, armor: 0,
  hpMult: 0.75, damageMult: 0.9, speed: 7.4, attackRange: 12, attackRate: 0.85, aggroRange: 30,
  scale: 0.85, tint: 0xe8e8e0, dropTier: 0, xp: 14,
  barks: ['MINE! MINE! MINE!', '*a seagull that has seen combat*', 'CHIPS?! CHIPS!!'],
  projectile: { speed: 26, element: 'kinetic' },
  weight: 16,
};
ENEMIES.anchor_hulk = {
  id: 'anchor_hulk', name: 'Anchor Hulk', badassName: 'Big Damn Anchorman',
  faction: 'brine', behavior: 'brute',
  flesh: 0.5, shield: 0, armor: 0.5,
  hpMult: 3.0, damageMult: 1.65, speed: 2.6, attackRange: 2.6, attackRate: 0.55, aggroRange: 22,
  scale: 1.6, tint: 0x6a7a72, dropTier: 1, xp: 38,
  barks: ['DROPPING ANCHOR!', '*chain noises, load-bearing*', 'The bottom of the sea says HI!'],
  weight: 9,
};

// ------------------------------------------------------------- THE UNDERGROWN (hollow)
// The Hollowdeep: whatever the old dig woke up, plus the dig crew that never
// came back up. Pale, patient, and extremely pro-tunnel.
ENEMIES.gloomstalker = {
  id: 'gloomstalker', name: 'Gloomstalker', badassName: 'Big Damn Gloom',
  faction: 'hollow', behavior: 'rusher',
  flesh: 1, shield: 0, armor: 0,
  hpMult: 1.0, damageMult: 1.1, speed: 6.6, attackRange: 2.0, attackRate: 1.1, aggroRange: 28,
  scale: 0.95, tint: 0xb8c0d8, dropTier: 0, xp: 16,
  barks: ['*too many knuckles cracking at once*', '*the dark, walking*', '*a hiss with excellent acoustics*'],
  weight: 30,
};
ENEMIES.shardcaster = {
  id: 'shardcaster', name: 'Shardcaster', badassName: 'Big Damn Shardcaster',
  faction: 'hollow', behavior: 'gunner', grenades: true,
  flesh: 1, shield: 0, armor: 0.2,
  hpMult: 1.1, damageMult: 1.1, speed: 3.4, attackRange: 17, attackRate: 0.85, aggroRange: 28,
  scale: 1.0, tint: 0x9aa8c8, dropTier: 0, xp: 17,
  barks: ['The Dig provides!', 'Sixty years on shift! NO BREAKS!', 'The Mother hums and we HAUL!', 'Fresh hands for the seam!'],
  projectile: { speed: 30, element: 'volt' },
  weight: 26,
};
ENEMIES.spitgrub = {
  id: 'spitgrub', name: 'Spitgrub', badassName: 'Big Damn Grub',
  faction: 'hollow', behavior: 'lobber',
  flesh: 1, shield: 0, armor: 0,
  hpMult: 1.15, damageMult: 1.2, speed: 2.8, attackRange: 20, attackRate: 0.55, aggroRange: 28,
  scale: 1.0, tint: 0xc8d86a, dropTier: 1, xp: 22,
  barks: ['*a stomach doing math*', '*ptooey, but industrial*', '*digestive ambition*'],
  projectile: { speed: 17, element: 'bile', arc: true },
  weight: 15,
};
ENEMIES.gravemite = {
  id: 'gravemite', name: 'Gravemite', badassName: 'Tomb Tick',
  faction: 'hollow', behavior: 'suicide',
  flesh: 0.6, shield: 0, armor: 0,
  hpMult: 0.4, damageMult: 2.0, speed: 8.0, attackRange: 2.0, attackRate: 1, aggroRange: 32,
  scale: 0.55, tint: 0x54d4ff, dropTier: 0, xp: 11,
  barks: ['*glowing louder*', '*a lightbulb’s last idea*', '*bzzzt-tick-tick-tick*'],
  weight: 14,
};
ENEMIES.lantern_wisp = {
  id: 'lantern_wisp', name: 'Lantern Wisp', badassName: 'Big Damn Lantern',
  faction: 'hollow', behavior: 'flyer',
  flesh: 0.4, shield: 0.6, armor: 0,
  hpMult: 0.85, damageMult: 1.0, speed: 5.6, attackRange: 14, attackRate: 1.0, aggroRange: 32,
  scale: 0.8, tint: 0x7ad8ff, dropTier: 1, xp: 18,
  barks: ['*a glow that noticed you*', '*flicker, flicker, AIM*', '*the light at the end of the tunnel, armed*'],
  projectile: { speed: 32, element: 'volt' },
  weight: 16,
};
ENEMIES.deep_roller = {
  id: 'deep_roller', name: 'Deep Roller', badassName: 'Big Damn Boulder',
  faction: 'hollow', behavior: 'brute',
  flesh: 0.35, shield: 0, armor: 0.65,
  hpMult: 3.2, damageMult: 1.7, speed: 2.8, attackRange: 2.5, attackRate: 0.55, aggroRange: 22,
  scale: 1.55, tint: 0x5a6478, dropTier: 1, xp: 40,
  barks: ['*geology, approaching*', '*plates grinding into an opinion*', '*the cave clearing its throat*'],
  weight: 9,
};

export const BOSS_ANCHORHEAD: EnemyDef = {
  id: 'admiral_anchorhead', name: 'ADMIRAL ANCHORHEAD', badassName: 'ADMIRAL ANCHORHEAD',
  faction: 'brine', behavior: 'brute',
  flesh: 0.45, shield: 0.15, armor: 0.4,
  hpMult: 32, damageMult: 2.2, speed: 3.2, attackRange: 3.4, attackRate: 0.75, aggroRange: 65,
  scale: 2.8, tint: 0x4a7a72, dropTier: 3, xp: 900,
  barks: ['ALL HANDS! WE HAVE A STOWAWAY!', 'The PELICAN never sank. She just CHANGED DEPARTMENTS.', 'I kept the manifest. YOU’RE ON IT NOW.', 'The sea gave me a second command. You get NONE.'],
  projectile: { speed: 30, element: 'kinetic' },
  weight: 0,
};

export const BOSS_MOTHERLODE: EnemyDef = {
  id: 'mother_lode', name: 'THE MOTHER LODE', badassName: 'THE MOTHER LODE',
  faction: 'hollow', behavior: 'brute',
  flesh: 0.3, shield: 0, armor: 0.7,
  hpMult: 44, damageMult: 2.4, speed: 3.0, attackRange: 3.6, attackRate: 0.75, aggroRange: 70,
  scale: 3.2, tint: 0x6a7898, dropTier: 3, xp: 1400,
  barks: ['the seam sings. YOU ARE OFF-KEY.', 'sixty years of tribute. you are TODAY’S.', 'dig. Dig. DIG.', 'the mountain owed me a body. it paid in CROWN.'],
  weight: 0,
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

// ---------------------------------------------------------------------------
// VITRA NULL — the VITRIFIED. The glass here grew opinions. Shardlings are
// shrapnel with legs, Prism Sentinels refract light into arguments, and
// Glasswings are windows that learned to dive.
ENEMIES.shardling = {
  id: 'shardling', name: 'Shardling', badassName: 'Big Damn Shard',
  faction: 'vitrified', behavior: 'rusher',
  flesh: 0.4, shield: 0, armor: 0.6,
  hpMult: 0.85, damageMult: 1.0, speed: 8.4, attackRange: 1.9, attackRate: 1.2, aggroRange: 30,
  scale: 0.7, tint: 0x7af0ff, dropTier: 0, xp: 16,
  barks: ['*a chandelier losing its temper*', '*tink tink TINK*', '*the sound of stepping on a wine glass, weaponized*'],
  weight: 24,
};
ENEMIES.prism_sentinel = {
  id: 'prism_sentinel', name: 'Prism Sentinel', badassName: 'Big Damn Prism',
  faction: 'vitrified', behavior: 'gunner',
  flesh: 0.3, shield: 0.7, armor: 0,
  hpMult: 1.05, damageMult: 1.1, speed: 4.6, attackRange: 26, attackRate: 0.9, aggroRange: 34,
  scale: 1.05, tint: 0xc06bff, dropTier: 1, xp: 24,
  barks: ['REFRACTING.', 'The light BENDS for us.', 'ANGLE OF INCIDENCE: you.'],
  projectile: { speed: 30, element: 'volt' },
  weight: 14,
};
ENEMIES.glasswing = {
  id: 'glasswing', name: 'Glasswing', badassName: 'Big Damn Pane',
  faction: 'vitrified', behavior: 'flyer',
  flesh: 0.8, shield: 0.2, armor: 0,
  hpMult: 0.8, damageMult: 0.95, speed: 7.8, attackRange: 13, attackRate: 0.8, aggroRange: 32,
  scale: 0.9, tint: 0xbfe0ff, dropTier: 0, xp: 18,
  barks: ['*a stained-glass window with a grudge*', '*shhhhing*', '*the sky, chiming*'],
  projectile: { speed: 27, element: 'rime' },
  weight: 15,
};

// ---- THE UNLIT MILE: what two hundred years of dead lamplight breeds.
// Wicklings are the flames the Snuffed Rows lost, still looking for a
// socket; Knells are cracked street-lamp bells that toll their own
// shrapnel; Cullet Hulks are the sweepings, self-assembled and rude.
ENEMIES.wickling = {
  id: 'wickling', name: 'Wickling', badassName: 'Big Damn Candle',
  faction: 'vitrified', behavior: 'suicide',
  flesh: 0.5, shield: 0, armor: 0,
  hpMult: 0.4, damageMult: 2.1, speed: 8.6, attackRange: 2.0, attackRate: 1, aggroRange: 32,
  scale: 0.5, tint: 0x9a6aff, dropTier: 0, xp: 14,
  barks: ['*a flame remembering its lamp*', '*guttering, approaching*', '*the hiss of a wick with a plan*'],
  weight: 18,
};
ENEMIES.knell = {
  id: 'knell', name: 'Knell', badassName: 'Big Damn Bell',
  faction: 'vitrified', behavior: 'lobber',
  flesh: 0.2, shield: 0.3, armor: 0.5,
  hpMult: 1.25, damageMult: 1.25, speed: 2.9, attackRange: 21, attackRate: 0.55, aggroRange: 30,
  scale: 1.1, tint: 0x6a5adf, dropTier: 1, xp: 26,
  barks: ['*a toll you feel in your teeth*', '*the hour, striking back*', '*DONG, with intent*'],
  projectile: { speed: 17, element: 'rime', arc: true },
  weight: 12,
};
ENEMIES.cullet_hulk = {
  id: 'cullet_hulk', name: 'Cullet Hulk', badassName: 'Big Damn Sweepings',
  faction: 'vitrified', behavior: 'brute',
  flesh: 0.3, shield: 0, armor: 0.7,
  hpMult: 3.1, damageMult: 1.7, speed: 2.9, attackRange: 2.6, attackRate: 0.55, aggroRange: 24,
  scale: 1.6, tint: 0x4a3e7a, dropTier: 1, xp: 40,
  barks: ['*a rockslide made of windows*', 'THE MILE TAKES ITS TOLL!', '*every broken thing, standing up at once*'],
  weight: 8,
};

export const BOSS_UNKEEPER: EnemyDef = {
  id: 'unkeeper', name: 'THE UNKEEPER', badassName: 'THE UNKEEPER',
  faction: 'vitrified', behavior: 'brute',
  flesh: 0.35, shield: 0.2, armor: 0.45,
  hpMult: 38, damageMult: 2.4, speed: 3.1, attackRange: 3.4, attackRate: 0.75, aggroRange: 68,
  scale: 2.9, tint: 0x241c40, dropTier: 3, xp: 1600,
  barks: ['I KEPT THE DARK. NOW THE DARK KEEPS ME.', 'the light asked TOO MUCH.', 'TWO HUNDRED YEARS OF QUIET. AND THEN YOU.', 'my lamp is out. COME CLOSER.'],
  projectile: { speed: 24, element: 'volt', arc: true },
  weight: 0,
};
