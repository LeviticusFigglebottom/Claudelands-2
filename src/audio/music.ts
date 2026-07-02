// Procedural dynamic music: an original 16-step pattern engine synthesized
// live on WebAudio — no audio assets. Three intensity states crossfade:
//   0 calm    — sparse two-note desert drone
//   1 combat  — kick/hat groove + minor bass line
//   2 boss    — faster, added off-beat stabs
// Driven each frame from combat state (aggro count / boss active).

import { audio } from './synth';

const BASS_CALM = [0, -1, -1, -1, 3, -1, -1, -1, 0, -1, -1, -1, -2, -1, -1, -1];
const BASS_COMBAT = [0, -1, 0, -1, 3, -1, 3, 5, 0, -1, 0, -1, -2, -1, 5, 3];
const STAB_BOSS = [-1, -1, 7, -1, -1, -1, 7, -1, -1, 10, -1, -1, 7, -1, 8, -1];

class MusicEngine {
  private step = 0;
  private nextTime = 0;
  private intensity = 0;        // smoothed 0..2
  private target = 0;
  private busGain: GainNode | null = null;
  private started = false;

  /** Call once per frame. */
  update(dt: number, target: 0 | 1 | 2): void {
    this.target = target;
    const bus = audio.getBus();
    if (!bus) return;
    if (!this.started) {
      this.started = true;
      this.busGain = bus.ctx.createGain();
      this.busGain.gain.value = 0.55;
      this.busGain.connect(bus.out);
      this.nextTime = bus.ctx.currentTime + 0.1;
    }
    // smooth intensity so transitions breathe
    this.intensity += (this.target - this.intensity) * Math.min(1, dt * 1.2);

    // lookahead scheduler
    const ctx = bus.ctx;
    const bpm = 92 + this.intensity * 22;
    const stepDur = 60 / bpm / 2; // 8th notes
    while (this.nextTime < ctx.currentTime + 0.25) {
      this.scheduleStep(ctx, this.nextTime, this.step);
      this.nextTime += stepDur;
      this.step = (this.step + 1) % 16;
    }
  }

  private tone(ctx: AudioContext, t: number, dur: number, gain: number, type: OscillatorType, f0: number, f1 = f0, filterFreq = 0): void {
    if (gain <= 0.001 || !this.busGain) return;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(f1, 20), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node: AudioNode = g;
    if (filterFreq > 0) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = filterFreq;
      o.connect(f); f.connect(g);
    } else {
      o.connect(g);
    }
    node.connect(this.busGain);
    o.start(t); o.stop(t + dur + 0.05);
  }

  private noiseHit(ctx: AudioContext, t: number, dur: number, gain: number, hp: number): void {
    if (gain <= 0.001 || !this.busGain) return;
    const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = hp;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(f); f.connect(g); g.connect(this.busGain);
    src.start(t);
  }

  private scheduleStep(ctx: AudioContext, t: number, s: number): void {
    const calm = Math.max(0, 1 - this.intensity);            // 1 at rest
    const combat = Math.max(0, Math.min(1, this.intensity)); // ramps in first
    const boss = Math.max(0, this.intensity - 1);            // ramps 1→2

    const root = 55; // A1
    const semitone = (n: number) => root * Math.pow(2, n / 12);

    // calm drone: long soft fifth on bar starts
    if (s === 0) this.tone(ctx, t, 2.2, 0.05 * calm, 'sine', semitone(0));
    if (s === 8) this.tone(ctx, t, 2.2, 0.04 * calm, 'sine', semitone(7));

    // kick on quarters
    if (s % 4 === 0) this.tone(ctx, t, 0.16, 0.24 * combat, 'sine', 130, 40);
    // hats on off-8ths
    if (s % 2 === 1) this.noiseHit(ctx, t, 0.04, 0.05 * combat, 6000);
    // snare-ish on 4 and 12
    if (s === 4 || s === 12) this.noiseHit(ctx, t, 0.1, 0.1 * combat, 1800);

    // bass line
    const bassNote = (boss > 0.4 ? BASS_COMBAT : combat > 0.05 ? BASS_COMBAT : BASS_CALM)[s];
    if (bassNote >= 0 || bassNote === -2) {
      const n = bassNote === -2 ? -2 : bassNote;
      if (BASS_COMBAT[s] !== -1) this.tone(ctx, t, 0.22, 0.11 * combat, 'sawtooth', semitone(n), semitone(n), 500);
    }

    // boss stabs
    const stab = STAB_BOSS[s];
    if (stab >= 0) {
      this.tone(ctx, t, 0.12, 0.07 * boss, 'square', semitone(stab + 12), semitone(stab + 12), 1600);
      this.tone(ctx, t, 0.12, 0.05 * boss, 'square', semitone(stab + 15.1), semitone(stab + 15.1), 1600);
    }
    // boss double-time kick
    if (boss > 0.3 && s % 4 === 2) this.tone(ctx, t, 0.12, 0.14 * boss, 'sine', 120, 45);
  }
}

export const music = new MusicEngine();
