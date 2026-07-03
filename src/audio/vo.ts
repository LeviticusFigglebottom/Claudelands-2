// Recorded voice-over: a baked manifest of per-character MP3 clips (see
// tools/bake-vo.mjs) keyed by voice id + normalized-line hash. The voice
// system asks voClip() first and only falls back to the procedural synth
// when a line has no recording (dynamic interpolated strings, future lines
// not yet baked, or a missing/failed manifest fetch — the game never
// depends on the recordings existing).

import { voKey } from './votext';

/** voice id -> line key -> duration in seconds. Files live at vo/<voice>/<key>.mp3.
 *  `_v` is the bake's version stamp — clip URLs carry it as a query so a
 *  rebake (same filenames, new takes) busts every stale browser/CDN cache. */
type VoManifest = Record<string, Record<string, number> | string> & { _v?: string };

let manifest: VoManifest | null = null;
let version = '';

export async function loadVoManifest(): Promise<void> {
  try {
    // no-cache: the manifest is tiny, and it's the one file that must be fresh
    const res = await fetch('vo/manifest.json', { cache: 'no-cache' });
    if (res.ok) {
      manifest = await res.json();
      version = typeof manifest?._v === 'string' ? manifest._v : '';
    }
  } catch {
    manifest = null; // offline dev / stripped deploy: synth voices carry it
  }
}

export function voClip(voiceId: string, text: string): { url: string; dur: number } | null {
  const m = manifest?.[voiceId];
  if (!m || typeof m === 'string') return null;
  const key = voKey(text);
  const dur = m[key];
  if (dur === undefined) return null;
  return { url: `vo/${voiceId}/${key}.mp3${version ? `?v=${version}` : ''}`, dur };
}

/** Debug: clips per voice, or null when no manifest loaded. */
export function voStats(): Record<string, number> | null {
  if (!manifest) return null;
  return Object.fromEntries(
    Object.entries(manifest).filter(([k, v]) => k !== '_v' && typeof v !== 'string')
      .map(([v, lines]) => [v, Object.keys(lines as Record<string, number>).length]),
  );
}
