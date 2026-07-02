// Quest progression: consumes data/quests.ts, listens to kill/goto/collect
// signals, opens gates, unlocks fast-travel stations, spawns bosses (map-
// aware: a boss on another map spawns when the player arrives there), pays
// rewards. UI reads its state for tracker, log, dialogue, and compass.

import * as THREE from 'three';
import { QUESTS, type QuestDef, type QuestGiver } from '../data/quests';
import { state, bus } from './state';
import { audio } from '../audio/synth';
import { generateWeapon } from '../gen/weapongen';
import { loot } from './loot';
import { spawnBoss, type BossId } from './boss';
import { levelScale } from '../gen/weapongen';
import { activeMap } from '../data/world';
import type { Enemy } from './enemies';

export type QuestStatus = 'locked' | 'available' | 'active' | 'complete';

export interface QuestRuntime {
  def: QuestDef;
  status: QuestStatus;
  progress: number;
}

export interface QuestHooks {
  openGate: (id: string) => void;
  discoverStation: (name: string) => void;
  playerPos: () => THREE.Vector3;
  toast: (html: string, color?: string) => void;
  banner: (text: string) => void;
  onVictory: () => void;
}

class QuestSystem {
  quests: QuestRuntime[] = QUESTS.map((def, i) => ({ def, status: i === 0 ? 'available' : 'locked', progress: 0 }));
  private hooks: QuestHooks | null = null;
  private bossSpawned = new Set<string>();
  /** Boss spawns waiting for the player to reach the right map. */
  private pendingBosses: { bossId: BossId; mapId: string; x: number; z: number }[] = [];

  init(hooks: QuestHooks): void {
    this.hooks = hooks;
    void bus;
  }

  get active(): QuestRuntime | null {
    return this.quests.find((q) => q.status === 'active') ?? null;
  }

  get available(): QuestRuntime | null {
    return this.quests.find((q) => q.status === 'available') ?? null;
  }

  /** The next quest offered by a specific giver (for their dialogue panel). */
  availableFrom(giver: QuestGiver): QuestRuntime | null {
    const q = this.available;
    return q && q.def.giver === giver ? q : null;
  }

  get allDone(): boolean {
    return this.quests.every((q) => q.status === 'complete');
  }

  accept(): QuestRuntime | null {
    const q = this.available;
    if (!q) return null;
    q.status = 'active';
    audio.questAccept();
    this.hooks?.toast(`QUEST ACCEPTED — <b>${q.def.name}</b>`, '#ffd23c');
    if (q.def.unlocksGate) this.hooks?.openGate(q.def.unlocksGate);
    if (q.def.unlocksStation) this.hooks?.discoverStation(q.def.unlocksStation);
    if (q.def.objective.kind === 'boss' && q.def.objective.bossId) {
      this.armBoss(q.def);
    }
    return q;
  }

  private armBoss(def: QuestDef): void {
    const bossId = def.objective.bossId as BossId;
    if (this.bossSpawned.has(bossId)) return;
    this.bossSpawned.add(bossId);
    const mapId = def.objective.mapId ?? 'claudelands';
    const { markerX, markerZ } = def.objective;
    if (activeMap().id === mapId) {
      spawnBoss(bossId, new THREE.Vector3(markerX ?? 0, 0, markerZ ?? 0));
    } else {
      this.pendingBosses.push({ bossId, mapId, x: markerX ?? 0, z: markerZ ?? 0 });
    }
  }

  /** Call after every map switch: spawn any boss that lives on this map. */
  onMapChanged(): void {
    const mapId = activeMap().id;
    for (let i = this.pendingBosses.length - 1; i >= 0; i--) {
      const p = this.pendingBosses[i];
      if (p.mapId !== mapId) continue;
      spawnBoss(p.bossId, new THREE.Vector3(p.x, 0, p.z));
      this.pendingBosses.splice(i, 1);
    }
  }

  recordKill(enemy: Enemy): void {
    const q = this.active;
    if (!q) return;
    const obj = q.def.objective;
    if (obj.kind === 'kill_faction' && enemy.def.faction === obj.faction) {
      q.progress++;
      this.checkComplete(q);
    } else if (obj.kind === 'boss' && enemy.def.id === obj.bossId) {
      q.progress = obj.count;
      this.checkComplete(q);
    }
  }

  recordCollect(): void {
    const q = this.active;
    if (!q || q.def.objective.kind !== 'collect') return;
    q.progress++;
    audio.pickup();
    this.hooks?.toast(`${q.def.objective.label}: <b>${q.progress}/${q.def.objective.count}</b>`, '#54d4ff');
    this.checkComplete(q);
  }

  wantsCollectDrop(enemy: Enemy): boolean {
    const q = this.active;
    if (!q || q.def.objective.kind !== 'collect') return false;
    return enemy.def.faction === q.def.objective.faction && q.progress < q.def.objective.count;
  }

  update(): void {
    const q = this.active;
    if (!q || !this.hooks) return;
    const obj = q.def.objective;
    if (obj.kind === 'goto' && obj.markerX !== undefined) {
      if ((obj.mapId ?? 'claudelands') !== activeMap().id) return;
      const p = this.hooks.playerPos();
      if (Math.hypot(p.x - obj.markerX, p.z - (obj.markerZ ?? 0)) < 18) {
        q.progress = obj.count;
        this.checkComplete(q);
      }
    }
  }

  private checkComplete(q: QuestRuntime): void {
    if (q.progress < q.def.objective.count || q.status !== 'active') return;
    q.status = 'complete';
    audio.questComplete();
    this.hooks?.banner('QUEST COMPLETE');
    this.hooks?.toast(`<b>${q.def.name}</b> — ${q.def.completeLine}`, '#3ddc4e');

    const scale = levelScale(state.level);
    state.money += Math.round(q.def.rewardCash * scale * 0.35 + q.def.rewardCash);
    state.addXp(q.def.rewardXp);
    if (q.def.rewardItem && this.hooks) {
      const item = generateWeapon({ level: state.level, rarityId: q.def.rewardItem });
      const p = this.hooks.playerPos();
      loot.spawnItem(item, p.clone().add(new THREE.Vector3(1.2, 0.5, 1.2)), true);
    }

    const idx = this.quests.indexOf(q);
    if (idx + 1 < this.quests.length) {
      const next = this.quests[idx + 1];
      next.status = 'available';
      const giverName = next.def.giver === 'zaza' ? 'Madame Zaza (Chatterjaw Landing)' : 'Foreman Quibb (Gutterlight)';
      this.hooks?.toast(`New work waiting: <b>${giverName}</b>`, '#ffd23c');
    } else {
      this.hooks?.onVictory();
    }
  }

  /** Marker for the compass/HUD: only meaningful on its own map. */
  markerPos(): { x: number; z: number; mapId: string; label: string } | null {
    const q = this.active;
    if (q?.def.objective.markerX !== undefined) {
      return {
        x: q.def.objective.markerX!, z: q.def.objective.markerZ ?? 0,
        mapId: q.def.objective.mapId ?? 'claudelands',
        label: q.def.name,
      };
    }
    const avail = this.available;
    if (avail) {
      return avail.def.giver === 'zaza'
        ? { x: 3, z: 68, mapId: 'frosthollow', label: 'New job: Madame Zaza' }
        : { x: -3, z: 80, mapId: 'claudelands', label: 'New job: Foreman Quibb' };
    }
    return null;
  }

  // ------------------------------------------------------------ save/load
  serialize(): { i: number; s: QuestStatus; p: number }[] {
    return this.quests.map((q, i) => ({ i, s: q.status, p: q.progress }));
  }

  load(data: { i: number; s: QuestStatus; p: number }[], reopenGates: (id: string) => void, rediscover: (name: string) => void): void {
    for (const row of data) {
      const q = this.quests[row.i];
      if (!q) continue;
      q.status = row.s;
      q.progress = row.p;
      if (row.s === 'active' || row.s === 'complete') {
        if (q.def.unlocksGate) reopenGates(q.def.unlocksGate);
        if (q.def.unlocksStation) rediscover(q.def.unlocksStation);
      }
      if (row.s === 'active' && q.def.objective.kind === 'boss' && q.def.objective.bossId) {
        this.armBoss(q.def);
      }
    }
  }
}

export const questSystem = new QuestSystem();
