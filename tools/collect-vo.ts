// Offline VO line collector — bundled with rolldown and run in Node by
// tools/bake-vo.mjs. Walks every data source that feeds voice.speak() and
// emits { voice, key, speak } entries: `key` is the runtime display text
// whose voKey() must match, `speak` is what the TTS actually reads (they
// differ only for numbered announcer templates, which bake number-free).

import { QUESTS, SIDE_QUESTS } from '../src/data/quests';
import { WIRE_LOGS } from '../src/data/flavor';
import { RITA_RACE_LINES } from '../src/data/race';
import { PLAYER_LINES } from '../src/data/playerlines';
import {
  ANNOUNCER_WAVE_START, ANNOUNCER_BOSS_WAVE, ANNOUNCER_WAVE_CLEAR,
  ANNOUNCER_PLAYER_DOWN, ANNOUNCER_SECOND_WIND, ANNOUNCER_STREAK, ANNOUNCER_WELCOME,
} from '../src/data/announcerlines';
import { voKey } from '../src/audio/votext';

interface Entry { voice: string; hash: string; speak: string }
const entries: Entry[] = [];
const seen = new Set<string>();

function add(voice: string, key: string, speak = key): void {
  const hash = voKey(key);
  const k = `${voice}:${hash}`;
  if (seen.has(k)) return;
  seen.add(k);
  entries.push({ voice, hash, speak });
}

// ---- quests: every giver line, spoken over holocall and at the desk
for (const q of [...QUESTS, ...SIDE_QUESTS]) {
  for (const line of q.briefing) add(q.giver, line);
  add(q.giver, q.acceptLine);
  add(q.giver, q.completeLine);
}

// ---- wire spools: one narrator reads all the dead
for (const log of WIRE_LOGS) for (const line of log.lines) add('wirelog', line);

// ---- Rita's race commentary
for (const pool of Object.values(RITA_RACE_LINES)) for (const line of pool) add('rita', line);

// ---- the playable characters' combat chatter
for (const set of Object.values(PLAYER_LINES)) {
  const walk = (v: unknown): void => {
    if (typeof v === 'string') { if (v.length > 3 && v !== set.voiceId) add(set.voiceId, v); return; }
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(set);
}

// ---- BIG NAZDA: numbered templates bake number-free (voKey strips digits,
// so "WAVE 12!" finds the "WAVE!" recording); {boss} expands per boss
const BOSS_NAMES = [
  'GRAND DUKE GUTTERBALL', 'HX-1 WARDEN PRIME', 'OLD MAN AVALANCHE',
  'SAINT FURNACE', 'THE BLOOM MOTHER', 'ADMIRAL ANCHORHEAD', 'THE MOTHER LODE',
];
const deNumber = (s: string): string =>
  s.replace(/\{(n|next|k)\}[-\s]*/g, '').replace(/\s+([!,.?])/g, '$1').replace(/\s{2,}/g, ' ').trim();
// KEY from runtime-shaped text (a digit where the number goes — voKey strips
// digits, so any wave number matches); SPEAK the tidied number-free line
const runtimeShape = (s: string): string => s.replace(/\{(n|next|k)\}/g, '7');
for (const t of [...ANNOUNCER_WAVE_START, ...ANNOUNCER_WAVE_CLEAR, ...ANNOUNCER_PLAYER_DOWN, ...ANNOUNCER_SECOND_WIND, ...ANNOUNCER_STREAK]) {
  add('announcer', runtimeShape(t), deNumber(t));
}
for (const t of ANNOUNCER_BOSS_WAVE) {
  for (const boss of BOSS_NAMES) {
    const withBoss = t.replace('{boss}', boss);
    add('announcer', runtimeShape(withBoss), deNumber(withBoss));
  }
}
add('announcer', ANNOUNCER_WELCOME);

const chars = entries.reduce((n, e) => n + e.speak.length, 0);
console.log(JSON.stringify({ count: entries.length, chars, entries }, null, 1));
