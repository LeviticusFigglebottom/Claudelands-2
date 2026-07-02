// Game feel, centralized. Screen shake (trauma model), hit-stop on
// crits/kills, FOV kick, viewmodel recoil impulses. Every knob is in JUICE
// so feel-tuning is one file — this is the charm budget, spend it here.

import { clamp01, damp } from '../util/maff';

export const JUICE = {
  shakeDecay: 1.6,
  shakeMaxAngle: 0.02,     // rad roll
  shakeMaxOffset: 0.09,    // m
  shakeFreq: 24,
  hitstopCrit: 0.045,      // s of near-frozen time on crit kill
  hitstopKill: 0.03,
  fovKickFire: 0.7,        // deg per shot (scaled by weapon punch)
  fovRecover: 9,
  recoilRecover: 11,
};

class JuiceSystem {
  private trauma = 0;
  private hitstop = 0;
  fovKick = 0;
  /** viewmodel recoil state, consumed by player.ts */
  recoilPitch = 0;
  recoilBack = 0;
  private t = 0;

  addTrauma(amount: number): void { this.trauma = clamp01(this.trauma + amount); }
  addHitstop(seconds: number): void { this.hitstop = Math.max(this.hitstop, seconds); }
  kickFov(amount: number): void { this.fovKick += amount; }
  kickRecoil(pitch: number, back: number): void {
    this.recoilPitch += pitch;
    this.recoilBack += back;
  }

  /** Returns the time scale for this frame (hit-stop slows the world). */
  update(dt: number): number {
    this.t += dt;
    this.trauma = Math.max(0, this.trauma - JUICE.shakeDecay * dt * (0.4 + this.trauma));
    this.fovKick = damp(this.fovKick, 0, JUICE.fovRecover, dt);
    this.recoilPitch = damp(this.recoilPitch, 0, JUICE.recoilRecover, dt);
    this.recoilBack = damp(this.recoilBack, 0, JUICE.recoilRecover, dt);
    if (this.hitstop > 0) {
      this.hitstop -= dt;
      return 0.12; // near-freeze, not full stop — keeps flow
    }
    return 1;
  }

  /** Camera shake sample: [offsetX, offsetY, roll]. */
  sample(): [number, number, number] {
    const s = this.trauma * this.trauma; // squared reads better
    const t = this.t * JUICE.shakeFreq;
    // cheap value-noise via incommensurate sines
    const nx = Math.sin(t * 1.1) * 0.6 + Math.sin(t * 2.3 + 5) * 0.4;
    const ny = Math.sin(t * 1.7 + 2) * 0.6 + Math.sin(t * 2.9 + 8) * 0.4;
    const nr = Math.sin(t * 1.3 + 4) * 0.6 + Math.sin(t * 3.1 + 1) * 0.4;
    return [nx * s * JUICE.shakeMaxOffset, ny * s * JUICE.shakeMaxOffset, nr * s * JUICE.shakeMaxAngle];
  }
}

export const juice = new JuiceSystem();
