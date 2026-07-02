// 100% procedural WebAudio SFX — no audio assets. Every sound is synthesized:
// gunshots keyed to manufacturer character, rarity-pitched loot stings,
// elemental sizzles, UI blips, ambient wind. Central place to tune the mix.

import { clamp } from '../util/maff';

type ShotStyle = 'heavy' | 'clean' | 'junk' | 'arcane' | 'antique' | 'plastic';

export class AudioSystem {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private noiseBuf!: AudioBuffer;
  private started = false;

  /** Must be called from a user gesture. Safe to call repeatedly. */
  unlock(): void {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.ratio.value = 6;
      this.master.connect(comp);
      comp.connect(this.ctx.destination);
      this.noiseBuf = this.makeNoise();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    if (!this.started) { this.started = true; this.startAmbience(); }
  }

  private makeNoise(): AudioBuffer {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  private now(): number { return this.ctx!.currentTime; }

  private env(node: GainNode, t0: number, peak: number, attack: number, decay: number): void {
    const g = node.gain;
    g.setValueAtTime(0.0001, t0);
    g.exponentialRampToValueAtTime(Math.max(peak, 0.0001), t0 + attack);
    g.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  }

  private noise(t0: number, dur: number, peak: number, filterType: BiquadFilterType, freq: number, q = 1, freqEnd?: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.setValueAtTime(freq, t0);
    if (freqEnd !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 20), t0 + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    this.env(g, t0, peak, 0.003, dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t0); src.stop(t0 + dur + 0.1);
  }

  private tone(t0: number, dur: number, peak: number, type: OscillatorType, f0: number, f1?: number, attack = 0.005): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1 !== undefined) o.frequency.exponentialRampToValueAtTime(Math.max(f1, 10), t0 + dur);
    const g = ctx.createGain();
    this.env(g, t0, peak, attack, dur);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + dur + attack + 0.1);
  }

  // ---------------------------------------------------------------- weapons

  shot(style: ShotStyle, pitch = 1): void {
    if (!this.ctx) return;
    const t = this.now();
    switch (style) {
      case 'heavy': // VULKRAM: cannon thump
        this.noise(t, 0.22, 0.9, 'lowpass', 900 * pitch, 1, 120);
        this.tone(t, 0.16, 0.7, 'sine', 120 * pitch, 38);
        this.noise(t, 0.05, 0.5, 'highpass', 2500, 1);
        break;
      case 'clean': // Lumen: precise zap-crack
        this.tone(t, 0.07, 0.4, 'square', 1900 * pitch, 500);
        this.noise(t, 0.06, 0.45, 'bandpass', 4200 * pitch, 2, 1500);
        break;
      case 'junk': // Ratworks: rattly bang
        this.noise(t, 0.09, 0.7, 'bandpass', 1400 * pitch, 0.7, 300);
        this.tone(t, 0.05, 0.35, 'sawtooth', 300 * pitch, 90);
        this.noise(t + 0.03, 0.04, 0.2, 'highpass', 5000, 1); // loose-parts rattle
        break;
      case 'arcane': // Aetheric: harmonic pulse
        this.tone(t, 0.14, 0.35, 'sine', 880 * pitch, 220);
        this.tone(t, 0.1, 0.25, 'triangle', 1320 * pitch, 330);
        this.noise(t, 0.08, 0.3, 'bandpass', 3000 * pitch, 3, 800);
        break;
      case 'antique': // Cordwood: sharp black-powder crack
        this.noise(t, 0.12, 0.85, 'bandpass', 2000 * pitch, 0.8, 250);
        this.tone(t, 0.09, 0.5, 'sine', 180 * pitch, 55);
        break;
      case 'plastic': // Briskco: cheap pop
        this.tone(t, 0.05, 0.5, 'square', 700 * pitch, 200);
        this.noise(t, 0.05, 0.4, 'highpass', 3000, 1);
        break;
    }
  }

  reloadClack(stage: 0 | 1): void {
    if (!this.ctx) return;
    const t = this.now();
    if (stage === 0) { this.noise(t, 0.05, 0.35, 'bandpass', 900, 4, 400); this.tone(t, 0.04, 0.15, 'square', 500, 300); }
    else { this.noise(t, 0.06, 0.4, 'bandpass', 1500, 4, 700); this.tone(t, 0.05, 0.2, 'square', 800, 1200); }
  }

  dryFire(): void {
    if (!this.ctx) return;
    this.tone(this.now(), 0.05, 0.25, 'square', 320, 240);
  }

  gunThrow(): void { // Briskco reload-toss whoosh
    if (!this.ctx) return;
    this.noise(this.now(), 0.25, 0.3, 'bandpass', 600, 1, 1800);
  }

  explosion(big = false): void {
    if (!this.ctx) return;
    const t = this.now();
    this.noise(t, big ? 0.7 : 0.4, big ? 1.0 : 0.7, 'lowpass', 700, 1, 60);
    this.tone(t, big ? 0.5 : 0.3, 0.6, 'sine', 90, 30);
    this.noise(t, 0.08, 0.4, 'highpass', 3000, 1);
  }

  // ---------------------------------------------------------------- feedback

  hit(crit: boolean): void {
    if (!this.ctx) return;
    const t = this.now();
    if (crit) { this.tone(t, 0.07, 0.3, 'square', 1500, 2200); this.tone(t, 0.09, 0.2, 'square', 2000, 3000); }
    else this.tone(t, 0.04, 0.18, 'square', 900, 1100);
  }

  kill(): void {
    if (!this.ctx) return;
    const t = this.now();
    this.tone(t, 0.12, 0.3, 'square', 500, 900);
    this.tone(t + 0.06, 0.14, 0.3, 'square', 750, 1300);
  }

  elemental(kind: string): void {
    if (!this.ctx) return;
    const t = this.now();
    switch (kind) {
      case 'ember': this.noise(t, 0.3, 0.25, 'bandpass', 1800, 1, 900); break;
      case 'bile': this.noise(t, 0.35, 0.25, 'bandpass', 500, 2, 200); this.tone(t, 0.2, 0.1, 'sine', 250, 90); break;
      case 'volt': for (let i = 0; i < 4; i++) this.tone(t + i * 0.03, 0.03, 0.2, 'square', 2400 + Math.random() * 2000, 900); break;
      case 'rime': this.tone(t, 0.25, 0.2, 'sine', 1900, 2600, 0.05); this.tone(t, 0.25, 0.12, 'sine', 2533, 3400, 0.05); break;
      case 'blast': this.explosion(false); break;
    }
  }

  // ---------------------------------------------------------------- loot

  /** Rarity 0..5; higher = fancier arpeggio. THE sound of the game. */
  lootSting(tier: number): void {
    if (!this.ctx) return;
    const t = this.now();
    const roots = [392, 440, 494, 587, 659, 784]; // brighter root per tier
    const root = roots[clamp(tier, 0, 5)];
    const steps = tier <= 0 ? [0] : tier === 1 ? [0, 4] : tier === 2 ? [0, 4, 7] : tier === 3 ? [0, 4, 7, 12] : [0, 4, 7, 12, 16];
    steps.forEach((s, i) => {
      const f = root * Math.pow(2, s / 12);
      this.tone(t + i * 0.07, 0.4, 0.22, 'triangle', f, f, 0.01);
      if (tier >= 4) this.tone(t + i * 0.07, 0.5, 0.1, 'sine', f * 2, f * 2, 0.01);
    });
    if (tier >= 4) this.noise(t, 0.8, 0.12, 'highpass', 6000, 1); // legendary shimmer
  }

  pickup(): void {
    if (!this.ctx) return;
    const t = this.now();
    this.tone(t, 0.08, 0.25, 'triangle', 700, 1100);
    this.tone(t + 0.05, 0.1, 0.2, 'triangle', 1100, 1500);
  }

  cash(): void {
    if (!this.ctx) return;
    const t = this.now();
    this.tone(t, 0.05, 0.2, 'square', 1800, 1800);
    this.tone(t + 0.04, 0.06, 0.2, 'square', 2400, 2400);
  }

  chestOpen(): void {
    if (!this.ctx) return;
    const t = this.now();
    this.noise(t, 0.3, 0.3, 'bandpass', 300, 2, 90); // creak-thunk
    [523, 659, 784, 1047].forEach((f, i) => this.tone(t + 0.15 + i * 0.09, 0.5, 0.2, 'triangle', f));
  }

  levelUp(): void {
    if (!this.ctx) return;
    const t = this.now();
    [523, 659, 784, 1047, 1319].forEach((f, i) => {
      this.tone(t + i * 0.08, 0.5, 0.25, 'triangle', f);
      this.tone(t + i * 0.08, 0.6, 0.1, 'sine', f * 2);
    });
  }

  secondWind(): void {
    if (!this.ctx) return;
    const t = this.now();
    this.tone(t, 0.5, 0.35, 'sawtooth', 100, 400, 0.2);
    [392, 494, 587].forEach((f, i) => this.tone(t + 0.3 + i * 0.07, 0.4, 0.22, 'triangle', f));
  }

  downed(): void {
    if (!this.ctx) return;
    const t = this.now();
    this.tone(t, 0.8, 0.35, 'sawtooth', 300, 60, 0.05);
  }

  uiClick(): void { if (this.ctx) this.tone(this.now(), 0.04, 0.15, 'square', 1200, 900); }
  uiOpen(): void { if (this.ctx) { this.tone(this.now(), 0.08, 0.15, 'triangle', 600, 900); } }
  uiBuy(): void { if (this.ctx) { const t = this.now(); this.tone(t, 0.06, 0.2, 'square', 1500); this.tone(t + 0.07, 0.1, 0.2, 'square', 2000); } }
  uiError(): void { if (this.ctx) this.tone(this.now(), 0.15, 0.2, 'square', 220, 160); }

  skillReady(): void {
    if (!this.ctx) return;
    const t = this.now();
    this.tone(t, 0.1, 0.2, 'triangle', 880);
    this.tone(t + 0.08, 0.15, 0.2, 'triangle', 1174);
  }

  turretDeploy(): void {
    if (!this.ctx) return;
    const t = this.now();
    this.noise(t, 0.2, 0.4, 'lowpass', 500, 1, 100);
    this.tone(t + 0.1, 0.15, 0.25, 'square', 400, 800);
    this.tone(t + 0.25, 0.15, 0.25, 'square', 600, 1200);
  }

  /** Garbled radio voice for ECHO-style logs: random filtered blips under subtitles. */
  radioVoice(seconds: number): void {
    if (!this.ctx) return;
    const t = this.now();
    let cursor = 0;
    while (cursor < seconds) {
      const dur = 0.04 + Math.random() * 0.1;
      const f = 220 + Math.random() * 500;
      this.tone(t + cursor, dur, 0.06, 'sawtooth', f, f * (0.8 + Math.random() * 0.5), 0.01);
      cursor += dur + Math.random() * 0.06;
    }
  }

  // ---------------------------------------------------------------- movement / world

  private stepFlip = false;
  footstep(): void {
    if (!this.ctx) return;
    this.stepFlip = !this.stepFlip;
    this.noise(this.now(), 0.07, 0.12, 'lowpass', this.stepFlip ? 480 : 420, 1, 120);
  }

  land(hard = false): void {
    if (!this.ctx) return;
    const t = this.now();
    this.noise(t, hard ? 0.16 : 0.1, hard ? 0.35 : 0.2, 'lowpass', 380, 1, 90);
  }

  casing(): void {
    if (!this.ctx) return;
    const f = 2200 + Math.random() * 1200;
    this.tone(this.now(), 0.05, 0.06, 'square', f, f * 0.7);
  }

  fuseBeep(pitch = 1): void {
    if (!this.ctx) return;
    this.tone(this.now(), 0.06, 0.18, 'square', 1400 * pitch);
  }

  bounce(): void {
    if (!this.ctx) return;
    this.noise(this.now(), 0.05, 0.15, 'bandpass', 700, 3, 300);
  }

  gateOpen(): void {
    if (!this.ctx) return;
    const t = this.now();
    this.noise(t, 1.2, 0.4, 'lowpass', 300, 1, 60);
    this.tone(t, 0.9, 0.2, 'sawtooth', 70, 45, 0.3);
    this.tone(t + 1.0, 0.3, 0.3, 'sine', 100, 40);
  }

  questAccept(): void {
    if (!this.ctx) return;
    const t = this.now();
    [523, 659, 880].forEach((f, i) => this.tone(t + i * 0.06, 0.3, 0.2, 'triangle', f));
  }

  questComplete(): void {
    if (!this.ctx) return;
    const t = this.now();
    [392, 523, 659, 784, 1047].forEach((f, i) => {
      this.tone(t + i * 0.09, 0.5, 0.22, 'triangle', f);
      this.tone(t + i * 0.09, 0.6, 0.08, 'sine', f * 2);
    });
  }

  victory(): void {
    if (!this.ctx) return;
    const t = this.now();
    [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => {
      this.tone(t + i * 0.14, 0.6, 0.25, 'triangle', f);
      this.tone(t + i * 0.14, 0.7, 0.1, 'sawtooth', f / 2);
    });
    this.noise(t, 1.4, 0.1, 'highpass', 6000, 1);
  }

  bossRoar(mech = false): void {
    if (!this.ctx) return;
    const t = this.now();
    if (mech) {
      this.tone(t, 1.0, 0.35, 'sawtooth', 60, 140, 0.2);
      for (let i = 0; i < 5; i++) this.tone(t + i * 0.12, 0.1, 0.2, 'square', 220 + i * 60);
    } else {
      this.tone(t, 0.9, 0.4, 'sawtooth', 120, 55, 0.08);
      this.noise(t, 0.8, 0.3, 'lowpass', 500, 1, 120);
    }
  }

  dialogBlip(): void {
    if (!this.ctx) return;
    const f = 300 + Math.random() * 220;
    this.tone(this.now(), 0.05, 0.08, 'sawtooth', f, f * 1.2);
  }

  setMasterVolume(v: number): void {
    if (this.master) this.master.gain.value = Math.max(0, Math.min(1, v));
  }
  getMasterVolume(): number {
    return this.master ? this.master.gain.value : 0.5;
  }
  /** Music engine taps into the same output chain. */
  getBus(): { ctx: AudioContext; out: GainNode } | null {
    return this.ctx ? { ctx: this.ctx, out: this.master } : null;
  }

  // ---------------------------------------------------------------- ambience

  private startAmbience(): void {
    const ctx = this.ctx!;
    // Slow-breathing wasteland wind: looped noise through a wandering lowpass.
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 320;
    f.Q.value = 0.4;
    const g = ctx.createGain();
    g.gain.value = 0.035;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.09;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 160;
    lfo.connect(lfoGain); lfoGain.connect(f.frequency);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(); lfo.start();
  }
}

export const audio = new AudioSystem();
