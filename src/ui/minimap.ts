// Circular minimap radar (top-right): player-centered, forward-up rotation,
// blips for enemies (aggro/idle), boss, loot beams (rarity-colored), quest
// marker, stations, vendors, NPCs. Canvas 2D, redrawn per frame.

import * as THREE from 'three';
import { WORLD } from '../data/world';
import { enemySpawner } from '../game/enemies';
import { loot } from '../game/loot';
import { rarityById } from '../data/rarity';

const SIZE = 170;
const RANGE = 48; // meters shown edge-to-center

export interface RadarExtras {
  quest: { x: number; z: number } | null;
  stations: { x: number; z: number }[];
}

export class Minimap {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor() {
    const holder = document.getElementById('minimap')!;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = SIZE * 2; // retina-ish
    this.canvas.style.width = this.canvas.style.height = `${SIZE}px`;
    holder.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
  }

  update(playerPos: THREE.Vector3, yaw: number, extras: RadarExtras): void {
    const ctx = this.ctx;
    const S = SIZE * 2;
    const C = S / 2;
    const facing = yaw + Math.PI;
    ctx.clearRect(0, 0, S, S);

    // dial
    ctx.save();
    ctx.beginPath();
    ctx.arc(C, C, C - 4, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = 'rgba(12, 10, 8, 0.78)';
    ctx.fillRect(0, 0, S, S);
    // range rings
    ctx.strokeStyle = 'rgba(216,176,40,0.16)';
    ctx.lineWidth = 2;
    for (const r of [0.33, 0.66]) {
      ctx.beginPath();
      ctx.arc(C, C, (C - 4) * r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(C, 8); ctx.lineTo(C, S - 8);
    ctx.moveTo(8, C); ctx.lineTo(S - 8, C);
    ctx.strokeStyle = 'rgba(216,176,40,0.08)';
    ctx.stroke();

    const toScreen = (wx: number, wz: number, clampToRim = true): [number, number, boolean] => {
      const dx = wx - playerPos.x, dz = wz - playerPos.z;
      const dist = Math.hypot(dx, dz);
      const bearing = Math.atan2(dx, dz);
      const rel = bearing - facing;
      let r = (dist / RANGE) * (C - 12);
      let clamped = false;
      if (r > C - 12) {
        if (!clampToRim) return [0, 0, false];
        r = C - 12;
        clamped = true;
      }
      return [C + Math.sin(rel) * r, C - Math.cos(rel) * r, clamped];
    };

    // loot beams (rarity color)
    for (const p of loot.pickups) {
      if (p.kind !== 'item' || !p.item) continue;
      const [x, y, clamped] = toScreen(p.pos.x, p.pos.z, false);
      if (x === 0 && y === 0 && !clamped) continue;
      ctx.fillStyle = rarityById(p.item.rarity).css;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // stations
    ctx.fillStyle = '#54d4ff';
    for (const s of extras.stations) {
      const [x, y] = toScreen(s.x, s.z);
      ctx.fillRect(x - 4, y - 4, 8, 8);
    }

    // enemies
    for (const e of enemySpawner.enemies) {
      if (!e.alive) continue;
      const isBoss = e === enemySpawner.boss;
      const [x, y, clamped] = toScreen(e.position.x, e.position.z, isBoss);
      if (x === 0 && y === 0 && !clamped && !isBoss) continue;
      if (isBoss) {
        ctx.fillStyle = '#ff5a5a';
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(-7, -7, 14, 14);
        ctx.restore();
      } else {
        ctx.fillStyle = e.aggro ? '#ff5a5a' : 'rgba(224,110,80,0.75)';
        ctx.beginPath();
        ctx.arc(x, y, e.badass ? 6 : 4.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // quest marker
    if (extras.quest) {
      const [x, y] = toScreen(extras.quest.x, extras.quest.z);
      ctx.fillStyle = '#ffd23c';
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-6, -6, 12, 12);
      ctx.restore();
    }

    ctx.restore();

    // rim + N tick (rotates with view)
    ctx.strokeStyle = 'rgba(216,176,40,0.65)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(C, C, C - 4, 0, Math.PI * 2);
    ctx.stroke();
    const nRel = -facing; // bearing 0 (world north/+z) relative to view
    const nx = C + Math.sin(nRel) * (C - 14);
    const ny = C - Math.cos(nRel) * (C - 14);
    ctx.fillStyle = '#f2e4c4';
    ctx.font = '900 22px Impact, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', nx, ny);

    // player wedge (always center, pointing up)
    ctx.fillStyle = '#f2e4c4';
    ctx.beginPath();
    ctx.moveTo(C, C - 10);
    ctx.lineTo(C - 7, C + 8);
    ctx.lineTo(C + 7, C + 8);
    ctx.closePath();
    ctx.fill();
    void WORLD;
  }
}
