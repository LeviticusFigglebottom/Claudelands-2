// Soundtrack bake: renders every area's exploration loop and the universal
// combat pool through Eleven Music into public/music/<id>.mp3 plus a
// manifest with durations. Resumable — existing files are skipped, so a
// retake is "delete the file, run again".
//
// Usage:  XI_KEY=... node tools/bake-music.mjs
// The key comes ONLY from the environment — never hardcode it here.

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import { promisify } from 'util';

const run = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'music');
const KEY = process.env.XI_KEY;
if (!KEY) { console.error('XI_KEY env var required'); process.exit(1); }

// Every prompt leans on the same constraints: INSTRUMENTAL BACKGROUND
// SCORE, steady dynamics, no intro/outro/finale, written to cycle forever.
const LOOP_RULES = 'Instrumental background videogame soundtrack, no vocals. Constant steady energy from the first second to the last: no intro build-up, no outro, no fade, no final cadence — the piece must cycle seamlessly forever as an unobtrusive accompaniment.';

const EXPLORE = {
  claudelands: 'Laid-back spaghetti-western desert groove: twangy baritone guitar, dusty shaker rhythm, warm lazy bass, occasional slide guitar sighs over shimmering heat-haze pads.',
  frosthollow: 'Frozen wasteland score: icy glass chimes, slow glacial synth pads, sparse muted piano notes like falling snow, distant cold wind texture, hushed and crystalline.',
  cinderthroat: 'Smoldering volcanic foundry score: deep tectonic drones, slow industrial anvil percussion, groaning low brass swells, ember-crackle textures, heavy and patient.',
  brasshaven: 'Bustling junk-city bazaar groove: jaunty upright bass walking, brushed drums, tinkering vibraphone and muted trumpet licks, streetwise and mercantile with a sly swagger.',
  rustgulch: 'Canyon speedway idle: relaxed surf-rock twang, loping desert train-beat drums, baritone guitar hooks, hot-rod garage attitude simmering at cruising speed.',
  veldt: 'Tropical jungle port groove: warm marimba patterns, hand percussion, lazy slide guitar, breathy wooden flute flourishes, sun-drunk and adventurous.',
  veldt_tangle: 'Deep jungle mystery score: low tribal hand drums, dense insect-like shaker textures, eerie bamboo flute calls, humid droning strings, overgrown and watchful.',
  veldt_shallows: 'Shipwreck lagoon score: dreamy concertina waltzing over gentle lapping-wave percussion, salt-rusted music box plinks, mournful whistled melody drifting in and out.',
  veldt_caves: 'Bioluminescent cavern score: deep subterranean hum, glassy crystal bell tones echoing in the dark, slow dripping-water percussion, cavernous reverb, wondrous and uneasy.',
  crucible: 'Gladiator pit between rounds: tense pulsing electronic bass, muffled crowd-stomp rhythm, gritty synth arpeggios coiling and uncoiling, anticipation held on a knife edge.',
  veldt_gp: 'Jungle raceway paddock: upbeat tropical surf-rock, bright ukulele chops over driving-but-easy drums, carefree checkered-flag energy at idle throttle.',
  vitra: 'Nocturnal glass-planet score: crystalline bell tones ringing in vast dark space, slow aurora synth pads, deep sub-bass hum, delicate icy plucks like starlight on glass, serene and alien and weightless.',
};

const COMBAT = {
  combat_riff: 'Ferocious desert-rock firefight: driving distorted guitar riff, pounding toms, gritty bass stomp, spaghetti-western twang stabs, relentless swagger.',
  combat_junk: 'Junkyard percussion war-stomp: clanging scrap-metal drums, anvil hits, growling detuned bass synth, chain-gang rhythm, mean and mechanical.',
  combat_chase: 'High-speed electro-rock pursuit: urgent synth arpeggios, breakneck drum groove, wiry guitar tremolo, sirens-in-the-dust energy, wild and propulsive.',
  combat_punk: 'Frantic surf-punk shootout: raw fuzzed guitar power chords, galloping snare, honking baritone sax jabs, reckless cartoon-violence glee.',
};

const TRACKS = [
  ...Object.entries(EXPLORE).map(([id, vibe]) => ({ id, kind: 'explore', ms: 90000, vibe })),
  ...Object.entries(COMBAT).map(([id, vibe]) => ({ id, kind: 'combat', ms: 60000, vibe })),
];

/** mp3 CBR duration at 128kbps stereo, skipping any ID3v2 header. */
function mp3Duration(buf) {
  let skip = 0;
  if (buf.length > 10 && buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) {
    skip = 10 + (((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f));
  }
  return Math.round(((buf.length - skip) / 16000) * 100) / 100;
}

async function bakeOne(t, attempt = 0) {
  mkdirSync(OUT, { recursive: true });
  const file = join(OUT, `${t.id}.mp3`);
  if (existsSync(file)) return { cached: true, dur: mp3Duration(readFileSync(file)) };
  const body = JSON.stringify({ prompt: `${t.vibe} ${LOOP_RULES}`, music_length_ms: t.ms });
  let status = 0;
  try {
    const { stdout } = await run('curl', [
      '-sS', '-m', '600', '-w', '%{http_code}', '-o', file,
      '-H', `xi-api-key: ${KEY}`, '-H', 'Content-Type: application/json',
      '-X', 'POST', 'https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128',
      '-d', body,
    ]);
    status = parseInt(stdout.trim(), 10);
  } catch (err) {
    if (attempt < 3) { await new Promise((r) => setTimeout(r, 4000 * 2 ** attempt)); return bakeOne(t, attempt + 1); }
    throw err;
  }
  if (status !== 200) {
    const errBody = existsSync(file) ? readFileSync(file, 'utf8').slice(0, 200) : '';
    rmSync(file, { force: true });
    if ((status === 429 || status >= 500) && attempt < 3) {
      await new Promise((r) => setTimeout(r, 4000 * 2 ** attempt));
      return bakeOne(t, attempt + 1);
    }
    throw new Error(`HTTP ${status} for ${t.id}: ${errBody}`);
  }
  const buf = readFileSync(file);
  if (buf.length < 100000 || buf[0] === 0x7b) {
    rmSync(file, { force: true });
    throw new Error(`bad track for ${t.id} (${buf.length}b)`);
  }
  return { cached: false, dur: mp3Duration(buf) };
}

const manifest = { explore: {}, combat: {} };
let fresh = 0;
const failures = [];
const queue = [...TRACKS];

async function worker() {
  while (queue.length) {
    const t = queue.shift();
    try {
      const r = await bakeOne(t);
      manifest[t.kind][t.id] = r.dur;
      if (!r.cached) fresh++;
      console.log(`${t.id}: ${r.dur}s${r.cached ? ' (cached)' : ''}`);
    } catch (err) {
      failures.push(`${t.id}: ${err.message}`);
    }
  }
}
await Promise.all(Array.from({ length: 2 }, worker));

// version stamp for cache-busting after retakes (same filenames, new music)
let vh = 0x811c9dc5;
for (const kind of ['explore', 'combat']) {
  for (const [id, d] of Object.entries(manifest[kind]).sort()) {
    const s = `${kind}/${id}:${d}:${statSync(join(OUT, `${id}.mp3`)).size}`;
    for (let i = 0; i < s.length; i++) { vh ^= s.charCodeAt(i); vh = Math.imul(vh, 0x01000193) >>> 0; }
  }
}
manifest._v = vh.toString(16);
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest));
const n = Object.keys(manifest.explore).length + Object.keys(manifest.combat).length;
console.log(`\n${n}/${TRACKS.length} tracks (${fresh} fresh), version ${manifest._v}`);
if (failures.length) { console.log('FAILURES:'); failures.forEach((f) => console.log(' ', f)); }
process.exit(failures.length ? 1 : 0);
