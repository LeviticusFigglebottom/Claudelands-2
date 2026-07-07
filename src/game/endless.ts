// ENDLESS MODE — the Crucible. Waves of enemies from every faction, scaling
// in level and spawn tempo; every 5th wave is a boss with a guaranteed
// legendary (bosses already ceremony that via dropTier). Intermissions give
// time to loot, shop at the pit vendors, and regret. Best wave persists.

import * as THREE from 'three';
import { ENEMIES, BOSS_GUTTERBALL, BOSS_WARDEN, BOSS_AVALANCHE, BOSS_FURNACE, BOSS_BLOOM, BOSS_ANCHORHEAD, BOSS_MOTHERLODE, BOSS_UNKEEPER, BOSS_ABBOT, BOSS_GALEPRIME, type EnemyDef } from '../data/enemies';
import { enemySpawner, type Enemy } from './enemies';
import { spawnBoss, type BossId } from './boss';
import { state } from './state';
import { audio } from '../audio/synth';
import { announcer } from './announcer';

const BOSS_CYCLE: { id: BossId; def: EnemyDef }[] = [
  { id: 'gutterball', def: BOSS_GUTTERBALL },
  { id: 'warden_prime', def: BOSS_WARDEN },
  { id: 'old_man_avalanche', def: BOSS_AVALANCHE },
  { id: 'saint_furnace', def: BOSS_FURNACE },
  { id: 'bloom_mother', def: BOSS_BLOOM },
  { id: 'admiral_anchorhead', def: BOSS_ANCHORHEAD },
  { id: 'mother_lode', def: BOSS_MOTHERLODE },
  { id: 'unkeeper', def: BOSS_UNKEEPER },
  { id: 'static_abbot', def: BOSS_ABBOT },
  { id: 'gale_prime', def: BOSS_GALEPRIME },
];

/** Trash pool: a spread of behaviors from every faction — later entries
 *  unlock as waves climb (the pool window widens with the wave count). */
const WAVE_POOL = [
  'rustpunk', 'scrapmutt', 'shieldhead', 'lobber', 'fusebug',
  'helix_drone', 'helix_stinger', 'snowmad', 'frostmutt', 'icicle_lobber',
  'ashwalker', 'ash_shrike', 'boilerbruiser', 'avalanche_bruiser', 'cinderhulk', 'lattice_warden',
  // Veldt Minor's exports: the jungle, the drowned coast, and the deep
  'frond_stalker', 'dartlurker', 'sporeling', 'razorbeak', 'shaman', 'thorn_hurler',
  'brine_husk', 'harpooneer', 'snapjaw', 'gullwing', 'tidecaller', 'anchor_hulk',
  'gloomstalker', 'shardcaster', 'gravemite', 'lantern_wisp', 'spitgrub', 'deep_roller',
  // Voltholm's weather crews clock in last
  'zephyrite', 'conductor', 'stormcrow', 'thunderhead', 'ballast_golem',
];

const BEST_KEY = 'claudelands2.crucible';
const INTERMISSION = 12;

export interface EndlessHooks {
  playerPos: () => THREE.Vector3;
  groundHeight: (x: number, z: number) => number;
  banner: (text: string) => void;
  toast: (html: string, color?: string) => void;
  healPlayer: () => void;
}

class EndlessSystem {
  running = false;
  wave = 0;
  phase: 'intermission' | 'combat' = 'intermission';
  timer = 0;
  private toSpawn = 0;
  private spawnTimer = 0;
  private hooks: EndlessHooks | null = null;
  private countdownShown = -1;

  bestWave(): number {
    try { return Number(localStorage.getItem(BEST_KEY) ?? 0); } catch { return 0; }
  }

  start(hooks: EndlessHooks): void {
    this.hooks = hooks;
    this.running = true;
    this.wave = 0;
    this.phase = 'intermission';
    this.timer = 6; // short ramp into wave 1
    this.toSpawn = 0;
    this.countdownShown = -1;
  }

  stop(): void { this.running = false; }

  /** Level of this wave's enemies: player floor plus wave pressure. */
  private waveLevel(): number {
    return Math.max(state.level, 10) + Math.floor(this.wave * 0.7);
  }

  get isBossWave(): boolean { return this.wave % 5 === 0 && this.wave > 0; }

  get hudLine(): string {
    if (this.phase === 'intermission') return `WAVE ${this.wave + 1} in ${Math.ceil(this.timer)}s — shop fast`;
    const alive = enemySpawner.aliveCount();
    return `WAVE ${this.wave}${this.isBossWave ? ' · BOSS' : ''} — ${alive + this.toSpawn} left`;
  }

  update(dt: number): void {
    if (!this.running || !this.hooks) return;

    if (this.phase === 'intermission') {
      this.timer -= dt;
      const whole = Math.ceil(this.timer);
      if (whole !== this.countdownShown && whole <= 3 && whole >= 1) {
        this.countdownShown = whole;
        audio.uiClick();
      }
      if (this.timer <= 0) this.beginWave();
      return;
    }

    // combat: trickle-spawn the remaining budget, tempo rising with waves
    if (this.toSpawn > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = Math.max(0.4, 2.2 - this.wave * 0.09);
        this.spawnPack(Math.min(this.toSpawn, 1 + Math.floor(this.wave / 4)));
      }
    } else if (enemySpawner.aliveCount() === 0) {
      this.endWave();
    }
  }

  private beginWave(): void {
    this.wave++;
    this.phase = 'combat';
    if (this.isBossWave) {
      const boss = BOSS_CYCLE[(Math.floor(this.wave / 5) - 1) % BOSS_CYCLE.length];
      this.hooks!.banner(`WAVE ${this.wave} — ${boss.def.name.toUpperCase()}`);
      announcer.waveStart(this.wave, boss.def.name);
      spawnBoss(boss.id, new THREE.Vector3(0, 0, -20), this.waveLevel() + 1);
      this.toSpawn = Math.min(4 + this.wave, 14); // the boss brings friends
    } else {
      this.hooks!.banner(`WAVE ${this.wave}`);
      announcer.waveStart(this.wave, null);
      this.toSpawn = Math.min(5 + Math.floor(this.wave * 1.6), 26);
    }
    audio.questAccept();
    this.spawnTimer = 0.5;
  }

  private spawnPack(n: number): void {
    const lvl = this.waveLevel();
    for (let i = 0; i < n; i++) {
      const id = WAVE_POOL[Math.floor(Math.random() * Math.min(WAVE_POOL.length, 6 + this.wave))];
      const def = ENEMIES[id];
      if (!def) continue;
      const a = Math.random() * Math.PI * 2;
      const r = 26 + Math.random() * 14;
      const x = Math.sin(a) * r, z = Math.cos(a) * r;
      const badass = Math.random() < Math.min(0.05 + this.wave * 0.015, 0.35);
      const e: Enemy = enemySpawner.spawnOne(def, new THREE.Vector3(x, 0, z), badass, lvl - state.level);
      e.aggro = true;
      this.toSpawn--;
      if (this.toSpawn <= 0) break;
    }
  }

  private endWave(): void {
    this.phase = 'intermission';
    this.timer = INTERMISSION;
    this.countdownShown = -1;
    const bonus = 40 + this.wave * 25;
    state.money += bonus;
    this.hooks!.healPlayer();
    this.hooks!.banner(`WAVE ${this.wave} CLEAR`);
    announcer.waveClear(this.wave);
    this.hooks!.toast(`Purse: <b>+$${bonus}</b> · next wave in ${INTERMISSION}s`, '#ffd23c');
    audio.victory();
    try {
      if (this.wave > this.bestWave()) localStorage.setItem(BEST_KEY, String(this.wave));
    } catch { /* private mode */ }
  }
}

export const endless = new EndlessSystem();
