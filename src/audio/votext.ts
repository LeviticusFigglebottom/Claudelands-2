// Shared VO line keying — used by BOTH the runtime lookup (audio/vo.ts) and
// the offline bake tooling (tools/collect-vo.ts), so a spoken line always
// finds its recording. Keys are content hashes of a normalized form that
// drops tags, digits, and punctuation: "WAVE 12! Release the regrets!"
// and the baked template "WAVE! Release the regrets!" share one key, which
// is how numbered announcer lines map onto number-free recordings.

/** Normalize a display line to its voiceable identity. */
export function voNormalize(text: string): string {
  return text.replace(/<[^>]*>/g, '').toLowerCase().replace(/[^a-z]+/g, '');
}

/** FNV-1a hash of the normalized line, as 8 hex chars. */
export function voKey(text: string): string {
  const s = voNormalize(text);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
