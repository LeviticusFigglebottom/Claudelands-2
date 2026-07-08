// The player character's mouth. Listens to combat events and speaks SHORT
// class-flavored lines through the voice engine — rationed hard (chances +
// per-trigger cooldowns + a global gap) so it reads as personality, not
// nagging. Never talks over questgivers or holocalls.

import { bus } from './state';
import { voice, voiceOf } from '../audio/voice';
import { voClip } from '../audio/vo';
import { PLAYER_LINES, THUG_LINES } from '../data/playerlines';
import { PLAYER_CLASS } from '../data/classes';
import { pick } from '../util/rng';
import { prefs } from './prefs';

interface Trigger { chance: number; cooldown: number; last: number }

class PlayerVoice {
  private t = 0;
  private globalGap = 0;          // min seconds between ANY two player lines
  private killTimes: number[] = [];
  private triggers: Record<string, Trigger> = {
    kill: { chance: 0.16, cooldown: 7, last: -99 },
    multikill: { chance: 1, cooldown: 16, last: -99 },
    crit: { chance: 0.2, cooldown: 9, last: -99 },
    skill: { chance: 0.6, cooldown: 18, last: -99 },
    reload: { chance: 0.05, cooldown: 25, last: -99 },
    hurt: { chance: 0.3, cooldown: 12, last: -99 },
    downed: { chance: 1, cooldown: 4, last: -99 },
    secondwind: { chance: 1, cooldown: 4, last: -99 },
    levelup: { chance: 1, cooldown: 8, last: -99 },
    legendary: { chance: 1, cooldown: 10, last: -99 },
  };

  constructor() {
    bus.on('kill', (e) => {
      const now = this.t;
      this.killTimes.push(now);
      this.killTimes = this.killTimes.filter((k) => now - k < 4);
      if (this.killTimes.length >= 3) {
        if (this.say('multikill')) { this.killTimes = []; return; }
      }
      const crit = !!(e as { crit?: boolean }).crit;
      this.say(crit ? 'crit' : 'kill');
    });
    bus.on('downed', () => this.say('downed'));
    bus.on('secondwind', () => this.say('secondwind'));
    bus.on('levelup', () => this.say('levelup'));
  }

  /** Loot ceremony hook: call when a legendary hits the ground. */
  onLegendary(): void { this.say('legendary'); }
  onSkillCast(): void { this.say('skill'); }
  onReloadGrumble(): void { this.say('reload'); }
  onBigHurt(): void { this.say('hurt'); }

  update(dt: number): void {
    this.t += dt;
    this.globalGap = Math.max(0, this.globalGap - dt);
  }

  private say(kind: keyof typeof PLAYER_LINES['gunsmith'] | string): boolean {
    const set = PLAYER_LINES[PLAYER_CLASS.id];
    if (!set) return false;
    const lines = (set as unknown as Record<string, string[]>)[kind as string];
    if (!lines || !lines.length) return false;
    const trig = this.triggers[kind as string];
    if (!trig) return false;
    if (this.t - trig.last < trig.cooldown || this.globalGap > 0) return false;
    if (Math.random() > trig.chance) return false;
    if (voice.speaking) return false; // never talk over story dialogue
    trig.last = this.t;
    this.globalGap = 2.5;
    // THUG MODE: one glorious pool, every trigger, maximum volume.
    // RECORDED takes only when the bake is loaded — the synth fallback
    // reads as a text-to-speech warble, which defeats the entire bit.
    if (prefs().thugMode) {
      const prof = voiceOf('thug');
      const voiced = THUG_LINES.filter((l) => voClip(prof.id, l));
      voice.speak(pick(Math.random as never, voiced.length ? voiced : THUG_LINES), prof);
      return true;
    }
    voice.speak(pick(Math.random as never, lines), voiceOf(set.voiceId));
    return true;
  }
}

export const playerVoice = new PlayerVoice();
