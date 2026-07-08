// Ambient beds: the quiet layer under the music. Procedural WebAudio only —
// wind is filtered noise, rain is brighter noise, crickets are scheduled
// chirps, drips are pinged sines. Everything sits behind a LOW master gain
// and long smoothing ramps: the goal is a place you can hear when you stand
// still, never a sound you notice over a firefight.

import { audio } from './synth';
import { WORLD } from '../data/world';
import { daynight } from '../game/daynight';

const MASTER = 0.085; // deliberately quiet — beds, not features

function noiseBuffer(ctx: AudioContext, seconds: number, brown: boolean): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    const white = Math.random() * 2 - 1;
    if (brown) {
      last = (last + white * 0.02) / 1.02;
      d[i] = last * 3.5;
    } else {
      d[i] = white;
    }
  }
  return buf;
}

interface Layer { gain: GainNode; target: number }

class AmbienceSystem {
  private built = false;
  private master: GainNode | null = null;
  private wind: Layer | null = null;
  private rain: Layer | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private chirpT = 1;
  private dripT = 2;
  private rumbleT = 4;
  private ctx: AudioContext | null = null;
  private sink: AudioNode | null = null;

  private build(): void {
    const bus = audio.getBus();
    if (!bus || this.built) return;
    this.built = true;
    const { ctx, out } = bus;
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = MASTER;
    this.master.connect(out);
    this.sink = this.master;

    // wind: brown noise through a slow-wobbling lowpass
    const windSrc = ctx.createBufferSource();
    windSrc.buffer = noiseBuffer(ctx, 4, true);
    windSrc.loop = true;
    const windLp = ctx.createBiquadFilter();
    windLp.type = 'lowpass';
    windLp.frequency.value = 320;
    const windGain = ctx.createGain();
    windGain.gain.value = 0.0001;
    windSrc.connect(windLp); windLp.connect(windGain); windGain.connect(this.master);
    windSrc.start();
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 140;
    lfo.connect(lfoGain); lfoGain.connect(windLp.frequency);
    lfo.start();
    this.wind = { gain: windGain, target: 0 };
    this.windFilter = windLp;

    // rain: white noise, bandpassed bright, swells with the front
    const rainSrc = ctx.createBufferSource();
    rainSrc.buffer = noiseBuffer(ctx, 3, false);
    rainSrc.loop = true;
    const rainBp = ctx.createBiquadFilter();
    rainBp.type = 'bandpass';
    rainBp.frequency.value = 2600;
    rainBp.Q.value = 0.45;
    const rainGain = ctx.createGain();
    rainGain.gain.value = 0.0001;
    rainSrc.connect(rainBp); rainBp.connect(rainGain); rainGain.connect(this.master);
    rainSrc.start();
    this.rain = { gain: rainGain, target: 0 };
  }

  /** One cricket/dripping/rumble voice — tiny scheduled one-shots. */
  private chirp(): void {
    if (!this.ctx || !this.sink) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.frequency.value = 3400 + Math.random() * 900;
    const g = ctx.createGain();
    g.gain.value = 0;
    osc.connect(g); g.connect(this.sink);
    // three quick pulses
    for (let i = 0; i < 3; i++) {
      const t = t0 + i * 0.09;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    }
    osc.start(t0); osc.stop(t0 + 0.4);
  }

  private drip(): void {
    if (!this.ctx || !this.sink) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(1600 + Math.random() * 600, t0);
    osc.frequency.exponentialRampToValueAtTime(700, t0 + 0.09);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.06, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
    osc.connect(g); g.connect(this.sink);
    osc.start(t0); osc.stop(t0 + 0.3);
  }

  private rumble(): void {
    if (!this.ctx || !this.sink) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(38 + Math.random() * 14, t0);
    osc.frequency.exponentialRampToValueAtTime(26, t0 + 2.4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.09, t0 + 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.6);
    osc.connect(g); g.connect(this.sink);
    osc.start(t0); osc.stop(t0 + 2.8);
  }

  update(dt: number): void {
    this.build();
    if (!this.built || !this.ctx) return;
    const biome = WORLD.biome;
    const wI = daynight.weatherI;
    const night = 1 - daynight.daylight;

    // ---- wind bed: every open map breathes; storms and squalls lean in
    const windy = WORLD.gales ? 0.9 : biome.ambientParticle === 'snow' ? 0.7 : 0.45;
    if (this.wind) this.wind.target = windy * (0.5 + wI * 0.5) * (biome.ambientParticle === 'spore' ? 0.3 : 1);
    if (this.windFilter) this.windFilter.frequency.value = 260 + wI * 300;

    // ---- rain bed follows the front (or the permanent storm on Voltholm)
    const rainBase = biome.ambientParticle === 'rain' ? 0.5 : 0;
    if (this.rain) this.rain.target = Math.max(rainBase, daynight.weatherKind === 'rain' ? wI : 0) * 0.85;

    for (const l of [this.wind, this.rain]) {
      if (!l) continue;
      const cur = l.gain.gain.value;
      l.gain.gain.value = cur + (Math.max(0.0001, l.target) - cur) * Math.min(1, dt * 0.8);
    }

    // ---- scheduled one-shots
    // crickets: green worlds, night only, silent in the rain
    const green = biome.trees === 'palm' || biome.weeds || biome.groundLife === 'fern';
    if (green && night > 0.55 && wI < 0.3) {
      this.chirpT -= dt;
      if (this.chirpT <= 0) { this.chirpT = 1.2 + Math.random() * 3.5; this.chirp(); }
    }
    // cave drips wherever spores drift
    if (biome.ambientParticle === 'spore') {
      this.dripT -= dt;
      if (this.dripT <= 0) { this.dripT = 2 + Math.random() * 5; this.drip(); }
    }
    // distant thunder under storms and heavy rain
    if (WORLD.storm || (daynight.weatherKind === 'rain' && wI > 0.5)) {
      this.rumbleT -= dt;
      if (this.rumbleT <= 0) { this.rumbleT = 9 + Math.random() * 16; this.rumble(); }
    }
  }
}

export const ambience = new AmbienceSystem();
