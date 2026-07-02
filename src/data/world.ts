// The Claudelands world registry — pass 3. Multiple maps, each a WorldDef:
// districts, POIs, biome palette (feeds the same procedural texture system),
// and analytic terrain parameters. terrainHeight()/districtAt()/roadFactor()
// read the ACTIVE map, so every system keeps calling the same functions
// across map switches. Adding a map = adding a def here + district dressing
// tags that game/world.ts knows how to build.

import { clamp01, lerp } from '../util/maff';

export type DistrictDress = 'hub' | 'fort' | 'boneyard' | 'slagflats' | 'throne' | 'frosthub' | 'pinebreak' | 'fathom' | 'icebox';

export interface DistrictDef {
  id: string;
  name: string;
  subtitle: string;
  dress: DistrictDress;
  cx: number; cz: number; radius: number;
  baseHeight: number;
  faction: 'rustborn' | 'helix' | 'frostborn' | 'none';
  spawnTable: { enemyId: string; weight: number }[];
  maxAlive: number;
  respawnDelay: number;
  levelOffset: number;
}

export interface WorldPoi {
  id: string;
  kind: 'chest' | 'vendor_gun' | 'vendor_med' | 'fast_travel' | 'wirelog' | 'npc' | 'gate' | 'sign';
  x: number; z: number; rot?: number;
  data?: string;
}

export interface BiomeDef {
  ground: { base: string; light: string; dark: string; crack: string };
  rock: string;
  scrub: number;               // scrub tuft color
  ambientParticle: 'dust' | 'snow';
  trees: 'cactus' | 'pine';
  aurora: boolean;
  weeds: boolean;              // tumbleweeds roam
}

export interface WorldDef {
  id: string;
  name: string;
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
  };
  districts: DistrictDef[];
  pois: WorldPoi[];
  spawn: { x: number; z: number };
}

// ===========================================================================
// MAP 1 — THE CLAUDELANDS (sun-blasted scrap canyon)
export const CLAUDELANDS: WorldDef = {
  id: 'claudelands',
  name: 'THE CLAUDELANDS',
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
};

// ===========================================================================
// MAP 2 — THE FROSTHOLLOW (frozen highland; a Helix terraformer misfired
// here decades ago and winter never left)
export const FROSTHOLLOW: WorldDef = {
  id: 'frosthollow',
  name: 'THE FROSTHOLLOW',
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
      maxAlive: 7, respawnDelay: 16, levelOffset: 4,
    },
    {
      id: 'fathom', name: 'THE FROZEN FATHOM', subtitle: 'Thick Ice. Thin Promises.', dress: 'fathom',
      cx: 60, cz: -14, radius: 42, baseHeight: -0.2,
      faction: 'frostborn',
      spawnTable: [
        { enemyId: 'frost_shrike', weight: 22 }, { enemyId: 'snowmad', weight: 16 },
        { enemyId: 'frostmutt', weight: 14 }, { enemyId: 'icicle_lobber', weight: 10 },
      ],
      maxAlive: 6, respawnDelay: 18, levelOffset: 5,
    },
    {
      id: 'icebox', name: 'THE ICEBOX', subtitle: 'Where Winter Keeps Its Leftovers.', dress: 'icebox',
      cx: 0, cz: -82, radius: 32, baseHeight: 3.4,
      faction: 'none', spawnTable: [], maxAlive: 0, respawnDelay: 999, levelOffset: 6,
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
};

export const MAPS: Record<string, WorldDef> = {
  claudelands: CLAUDELANDS,
  frosthollow: FROSTHOLLOW,
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

export function terrainHeight(x: number, z: number): number {
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

  const road = roadFactor(x, z);
  if (road > 0) {
    h = lerp(h, Math.min(h, 0.25 + h * 0.35), road);
  }
  return h;
}

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
