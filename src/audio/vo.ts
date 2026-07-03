// Recorded voice-over: a baked manifest of per-character MP3 clips (see
// tools/bake-vo.mjs) keyed by voice id + normalized-line hash. The voice
// system asks voClip() first and only falls back to the procedural synth
// when a line has no recording (dynamic interpolated strings, future lines
// not yet baked, or a missing/failed manifest fetch — the game never
// depends on the recordings existing).

import { voKey } from './votext';

/** voice id -> line key -> duration in seconds. Files live at vo/<voice>/<key>.mp3 */
type VoManifest = Record<string, Record<string, number>>;

let manifest: VoManifest | null = null;

export async function loadVoManifest(): Promise<void> {
  try {
    const res = await fetch('vo/manifest.json');
    if (res.ok) manifest = await res.json();
  } catch {
    manifest = null; // offline dev / stripped deploy: synth voices carry it
  }
}

export function voClip(voiceId: string, text: string): { url: string; dur: number } | null {
  const m = manifest?.[voiceId];
  if (!m) return null;
  const key = voKey(text);
  const dur = m[key];
  if (dur === undefined) return null;
  return { url: `vo/${voiceId}/${key}.mp3`, dur };
}

/** Debug: clips per voice, or null when no manifest loaded. */
export function voStats(): Record<string, number> | null {
  if (!manifest) return null;
  return Object.fromEntries(Object.entries(manifest).map(([v, lines]) => [v, Object.keys(lines).length]));
}
