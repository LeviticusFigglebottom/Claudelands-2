// Quest progression: consumes data/quests.ts, listens to kill/goto/collect
// signals, opens gates, spawns bosses, pays rewards. UI reads its state for
// the tracker, log, dialogue, and compass marker.

import * as THREE from 'three';
import { QUESTS, type QuestDef } from '../data/quests';
import { state, bus } from './state';
import { audio } from '../audio/synth';
import { generateWeapon } from '../gen/weapongen';
import { loot } from './loot';
import { spawnBoss } from './boss';
import { levelScale } from '../gen/weapongen';
import type { Enemy } from './enemies';

export type QuestStatus = 'locked' | 'available' | 'active' | 'complete';

export interface QuestRuntime {
  def: QuestDef;
  status: QuestStatus;
  progress: number;
}

export interface QuestHooks {
  openGate: (id: string) => void;
  playerPos: () => THREE.Vector3;
  toast: (html: string, color?: string) => void;
  banner: (text: string) => void;
  onVictory: () => void;
}

class QuestSystem {
  quests: QuestRuntime[] = QUESTS.map((def, i) => ({ def, status: i === 0 ? 'available' : 'locked', progress: 0 }));
  private hooks: QuestHooks | null = null;
  private bossSpawned = new Set<string>();

  init(hooks: QuestHooks): void {
    this.hooks = hooks;
    bus.on('kill', () => { /* faction kills recorded via recordKill below */ });
  }

  get active(): QuestRuntime | null {
    return this.quests.find((q) => q.status === 'active') ?? null;
  }

  get available(): QuestRuntime | null {
    return this.quests.find((q) => q.status === 'available') ?? null;
  }

  get allDone(): boolean {
    return this.quests.every((q) => q.status === 'complete');
  }

  /** Player accepted the currently-available quest at Quibb. */
  accept(): QuestRuntime | null {
    const q = this.available;
    if (!q) return null;
    q.status = 'active';
    audio.questAccept();
    this.hooks?.toast(`QUEST ACCEPTED — <b>${q.def.name}</b>`, '#ffd23c');
    if (q.def.unlocksGate) this.hooks?.openGate(q.def.unlocksGate);
    // boss quests summon their boss when accepted
    if (q.def.objective.kind === 'boss' && q.def.objective.bossId && !this.bossSpawned.has(q.def.objective.bossId)) {
      this.bossSpawned.add(q.def.objective.bossId);
      const { markerX, markerZ } = q.def.objective;
      spawnBoss(q.def.objective.bossId as 'gutterball' | 'warden_prime', new THREE.Vector3(markerX ?? 0, 0, markerZ ?? 0));
    }
    return q;
  }

  /** Called by the kill hookup for every enemy death. */
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

  /** Called when the player picks up a quest item (drive core etc.). */
  recordCollect(): void {
    const q = this.active;
    if (!q || q.def.objective.kind !== 'collect') return;
    q.progress++;
    audio.pickup();
    this.hooks?.toast(`${q.def.objective.label}: <b>${q.progress}/${q.def.objective.count}</b>`, '#54d4ff');
    this.checkComplete(q);
  }

  /** Should this enemy drop a quest item on death? */
  wantsCollectDrop(enemy: Enemy): boolean {
    const q = this.active;
    if (!q || q.def.objective.kind !== 'collect') return false;
    return enemy.def.faction === q.def.objective.faction && q.progress < q.def.objective.count;
  }

  /** Per-frame: goto objectives check player proximity to the marker. */
  update(): void {
    const q = this.active;
    if (!q || !this.hooks) return;
    const obj = q.def.objective;
    if (obj.kind === 'goto' && obj.markerX !== undefined) {
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

    // rewards
    const scale = levelScale(state.level);
    state.money += Math.round(q.def.rewardCash * scale * 0.35 + q.def.rewardCash);
    state.addXp(q.def.rewardXp);
    if (q.def.rewardItem && this.hooks) {
      const item = generateWeapon({ level: state.level, rarityId: q.def.rewardItem });
      const p = this.hooks.playerPos();
      loot.spawnItem(item, p.clone().add(new THREE.Vector3(1.2, 0.5, 1.2)), true);
    }

    // unlock the next quest (picked up at Quibb)
    const idx = this.quests.indexOf(q);
    if (idx + 1 < this.quests.length) {
      this.quests[idx + 1].status = 'available';
      this.hooks?.toast('Foreman Quibb has more work. <b>Return to Gutterlight.</b>', '#ffd23c');
    } else {
      this.hooks?.onVictory();
    }
  }

  /** Marker for the compass/HUD: active objective, else Quibb when work waits. */
  markerPos(): { x: number; z: number; label: string } | null {
    const q = this.active;
    if (q?.def.objective.markerX !== undefined) {
      return { x: q.def.objective.markerX!, z: q.def.objective.markerZ ?? 0, label: q.def.name };
    }
    if (this.available) return { x: -3, z: 80, label: 'New job: Foreman Quibb' };
    return null;
  }

  // ------------------------------------------------------------ save/load
  serialize(): { i: number; s: QuestStatus; p: number }[] {
    return this.quests.map((q, i) => ({ i, s: q.status, p: q.progress }));
  }

  load(data: { i: number; s: QuestStatus; p: number }[], reopenGates: (id: string) => void): void {
    for (const row of data) {
      const q = this.quests[row.i];
      if (!q) continue;
      q.status = row.s;
      q.progress = row.p;
      if ((row.s === 'active' || row.s === 'complete') && q.def.unlocksGate) reopenGates(q.def.unlocksGate);
      // re-arm boss spawns for active boss quests
      if (row.s === 'active' && q.def.objective.kind === 'boss' && q.def.objective.bossId && !this.bossSpawned.has(q.def.objective.bossId)) {
        this.bossSpawned.add(q.def.objective.bossId);
        const { markerX, markerZ } = q.def.objective;
        spawnBoss(q.def.objective.bossId as 'gutterball' | 'warden_prime', new THREE.Vector3(markerX ?? 0, 0, markerZ ?? 0));
      }
    }
  }
}

export const questSystem = new QuestSystem();
