// Zone definition for the vertical-slice arena: GULLY SEVEN, a Rustborn
// squatter-fort at the bottom of a dry canyon. World-building is data-first:
// spawn tables, POIs, prop clusters, and dressing all live here so pass 2
// adds zones by adding files like this one, not by editing world code.

export interface SpawnWave {
  budget: number;              // total spawn weight to spend
  delay: number;               // seconds after wave-start trigger
}

export interface ZonePoi {
  id: string;
  kind: 'chest' | 'vendor_gun' | 'vendor_med' | 'fast_travel' | 'wirelog' | 'spawner' | 'boss_gate';
  x: number; z: number; rot?: number;
  data?: string;               // e.g. wirelog id
}

export interface ZoneDef {
  id: string;
  name: string;
  subtitle: string;
  size: number;                // arena is size x size meters
  skyTop: number; skyHorizon: number;
  sun: { color: number; intensity: number; dirX: number; dirY: number; dirZ: number };
  ambient: { sky: number; ground: number; intensity: number };
  fog: { color: number; near: number; far: number };
  spawnTable: { enemyId: string; weight: number }[];
  waves: SpawnWave[];
  maxAlive: number;
  pois: ZonePoi[];
}

export const GULLY_SEVEN: ZoneDef = {
  id: 'gully7',
  name: 'GULLY SEVEN',
  subtitle: 'Sovereign Territory of His Trashjesty, the Grand Duke',
  size: 110,
  skyTop: 0x3f7ac8,
  skyHorizon: 0xd8b070,
  sun: { color: 0xffe8c0, intensity: 2.6, dirX: -0.55, dirY: 0.8, dirZ: 0.3 },
  ambient: { sky: 0x9ab4d8, ground: 0x8a6a48, intensity: 1.1 },
  fog: { color: 0xc8a878, near: 60, far: 220 },
  spawnTable: [
    { enemyId: 'rustpunk', weight: 30 },
    { enemyId: 'scrapmutt', weight: 26 },
    { enemyId: 'shieldhead', weight: 14 },
    { enemyId: 'lobber', weight: 10 },
    { enemyId: 'boilerbruiser', weight: 7 },
  ],
  waves: [
    { budget: 60, delay: 6 },
    { budget: 90, delay: 30 },
    { budget: 120, delay: 60 },
  ],
  maxAlive: 8,
  pois: [
    { id: 'ft1', kind: 'fast_travel', x: 0, z: 42, rot: Math.PI },
    { id: 'vg1', kind: 'vendor_gun', x: -7, z: 38, rot: Math.PI },
    { id: 'vm1', kind: 'vendor_med', x: 7, z: 38, rot: Math.PI },
    { id: 'chest1', kind: 'chest', x: -30, z: -26, rot: 0.6 },
    { id: 'chest2', kind: 'chest', x: 34, z: -30, rot: -2.2 },
    { id: 'log1', kind: 'wirelog', x: -34, z: 8, data: 'log_foreman1' },
    { id: 'log2', kind: 'wirelog', x: 26, z: 20, data: 'log_zaza1' },
    { id: 'log3', kind: 'wirelog', x: 4, z: -38, data: 'log_rustborn1' },
    { id: 'sp1', kind: 'spawner', x: -36, z: -36 },
    { id: 'sp2', kind: 'spawner', x: 38, z: -34 },
    { id: 'sp3', kind: 'spawner', x: -40, z: 24 },
    { id: 'sp4', kind: 'spawner', x: 42, z: 16 },
    { id: 'boss1', kind: 'boss_gate', x: 0, z: -44 },
  ],
};
