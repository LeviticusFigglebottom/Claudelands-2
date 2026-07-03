// THE CRUCIBLE's house announcer — "BIG NAZDA", equal parts carnival barker
// and safety violation. Fires on wave starts/clears, boss waves, player
// downs and second winds, and hot kill streaks. Performed by the character
// voice engine's echo-slathered announcer profile; enabled only while the
// pit is live (endless mode or a Brasshaven pit run) — enemies don't talk,
// the HOUSE does.

import { voice, VOICES } from '../audio/voice';
import { bus } from './state';
import { pick } from '../util/rng';
import {
  ANNOUNCER_WAVE_START as WAVE_START, ANNOUNCER_BOSS_WAVE as BOSS_WAVE,
  ANNOUNCER_WAVE_CLEAR as WAVE_CLEAR, ANNOUNCER_PLAYER_DOWN as PLAYER_DOWN,
  ANNOUNCER_SECOND_WIND as SECOND_WIND, ANNOUNCER_STREAK as STREAK,
  ANNOUNCER_WELCOME,
} from '../data/announcerlines';


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
    this.say(ANNOUNCER_WELCOME);
  }

  private say(line: string): void {
    voice.speak(line, VOICES.announcer);
  }
}

export const announcer = new Announcer();
