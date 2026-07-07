// VO bake: reads the collector's line list and renders every line through
// ElevenLabs into public/vo/<voice>/<hash>.mp3 plus a manifest with clip
// durations. Resumable — existing files are skipped, so retakes are
// "delete the file(s), run again".
//
// Usage:  XI_KEY=... node tools/bake-vo.mjs path/to/volines.json
// The key comes ONLY from the environment — never hardcode it here.

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import { promisify } from 'util';

// node's fetch ignores HTTPS_PROXY; this environment's egress REQUIRES the
// proxy, so all API calls go through curl (which honors the env + CA setup)
const run = promisify(execFile);

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'vo');
const KEY = process.env.XI_KEY;
if (!KEY) { console.error('XI_KEY env var required'); process.exit(1); }
const LINES_PATH = process.argv[2];
if (!LINES_PATH) { console.error('usage: node tools/bake-vo.mjs volines.json'); process.exit(1); }

const MODEL = 'eleven_v3';
const FORMAT = 'mp3_44100_64'; // 64kbps CBR mono — 8000 bytes/second

// ---- the cast: ElevenLabs premade voices on eleven_v3. Stability is
// discrete on v3 (0.0 creative / 0.5 natural / 1.0 robust); the acting
// itself comes from the [direction tags] the collector bakes into each line.
const CAST = {
  quibb:     { id: 'pqHfZKP75CvOlQylNhV4', name: 'Bill',    stability: 0.0 }, // weathered old foreman
  zaza:      { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily',    stability: 0.0 }, // theatrical mystic
  mayor:     { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George',  stability: 0.0 }, // oily charming politician
  brann:     { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam',    stability: 0.5 }, // rapid-fire merchant
  mirelle:   { id: 'hpp4J3VqNfWAUOO0d1Us', name: 'Bella',   stability: 0.5 }, // soft, wistful
  okto:      { id: 'nPczCjzI2devNBz1zQrb', name: 'Brian',   stability: 0.5 }, // slow chanting brother
  juno:      { id: 'cgSgspJ2msm6clMCkdW9', name: 'Jessica', stability: 0.0 }, // excitable field scientist
  rita:      { id: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura',   stability: 0.0 }, // cocky pit racer
  peg:       { id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda', stability: 0.5 }, // dry salt-cured quartermistress
  announcer: { id: 'N2lVS1w4EtoT3dr4eOWO', name: 'Callum',  stability: 0.0 }, // unhinged carnival barker
  harlan:    { id: 'iP95p4xoKVk53GoZ742B', name: 'Chris',   stability: 0.5 }, // dry workshop baritone
  sable:     { id: 'Xb7hH8MSUJpSbSDYk0k2', name: 'Alice',   stability: 0.5 }, // cool, charged stormcaller
  kez:       { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah',   stability: 0.0 }, // quick bright hound-handler
  tovah:     { id: 'SAz9YHcvj6GT2YYXdXww', name: 'River',   stability: 0.0 }, // low gravel avalanche
  faro:      { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel',  stability: 0.5 }, // two centuries of lamp duty
  thug:      { id: 'SOYHLrjzK2X1ezoPC6cr', name: 'Harry',   stability: 0.0 }, // the sauce itself
  wick:      { id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte', stability: 0.0 }, // lamplighter, two centuries in
  coil:      { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily',    stability: 0.5 }, // storm-proof forewoman
  wirelog:   { id: 'CwhRBWXzGAHq8TQ4Fs17', name: 'Roger',   stability: 0.5 }, // the wire remembers the dead
};

const { entries } = JSON.parse(readFileSync(LINES_PATH, 'utf8'));

/** mp3 CBR duration: payload bytes / 8000, skipping any ID3v2 header. */
function mp3Duration(buf) {
  let skip = 0;
  if (buf.length > 10 && buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) {
    skip = 10 + (((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f));
  }
  return Math.round(((buf.length - skip) / 8000) * 100) / 100;
}

async function bakeOne(e, attempt = 0) {
  const cast = CAST[e.voice];
  if (!cast) throw new Error(`no cast entry for voice '${e.voice}'`);
  const dir = join(OUT, e.voice);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${e.hash}.mp3`);
  if (existsSync(file)) return { cached: true, dur: mp3Duration(readFileSync(file)) };

  const body = JSON.stringify({
    text: e.speak,
    model_id: MODEL,
    voice_settings: { stability: cast.stability },
  });
  let status = 0;
  try {
    const { stdout } = await run('curl', [
      '-sS', '-m', '90', '-w', '%{http_code}', '-o', file,
      '-H', `xi-api-key: ${KEY}`, '-H', 'Content-Type: application/json',
      '-X', 'POST', `https://api.elevenlabs.io/v1/text-to-speech/${cast.id}?output_format=${FORMAT}`,
      '-d', body,
    ]);
    status = parseInt(stdout.trim(), 10);
  } catch (err) {
    if (attempt < 4) { await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt)); return bakeOne(e, attempt + 1); }
    throw err;
  }
  if (status !== 200) {
    // curl wrote the error body where the mp3 belongs — never leave it there
    const errBody = existsSync(file) ? readFileSync(file, 'utf8').slice(0, 200) : '';
    rmSync(file, { force: true });
    if ((status === 429 || status >= 500) && attempt < 4) {
      await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
      return bakeOne(e, attempt + 1);
    }
    throw new Error(`HTTP ${status} for ${e.voice}/${e.hash}: ${errBody}`);
  }
  const buf = readFileSync(file);
  if (buf.length < 1000 || buf[0] === 0x7b) {
    rmSync(file, { force: true });
    throw new Error(`bad clip for ${e.voice}/${e.hash} (${buf.length}b)`);
  }
  return { cached: false, dur: mp3Duration(buf) };
}

const manifest = {};
let done = 0, fresh = 0, failed = 0;
const queue = [...entries];
const failures = [];

async function worker() {
  while (queue.length) {
    const e = queue.shift();
    try {
      const r = await bakeOne(e);
      (manifest[e.voice] ??= {})[e.hash] = r.dur;
      if (!r.cached) fresh++;
      done++;
      if (done % 25 === 0) console.log(`${done}/${entries.length} (${fresh} fresh)`);
    } catch (err) {
      failed++;
      failures.push(`${e.voice}/${e.hash}: ${err.message}`);
    }
  }
}

await Promise.all(Array.from({ length: 4 }, worker));

// version stamp: changes whenever any clip's bytes change, so the runtime
// can cache-bust clip URLs after a rebake (same filenames, new takes)
let vh = 0x811c9dc5;
for (const v of Object.keys(manifest).sort()) {
  for (const [h, d] of Object.entries(manifest[v]).sort()) {
    const s = `${v}/${h}:${d}:${statSync(join(OUT, v, `${h}.mp3`)).size}`;
    for (let i = 0; i < s.length; i++) { vh ^= s.charCodeAt(i); vh = Math.imul(vh, 0x01000193) >>> 0; }
  }
}
manifest._v = vh.toString(16);
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest));
console.log(`version stamp: ${manifest._v}`);
console.log(`\nbaked ${done}/${entries.length} lines (${fresh} newly generated, ${failed} failed)`);
if (failures.length) { console.log('FAILURES:'); failures.slice(0, 10).forEach((f) => console.log(' ', f)); }
const totalClips = Object.entries(manifest).reduce((n, [k, v]) => k === '_v' ? n : n + Object.keys(v).length, 0);
console.log(`manifest: ${totalClips} clips across ${Object.keys(manifest).length - 1} voices`);
process.exit(failures.length ? 1 : 0);
