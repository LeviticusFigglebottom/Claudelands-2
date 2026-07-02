// Full map panel (M): stylized top-down chart of the active world — district
// circles, roads/corridor, stations, gate, NPCs, quest marker, boss, and the
// player arrow. Drawn from map data, parchment-styled.

import * as THREE from 'three';
import { WORLD, activeMap, meshHeight, roadFactor } from '../data/world';
import { enemySpawner } from '../game/enemies';

// ---------------------------------------------------------------------------
// Painted terrain backdrop — a real top-down colored render of the height-
// field with hillshading, biome palette, roads, lakes, and ridge walls.
// Cached per map (one ~90k-sample paint on first open).
const terrainCache = new Map<string, HTMLCanvasElement>();

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function paintTerrain(): HTMLCanvasElement {
  const cached = terrainCache.get(WORLD.id);
  if (cached) return cached;
  const RES = 320;
  const c = document.createElement('canvas');
  c.width = c.height = RES;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(RES, RES);
  const half = WORLD.size / 2 + 24;
  const g = WORLD.biome.ground;
  const dark = hexToRgb(g.dark), base = hexToRgb(g.base), light = hexToRgb(g.light);
  const rock = hexToRgb(WORLD.biome.rock);
  const lake = WORLD.terrain.lake;
  const mix = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] =>
    [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

  for (let py = 0; py < RES; py++) {
    const wz = (py / RES) * half * 2 - half;
    for (let px = 0; px < RES; px++) {
      const wx = (px / RES) * half * 2 - half;
      const h = meshHeight(wx, wz);
      let col: [number, number, number];
      if (h > 11) {
        // ridge walls / high ground read as rock
        col = mix(rock, [rock[0] * 0.5, rock[1] * 0.5, rock[2] * 0.5], Math.min(1, (h - 11) / 10));
      } else {
        const t = Math.max(0, Math.min(1, h / 6));
        col = t < 0.5 ? mix(dark, base, t * 2) : mix(base, light, (t - 0.5) * 2);
      }
      if (lake && Math.hypot(wx - lake.x, wz - lake.z) < lake.r) {
        col = mix([207, 228, 240], col, 0.15);
      }
      const road = roadFactor(wx, wz);
      if (road > 0.12) col = mix(col, [col[0] * 0.55, col[1] * 0.5, col[2] * 0.45], road);
      // hillshade from west-east slope
      const shade = Math.max(0.55, Math.min(1.25, 1 + (meshHeight(wx - 1.2, wz) - meshHeight(wx + 1.2, wz)) * 0.22));
      const i = (py * RES + px) * 4;
      img.data[i] = Math.min(255, col[0] * shade);
      img.data[i + 1] = Math.min(255, col[1] * shade);
      img.data[i + 2] = Math.min(255, col[2] * shade);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  terrainCache.set(WORLD.id, c);
  return c;
}

export interface FullmapExtras {
  quest: { x: number; z: number } | null;
  discovered: Set<string>;
}

export class FullMapPanel {
  render(root: HTMLElement, playerPos: THREE.Vector3, yaw: number, extras: FullmapExtras): void {
    root.innerHTML = `
      <h1>${WORLD.name}</h1>
      <div class="p-sub">ORBITAL SURVEY COMPOSITE · cartography by Quibb · accuracy by vibes</div>
      <div class="p-body" style="align-items:center; justify-content:center;">
        <canvas id="fullmap-canvas" width="1200" height="1200" style="width:min(62vh,90%); height:auto; border:2px solid rgba(216,176,40,0.5);"></canvas>
      </div>
      <div class="p-hint">M / ESC to close · ◆ objective · ⬡ Re-Constructor · ☠ boss · ▲ you</div>`;

    const canvas = root.querySelector('#fullmap-canvas') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    const S = 1200;
    const half = WORLD.size / 2 + 24;
    const toMap = (wx: number, wz: number): [number, number] => [
      (wx + half) / (half * 2) * S,
      (wz + half) / (half * 2) * S,
    ];

    // painted terrain backdrop
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(paintTerrain(), 0, 0, S, S);
    // soft vignette so the chart reads as a device screen
    const vg = ctx.createRadialGradient(S / 2, S / 2, S * 0.35, S / 2, S / 2, S * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,10,14,0.55)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, S, S);

    // district rings + labels (tinted by faction)
    const factionStroke: Record<string, string> = {
      none: 'rgba(216,176,40,0.55)',
      rustborn: 'rgba(255,120,70,0.6)',
      helix: 'rgba(80,220,210,0.6)',
      frostborn: 'rgba(140,200,255,0.6)',
      kindled: 'rgba(255,140,50,0.65)',
    };
    ctx.textAlign = 'center';
    for (const d of WORLD.districts) {
      const [x, y] = toMap(d.cx, d.cz);
      const r = d.radius / (half * 2) * S;
      ctx.strokeStyle = factionStroke[d.faction] ?? factionStroke.none;
      ctx.lineWidth = 3;
      ctx.setLineDash([12, 10]);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = '900 30px Impact, sans-serif';
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.strokeText(d.name, x, y - r - 10);
      ctx.fillStyle = '#ffe8b0';
      ctx.fillText(d.name, x, y - r - 10);
      ctx.font = '400 19px Arial, sans-serif';
      ctx.lineWidth = 4;
      ctx.strokeText(d.subtitle, x, y - r + 16);
      ctx.fillStyle = 'rgba(232,216,176,0.85)';
      ctx.fillText(d.subtitle, x, y - r + 16);
    }

    // POIs
    for (const poi of WORLD.pois) {
      const [x, y] = toMap(poi.x, poi.z);
      if (poi.kind === 'fast_travel') {
        const known = extras.discovered.has(poi.data ?? '');
        ctx.fillStyle = known ? '#54d4ff' : 'rgba(84,212,255,0.3)';
        ctx.font = '900 34px Impact, sans-serif';
        ctx.fillText('⬡', x, y + 12);
      } else if (poi.kind === 'vendor_gun' || poi.kind === 'vendor_med') {
        ctx.fillStyle = poi.kind === 'vendor_gun' ? '#ff5a86' : '#7dff2a';
        ctx.font = '900 26px Impact, sans-serif';
        ctx.fillText('$', x, y + 9);
      } else if (poi.kind === 'npc') {
        ctx.fillStyle = '#ffd23c';
        ctx.font = '900 28px Impact, sans-serif';
        ctx.fillText('!', x, y + 10);
      } else if (poi.kind === 'gate') {
        ctx.fillStyle = '#c8c4ba';
        ctx.fillRect(x - 14, y - 5, 28, 10);
      }
    }

    // boss
    const boss = enemySpawner.boss;
    if (boss?.alive) {
      const [x, y] = toMap(boss.position.x, boss.position.z);
      ctx.fillStyle = '#ff5a5a';
      ctx.font = '900 40px Impact, sans-serif';
      ctx.fillText('☠', x, y + 14);
    }

    // quest marker
    if (extras.quest) {
      const [x, y] = toMap(extras.quest.x, extras.quest.z);
      ctx.fillStyle = '#ffd23c';
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-12, -12, 24, 24);
      ctx.restore();
      ctx.strokeStyle = '#ffd23c';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 26 + Math.sin(performance.now() / 300) * 4, 0, Math.PI * 2);
      ctx.stroke();
    }

    // player arrow
    const [px, py] = toMap(playerPos.x, playerPos.z);
    const facing = yaw + Math.PI;
    ctx.save();
    ctx.translate(px, py);
    // arrow drawn pointing up; bearing b (world +z = down-map) → rotate π - b
    ctx.rotate(Math.PI - facing);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, -18);
    ctx.lineTo(-11, 12);
    ctx.lineTo(0, 5);
    ctx.lineTo(11, 12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // map name & compass rose
    ctx.fillStyle = 'rgba(216,176,40,0.7)';
    ctx.font = '900 34px Impact, sans-serif';
    ctx.fillText('N', S - 60, 60);
    ctx.beginPath();
    ctx.moveTo(S - 60, 74); ctx.lineTo(S - 60, 110);
    ctx.strokeStyle = 'rgba(216,176,40,0.7)';
    ctx.stroke();
    void activeMap;
  }
}
