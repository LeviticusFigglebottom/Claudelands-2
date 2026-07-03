// Player preferences: persisted graphics/feel toggles, applied live to the
// post pipeline, renderer, and game-feel systems. One flat object in
// localStorage; every consumer reads through prefs().

export interface Prefs {
  inkOutlines: boolean;      // silhouette + interior edge pass
  crossHatch: boolean;       // screen-space hatching in shadows
  bloom: boolean;
  fxaa: boolean;
  filmGrain: boolean;
  vignette: boolean;
  screenShake: boolean;
  damageNumbers: boolean;
  characterVoices: boolean;  // procedural NPC speech + pit announcer
  fov: number;               // 60..100
  saturation: number;        // 0.8..1.5
  // ---- EXTRAS (main-menu fun tab): cheats + novelty toggles
  thugMode: boolean;         // player voicelines swap to the thug sauce pool
  cheatSpeed: boolean;       // x1.6 move speed
  cheatLevel: boolean;       // runs load at level 25+
  cheatTravel: boolean;      // every fast-travel station pre-discovered
  cheatRich: boolean;        // wallet floor $100k
}

export const DEFAULT_PREFS: Prefs = {
  inkOutlines: true,
  crossHatch: true,
  bloom: true,
  fxaa: true,
  filmGrain: true,
  vignette: true,
  screenShake: true,
  damageNumbers: true,
  characterVoices: true,
  fov: 75,
  saturation: 1.22,
  thugMode: false,
  cheatSpeed: false,
  cheatLevel: false,
  cheatTravel: false,
  cheatRich: false,
};

const KEY = 'claudelands2.prefs';
let current: Prefs = { ...DEFAULT_PREFS };
try {
  const raw = localStorage.getItem(KEY);
  if (raw) current = { ...DEFAULT_PREFS, ...JSON.parse(raw) };
} catch { /* private mode */ }

export function prefs(): Prefs { return current; }

export function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]): void {
  current[key] = value;
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* full */ }
  for (const fn of listeners) fn();
}

export function resetPrefs(): void {
  current = { ...DEFAULT_PREFS };
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* full */ }
  for (const fn of listeners) fn();
}

const listeners: (() => void)[] = [];
export function onPrefsChanged(fn: () => void): void { listeners.push(fn); }
