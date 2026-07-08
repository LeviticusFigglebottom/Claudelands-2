// Time-of-day + weather: one clock for every map. The cycle drives sun and
// hemisphere intensity, sky/fog tinting, a moon and stars, and hands the
// ambience system its cues. Maps that are ALREADY night-themed (Vitra's
// violet glass, the Unlit Mile) keep a high night floor so the cycle reads
// as mood, never as mud.
//
// Weather is a per-map schedule: long clear stretches, then a front rolls
// through — rain on the green worlds, snow squalls on the Frosthollow,
// nothing on dead-air zones. Intensity ramps so nothing pops.

import { WORLD } from '../data/world';

export type WeatherKind = 'rain' | 'snow' | null;

/** Full day length in seconds (dawn→dawn). */
const DAY_LENGTH = 520;

/** What kind of front can roll through this biome? */
function weatherKindFor(): WeatherKind {
  if (WORLD.biome.ambientParticle === 'snow') return 'snow';
  // green/wet worlds rain; deserts rain rarely; dead air and glass never
  const id = WORLD.id;
  if (id.startsWith('veldt') || id === 'voltholm' || id === 'volt_gp') return 'rain';
  if (id === 'claudelands' || id === 'rustgulch' || id === 'brasshaven') return 'rain';
  return null;
}

class DayNight {
  /** 0..1 through the day. 0 = dawn, 0.25 = noon, 0.5 = dusk, 0.75 = midnight. */
  t = 0.12; // start mid-morning
  /** 0..1 how much daylight (1 = noon, 0 = deep night). */
  daylight = 1;
  /** 0..1 peak at sunrise/sunset — drives the orange wash. */
  dusk = 0;
  /** 0..1 night factor AFTER the per-map floor (what lighting multiplies by). */
  lightLevel = 1;

  // ---- weather ----
  weatherKind: WeatherKind = null;
  /** 0..1 current intensity (ramped). */
  weatherI = 0;
  private weatherTarget = 0;
  private weatherTimer = 90 + Math.random() * 120;

  /** The floor daylight never drops below on this map: already-dark maps
   *  (night-themed skies) barely dim; bright deserts get real nights that
   *  still leave the world readable. */
  nightFloor(): number {
    const c = WORLD.skyTop;
    const lum = (((c >> 16) & 255) + ((c >> 8) & 255) + (c & 255)) / (3 * 255);
    if (lum < 0.12) return 0.85;      // Vitra / the Mile: it IS night already
    if (lum < 0.25) return 0.62;      // storm-dark skies dim gently
    return 0.42;                      // bright worlds get real dusk, readable night
  }

  onMapChanged(): void {
    this.weatherKind = null;
    this.weatherI = 0;
    this.weatherTarget = 0;
    this.weatherTimer = 40 + Math.random() * 80;
  }

  /** Debug/test: jump the clock (0=dawn 0.25=noon 0.5=dusk 0.75=midnight). */
  setTime(t: number): void { this.t = ((t % 1) + 1) % 1; this.update(0); }
  /** Debug/test: force a front on/off immediately. */
  setWeather(kind: WeatherKind, intensity: number): void {
    this.weatherKind = kind;
    this.weatherTarget = intensity;
    this.weatherI = intensity;
  }

  update(dt: number): void {
    this.t = (this.t + dt / DAY_LENGTH) % 1;
    // sun height: sin over the day half, clamped at night
    const sunH = Math.sin(this.t * Math.PI * 2 + Math.PI * 0.0); // t=0 dawn → rising
    this.daylight = Math.max(0, Math.min(1, sunH * 1.6 + 0.12));
    // dusk band: sun near the horizon (either side)
    this.dusk = Math.max(0, 1 - Math.abs(sunH) * 3.4) * (this.daylight > 0.02 ? 1 : 0.4);
    const floor = this.nightFloor();
    this.lightLevel = floor + (1 - floor) * this.daylight;

    // ---- weather scheduler ----
    const kind = weatherKindFor();
    if (kind) {
      this.weatherTimer -= dt;
      if (this.weatherTimer <= 0) {
        if (this.weatherTarget > 0) {
          this.weatherTarget = 0; // front passes
          this.weatherTimer = 110 + Math.random() * 160;
        } else {
          this.weatherKind = kind;
          this.weatherTarget = 0.55 + Math.random() * 0.45;
          this.weatherTimer = 45 + Math.random() * 55;
        }
      }
    } else {
      this.weatherTarget = 0;
    }
    // ramp in over ~6s, out over ~10s
    const rate = this.weatherTarget > this.weatherI ? dt / 6 : dt / 10;
    this.weatherI += Math.sign(this.weatherTarget - this.weatherI) * Math.min(rate, Math.abs(this.weatherTarget - this.weatherI));
    if (this.weatherI < 0.01 && this.weatherTarget === 0) this.weatherKind = null;
  }
}

export const daynight = new DayNight();
