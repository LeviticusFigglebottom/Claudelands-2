// Character voices — pass 11. Not TTS: expressive procedural speech in the
// Animal Crossing / Banjo-Kazooie tradition. Each syllable of a line becomes
// a short vowel — an oscillator through two formant filters — and the DRAMA
// comes from prosody: sentence-shaped pitch contours (statements fall,
// questions rise, exclamations sit high and hit hard), word stress, CAPS
// emphasis, comma breaths, per-syllable jitter, and per-character timbre
// (pitch, head size, rasp, vibrato, drawl). The pit announcer gets a
// slap-back echo because every arena has one.
//
// Why not real TTS: the Web Speech API is exactly the robotic monotone we
// don't want (and its voices vary per OS); neural TTS means megabytes of
// model or a cloud bill. This stays zero-asset, always-available, and reads
// as personality rather than as bad TTS.

import { audio } from './synth';
import { prefs } from '../game/prefs';
import { clamp } from '../util/maff';

export interface VoiceProfile {
  id: string;
  basePitch: number;     // Hz — the character's center
  range: number;         // 0..1 pitch spread around the contour
  rate: number;          // syllables per second
  wave: OscillatorType;
  formantShift: number;  // >1 = smaller head, brighter vowels
  breath: number;        // 0..1 noise mixed into the vowel
  vibrato: number;       // Hz of pitch wobble depth (0 = steady)
  drawl: number;         // syllable length multiplier
  gain: number;
  echo?: boolean;        // arena slap-back
  stepped?: boolean;     // quantize the contour to chant steps
}

// F1/F2 pairs for five vowel colors — cycled with a per-speaker feel
const VOWELS: [number, number][] = [
  [800, 1150],  // ah
  [520, 1900],  // eh
  [360, 2300],  // ee
  [500, 900],   // oh
  [340, 800],   // oo
];

export const VOICES: Record<string, VoiceProfile> = {
  quibb: { id: 'quibb', basePitch: 92, range: 0.22, rate: 5.4, wave: 'square', formantShift: 0.85, breath: 0.18, vibrato: 0, drawl: 1.1, gain: 0.16 },
  zaza: { id: 'zaza', basePitch: 210, range: 0.5, rate: 4.6, wave: 'triangle', formantShift: 1.1, breath: 0.1, vibrato: 7, drawl: 1.35, gain: 0.15 },
  mayor: { id: 'mayor', basePitch: 165, range: 0.34, rate: 5.8, wave: 'sawtooth', formantShift: 1.0, breath: 0.05, vibrato: 0, drawl: 1.0, gain: 0.15 },
  brann: { id: 'brann', basePitch: 148, range: 0.14, rate: 7.2, wave: 'square', formantShift: 1.05, breath: 0.04, vibrato: 0, drawl: 0.8, gain: 0.13 },
  mirelle: { id: 'mirelle', basePitch: 132, range: 0.26, rate: 4.4, wave: 'triangle', formantShift: 0.92, breath: 0.22, vibrato: 3, drawl: 1.3, gain: 0.15 },
  okto: { id: 'okto', basePitch: 118, range: 0.3, rate: 3.9, wave: 'sine', formantShift: 0.9, breath: 0.3, vibrato: 0, drawl: 1.5, gain: 0.16, stepped: true },
  juno: { id: 'juno', basePitch: 255, range: 0.42, rate: 8.6, wave: 'triangle', formantShift: 1.2, breath: 0.08, vibrato: 0, drawl: 0.72, gain: 0.14 },
  rita: { id: 'rita', basePitch: 178, range: 0.38, rate: 6.8, wave: 'sawtooth', formantShift: 1.02, breath: 0.16, vibrato: 4, drawl: 0.85, gain: 0.15 },
  // salt-cured quartermaster: low, gravelly, unhurried — every word an entry in a ledger
  peg: { id: 'peg', basePitch: 122, range: 0.2, rate: 4.8, wave: 'sawtooth', formantShift: 0.88, breath: 0.26, vibrato: 2, drawl: 1.2, gain: 0.16 },
  announcer: { id: 'announcer', basePitch: 105, range: 0.55, rate: 4.2, wave: 'sawtooth', formantShift: 0.88, breath: 0.06, vibrato: 5, drawl: 1.45, gain: 0.2, echo: true },
};

export function voiceOf(id: string): VoiceProfile {
  return VOICES[id] ?? VOICES.quibb;
}

interface Scheduled { stop: (t: number) => void }

class VoiceSystem {
  private live: Scheduled[] = [];
  private endsAt = 0;
  private echoBus: { delay: DelayNode; gain: GainNode } | null = null;

  get speaking(): boolean {
    const bus = audio.getBus();
    return !!bus && bus.ctx.currentTime < this.endsAt;
  }

  cancel(): void {
    const bus = audio.getBus();
    if (!bus) return;
    for (const s of this.live) { try { s.stop(bus.ctx.currentTime); } catch { /* already ended */ } }
    this.live = [];
    this.endsAt = 0;
  }

  /** Speak one line. Returns its rough duration in seconds (0 if muted). */
  speak(text: string, profile: VoiceProfile): number {
    if (!prefs().characterVoices) return 0;
    const bus = audio.getBus();
    if (!bus) return 0;
    this.cancel();
    const { ctx, out } = bus;

    // announcer echo bus, built once
    let sink: AudioNode = out;
    if (profile.echo) {
      if (!this.echoBus) {
        const delay = ctx.createDelay(0.5);
        delay.delayTime.value = 0.19;
        const fb = ctx.createGain();
        fb.gain.value = 0.34;
        const wet = ctx.createGain();
        wet.gain.value = 0.5;
        delay.connect(fb); fb.connect(delay);
        delay.connect(wet); wet.connect(out);
        this.echoBus = { delay, gain: wet };
      }
      sink = this.echoBus.delay;
    }

    // strip markup, split into sentences with their terminal mood
    const clean = text.replace(/<[^>]*>/g, '').replace(/[*_~`]/g, '');
    const sentences = clean.match(/[^.!?…]+[.!?…]*/g) ?? [clean];
    let t = ctx.currentTime + 0.04;
    const startT = t;

    for (const sentence of sentences) {
      const mood: 'fall' | 'rise' | 'bang' =
        sentence.includes('?') ? 'rise' : sentence.includes('!') ? 'bang' : 'fall';
      const words = sentence.trim().split(/\s+/).filter(Boolean);
      const sylTotal = Math.max(1, words.reduce((n, w) => n + countSyllables(w), 0));
      let sylIdx = 0;

      for (const word of words) {
        const caps = word.length > 2 && word === word.toUpperCase() && /[A-Z]/.test(word);
        const syls = countSyllables(word);
        for (let s = 0; s < syls; s++) {
          const p = sylIdx / sylTotal; // progress through the sentence
          let contour =
            mood === 'rise' ? 0.94 + Math.pow(p, 2.2) * 0.42
            : mood === 'bang' ? 1.12 - p * 0.1
            : 1.06 - p * 0.24;
          if (profile.stepped) contour = Math.round(contour * 6) / 6; // chant steps
          const stress = s === 0 ? 1.05 : 0.97;                       // word-initial stress
          const jitter = 1 + (Math.random() - 0.5) * profile.range;
          const pitch = profile.basePitch * contour * stress * jitter * (caps ? 1.28 : 1);
          const dur = (1 / profile.rate) * profile.drawl * (0.72 + Math.random() * 0.5) * (mood === 'bang' ? 1.08 : 1);
          const gain = profile.gain * (caps ? 1.6 : 1) * (mood === 'bang' ? 1.25 : 1) * (0.85 + Math.random() * 0.3);
          this.syllable(ctx, sink, out, profile, t, dur, pitch, gain);
          if (profile.echo) this.syllable(ctx, out, out, profile, t, dur, pitch, gain); // dry + wet
          t += dur * (0.82 + Math.random() * 0.2);
          sylIdx++;
        }
        t += 0.05; // word gap
        if (/,;:—]?$/.test(word) && word.match(/[,;:—]$/)) t += 0.2; // breath at commas
      }
      t += mood === 'bang' ? 0.28 : 0.38; // sentence rest
    }

    this.endsAt = t;
    return t - startT;
  }

  /** One vowel: osc (+breath) through two formant filters, soft envelope. */
  private syllable(ctx: AudioContext, sink: AudioNode, _out: AudioNode, profile: VoiceProfile, t0: number, dur: number, pitch: number, gain: number): void {
    const [f1, f2] = VOWELS[Math.floor(Math.random() * VOWELS.length)];
    const osc = ctx.createOscillator();
    osc.type = profile.wave;
    const p = clamp(pitch, 50, 600);
    osc.frequency.setValueAtTime(p * 1.04, t0);
    // tiny in-syllable glide keeps every syllable alive
    osc.frequency.exponentialRampToValueAtTime(p * (Math.random() < 0.5 ? 0.92 : 1.06), t0 + dur);
    if (profile.vibrato > 0) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 5.5;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = profile.vibrato;
      lfo.connect(lfoGain); lfoGain.connect(osc.frequency);
      lfo.start(t0); lfo.stop(t0 + dur + 0.1);
      this.live.push(lfo);
    }

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(gain, t0 + 0.024);
    env.gain.setValueAtTime(gain, t0 + Math.max(0.03, dur - 0.05));
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    for (const [freq, bw] of [[f1, 90], [f2, 140]] as const) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = freq * profile.formantShift;
      bp.Q.value = freq / bw;
      osc.connect(bp); bp.connect(env);
    }
    env.connect(sink);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
    this.live.push(osc);

    // breathiness: a whisper of noise through the upper formant
    if (profile.breath > 0.02) {
      const noise = ctx.createBufferSource();
      const bus = audio.getBus();
      if (bus) {
        noise.buffer = this.noiseBuffer(ctx);
        noise.loop = true;
        const nf = ctx.createBiquadFilter();
        nf.type = 'bandpass';
        nf.frequency.value = f2 * profile.formantShift;
        nf.Q.value = 4;
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.0001, t0);
        ng.gain.exponentialRampToValueAtTime(gain * profile.breath, t0 + 0.03);
        ng.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        noise.connect(nf); nf.connect(ng); ng.connect(sink);
        noise.start(t0); noise.stop(t0 + dur + 0.02);
        this.live.push(noise);
      }
    }

    // occasional consonant onset: a 20ms click of filtered noise
    if (Math.random() < 0.3) {
      const click = ctx.createBufferSource();
      click.buffer = this.noiseBuffer(ctx);
      const hf = ctx.createBiquadFilter();
      hf.type = 'highpass';
      hf.frequency.value = 1800;
      const cg = ctx.createGain();
      cg.gain.setValueAtTime(gain * 0.5, t0 - 0.005 > 0 ? t0 - 0.005 : t0);
      cg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.025);
      click.connect(hf); hf.connect(cg); cg.connect(sink);
      click.start(t0); click.stop(t0 + 0.04);
      this.live.push(click);
    }
  }

  private noiseCache: AudioBuffer | null = null;
  private noiseBuffer(ctx: AudioContext): AudioBuffer {
    if (!this.noiseCache) {
      this.noiseCache = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const d = this.noiseCache.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return this.noiseCache;
  }
}

/** Rough syllable count: vowel groups, floor 1. */
function countSyllables(word: string): number {
  const m = word.toLowerCase().match(/[aeiouy]+/g);
  return Math.max(1, Math.min(m ? m.length : 1, 5));
}

export const voice = new VoiceSystem();
