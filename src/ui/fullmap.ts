// Full map panel (M): stylized top-down chart of the active world — district
// circles, roads/corridor, stations, gate, NPCs, quest marker, boss, and the
// player arrow. Drawn from map data, parchment-styled.

import * as THREE from 'three';
import { WORLD, activeMap } from '../data/world';
import { enemySpawner } from '../game/enemies';

export interface FullmapExtras {
  quest: { x: number; z: number } | null;
  discovered: Set<string>;
}

export class FullMapPanel {
  render(root: HTMLElement, playerPos: THREE.Vector3, yaw: number, extras: FullmapExtras): void {
    root.innerHTML = `
      <h1>${WORLD.name}</h1>
      <div class="p-sub">Cartography by Quibb. Accuracy by vibes.</div>
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

    // parchment ground
    ctx.fillStyle = '#171210';
    ctx.fillRect(0, 0, S, S);
    ctx.strokeStyle = 'rgba(216,176,40,0.06)';
    ctx.lineWidth = 1;
    for (let i = 0; i < S; i += 60) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, S); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(S, i); ctx.stroke();
    }

    // roads / corridor
    ctx.strokeStyle = 'rgba(200,160,90,0.4)';
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    for (const r of WORLD.terrain.roads) {
      const [x0, y0] = toMap(r.x0, r.z0);
      const [x1, y1] = toMap(r.x1, r.z1);
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    }
    const corridor = WORLD.terrain.corridor;
    if (corridor) {
      ctx.lineWidth = (corridor.width * 2) / (half * 2) * S;
      ctx.strokeStyle = 'rgba(200,140,80,0.22)';
      ctx.beginPath();
      corridor.pts.forEach((p, i) => {
        const [x, y] = toMap(p.x, p.z);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.lineWidth = 10;
    }

    // districts
    const factionColor: Record<string, string> = {
      none: 'rgba(216,176,40,0.14)',
      rustborn: 'rgba(200,90,50,0.14)',
      helix: 'rgba(80,200,190,0.13)',
      frostborn: 'rgba(120,180,230,0.14)',
      kindled: 'rgba(255,110,40,0.16)',
    };
    ctx.textAlign = 'center';
    for (const d of WORLD.districts) {
      const [x, y] = toMap(d.cx, d.cz);
      const r = d.radius / (half * 2) * S;
      ctx.fillStyle = factionColor[d.faction] ?? factionColor.none;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(216,176,40,0.35)';
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 8]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#e8d8b0';
      ctx.font = '900 30px Impact, sans-serif';
      ctx.fillText(d.name, x, y - r - 10);
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
