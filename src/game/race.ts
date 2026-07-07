// REDLINE'S RUN — the race state machine. Countdown, ordered checkpoint
// gates, an AI rival on a real Vehicle (same physics, no scripted speed),
// difficulty-scaled skill with gentle rubber-banding, and replayable
// rewards. Enemies are cleared and suppressed for the duration so the
// wreck-field scavvers spectate instead of participate.

import * as THREE from 'three';
import { Vehicle, vehicles, BUGGY_STATS } from './vehicle';
import { RACE_DIFFICULTIES, TRACKS, RITA_RACE_LINES, type RaceDifficulty, type RacePoint, type TrackDef } from '../data/race';
import { enemySpawner } from './enemies';
import { state } from './state';
import { terrainHeight } from '../data/world';
import { glowMat, toonMat } from '../render/toon';
import { audio } from '../audio/synth';
import { voice, VOICES } from '../audio/voice';
import { fx } from './particles';
import { pick } from '../util/rng';

const STORE_KEY = 'claudelands2.race';

interface RaceStore {
  best: Partial<Record<string, number>>;   // ms per difficulty
  wins: Partial<Record<string, boolean>>;
}

function loadStore(): RaceStore {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) ?? '') as RaceStore; }
  catch { return { best: {}, wins: {} }; }
}
function saveStore(s: RaceStore): void {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch { /* private mode */ }
}

export function formatRaceTime(ms: number): string {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const t = Math.floor((ms % 1000) / 100);
  return `${m}:${String(s).padStart(2, '0')}.${t}`;
}

export interface RaceHooks {
  scene: THREE.Scene;
  world: () => { resolveCollision: (p: THREE.Vector3, r: number) => void; arenaHalf: number };
  playerPos: () => THREE.Vector3;
  banner: (text: string) => void;
  toast: (html: string, color?: string) => void;
  grantItem: (rarity: 'epic' | 'legendary') => void;
  forceDrive: () => void;   // put the player in the buggy if they aren't
}

interface Gate {
  group: THREE.Group;
  ring: THREE.Mesh;
  beam: THREE.Mesh;
}

class RaceSystem {
  phase: 'idle' | 'countdown' | 'running' | 'done' = 'idle';
  difficulty: RaceDifficulty = RACE_DIFFICULTIES[0];
  track: TrackDef = TRACKS[0];
  /** Practice: solo time trial — no rival, no purse, just the clock. */
  practice = false;
  private hooks: RaceHooks | null = null;
  private t = 0;
  private raceMs = 0;
  private countdownLeft = 0;
  private lastBeep = -1;

  private rival: Vehicle | null = null;
  private aiLine: RacePoint[] = [];
  private aiWp = 0;
  private aiCp = 0;
  private aiLap = 0;
  private playerCp = 0;
  private playerLap = 0;
  private aiFinished = false;
  private aiFinishMs = 0;

  private gates: Gate[] = [];
  private hud: HTMLElement | null = null;

  init(hooks: RaceHooks): void { this.hooks = hooks; }

  get active(): boolean { return this.phase === 'countdown' || this.phase === 'running'; }

  store(): RaceStore { return loadStore(); }

  start(diff: RaceDifficulty, track: TrackDef = TRACKS[0], practice = false): void {
    if (!this.hooks || this.active || !vehicles.buggy) return;
    this.difficulty = diff;
    this.track = track;
    this.practice = practice;
    this.phase = 'countdown';
    this.countdownLeft = 3.4;
    this.lastBeep = -1;
    this.t = 0;
    this.raceMs = 0;
    this.playerCp = 0;
    this.playerLap = 0;
    this.aiCp = 0;
    this.aiLap = 0;
    this.aiWp = 0;
    this.aiFinished = false;

    // the scavvers take the day off
    enemySpawner.reset();
    enemySpawner.suppressed = true;

    // grid up: player buggy on the inside line, the rival on the outside
    this.hooks.forceDrive();
    vehicles.buggy.place(track.start.player.x, track.start.player.z, track.start.yaw);
    vehicles.raceLock = true;

    if (!practice) {
      const skill = diff.aiSkill;
      this.rival = new Vehicle('rival', {
        ...BUGGY_STATS,
        maxSpeed: BUGGY_STATS.maxSpeed * diff.aiSpeed,
        boostSpeed: BUGGY_STATS.boostSpeed * diff.aiSpeed,
        turnRate: BUGGY_STATS.turnRate * (0.9 + skill * 0.25),
      });
      this.rival.place(track.start.rival.x, track.start.rival.z, track.start.yaw);
      this.hooks.scene.add(this.rival.group);
      // Rita takes the cut when she's serious; otherwise a coin flip per fork
      const cut1 = diff.id === 'lunatic' ? true : Math.random() < 0.5;
      const cut2 = diff.id === 'lunatic' ? true : Math.random() < 0.5;
      this.aiLine = track.buildAiLine(cut1, cut2);
    }

    this.buildGates();
    this.setHud(true);
    this.hooks.banner(track.name + (practice ? ' — PRACTICE' : ''));
    if (!practice) {
      const startLine = pick(Math.random as never, RITA_RACE_LINES.start);
      this.hooks.toast(startLine, '#ffd23c');
      voice.speak(startLine, VOICES.rita);
    } else {
      this.hooks.toast(track.linear
        ? 'Point to point against the clock. No second lap. No excuses.'
        : `${track.laps} laps against the clock. The jungle judges silently.`, '#54d4ff');
    }
  }

  /** Player bailed (map switch, death). No refunds. */
  cancel(withMessage = true): void {
    if (!this.active) return;
    this.teardown();
    if (withMessage && this.hooks) {
      const line = pick(Math.random as never, RITA_RACE_LINES.dnf);
      this.hooks.toast(line, '#ff8c5a');
      voice.speak(line, VOICES.rita);
    }
  }

  update(dt: number): void {
    if (!this.hooks || !this.active) return;
    this.t += dt;

    // gate dressing: spin the rings, pulse the active beam
    for (let i = 0; i < this.gates.length; i++) {
      const g = this.gates[i];
      g.ring.rotation.z += dt * (i === this.playerCp ? 2.2 : 0.5);
      const mat = g.beam.material as THREE.MeshBasicMaterial;
      mat.opacity = i === this.playerCp ? 0.3 + Math.sin(this.t * 5) * 0.12 : 0.06;
    }

    if (this.phase === 'countdown') {
      this.countdownLeft -= dt;
      const whole = Math.ceil(this.countdownLeft);
      if (whole !== this.lastBeep && whole >= 1 && whole <= 3) {
        this.lastBeep = whole;
        this.hooks.banner(String(whole));
        audio.countdownBeep(false);
      }
      if (this.countdownLeft <= 0) {
        this.phase = 'running';
        this.hooks.banner('GO!');
        audio.countdownBeep(true);
      }
      return; // vehicles are frozen by main during countdown
    }

    this.raceMs += dt * 1000;

    // ---- rival driving
    if (this.rival) {
      this.driveAi(dt);
      this.rival.update(dt, this.aiInput, this.hooks.world(), false);
      // rival checkpoint progress (lap-aware)
      const cps = this.track.checkpoints;
      if (!this.aiFinished) {
        const cp = cps[this.aiCp];
        if (Math.hypot(this.rival.pos.x - cp.x, this.rival.pos.z - cp.z) < cp.r + 6) {
          this.aiCp++;
          if (this.aiCp >= cps.length) {
            this.aiCp = 0;
            this.aiLap++;
            this.aiWp = 0; // take the lap from the top (new fork coin-flips are Rita's secret)
            if (this.aiLap >= this.track.laps) {
              this.aiFinished = true;
              this.aiFinishMs = this.raceMs;
            }
          }
        }
      }
    }

    // ---- player checkpoint progress (lap-aware)
    if (vehicles.buggy) {
      const cps = this.track.checkpoints;
      const cp = cps[this.playerCp];
      const p = this.hooks.playerPos();
      if (Math.hypot(p.x - cp.x, p.z - cp.z) < cp.r) {
        this.passGate(this.playerCp);
        this.playerCp++;
        if (this.playerCp >= cps.length) {
          this.playerCp = 0;
          this.playerLap++;
          if (this.playerLap >= this.track.laps) { this.finish(); return; }
          this.hooks.banner(`LAP ${this.playerLap + 1}/${this.track.laps}`);
          audio.checkpoint();
        }
      }
    }

    this.updateHud();
  }

  /** Freeze inputs during the grid countdown. */
  get frozen(): boolean { return this.phase === 'countdown'; }

  // ------------------------------------------------------------------ AI
  private aiInput = { throttle: 0, steer: 0, drift: false, hop: false, boost: false };

  private driveAi(dt: number): void {
    void dt;
    const v = this.rival!;
    const line = this.aiLine;
    if (this.aiWp >= line.length) this.aiWp = line.length - 1;
    let target = line[this.aiWp];
    if (Math.hypot(v.pos.x - target.x, v.pos.z - target.z) < 12 && this.aiWp < line.length - 1) {
      this.aiWp++;
      target = line[this.aiWp];
    }
    const desiredYaw = Math.atan2(-(target.x - v.pos.x), -(target.z - v.pos.z));
    let diff = desiredYaw - v.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;

    const skill = this.difficulty.aiSkill;
    this.aiInput.steer = Math.max(-1, Math.min(1, diff * (1.8 + skill)));
    const sharp = Math.abs(diff) > 0.55;
    const speed = v.forwardSpeed;
    this.aiInput.throttle = sharp && speed > 17 ? 0.25 : 1;
    this.aiInput.drift = sharp && speed > 15;
    this.aiInput.boost = this.difficulty.aiBoosts && Math.abs(diff) < 0.12 && v.boostMeter > 0.5;

    // rubber-band: Rita eases up when she's clear ahead, digs in when behind
    const gap = this.aiProgress() - this.playerProgress();
    const band = gap > 900 ? 0.9 : gap < -900 ? 1.06 : 1;
    v.stats.maxSpeed = BUGGY_STATS.maxSpeed * this.difficulty.aiSpeed * band;
    v.stats.boostSpeed = BUGGY_STATS.boostSpeed * this.difficulty.aiSpeed * band;
  }

  private playerProgress(): number {
    if (!this.hooks) return 0;
    const cps = this.track.checkpoints;
    const p = this.hooks.playerPos();
    const cp = cps[Math.min(this.playerCp, cps.length - 1)];
    return (this.playerLap * cps.length + this.playerCp) * 1000 - Math.hypot(p.x - cp.x, p.z - cp.z);
  }
  private aiProgress(): number {
    if (!this.rival) return 0;
    const cps = this.track.checkpoints;
    const cp = cps[Math.min(this.aiCp, cps.length - 1)];
    return (this.aiLap * cps.length + this.aiCp) * 1000 - Math.hypot(this.rival.pos.x - cp.x, this.rival.pos.z - cp.z);
  }

  get playerPlace(): 1 | 2 {
    return this.playerProgress() >= this.aiProgress() ? 1 : 2;
  }

  // ------------------------------------------------------------------ gates
  private buildGates(): void {
    for (const [i, cp] of this.track.checkpoints.entries()) {
      const g = new THREE.Group();
      const y = terrainHeight(cp.x, cp.z);
      const isFinish = i === this.track.checkpoints.length - 1;
      const color = isFinish ? 0xffd23c : 0x54d4ff;
      // two pylons
      for (const side of [-1, 1]) {
        const px = cp.x + side * cp.r * 0.85;
        const pylon = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 6.5, 8), toonMat({ color: 0x4a4a52 }));
        pylon.position.set(px, terrainHeight(px, cp.z) + 3.25, cp.z);
        const tip = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), glowMat(color, 0.9));
        tip.position.set(px, terrainHeight(px, cp.z) + 6.8, cp.z);
        g.add(pylon, tip);
      }
      // floating halo + sky beam so the next gate reads from anywhere
      const ring = new THREE.Mesh(new THREE.TorusGeometry(cp.r * 0.55, 0.35, 8, 28), glowMat(color, 0.55));
      ring.rotation.x = Math.PI / 2;
      ring.position.set(cp.x, y + 5.5, cp.z);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 2.6, 60, 10, 1, true),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false }));
      beam.position.set(cp.x, y + 30, cp.z);
      g.add(ring, beam);
      this.hooks!.scene.add(g);
      this.gates.push({ group: g, ring, beam });
    }
  }

  private passGate(i: number): void {
    audio.checkpoint();
    const g = this.gates[i];
    // gates persist across laps — burst, don't demolish
    if (g) fx.burst(g.ring.position.clone(), 0x3ddc4e, 24, 8, 0.14, 0.8, 2);
    const left = this.track.checkpoints.length - 1 - i;
    if (left > 0) this.hooks!.toast(`CHECKPOINT — <b>${left}</b> to the line`, '#54d4ff');
  }

  // ------------------------------------------------------------------ finish
  private finish(): void {
    if (!this.hooks) return;
    const diff = this.difficulty;
    const store = loadStore();
    const key = this.practice ? `${this.track.id}:practice` : `${this.track.id}:${diff.id}`;
    const prevBest = store.best[key] ?? (this.track.id === 'redline' && !this.practice ? store.best[diff.id] : undefined);
    const isBest = prevBest === undefined || this.raceMs < prevBest;
    if (isBest) store.best[key] = Math.round(this.raceMs);

    if (this.practice) {
      this.hooks.banner('RUN COMPLETE');
      audio.questComplete();
      this.hooks.toast(`${this.track.name} — ${this.track.linear ? 'the run' : `${this.track.laps} laps`} in <b>${formatRaceTime(this.raceMs)}</b>${isBest ? ' · <b style="color:#ffd23c">PERSONAL BEST</b>' : ''}`, '#54d4ff');
    } else if (!this.aiFinished) {
      this.hooks.banner('FIRST PLACE!');
      audio.victory();
      state.money += diff.rewardCash;
      state.addXp(diff.rewardXp);
      this.hooks.toast(`${this.track.name} (${diff.name}) — <b>$${diff.rewardCash}</b> · <b>${diff.rewardXp} XP</b> · ${formatRaceTime(this.raceMs)}${isBest ? ' · <b style="color:#ffd23c">TRACK RECORD</b>' : ''}`, '#3ddc4e');
      if (diff.firstWinItem && !store.wins[key]) {
        this.hooks.grantItem(diff.firstWinItem);
      }
      store.wins[key] = true;
      const line = pick(Math.random as never, RITA_RACE_LINES.playerWins);
      this.hooks.toast(line, '#ffd23c');
      voice.speak(line, VOICES.rita);
    } else {
      this.hooks.banner('SECOND PLACE. OF TWO.');
      const consolation = Math.round(diff.rewardCash * 0.15);
      state.money += consolation;
      state.addXp(Math.round(diff.rewardXp * 0.2));
      this.hooks.toast(`Beaten by ${formatRaceTime(this.raceMs - this.aiFinishMs)} — consolation <b>$${consolation}</b>. Rematch anytime.`, '#ff8c5a');
      const line = pick(Math.random as never, RITA_RACE_LINES.ritaWins);
      this.hooks.toast(line, '#ffd23c');
      voice.speak(line, VOICES.rita);
    }
    saveStore(store);
    this.phase = 'done';
    this.teardown();
  }

  private teardown(): void {
    this.phase = 'idle';
    vehicles.raceLock = false;
    if (this.rival && this.hooks) this.hooks.scene.remove(this.rival.group);
    this.rival = null;
    for (const g of this.gates) this.hooks?.scene.remove(g.group);
    this.gates = [];
    this.setHud(false);
    enemySpawner.suppressed = false;
  }

  // ------------------------------------------------------------------ HUD
  private setHud(v: boolean): void {
    if (!this.hud) {
      this.hud = document.createElement('div');
      this.hud.id = 'race-hud';
      this.hud.style.cssText = 'position:absolute; top:64px; left:50%; transform:translateX(-50%); z-index:5; text-align:center; color:#f4ead8; text-shadow:0 2px 0 rgba(0,0,0,0.65); font-family:inherit; pointer-events:none; display:none;';
      document.getElementById('ui-root')?.appendChild(this.hud);
    }
    this.hud.style.display = v ? 'block' : 'none';
  }

  private updateHud(): void {
    if (!this.hud) return;
    const cps = this.track.checkpoints;
    const placeLine = this.practice
      ? `<div style="font-size:24px; font-weight:800; color:#54d4ff">TIME TRIAL</div>`
      : (() => {
        const place = this.playerPlace;
        return `<div style="font-size:24px; font-weight:800; color:${place === 1 ? '#3ddc4e' : '#ff8c5a'}">${place === 1 ? '1st' : '2nd'} <span style="opacity:0.6; font-size:15px;">of 2</span></div>`;
      })();
    const lapLabel = this.track.linear ? '' : `LAP ${Math.min(this.playerLap + 1, this.track.laps)}/${this.track.laps} · `;
    this.hud.innerHTML = `
      ${placeLine}
      <div style="font-size:14px; margin-top:2px;">${lapLabel}GATE ${Math.min(this.playerCp + 1, cps.length)}/${cps.length} · ${formatRaceTime(this.raceMs)}</div>`;
  }
}

export const race = new RaceSystem();
