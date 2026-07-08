// The soundtrack. Two layers:
//
// RECORDED (preferred): baked Eleven Music loops from public/music/ — one
// endless instrumental accompaniment per area that plays the whole time
// you're on the map, plus a universal combat pool; each encounter picks one
// combat track at random and loops it (ducking the area theme underneath)
// until the fight ends. Loops are sample-accurate AudioBufferSourceNodes.
//
// SYNTH (fallback): the original 16-step procedural engine below — still
// carries everything when the manifest/tracks are missing (offline dev,
// stripped deploys). Three intensity states crossfade:
//   0 calm    — sparse two-note desert drone
//   1 combat  — kick/hat groove + minor bass line
//   2 boss    — faster, added off-beat stabs
// Driven each frame from combat state (aggro count / boss active).

import { audio } from './synth';
import { activeMap } from '../data/world';

const BASS_CALM = [0, -1, -1, -1, 3, -1, -1, -1, 0, -1, -1, -1, -2, -1, -1, -1];
const BASS_COMBAT = [0, -1, 0, -1, 3, -1, 3, 5, 0, -1, 0, -1, -2, -1, 5, 3];
const STAB_BOSS = [-1, -1, 7, -1, -1, -1, 7, -1, -1, 10, -1, -1, 7, -1, 8, -1];
// combat lead: a wiry minor-pentatonic riff, played every other bar
const LEAD_A = [12, -1, 15, -1, 12, 10, -1, 12, -1, -1, 7, -1, 10, -1, -1, -1];
const LEAD_B = [15, -1, 17, -1, 15, -1, 12, -1, 10, 12, -1, -1, 7, -1, 3, -1];
// chord roots per bar (i - VI - III - VII), the spaghetti-western loop
const PROG = [0, 8, 3, 10];

/** Baked soundtrack manifest: track id -> duration s. */
interface MusicManifest { explore: Record<string, number>; combat: Record<string, number>; _v?: string }

let manifest: MusicManifest | null = null;
let version = '';

export async function loadMusicManifest(): Promise<void> {
  try {
    const res = await fetch('music/manifest.json', { cache: 'no-cache' });
    if (res.ok) {
      manifest = await res.json();
      version = typeof manifest?._v === 'string' ? manifest._v : '';
    }
  } catch {
    manifest = null; // synth engine carries it
  }
}

interface LoopVoice { src: AudioBufferSourceNode; gain: GainNode; id: string }

// ---- combat pools are per PLANET: each world fights to its own set.
// Claude Prime keeps the original four; the outer rocks get their own.
const PLANET_OF: Record<string, string> = {
  claudelands: 'claudeprime', frosthollow: 'claudeprime', cinderthroat: 'claudeprime',
  brasshaven: 'claudeprime', crucible: 'claudeprime', rustgulch: 'claudeprime',
  // the Auger is Claude Prime dirt, but a kilometre of it straight DOWN —
  // surface punk-rock has no business in the hole; it fights to machines
  // and the crystalline something answering from below
  auger: 'auger',
  veldt: 'veldtminor', veldt_tangle: 'veldtminor', veldt_shallows: 'veldtminor',
  veldt_caves: 'veldtminor', veldt_gp: 'veldtminor', veldt_stairs: 'veldtminor',
  vitra: 'vitranull', vitra_mile: 'vitranull', vitra_gp: 'vitranull',
  voltholm: 'voltholm', volt_gp: 'voltholm', volt_still: 'voltholm',
};
const PLANET_COMBAT: Record<string, string[]> = {
  claudeprime: ['combat_riff', 'combat_junk', 'combat_chase', 'combat_punk'],
  veldtminor: ['combat_drums', 'combat_bloom'],
  vitranull: ['combat_glass', 'combat_nullwave'],
  voltholm: ['combat_storm', 'combat_livewire'],
  auger: ['combat_livewire', 'combat_glass'],
};

class MusicEngine {
  private step = 0;
  private bar = 0;
  private nextTime = 0;
  private intensity = 0;        // smoothed 0..2
  private target = 0;
  private busGain: GainNode | null = null;
  private started = false;

  // ---- recorded-track layer
  private recGain: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private loading = new Set<string>();
  private explore: LoopVoice | null = null;
  private combat: LoopVoice | null = null;
  private lastCombatId = '';
  /** What the current map wants — async decodes check this so a slow load
   *  can't install a stale theme after a map switch. */
  private wantedExplore = '';

  /** Debug/tests: what the recorded layer is doing right now. */
  musicState(): { mode: string; explore: string | null; combat: string | null } {
    return {
      mode: manifest ? 'recorded' : 'synth',
      explore: this.explore?.id ?? null,
      combat: this.combat?.id ?? null,
    };
  }

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

    // the recorded soundtrack takes over entirely when it's available;
    // the step sequencer below is the ever-present fallback
    if (manifest) {
      this.updateRecorded(bus.ctx, bus.out, target);
      return;
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
      if (this.step === 0) this.bar = (this.bar + 1) % 4;
    }
  }

  // ------------------------------------------------------------ recorded
  private async buffer(ctx: AudioContext, id: string): Promise<AudioBuffer | null> {
    const hit = this.buffers.get(id);
    if (hit) return hit;
    if (this.loading.has(id)) return null;
    this.loading.add(id);
    try {
      const res = await fetch(`music/${id}.mp3${version ? `?v=${version}` : ''}`);
      const buf = await ctx.decodeAudioData(await res.arrayBuffer());
      this.buffers.set(id, buf);
      return buf;
    } catch {
      return null;
    } finally {
      this.loading.delete(id);
    }
  }

  /** Start a sample-accurate endless loop at gain 0 (caller ramps it). */
  private startLoop(ctx: AudioContext, out: AudioNode, id: string, buf: AudioBuffer): LoopVoice {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    src.connect(gain);
    gain.connect(out);
    src.start();
    return { src, gain, id };
  }

  private fadeOutAndStop(ctx: AudioContext, v: LoopVoice, secs: number): void {
    v.gain.gain.cancelScheduledValues(ctx.currentTime);
    v.gain.gain.setValueAtTime(Math.max(0.0001, v.gain.gain.value), ctx.currentTime);
    v.gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + secs);
    v.src.stop(ctx.currentTime + secs + 0.05);
  }

  private ramp(ctx: AudioContext, v: LoopVoice, to: number, secs: number): void {
    v.gain.gain.cancelScheduledValues(ctx.currentTime);
    v.gain.gain.setValueAtTime(Math.max(0.0001, v.gain.gain.value), ctx.currentTime);
    v.gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, to), ctx.currentTime + secs);
  }

  private updateRecorded(ctx: AudioContext, out: AudioNode, target: 0 | 1 | 2): void {
    if (!this.recGain) {
      this.recGain = ctx.createGain();
      this.recGain.gain.value = 0.5;
      this.recGain.connect(out);
    }
    const sink = this.recGain;
    const inCombat = target >= 1;

    // ---- the area's accompaniment: runs the whole time you're on the map
    const mapId = activeMap().id;
    const wantExplore = manifest!.explore[mapId] !== undefined ? mapId : 'claudelands';
    if (this.explore?.id !== wantExplore) {
      this.wantedExplore = wantExplore;
      if (this.explore) { this.fadeOutAndStop(ctx, this.explore, 0.9); this.explore = null; }
      void this.buffer(ctx, wantExplore).then((buf) => {
        // only install if this is still the theme the current map wants
        if (!buf || this.wantedExplore !== wantExplore || this.explore) return;
        this.explore = this.startLoop(ctx, sink, wantExplore, buf);
        this.ramp(ctx, this.explore, this.combat ? 0.2 : 0.65, 1.2);
      });
    }

    // ---- combat overlay: one random track per encounter from THIS
    // planet's pool, looped (fall back to everything if none are baked)
    if (inCombat && !this.combat) {
      const planet = PLANET_OF[mapId] ?? 'claudeprime';
      const wanted = (PLANET_COMBAT[planet] ?? []).filter((id) => manifest!.combat[id] !== undefined);
      const pool = wanted.length ? wanted : Object.keys(manifest!.combat);
      if (pool.length) {
        const pick = pool.length > 1
          ? pool.filter((id) => id !== this.lastCombatId)[Math.floor(Math.random() * (pool.length - 1))]
          : pool[0];
        this.lastCombatId = pick;
        this.combat = { src: null as unknown as AudioBufferSourceNode, gain: null as unknown as GainNode, id: pick }; // reserve
        void this.buffer(ctx, pick).then((buf) => {
          if (!buf || this.combat?.id !== pick || this.combat.src) { if (!buf) this.combat = null; return; }
          this.combat = this.startLoop(ctx, sink, pick, buf);
          this.ramp(ctx, this.combat, 0.75, 0.6);
          if (this.explore) this.ramp(ctx, this.explore, 0.2, 0.8); // duck the theme, keep it breathing
        });
      }
    } else if (!inCombat && this.combat) {
      if (this.combat.src) this.fadeOutAndStop(ctx, this.combat, 1.4);
      this.combat = null;
      if (this.explore) this.ramp(ctx, this.explore, 0.65, 1.6);
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
    const chord = PROG[this.bar];                             // bar-level harmony

    // calm drone: long soft fifth on bar starts, following the progression
    if (s === 0) this.tone(ctx, t, 2.2, 0.05 * calm, 'sine', semitone(chord));
    if (s === 8) this.tone(ctx, t, 2.2, 0.04 * calm, 'sine', semitone(chord + 7));
    // calm color: a lonely high note once a phrase (bar 3 only)
    if (calm > 0.6 && this.bar === 3 && s === 6) this.tone(ctx, t, 1.4, 0.03 * calm, 'triangle', semitone(chord + 19));

    // kick on quarters
    if (s % 4 === 0) this.tone(ctx, t, 0.16, 0.24 * combat, 'sine', 130, 40);
    // hats on off-8ths (open hat on the phrase turnaround)
    if (s % 2 === 1) this.noiseHit(ctx, t, this.bar === 3 && s === 15 ? 0.14 : 0.04, 0.05 * combat, 6000);
    // snare-ish on 4 and 12, with a bar-4 fill
    if (s === 4 || s === 12) this.noiseHit(ctx, t, 0.1, 0.1 * combat, 1800);
    if (this.bar === 3 && (s === 13 || s === 14 || s === 15)) this.noiseHit(ctx, t, 0.07, 0.07 * combat, 2400);

    // combat pad: two detuned saws breathing the chord under the fight
    if (s === 0 && combat > 0.15) {
      this.tone(ctx, t, 2.4, 0.035 * combat, 'sawtooth', semitone(chord + 12), semitone(chord + 12), 900);
      this.tone(ctx, t, 2.4, 0.03 * combat, 'sawtooth', semitone(chord + 12) * 1.006, semitone(chord + 12) * 1.006, 900);
      this.tone(ctx, t, 2.4, 0.025 * combat, 'sawtooth', semitone(chord + 15), semitone(chord + 15), 900);
    }

    // bass line, transposed to the bar's chord
    const bassNote = (boss > 0.4 ? BASS_COMBAT : combat > 0.05 ? BASS_COMBAT : BASS_CALM)[s];
    if (bassNote >= 0 || bassNote === -2) {
      const n = (bassNote === -2 ? -2 : bassNote) + chord;
      if (BASS_COMBAT[s] !== -1) this.tone(ctx, t, 0.22, 0.11 * combat, 'sawtooth', semitone(n), semitone(n), 500);
    }

    // combat lead: the wiry riff, every other bar so it phrases
    if (combat > 0.5) {
      const lead = (this.bar % 2 === 0 ? LEAD_A : LEAD_B)[s];
      if (lead >= 0 && (this.bar === 1 || this.bar === 3 || boss > 0.3)) {
        this.tone(ctx, t, 0.16, 0.05 * combat, 'square', semitone(lead + chord + 12), semitone(lead + chord + 12), 2200);
      }
    }

    // boss stabs (harmonized a third up when fully ramped)
    const stab = STAB_BOSS[s];
    if (stab >= 0) {
      this.tone(ctx, t, 0.12, 0.07 * boss, 'square', semitone(stab + chord + 12), semitone(stab + chord + 12), 1600);
      this.tone(ctx, t, 0.12, 0.05 * boss, 'square', semitone(stab + chord + 15.1), semitone(stab + chord + 15.1), 1600);
    }
    // boss double-time kick + a rising noise sweep into every phrase
    if (boss > 0.3 && s % 4 === 2) this.tone(ctx, t, 0.12, 0.14 * boss, 'sine', 120, 45);
    if (boss > 0.3 && this.bar === 3 && s === 8) {
      this.tone(ctx, t, 1.4, 0.05 * boss, 'sawtooth', semitone(chord), semitone(chord + 12), 700);
    }
  }
}

export const music = new MusicEngine();
