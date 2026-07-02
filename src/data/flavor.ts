// The world's voice — all original. Gun-name prefixes, red-text pool for
// epics, vendor personalities, ECHO-style audio logs ("wireframes" here:
// Wire Spool recordings), graffiti, and posters. Writers pour into this file
// without touching systems code.

export const QUALITY_PREFIXES: Record<string, string[]> = {
  common: ['Rusty', 'Plain', 'Surplus', 'Dented', 'Secondhand'],
  uncommon: ['Sturdy', 'Honest', 'Tuned', 'Greased', 'Dependable'],
  rare: ['Vicious', 'Polished', 'Balanced', 'Wicked', 'Keen'],
  epic: ['Baroque', 'Immaculate', 'Ferocious', 'Exquisite', 'Howling'],
  legendary: [],
  opaline: [],
};

export const ELEMENT_PREFIXES: Record<string, string[]> = {
  ember: ['Smoldering', 'Arsonist’s', 'Blistering'],
  bile: ['Weeping', 'Gutrot', 'Caustic'],
  volt: ['Crackling', 'Stormtouched', 'Live-Wire'],
  rime: ['Shivering', 'Wintry', 'Frostbound'],
  blast: ['Thumping', 'Concussive', 'Demolition'],
  kinetic: [],
};

/** Red text for epic-tier surprises (legendaries carry their own). */
export const EPIC_RED_TEXT = [
  '“Warranty voided by existing.”',
  '“Found in a ditch. The ditch fought back.”',
  '“Do not lick the barrel. Again.”',
  '“As seen in someone’s nightmare.”',
  '“Certified pre-owned violence.”',
];

// ---------------------------------------------------------------- vendors
export const VENDOR_LINES: Record<string, string[]> = {
  gunveda: [
    'Madame Zaza sees your future. It’s FULL of bullets, sugar.',
    'Buy two guns. The third one’s also full price. Zaza has bills.',
    'This week’s special: everything is regular price!',
    'A gun is just a metal friend who screams.',
    'No refunds. Zaza’s crystal ball says you won’t mind.',
  ],
  medveda: [
    'Doc Fizzy’s Med-O-Mat! Legally distinct from medicine!',
    'Side effects include: fewer holes in you!',
    'Health juice! Cold-ish! Fizzy-brand!',
    'If symptoms persist, buy MORE juice!',
  ],
};

// ---------------------------------------------------------------- wire logs
export interface WireLog {
  id: string;
  speaker: string;
  lines: string[];   // shown as timed subtitles with radio-garble audio
}

export const WIRE_LOGS: WireLog[] = [
  {
    id: 'log_foreman1',
    speaker: 'FOREMAN QUIBB — WIRE SPOOL 12',
    lines: [
      'Day forty in Gully Seven. The Rustborn made a king.',
      'It’s Gutterball. They crowned GUTTERBALL. With a hubcap.',
      'He taxed my boots. I am WEARING my boots. He taxed them ANYWAY.',
      'Send help. Or better boots.',
    ],
  },
  {
    id: 'log_zaza1',
    speaker: 'MADAME ZAZA — PROMOTIONAL SPOOL',
    lines: [
      'Zaza’s Bang-Bang Emporium, first vending machine in the gully!',
      'The spirits told me to raise prices. Who am I to argue with spirits?',
      'Remember, sugar: violence is a language, and Zaza sells vocabulary.',
    ],
  },
  {
    id: 'log_rustborn1',
    speaker: 'UNKNOWN RUSTBORN — CHEWED WIRE SPOOL',
    lines: [
      'Rust Sermon, verse one: everything falls apart. That’s the good news.',
      'Verse two: if it sparks, worship it. If it bites, promote it.',
      'Verse three: the Duke gets ten percent of yer teeth. Standard.',
    ],
  },
  {
    id: 'log_boneyard',
    speaker: 'DR. HALLOWAY, XENO-SKELETOLOGIST — WIRE SPOOL 3',
    lines: [
      'Day twelve at the Boneyard. The specimen is... large. Cathedral large.',
      'The locals bury their dead inside its ribcage. For "the upgrade," they said.',
      'Day thirteen: the ribs HUM at dusk. I am leaving. I was never here.',
    ],
  },
  {
    id: 'log_helix',
    speaker: 'HAULER HX-77 — BLACK BOX RECORDING',
    lines: [
      'MAYDAY. CARGO: ONE (1) SITE WARDEN, DEACTIVATED. MOSTLY.',
      'IMPACT IN TEN. NINE. LEGAL SAYS WE CANNOT SAY "CRASH."',
      'INITIATING UNSCHEDULED GROUND ENGAGEMENT. HELIX THANKS YOU.',
    ],
  },
  {
    id: 'log_pinebreak',
    speaker: 'TRAPPER OKSANA — FROSTBITTEN WIRE SPOOL',
    lines: [
      'The pines grew in eleven years. ELEVEN. Trees don’t do that.',
      'The Frostborn say the terraformer dreams them. I say trees don’t DREAM either.',
      'Day forty: a pine moved. I have decided it did not. Goodnight.',
    ],
  },
  {
    id: 'log_fathom',
    speaker: 'HELIX TERRAFORMER TF-09 — MAINTENANCE LOOP',
    lines: [
      'CLIMATE TARGET: TEMPERATE. CURRENT OUTPUT: AGGRESSIVELY SIBERIAN.',
      'ERROR ACKNOWLEDGED. ERROR EMBRACED. ERROR IS HOME NOW.',
      'THE LAKE IS A FEATURE. THE THING UNDER THE LAKE IS A FOOTNOTE.',
    ],
  },
  {
    id: 'log_icebox',
    speaker: 'UNKNOWN FROSTBORN — REVERENT WIRE SPOOL',
    lines: [
      'Verse one of the Long Cold: the Old Man was here before the snow.',
      'Verse two: feed him hikers, and he stays asleep. Mostly.',
      'Verse three: if the ground rumbles, congratulations. You’re a verse now.',
    ],
  },
];

export const ZAZA_GREETINGS = [
  'Zaza foresaw your visit, sugar. The crystal ball is a snow globe now. Budget cuts.',
  'Welcome to the caravan! Everything’s frozen except the prices.',
  'The spirits say hello. They also say duck more.',
];

export const FROST_WIRE_LOGS_NOTE = 'see WIRE_LOGS — frost entries appended';

/** Quibb's ambient mutterings when idle near him. */
export const QUIBB_MUTTERS = [
  'Forms. Forms never change.',
  '*aggressive clipboard noises*',
  'I audited a mutt once. It ate the audit.',
];

export const VICTORY_LINES = ['THE CLAUDELANDS ARE YOURS', 'CONTRACT: FULFILLED', 'RUST NAPS TONIGHT'];

// ---------------------------------------------------------------- signage
export interface GraffitiSpec { lines: string[]; style: 'propaganda' | 'graffiti' | 'warning' | 'ad'; bg: string; fg: string; accent?: string }

export const POSTERS: GraffitiSpec[] = [
  { lines: ['OBEY', 'THE DUKE'], style: 'propaganda', bg: '#8a2f24', fg: '#f2e4c4', accent: 'rgba(255,220,120,0.25)' },
  { lines: ['THE RUST', 'PROVIDES'], style: 'propaganda', bg: '#3a4a5a', fg: '#e8d8b0', accent: 'rgba(255,255,255,0.12)' },
  { lines: ['DANGER', 'LIVE MUNITIONS', '(PROBABLY)'], style: 'warning', bg: '#d8a828', fg: '#1a1a1a', accent: '#1a1a1a' },
  { lines: ['ZAZA’S', 'BANG-BANG', 'EMPORIUM'], style: 'ad', bg: '#5a2a6a', fg: '#ffd23c', accent: '#ff5a86' },
  { lines: ['FIZZY', 'MED-O-MAT', '“IT’S JUICE!”'], style: 'ad', bg: '#2a6a5a', fg: '#eafff4', accent: '#7dff2a' },
  { lines: ['WANTED:', 'EVERYONE'], style: 'warning', bg: '#c8b428', fg: '#181818', accent: '#181818' },
];

export const GRAFFITI: GraffitiSpec[] = [
  { lines: ['GUTTERBALL', 'RULEZ'], style: 'graffiti', bg: '#00000000', fg: '#ff5a86', accent: '#2a0a14' },
  { lines: ['EAT', 'SCRAP'], style: 'graffiti', bg: '#00000000', fg: '#7dff2a', accent: '#0a2a0a' },
  { lines: ['TAX THE', 'BOOTS'], style: 'graffiti', bg: '#00000000', fg: '#ffd23c', accent: '#2a1a0a' },
  { lines: ['RUST', 'NEVER', 'SLEEPS'], style: 'graffiti', bg: '#00000000', fg: '#54d4ff', accent: '#0a1a2a' },
];

// ---------------------------------------------------------------- misc
export const SECOND_WIND_LINES = ['SECOND WIND', 'NOT TODAY', 'STILL BILLING HOURS', 'RUDE.'];
export const LEVELUP_LINES = ['LEVEL UP!', 'BADDER-ASS!', 'PROMOTION!'];
export const CHEST_LINES = ['Ooooh.', 'Zaza smiles upon you.', 'Finders keepers is the LAW.'];
