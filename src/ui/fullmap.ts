// Full map panel (M): a real top-down chart of the active world — painted
// terrain (contours, roads, water), structure line-art stamped from the
// world's actual colliders (buildings, walls, wrecks, trees), labeled
// districts and stations, POIs, quest marker, boss, and the player arrow.
// Orientation matches the in-world camera: north (+z) up, +x to the LEFT
// (same chirality as the minimap, so both instruments always agree).

import * as THREE from 'three';
import { WORLD } from '../data/world';
import { enemySpawner } from '../game/enemies';
import { paintedTerrain, mapHalf } from './terrainpaint';

export interface MapStructure { minX: number; maxX: number; minZ: number; maxZ: number }

export interface FullmapExtras {
  quest: { x: number; z: number } | null;
  discovered: Set<string>;
  /** The active world's collision footprints — drawn as structure line-art. */
  structures: MapStructure[];
}

export class FullMapPanel {
  render(root: HTMLElement, playerPos: THREE.Vector3, yaw: number, extras: FullmapExtras): void {
    root.innerHTML = `
      <h1>${WORLD.name}</h1>
      <div class="p-sub">ORBITAL SURVEY COMPOSITE · cartography by Quibb · accuracy by vibes</div>
      <div class="p-body" style="align-items:center; justify-content:center;">
        <canvas id="fullmap-canvas" width="1200" height="1200" style="width:min(62vh,90%); height:auto; border:2px solid rgba(216,176,40,0.5);"></canvas>
      </div>
      <div class="p-hint">M / ESC to close · Q ◂ ▸ E switch tabs · ◆ objective · ⬡ Re-Constructor · ☠ boss · ▲ you</div>`;

    const canvas = root.querySelector('#fullmap-canvas') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    const S = 1200;
    const half = mapHalf();
    const toMap = (wx: number, wz: number): [number, number] => [
      (half - wx) / (half * 2) * S,
      (half - wz) / (half * 2) * S,
    ];

    // painted terrain backdrop (shared with the minimap)
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(paintedTerrain(), 0, 0, S, S);

    // structure line-art from the world's real collision footprints
    ctx.fillStyle = 'rgba(240, 230, 202, 0.5)';
    ctx.strokeStyle = 'rgba(24, 18, 10, 0.85)';
    ctx.lineWidth = 2;
    for (const st of extras.structures) {
      const [x1, y1] = toMap(st.maxX, st.maxZ);
      const [x2, y2] = toMap(st.minX, st.minZ);
      const w = x2 - x1, h = y2 - y1;
      if (w < 4 && h < 4) {
        // scatter footprint (tree, post, crate) → single map dot
        ctx.fillRect(x1 + w / 2 - 1.5, y1 + h / 2 - 1.5, 3, 3);
      } else {
        ctx.fillRect(x1, y1, w, h);
        ctx.strokeRect(x1, y1, w, h);
      }
    }

    // soft vignette so the chart reads as a device screen
    const vg = ctx.createRadialGradient(S / 2, S / 2, S * 0.38, S / 2, S / 2, S * 0.74);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,10,14,0.5)');
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
      // keep labels on the canvas even for edge districts
      const ly = Math.max(44, Math.min(S - 30, y - r - 10));
      ctx.font = '900 30px Impact, sans-serif';
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.strokeText(d.name, x, ly);
      ctx.fillStyle = '#ffe8b0';
      ctx.fillText(d.name, x, ly);
      ctx.font = '400 19px Arial, sans-serif';
      ctx.lineWidth = 4;
      ctx.strokeText(d.subtitle, x, ly + 26);
      ctx.fillStyle = 'rgba(232,216,176,0.85)';
      ctx.fillText(d.subtitle, x, ly + 26);
    }

    // POIs
    for (const poi of WORLD.pois) {
      const [x, y] = toMap(poi.x, poi.z);
      if (poi.kind === 'fast_travel') {
        const known = extras.discovered.has(poi.data ?? '');
        ctx.fillStyle = known ? '#54d4ff' : 'rgba(84,212,255,0.3)';
        ctx.font = '900 34px Impact, sans-serif';
        ctx.fillText('⬡', x, y + 12);
        if (known) {
          ctx.font = '700 17px Arial, sans-serif';
          ctx.lineWidth = 4;
          ctx.strokeStyle = 'rgba(0,0,0,0.75)';
          ctx.strokeText(poi.data ?? '', x, y + 34);
          ctx.fillStyle = '#bfeaff';
          ctx.fillText(poi.data ?? '', x, y + 34);
        }
      } else if (poi.kind === 'vendor_gun' || poi.kind === 'vendor_med') {
        ctx.fillStyle = poi.kind === 'vendor_gun' ? '#ff5a86' : '#7dff2a';
        ctx.font = '900 26px Impact, sans-serif';
        ctx.fillText('$', x, y + 9);
      } else if (poi.kind === 'npc') {
        ctx.fillStyle = '#ffd23c';
        ctx.font = '900 28px Impact, sans-serif';
        ctx.fillText('!', x, y + 10);
      } else if (poi.kind === 'ship') {
        ctx.fillStyle = '#ffd23c';
        ctx.font = '900 30px Impact, sans-serif';
        ctx.fillText('▲', x, y + 10);
        ctx.font = '700 16px Arial, sans-serif';
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(0,0,0,0.75)';
        ctx.strokeText('THE PAPERWEIGHT', x, y + 28);
        ctx.fillText('THE PAPERWEIGHT', x, y + 28);
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

    // player arrow — forward is (-sin yaw, -cos yaw) in world (x,z); on this
    // map (+x left, +z up) that becomes a clockwise-from-up rotation of
    // atan2(sin yaw, -cos yaw)
    const [px, py] = toMap(playerPos.x, playerPos.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(Math.atan2(Math.sin(yaw), -Math.cos(yaw)));
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

    // compass rose (N = +z = map-up)
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(216,176,40,0.85)';
    ctx.font = '900 34px Impact, sans-serif';
    ctx.fillText('N', S - 60, 60);
    ctx.beginPath();
    ctx.moveTo(S - 60, 74); ctx.lineTo(S - 60, 110);
    ctx.moveTo(S - 60, 74); ctx.lineTo(S - 68, 88);
    ctx.moveTo(S - 60, 74); ctx.lineTo(S - 52, 88);
    ctx.strokeStyle = 'rgba(216,176,40,0.85)';
    ctx.lineWidth = 3;
    ctx.stroke();
  }
}
