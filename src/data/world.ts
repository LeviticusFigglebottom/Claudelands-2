// The Claudelands world registry — pass 3. Multiple maps, each a WorldDef:
// districts, POIs, biome palette (feeds the same procedural texture system),
// and analytic terrain parameters. terrainHeight()/districtAt()/roadFactor()
// read the ACTIVE map, so every system keeps calling the same functions
// across map switches. Adding a map = adding a def here + district dressing
// tags that game/world.ts knows how to build.

import { clamp01, lerp } from '../util/maff';

export type DistrictDress = 'hub' | 'fort' | 'boneyard' | 'slagflats' | 'throne' | 'frosthub' | 'pinebreak' | 'fathom' | 'icebox' | 'throatgate' | 'cindercamp' | 'ashflats' | 'kilnyard' | 'foundrycourt' | 'brassplaza' | 'crucible' | 'porttown' | 'verdantcamp' | 'grove' | 'jungle' | 'gulchgate' | 'shipbreak' | 'castaway' | 'hullgrave' | 'brinepans' | 'anchorage' | 'cavemouth' | 'gloomgrove' | 'cryptworks' | 'lodecourt';

export interface DistrictDef {
  id: string;
  name: string;
  subtitle: string;
  dress: DistrictDress;
  cx: number; cz: number; radius: number;
  baseHeight: number;
  faction: 'rustborn' | 'helix' | 'frostborn' | 'kindled' | 'verdant' | 'brine' | 'hollow' | 'none';
  spawnTable: { enemyId: string; weight: number }[];
  maxAlive: number;
  respawnDelay: number;
  levelOffset: number;
}

export interface WorldPoi {
  id: string;
  kind: 'chest' | 'vendor_gun' | 'vendor_med' | 'fast_travel' | 'wirelog' | 'npc' | 'gate' | 'sign' | 'ship' | 'wreck' | 'racer' | 'buggy' | 'pit';
  x: number; z: number; rot?: number;
  data?: string;
}

export interface BiomeDef {
  ground: { base: string; light: string; dark: string; crack: string };
  rock: string;
  scrub: number;               // scrub tuft color
  ambientParticle: 'dust' | 'snow' | 'ash' | 'spore';
  trees: 'cactus' | 'pine' | 'burnt' | 'palm' | 'mushroom';
  aurora: boolean;
  weeds: boolean;              // tumbleweeds roam
}

export interface WorldDef {
  id: string;
  name: string;
  tagline: string;             // biome-entry title card subtext
  size: number;
  skyTop: number; skyHorizon: number;
  sun: { color: number; intensity: number; dirX: number; dirY: number; dirZ: number };
  ambient: { sky: number; ground: number; intensity: number };
  fog: { color: number; near: number; far: number };
  biome: BiomeDef;
  terrain: {
    duneAmp: number;
    roughAmp: number;
    roads: { x0: number; z0: number; x1: number; z1: number }[];
    crater?: { x: number; z: number; r: number };
    lake?: { x: number; z: number; r: number; level: number };
    /** Linear-level support: walkable serpentine corridor; outside it the
     *  terrain rises into impassable ridge walls. */
    corridor?: { pts: { x: number; z: number }[]; width: number; arenas: { x: number; z: number; r: number }[]; wallHeight: number };
    /** Analytic mounds applied AFTER road flattening: small ones are jump
     *  ramps on the racing line, tall ones are guide mesas walling a route. */
    bumps?: { x: number; z: number; r: number; h: number }[];
  };
  districts: DistrictDef[];
  pois: WorldPoi[];
  spawn: { x: number; z: number };
  /** BL2-style walk-off zone transitions at the map's edges. */
  exits?: ZoneExit[];
}

export interface ZoneExit {
  x: number; z: number;
  targetMap: string;
  targetX: number; targetZ: number;
  label: string;               // the zone you're walking INTO
  /** How the entry is dressed in-world (default: scrap arch). */
  style?: 'arch' | 'cave' | 'thicket' | 'beach';
  /** Future map: the entry exists but shows this line instead of travelling. */
  sealed?: string;
}

// ===========================================================================
// MAP 1 — THE CLAUDELANDS (sun-blasted scrap canyon)
export const CLAUDELANDS: WorldDef = {
  id: 'claudelands',
  name: 'THE CLAUDELANDS',
  tagline: 'rust never sleeps. neither do the guns.',
  size: 260,
  skyTop: 0x3f7ac8,
  skyHorizon: 0xd8b070,
  sun: { color: 0xffe8c0, intensity: 2.6, dirX: -0.55, dirY: 0.8, dirZ: 0.3 },
  ambient: { sky: 0x9ab4d8, ground: 0x8a6a48, intensity: 1.1 },
  fog: { color: 0xc8a878, near: 90, far: 340 },
  biome: {
    ground: { base: '#a3703f', light: '#c99a5e', dark: '#6b4326', crack: 'rgba(30,18,10,0.55)' },
    rock: '#7d6a58',
    scrub: 0x7d8a4a,
    ambientParticle: 'dust',
    trees: 'cactus',
    aurora: false,
    weeds: true,
  },
  terrain: {
    duneAmp: 1,
    roughAmp: 1,
    roads: [
      { x0: 0, z0: 110, x1: 0, z1: -56 },
      { x0: -92, z0: -22, x1: 92, z1: -22 },
    ],
    crater: { x: 88, z: -30, r: 16 },
  },
  districts: [
    {
      id: 'gutterlight', name: 'GUTTERLIGHT', subtitle: 'Last Lemonade Before the Wastes', dress: 'hub',
      cx: 0, cz: 95, radius: 34, baseHeight: 0,
      faction: 'none', spawnTable: [], maxAlive: 0, respawnDelay: 999, levelOffset: 0,
    },
    {
      id: 'gully7', name: 'GULLY SEVEN', subtitle: 'Sovereign Territory of His Trashjesty', dress: 'fort',
      cx: 0, cz: 5, radius: 48, baseHeight: 0,
      faction: 'rustborn',
      spawnTable: [
        { enemyId: 'rustpunk', weight: 30 }, { enemyId: 'scrapmutt', weight: 24 },
        { enemyId: 'shieldhead', weight: 13 }, { enemyId: 'lobber', weight: 10 },
        { enemyId: 'fusebug', weight: 10 }, { enemyId: 'boilerbruiser', weight: 6 },
      ],
      maxAlive: 7, respawnDelay: 16, levelOffset: 0,
    },
    {
      id: 'boneyard', name: 'THE BONEYARD', subtitle: 'Something Big Died Here. Respect It.', dress: 'boneyard',
      cx: -85, cz: -20, radius: 40, baseHeight: 1.2,
      faction: 'rustborn',
      spawnTable: [
        { enemyId: 'scrapmutt', weight: 26 }, { enemyId: 'pyrepunk', weight: 18 },
        { enemyId: 'fusebug', weight: 14 }, { enemyId: 'boilerbruiser', weight: 9 },
        { enemyId: 'rustpunk', weight: 12 },
      ],
      maxAlive: 6, respawnDelay: 18, levelOffset: 1,
    },
    {
      id: 'slagflats', name: 'THE SLAGFLATS', subtitle: 'Helix Combine Property. Trespassers Itemized.', dress: 'slagflats',
      cx: 85, cz: -25, radius: 42, baseHeight: 0.6,
      faction: 'helix',
      spawnTable: [
        { enemyId: 'helix_drone', weight: 24 }, { enemyId: 'lattice_warden', weight: 12 },
        { enemyId: 'helix_stinger', weight: 18 },
      ],
      maxAlive: 6, respawnDelay: 18, levelOffset: 2,
    },
    {
      id: 'trashmount', name: 'TRASH MOUNTAIN', subtitle: 'The Throne. Kneel or Duck.', dress: 'throne',
      cx: 0, cz: -95, radius: 36, baseHeight: 5.5,
      faction: 'none', spawnTable: [], maxAlive: 0, respawnDelay: 999, levelOffset: 3,
    },
  ],
  pois: [
    { id: 'ft_hub', kind: 'fast_travel', x: 0, z: 102, data: 'Gutterlight Plaza' },
    { id: 'vg1', kind: 'vendor_gun', x: -7, z: 88, rot: Math.PI },
    { id: 'vm1', kind: 'vendor_med', x: 7, z: 88, rot: Math.PI },
    { id: 'npc_quibb', kind: 'npc', x: -3, z: 80, rot: 2.6, data: 'quibb' },
    { id: 'chest_hub', kind: 'chest', x: 15, z: 97, rot: -0.9 },
    { id: 'sign_hub', kind: 'sign', x: 0, z: 72, rot: 0, data: '← BONEYARD · GULLY AHEAD · SLAGFLATS →' },
    { id: 'ft_gully', kind: 'fast_travel', x: 20, z: 30, data: 'Gully Gate' },
    { id: 'chest_g1', kind: 'chest', x: -30, z: -4, rot: 0.6 },
    { id: 'chest_g2', kind: 'chest', x: 26, z: -20, rot: -2.2 },
    { id: 'log1', kind: 'wirelog', x: -34, z: 18, data: 'log_foreman1' },
    { id: 'log2', kind: 'wirelog', x: 10, z: -32, data: 'log_rustborn1' },
    { id: 'chest_b1', kind: 'chest', x: -94, z: -30, rot: 1.2 },
    { id: 'log4', kind: 'wirelog', x: -74, z: -2, data: 'log_boneyard' },
    { id: 'ft_slag', kind: 'fast_travel', x: 68, z: -6, data: 'Slagflat Rim' },
    { id: 'chest_s1', kind: 'chest', x: 100, z: -38, rot: 2.4 },
    { id: 'log3', kind: 'wirelog', x: 66, z: -40, data: 'log_zaza1' },
    { id: 'log5', kind: 'wirelog', x: 96, z: -12, data: 'log_helix' },
    { id: 'gate_mount', kind: 'gate', x: 0, z: -58, rot: 0, data: 'trashgate' },
    { id: 'chest_t1', kind: 'chest', x: -10, z: -104, rot: 0.4 },
    { id: 'sign_mount', kind: 'sign', x: 3, z: -54, rot: 0, data: 'NO REGICIDE WITHOUT AN APPOINTMENT' },
  ],
  spawn: { x: 0, z: 112 },
  exits: [
    { x: 0, z: 126, targetMap: 'frosthollow', targetX: 0, targetZ: 96, label: 'THE FROSTHOLLOW' },
    { x: 62, z: -114, targetMap: 'cinderthroat', targetX: 0, targetZ: 124, label: 'THE CINDER THROAT' },
    { x: -122, z: 34, targetMap: 'brasshaven', targetX: 0, targetZ: 54, label: 'BRASSHAVEN' },
    { x: 122, z: 20, targetMap: 'rustgulch', targetX: -176, targetZ: 0, label: 'THE RUST GULCH' },
  ],
};

// ===========================================================================
// MAP 2 — THE FROSTHOLLOW (frozen highland; a Helix terraformer misfired
// here decades ago and winter never left)
export const FROSTHOLLOW: WorldDef = {
  id: 'frosthollow',
  name: 'THE FROSTHOLLOW',
  tagline: 'winter moved in and never paid rent.',
  size: 230,
  skyTop: 0x24427c,
  skyHorizon: 0xd8e6f0,
  sun: { color: 0xe8f2ff, intensity: 2.2, dirX: 0.45, dirY: 0.7, dirZ: -0.4 },
  ambient: { sky: 0x9ab8d8, ground: 0xb0c2d0, intensity: 1.15 },
  fog: { color: 0xcfe0ec, near: 70, far: 300 },
  biome: {
    ground: { base: '#dfe8ee', light: '#ffffff', dark: '#9fb4c4', crack: 'rgba(90,120,150,0.45)' },
    rock: '#6a7a8a',
    scrub: 0x4a6a5a,
    ambientParticle: 'snow',
    trees: 'pine',
    aurora: true,
    weeds: false,
  },
  terrain: {
    duneAmp: 1.35,
    roughAmp: 1.2,
    roads: [
      { x0: 0, z0: 95, x1: 0, z1: -62 },
      { x0: 0, z0: -8, x1: 48, z1: -10 },
      { x0: 0, z0: 20, x1: -55, z1: 4 },
    ],
    lake: { x: 60, z: -14, r: 34, level: -0.35 },
  },
  districts: [
    {
      id: 'chatterjaw', name: 'CHATTERJAW LANDING', subtitle: 'Zaza’s Winter Residence. Mind the Icicles.', dress: 'frosthub',
      cx: 0, cz: 82, radius: 28, baseHeight: 0,
      faction: 'none', spawnTable: [], maxAlive: 0, respawnDelay: 999, levelOffset: 0,
    },
    {
      id: 'pinebreak', name: 'THE PINEBREAK', subtitle: 'The Trees Are Not Whispering. Probably Wind.', dress: 'pinebreak',
      cx: -62, cz: -2, radius: 46, baseHeight: 0.9,
      faction: 'frostborn',
      spawnTable: [
        { enemyId: 'snowmad', weight: 28 }, { enemyId: 'frostmutt', weight: 24 },
        { enemyId: 'icicle_lobber', weight: 12 }, { enemyId: 'frost_shrike', weight: 12 },
        { enemyId: 'avalanche_bruiser', weight: 7 },
      ],
      maxAlive: 7, respawnDelay: 16, levelOffset: 3,
    },
    {
      id: 'fathom', name: 'THE FROZEN FATHOM', subtitle: 'Thick Ice. Thin Promises.', dress: 'fathom',
      cx: 60, cz: -14, radius: 42, baseHeight: -0.2,
      faction: 'frostborn',
      spawnTable: [
        { enemyId: 'frost_shrike', weight: 22 }, { enemyId: 'snowmad', weight: 16 },
        { enemyId: 'frostmutt', weight: 14 }, { enemyId: 'icicle_lobber', weight: 10 },
      ],
      maxAlive: 6, respawnDelay: 18, levelOffset: 4,
    },
    {
      id: 'icebox', name: 'THE ICEBOX', subtitle: 'Where Winter Keeps Its Leftovers.', dress: 'icebox',
      cx: 0, cz: -82, radius: 32, baseHeight: 3.4,
      faction: 'none', spawnTable: [], maxAlive: 0, respawnDelay: 999, levelOffset: 4,
    },
  ],
  pois: [
    { id: 'ft_chatterjaw', kind: 'fast_travel', x: 0, z: 90, data: 'Chatterjaw Landing' },
    { id: 'vg2', kind: 'vendor_gun', x: -6, z: 76, rot: Math.PI },
    { id: 'vm2', kind: 'vendor_med', x: 6, z: 76, rot: Math.PI },
    { id: 'npc_zaza', kind: 'npc', x: 3, z: 68, rot: 2.8, data: 'zaza' },
    { id: 'chest_cj', kind: 'chest', x: 13, z: 85, rot: -1.1 },
    { id: 'sign_cj', kind: 'sign', x: 0, z: 60, rot: 0, data: '← PINEBREAK · ICEBOX AHEAD · FATHOM →' },
    { id: 'ft_pine', kind: 'fast_travel', x: -46, z: 14, data: 'Pinebreak Edge' },
    { id: 'chest_p1', kind: 'chest', x: -78, z: -14, rot: 0.8 },
    { id: 'log_f1', kind: 'wirelog', x: -58, z: 16, data: 'log_pinebreak' },
    { id: 'ft_fathom', kind: 'fast_travel', x: 34, z: -8, data: 'Fathom Shore' },
    { id: 'chest_f1', kind: 'chest', x: 84, z: -26, rot: 2.1 },
    { id: 'log_f2', kind: 'wirelog', x: 58, z: 10, data: 'log_fathom' },
    { id: 'chest_i1', kind: 'chest', x: 10, z: -90, rot: 0.5 },
    { id: 'log_f3', kind: 'wirelog', x: -8, z: -62, data: 'log_icebox' },
    { id: 'sign_ice', kind: 'sign', x: 3, z: -58, rot: 0, data: 'AVALANCHE COUNTRY. HE KNOWS YOU’RE HERE.' },
  ],
  spawn: { x: 0, z: 90 },
  exits: [
    { x: 0, z: 108, targetMap: 'claudelands', targetX: 0, targetZ: 114, label: 'THE CLAUDELANDS' },
  ],
};

// ===========================================================================
// MAP 3 — THE CINDER THROAT (scorched ravine; a linear gauntlet winding down
// to the Kindled cult's stolen Helix foundry. One way in. One boss out.)
const THROAT_PATH = [
  { x: 0, z: 130 },     // Throat Gate (entry)
  { x: -10, z: 84 },
  { x: -46, z: 58 },    // Cinder Camp arena
  { x: -60, z: 6 },
  { x: -30, z: -32 },   // Ash Flats arena
  { x: 22, z: -38 },
  { x: 58, z: -6 },     // Kiln Yard arena
  { x: 84, z: -52 },
  { x: 40, z: -96 },    // approach
  { x: 0, z: -118 },    // Foundry Court (boss)
];

export const CINDERTHROAT: WorldDef = {
  id: 'cinderthroat',
  name: 'THE CINDER THROAT',
  tagline: 'one way down. the kindled insist.',
  size: 320,
  skyTop: 0x5a3234,
  skyHorizon: 0xe89a4c,
  sun: { color: 0xffc088, intensity: 2.4, dirX: 0.3, dirY: 0.65, dirZ: 0.55 },
  ambient: { sky: 0xa87a68, ground: 0x6a4a3c, intensity: 1.35 },
  fog: { color: 0x9a6a4c, near: 60, far: 300 },
  biome: {
    ground: { base: '#5c504a', light: '#7d6a60', dark: '#3a322e', crack: 'rgba(255,106,26,0.55)' },
    rock: '#3f3733',
    scrub: 0x5a4a3a,
    ambientParticle: 'ash',
    trees: 'burnt',
    aurora: false,
    weeds: false,
  },
  terrain: {
    duneAmp: 0.8,
    roughAmp: 1.1,
    roads: [],
    corridor: {
      pts: THROAT_PATH,
      width: 13,
      arenas: [
        { x: 0, z: 130, r: 20 },
        { x: -46, z: 58, r: 26 },
        { x: -30, z: -32, r: 30 },
        { x: 58, z: -6, r: 26 },
        { x: 0, z: -118, r: 30 },
      ],
      wallHeight: 20,
    },
  },
  districts: [
    {
      id: 'throatgate', name: 'THE THROAT GATE', subtitle: 'Last Exit Before the Furnace', dress: 'throatgate',
      cx: 0, cz: 130, radius: 20, baseHeight: 0,
      faction: 'none', spawnTable: [], maxAlive: 0, respawnDelay: 999, levelOffset: 0,
    },
    {
      id: 'cindercamp', name: 'CINDER CAMP', subtitle: 'The Kindled Cook Here. Everything.', dress: 'cindercamp',
      cx: -46, cz: 58, radius: 26, baseHeight: 0.4,
      faction: 'kindled',
      spawnTable: [
        { enemyId: 'ashwalker', weight: 26 }, { enemyId: 'fusebug', weight: 14 },
        { enemyId: 'ash_shrike', weight: 14 }, { enemyId: 'cinderhulk', weight: 7 },
      ],
      maxAlive: 7, respawnDelay: 15, levelOffset: 3,
    },
    {
      id: 'ashflats', name: 'THE ASH FLATS', subtitle: 'Openly Hostile. Also Just Open.', dress: 'ashflats',
      cx: -30, cz: -32, radius: 30, baseHeight: 0.2,
      faction: 'kindled',
      spawnTable: [
        { enemyId: 'ashwalker', weight: 22 }, { enemyId: 'ash_shrike', weight: 18 },
        { enemyId: 'cinderhulk', weight: 10 }, { enemyId: 'fusebug', weight: 12 },
      ],
      maxAlive: 8, respawnDelay: 14, levelOffset: 4,
    },
    {
      id: 'kilnyard', name: 'THE KILN YARD', subtitle: 'Where the Kindled Fire Their Best Work (You)', dress: 'kilnyard',
      cx: 58, cz: -6, radius: 26, baseHeight: 0.6,
      faction: 'kindled',
      spawnTable: [
        { enemyId: 'ashwalker', weight: 20 }, { enemyId: 'cinderhulk', weight: 14 },
        { enemyId: 'ash_shrike', weight: 12 },
      ],
      maxAlive: 7, respawnDelay: 14, levelOffset: 5,
    },
    {
      id: 'foundrycourt', name: 'THE FOUNDRY COURT', subtitle: 'The Saint Is In.', dress: 'foundrycourt',
      cx: 0, cz: -118, radius: 30, baseHeight: 1.2,
      faction: 'none', spawnTable: [], maxAlive: 0, respawnDelay: 999, levelOffset: 5,
    },
  ],
  pois: [
    { id: 'ft_throat', kind: 'fast_travel', x: 0, z: 134, data: 'Throat Gate' },
    { id: 'sign_throat', kind: 'sign', x: 4, z: 122, rot: 0, data: 'ONE WAY. THE KINDLED INSIST.' },
    { id: 'log_c1', kind: 'wirelog', x: -44, z: 62, data: 'log_kindled1' },
    { id: 'chest_c1', kind: 'chest', x: -52, z: 52, rot: 0.8 },
    { id: 'log_c2', kind: 'wirelog', x: -34, z: -26, data: 'log_kindled2' },
    { id: 'ft_kiln', kind: 'fast_travel', x: 52, z: 0, data: 'Kiln Yard' },
    { id: 'chest_c2', kind: 'chest', x: 64, z: -12, rot: -1.9 },
    { id: 'log_c3', kind: 'wirelog', x: 44, z: -92, data: 'log_kindled3' },
    { id: 'chest_c3', kind: 'chest', x: 8, z: -124, rot: 0.4 },
    { id: 'sign_foundry', kind: 'sign', x: -4, z: -100, rot: 0, data: 'OFFERINGS AHEAD. BE ONE.' },
  ],
  spawn: { x: 0, z: 130 },
  exits: [
    { x: 0, z: 140, targetMap: 'claudelands', targetX: 52, targetZ: -106, label: 'THE CLAUDELANDS' },
  ],
};

// ===========================================================================
// MAP 4 — BRASSHAVEN (the central city: a scrap metropolis built in and
// around the hull of a beached mega-hauler. No combat. Everything's for
// sale, including several things that were yours a minute ago.)
export const BRASSHAVEN: WorldDef = {
  id: 'brasshaven',
  name: 'BRASSHAVEN',
  tagline: 'the last city. population: haggling.',
  size: 170,
  skyTop: 0x35659a,
  skyHorizon: 0xe0a868,
  sun: { color: 0xffe0b0, intensity: 2.3, dirX: -0.4, dirY: 0.72, dirZ: 0.45 },
  ambient: { sky: 0x9ab4d8, ground: 0x8a7a5c, intensity: 1.25 },
  fog: { color: 0xb89878, near: 70, far: 280 },
  biome: {
    ground: { base: '#6e6458', light: '#8d8272', dark: '#4a423a', crack: 'rgba(20,16,12,0.5)' },
    rock: '#6d6058',
    scrub: 0x6a7a4a,
    ambientParticle: 'dust',
    trees: 'cactus',
    aurora: false,
    weeds: false,
  },
  terrain: {
    duneAmp: 0.25,
    roughAmp: 0.3,
    roads: [
      { x0: 0, z0: 80, x1: 0, z1: -60 },
      { x0: -55, z0: 0, x1: 55, z1: 0 },
    ],
  },
  districts: [
    {
      id: 'brassplaza', name: 'BRASSHAVEN', subtitle: 'The Last City. Mind Your Wallet.', dress: 'brassplaza',
      cx: 0, cz: 0, radius: 70, baseHeight: 0,
      faction: 'none', spawnTable: [], maxAlive: 0, respawnDelay: 999, levelOffset: 0,
    },
  ],
  pois: [
    { id: 'ft_brass', kind: 'fast_travel', x: 0, z: 66, data: 'Brasshaven Gate' },
    { id: 'vg_b', kind: 'vendor_gun', x: -10, z: 12, rot: 1.2 },
    { id: 'vm_b', kind: 'vendor_med', x: 12, z: 10, rot: -1.4 },
    { id: 'chest_brass', kind: 'chest', x: -26, z: -30, rot: 0.7 },
    { id: 'log_b1', kind: 'wirelog', x: 20, z: -22, data: 'log_brasshaven' },
    { id: 'sign_b1', kind: 'sign', x: 0, z: 52, rot: 0, data: 'BRASSHAVEN: NO SPITTING. NO REGICIDE. NO REFUNDS.' },
    { id: 'sign_b2', kind: 'sign', x: -4, z: -14, rot: 0.4, data: 'MARKET ROW → · HULLTOWN ↑ · GATE ←' },
    { id: 'npc_mayor', kind: 'npc', x: 0, z: -20, rot: 0, data: 'mayor' },
    { id: 'npc_brann', kind: 'npc', x: -14, z: 8, rot: 1.1, data: 'brann' },
    { id: 'npc_mirelle', kind: 'npc', x: 16, z: 10, rot: -1.3, data: 'mirelle' },
    { id: 'npc_okto', kind: 'npc', x: -6, z: 24, rot: 0.4, data: 'okto' },
    { id: 'ship_brass', kind: 'ship', x: -26, z: 40, rot: 0.6 },
    { id: 'pit_brass', kind: 'pit', x: 30, z: -34, rot: -0.8 },
    { id: 'sign_pit_b', kind: 'sign', x: 24, z: -26, rot: -0.8, data: 'THE CRUCIBLE ↘ · WINNERS DRINK FREE · LOSERS RECONSTRUCTED' },
  ],
  spawn: { x: 0, z: 62 },
  exits: [
    { x: 0, z: 74, targetMap: 'claudelands', targetX: -112, targetZ: 34, label: 'THE CLAUDELANDS' },
  ],
};

// ===========================================================================
// ARENA — THE CRUCIBLE (endless mode). Tovah's old fighting pit: a bowl of
// scorched sand ringed by scrap bleachers, floodlights, and bad decisions.
export const CRUCIBLE: WorldDef = {
  id: 'crucible',
  name: 'The Crucible',
  tagline: 'the crowd is mostly vultures. they still boo.',
  size: 120,
  skyTop: 0x2a1a2e, skyHorizon: 0xc86a3a,
  sun: { color: 0xffd2a0, intensity: 1.15, dirX: -0.5, dirY: 0.75, dirZ: 0.3 },
  ambient: { sky: 0x8a6a8a, ground: 0x4a3428, intensity: 0.62 },
  fog: { color: 0x3a2430, near: 60, far: 220 },
  biome: {
    ground: { base: '#7a5030', light: '#a87848', dark: '#4a3020', crack: 'rgba(20,10,8,0.5)' },
    rock: '#5a4a44',
    scrub: 0x6a5a3a,
    ambientParticle: 'dust',
    trees: 'burnt',
    aurora: false,
    weeds: false,
  },
  terrain: {
    duneAmp: 0.5,
    roughAmp: 0.3,
    roads: [],
  },
  districts: [
    {
      id: 'pit', name: 'THE CRUCIBLE', subtitle: 'Last One Standing Drinks Free',
      cx: 0, cz: 0, radius: 46, dress: 'crucible', baseHeight: 0,
      faction: 'none', spawnTable: [], maxAlive: 0, respawnDelay: 999, levelOffset: 0,
    },
  ],
  pois: [
    { id: 'vg_pit', kind: 'vendor_gun', x: -8, z: 40, rot: Math.PI },
    { id: 'vm_pit', kind: 'vendor_med', x: 8, z: 40, rot: Math.PI },
    { id: 'sign_pit', kind: 'sign', x: 0, z: 34, rot: 0, data: 'THE CRUCIBLE: NO REFUNDS. NO SURVIVORS. NO PARKING.' },
    { id: 'pit_exit', kind: 'pit', x: 0, z: 46, rot: Math.PI, data: 'exit' },
  ],
  spawn: { x: 0, z: 30 },
};

// ===========================================================================
// PLANET 2 — VELDT MINOR: THE MANGROVE SHELF. Lush, loud, and carnivorous.
// A safe landing town, wild groves crawling with the Verdant, and three
// dressed-but-sealed ways deeper (cave, thicket, beach) for future maps.
export const VELDT: WorldDef = {
  id: 'veldt',
  name: 'Veldt Minor',
  tagline: 'the jungle is louder than the guns. barely.',
  size: 250,
  skyTop: 0x2a86c8, skyHorizon: 0xbfe8d0,
  sun: { color: 0xfff2d0, intensity: 1.35, dirX: 0.4, dirY: 0.85, dirZ: -0.25 },
  ambient: { sky: 0xa8d8e8, ground: 0x3a6a3a, intensity: 0.78 },
  fog: { color: 0xa8d8c0, near: 55, far: 230 },
  biome: {
    ground: { base: '#5aa348', light: '#8cc86a', dark: '#2f6a30', crack: 'rgba(20,60,30,0.35)' },
    rock: '#5f7d4b',
    scrub: 0xff6aa0,
    ambientParticle: 'dust',
    trees: 'palm',
    aurora: false,
    weeds: false,
  },
  terrain: {
    duneAmp: 2.2,
    roughAmp: 0.8,
    roads: [
      { x0: 0, z0: 92, x1: -60, z1: 6 },      // landing → the Chatterfronds
      { x0: 0, z0: 92, x1: 62, z1: -12 },     // landing → Idol Hollow
      { x0: 0, z0: 92, x1: 0, z1: -70 },      // landing → the Overgrowth
      { x0: 44, z0: 62, x1: 0, z1: 92 },      // lagoon boardwalk path
    ],
    lake: { x: 46, z: 58, r: 24, level: 0.35 },
  },
  districts: [
    {
      id: 'mangrove', name: 'MANGROVE LANDING', subtitle: 'Population: One Botanist, Several Regrets',
      cx: 0, cz: 88, radius: 34, dress: 'porttown', baseHeight: 0,
      faction: 'none', spawnTable: [], maxAlive: 0, respawnDelay: 999, levelOffset: 0,
    },
    {
      id: 'chatterfronds', name: 'THE CHATTERFRONDS', subtitle: 'The Drums Are Not Decorative',
      cx: -60, cz: 4, radius: 42, dress: 'verdantcamp', baseHeight: 1,
      faction: 'verdant', levelOffset: 4,
      spawnTable: [
        { enemyId: 'frond_stalker', weight: 30 },
        { enemyId: 'dartlurker', weight: 26 },
        { enemyId: 'shaman', weight: 14 },
        { enemyId: 'sporeling', weight: 14 },
        { enemyId: 'totem_bruiser', weight: 8 },
      ],
      maxAlive: 8, respawnDelay: 22,
    },
    {
      id: 'idolhollow', name: 'IDOL HOLLOW', subtitle: 'The Statue Was Here First. It Insists.',
      cx: 62, cz: -14, radius: 38, dress: 'grove', baseHeight: 1.5,
      faction: 'verdant', levelOffset: 5,
      spawnTable: [
        { enemyId: 'shaman', weight: 24 },
        { enemyId: 'dartlurker', weight: 20 },
        { enemyId: 'razorbeak', weight: 16 },
        { enemyId: 'sporeling', weight: 12 },
      ],
      maxAlive: 7, respawnDelay: 24,
    },
    {
      id: 'overgrowth', name: 'THE OVERGROWTH', subtitle: 'Where the Path Gives Up',
      cx: 0, cz: -66, radius: 46, dress: 'jungle', baseHeight: 2,
      faction: 'verdant', levelOffset: 5,
      spawnTable: [
        { enemyId: 'frond_stalker', weight: 28 },
        { enemyId: 'razorbeak', weight: 18 },
        { enemyId: 'totem_bruiser', weight: 10 },
        { enemyId: 'sporeling', weight: 14 },
      ],
      maxAlive: 8, respawnDelay: 22,
    },
  ],
  pois: [
    { id: 'ft_veldt', kind: 'fast_travel', x: 0, z: 96, data: 'Mangrove Landing' },
    { id: 'ship_veldt', kind: 'ship', x: -16, z: 94, rot: -0.5 },
    { id: 'vg_v', kind: 'vendor_gun', x: -8, z: 80, rot: Math.PI },
    { id: 'vm_v', kind: 'vendor_med', x: 10, z: 82, rot: Math.PI },
    { id: 'npc_juno', kind: 'npc', x: 6, z: 74, rot: 2.6, data: 'juno' },
    { id: 'chest_v1', kind: 'chest', x: 16, z: 90, rot: -0.8 },
    { id: 'sign_v1', kind: 'sign', x: 0, z: 68, rot: 0, data: '← CHATTERFRONDS · OVERGROWTH ↑ · IDOL HOLLOW →' },
    { id: 'log_v1', kind: 'wirelog', x: -12, z: 70, data: 'log_veldt1' },
    { id: 'chest_v2', kind: 'chest', x: -74, z: -10, rot: 1.1 },
    { id: 'log_v2', kind: 'wirelog', x: -52, z: 16, data: 'log_veldt2' },
    { id: 'chest_v3', kind: 'chest', x: 78, z: -28, rot: 2.2 },
    { id: 'sign_v2', kind: 'sign', x: 60, z: 6, rot: 0.4, data: 'DO NOT FEED THE IDOL. IT REMEMBERS FLAVORS.' },
  ],
  spawn: { x: 0, z: 88 },
  exits: [
    { x: -104, z: -62, targetMap: 'veldt_caves', targetX: 0, targetZ: 112, label: 'THE HOLLOWDEEP', style: 'cave' },
    { x: 6, z: -114, targetMap: 'veldt_tangle', targetX: 0, targetZ: 116, label: 'THE TANGLE', style: 'thicket' },
    { x: 110, z: 26, targetMap: 'veldt_shallows', targetX: -100, targetZ: 96, label: 'SHIPWRECK SHALLOWS', style: 'beach' },
  ],
};

// ===========================================================================
// MAP — THE RUST GULCH (east of the Slagflats: a huge open canyon where the
// haulers came down. Wreck fields to strip, scavvers to dodge, and REDLINE'S
// RUN — a full racing circuit with forks and jumps, carved by one very
// determined retired courier and her dune buggy.)
export const RUSTGULCH: WorldDef = {
  id: 'rustgulch',
  name: 'THE RUST GULCH',
  tagline: 'wide open. floor it.',
  size: 400,
  skyTop: 0x3a6ab8, skyHorizon: 0xe0a060,
  sun: { color: 0xffe2b0, intensity: 2.5, dirX: -0.5, dirY: 0.78, dirZ: 0.35 },
  ambient: { sky: 0x9ab0d0, ground: 0x92603c, intensity: 1.1 },
  fog: { color: 0xd8a070, near: 130, far: 560 },
  biome: {
    ground: { base: '#a55a38', light: '#cf8a54', dark: '#6a3822', crack: 'rgba(30,14,8,0.55)' },
    rock: '#8a5a44',
    scrub: 0x8a7a3a,
    ambientParticle: 'dust',
    trees: 'cactus',
    aurora: false,
    weeds: true,
  },
  terrain: {
    duneAmp: 1.5,
    roughAmp: 0.9,
    // REDLINE'S RUN: one big counterclockwise circuit with two forked
    // sections. The road tint doubles as the racing line.
    roads: [
      { x0: -150, z0: -30, x1: -150, z1: 40 },     // start/finish straight
      { x0: -150, z0: 40, x1: -120, z1: 95 },
      { x0: -120, z0: 95, x1: -40, z1: 145 },
      { x0: -40, z0: 145, x1: 60, z1: 150 },
      { x0: 60, z0: 150, x1: 130, z1: 110 },
      { x0: 130, z0: 110, x1: 165, z1: 30 },       // fork 1 OUTER — sweeping crest
      { x0: 165, z0: 30, x1: 140, z1: -60 },
      { x0: 130, z0: 110, x1: 95, z1: 40 },        // fork 1 INNER — big ramp shortcut
      { x0: 95, z0: 40, x1: 140, z1: -60 },
      { x0: 140, z0: -60, x1: 60, z1: -140 },
      { x0: 60, z0: -140, x1: -50, z1: -155 },     // fork 2 OUTER — south rim
      { x0: -50, z0: -155, x1: -120, z1: -100 },
      { x0: 60, z0: -140, x1: -10, z1: -108 },     // fork 2 INNER — gap jump
      { x0: -10, z0: -108, x1: -120, z1: -100 },
      { x0: -120, z0: -100, x1: -150, z1: -30 },
      { x0: -176, z0: 0, x1: -150, z1: 4 },        // entrance spur to the gate
    ],
    bumps: [
      // jumps ON the line (post-road, so they keep their launch faces)
      { x: 165, z: 30, r: 15, h: 4.5 },            // outer crest jump
      { x: 95, z: 40, r: 13, h: 5.5 },             // shortcut mega-ramp
      { x: -10, z: -108, r: 12, h: 5 },            // south gap jump
      // guide mesas — the circuit reads as a canyon, not a parking lot
      { x: -20, z: 20, r: 48, h: 15 },             // central mesa
      { x: 30, z: -15, r: 22, h: 12 },
      { x: -60, z: 80, r: 18, h: 10 },
      { x: -185, z: 150, r: 30, h: 18 },
      { x: 185, z: 170, r: 26, h: 16 },
      { x: 185, z: -140, r: 28, h: 18 },
      { x: -180, z: -170, r: 30, h: 20 },
      { x: 0, z: 192, r: 26, h: 14 },
    ],
  },
  districts: [
    {
      id: 'gulchgate', name: 'THE GULCH GATE', subtitle: 'Pit Row. Mind the Tires.', dress: 'gulchgate',
      cx: -150, cz: 0, radius: 40, baseHeight: 0,
      faction: 'none', spawnTable: [], maxAlive: 0, respawnDelay: 999, levelOffset: 0,
    },
    {
      id: 'shipbreak', name: 'THE SHIPBREAK', subtitle: 'Where Haulers Go to Lie Down', dress: 'shipbreak',
      cx: 112, cz: 156, radius: 36, baseHeight: 0.8,
      faction: 'rustborn', levelOffset: 2,
      spawnTable: [
        { enemyId: 'rustpunk', weight: 26 }, { enemyId: 'scrapmutt', weight: 20 },
        { enemyId: 'lobber', weight: 12 }, { enemyId: 'fusebug', weight: 12 },
        { enemyId: 'boilerbruiser', weight: 7 },
      ],
      maxAlive: 7, respawnDelay: 18,
    },
    {
      id: 'sumpyard', name: 'THE SUMP', subtitle: 'Infield Salvage. Racing Adjacent.', dress: 'shipbreak',
      cx: 55, cz: -60, radius: 32, baseHeight: 0.5,
      faction: 'rustborn', levelOffset: 1,
      spawnTable: [
        { enemyId: 'scrapmutt', weight: 24 }, { enemyId: 'rustpunk', weight: 18 },
        { enemyId: 'fusebug', weight: 12 },
      ],
      maxAlive: 5, respawnDelay: 20,
    },
  ],
  pois: [
    { id: 'ft_gulch', kind: 'fast_travel', x: -148, z: 6, data: 'Gulch Gate' },
    { id: 'npc_rita', kind: 'racer', x: -147, z: 31, rot: 2.5, data: 'rita' },
    { id: 'buggy_pad', kind: 'buggy', x: -134, z: 10, rot: 0.4 },
    { id: 'sign_g1', kind: 'sign', x: -152, z: 22, rot: 0.2, data: 'REDLINE’S RUN — RACE DAY IS EVERY DAY' },
    { id: 'sign_g2', kind: 'sign', x: -160, z: -8, rot: -0.3, data: '← CLAUDELANDS · WRECKS → · TRACK EVERYWHERE ELSE' },
    { id: 'log_g1', kind: 'wirelog', x: -138, z: 20, data: 'log_gulch1' },
    { id: 'wreck1', kind: 'wreck', x: 102, z: 146, rot: 0.6 },
    { id: 'wreck2', kind: 'wreck', x: 124, z: 170, rot: -1.2 },
    { id: 'wreck3', kind: 'wreck', x: 106, z: 172, rot: 2.1 },
    { id: 'wreck4', kind: 'wreck', x: 130, z: 146, rot: 0.2 },
    { id: 'wreck5', kind: 'wreck', x: 48, z: -52, rot: 1.4 },
    { id: 'wreck6', kind: 'wreck', x: 66, z: -70, rot: -0.6 },
    { id: 'wreck7', kind: 'wreck', x: 40, z: -74, rot: 2.8 },
    { id: 'chest_r1', kind: 'chest', x: 116, z: 158, rot: 0.8 },
    { id: 'chest_r2', kind: 'chest', x: 56, z: -64, rot: -1.6 },
    { id: 'log_g2', kind: 'wirelog', x: 120, z: 164, data: 'log_gulch2' },
    { id: 'sign_g3', kind: 'sign', x: 96, z: 138, rot: 0.5, data: 'SHIPBREAK SALVAGE CO. — “IF IT FELL, IT’S OURS”' },
  ],
  spawn: { x: -166, z: 0 },
  exits: [
    { x: -186, z: 0, targetMap: 'claudelands', targetX: 114, targetZ: 20, label: 'THE CLAUDELANDS' },
  ],
};

// ===========================================================================
// PLANET 2, MAP 2 — THE TANGLE. The deep jungle behind the thicket: a
// mostly-linear gauntlet of strangler groves and drum camps winding down to
// the Bloom Court, where the Verdant's early-woken garden god holds "choir".
const TANGLE_PATH = [
  { x: 0, z: 118 },     // Tangle Mouth (entry)
  { x: -14, z: 76 },
  { x: -44, z: 48 },    // Drum Hollow arena
  { x: -52, z: -2 },
  { x: -18, z: -28 },
  { x: 34, z: -18 },    // the Rootworks arena
  { x: 58, z: -58 },
  { x: 22, z: -88 },    // approach
  { x: 0, z: -110 },    // Bloom Court (boss)
];

export const VELDT_TANGLE: WorldDef = {
  id: 'veldt_tangle',
  name: 'THE TANGLE',
  tagline: 'the jungle, concentrated. shake well before entering.',
  size: 300,
  skyTop: 0x1f5a3a, skyHorizon: 0x9adc9a,
  sun: { color: 0xd8ffb0, intensity: 1.25, dirX: 0.3, dirY: 0.8, dirZ: -0.3 },
  ambient: { sky: 0x6aa87a, ground: 0x1f3a24, intensity: 0.9 },
  fog: { color: 0x3f6a48, near: 34, far: 170 },
  biome: {
    ground: { base: '#3f7a36', light: '#5f9a4c', dark: '#24512a', crack: 'rgba(15,45,25,0.4)' },
    rock: '#4f6a44',
    scrub: 0xffb43c,
    ambientParticle: 'dust',
    trees: 'palm',
    aurora: false,
    weeds: false,
  },
  terrain: {
    duneAmp: 0.9,
    roughAmp: 1.0,
    roads: [],
    corridor: {
      pts: TANGLE_PATH,
      width: 12,
      arenas: [
        { x: 0, z: 118, r: 20 },
        { x: -44, z: 48, r: 26 },
        { x: 34, z: -18, r: 28 },
        { x: 0, z: -110, r: 32 },
      ],
      wallHeight: 18,
    },
  },
  districts: [
    {
      id: 'tanglemouth', name: 'THE TANGLE MOUTH', subtitle: 'Last Light for a While', dress: 'jungle',
      cx: 0, cz: 118, radius: 20, baseHeight: 0,
      faction: 'none', spawnTable: [], maxAlive: 0, respawnDelay: 999, levelOffset: 0,
    },
    {
      id: 'drumhollow', name: 'DRUM HOLLOW', subtitle: 'You Hear It Before You See It', dress: 'verdantcamp',
      cx: -44, cz: 48, radius: 26, baseHeight: 1,
      faction: 'verdant', levelOffset: 5,
      spawnTable: [
        { enemyId: 'frond_stalker', weight: 26 },
        { enemyId: 'dartlurker', weight: 20 },
        { enemyId: 'thorn_hurler', weight: 16 },
        { enemyId: 'sporeling', weight: 14 },
      ],
      maxAlive: 8, respawnDelay: 18,
    },
    {
      id: 'rootworks', name: 'THE ROOTWORKS', subtitle: 'The Trees Have Plans', dress: 'jungle',
      cx: 34, cz: -18, radius: 28, baseHeight: 1.5,
      faction: 'verdant', levelOffset: 6,
      spawnTable: [
        { enemyId: 'strangler', weight: 22 },
        { enemyId: 'thorn_hurler', weight: 18 },
        { enemyId: 'shaman', weight: 16 },
        { enemyId: 'razorbeak', weight: 12 },
      ],
      maxAlive: 8, respawnDelay: 18,
    },
    {
      id: 'bloomcourt', name: 'THE BLOOM COURT', subtitle: 'Choir Practice Is Mandatory', dress: 'jungle',
      cx: 0, cz: -110, radius: 32, baseHeight: 2,
      faction: 'none', spawnTable: [], maxAlive: 0, respawnDelay: 999, levelOffset: 7,
    },
  ],
  pois: [
    { id: 'ft_tangle', kind: 'fast_travel', x: 6, z: 116, data: 'Tangle Mouth' },
    { id: 'sign_t1', kind: 'sign', x: 0, z: 106, rot: 0, data: 'THE TANGLE: KEEP YOUR ARMS. ALL OF THEM.' },
    { id: 'chest_t1', kind: 'chest', x: -50, z: 42, rot: 0.8 },
    { id: 'log_t1', kind: 'wirelog', x: -40, z: 54, data: 'log_tangle' },
    { id: 'chest_t2', kind: 'chest', x: 42, z: -24, rot: -1.4 },
    { id: 'sign_t2', kind: 'sign', x: 26, z: -80, rot: 0.3, data: 'THE CHOIR SINGS AHEAD. BRING EARPLUGS AND A WILL.' },
  ],
  spawn: { x: 0, z: 118 },
  exits: [
    { x: 0, z: 134, targetMap: 'veldt', targetX: 0, targetZ: -100, label: 'VELDT MINOR', style: 'thicket' },
  ],
};

// ===========================================================================
// PLANET 2, MAP 3 — SHIPWRECK SHALLOWS. The east coast of Veldt Minor: a
// turquoise lagoon with the hauler PELICAN broken across it. Her crew never
// stopped working the cargo — they just stopped needing air. A castaway
// quartermaster runs the only dry camp on the shore.
export const VELDT_SHALLOWS: WorldDef = {
  id: 'veldt_shallows',
  name: 'SHIPWRECK SHALLOWS',
  tagline: 'the tide keeps receipts.',
  size: 300,
  skyTop: 0x2a96d8, skyHorizon: 0xd8f0e0,
  sun: { color: 0xfff6d8, intensity: 1.55, dirX: 0.35, dirY: 0.8, dirZ: -0.3 },
  ambient: { sky: 0xb8e8f0, ground: 0x7a9a6a, intensity: 0.85 },
  fog: { color: 0xbfe8e0, near: 70, far: 300 },
  biome: {
    ground: { base: '#d8c084', light: '#f0e0ac', dark: '#a89058', crack: 'rgba(90,70,40,0.3)' },
    rock: '#8a9a84',
    scrub: 0x5aa86a,
    ambientParticle: 'dust',
    trees: 'palm',
    aurora: false,
    weeds: false,
  },
  terrain: {
    duneAmp: 1.4,
    roughAmp: 0.6,
    roads: [
      { x0: -110, z0: 100, x1: -70, z1: 80 },   // veldt entry → Driftwood Rest
      { x0: -70, z0: 80, x1: -60, z1: -60 },    // camp → the Brine Pans
      { x0: -70, z0: 80, x1: 6, z1: -36 },      // camp → the Hullgrave
      { x0: -70, z0: 80, x1: 52, z1: 56 },      // camp → the Anchorage shore
    ],
    // the lagoon: a sea-sized "lake" hanging off the east edge. Everything
    // inside its blend wades ankle-deep; the Anchorage arena sits in it.
    lake: { x: 130, z: 0, r: 118, level: 0.22 },
  },
  districts: [
    {
      id: 'driftwood', name: 'DRIFTWOOD REST', subtitle: 'Dry. Mostly. Ask About the Chowder.', dress: 'castaway',
      cx: -70, cz: 80, radius: 30, baseHeight: 1.2,
      faction: 'none', spawnTable: [], maxAlive: 0, respawnDelay: 999, levelOffset: 0,
    },
    {
      id: 'hullgrave', name: 'THE HULLGRAVE', subtitle: 'The PELICAN, Filed in Two Places', dress: 'hullgrave',
      cx: 6, cz: -36, radius: 44, baseHeight: 0.7,
      faction: 'brine', levelOffset: 6,
      spawnTable: [
        { enemyId: 'brine_husk', weight: 28 },
        { enemyId: 'harpooneer', weight: 22 },
        { enemyId: 'snapjaw', weight: 16 },
        { enemyId: 'tidecaller', weight: 12 },
        { enemyId: 'anchor_hulk', weight: 8 },
      ],
      maxAlive: 8, respawnDelay: 20,
    },
    {
      id: 'brinepans', name: 'THE BRINE PANS', subtitle: 'Salt Flats. The Salt Is Ambitious.', dress: 'brinepans',
      cx: -60, cz: -60, radius: 36, baseHeight: 0.6,
      faction: 'brine', levelOffset: 6,
      spawnTable: [
        { enemyId: 'snapjaw', weight: 26 },
        { enemyId: 'brine_husk', weight: 20 },
        { enemyId: 'gullwing', weight: 18 },
        { enemyId: 'tidecaller', weight: 12 },
      ],
      maxAlive: 7, respawnDelay: 22,
    },
    {
      id: 'anchorage', name: 'THE ANCHORAGE', subtitle: 'Where the Admiral Takes Salutes', dress: 'anchorage',
      cx: 52, cz: 56, radius: 34, baseHeight: 0.3,
      faction: 'none', spawnTable: [], maxAlive: 0, respawnDelay: 999, levelOffset: 7,
    },
  ],
  pois: [
    { id: 'ft_shallows', kind: 'fast_travel', x: -76, z: 88, data: 'Driftwood Rest' },
    { id: 'npc_peg', kind: 'npc', x: -66, z: 76, rot: 2.4, data: 'peg' },
    { id: 'vg_s', kind: 'vendor_gun', x: -78, z: 74, rot: 1.2 },
    { id: 'vm_s', kind: 'vendor_med', x: -60, z: 86, rot: -2.0 },
    { id: 'chest_sh1', kind: 'chest', x: -58, z: 92, rot: 0.6 },
    { id: 'sign_sh1', kind: 'sign', x: -68, z: 64, rot: 0.2, data: '← BRINE PANS · HULLGRAVE ↓ · ANCHORAGE → · SEA: EVERYWHERE' },
    { id: 'log_sh1', kind: 'wirelog', x: -72, z: 70, data: 'log_shallows1' },
    { id: 'chest_sh2', kind: 'chest', x: 14, z: -48, rot: -1.2 },
    { id: 'log_sh2', kind: 'wirelog', x: 0, z: -30, data: 'log_shallows2' },
    { id: 'sign_sh2', kind: 'sign', x: -8, z: -18, rot: 0.4, data: 'PELICAN SALVAGE: CREW ONLY. CREW STATUS: COMPLICATED.' },
    { id: 'chest_sh3', kind: 'chest', x: -68, z: -70, rot: 1.8 },
    { id: 'sign_sh3', kind: 'sign', x: 40, z: 40, rot: -0.6, data: 'THE ANCHORAGE — SALUTE OR SWIM' },
  ],
  spawn: { x: -100, z: 96 },
  exits: [
    { x: -118, z: 104, targetMap: 'veldt', targetX: 102, targetZ: 30, label: 'VELDT MINOR', style: 'beach' },
  ],
};

// ===========================================================================
// PLANET 2, MAP 4 — THE HOLLOWDEEP. The cave under the jungle: a corridor of
// glow-mushroom groves and abandoned mine workings spiraling down to the
// Lode Court, where the dig crew's sixty-year shift never ended.
const HOLLOW_PATH = [
  { x: 0, z: 118 },      // the Mouth (entry)
  { x: 18, z: 74 },
  { x: -8, z: 44 },
  { x: -46, z: 40 },     // the Gloomgrove arena
  { x: -54, z: -6 },
  { x: -16, z: -26 },
  { x: 38, z: -30 },     // the Cryptworks arena
  { x: 44, z: -72 },
  { x: 10, z: -92 },     // approach
  { x: 0, z: -112 },     // the Lode Court (boss)
];

export const VELDT_CAVES: WorldDef = {
  id: 'veldt_caves',
  name: 'THE HOLLOWDEEP',
  tagline: 'the dark down here is employed.',
  size: 300,
  skyTop: 0x070b16, skyHorizon: 0x16283a,
  sun: { color: 0xa8d4ec, intensity: 1.45, dirX: 0.2, dirY: 0.9, dirZ: -0.2 },
  ambient: { sky: 0x4a6e90, ground: 0x2a3c50, intensity: 1.35 },
  fog: { color: 0x14222e, near: 34, far: 170 },
  biome: {
    ground: { base: '#3a4658', light: '#5c6e88', dark: '#1e2836', crack: 'rgba(84,212,255,0.3)' },
    rock: '#3a4252',
    scrub: 0x2fd8c8,
    ambientParticle: 'spore',
    trees: 'mushroom',
    aurora: true,          // in the dark it reads as glowworm veins overhead
    weeds: false,
  },
  terrain: {
    duneAmp: 0.8,
    roughAmp: 1.1,
    roads: [],
    corridor: {
      pts: HOLLOW_PATH,
      width: 13,
      arenas: [
        { x: 0, z: 118, r: 22 },
        { x: -46, z: 40, r: 28 },
        { x: 38, z: -30, r: 28 },
        { x: 0, z: -112, r: 34 },
      ],
      wallHeight: 24,
    },
  },
  districts: [
    {
      id: 'cavemouth', name: 'THE MOUTH', subtitle: 'Last Lantern Before the Long Dark', dress: 'cavemouth',
      cx: 0, cz: 118, radius: 22, baseHeight: 0,
      faction: 'none', spawnTable: [], maxAlive: 0, respawnDelay: 999, levelOffset: 0,
    },
    {
      id: 'gloomgrove', name: 'THE GLOOMGROVE', subtitle: 'The Mushrooms Are Watching. Politely.', dress: 'gloomgrove',
      cx: -46, cz: 40, radius: 28, baseHeight: 0.8,
      faction: 'hollow', levelOffset: 7,
      spawnTable: [
        { enemyId: 'gloomstalker', weight: 28 },
        { enemyId: 'gravemite', weight: 20 },
        { enemyId: 'spitgrub', weight: 16 },
        { enemyId: 'lantern_wisp', weight: 14 },
      ],
      maxAlive: 8, respawnDelay: 20,
    },
    {
      id: 'cryptworks', name: 'THE CRYPTWORKS', subtitle: 'Shift Change Was Sixty Years Ago', dress: 'cryptworks',
      cx: 38, cz: -30, radius: 28, baseHeight: 1.2,
      faction: 'hollow', levelOffset: 8,
      spawnTable: [
        { enemyId: 'shardcaster', weight: 26 },
        { enemyId: 'gloomstalker', weight: 18 },
        { enemyId: 'deep_roller', weight: 10 },
        { enemyId: 'lantern_wisp', weight: 12 },
        { enemyId: 'gravemite', weight: 12 },
      ],
      maxAlive: 8, respawnDelay: 20,
    },
    {
      id: 'lodecourt', name: 'THE LODE COURT', subtitle: 'The Seam Sings Here', dress: 'lodecourt',
      cx: 0, cz: -112, radius: 34, baseHeight: 1.6,
      faction: 'none', spawnTable: [], maxAlive: 0, respawnDelay: 999, levelOffset: 9,
    },
  ],
  pois: [
    { id: 'ft_hollow', kind: 'fast_travel', x: 8, z: 114, data: 'The Mouth' },
    { id: 'sign_h1', kind: 'sign', x: 0, z: 104, rot: 0, data: 'HOLLOWDEEP WORKS — DAYS SINCE INCIDENT: [ILLEGIBLE]' },
    { id: 'chest_h1', kind: 'chest', x: -52, z: 34, rot: 0.9 },
    { id: 'log_h1', kind: 'wirelog', x: -42, z: 46, data: 'log_hollow1' },
    { id: 'chest_h2', kind: 'chest', x: 46, z: -36, rot: -1.6 },
    { id: 'log_h2', kind: 'wirelog', x: 32, z: -24, data: 'log_hollow2' },
    { id: 'sign_h2', kind: 'sign', x: 12, z: -88, rot: 0.3, data: 'LODE COURT AHEAD. HUM ALONG OR HOLD YOUR BREATH.' },
  ],
  spawn: { x: 0, z: 118 },
  exits: [
    { x: 0, z: 136, targetMap: 'veldt', targetX: -96, targetZ: -56, label: 'VELDT MINOR', style: 'cave' },
  ],
};

export const MAPS: Record<string, WorldDef> = {
  claudelands: CLAUDELANDS,
  frosthollow: FROSTHOLLOW,
  cinderthroat: CINDERTHROAT,
  brasshaven: BRASSHAVEN,
  crucible: CRUCIBLE,
  rustgulch: RUSTGULCH,
  veldt: VELDT,
  veldt_tangle: VELDT_TANGLE,
  veldt_shallows: VELDT_SHALLOWS,
  veldt_caves: VELDT_CAVES,
};

let active: WorldDef = CLAUDELANDS;
export function activeMap(): WorldDef { return active; }
export function setActiveMap(id: string): WorldDef {
  active = MAPS[id] ?? CLAUDELANDS;
  return active;
}

/** Back-compat alias used across the codebase for the active map. */
export const WORLD = new Proxy({} as WorldDef, {
  get: (_t, prop) => (active as unknown as Record<string | symbol, unknown>)[prop],
}) as WorldDef;

export const PLAYER_SPAWN = { get x() { return active.spawn.x; }, get z() { return active.spawn.z; } };

// ---------------------------------------------------------------------------
// Terrain — analytic heightfield parameterized by the active map.

const smooth = (edge0: number, edge1: number, x: number) => {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

function distToSegment(px: number, pz: number, s: { x0: number; z0: number; x1: number; z1: number }): number {
  const dx = s.x1 - s.x0, dz = s.z1 - s.z0;
  const len2 = dx * dx + dz * dz;
  const t = len2 > 0 ? clamp01(((px - s.x0) * dx + (pz - s.z0) * dz) / len2) : 0;
  return Math.hypot(px - (s.x0 + dx * t), pz - (s.z0 + dz * t));
}

export function roadFactor(x: number, z: number): number {
  let f = 0;
  for (const r of active.terrain.roads) {
    f = Math.max(f, smooth(7, 3, distToSegment(x, z, r)));
  }
  return f;
}

function rawTerrainHeight(x: number, z: number): number {
  const T = active.terrain;
  let h = (Math.sin(x * 0.021 + 1.7) * Math.cos(z * 0.024) * 0.5 + 0.5) * 2.6 * T.duneAmp
    + Math.sin(x * 0.045 + z * 0.037 + 2.2) * 0.7 * T.roughAmp + 0.7;
  h = Math.max(0, h);

  if (T.crater) {
    const cd = Math.hypot(x - T.crater.x, z - T.crater.z);
    if (cd < T.crater.r * 1.6) {
      h += Math.exp(-((cd - T.crater.r) ** 2) / 14) * 2.2 + smooth(T.crater.r, T.crater.r * 0.25, cd) * -1.6;
    }
  }
  if (T.lake) {
    const ld = Math.hypot(x - T.lake.x, z - T.lake.z);
    const t = smooth(T.lake.r * 1.15, T.lake.r * 0.7, ld);
    h = lerp(h, T.lake.level, t);
  }

  for (const d of active.districts) {
    const dist = Math.hypot(x - d.cx, z - d.cz);
    const t = smooth(d.radius, d.radius * 0.55, dist);
    let target = d.baseHeight;
    if (T.crater && (d.dress === 'slagflats')) {
      const cd = Math.hypot(x - T.crater.x, z - T.crater.z);
      target += Math.exp(-((cd - T.crater.r) ** 2) / 14) * 2.2 + smooth(T.crater.r, T.crater.r * 0.25, cd) * -1.6;
    }
    if (d.dress === 'throne' || d.dress === 'icebox') {
      target = d.baseHeight * smooth(d.radius, d.radius * 0.3, dist) + 0.4;
    }
    if (d.dress === 'fathom' && T.lake) {
      const ld = Math.hypot(x - T.lake.x, z - T.lake.z);
      target = lerp(d.baseHeight, T.lake.level, smooth(T.lake.r * 1.15, T.lake.r * 0.7, ld));
    }
    h = lerp(h, target, t);
  }

  if (T.corridor) {
    const C = T.corridor;
    let d = Infinity;
    for (let i = 0; i < C.pts.length - 1; i++) {
      d = Math.min(d, distToSegment(x, z, { x0: C.pts[i].x, z0: C.pts[i].z, x1: C.pts[i + 1].x, z1: C.pts[i + 1].z }));
    }
    let inside = 1 - smooth(C.width, C.width + 9, d); // 1 in corridor, 0 outside
    for (const a of C.arenas) {
      inside = Math.max(inside, 1 - smooth(a.r, a.r + 9, Math.hypot(x - a.x, z - a.z)));
    }
    h = h * (0.4 + inside * 0.6) + (1 - inside) * C.wallHeight;
  }

  const road = roadFactor(x, z);
  if (road > 0) {
    h = lerp(h, Math.min(h, 0.25 + h * 0.35), road);
  }

  // bumps land after the road flattening so a jump ON the racing line keeps
  // its full height instead of being ironed into the rut
  if (T.bumps) {
    for (const b of T.bumps) {
      const d = Math.hypot(x - b.x, z - b.z);
      if (d < b.r) h += b.h * smooth(b.r, b.r * 0.22, d);
    }
  }
  return h;
}

// Terrain queries are grid-matched: bilinear interpolation over the same
// vertex grid the mesh uses, so props/characters sit exactly on the rendered
// surface instead of the analytic ideal (which caused floating/clipping).
export const TERRAIN_SEGS = 200;
export const TERRAIN_SPAN_FACTOR = 1.7;

export function terrainHeight(x: number, z: number): number {
  const span = active.size * TERRAIN_SPAN_FACTOR;
  const cell = span / TERRAIN_SEGS;
  const gx = (x + span / 2) / cell;
  const gz = (z + span / 2) / cell;
  const x0 = Math.floor(gx), z0 = Math.floor(gz);
  const fx = gx - x0, fz = gz - z0;
  const wx0 = x0 * cell - span / 2, wz0 = z0 * cell - span / 2;
  const h00 = rawTerrainHeight(wx0, wz0);
  const h10 = rawTerrainHeight(wx0 + cell, wz0);
  const h01 = rawTerrainHeight(wx0, wz0 + cell);
  const h11 = rawTerrainHeight(wx0 + cell, wz0 + cell);
  return lerp(lerp(h00, h10, fx), lerp(h01, h11, fx), fz);
}

/** Raw analytic height — used ONLY by the terrain mesh builder. */
export function meshHeight(x: number, z: number): number { return rawTerrainHeight(x, z); }

export function terrainNormal(x: number, z: number): { x: number; y: number; z: number } {
  const e = 0.6;
  const hx = terrainHeight(x + e, z) - terrainHeight(x - e, z);
  const hz = terrainHeight(x, z + e) - terrainHeight(x, z - e);
  const nx = -hx / (2 * e), nz = -hz / (2 * e);
  const len = Math.hypot(nx, 1, nz);
  return { x: nx / len, y: 1 / len, z: nz / len };
}

export function districtAt(x: number, z: number): DistrictDef | null {
  for (const d of active.districts) {
    if (Math.hypot(x - d.cx, z - d.cz) < d.radius) return d;
  }
  return null;
}

/** All fast-travel stations across all maps, for the network panel. */
export function allStations(): { mapId: string; mapName: string; poi: WorldPoi }[] {
  const out: { mapId: string; mapName: string; poi: WorldPoi }[] = [];
  for (const map of Object.values(MAPS)) {
    for (const poi of map.pois) {
      if (poi.kind === 'fast_travel') out.push({ mapId: map.id, mapName: map.name, poi });
    }
  }
  return out;
}
