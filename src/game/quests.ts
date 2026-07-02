// Quest progression: consumes data/quests.ts, listens to kill/goto/collect
// signals, opens gates, unlocks fast-travel stations, spawns bosses (map-
// aware: a boss on another map spawns when the player arrives there), pays
// rewards. UI reads its state for tracker, log, dialogue, and compass.

import * as THREE from 'three';
import { QUESTS, SIDE_QUESTS, GIVERS, type QuestDef, type QuestGiver } from '../data/quests';
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
  /** Spawn a tagged elite pack for a side quest (badass-tier, level offset). */
  spawnElites: (enemyId: string, count: number, x: number, z: number, levelOffset: number, tag: string) => void;
  /** Grant a quest-only legendary reward. */
  grantUnique: (legendaryId: string) => void;
}

class QuestSystem {
  quests: QuestRuntime[] = QUESTS.map((def, i) => ({ def, status: i === 0 ? 'available' : 'locked', progress: 0 }));
  /** Brasshaven side jobs — unlocked when the city opens (q12). */
  sides: QuestRuntime[] = SIDE_QUESTS.map((def) => ({ def, status: 'locked', progress: 0 }));
  private hooks: QuestHooks | null = null;
  private bossSpawned = new Set<string>();
  /** Boss spawns waiting for the player to reach the right map. */
  private pendingBosses: { bossId: BossId; mapId: string; x: number; z: number }[] = [];
  /** Elite packs waiting for the player to reach the right map. */
  private pendingElites: { enemyId: string; count: number; x: number; z: number; mapId: string; levelOffset: number; tag: string }[] = [];

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
    if (q && q.def.giver === giver) return q;
    if (!this.activeSide) {
      const s = this.sides.find((r) => r.status === 'available' && r.def.giver === giver);
      if (s) return s;
    }
    return null;
  }

  /** Accept whatever this giver is offering (main line first, then side jobs). */
  acceptFrom(giver: QuestGiver): QuestRuntime | null {
    const main = this.available;
    if (main && main.def.giver === giver) return this.accept();
    const s = this.sides.find((r) => r.status === 'available' && r.def.giver === giver);
    if (!s || this.activeSide) return null;
    s.status = 'active';
    audio.questAccept();
    this.hooks?.toast(`SIDE JOB ACCEPTED — <b>${s.def.name}</b>`, '#c06bff');
    this.armElites(s);
    return s;
  }

  private armElites(q: QuestRuntime): void {
    const e = q.def.elite;
    if (!e) return;
    const remaining = q.def.objective.count - q.progress;
    if (remaining <= 0) return;
    const tag = q.def.id;
    if (activeMap().id === e.mapId) {
      this.hooks?.spawnElites(e.enemyId, remaining, e.x, e.z, e.levelOffset, tag);
    } else {
      this.pendingElites.push({ ...e, count: remaining, tag });
    }
  }

  get allDone(): boolean {
    return this.quests.every((q) => q.status === 'complete');
  }

  get activeSide(): QuestRuntime | null {
    return this.sides.find((q) => q.status === 'active') ?? null;
  }

  get sideQuestsDone(): number {
    return this.sides.filter((q) => q.status === 'complete').length;
  }

  private unlockSides(): void {
    for (const s of this.sides) if (s.status === 'locked') s.status = 'available';
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

  /** Call after every map switch: spawn any boss/elite pack on this map. */
  onMapChanged(): void {
    const mapId = activeMap().id;
    for (let i = this.pendingBosses.length - 1; i >= 0; i--) {
      const p = this.pendingBosses[i];
      if (p.mapId !== mapId) continue;
      spawnBoss(p.bossId, new THREE.Vector3(p.x, 0, p.z));
      this.pendingBosses.splice(i, 1);
    }
    for (let i = this.pendingElites.length - 1; i >= 0; i--) {
      const e = this.pendingElites[i];
      if (e.mapId !== mapId) continue;
      this.hooks?.spawnElites(e.enemyId, e.count, e.x, e.z, e.levelOffset, e.tag);
      this.pendingElites.splice(i, 1);
    }
  }

  recordKill(enemy: Enemy): void {
    const q = this.active;
    if (q) {
      const obj = q.def.objective;
      if (obj.kind === 'kill_faction' && enemy.def.faction === obj.faction) {
        q.progress++;
        this.checkComplete(q);
      } else if (obj.kind === 'boss' && enemy.def.id === obj.bossId) {
        q.progress = obj.count;
        this.checkComplete(q);
      }
    }
    const s = this.activeSide;
    if (s && s.def.objective.kind === 'kill_elites' && enemy.questTag === s.def.id) {
      s.progress++;
      this.hooks?.toast(`${s.def.objective.label}: <b>${s.progress}/${s.def.objective.count}</b>`, '#c06bff');
      this.completeSide(s);
    }
  }

  private completeSide(s: QuestRuntime): void {
    if (s.progress < s.def.objective.count || s.status !== 'active') return;
    s.status = 'complete';
    audio.questComplete();
    this.hooks?.banner('SIDE JOB COMPLETE');
    this.hooks?.toast(`<b>${s.def.name}</b> — ${s.def.completeLine}`, '#c06bff');
    const scale = levelScale(state.level);
    state.money += Math.round(s.def.rewardCash * scale * 0.35 + s.def.rewardCash);
    state.addXp(s.def.rewardXp);
    if (s.def.rewardUnique) this.hooks?.grantUnique(s.def.rewardUnique);
    // notoriety: the mayor's gate counts finished local jobs
    const main = this.active;
    if (main && main.def.objective.kind === 'notoriety') {
      main.progress = this.sideQuestsDone;
      this.checkComplete(main);
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
    if (obj.kind === 'notoriety') {
      q.progress = this.sideQuestsDone;
      this.checkComplete(q);
      return;
    }
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

    if (q.def.id === 'q12_city') {
      this.unlockSides();
      this.hooks?.toast('Brasshaven\u2019s citizens have <b>side jobs</b> for you — look for the purple marks.', '#c06bff');
    }

    const idx = this.quests.indexOf(q);
    if (idx + 1 < this.quests.length) {
      const next = this.quests[idx + 1];
      next.status = 'available';
      const g = GIVERS[next.def.giver];
      this.hooks?.toast(`New work waiting: <b>${g.name}</b> (${g.where.replace(/^(in|at) /, '')})`, '#ffd23c');
    } else {
      this.hooks?.onVictory();
    }
  }

  /** Marker for the compass/HUD: only meaningful on its own map. */
  markerPos(): { x: number; z: number; mapId: string; label: string } | null {
    const q = this.active;
    // the notoriety gate points at the side job, not the mayor
    if (q && q.def.objective.markerX !== undefined && q.def.objective.kind !== 'notoriety') {
      return {
        x: q.def.objective.markerX!, z: q.def.objective.markerZ ?? 0,
        mapId: q.def.objective.mapId ?? 'claudelands',
        label: q.def.name,
      };
    }
    const s = this.activeSide;
    if (s?.def.objective.markerX !== undefined) {
      return {
        x: s.def.objective.markerX!, z: s.def.objective.markerZ ?? 0,
        mapId: s.def.objective.mapId ?? 'claudelands',
        label: s.def.name,
      };
    }
    if (q && q.def.objective.markerX !== undefined) {
      return { x: q.def.objective.markerX!, z: q.def.objective.markerZ ?? 0, mapId: q.def.objective.mapId ?? 'claudelands', label: q.def.name };
    }
    const avail = this.available;
    if (avail) {
      const g = GIVERS[avail.def.giver];
      return { x: g.x, z: g.z, mapId: g.mapId, label: `New job: ${g.name}` };
    }
    return null;
  }

  // ------------------------------------------------------------ save/load
  serialize(): { i: number; s: QuestStatus; p: number }[] {
    return this.quests.map((q, i) => ({ i, s: q.status, p: q.progress }));
  }

  serializeSides(): { id: string; s: QuestStatus; p: number }[] {
    return this.sides.map((q) => ({ id: q.def.id, s: q.status, p: q.progress }));
  }

  loadSides(data: { id: string; s: QuestStatus; p: number }[]): void {
    for (const row of data) {
      const q = this.sides.find((r) => r.def.id === row.id);
      if (!q) continue;
      q.status = row.s;
      q.progress = row.p;
      if (row.s === 'active') this.armElites(q);
    }
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
    if (this.quests.find((q) => q.def.id === 'q12_city')?.status === 'complete') this.unlockSides();
  }
}

export const questSystem = new QuestSystem();
