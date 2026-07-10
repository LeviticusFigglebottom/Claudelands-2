// World Events — the director that keeps the overworld from feeling like a
// static shooting gallery. On combat maps it waits out a lull, then fires a
// timed event: a loot surge, a rare-spawn rush, or a Helix supply drop with
// a guard wave. Everything is announced, banners on the HUD, and other
// systems read the live multipliers this owns (loot & rare-spawn scale).

import * as THREE from 'three';

export interface EventCtx {
  /** Sim is live (not paused/cinematic/driving/racing). */
  active: boolean;
  /** This map hosts firefights (has spawn tables, not a race circuit). */
  combat: boolean;
  playerPos: THREE.Vector3;
  spawnPod: (pos: THREE.Vector3) => void;
  spawnGuards: (pos: THREE.Vector3, n: number) => void;
  groundHeight: (x: number, z: number) => number;
  feed: (html: string, color?: string) => void;
}

type EventId = 'scrap_storm' | 'gilded_rush' | 'supply_drop';

interface EventDef {
  id: EventId;
  name: string;
  color: string;
  duration: number;
  weight: number;
}

const EVENTS: EventDef[] = [
  { id: 'scrap_storm', name: 'SCRAP STORM', color: '#ffd23c', duration: 40, weight: 3 },
  { id: 'gilded_rush', name: 'GILDED RUSH', color: '#ffb43c', duration: 34, weight: 2 },
  { id: 'supply_drop', name: 'HELIX SUPPLY DROP', color: '#54d4ff', duration: 55, weight: 2 },
];

class WorldEventDirector {
  activeId: EventId | null = null;
  private remaining = 0;
  private cooldown = 55 + Math.random() * 50; // first event after a warm-up
  private name = '';
  private color = '#ffd23c';

  /** Live multipliers other systems read. Reset to neutral between events. */
  lootMult = 1;
  rareMult = 1;

  /** Cleared when leaving a map so an event never straddles a teleport. */
  onMapChanged(): void {
    this.activeId = null;
    this.remaining = 0;
    this.lootMult = 1;
    this.rareMult = 1;
    this.cooldown = 50 + Math.random() * 55;
  }

  /** Debug/tests: force an event to start now. */
  forceEvent(id: EventId, ctx: EventCtx): void {
    const def = EVENTS.find((e) => e.id === id);
    if (def) this.begin(def, ctx);
  }

  private begin(def: EventDef, ctx: EventCtx): void {
    this.activeId = def.id;
    this.name = def.name;
    this.color = def.color;
    this.remaining = def.duration;
    this.lootMult = 1;
    this.rareMult = 1;
    switch (def.id) {
      case 'scrap_storm':
        this.lootMult = 2.5;
        ctx.feed('⚙ <b>SCRAP STORM</b> — the district rains loot. Kill fast, grab faster!', def.color);
        break;
      case 'gilded_rush':
        this.rareMult = 11; // 2.5% -> ~27%
        ctx.feed('✦ <b>GILDED RUSH</b> — everything’s gone shiny. Hunt the gold ones!', def.color);
        break;
      case 'supply_drop': {
        // pod lands 22-30m from the player on flat-ish ground; guards ring it
        const a = Math.random() * Math.PI * 2;
        const r = 22 + Math.random() * 8;
        const pos = new THREE.Vector3(ctx.playerPos.x + Math.cos(a) * r, 0, ctx.playerPos.z + Math.sin(a) * r);
        pos.y = ctx.groundHeight(pos.x, pos.z);
        ctx.spawnPod(pos);
        ctx.spawnGuards(pos, 4);
        ctx.feed('▼ <b>HELIX SUPPLY DROP</b> — a pod just hit the dirt. It has guards. It has GOODS.', def.color);
        break;
      }
    }
  }

  update(dt: number, ctx: EventCtx): void {
    if (!ctx.active) return;
    if (this.activeId) {
      this.remaining -= dt;
      if (this.remaining <= 0) {
        // the supply-drop pod persists until cracked; the buff events just end
        if (this.activeId !== 'supply_drop') {
          ctx.feed(`<b>${this.name}</b> — over. Back to your regularly scheduled violence.`, '#8a949e');
        }
        this.activeId = null;
        this.lootMult = 1;
        this.rareMult = 1;
        this.cooldown = 70 + Math.random() * 70;
      }
      return;
    }
    if (!ctx.combat) return;
    this.cooldown -= dt;
    if (this.cooldown <= 0) {
      const total = EVENTS.reduce((s, e) => s + e.weight, 0);
      let roll = Math.random() * total;
      const def = EVENTS.find((e) => (roll -= e.weight) < 0) ?? EVENTS[0];
      this.begin(def, ctx);
    }
  }

  /** HUD banner: active event name + remaining seconds, or ''. */
  bannerHTML(): string {
    if (!this.activeId) return '';
    const secs = Math.max(0, Math.ceil(this.remaining));
    const tag = this.activeId === 'supply_drop' ? 'POD ACTIVE' : `${secs}s`;
    return `<span style="color:${this.color}">◆ ${this.name} · ${tag}</span>`;
  }
}

export const worldEvents = new WorldEventDirector();
