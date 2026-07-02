// The Claudelands world definition — pass 2. One large heightfield map split
// into districts, each with its own population, level band, dressing, and
// spawn rules. World layout, POIs, and the analytic terrain function live
// here; game/world.ts consumes all of it. Adding a district = adding rows.

import { clamp01, lerp } from '../util/maff';

export interface DistrictDef {
  id: string;
  name: string;
  subtitle: string;
  cx: number; cz: number; radius: number;
  baseHeight: number;
  faction: 'rustborn' | 'helix' | 'none';
  spawnTable: { enemyId: string; weight: number }[];
  maxAlive: number;
  respawnDelay: number;     // seconds between repopulation attempts
  levelOffset: number;      // enemy level = player level + offset
}

export interface WorldPoi {
  id: string;
  kind: 'chest' | 'vendor_gun' | 'vendor_med' | 'fast_travel' | 'wirelog' | 'npc' | 'gate' | 'sign';
  x: number; z: number; rot?: number;
  data?: string;            // wirelog id / npc id / station name / sign text
}

export interface WorldDef {
  id: string;
  name: string;
  size: number;
  skyTop: number; skyHorizon: number;
  sun: { color: number; intensity: number; dirX: number; dirY: number; dirZ: number };
  ambient: { sky: number; ground: number; intensity: number };
  fog: { color: number; near: number; far: number };
  districts: DistrictDef[];
  pois: WorldPoi[];
}

export const WORLD: WorldDef = {
  id: 'claudelands',
  name: 'THE CLAUDELANDS',
  size: 260,
  skyTop: 0x3f7ac8,
  skyHorizon: 0xd8b070,
  sun: { color: 0xffe8c0, intensity: 2.6, dirX: -0.55, dirY: 0.8, dirZ: 0.3 },
  ambient: { sky: 0x9ab4d8, ground: 0x8a6a48, intensity: 1.1 },
  fog: { color: 0xc8a878, near: 90, far: 340 },
  districts: [
    {
      id: 'gutterlight', name: 'GUTTERLIGHT', subtitle: 'Last Lemonade Before the Wastes',
      cx: 0, cz: 95, radius: 34, baseHeight: 0,
      faction: 'none', spawnTable: [], maxAlive: 0, respawnDelay: 999, levelOffset: 0,
    },
    {
      id: 'gully7', name: 'GULLY SEVEN', subtitle: 'Sovereign Territory of His Trashjesty',
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
      id: 'boneyard', name: 'THE BONEYARD', subtitle: 'Something Big Died Here. Respect It.',
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
      id: 'slagflats', name: 'THE SLAGFLATS', subtitle: 'Helix Combine Property. Trespassers Itemized.',
      cx: 85, cz: -25, radius: 42, baseHeight: 0.6,
      faction: 'helix',
      spawnTable: [
        { enemyId: 'helix_drone', weight: 24 }, { enemyId: 'lattice_warden', weight: 12 },
        { enemyId: 'helix_stinger', weight: 18 },
      ],
      maxAlive: 6, respawnDelay: 18, levelOffset: 2,
    },
    {
      id: 'trashmount', name: 'TRASH MOUNTAIN', subtitle: 'The Throne. Kneel or Duck.',
      cx: 0, cz: -95, radius: 36, baseHeight: 5.5,
      faction: 'none', spawnTable: [], maxAlive: 0, respawnDelay: 999, levelOffset: 3,
    },
  ],
  pois: [
    // -------- Gutterlight (hub)
    { id: 'ft_hub', kind: 'fast_travel', x: 0, z: 102, data: 'Gutterlight Plaza' },
    { id: 'vg1', kind: 'vendor_gun', x: -7, z: 88, rot: Math.PI },
    { id: 'vm1', kind: 'vendor_med', x: 7, z: 88, rot: Math.PI },
    { id: 'npc_quibb', kind: 'npc', x: -3, z: 80, rot: 2.6, data: 'quibb' },
    { id: 'chest_hub', kind: 'chest', x: 15, z: 97, rot: -0.9 },
    { id: 'sign_hub', kind: 'sign', x: 0, z: 72, rot: 0, data: '← BONEYARD · GULLY AHEAD · SLAGFLATS →' },
    // -------- Gully Seven
    { id: 'ft_gully', kind: 'fast_travel', x: 20, z: 30, data: 'Gully Gate' },
    { id: 'chest_g1', kind: 'chest', x: -30, z: -4, rot: 0.6 },
    { id: 'chest_g2', kind: 'chest', x: 26, z: -20, rot: -2.2 },
    { id: 'log1', kind: 'wirelog', x: -34, z: 18, data: 'log_foreman1' },
    { id: 'log2', kind: 'wirelog', x: 10, z: -32, data: 'log_rustborn1' },
    // -------- Boneyard
    { id: 'chest_b1', kind: 'chest', x: -94, z: -30, rot: 1.2 },
    { id: 'log4', kind: 'wirelog', x: -74, z: -2, data: 'log_boneyard' },
    // -------- Slagflats
    { id: 'ft_slag', kind: 'fast_travel', x: 68, z: -6, data: 'Slagflat Rim' },
    { id: 'chest_s1', kind: 'chest', x: 100, z: -38, rot: 2.4 },
    { id: 'log3', kind: 'wirelog', x: 66, z: -40, data: 'log_zaza1' },
    { id: 'log5', kind: 'wirelog', x: 96, z: -12, data: 'log_helix' },
    // -------- Trash Mountain
    { id: 'gate_mount', kind: 'gate', x: 0, z: -58, rot: 0, data: 'trashgate' },
    { id: 'chest_t1', kind: 'chest', x: -10, z: -104, rot: 0.4 },
    { id: 'sign_mount', kind: 'sign', x: 3, z: -54, rot: 0, data: 'NO REGICIDE WITHOUT AN APPOINTMENT' },
  ],
};

export const PLAYER_SPAWN = { x: 0, z: 112 };

// ---------------------------------------------------------------------------
// Terrain: analytic heightfield shared by the mesh builder and every system
// that asks "how high is the ground here" (player, AI, loot, projectiles).

const smooth = (edge0: number, edge1: number, x: number) => {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

/** Crater at the Slagflats boss site: raised rim, sunken dish. */
const CRATER = { x: 88, z: -30, r: 16 };

export function terrainHeight(x: number, z: number): number {
  // rolling dunes
  let h = (Math.sin(x * 0.021 + 1.7) * Math.cos(z * 0.024) * 0.5 + 0.5) * 2.6
    + Math.sin(x * 0.045 + z * 0.037 + 2.2) * 0.7 + 0.7;
  h = Math.max(0, h);

  // crater (applies before district flattening so the rim survives inside slagflats)
  const cd = Math.hypot(x - CRATER.x, z - CRATER.z);
  if (cd < CRATER.r * 1.6) {
    const rim = Math.exp(-((cd - CRATER.r) ** 2) / 14) * 2.2;      // raised lip
    const dish = smooth(CRATER.r, CRATER.r * 0.25, cd) * -1.6;     // sunken middle
    h += rim + dish;
  }

  // districts flatten toward their base height
  for (const d of WORLD.districts) {
    const dist = Math.hypot(x - d.cx, z - d.cz);
    const t = smooth(d.radius, d.radius * 0.55, dist); // 1 well inside, 0 outside
    let target = d.baseHeight;
    if (d.id === 'slagflats' && cd < CRATER.r * 1.6) {
      target += Math.exp(-((cd - CRATER.r) ** 2) / 14) * 2.2 + smooth(CRATER.r, CRATER.r * 0.25, cd) * -1.6;
    }
    if (d.id === 'trashmount') {
      // the mount rises on a cone toward its center
      target = d.baseHeight * smooth(d.radius, d.radius * 0.3, dist) + 0.4;
    }
    h = lerp(h, target, t);
  }

  const road = roadFactor(x, z);
  if (road > 0) {
    // roads follow a gently smoothed version of the terrain, not zero — they cut ruts
    h = lerp(h, Math.min(h, 0.25 + h * 0.35), road);
  }
  return h;
}

/** 0..1 how much (x,z) lies on a road — flattens terrain + tints vertices. */
export function roadFactor(x: number, z: number): number {
  const roadNS = smooth(7, 3, Math.abs(x)) * smooth(-118, -100, z) * smooth(120, 112, z);
  const roadEW = smooth(7, 3, Math.abs(z + 22)) * smooth(-110, -95, x) * smooth(110, 95, x);
  return Math.max(roadNS, roadEW);
}

/** Terrain normal from central differences (for decals, tumbleweed bounce). */
export function terrainNormal(x: number, z: number): { x: number; y: number; z: number } {
  const e = 0.6;
  const hx = terrainHeight(x + e, z) - terrainHeight(x - e, z);
  const hz = terrainHeight(x, z + e) - terrainHeight(x, z - e);
  const nx = -hx / (2 * e), nz = -hz / (2 * e);
  const len = Math.hypot(nx, 1, nz);
  return { x: nx / len, y: 1 / len, z: nz / len };
}

export function districtAt(x: number, z: number): DistrictDef | null {
  for (const d of WORLD.districts) {
    if (Math.hypot(x - d.cx, z - d.cz) < d.radius) return d;
  }
  return null;
}
