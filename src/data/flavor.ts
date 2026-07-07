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
    id: 'log_kindled1',
    speaker: 'KINDLED LAMPLIGHTER — SOOT-CAKED WIRE SPOOL',
    lines: [
      'First Spark Sermon: the Rust rots. The Fire PURIFIES. We left the Duke to his garbage.',
      'The Saint took its first offering today. A whole supply cart. The warmth was... personal.',
      'Feed schedule is posted at the kilns. Do NOT be late. Do not BE the meal.',
    ],
  },
  {
    id: 'log_kindled2',
    speaker: 'HELIX FOUNDRY 9 — FINAL SHIFT LOG',
    lines: [
      'SHIFT NOTE: locals broke in again. They are not stealing. They are... decorating.',
      'They put a hat on the smelter. They are calling it a saint. HR has no guidance for this.',
      'FINAL NOTE: the smelter is walking. I quit. Effective yesterday.',
    ],
  },
  {
    id: 'log_kindled3',
    speaker: 'KINDLED CHOIRMASTER — WARM WIRE SPOOL',
    lines: [
      'The Saint grows hungry near the Court. Double offerings. Triple on feast days.',
      'A contractor walks the Throat. The Saint says: let them come. Pre-seasoned.',
      'Hymn 44: crackle, crackle, pop. Repeat until glorious.',
    ],
  },
  {
    id: 'log_brasshaven',
    speaker: 'BRASSHAVEN CIVIC ANNOUNCEMENT — LOOPING SPOOL',
    lines: [
      'Welcome to Brasshaven! Built from one (1) mega-hauler and several thousand poor decisions.',
      'Curfew is whenever the lights die. The lights have never died. We checked.',
      'Today\u2019s exchange rate: one bullet equals one bullet. The market is stable.',
    ],
  },
  {
    id: 'log_veldt1',
    speaker: 'DR. JUNO CALLA — EXPEDITION SPOOL 14',
    lines: [
      'Day 30 on the shelf. The bloom came four months early. The Verdant stopped trading and started CHANTING.',
      'Day 31: they took Ferris. And Okonkwo. And both interns. The drums have not stopped.',
      'Day 33: I am fine. The lab is fortified. Send guns, plural. Send a person who IS guns.',
    ],
  },
  {
    id: 'log_veldt2',
    speaker: 'VERDANT CHANT — WAX-LEAF SPOOL (DO NOT LICK)',
    lines: [
      'Verse of the Early Bloom: the garden woke HUNGRY, and hungry gardens must be FED.',
      'Verse two: the sky-people bring meat that talks. The garden loves conversation.',
      'Verse three: plant them gently. Water them loudly. THE FRONDS REMEMBER.',
    ],
  },
  {
    id: 'log_tangle',
    speaker: 'FERRIS OKONKWO-DEALE, EXPEDITION SECOND — SCRATCHED TAG',
    lines: [
      'If anyone finds this: we\u2019re alive. Staked in the deep court like tomatoes, but alive.',
      'The big flower sings to us at night. Kalim sings BACK, which I feel is escalating things.',
      'Tell Dr. Calla the samples were worth it. Tell her to also please hurry.',
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
  {
    id: 'log_gulch1',
    speaker: 'REDLINE RITA — COURIER LOG, FINAL ENTRY (ARCHIVED, LOUD)',
    lines: [
      'Last delivery: one (1) heart medication, Gutterlight to the Gulch, eleven minutes forty flat. Record stands.',
      'The client survived. The medication survived. My license did not — turns out the shortcut through the Slagflats is “a war crime.”',
      'So I retired here and built a track instead. The gulch was already shaped like a dare.',
    ],
  },
  {
    id: 'log_gulch2',
    speaker: 'SHIPBREAK SALVAGE CO. — FOREMAN’S MANIFEST, WATER-DAMAGED',
    lines: [
      'Day 1: nine haulers came down in the gulch. Company says strip them all by spring.',
      'Day 40: the scavvers unionized. Their dues are teeth.',
      'Day 41: company says the wrecks are “self-managing” now. So am I. Gone fishing.',
    ],
  },
  {
    id: 'log_shallows1',
    speaker: 'QUARTERMISTRESS PEG — SHORE LOG, ENTRY 147',
    lines: [
      'Day 1: barge down, cargo scattered, crew lost. Started the fire per regulation. Regulation is all I have left.',
      'Day 60: the crew came back. Wet. Punctual. They don’t answer muster but they NEVER miss a shift.',
      'Day 147: re-salvaged crate 7 for the ninth time. If the sea wants a paperwork war, the sea has PICKED THE WRONG QUARTERMISTRESS.',
    ],
  },
  {
    id: 'log_shallows2',
    speaker: 'PELICAN DECK LOG — FINAL ENTRY, SALT-CRUSTED',
    lines: [
      'Weather clean, shoals charted, crossing routine. Then the chain locker started paying out BY ITSELF.',
      'Something took the bower anchor like a fish takes a hook. Pulled us stern-first. The captain lashed himself to the wheel and told us the ship comes first.',
      'The ship came first. We came after. The captain — the captain never clocked out at all.',
    ],
  },
  {
    id: 'log_hollow1',
    speaker: 'HELIX BORE SITE 9 — SHIFT SUPERVISOR’S WIRE, DEGRADED',
    lines: [
      'Level nine broke into a natural gallery today. Crystal formations. They HUM. The crew hums back on their breaks. Filed under morale: positive.',
      'Productivity is up 300%. Nobody has clocked out in six days. Filed under morale: very positive.',
      'HQ ordered the shaft sealed. The crew disagrees. The crew has never disagreed before. Filing this under',
    ],
  },
  {
    id: 'log_hollow2',
    speaker: 'UNDERGROWN CHANT — SCRATCHED INTO A RAIL CART, TRANSLATED BADLY',
    lines: [
      'verse: the seam sings low and the seam sings long, and the shift is the length of the song.',
      'verse: she pays in glow what she takes in bone, and nobody hauls alone.',
      'chorus (carved deeper): DIG. DIG. DIG.',
    ],
  },
  {
    id: 'log_mile1',
    speaker: 'MILE LAMPLIGHTERS’ GUILD — FINAL ROUND SHEET',
    lines: [
      'Round seven thousand three hundred. Lamps one through forty: LIT. Signed, W.',
      'Round seven thousand three hundred and one. Lamps one through forty went out TOGETHER. Mid-round. Like they’d agreed on it.',
      'The keeper won’t answer the spire bell. The glass on the road is standing funny. Ending my round early. First time. Sorry.',
      'Addendum, different hand: kept lamp forty-one going. Someone had to. Still here. Still trimming. — W.',
    ],
  },
  {
    id: 'log_mile2',
    speaker: 'KEEPER MORROW — LAMPFALL SPIRE, LAST OFFICIAL WIRE',
    lines: [
      'Final entry. To Faro, up the coast: don’t send oil. Don’t send the apprentice. Don’t send ANYTHING.',
      'You wind your lamp and I wound mine, and friend, I did the arithmetic — the dark is two hundred years of work CHEAPER.',
      'It isn’t a failure if you file it as a transfer. I’m not letting the light die. I’m switching departments.',
      'Keep yours burning if it flatters you. Mine is finally QUIET. You’ll see it my way in a century or two.',
    ],
  },
  {
    id: 'log_volt1',
    speaker: 'VOLTHOLM HARVEST AUTHORITY — SITE-WIDE MEMO, LAST ISSUE',
    lines: [
      'Memo to all crews: the new neural rigging is APPROVED. Hands-free harvest, direct storm interface, zero jar spillage. Sign the waiver, wire in, clock out rich.',
      'Update: crews report the storm is “warm” and “knows their names.” Filed under morale: excellent. Output up 900%.',
      'Update: crews have stopped submitting timesheets. Crews have stopped LANDING. Site manager says the weather “has it handled.”',
      'Final memo, unsigned: if you can read this, you are not wired in. Do not sign the waiver. The storm keeps what it pays for.',
    ],
  },
  {
    id: 'log_volt2',
    speaker: 'CONDUCTOR ROW — TITHE LEDGER, KEPT IN A DRY HAND',
    lines: [
      'Entry: the flats gave four jars today. We returned one to the sky, as is proper. The sky returned it at nine hundred miles an hour, as is TRADITION.',
      'Entry: Brother Aldan preached the noon SKYFALL from inside it. Unharmed. The rods bowed. Attendance is mandatory now, per the weather.',
      'Entry: the Forewoman came again asking after her crews by name. We gave her the names back. The rest is filed under the storm.',
      'Entry, final: the tithe is not paid TO the storm. It is paid THROUGH it. Upward. To whom, the ledger does not say. The ledger is afraid to ask.',
    ],
  },
  {
    id: 'log_still1',
    speaker: 'HARVEST KITE CREW 12 — FINAL FLIGHT LOG',
    lines: [
      'Wind steady at forty. Kites up, jars filling, best haul of the season. Iri says the gusts sound funny today. Like breathing IN.',
      'Wind forty. Wind twenty. Wind NOTHING. All twelve kites still flying. Repeat: no wind, and the kites are STILL FLYING.',
      'The crew is walking toward the middle. I asked where. Marlow said, and I am writing this down exactly: five more minutes.',
      'Kites holding. Crew gone quiet. It is very peaceful. That is the worst part. Signing off to go get them. Back in five.',
    ],
  },
  {
    id: 'log_still2',
    speaker: 'BAROMETER BET — MORNING PRESSURE REPORT, DAY 7,201',
    lines: [
      'Six a.m. Pressure: unchanged. Wind: none. Sky: holding. Crews: asleep, standing, all shifts. Forecast: same.',
      'Personal addendum, off the record: I have logged one number for twenty years and the number is a LIE. Pressure like this should CRUSH. It does not, because the weather is not gone. It is coiled in the hollow, and it is COUNTING.',
      'To whoever finally reads this: do not shout, do not run, and do not trust the calm. A held breath is not peace. It is a SCHEDULE.',
    ],
  },
  {
    id: 'log_auger1',
    speaker: 'BORE SITE ONE — SHIFT SUPERVISOR, TURN ONE STATION',
    lines: [
      'Depth forty and the thread holds grade. The crews hate the spiral — you can see your own lunch spot two turns up, all shift. Morale: dizzy.',
      'Depth sixty. The drill started returning cores we did not cut. Perfect cylinders. Wrong stone. Geology says impossible. Geology has stopped coming down.',
      'Depth eighty. You can hear the drill from anywhere on the thread. Today, between bites, we heard it PAUSE. Drills do not pause. Filing under acoustics.',
    ],
  },
  {
    id: 'log_auger2',
    speaker: 'DRILL OPERATOR YEE — FINAL ENTRY, RECOVERED AT THE FLOOR',
    lines: [
      'Last bite of the shift. The head dropped through into open air — a gallery, big one, reading WARM. And the hum the deep crews talk about came up the shaft like a tide.',
      'Here is the thing nobody upstairs will print: the hum matched the drill. Same pitch, same rhythm. It was not echoing us. It was SINGING ALONG.',
      'Combine called full stop and pulled the crews up the spiral at a run. I was last out. I looked back from turn one. The drill was dark. The hole was not.',
    ],
  },
  {
    id: 'log_stairs1',
    speaker: 'VERDANT PLANTING SONG — TAUGHT TO EVERY CHILD, TRANSLATED LOOSELY',
    lines: [
      'verse: one step for the seed, two steps for the rain, three steps for the water walking down again.',
      'verse: four steps for the mothers who cut the stone rows. five steps for the garden, who was here before.',
      'chorus, whispered: we did not plant the terraces. the terraces planted US.',
    ],
  },
  {
    id: 'log_stairs2',
    speaker: 'DR. JUNO CALLA — FIELD RECORDER, DRAFT NOTES (DO NOT PUBLISH YET)',
    lines: [
      'Draft one: the irrigation is gravity-fed from a spring at the crown. Elegant. Pre-tribal. Fine. NORMAL.',
      'Draft two: the flow rate ADJUSTS. Dry week, the falls narrow. Seedlings wilting on step two, step three sends extra. There is no mechanism. I have LOOKED.',
      'Draft three, 3 a.m.: farms need farmers. Nothing tends this garden. Unless you stop asking WHO tends the garden and start asking what the garden considers a TOOL. Going back up with the drone. And a hat.',
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
