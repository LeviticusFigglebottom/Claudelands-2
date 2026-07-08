// The Claudelands world registry — pass 3. Multiple maps, each a WorldDef:
// districts, POIs, biome palette (feeds the same procedural texture system),
// and analytic terrain parameters. terrainHeight()/districtAt()/roadFactor()
// read the ACTIVE map, so every system keeps calling the same functions
// across map switches. Adding a map = adding a def here + district dressing
// tags that game/world.ts knows how to build.

import { clamp01, lerp } from '../util/maff';

export type DistrictDress = 'hub' | 'fort' | 'boneyard' | 'slagflats' | 'throne' | 'frosthub' | 'pinebreak' | 'fathom' | 'icebox' | 'throatgate' | 'cindercamp' | 'ashflats' | 'kilnyard' | 'foundrycourt' | 'brassplaza' | 'crucible' | 'porttown' | 'verdantcamp' | 'grove' | 'jungle' | 'gulchgate' | 'shipbreak' | 'castaway' | 'hullgrave' | 'brinepans' | 'anchorage' | 'cavemouth' | 'gloomgrove' | 'cryptworks' | 'lodecourt' | 'lastlight' | 'chimefield' | 'shardsea' | 'nullbasin' | 'gloamgate' | 'snuffrows' | 'wickbothy' | 'echoorgan' | 'lampfall' | 'jarworks' | 'galeflats' | 'conductorrow' | 'capacitorium' | 'eyewall' | 'stillgate' | 'hangfields' | 'barrowline' | 'breathhall' | 'boregate' | 'threadway' | 'coreworks' | 'paddygate' | 'terrace' | 'gardencrown';

export interface DistrictDef {
  id: string;
  name: string;
  subtitle: string;
  dress: DistrictDress;
  cx: number; cz: number; radius: number;
  baseHeight: number;
  faction: 'rustborn' | 'helix' | 'frostborn' | 'kindled' | 'verdant' | 'brine' | 'hollow' | 'vitrified' | 'galebound' | 'none';
  spawnTable: { enemyId: string; weight: number }[];
  maxAlive: number;
  respawnDelay: number;
  levelOffset: number;
}

export interface WorldPoi {
  id: string;
  kind: 'chest' | 'vendor_gun' | 'vendor_med' | 'fast_travel' | 'wirelog' | 'npc' | 'gate' | 'sign' | 'ship' | 'wreck' | 'racer' | 'buggy' | 'pit' | 'cargo' | 'vent' | 'rod';
  x: number; z: number; rot?: number;
  data?: string;
}

export interface BiomeDef {
  ground: { base: string; light: string; dark: string; crack: string };
  rock: string;
  scrub: number;               // scrub tuft color
  ambientParticle: 'dust' | 'snow' | 'ash' | 'spore' | 'rain';
  trees: 'cactus' | 'pine' | 'burnt' | 'palm' | 'mushroom' | 'shard';
  aurora: boolean;
  weeds: boolean;              // tumbleweeds roam
  /** Rim wall silhouette — each world's horizon has its own handwriting.
   *  Default 'mesa' (the Claude Prime truncated cones). */
  rim?: 'mesa' | 'slate' | 'barrow' | 'prism' | 'jungle' | 'floe' | 'basalt';
  /** Instanced ground-cover style. Default 'scrub' (desert cones). */
  groundLife?: 'scrub' | 'sedge' | 'reeds' | 'shards' | 'fern';
}

export interface WorldDef {
  id: string;
  name: string;
  tagline: string;             // biome-entry title card subtext
  size: number;
  /** m/s² pulling the player down — Vitra Null runs light (default 24). */
  gravity?: number;
  /** VOLTHOLM: gale channels — segments of hard directional wind that shove
   *  anyone (and any buggy) standing in them along the segment. */
  gales?: { x0: number; z0: number; x1: number; z1: number; width: number; power: number }[];
  /** VOLTHOLM: the SKYFALL cycle — every `period`s a lightning storm rolls
   *  through: `warn`s of sirens, then `strikes`s of bolts. Conductor rods
   *  (poi kind 'rod') eat any bolt that lands near them. */
  storm?: { period: number; warn: number; strikes: number };
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
    rim: 'floe',
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
    rim: 'basalt',
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
    rim: 'jungle',
    groundLife: 'fern',
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
      // north infield pocket: well inside the circuit, far from the rim mesas
      cx: 30, cz: 90, radius: 34, baseHeight: 0.8,
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
    { id: 'ft_gulch', kind: 'fast_travel', x: -112, z: 2, data: 'Gulch Gate' },
    { id: 'npc_rita', kind: 'racer', x: -108, z: 24, rot: 2.1, data: 'rita' },
    { id: 'buggy_pad', kind: 'buggy', x: -96, z: 8, rot: 0.4 },
    { id: 'sign_g1', kind: 'sign', x: -114, z: 32, rot: 0.2, data: 'REDLINE’S RUN — RACE DAY IS EVERY DAY' },
    { id: 'sign_g2', kind: 'sign', x: -118, z: -14, rot: -0.3, data: '← CLAUDELANDS · WRECKS → · TRACK EVERYWHERE ELSE' },
    { id: 'log_g1', kind: 'wirelog', x: -102, z: 14, data: 'log_gulch1' },
    { id: 'wreck1', kind: 'wreck', x: 20, z: 80, rot: 0.6 },
    { id: 'wreck2', kind: 'wreck', x: 42, z: 100, rot: -1.2 },
    { id: 'wreck3', kind: 'wreck', x: 24, z: 104, rot: 2.1 },
    { id: 'wreck4', kind: 'wreck', x: 44, z: 78, rot: 0.2 },
    { id: 'wreck5', kind: 'wreck', x: 48, z: -52, rot: 1.4 },
    { id: 'wreck6', kind: 'wreck', x: 66, z: -70, rot: -0.6 },
    { id: 'wreck7', kind: 'wreck', x: 40, z: -74, rot: 2.8 },
    { id: 'chest_r1', kind: 'chest', x: 34, z: 92, rot: 0.8 },
    { id: 'chest_r2', kind: 'chest', x: 56, z: -64, rot: -1.6 },
    { id: 'log_g2', kind: 'wirelog', x: 38, z: 96, data: 'log_gulch2' },
    { id: 'sign_g3', kind: 'sign', x: 14, z: 70, rot: 0.5, data: 'SHIPBREAK SALVAGE CO. — “IF IT FELL, IT’S OURS”' },
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
    rim: 'jungle',
    groundLife: 'fern',
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
    rim: 'jungle',
    groundLife: 'fern',
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
    { id: 'chest_sh2', kind: 'chest', x: 7, z: -42, rot: -1.2 },
    { id: 'log_sh2', kind: 'wirelog', x: -13, z: -22, data: 'log_shallows2' },
    { id: 'sign_sh2', kind: 'sign', x: -8, z: -18, rot: 0.4, data: 'PELICAN SALVAGE: CREW ONLY. CREW STATUS: COMPLICATED.' },
    { id: 'chest_sh3', kind: 'chest', x: -68, z: -70, rot: 1.8 },
    { id: 'sign_sh3', kind: 'sign', x: 40, z: 40, rot: -0.6, data: 'THE ANCHORAGE — SALUTE OR SWIM' },
    { id: 'cargo1', kind: 'cargo', x: 2, z: -18, rot: 0.4 },
    { id: 'cargo2', kind: 'cargo', x: 36, z: -24, rot: -0.8 },
    { id: 'cargo3', kind: 'cargo', x: -14, z: -50, rot: 1.6 },
    { id: 'cargo4', kind: 'cargo', x: 34, z: -54, rot: 2.3 },
    { id: 'cargo5', kind: 'cargo', x: -50, z: -78, rot: -1.2 },
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

// ===========================================================================
// PLANET 2, GP CIRCUIT — THE CANOPY RUN. A pure racing map: one big jungle
// loop with a lagoon beach straight, a plateau shortcut with a launch ramp,
// a south gap jump, and a paddock. Reached from the main menu's RACE mode.
export const VELDT_GP: WorldDef = {
  id: 'veldt_gp',
  name: 'THE CANOPY RUN',
  tagline: 'three laps. the jungle keeps time.',
  size: 380,
  skyTop: 0x2a90d0, skyHorizon: 0xc8ecd8,
  sun: { color: 0xfff4d4, intensity: 1.5, dirX: 0.4, dirY: 0.82, dirZ: -0.28 },
  ambient: { sky: 0xaddce8, ground: 0x4a7a4a, intensity: 0.85 },
  fog: { color: 0xa8d8c8, near: 90, far: 380 },
  biome: {
    ground: { base: '#7aa848', light: '#a8cc6a', dark: '#48702e', crack: 'rgba(40,70,30,0.35)' },
    rock: '#6a8a58',
    scrub: 0xff6aa0,
    ambientParticle: 'dust',
    trees: 'palm',
    aurora: false,
    weeds: false,
    rim: 'jungle',
    groundLife: 'fern',
  },
  terrain: {
    duneAmp: 1.6,
    roughAmp: 0.7,
    roads: [
      { x0: -140, z0: -30, x1: -140, z1: 50 },     // start/finish straight
      { x0: -140, z0: 50, x1: -100, z1: 110 },
      { x0: -100, z0: 110, x1: -20, z1: 140 },
      { x0: -20, z0: 140, x1: 60, z1: 130 },       // lagoon beach straight
      { x0: 60, z0: 130, x1: 120, z1: 90 },
      { x0: 120, z0: 90, x1: 150, z1: 30 },        // fork 1 OUTER — shore sweep
      { x0: 150, z0: 30, x1: 130, z1: -40 },
      { x0: 120, z0: 90, x1: 98, z1: 44 },         // fork 1 INNER — plateau cut + ramp
      { x0: 98, z0: 44, x1: 130, z1: -40 },
      { x0: 130, z0: -40, x1: 80, z1: -120 },
      { x0: 80, z0: -120, x1: 0, z1: -150 },       // fork 2 OUTER — south rim
      { x0: 0, z0: -150, x1: -90, z1: -120 },
      { x0: 80, z0: -120, x1: 10, z1: -113 },      // fork 2 INNER — gap jump
      { x0: 10, z0: -113, x1: -90, z1: -120 },
      { x0: -90, z0: -120, x1: -140, z1: -60 },
      { x0: -140, z0: -60, x1: -140, z1: -30 },
    ],
    lake: { x: 170, z: 170, r: 85, level: 0.25 },  // the lagoon the beach skirts
    bumps: [
      // launch ramps ON the line
      { x: 98, z: 44, r: 13, h: 5 },               // plateau cut ramp
      { x: 10, z: -113, r: 12, h: 5 },             // south gap jump
      // scenery hills walling the loop
      { x: 0, z: 0, r: 55, h: 12 },                // central jungle plateau
      { x: -170, z: 160, r: 26, h: 12 },
      { x: -175, z: -165, r: 28, h: 14 },
      { x: 160, z: -165, r: 26, h: 12 },
      { x: 0, z: 185, r: 24, h: 10 },
    ],
  },
  districts: [
    {
      id: 'paddock', name: 'THE PADDOCK', subtitle: 'Grid Girls Sold Separately', dress: 'gulchgate',
      cx: -140, cz: 6, radius: 30, baseHeight: 0,
      faction: 'none', spawnTable: [], maxAlive: 0, respawnDelay: 999, levelOffset: 0,
    },
    {
      id: 'drumstand', name: 'THE DRUM STAND', subtitle: 'The Verdant Came for the Noise', dress: 'verdantcamp',
      cx: 60, cz: 55, radius: 20, baseHeight: 1,
      faction: 'none', spawnTable: [], maxAlive: 0, respawnDelay: 999, levelOffset: 0,
    },
  ],
  pois: [
    { id: 'buggy_gp', kind: 'buggy', x: -128, z: 12, rot: 0.3 },
    { id: 'sign_gp1', kind: 'sign', x: -146, z: 24, rot: 0.2, data: 'THE CANOPY RUN — THREE LAPS. THE JUNGLE KEEPS TIME.' },
    { id: 'sign_gp2', kind: 'sign', x: -132, z: -14, rot: -0.3, data: 'BEACH → PLATEAU CUT → THE GAP. SWIM AT YOUR OWN PACE.' },
  ],
  spawn: { x: -132, z: 16 },
  exits: [],
};


// ===========================================================================
// PLANET 3 — VITRA NULL. A moon-dark glass waste under a permanent aurora:
// obsidian ground veined with light, monolithic shard fields, chiming glass
// flora, and gravity too polite to hold you down. Functionally different:
// low-g floaty jumps + shimmer vents that launch you across the mesas.
const VITRA: WorldDef = {
  id: 'vitra',
  name: 'VITRA NULL',
  tagline: 'the night the glass dreams about.',
  size: 240,
  gravity: 11,
  skyTop: 0x060312,
  skyHorizon: 0x241a4e,
  sun: { color: 0xb0a0ff, intensity: 1.5, dirX: -0.3, dirY: 0.8, dirZ: 0.35 },
  ambient: { sky: 0x5a48a8, ground: 0x241c40, intensity: 1.5 },
  fog: { color: 0x0d0a24, near: 70, far: 320 },
  biome: {
    ground: { base: '#181228', light: '#2c2148', dark: '#0b0716', crack: 'rgba(122,240,255,0.55)' },
    rock: '#2e2652',
    scrub: 0x6a5adf,
    ambientParticle: 'spore',
    trees: 'shard',
    aurora: true,
    weeds: false,
    rim: 'prism',
    groundLife: 'shards',
  },
  terrain: {
    duneAmp: 1.7,
    roughAmp: 1.1,
    roads: [
      { x0: 0, z0: 100, x1: 0, z1: -92 },
      { x0: 0, z0: 30, x1: -70, z1: -10 },
      { x0: 0, z0: 10, x1: 72, z1: -20 },
    ],
  },
  districts: [
    {
      id: 'lastlight', name: 'LAST LIGHT', subtitle: 'The Keeper Is In. The Dark Is Out. Mostly.', dress: 'lastlight',
      cx: 0, cz: 88, radius: 30, baseHeight: 0.4,
      faction: 'none', spawnTable: [], maxAlive: 0, respawnDelay: 999, levelOffset: 8,
    },
    {
      id: 'chimefield', name: 'THE CHIMEFIELD', subtitle: 'Wind Through Glass. It Knows Your Name.', dress: 'chimefield',
      cx: -70, cz: -10, radius: 46, baseHeight: 0.8,
      faction: 'vitrified',
      spawnTable: [
        { enemyId: 'shardling', weight: 28 },
        { enemyId: 'glasswing', weight: 16 },
        { enemyId: 'prism_sentinel', weight: 12 },
      ],
      maxAlive: 7, respawnDelay: 16, levelOffset: 9,
    },
    {
      id: 'shardsea', name: 'THE SHARDSEA', subtitle: 'A Storm, Paused Mid-Shatter.', dress: 'shardsea',
      cx: 72, cz: -20, radius: 48, baseHeight: 1.2,
      faction: 'vitrified',
      spawnTable: [
        { enemyId: 'prism_sentinel', weight: 22 },
        { enemyId: 'shardling', weight: 20 },
        { enemyId: 'glasswing', weight: 14 },
      ],
      maxAlive: 7, respawnDelay: 18, levelOffset: 10,
    },
    {
      id: 'nullbasin', name: 'THE NULL BASIN', subtitle: 'Where the Light Files Its Complaints.', dress: 'nullbasin',
      cx: 0, cz: -92, radius: 34, baseHeight: -0.6,
      faction: 'vitrified',
      spawnTable: [
        { enemyId: 'shardling', weight: 20 },
        { enemyId: 'prism_sentinel', weight: 16 },
      ],
      maxAlive: 6, respawnDelay: 20, levelOffset: 11,
    },
  ],
  pois: [
    { id: 'ft_vitra', kind: 'fast_travel', x: 8, z: 96, data: 'Last Light' },
    { id: 'ship_vitra', kind: 'ship', x: -18, z: 100 },
    { id: 'npc_faro', kind: 'npc', x: -6, z: 80, rot: 2.8, data: 'faro' },
    { id: 'vg_v', kind: 'vendor_gun', x: 12, z: 80, rot: -1.4 },
    { id: 'vm_v', kind: 'vendor_med', x: -16, z: 88, rot: 1.2 },
    { id: 'sign_v1', kind: 'sign', x: -2, z: 70, rot: 0.1, data: 'LAST LIGHT — KEEP LANTERNS LIT. KEEP OPINIONS QUIET.' },
    { id: 'sign_v2', kind: 'sign', x: -50, z: 8, rot: 0.6, data: '← CHIMEFIELD · SHARDSEA → · BASIN ↓ · GLASS: EVERYWHERE' },
    { id: 'chest_v1', kind: 'chest', x: -62, z: -34, rot: 0.8 },
    { id: 'chest_v2', kind: 'chest', x: 84, z: -40, rot: -1.2 },
    { id: 'chest_v3', kind: 'chest', x: 10, z: -100, rot: 2.0 },
    { id: 'vent1', kind: 'vent', x: -34, z: 40 },
    { id: 'vent2', kind: 'vent', x: 42, z: 26 },
    { id: 'vent3', kind: 'vent', x: -84, z: -44 },
    { id: 'vent4', kind: 'vent', x: 92, z: -52 },
    { id: 'vent5', kind: 'vent', x: -12, z: -58 },
    { id: 'vent6', kind: 'vent', x: 30, z: -84 },
    { id: 'sign_v3', kind: 'sign', x: 20, z: -104, rot: 0.4, data: 'THE UNLIT MILE → · LAST LAMPPOST FOR A MILE · LITERALLY' },
  ],
  spawn: { x: 0, z: 108 },
  exits: [
    { x: 30, z: -116, targetMap: 'vitra_mile', targetX: 0, targetZ: 112, label: 'THE UNLIT MILE' },
  ],
};

// ===========================================================================
// PLANET 3, MAP 2 — THE UNLIT MILE. There were two lights on Vitra Null:
// Faro's Last Light and her sister spire down the coast road, kept by
// Keeper Morrow. Two hundred years ago Morrow's lamp went out — on purpose —
// and the mile of lamplit street between them has belonged to the dark ever
// since. A linear gauntlet of dead lamp posts winding down to Lampfall
// Spire, where the Unkeeper still walks his rounds. Halfway along, one
// window is still burning: Wick's bothy.
const MILE_PATH = [
  { x: 0, z: 112 },     // the Gloaming Gate (entry)
  { x: -16, z: 76 },
  { x: -46, z: 50 },    // the Snuffed Rows arena
  { x: -40, z: 2 },
  { x: 2, z: -14 },     // Wick's Bothy (safe)
  { x: 46, z: -34 },    // the Echo Organ arena
  { x: 40, z: -76 },
  { x: 8, z: -92 },     // approach
  { x: 0, z: -114 },    // Lampfall Spire (boss)
];

export const VITRA_MILE: WorldDef = {
  id: 'vitra_mile',
  name: 'THE UNLIT MILE',
  tagline: 'two lighthouses. one kept its promise.',
  size: 300,
  gravity: 11,
  skyTop: 0x040210,
  skyHorizon: 0x1a1240,
  sun: { color: 0x9a8cf0, intensity: 1.3, dirX: 0.25, dirY: 0.8, dirZ: -0.35 },
  ambient: { sky: 0x4a3a98, ground: 0x1c1636, intensity: 1.45 },
  fog: { color: 0x0a0620, near: 46, far: 240 },
  biome: {
    ground: { base: '#120d20', light: '#241a3c', dark: '#080510', crack: 'rgba(122,240,255,0.4)' },
    rock: '#282048',
    scrub: 0x5a4acf,
    ambientParticle: 'spore',
    trees: 'shard',
    aurora: true,
    weeds: false,
    rim: 'prism',
    groundLife: 'shards',
  },
  terrain: {
    duneAmp: 1.1,
    roughAmp: 1.0,
    roads: [],
    corridor: {
      pts: MILE_PATH,
      width: 13,
      arenas: [
        { x: 0, z: 112, r: 20 },
        { x: -46, z: 50, r: 27 },
        { x: 2, z: -14, r: 18 },
        { x: 46, z: -34, r: 28 },
        { x: 0, z: -114, r: 32 },
      ],
      wallHeight: 22,
    },
  },
  districts: [
    {
      id: 'gloamgate', name: 'THE GLOAMING GATE', subtitle: 'Last Lamppost for a Mile', dress: 'gloamgate',
      cx: 0, cz: 112, radius: 20, baseHeight: 0.4,
      faction: 'none', spawnTable: [], maxAlive: 0, respawnDelay: 999, levelOffset: 10,
    },
    {
      id: 'snuffrows', name: 'THE SNUFFED ROWS', subtitle: 'Every Lamp Here Went Out on the Same Night', dress: 'snuffrows',
      cx: -46, cz: 50, radius: 27, baseHeight: 0.6,
      faction: 'vitrified',
      spawnTable: [
        { enemyId: 'wickling', weight: 22 },
        { enemyId: 'shardling', weight: 22 },
        { enemyId: 'knell', weight: 14 },
        { enemyId: 'glasswing', weight: 10 },
      ],
      maxAlive: 8, respawnDelay: 16, levelOffset: 11,
    },
    {
      id: 'wickbothy', name: 'WICK’S BOTHY', subtitle: 'Occupancy: One and a Half', dress: 'wickbothy',
      cx: 2, cz: -14, radius: 18, baseHeight: 0.8,
      faction: 'none', spawnTable: [], maxAlive: 0, respawnDelay: 999, levelOffset: 11,
    },
    {
      id: 'echoorgan', name: 'THE ECHO ORGAN', subtitle: 'The Wind Plays. The Glass Answers.', dress: 'echoorgan',
      cx: 46, cz: -34, radius: 28, baseHeight: 1.0,
      faction: 'vitrified',
      spawnTable: [
        { enemyId: 'knell', weight: 20 },
        { enemyId: 'prism_sentinel', weight: 16 },
        { enemyId: 'cullet_hulk', weight: 10 },
        { enemyId: 'wickling', weight: 12 },
        { enemyId: 'shardling', weight: 12 },
      ],
      maxAlive: 8, respawnDelay: 17, levelOffset: 12,
    },
    {
      id: 'lampfall', name: 'LAMPFALL SPIRE', subtitle: 'The Second Lamp. The First Failure.', dress: 'lampfall',
      cx: 0, cz: -114, radius: 32, baseHeight: 1.2,
      faction: 'none', spawnTable: [], maxAlive: 0, respawnDelay: 999, levelOffset: 13,
    },
  ],
  pois: [
    { id: 'ft_mile', kind: 'fast_travel', x: 8, z: 108, data: 'Gloaming Gate' },
    { id: 'sign_m1', kind: 'sign', x: 0, z: 100, rot: 0, data: 'THE UNLIT MILE — BRING YOUR OWN LIGHT. BRING TWO.' },
    { id: 'chest_m1', kind: 'chest', x: -54, z: 44, rot: 0.9 },
    { id: 'log_m1', kind: 'wirelog', x: -42, z: 56, data: 'log_mile1' },
    { id: 'vent_m1', kind: 'vent', x: -44, z: 26 },
    { id: 'ft_bothy', kind: 'fast_travel', x: -6, z: -8, data: 'Wick’s Bothy' },
    { id: 'npc_wick', kind: 'npc', x: 4, z: -16, rot: 2.4, data: 'wick' },
    { id: 'sign_m2', kind: 'sign', x: -2, z: -24, rot: 0.2, data: 'BOTHY RULES: WIPE YOUR BOOTS. MIND THE LAMPS. NO SHATTERING INDOORS.' },
    { id: 'vent_m2', kind: 'vent', x: 24, z: -22 },
    { id: 'chest_m2', kind: 'chest', x: 54, z: -40, rot: -1.3 },
    { id: 'log_m2', kind: 'wirelog', x: 40, z: -28, data: 'log_mile2' },
    { id: 'vent_m3', kind: 'vent', x: 26, z: -84 },
    { id: 'sign_m3', kind: 'sign', x: 10, z: -86, rot: 0.3, data: 'LAMPFALL SPIRE AHEAD. THE KEEPER IS IN. THAT’S THE PROBLEM.' },
    { id: 'chest_m3', kind: 'chest', x: 10, z: -122, rot: 0.5 },
  ],
  spawn: { x: 0, z: 112 },
  exits: [
    { x: 0, z: 128, targetMap: 'vitra', targetX: 26, targetZ: -108, label: 'VITRA NULL' },
  ],
};

// ===========================================================================
// PLANET 4 — VOLTHOLM. A storm-harvest world under a permanent thunderhead:
// slate flats strung with conductor rods, fields of lightning jars, and the
// Galebound — crews who wired themselves into the weather and stopped
// clocking out. Gimmicks: SKYFALL (a rolling lightning storm on a timer —
// shelter near a rod or eat voltage) and GALE CHANNELS (rivers of wind that
// shove you, your bullets' owners, and your buggy).
const VOLTHOLM: WorldDef = {
  id: 'voltholm',
  name: 'VOLTHOLM',
  tagline: 'the sky owes this place money. it pays in bolts.',
  size: 260,
  skyTop: 0x1a2438,
  skyHorizon: 0x8a9a68,
  sun: { color: 0xd8e2c0, intensity: 1.6, dirX: 0.35, dirY: 0.75, dirZ: -0.4 },
  ambient: { sky: 0x8a9ab8, ground: 0x4a5248, intensity: 1.15 },
  fog: { color: 0x6a7868, near: 70, far: 300 },
  biome: {
    ground: { base: '#5a6858', light: '#7d8a72', dark: '#38423a', crack: 'rgba(210,230,120,0.35)' },
    rock: '#55605c',
    scrub: 0x7a9a4a,
    ambientParticle: 'rain',
    trees: 'burnt',
    aurora: false,
    weeds: true,
    rim: 'slate',
    groundLife: 'sedge',
  },
  gales: [
    { x0: -18, z0: 62, x1: -66, z1: 14, width: 8, power: 11 },
    { x0: 26, z0: 30, x1: 62, z1: -2, width: 8, power: 11 },
    { x0: -40, z0: -46, x1: 20, z1: -72, width: 9, power: 13 },
  ],
  storm: { period: 42, warn: 4, strikes: 7 },
  terrain: {
    duneAmp: 1.15,
    roughAmp: 1.0,
    roads: [
      { x0: 0, z0: 95, x1: 0, z1: -64 },
      { x0: 0, z0: 24, x1: -72, z1: -4 },
      { x0: 0, z0: 2, x1: 68, z1: -14 },
      { x0: 30, z0: -40, x1: 96, z1: -80 },
    ],
  },
  districts: [
    {
      id: 'jarworks', name: 'THE JARWORKS', subtitle: 'Bottled Lightning. Shake Well. Actually, Don’t.', dress: 'jarworks',
      cx: 0, cz: 88, radius: 32, baseHeight: 0.4,
      faction: 'none', spawnTable: [], maxAlive: 0, respawnDelay: 999, levelOffset: 13,
    },
    {
      id: 'galeflats', name: 'THE GALE FLATS', subtitle: 'The Wind Has Right of Way.', dress: 'galeflats',
      cx: -75, cz: -5, radius: 44, baseHeight: 0.6,
      faction: 'galebound',
      spawnTable: [
        { enemyId: 'zephyrite', weight: 26 },
        { enemyId: 'stormcrow', weight: 16 },
        { enemyId: 'thunderhead', weight: 12 },
        { enemyId: 'ballast_golem', weight: 7 },
      ],
      maxAlive: 8, respawnDelay: 16, levelOffset: 14,
    },
    {
      id: 'conductorrow', name: 'CONDUCTOR ROW', subtitle: 'The Monks Are Grounded. Spiritually. ONLY Spiritually.', dress: 'conductorrow',
      cx: 70, cz: -15, radius: 44, baseHeight: 0.8,
      faction: 'galebound',
      spawnTable: [
        { enemyId: 'conductor', weight: 24 },
        { enemyId: 'zephyrite', weight: 16 },
        { enemyId: 'stormcrow', weight: 12 },
        { enemyId: 'thunderhead', weight: 10 },
        { enemyId: 'ballast_golem', weight: 6 },
      ],
      maxAlive: 8, respawnDelay: 17, levelOffset: 15,
    },
    {
      id: 'capacitorium', name: 'THE CAPACITORIUM', subtitle: 'The Abbot Is Charging. Do Not Disturb. DO Ground Yourself.', dress: 'capacitorium',
      cx: -15, cz: -100, radius: 30, baseHeight: 1.0,
      faction: 'none', spawnTable: [], maxAlive: 0, respawnDelay: 999, levelOffset: 16,
    },
    {
      id: 'eyewall', name: 'THE EYEWALL', subtitle: 'Where the Storm Keeps Its Heart.', dress: 'eyewall',
      cx: 100, cz: -85, radius: 32, baseHeight: -0.4,
      faction: 'none', spawnTable: [], maxAlive: 0, respawnDelay: 999, levelOffset: 17,
    },
  ],
  pois: [
    { id: 'ft_volt', kind: 'fast_travel', x: 8, z: 94, data: 'Jarworks Landing' },
    { id: 'ship_volt', kind: 'ship', x: -18, z: 98 },
    { id: 'npc_coil', kind: 'npc', x: -4, z: 80, rot: 2.7, data: 'coil' },
    { id: 'vg_vo', kind: 'vendor_gun', x: 12, z: 80, rot: -1.4 },
    { id: 'vm_vo', kind: 'vendor_med', x: -16, z: 86, rot: 1.2 },
    { id: 'sign_vo1', kind: 'sign', x: 0, z: 68, rot: 0.1, data: 'THE JARWORKS — SKYFALL DRILL: SEE ROD, HUG ROD.' },
    { id: 'sign_vo2', kind: 'sign', x: -52, z: 10, rot: 0.5, data: '← GALE FLATS · CONDUCTOR ROW → · WIND: YES' },
    { id: 'chest_vo1', kind: 'chest', x: -86, z: -18, rot: 0.8 },
    { id: 'chest_vo2', kind: 'chest', x: 82, z: -28, rot: -1.1 },
    { id: 'chest_vo3', kind: 'chest', x: 108, z: -94, rot: 2.1 },
    { id: 'log_vo1', kind: 'wirelog', x: -64, z: 6, data: 'log_volt1' },
    { id: 'log_vo2', kind: 'wirelog', x: 58, z: -6, data: 'log_volt2' },
    { id: 'vent_vo1', kind: 'vent', x: -34, z: 36 },
    { id: 'vent_vo2', kind: 'vent', x: 40, z: 18 },
    { id: 'vent_vo3', kind: 'vent', x: 6, z: -44 },
    // conductor rods: SKYFALL shelter, marked on foot by their glow
    { id: 'rod_t1', kind: 'rod', x: -13, z: 88 },
    { id: 'rod_t2', kind: 'rod', x: 14, z: 88 },
    { id: 'rod_1', kind: 'rod', x: 0, z: 52 },
    { id: 'rod_2', kind: 'rod', x: -44, z: 16 },
    { id: 'rod_3', kind: 'rod', x: -78, z: -8 },
    { id: 'rod_4', kind: 'rod', x: 32, z: -6 },
    { id: 'rod_5', kind: 'rod', x: 72, z: -18 },
    { id: 'rod_6', kind: 'rod', x: 22, z: -58 },
    { id: 'rod_7', kind: 'rod', x: -16, z: -96 },
    { id: 'rod_8', kind: 'rod', x: 98, z: -82 },
  ],
  spawn: { x: 0, z: 104 },
  exits: [],
};

// ===========================================================================
// PLANET 3 GP — THE SHATTERLINE. A truly LINEAR downhill sprint across the
// glass under low gravity: one corridor, no laps, launch ramps with hang
// time measured in postcards, shimmer vents lighting the line.
const SHATTER_PATH = [
  { x: -130, z: 130 },
  { x: -90, z: 96 },
  { x: -30, z: 110 },
  { x: 30, z: 70 },
  { x: 0, z: 10 },
  { x: -60, z: -20 },
  { x: -30, z: -80 },
  { x: 40, z: -60 },
  { x: 90, z: -110 },
  { x: 130, z: -140 },
];

const VITRA_GP: WorldDef = {
  id: 'vitra_gp',
  name: 'THE SHATTERLINE',
  tagline: 'one mile of glass. no second lap.',
  size: 340,
  gravity: 11,
  skyTop: 0x060312,
  skyHorizon: 0x241a4e,
  sun: { color: 0xb0a0ff, intensity: 1.5, dirX: -0.3, dirY: 0.8, dirZ: 0.35 },
  ambient: { sky: 0x5a48a8, ground: 0x241c40, intensity: 1.5 },
  fog: { color: 0x0d0a24, near: 90, far: 380 },
  biome: {
    ground: { base: '#181228', light: '#2c2148', dark: '#0b0716', crack: 'rgba(122,240,255,0.55)' },
    rock: '#2e2652',
    scrub: 0x6a5adf,
    ambientParticle: 'spore',
    trees: 'shard',
    aurora: true,
    weeds: false,
    rim: 'prism',
    groundLife: 'shards',
  },
  terrain: {
    duneAmp: 1.2,
    roughAmp: 0.8,
    roads: [],
    corridor: {
      pts: SHATTER_PATH,
      width: 16,
      arenas: [
        { x: -130, z: 130, r: 26 },
        { x: 0, z: 10, r: 22 },
        { x: 130, z: -140, r: 28 },
      ],
      wallHeight: 18,
    },
    bumps: [
      { x: 30, z: 70, r: 12, h: 5 },     // ridge launch
      { x: -30, z: -80, r: 12, h: 5.5 }, // the long float
      { x: 90, z: -110, r: 11, h: 4.5 }, // finish approach hop
    ],
  },
  districts: [
    {
      id: 'shatterpaddock', name: 'THE SHATTERLINE', subtitle: 'Grid on the Glass', dress: 'gulchgate',
      cx: -130, cz: 130, radius: 26, baseHeight: 0,
      faction: 'none', spawnTable: [], maxAlive: 0, respawnDelay: 999, levelOffset: 0,
    },
    {
      id: 'chimebend', name: 'THE CHIME BEND', subtitle: 'The Glass Sings Your Split Times', dress: 'chimefield',
      cx: 0, cz: 10, radius: 24, baseHeight: 0.4,
      faction: 'none', spawnTable: [], maxAlive: 0, respawnDelay: 999, levelOffset: 0,
    },
    {
      id: 'shatterfinish', name: 'THE LONG SHARD', subtitle: 'Finish Line. Mind the Monoliths.', dress: 'shardsea',
      cx: 130, cz: -140, radius: 28, baseHeight: 0.6,
      faction: 'none', spawnTable: [], maxAlive: 0, respawnDelay: 999, levelOffset: 0,
    },
  ],
  pois: [
    { id: 'buggy_sh', kind: 'buggy', x: -122, z: 122, rot: -0.9 },
    { id: 'sign_sh1', kind: 'sign', x: -136, z: 118, rot: 0.4, data: 'THE SHATTERLINE — DOWNHILL, ONE WAY, LOW GRAVITY. BRAKES OPTIONAL.' },
    { id: 'sign_sh2', kind: 'sign', x: -124, z: 138, rot: -0.5, data: 'HANG TIME RECORD: 4.6s. THE GLASS REMEMBERS.' },
    { id: 'vent_sh1', kind: 'vent', x: 30, z: 62 },
    { id: 'vent_sh2', kind: 'vent', x: -36, z: -72 },
    { id: 'vent_sh3', kind: 'vent', x: 96, z: -104 },
  ],
  spawn: { x: -124, z: 124 },
  exits: [],
};

// ===========================================================================
// PLANET 4 GP — THE JAR RUN. Voltholm's linear storm gauntlet: a tailwind
// gale straight, an S through the rod forest while SKYFALL hammers the
// track, and a crater hop into the Eyewall rim. One direction. One try.
const JARRUN_PATH = [
  { x: -140, z: -20 },
  { x: -95, z: 30 },
  { x: -30, z: 45 },
  { x: 40, z: 45 },
  { x: 80, z: 10 },
  { x: 60, z: -45 },
  { x: 110, z: -85 },
  { x: 150, z: -120 },
];

const VOLT_GP: WorldDef = {
  id: 'volt_gp',
  name: 'THE JAR RUN',
  tagline: 'ride the wind. dodge the invoice.',
  size: 340,
  skyTop: 0x1a2438,
  skyHorizon: 0x8a9a68,
  sun: { color: 0xd8e2c0, intensity: 1.55, dirX: 0.35, dirY: 0.75, dirZ: -0.4 },
  ambient: { sky: 0x8a9ab8, ground: 0x4a5248, intensity: 1.15 },
  fog: { color: 0x6a7868, near: 90, far: 380 },
  biome: {
    ground: { base: '#5a6858', light: '#7d8a72', dark: '#38423a', crack: 'rgba(210,230,120,0.35)' },
    rock: '#55605c',
    scrub: 0x7a9a4a,
    ambientParticle: 'rain',
    trees: 'burnt',
    aurora: false,
    weeds: true,
    rim: 'slate',
    groundLife: 'sedge',
  },
  gales: [
    { x0: -95, z0: 30, x1: 40, z1: 45, width: 10, power: 15 },  // the tailwind straight
    { x0: 60, z0: -45, x1: 110, z1: -85, width: 9, power: 12 }, // the second push
  ],
  storm: { period: 26, warn: 3, strikes: 6 },
  terrain: {
    duneAmp: 1.0,
    roughAmp: 0.8,
    roads: [],
    corridor: {
      pts: JARRUN_PATH,
      width: 16,
      arenas: [
        { x: -140, z: -20, r: 26 },
        { x: 80, z: 10, r: 24 },
        { x: 150, z: -120, r: 28 },
      ],
      wallHeight: 16,
    },
    bumps: [
      { x: 80, z: 10, r: 12, h: 4.5 },    // rod-forest crest
      { x: 110, z: -85, r: 12, h: 5 },    // crater hop
    ],
  },
  districts: [
    {
      id: 'jarpaddock', name: 'THE JAR RUN', subtitle: 'Grid Under a Bad Sky', dress: 'gulchgate',
      cx: -140, cz: -20, radius: 26, baseHeight: 0,
      faction: 'none', spawnTable: [], maxAlive: 0, respawnDelay: 999, levelOffset: 0,
    },
    {
      id: 'rodforest', name: 'THE ROD FOREST', subtitle: 'Every Tree Is a Lightning Rod. On Purpose.', dress: 'conductorrow',
      cx: 80, cz: 10, radius: 26, baseHeight: 0.4,
      faction: 'none', spawnTable: [], maxAlive: 0, respawnDelay: 999, levelOffset: 0,
    },
    {
      id: 'eyerim', name: 'THE EYEWALL RIM', subtitle: 'Finish Inside the Weather', dress: 'eyewall',
      cx: 150, cz: -120, radius: 28, baseHeight: -0.2,
      faction: 'none', spawnTable: [], maxAlive: 0, respawnDelay: 999, levelOffset: 0,
    },
  ],
  pois: [
    { id: 'buggy_jr', kind: 'buggy', x: -132, z: -28, rot: 0.6 },
    { id: 'sign_jr1', kind: 'sign', x: -146, z: -32, rot: 0.3, data: 'THE JAR RUN — ONE WAY. THE WIND DRIVES WITH YOU. THE SKY DOES NOT.' },
    { id: 'sign_jr2', kind: 'sign', x: -134, z: -8, rot: -0.4, data: 'SKYFALL SCHEDULE: OFTEN. HUG THE RODS.' },
    { id: 'rod_jr1', kind: 'rod', x: -95, z: 36 },
    { id: 'rod_jr2', kind: 'rod', x: -28, z: 52 },
    { id: 'rod_jr3', kind: 'rod', x: 46, z: 51 },
    { id: 'rod_jr4', kind: 'rod', x: 86, z: 16 },
    { id: 'rod_jr5', kind: 'rod', x: 64, z: -52 },
    { id: 'rod_jr6', kind: 'rod', x: 116, z: -90 },
    { id: 'vent_jr1', kind: 'vent', x: 74, z: 2 },
    { id: 'vent_jr2', kind: 'vent', x: 104, z: -78 },
  ],
  spawn: { x: -132, z: -24 },
  exits: [],
};

// ===========================================================================
// VOLTHOLM SIDE ZONE — THE BECALMED. The night the crews wired in, one
// stretch of the flats went silent and STAYED silent: no gales, no SKYFALL,
// twenty years of dead air. Harvest kites hang overhead where the wind left
// them, mid-flight, refusing to fall. The Galebound who wander in stop
// harvesting and start SLEEPWALKING. And at the dead centre, the wind that
// went missing is all in one place — held, coiled, and breathing very
// slowly. Gimmick inversion: the zone INHALES — every wind channel points
// inward, toward the thing at the middle.
const VOLT_STILL: WorldDef = {
  id: 'volt_still',
  name: 'THE BECALMED',
  tagline: 'the wind isn’t gone. it’s HELD.',
  size: 240,
  skyTop: 0x141a26,
  skyHorizon: 0x6a7460,
  sun: { color: 0xb8c2a8, intensity: 1.25, dirX: 0.2, dirY: 0.8, dirZ: -0.3 },
  ambient: { sky: 0x6a7a90, ground: 0x3a423c, intensity: 1.0 },
  fog: { color: 0x49544c, near: 40, far: 210 },
  biome: {
    ground: { base: '#4a5548', light: '#66705e', dark: '#2c342e', crack: 'rgba(170,216,200,0.3)' },
    rock: '#48524e',
    scrub: 0x5a7a44,
    ambientParticle: 'spore', // dust hanging in dead air, lit from nowhere
    trees: 'burnt',
    aurora: false,
    weeds: true,
    rim: 'barrow',
    groundLife: 'reeds',
  },
  // THE INHALE: every channel runs INWARD to the Held Breath's hall
  gales: [
    { x0: -8, z0: 96, x1: -2, z1: -52, width: 7, power: 8 },
    { x0: -92, z0: -18, x1: -12, z1: -58, width: 7, power: 8 },
    { x0: 84, z0: -30, x1: 8, z1: -60, width: 7, power: 8 },
  ],
  terrain: {
    duneAmp: 0.9,
    roughAmp: 0.9,
    roads: [
      { x0: 0, z0: 100, x1: 0, z1: -62 },
      { x0: -84, z0: -12, x1: 0, z1: -50 },
      { x0: 78, z0: -24, x1: 0, z1: -52 },
    ],
  },
  districts: [
    {
      id: 'stillgate', name: 'THE STILLING GATE', subtitle: 'Last Weather for Twenty Years. Mind the Quiet.', dress: 'stillgate',
      cx: 0, cz: 92, radius: 24, baseHeight: 0.4,
      faction: 'none', spawnTable: [], maxAlive: 0, respawnDelay: 999, levelOffset: 17,
    },
    {
      id: 'hangfields', name: 'THE HANG FIELDS', subtitle: 'The Kites Never Landed.', dress: 'hangfields',
      cx: -66, cz: -4, radius: 40, baseHeight: 0.6,
      faction: 'galebound',
      spawnTable: [
        { enemyId: 'sleepwalker', weight: 26 },
        { enemyId: 'breathless', weight: 18 },
        { enemyId: 'zephyrite', weight: 10 },
        { enemyId: 'ballast_golem', weight: 6 },
      ],
      maxAlive: 8, respawnDelay: 16, levelOffset: 18,
    },
    {
      id: 'barrowline', name: 'THE BARROW LINE', subtitle: 'Where the Crews Lie Down. Standing Up.', dress: 'barrowline',
      cx: 64, cz: -16, radius: 38, baseHeight: 0.8,
      faction: 'galebound',
      spawnTable: [
        { enemyId: 'sleepwalker', weight: 24 },
        { enemyId: 'breathless', weight: 18 },
        { enemyId: 'thunderhead', weight: 8 },
        { enemyId: 'ballast_golem', weight: 8 },
      ],
      maxAlive: 8, respawnDelay: 17, levelOffset: 19,
    },
    {
      id: 'breathhall', name: 'THE HELD BREATH', subtitle: 'Twenty Years of Weather, In One Room.', dress: 'breathhall',
      cx: 0, cz: -86, radius: 30, baseHeight: -0.3,
      faction: 'none', spawnTable: [], maxAlive: 0, respawnDelay: 999, levelOffset: 20,
    },
  ],
  pois: [
    { id: 'ft_still', kind: 'fast_travel', x: 6, z: 96, data: 'The Stilling Gate' },
    { id: 'npc_bet', kind: 'npc', x: -6, z: 86, rot: 2.4, data: 'bet' },
    { id: 'vm_st', kind: 'vendor_med', x: 12, z: 88, rot: -1.3 },
    { id: 'vg_st', kind: 'vendor_gun', x: -14, z: 92, rot: 1.1 },
    { id: 'sign_st1', kind: 'sign', x: 0, z: 76, rot: 0.1, data: 'THE BECALMED — NO WIND. NO STORM. NO REFUNDS ON QUIET.' },
    { id: 'sign_st2', kind: 'sign', x: -40, z: -16, rot: 0.6, data: '← HANG FIELDS · BARROW LINE → · BREATHE SOFT' },
    { id: 'chest_st1', kind: 'chest', x: -80, z: -14, rot: 0.7 },
    { id: 'chest_st2', kind: 'chest', x: 76, z: -30, rot: -1.2 },
    { id: 'chest_st3', kind: 'chest', x: 8, z: -74, rot: 2.0 },
    { id: 'log_st1', kind: 'wirelog', x: -54, z: 4, data: 'log_still1' },
    { id: 'log_st2', kind: 'wirelog', x: 52, z: -8, data: 'log_still2' },
  ],
  spawn: { x: 0, z: 100 },
  exits: [],
};

// ===========================================================================
// CLAUDE PRIME SIDE ZONE — THE AUGER. Helix Bore Site One: the Combine's
// first and deepest hole, abandoned mid-shift when the drill broke into
// something that hummed back. The whole zone is ONE descending spiral — a
// thread of road cut two and a half turns down a pit wall, past the parked
// machines, to the drill head still standing at the bottom. No other map is
// shaped like this: you can always see where you're going (down) and where
// you've been (up, behind you, getting further away).
const AUGER_SPIRAL = [
  { x: 102, z: 0 }, { x: 89, z: 44 }, { x: 59, z: 77 }, { x: 18, z: 93 },
  { x: -25, z: 88 }, { x: -60, z: 66 }, { x: -80, z: 32 }, { x: -84, z: -7 },
  { x: -69, z: -42 }, { x: -42, z: -66 }, { x: -8, z: -76 }, { x: 26, z: -69 },
  { x: 52, z: -48 }, { x: 65, z: -20 }, { x: 65, z: 11 }, { x: 51, z: 37 },
  { x: 28, z: 54 }, { x: 1, z: 58 }, { x: -24, z: 50 }, { x: -41, z: 33 },
  { x: -49, z: 10 }, { x: -46, z: -12 }, { x: -34, z: -29 }, { x: -16, z: -39 },
  { x: 2, z: -40 }, { x: 19, z: -32 }, { x: 29, z: -19 }, { x: 32, z: -4 },
  { x: 28, z: 10 }, { x: 19, z: 19 }, { x: 7, z: 23 },
];

const AUGER: WorldDef = {
  id: 'auger',
  name: 'THE AUGER',
  tagline: 'the Combine\u2019s deepest hole. the shift never clocked out.',
  size: 250,
  skyTop: 0x2a1e14,
  skyHorizon: 0x8a6a3a,
  sun: { color: 0xffc890, intensity: 1.3, dirX: 0.5, dirY: 0.6, dirZ: -0.3 },
  ambient: { sky: 0x8a7458, ground: 0x3a2e24, intensity: 1.05 },
  fog: { color: 0x5a4630, near: 45, far: 230 },
  biome: {
    ground: { base: '#6a5238', light: '#8a6c48', dark: '#42311e', crack: 'rgba(84,212,255,0.3)' },
    rock: '#5c4a34',
    scrub: 0x7a6a3a,
    ambientParticle: 'ash', // bore dust, never settled
    trees: 'burnt',
    aurora: false,
    weeds: false,
  },
  terrain: {
    duneAmp: 0.7,
    roughAmp: 0.7,
    // the thread itself is a graded haul ROAD — a visible dirt band winding
    // down the spiral (subsampled so the height pass stays cheap)
    roads: AUGER_SPIRAL.slice(0, -1).filter((_, i) => i % 2 === 0).map((pt, i, arr) => {
      const next = AUGER_SPIRAL[Math.min(AUGER_SPIRAL.indexOf(pt) + 2, AUGER_SPIRAL.length - 1)];
      return { x0: pt.x, z0: pt.z, x1: next.x, z1: next.z };
    }),
    corridor: {
      pts: AUGER_SPIRAL,
      width: 10,
      arenas: [
        { x: 102, z: 0, r: 24 },  // the gate pad
        { x: 0, z: 0, r: 30 },    // the drill floor
      ],
      wallHeight: 24,
    },
  },
  districts: [
    {
      id: 'boregate', name: 'BORE SITE ONE — GATE', subtitle: 'Helix Property. Claim Pending (11 Years).', dress: 'boregate',
      cx: 102, cz: 0, radius: 26, baseHeight: 0.6,
      faction: 'none', spawnTable: [], maxAlive: 0, respawnDelay: 999, levelOffset: 9,
    },
    {
      id: 'threadway1', name: 'THE UPPER THREAD', subtitle: 'Machines Parked Mid-Turn.', dress: 'threadway',
      cx: -60, cz: 66, radius: 26, baseHeight: -5,
      faction: 'helix',
      spawnTable: [
        { enemyId: 'helix_drone', weight: 20 },
        { enemyId: 'helix_stinger', weight: 18 },
        { enemyId: 'lattice_warden', weight: 8 },
      ],
      maxAlive: 7, respawnDelay: 16, levelOffset: 10,
    },
    {
      id: 'threadway2', name: 'THE LOWER THREAD', subtitle: 'The Hum Gets Personal Down Here.', dress: 'threadway',
      cx: 52, cz: -48, radius: 26, baseHeight: -11,
      faction: 'hollow',
      spawnTable: [
        { enemyId: 'gloomstalker', weight: 20 },
        { enemyId: 'shardcaster', weight: 16 },
        { enemyId: 'gravemite', weight: 14 },
        { enemyId: 'spitgrub', weight: 10 },
      ],
      maxAlive: 7, respawnDelay: 16, levelOffset: 11,
    },
    {
      id: 'coreworks', name: 'THE DRILL FLOOR', subtitle: 'It Broke Through. Something Answered.', dress: 'coreworks',
      cx: 0, cz: 0, radius: 32, baseHeight: -17,
      faction: 'hollow',
      spawnTable: [
        { enemyId: 'gloomstalker', weight: 16 },
        { enemyId: 'lantern_wisp', weight: 12 },
        { enemyId: 'deep_roller', weight: 8 },
      ],
      maxAlive: 6, respawnDelay: 18, levelOffset: 12,
    },
  ],
  pois: [
    { id: 'ft_auger', kind: 'fast_travel', x: 108, z: 8, data: 'Bore Site One' },
    { id: 'vm_au', kind: 'vendor_med', x: 96, z: -8, rot: 0.8 },
    { id: 'vg_au', kind: 'vendor_gun', x: 110, z: -4, rot: -1.6 },
    { id: 'sign_au1', kind: 'sign', x: 100, z: 12, rot: -0.4, data: 'BORE SITE ONE \u2014 SPIRAL GRADE 8%. NO SPRINTING ON THE THREAD. (EVERYONE SPRINTS.)' },
    { id: 'sign_au2', kind: 'sign', x: 60, z: 74, rot: 0.9, data: 'DEPTH MARKER \u2014 TURN ONE. THE HUM IS NORMAL. THE ANSWERING IS NOT.' },
    { id: 'chest_au1', kind: 'chest', x: -78, z: 40, rot: 1.2 },
    { id: 'chest_au2', kind: 'chest', x: 60, z: -34, rot: -0.7 },
    { id: 'chest_au3', kind: 'chest', x: -8, z: 12, rot: 2.4 },
    { id: 'log_au1', kind: 'wirelog', x: -80, z: 20, data: 'log_auger1' },
    { id: 'log_au2', kind: 'wirelog', x: 8, z: -14, data: 'log_auger2' },
  ],
  spawn: { x: 108, z: 2 },
  exits: [],
};

// ===========================================================================
// VELDT MINOR SIDE ZONE — THE TERRACES. The Verdant's oldest garden: a
// staircase of flooded paddies carved up a canyon long before the tribe
// found religion, each step spilling a waterfall onto the one below. You
// climb the whole zone — five terraces, five falls — and the map's shape IS
// the pilgrimage: switchback up through planted rows to the Garden Crown,
// where the idols keep their eyes on the harvest. Mirror of the Auger:
// that one screws down into the dark; this one stairs up into the light.
const STAIRS_PATH = [
  { x: 0, z: 100 }, { x: -6, z: 78 }, { x: -25, z: 62 }, { x: 12, z: 48 },
  { x: 25, z: 34 }, { x: -14, z: 20 }, { x: -25, z: 6 }, { x: 14, z: -10 },
  { x: 25, z: -24 }, { x: -12, z: -40 }, { x: -20, z: -54 }, { x: 6, z: -68 },
  { x: 0, z: -82 },
];

const VELDT_STAIRS: WorldDef = {
  id: 'veldt_stairs',
  name: 'THE TERRACES',
  tagline: 'five steps. five falls. the garden climbs with you.',
  size: 240,
  skyTop: 0x2a6a9a,
  skyHorizon: 0xc8e8b8,
  sun: { color: 0xfff2c8, intensity: 1.9, dirX: -0.35, dirY: 0.75, dirZ: 0.3 },
  ambient: { sky: 0x8ac8c0, ground: 0x3a5a34, intensity: 1.2 },
  fog: { color: 0x9ac8a8, near: 55, far: 260 },
  biome: {
    ground: { base: '#4a7a3a', light: '#6a9a4c', dark: '#2e5228', crack: 'rgba(40,80,50,0.4)' },
    rock: '#5f7d4b',
    scrub: 0x4a9a3a,
    ambientParticle: 'dust',
    trees: 'palm',
    aurora: false,
    weeds: false,
    rim: 'jungle',
    groundLife: 'fern',
  },
  terrain: {
    duneAmp: 0.6,
    roughAmp: 0.6,
    roads: [],
    corridor: {
      pts: STAIRS_PATH,
      width: 14,
      arenas: [
        { x: 0, z: 92, r: 26 },
        { x: 0, z: -74, r: 28 },
      ],
      wallHeight: 34,
    },
  },
  districts: [
    {
      id: 'paddygate', name: 'THE PADDY GATE', subtitle: 'Dr. Calla\u2019s Field Camp. Mind the Seedlings.', dress: 'paddygate',
      cx: 0, cz: 88, radius: 28, baseHeight: 0.5,
      faction: 'none', spawnTable: [], maxAlive: 0, respawnDelay: 999, levelOffset: 8,
    },
    {
      id: 'terrace1', name: 'THE FIRST STEP', subtitle: 'Planted Before the Drums.', dress: 'terrace',
      cx: 0, cz: 48, radius: 27, baseHeight: 6,
      faction: 'verdant',
      spawnTable: [
        { enemyId: 'frond_stalker', weight: 20 },
        { enemyId: 'sporeling', weight: 16 },
        { enemyId: 'dartlurker', weight: 12 },
      ],
      maxAlive: 7, respawnDelay: 16, levelOffset: 9,
    },
    {
      id: 'terrace2', name: 'THE THIRD STEP', subtitle: 'The Shamans Sing the Water Uphill.', dress: 'terrace',
      cx: 0, cz: 4, radius: 27, baseHeight: 13,
      faction: 'verdant',
      spawnTable: [
        { enemyId: 'shaman', weight: 16 },
        { enemyId: 'razorbeak', weight: 14 },
        { enemyId: 'frond_stalker', weight: 12 },
        { enemyId: 'thorn_hurler', weight: 10 },
      ],
      maxAlive: 7, respawnDelay: 16, levelOffset: 10,
    },
    {
      id: 'terrace3', name: 'THE FIFTH STEP', subtitle: 'Almost Holy Ground. Wipe Your Boots.', dress: 'terrace',
      cx: 0, cz: -36, radius: 27, baseHeight: 20,
      faction: 'verdant',
      spawnTable: [
        { enemyId: 'totem_bruiser', weight: 12 },
        { enemyId: 'thorn_hurler', weight: 14 },
        { enemyId: 'shaman', weight: 12 },
        { enemyId: 'razorbeak', weight: 10 },
      ],
      maxAlive: 7, respawnDelay: 17, levelOffset: 11,
    },
    {
      id: 'gardencrown', name: 'THE GARDEN CROWN', subtitle: 'The Idols Watch the Harvest. Now They Watch You.', dress: 'gardencrown',
      cx: 0, cz: -74, radius: 30, baseHeight: 27,
      faction: 'verdant',
      spawnTable: [
        { enemyId: 'totem_bruiser', weight: 10 },
        { enemyId: 'shaman', weight: 10 },
      ],
      maxAlive: 5, respawnDelay: 18, levelOffset: 12,
    },
  ],
  pois: [
    { id: 'ft_stairs', kind: 'fast_travel', x: 8, z: 94, data: 'The Paddy Gate' },
    // vendors share a row east of the walkway — the tent got the west side
    { id: 'vm_ts', kind: 'vendor_med', x: 17, z: 90, rot: -1.9 },
    { id: 'vg_ts', kind: 'vendor_gun', x: 14, z: 84, rot: -1.2 },
    { id: 'sign_ts1', kind: 'sign', x: 0, z: 76, rot: 0.1, data: 'THE TERRACES \u2014 FIVE STEPS UP. THE WATER COMES DOWN. TAKE TURNS.' },
    { id: 'sign_ts2', kind: 'sign', x: 8, z: 2, rot: -0.6, data: 'STEP THREE \u2014 NO SAMPLING THE SACRED PADDIES. (DR. CALLA. YES, YOU.)' },
    { id: 'chest_ts1', kind: 'chest', x: -10, z: 54, rot: 0.8 },
    { id: 'chest_ts2', kind: 'chest', x: 10, z: -2, rot: -1.0 },
    { id: 'chest_ts3', kind: 'chest', x: -8, z: -68, rot: 2.2 },
    { id: 'log_ts1', kind: 'wirelog', x: -12, z: 52, data: 'log_stairs1' },
    { id: 'log_ts2', kind: 'wirelog', x: -10, z: -34, data: 'log_stairs2' },
  ],
  spawn: { x: 0, z: 96 },
  exits: [],
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
  veldt_gp: VELDT_GP,
  vitra: VITRA,
  vitra_mile: VITRA_MILE,
  voltholm: VOLTHOLM,
  vitra_gp: VITRA_GP,
  volt_gp: VOLT_GP,
  volt_still: VOLT_STILL,
  auger: AUGER,
  veldt_stairs: VELDT_STAIRS,
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

/** Net gale-channel wind at a point on the active map: a unit direction
 *  along the channel scaled by power, fading toward the channel's edges.
 *  Null when the point sits in still air (or the map has no gales). */
export function galeAt(x: number, z: number): { x: number; z: number } | null {
  const gales = active.gales;
  if (!gales) return null;
  let best: { x: number; z: number } | null = null;
  let bestStrength = 0;
  for (const g of gales) {
    const d = distToSegment(x, z, g);
    if (d >= g.width) continue;
    const falloff = 1 - (d / g.width) * (d / g.width); // full force mid-channel
    const len = Math.hypot(g.x1 - g.x0, g.z1 - g.z0) || 1;
    const s = g.power * falloff;
    if (s > bestStrength) {
      bestStrength = s;
      best = { x: ((g.x1 - g.x0) / len) * s, z: ((g.z1 - g.z0) / len) * s };
    }
  }
  return best;
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
