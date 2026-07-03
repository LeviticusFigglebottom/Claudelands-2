// Offline VO line collector — bundled with rolldown and run in Node by
// tools/bake-vo.mjs. Walks every data source that feeds voice.speak() and
// emits { voice, hash, speak } entries: `hash` keys the runtime display text
// (via the shared voKey), `speak` is what the TTS performs — the same words
// DECORATED with eleven_v3 direction tags ([shouting], [gravelly], ...) so
// every read is an acted take, not narration. Tags are direction only; the
// model doesn't speak them, and they never appear in subtitles.

import { QUESTS, SIDE_QUESTS } from '../src/data/quests';
import { WIRE_LOGS } from '../src/data/flavor';
import { RITA_RACE_LINES } from '../src/data/race';
import { PLAYER_LINES, THUG_LINES } from '../src/data/playerlines';
import {
  ANNOUNCER_WAVE_START, ANNOUNCER_BOSS_WAVE, ANNOUNCER_WAVE_CLEAR,
  ANNOUNCER_PLAYER_DOWN, ANNOUNCER_SECOND_WIND, ANNOUNCER_STREAK, ANNOUNCER_WELCOME,
} from '../src/data/announcerlines';
import { voKey } from '../src/audio/votext';

// ---- the standing character direction, prefixed to every one of their lines
const VOICE_TAG: Record<string, string> = {
  quibb: 'gruff, gravelly old foreman',
  zaza: 'theatrical, dramatic fortune-teller',
  mayor: 'smug, oily politician',
  brann: 'fast-talking, businesslike',
  mirelle: 'soft, wistful, haunted',
  okto: 'slow, solemn, reverent',
  juno: 'excited, rapid-fire, nerdy',
  rita: 'cocky, teasing drawl',
  peg: 'dry, gravelly, deadpan',
  announcer: 'shouting, unhinged carnival barker',
  harlan: 'dry, sardonic, unimpressed',
  sable: 'cool, focused intensity',
  kez: 'scrappy, energetic, grinning',
  tovah: 'deep, growling, menacing',
  faro: 'calm, weathered, quietly amused lighthouse keeper',
  thug: '', // per-line direction only — see THUG_TAGS (the deadpan lines need the contrast)
  wirelog: 'weary, haunted, distant',
};

/** A line that's clearly yelled gets extra heat on top of the base read. */
function heatOf(text: string): string | null {
  const bangs = (text.match(/!/g) ?? []).length;
  const caps = /\b[A-Z]{4,}\b/.test(text);
  return bangs >= 2 || (bangs >= 1 && caps) ? 'shouting' : null;
}

interface Entry { voice: string; hash: string; speak: string }
const entries: Entry[] = [];
const seen = new Set<string>();

function add(voice: string, key: string, speakText = key, extraTag?: string | null): void {
  const hash = voKey(key);
  const k = `${voice}:${hash}`;
  if (seen.has(k)) return;
  seen.add(k);
  const terms = [VOICE_TAG[voice], extraTag ?? heatOf(speakText)].filter(Boolean).join(', ').split(', ');
  const tags = [...new Set(terms)].join(', ');
  entries.push({ voice, hash, speak: `[${tags}] ${speakText}` });
}

// ---- quests: every giver line, spoken over holocall and at the desk
for (const q of [...QUESTS, ...SIDE_QUESTS]) {
  for (const line of q.briefing) add(q.giver, line);
  add(q.giver, q.acceptLine);
  add(q.giver, q.completeLine);
}

// ---- wire spools: one narrator reads all the dead
for (const log of WIRE_LOGS) for (const line of log.lines) add('wirelog', line);

// ---- Rita's race commentary, keyed by outcome
const RITA_MOOD: Record<string, string> = {
  start: 'teasing', playerWins: 'grudging respect, amused', ritaWins: 'gloating', dnf: 'deadpan',
};
for (const [pool, lines] of Object.entries(RITA_RACE_LINES)) {
  for (const line of lines) add('rita', line, line, RITA_MOOD[pool] ?? null);
}

// ---- the playable characters: acting notes per trigger
const TRIGGER_TAG: Record<string, string> = {
  kill: 'smug', multikill: 'gleeful shout', crit: 'satisfied',
  skill: 'battle cry', reload: 'muttering, annoyed', hurt: 'strained, in pain',
  downed: 'desperate, gasping', secondwind: 'triumphant shout',
  levelup: 'pleased', legendary: 'awed, delighted',
};
for (const set of Object.values(PLAYER_LINES)) {
  for (const [trigger, tag] of Object.entries(TRIGGER_TAG)) {
    const lines = (set as unknown as Record<string, string[]>)[trigger] ?? [];
    for (const line of lines) add(set.voiceId, line, line, tag);
  }
}

// ---- THUG MODE: one pool, every trigger, zero dignity — each line gets
// its own dramatic read (screams, groans, or deadpan where the joke is
// the contrast)
const THUG_TAGS: Record<string, string> = {
  'I\u2019M ABOUT TO CUM!!': 'ecstatic screaming',
  'THAT MIGHT JUST BE WHAT I NEED TO BUST!': 'ecstatic screaming',
  'YOU FUCKING THE SHIT OUT OF ME BRO!!': 'overwhelmed dramatic screaming',
  'DO THE THUG SHAKER!!': 'commanding hype-man shout',
  'I\u2019M BUSTING\u2026 YES, I\u2019M BUSTING\u2026!!': 'a deep dramatic groan building into a triumphant scream',
  'I\u2019M ABOUT TO BLOW!!': 'panicked screaming',
  'A well-timed ability can help make short work of your adversaries.': 'calm, composed tutorial narrator, completely serious',
  'Stay away from those oranges, and have fun in Hamburg!': 'cheerful hollering, sincere',
  'Lay off the bacon, egg, and cheeses, JRC!': 'scolding, exasperated yelling',
  'FNRK!!': 'a single strangled shout',
  'A little elbow grease and we\u2019ll be a well-oiled machine!': 'chipper, absurdly enthusiastic',
  'AAAAAAAAAAAAAAAAAA!!': 'pure sustained screaming at the top of the lungs',
  'Another one down, another rope shot!': 'triumphant groaning shout',
};
for (const line of THUG_LINES) add('thug', line, line, THUG_TAGS[line] ?? 'screaming, ecstatic');

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
for (const t of [...ANNOUNCER_WAVE_START, ...ANNOUNCER_WAVE_CLEAR, ...ANNOUNCER_SECOND_WIND, ...ANNOUNCER_STREAK]) {
  add('announcer', runtimeShape(t), deNumber(t));
}
for (const t of ANNOUNCER_PLAYER_DOWN) {
  add('announcer', runtimeShape(t), deNumber(t), 'shouting, mock concern');
}
for (const t of ANNOUNCER_BOSS_WAVE) {
  for (const boss of BOSS_NAMES) {
    const withBoss = t.replace('{boss}', boss);
    add('announcer', runtimeShape(withBoss), deNumber(withBoss), 'shouting, building to a frenzy');
  }
}
add('announcer', ANNOUNCER_WELCOME);

const chars = entries.reduce((n, e) => n + e.speak.length, 0);
console.log(JSON.stringify({ count: entries.length, chars, entries }, null, 1));
