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
import { enemySpawner } from './enemies';
import { levelScale } from '../gen/weapongen';
import { activeMap } from '../data/world';
import { voice, voiceOf } from '../audio/voice';
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
  /** BL2-style remote chatter: the giver calls in over the ECHO. */
  holocall: (giver: QuestGiver, lines: string[], title?: string | null) => void;
}

class QuestSystem {
  quests: QuestRuntime[] = QUESTS.map((def, i) => ({ def, status: i === 0 ? 'available' : 'locked', progress: 0 }));
  /** Brasshaven side jobs — unlocked when the city opens (q12). */
  sides: QuestRuntime[] = SIDE_QUESTS.map((def) => ({ def, status: 'locked', progress: 0 }));
  private hooks: QuestHooks | null = null;
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
    // furthest chain progress first — veteran runs keep the starter chain
    // available in parallel, but the tracker should point at the frontier
    for (let i = this.quests.length - 1; i >= 0; i--) {
      if (this.quests[i].status === 'available') return this.quests[i];
    }
    return null;
  }

  /** The next quest offered by a specific giver (for their dialogue panel).
   *  Multiple mainline quests can be available at once (veteran starts run
   *  the starter chain and the Brasshaven chain in parallel). */
  availableFrom(giver: QuestGiver): QuestRuntime | null {
    const q = this.quests.find((r) => r.status === 'available' && r.def.giver === giver);
    if (q) return q;
    if (!this.activeSide) {
      const s = this.sides.find((r) => r.status === 'available' && r.def.giver === giver);
      if (s) return s;
    }
    return null;
  }

  /** Accept whatever this giver is offering (main line first, then side jobs). */
  acceptFrom(giver: QuestGiver): QuestRuntime | null {
    const main = this.quests.find((r) => r.status === 'available' && r.def.giver === giver);
    if (main) return this.acceptQuest(main);
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
    return this.acceptQuest(this.available);
  }

  acceptQuest(q: QuestRuntime | null, viaHolocall = false): QuestRuntime | null {
    if (!q || q.status !== 'available' || this.active) return null;
    q.status = 'active';
    audio.questAccept();
    this.hooks?.toast(`QUEST ACCEPTED — <b>${q.def.name}</b>`, '#ffd23c');
    // in-person accepts are IN PERSON: the giver says the send-off to your
    // face (no holocall bust — those are for remote updates only)
    if (!viaHolocall) {
      voice.cancel();
      voice.speak(q.def.acceptLine, voiceOf(q.def.giver));
      this.hooks?.toast(`<b>${GIVERS[q.def.giver].name}:</b> ${q.def.acceptLine}`, '#d8c8a8');
    }
    if (q.def.unlocksGate) this.hooks?.openGate(q.def.unlocksGate);
    if (q.def.unlocksStation) this.hooks?.discoverStation(q.def.unlocksStation);
    if (q.def.objective.kind === 'boss' && q.def.objective.bossId) {
      this.ensureBosses();
    }
    return q;
  }

  /** A boss-quest boss must exist whenever the player is on its map and the
   *  quest is still active — leaving mid-quest wipes enemies, so this re-arms
   *  the arena on every entry instead of spawning exactly once. */
  ensureBosses(): void {
    const map = activeMap();
    for (const q of this.quests) {
      if (q.status !== 'active') continue;
      const obj = q.def.objective;
      if (obj.kind !== 'boss' || !obj.bossId) continue;
      if ((obj.mapId ?? 'claudelands') !== map.id) continue;
      const cur = enemySpawner.boss;
      if (cur && cur.alive && cur.def.id === obj.bossId) continue;
      // spawn dead-center in the arena: the marker points AT the district,
      // but slopes/mounds around it made side-of-the-hill thrones
      const mx = obj.markerX ?? 0, mz = obj.markerZ ?? 0;
      const arena = map.districts.find((d) => Math.hypot(mx - d.cx, mz - d.cz) < d.radius);
      spawnBoss(obj.bossId as BossId, new THREE.Vector3(arena?.cx ?? mx, 0, arena?.cz ?? mz));
    }
  }

  /** Call after every map switch: spawn any boss/elite pack on this map. */
  onMapChanged(): void {
    const mapId = activeMap().id;
    this.ensureBosses();
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
    this.hooks?.holocall(s.def.giver, [s.def.completeLine], `✔ ${s.def.name} — PAID IN FULL`);
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

  /** Standing close enough to hand the giver something. */
  private nearGiver(giver: QuestGiver): boolean {
    if (!this.hooks) return false;
    const g = GIVERS[giver];
    if (activeMap().id !== g.mapId) return false;
    const p = this.hooks.playerPos();
    return Math.hypot(p.x - g.x, p.z - g.z) < 9;
  }

  recordCollect(): void {
    const q = this.active;
    if (!q || q.def.objective.kind !== 'collect') return;
    q.progress++;
    audio.pickup();
    this.hooks?.toast(`${q.def.objective.label}: <b>${q.progress}/${q.def.objective.count}</b>`, '#54d4ff');
    // fetch quests: the LAST pickup doesn't finish the job — the walk back does
    if (q.def.returnToGiver && q.progress >= q.def.objective.count && !this.nearGiver(q.def.giver)) {
      const g = GIVERS[q.def.giver];
      this.hooks?.banner('CARGO SECURED');
      this.hooks?.toast(`All of it. Now haul it back to <b>${g.name}</b> ${g.where} — she signs in person.`, '#ffd23c');
      return;
    }
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
      return;
    }
    // fetch quests: everything's collected, the job finishes at the giver's feet
    if (obj.kind === 'collect' && q.def.returnToGiver && q.progress >= obj.count && this.nearGiver(q.def.giver)) {
      this.checkComplete(q);
    }
  }

  private checkComplete(q: QuestRuntime): void {
    if (q.progress < q.def.objective.count || q.status !== 'active') return;
    q.status = 'complete';
    audio.questComplete();
    this.hooks?.banner('QUEST COMPLETE');
    this.hooks?.toast(`<b>${q.def.name}</b> — rewards paid`, '#3ddc4e'); // the completeLine plays over the holocall

    const scale = levelScale(state.level);
    state.money += Math.round(q.def.rewardCash * scale * 0.35 + q.def.rewardCash);
    state.addXp(q.def.rewardXp);
    if (q.def.rewardItem && this.hooks) {
      const item = generateWeapon({ level: state.level, rarityId: q.def.rewardItem });
      const p = this.hooks.playerPos();
      loot.spawnItem(item, p.clone().add(new THREE.Vector3(1.2, 0.5, 1.2)), true);
    }

    // the story ends where the STORY ends — the frontier quests after it
    // are post-game and never replay the credits
    if (q.def.finale) this.hooks?.onVictory();

    if (q.def.id === 'q12_city') {
      this.unlockSides();
      this.hooks?.toast('Brasshaven\u2019s citizens have <b>side jobs</b> for you — look for the purple marks.', '#c06bff');
    }

    const idx = this.quests.indexOf(q);
    const next = idx + 1 < this.quests.length ? this.quests[idx + 1] : null;

    // fetch quests turn in FACE TO FACE — the giver is standing right there,
    // so no ECHO call, no auto-chain: the next job waits until it's asked for
    if (q.def.returnToGiver) {
      const g = GIVERS[q.def.giver];
      voice.speak(q.def.completeLine, voiceOf(q.def.giver));
      this.hooks?.toast(`<b>${g.name}</b>: ${q.def.completeLine}`, '#ffd23c');
      if (next && next.status === 'locked') {
        next.status = 'available';
        this.hooks?.toast(`New work waiting: <b>${g.name}</b> has more for you.`, '#ffd23c');
      }
      return;
    }

    if (next && next.status === 'locked') {
      next.status = 'available';
      // holocall auto-chaining is for "you're already out here" sequences:
      // same giver AND the next objective lives in the same area (arrive →
      // kill → boss). Anything that moves the story to a new map is a real
      // trip, so it's accepted in person.
      const sameArea = (next.def.objective.mapId ?? 'claudelands') === (q.def.objective.mapId ?? 'claudelands');
      if (next.def.giver === q.def.giver && sameArea) {
        this.hooks?.holocall(q.def.giver, [q.def.completeLine], `✔ ${q.def.name} — TURNED IN REMOTELY`);
        this.acceptQuest(next, true);
        this.hooks?.holocall(next.def.giver, [...next.def.briefing, next.def.acceptLine], `NEW CONTRACT — ${next.def.name}`);
      } else if (next.def.giver === q.def.giver) {
        // same boss, new territory: they call the job in, you take it at the desk
        const g = GIVERS[q.def.giver];
        this.hooks?.holocall(q.def.giver, [q.def.completeLine, `Come see me ${g.where} when you’re ready. The next one’s bigger.`], `✔ ${q.def.name} — TURNED IN REMOTELY`);
        this.hooks?.toast(`New work waiting: <b>${g.name}</b> (${g.where.replace(/^(in|at) /, '')})`, '#ffd23c');
      } else {
        // a new face: the old giver signs off remotely, but you go MEET them
        const g = GIVERS[next.def.giver];
        this.hooks?.holocall(q.def.giver, [q.def.completeLine, `Go see ${g.name}, ${g.where}. Tell them I sent you. Tell them I want a finder’s fee.`], `✔ ${q.def.name} — TURNED IN REMOTELY`);
        this.hooks?.toast(`New work waiting: <b>${g.name}</b> (${g.where.replace(/^(in|at) /, '')})`, '#ffd23c');
      }
    } else {
      this.hooks?.holocall(q.def.giver, [q.def.completeLine], `✔ ${q.def.name}`);
    }
  }

  /** Marker for the compass/HUD: only meaningful on its own map. */
  markerPos(): { x: number; z: number; mapId: string; label: string } | null {
    const q = this.active;
    // fetch quests flip the compass around once the cargo's in hand
    if (q && q.def.returnToGiver && q.progress >= q.def.objective.count) {
      const g = GIVERS[q.def.giver];
      return { x: g.x, z: g.z, mapId: g.mapId, label: `Return to ${g.name}` };
    }
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
    }
    this.ensureBosses();
    if (this.quests.find((q) => q.def.id === 'q12_city')?.status === 'complete') this.unlockSides();
    // content updates append quests: a save that finished the old final
    // chapter loads with the new frontier still locked — open it
    for (let i = 0; i < this.quests.length - 1; i++) {
      if (this.quests[i].status === 'complete' && this.quests[i + 1].status === 'locked') {
        this.quests[i + 1].status = 'available';
        this.hooks?.toast(`New work waiting: <b>${GIVERS[this.quests[i + 1].def.giver].name}</b>`, '#ffd23c');
        break;
      }
    }
  }
}

export const questSystem = new QuestSystem();
