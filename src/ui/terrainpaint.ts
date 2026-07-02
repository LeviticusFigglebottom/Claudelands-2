// Shared top-down painted terrain for the full map and the minimap backdrop.
// Cached per map. Orientation matches the in-world camera chirality: north
// (+z) is up and +x is to the LEFT — so what you see on your left when facing
// north is on the map's left. All map consumers must use the same mapping:
//   px = (half - wx) / (2*half) * RES,  py = (half - wz) / (2*half) * RES

import { WORLD, meshHeight, roadFactor } from '../data/world';

export const MAP_RES = 384;

export function mapHalf(): number {
  return WORLD.size / 2 + 24;
}

const cache = new Map<string, HTMLCanvasElement>();

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function paintedTerrain(): HTMLCanvasElement {
  const cached = cache.get(WORLD.id);
  if (cached) return cached;
  const RES = MAP_RES;
  const c = document.createElement('canvas');
  c.width = c.height = RES;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(RES, RES);
  const half = mapHalf();
  const g = WORLD.biome.ground;
  const dark = hexToRgb(g.dark), base = hexToRgb(g.base), light = hexToRgb(g.light);
  const rock = hexToRgb(WORLD.biome.rock);
  const lake = WORLD.terrain.lake;
  const mix = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] =>
    [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

  for (let py = 0; py < RES; py++) {
    const wz = half - (py / RES) * half * 2;
    for (let px = 0; px < RES; px++) {
      const wx = half - (px / RES) * half * 2;
      const h = meshHeight(wx, wz);
      let col: [number, number, number];
      if (h > 10) {
        // ridge walls / summits read as rock, darkening with height
        col = mix(rock, [rock[0] * 0.45, rock[1] * 0.45, rock[2] * 0.45], Math.min(1, (h - 10) / 12));
      } else {
        const t = Math.max(0, Math.min(1, h / 6));
        col = t < 0.5 ? mix(dark, base, t * 2) : mix(base, light, (t - 0.5) * 2);
      }
      // topographic contour lines every 2.5m of elevation
      if (h > 0.8) {
        const band = ((h / 2.5) % 1 + 1) % 1;
        if (band < 0.1) col = mix(col, [col[0] * 0.72, col[1] * 0.72, col[2] * 0.72], 0.8);
      }
      if (lake) {
        const ld = Math.hypot(wx - lake.x, wz - lake.z);
        if (ld < lake.r) {
          const deep = Math.min(1, (lake.r - ld) / (lake.r * 0.5));
          col = mix(col, mix([148, 196, 220], [70, 120, 168], deep), 0.85);
        } else if (ld < lake.r + 2.5) {
          col = mix(col, [235, 240, 240], 0.5); // shoreline
        }
      }
      const road = roadFactor(wx, wz);
      if (road > 0.2) {
        // packed dirt track: warm and readable, not a black smear
        col = mix(col, [col[0] * 0.72 + 24, col[1] * 0.68 + 16, col[2] * 0.62 + 8], Math.min(1, road) * 0.75);
      }
      // hillshade (light from map upper-left)
      const shade = Math.max(0.55, Math.min(1.3,
        1 + (meshHeight(wx + 1.4, wz) - meshHeight(wx - 1.4, wz)) * 0.16
          + (meshHeight(wx, wz + 1.4) - meshHeight(wx, wz - 1.4)) * 0.1));
      const i = (py * RES + px) * 4;
      img.data[i] = Math.min(255, col[0] * shade);
      img.data[i + 1] = Math.min(255, col[1] * shade);
      img.data[i + 2] = Math.min(255, col[2] * shade);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  cache.set(WORLD.id, c);
  return c;
}
