// Seeded RNG (mulberry32) — every generated item carries its seed so a roll
// is reproducible from (seed, level). Also the home of weighted-table picks,
// which the whole loot system leans on.

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let seedCounter = (Date.now() ^ 0xbeef) >>> 0;
export function freshSeed(): number {
  seedCounter = (seedCounter * 1664525 + 1013904223) >>> 0;
  return seedCounter ^ ((Math.random() * 0xffffffff) >>> 0);
}

export function pick<T>(rng: Rng, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

export function range(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min);
}

export function irange(rng: Rng, min: number, max: number): number {
  return Math.floor(range(rng, min, max + 1));
}

export function chance(rng: Rng, p: number): boolean {
  return rng() < p;
}

export interface Weighted<T> { item: T; w: number }

export function weightedPick<T>(rng: Rng, table: readonly Weighted<T>[]): T {
  let total = 0;
  for (const e of table) total += e.w;
  let r = rng() * total;
  for (const e of table) {
    r -= e.w;
    if (r <= 0) return e.item;
  }
  return table[table.length - 1].item;
}

/** Shuffle a copy. */
export function shuffled<T>(rng: Rng, arr: readonly T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
