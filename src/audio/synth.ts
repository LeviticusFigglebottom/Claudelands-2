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

  /** Layered gunshot: manufacturer voices the CHARACTER, weapon type shapes
   *  the BODY (snap vs boom vs crack-and-tail). Every shot = transient snap
   *  + midrange body + sub thump + mechanical action tick. */
  shot(style: ShotStyle, pitch = 1, wtype = 'ar'): void {
    if (!this.ctx) return;
    const t = this.now();

    // ---- type body: envelope + sub weight
    switch (wtype) {
      case 'pistol':
        this.noise(t, 0.07, 0.55, 'bandpass', 1700 * pitch, 1, 400);
        this.tone(t, 0.07, 0.35, 'sine', 150 * pitch, 60);
        break;
      case 'smg':
        this.noise(t, 0.05, 0.45, 'bandpass', 2100 * pitch, 1.2, 700);
        this.tone(t, 0.05, 0.25, 'sine', 170 * pitch, 80);
        break;
      case 'shotgun':
        this.noise(t, 0.3, 0.95, 'lowpass', 1100 * pitch, 1, 90);       // the BOOM
        this.noise(t, 0.12, 0.5, 'highpass', 2400, 0.7);               // pellet spray
        this.tone(t, 0.22, 0.65, 'sine', 95 * pitch, 32);
        break;
      case 'sniper':
        this.noise(t, 0.06, 0.9, 'highpass', 2600, 0.8);               // supersonic crack
        this.tone(t, 0.14, 0.5, 'sine', 130 * pitch, 40);
        this.noise(t + 0.05, 0.55, 0.28, 'bandpass', 900 * pitch, 1.4, 130); // rolling canyon tail
        this.noise(t + 0.24, 0.18, 0.1, 'bandpass', 600, 2, 200);      // distant slap-back
        break;
      case 'launcher':
        this.noise(t, 0.35, 0.7, 'lowpass', 500 * pitch, 1, 80);       // tube WHUMP
        this.noise(t + 0.04, 0.45, 0.3, 'bandpass', 1200, 1, 2600);    // rocket hiss away
        this.tone(t, 0.2, 0.5, 'sine', 70 * pitch, 30);
        break;
      default: // ar
        this.noise(t, 0.09, 0.6, 'bandpass', 1500 * pitch, 1, 300);
        this.tone(t, 0.1, 0.4, 'sine', 140 * pitch, 50);
    }

    // ---- manufacturer character on top
    switch (style) {
      case 'heavy': // VULKRAM: extra cannon chest
        this.tone(t, 0.16, 0.5, 'sine', 110 * pitch, 36);
        this.noise(t, 0.05, 0.4, 'highpass', 2500, 1);
        break;
      case 'clean': // Lumen: precise zap edge
        this.tone(t, 0.06, 0.3, 'square', 1900 * pitch, 500);
        break;
      case 'junk': // Ratworks: loose-parts rattle after every bang
        this.tone(t, 0.04, 0.25, 'sawtooth', 300 * pitch, 90);
        this.noise(t + 0.035, 0.05, 0.22, 'highpass', 4800, 1);
        this.tone(t + 0.05, 0.03, 0.08, 'square', 2600 + Math.random() * 800, 1400);
        break;
      case 'arcane': // Aetheric: harmonic bloom
        this.tone(t, 0.14, 0.28, 'sine', 880 * pitch, 220);
        this.tone(t, 0.1, 0.2, 'triangle', 1320 * pitch, 330);
        break;
      case 'antique': // Cordwood: black-powder crack + smoke hiss
        this.noise(t, 0.1, 0.5, 'bandpass', 2000 * pitch, 0.8, 250);
        this.noise(t + 0.08, 0.2, 0.1, 'highpass', 3600, 1);
        break;
      case 'plastic': // Briskco: cheap pop, springy overtone
        this.tone(t, 0.05, 0.4, 'square', 700 * pitch, 200);
        this.tone(t + 0.02, 0.06, 0.12, 'triangle', 1800 * pitch, 900);
        break;
    }
    // ---- action tick: the gun itself cycling (tiny, sells the machine)
    this.tone(t + 0.045, 0.025, 0.09, 'square', 3200 + Math.random() * 600, 1800);
  }

  reloadClack(stage: 0 | 1): void {
    if (!this.ctx) return;
    const t = this.now();
    if (stage === 0) { this.noise(t, 0.05, 0.35, 'bandpass', 900, 4, 400); this.tone(t, 0.04, 0.15, 'square', 500, 300); }
    else { this.noise(t, 0.06, 0.4, 'bandpass', 1500, 4, 700); this.tone(t, 0.05, 0.2, 'square', 800, 1200); }
  }

  /** Staged reload foley: each mechanical beat of a characteristic reload. */
  reloadStage(kind: 'magout' | 'magin' | 'rack' | 'shell' | 'pump' | 'boltopen' | 'boltclose' | 'spin'): void {
    if (!this.ctx) return;
    const t = this.now();
    switch (kind) {
      case 'magout': // release catch + mag sliding free
        this.tone(t, 0.03, 0.2, 'square', 1900, 900);
        this.noise(t + 0.02, 0.09, 0.28, 'bandpass', 700, 2, 260);
        break;
      case 'magin': // mag seat + palm slap
        this.noise(t, 0.05, 0.3, 'bandpass', 500, 2, 900);
        this.tone(t + 0.04, 0.05, 0.3, 'square', 420, 180);
        this.noise(t + 0.04, 0.06, 0.35, 'lowpass', 800, 1, 200);
        break;
      case 'rack': // charging handle back-forward
        this.noise(t, 0.05, 0.3, 'bandpass', 1600, 3, 800);
        this.tone(t + 0.07, 0.04, 0.32, 'square', 900, 1500);
        this.noise(t + 0.07, 0.04, 0.3, 'bandpass', 2200, 3, 1100);
        break;
      case 'shell': // one shell pressed into a tube
        this.tone(t, 0.03, 0.18, 'square', 1400 + Math.random() * 300, 700);
        this.noise(t + 0.02, 0.05, 0.26, 'bandpass', 900, 3, 420);
        break;
      case 'pump': // fore-end pump: shk-SHK
        this.noise(t, 0.06, 0.35, 'bandpass', 1100, 2, 500);
        this.noise(t + 0.09, 0.06, 0.42, 'bandpass', 1500, 2, 650);
        this.tone(t + 0.09, 0.04, 0.2, 'square', 700, 1100);
        break;
      case 'boltopen': // bolt lifted + drawn back
        this.tone(t, 0.04, 0.24, 'square', 1100, 1700);
        this.noise(t + 0.05, 0.08, 0.26, 'bandpass', 800, 2, 350);
        break;
      case 'boltclose': // bolt driven home + locked
        this.noise(t, 0.06, 0.3, 'bandpass', 900, 2, 1500);
        this.tone(t + 0.06, 0.04, 0.3, 'square', 1300, 800);
        break;
      case 'spin': // cylinder / drum spin-up
        for (let i = 0; i < 7; i++) this.tone(t + i * 0.035, 0.02, 0.1 - i * 0.008, 'square', 2400 - i * 120, 1800);
        break;
    }
  }

  dryFire(): void {
    if (!this.ctx) return;
    this.tone(this.now(), 0.05, 0.25, 'square', 320, 240);
  }

  /** Incoming fire: a muffled report scaled by distance (they shoot BACK). */
  private enemyShotT = 0;
  enemyShot(distance: number, arc = false): void {
    if (!this.ctx || distance > 70) return;
    const t = this.now();
    if (t - this.enemyShotT < 0.06) return; // don't stack a firing line into mud
    this.enemyShotT = t;
    const vol = clamp(1 - distance / 70, 0.08, 1) * 0.5;
    if (arc) {
      // lobber: a hollow TOONK
      this.tone(t, 0.09, vol * 0.8, 'sine', 220, 90);
      this.noise(t, 0.08, vol * 0.5, 'lowpass', 600, 1, 150);
    } else {
      this.noise(t, 0.06, vol, 'bandpass', 1300 - distance * 8, 1, 300);
      this.tone(t, 0.06, vol * 0.6, 'sine', 140, 60);
    }
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
    // impact body: a meaty thock underneath the confirm tick
    this.noise(t, 0.045, crit ? 0.3 : 0.18, 'lowpass', 900, 1, 250);
    if (crit) {
      this.tone(t, 0.06, 0.28, 'square', 1500, 2300);
      this.tone(t + 0.015, 0.1, 0.22, 'triangle', 2100, 3200); // the bright PING
      this.noise(t, 0.05, 0.15, 'highpass', 5000, 1);
    } else {
      this.tone(t, 0.035, 0.16, 'square', 950, 1150);
    }
  }

  kill(): void {
    if (!this.ctx) return;
    const t = this.now();
    this.noise(t, 0.12, 0.3, 'lowpass', 600, 1, 120);            // body drop
    this.tone(t, 0.1, 0.28, 'square', 500, 900);
    this.tone(t + 0.06, 0.14, 0.3, 'square', 750, 1300);
    this.tone(t + 0.06, 0.18, 0.1, 'sine', 1500, 2600);          // little soul-leaves-body chime
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

  /** A status PROC — loud, distinct per element, unmistakable. The subtle
   *  elemental() sizzle stays for ambient DoT ticks; this is the ignition. */
  statusApply(kind: string): void {
    if (!this.ctx) return;
    const t = this.now();
    switch (kind) {
      case 'ember': // FWOOSH-crackle
        this.noise(t, 0.4, 0.45, 'bandpass', 600, 1, 2400);
        this.noise(t + 0.12, 0.35, 0.25, 'bandpass', 2200, 1.4, 1100);
        for (let i = 0; i < 5; i++) this.tone(t + 0.1 + i * 0.06, 0.02, 0.12, 'square', 2800 + Math.random() * 1600, 1500);
        break;
      case 'bile': // acid HISSSS + fat bubbles
        this.noise(t, 0.55, 0.4, 'bandpass', 1400, 1.2, 350);
        for (let i = 0; i < 4; i++) this.tone(t + 0.08 + i * 0.11, 0.08, 0.16, 'sine', 380 - i * 40, 120);
        break;
      case 'volt': // arc-weld ZAP-buzz
        this.noise(t, 0.08, 0.4, 'highpass', 3500, 1);
        for (let i = 0; i < 7; i++) this.tone(t + i * 0.035, 0.03, 0.22 - i * 0.02, 'square', 2200 + Math.random() * 2600, 800);
        this.tone(t, 0.3, 0.12, 'sawtooth', 110, 95);
        break;
      case 'rime': // crystal ring + freeze crackle
        this.tone(t, 0.4, 0.28, 'sine', 2200, 3400, 0.01);
        this.tone(t + 0.03, 0.45, 0.18, 'sine', 2933, 4200, 0.01);
        this.noise(t + 0.05, 0.3, 0.16, 'highpass', 5500, 1);
        break;
      case 'blast':
        this.explosion(false);
        break;
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

  // ---------------------------------------------------------------- vehicle
  // A persistent two-oscillator engine: saw fundamental + square sub, both
  // tracking RPM, through a lowpass that opens with throttle. Gain sits at
  // zero until the buggy is boarded, so the nodes can live forever.
  private engine: { osc: OscillatorNode; sub: OscillatorNode; filter: BiquadFilterNode; gain: GainNode } | null = null;

  engineStart(): void {
    if (!this.ctx) return;
    if (!this.engine) {
      const ctx = this.ctx;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 55;
      const sub = ctx.createOscillator();
      sub.type = 'square';
      sub.frequency.value = 27;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 300;
      filter.Q.value = 1.2;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const subGain = ctx.createGain();
      subGain.gain.value = 0.6;
      osc.connect(filter);
      sub.connect(subGain); subGain.connect(filter);
      filter.connect(gain); gain.connect(this.master);
      osc.start(); sub.start();
      this.engine = { osc, sub, filter, gain };
    }
    this.engine.gain.gain.setTargetAtTime(0.05, this.now(), 0.1);
  }

  /** rpm/load in 0..1. Call every frame while driving. */
  engineUpdate(rpm: number, load: number): void {
    if (!this.ctx || !this.engine) return;
    const t = this.now();
    const f = 46 + rpm * 150;
    this.engine.osc.frequency.setTargetAtTime(f, t, 0.06);
    this.engine.sub.frequency.setTargetAtTime(f * 0.5, t, 0.06);
    this.engine.filter.frequency.setTargetAtTime(240 + load * 900 + rpm * 500, t, 0.08);
    this.engine.gain.gain.setTargetAtTime(0.035 + load * 0.045 + rpm * 0.02, t, 0.1);
  }

  engineStop(): void {
    if (!this.ctx || !this.engine) return;
    this.engine.gain.gain.setTargetAtTime(0, this.now(), 0.15);
  }

  skid(): void {
    if (!this.ctx) return;
    this.noise(this.now(), 0.16, 0.1, 'bandpass', 900 + Math.random() * 300, 2.5);
  }

  boostIgnite(): void {
    if (!this.ctx) return;
    const t = this.now();
    this.noise(t, 0.5, 0.28, 'lowpass', 1400, 1, 300);
    this.tone(t, 0.4, 0.16, 'sawtooth', 90, 240, 0.02);
  }

  vehicleImpact(hard: boolean): void {
    if (!this.ctx) return;
    const t = this.now();
    this.noise(t, hard ? 0.3 : 0.15, hard ? 0.4 : 0.2, 'lowpass', 700, 1, 90);
    this.tone(t, 0.12, hard ? 0.25 : 0.12, 'square', 140, 60);
    if (hard) this.tone(t + 0.03, 0.2, 0.1, 'sine', 400, 900); // metal ring
  }

  checkpoint(): void {
    if (!this.ctx) return;
    const t = this.now();
    this.tone(t, 0.09, 0.2, 'square', 660, 660);
    this.tone(t + 0.09, 0.14, 0.22, 'square', 990, 990);
  }

  countdownBeep(go: boolean): void {
    if (!this.ctx) return;
    this.tone(this.now(), go ? 0.5 : 0.14, go ? 0.3 : 0.2, 'square', go ? 880 : 440, go ? 880 : 440);
  }

  // ---------------------------------------------------------------- respawn
  digistruct(): void {
    if (!this.ctx) return;
    const t = this.now();
    // rising shimmer: three detuned saws sweeping up through a bandpass
    for (let i = 0; i < 3; i++) {
      this.tone(t + i * 0.18, 0.8, 0.08, 'sawtooth', 180 * (i + 1), 700 * (i + 1), 0.1);
    }
    this.noise(t, 1.6, 0.12, 'bandpass', 800, 3, 2600);
    this.tone(t + 1.5, 0.35, 0.22, 'sine', 520, 780, 0.02); // assembly "ping"
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
