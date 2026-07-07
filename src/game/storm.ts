// SKYFALL — Voltholm's signature hazard. The sky runs on a schedule: every
// `period` seconds a lightning front rolls through. You get `warn` seconds
// of civic siren, then `strikes` seconds of bolts hunting the open ground.
// Conductor rods (poi kind 'rod') project a shelter radius — stand inside
// one and the rod eats your bolt with a satisfied crack. Stand outside one
// and you ARE the rod.

import * as THREE from 'three';
import { WORLD, activeMap } from '../data/world';
import { fx } from './particles';
import { audio } from './../audio/synth';
import { banner } from '../ui/misc';

export const ROD_SHELTER_R = 10;

export type StormPhase = 'off' | 'calm' | 'warn' | 'strike';

class StormSystem {
  private t = 0;            // position inside the current cycle
  private boltT = 0;
  private sirenT = 0;
  private warned = false;
  /** Rod ground positions for the active map, cached on reset. */
  private rods: { x: number; z: number }[] = [];

  /** Hooks main.ts fills in once. */
  damagePlayer: (amount: number, element: string, from?: THREE.Vector3) => void = () => {};
  groundHeight: (x: number, z: number) => number = () => 0;
  playerLevel: () => number = () => 1;

  reset(): void {
    // start mid-calm so a fresh map entry isn't greeted with instant sirens
    this.t = 0;
    this.warned = false;
    this.rods = activeMap().pois.filter((p) => p.kind === 'rod').map((p) => ({ x: p.x, z: p.z }));
  }

  phase(): StormPhase {
    const s = WORLD.storm;
    if (!s) return 'off';
    const calm = s.period - s.warn - s.strikes;
    if (this.t < calm) return 'calm';
    if (this.t < calm + s.warn) return 'warn';
    return 'strike';
  }

  /** Seconds until the bolts start — HUD countdown during the warn phase. */
  timeToStrike(): number {
    const s = WORLD.storm;
    if (!s) return Infinity;
    return Math.max(0, s.period - s.strikes - this.t);
  }

  sheltered(pos: THREE.Vector3): boolean {
    for (const r of this.rods) {
      if (Math.hypot(pos.x - r.x, pos.z - r.z) < ROD_SHELTER_R) return true;
    }
    return false;
  }

  nearestRod(pos: THREE.Vector3): { x: number; z: number } | null {
    let best: { x: number; z: number } | null = null;
    let bd = Infinity;
    for (const r of this.rods) {
      const d = Math.hypot(pos.x - r.x, pos.z - r.z);
      if (d < bd) { bd = d; best = r; }
    }
    return best;
  }

  update(dt: number, playerPos: THREE.Vector3, paused: boolean): void {
    const s = WORLD.storm;
    if (!s || paused) return;
    this.t += dt;
    if (this.t >= s.period) { this.t -= s.period; this.warned = false; }
    const ph = this.phase();

    if (ph === 'warn') {
      if (!this.warned) {
        this.warned = true;
        banner('SKYFALL INBOUND — GET TO A ROD');
      }
      this.sirenT -= dt;
      if (this.sirenT <= 0) { this.sirenT = 1.6; audio.siren(); }
    }

    if (ph === 'strike') {
      this.boltT -= dt;
      if (this.boltT <= 0) {
        this.boltT = 0.55 + Math.random() * 0.5;
        const safe = this.sheltered(playerPos);
        // the storm hunts: bolts land around (or on) whoever's in the open
        let target: THREE.Vector3;
        if (safe) {
          // the rod earns its keep — the bolt lands on the mast, not you
          const rod = this.nearestRod(playerPos)!;
          target = new THREE.Vector3(rod.x, 0, rod.z);
        } else if (Math.random() < 0.45) {
          target = playerPos.clone(); // named. addressed. delivered.
        } else {
          const a = Math.random() * Math.PI * 2;
          const d = 4 + Math.random() * 18;
          target = playerPos.clone().add(new THREE.Vector3(Math.cos(a) * d, 0, Math.sin(a) * d));
        }
        target.y = this.groundHeight(target.x, target.z);
        fx.skyBolt(target);
        audio.thunder(target.distanceTo(playerPos) < 14);
        if (!safe) {
          const d = Math.hypot(target.x - playerPos.x, target.z - playerPos.z);
          if (d < 3.2) {
            this.damagePlayer(9 + this.playerLevel() * 1.1, 'volt', target);
          }
        }
      }
    }
  }
}

export const storm = new StormSystem();
