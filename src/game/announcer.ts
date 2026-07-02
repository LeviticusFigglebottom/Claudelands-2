// THE CRUCIBLE's house announcer — "BIG NAZDA", equal parts carnival barker
// and safety violation. Fires on wave starts/clears, boss waves, player
// downs and second winds, and hot kill streaks. Performed by the character
// voice engine's echo-slathered announcer profile; enabled only while the
// pit is live (endless mode or a Brasshaven pit run) — enemies don't talk,
// the HOUSE does.

import { voice, VOICES } from '../audio/voice';
import { bus } from './state';
import { pick } from '../util/rng';

const WAVE_START = [
  'WAVE {n}! Release the regrets!',
  'Wave {n}, folks! The floor is lava-ADJACENT!',
  'HERE COMES WAVE {n}! Somebody hide the medics!',
  'Wave {n}! Betting window is CLOSED. Morally it was never open!',
];
const BOSS_WAVE = [
  'OHHH it’s a BOSS WAVE! {boss} has entered the pit and the insurance has LEFT!',
  'WAVE {n}! Main event! {boss}! The crowd goes appropriately concerned!',
];
const WAVE_CLEAR = [
  'WAVE {n} CLEARED! The pit is briefly a floor again!',
  'CLEAR! Somebody hose that down before wave {next}!',
  'And that’s wave {n}! Shop fast, bleed slower!',
  'CLEANUP ON WAVE {n}! Purse is paid! The vultures send compliments!',
];
const PLAYER_DOWN = [
  'DOWN GOES THE CONTRACTOR! Get up, the paperwork isn’t done!',
  'OHHH! Right in the everything! Fight for it, kid!',
];
const SECOND_WIND = [
  'AND THEY’RE BACK UP! The pit LOVES a comeback!',
  'SECOND WIND! Refunds cancelled!',
];
const STREAK = [
  '{k} in a row! Someone check the scoreboard for smoke!',
  'A {k}-STREAK! The house is legally impressed!',
];

class Announcer {
  /** Only the pit gets a commentator. */
  enabled = false;
  private streak = 0;
  private streakT = 0;
  private lastStreakCall = 0;

  constructor() {
    bus.on('downed', () => { if (this.enabled) this.say(pick(Math.random as never, PLAYER_DOWN)); });
    bus.on('secondwind', () => { if (this.enabled) this.say(pick(Math.random as never, SECOND_WIND)); });
    bus.on('kill', () => {
      if (!this.enabled) return;
      this.streak++;
      this.streakT = 4;
      if (this.streak >= 5 && this.streak % 5 === 0 && performance.now() - this.lastStreakCall > 9000) {
        this.lastStreakCall = performance.now();
        this.say(pick(Math.random as never, STREAK).replace('{k}', String(this.streak)));
      }
    });
  }

  update(dt: number): void {
    if (this.streakT > 0) {
      this.streakT -= dt;
      if (this.streakT <= 0) this.streak = 0;
    }
  }

  waveStart(n: number, bossName: string | null): void {
    if (!this.enabled) return;
    const line = bossName
      ? pick(Math.random as never, BOSS_WAVE).replace('{n}', String(n)).replace('{boss}', bossName.toUpperCase())
      : pick(Math.random as never, WAVE_START).replace('{n}', String(n));
    this.say(line);
  }

  waveClear(n: number): void {
    if (!this.enabled) return;
    this.say(pick(Math.random as never, WAVE_CLEAR).replace('{n}', String(n)).replace('{next}', String(n + 1)));
  }

  welcome(): void {
    if (!this.enabled) return;
    this.say('LADIES, GENTLEFOLK, AND VULTURES! Fresh meat in the CRUCIBLE!');
  }

  private say(line: string): void {
    voice.speak(line, VOICES.announcer);
  }
}

export const announcer = new Announcer();
