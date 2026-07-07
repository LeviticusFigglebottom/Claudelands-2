// REDLINE'S RUN — race data for the Rust Gulch circuit. The checkpoints are
// the contract; the routes between them are suggestions. Two forked sections
// give a slower-but-safe outer line and a jump-heavy inner cut. The AI racer
// follows one of the racing lines below; the player follows their nerve.

export interface RacePoint { x: number; z: number }

export interface RaceDifficulty {
  id: 'rookie' | 'pro' | 'lunatic';
  name: string;
  blurb: string;
  /** AI top-speed factor relative to the player's buggy. */
  aiSpeed: number;
  /** How cleanly the AI corners (steering gain). */
  aiSkill: number;
  /** Does the AI spend boost on straights? */
  aiBoosts: boolean;
  rewardCash: number;
  rewardXp: number;
  /** First win at this tier drops a bonus item of this rarity. */
  firstWinItem: 'epic' | 'legendary' | null;
}

export const RACE_DIFFICULTIES: RaceDifficulty[] = [
  {
    id: 'rookie', name: 'ROOKIE RUN',
    blurb: 'Rita drives with one hand and narrates with the other.',
    aiSpeed: 0.82, aiSkill: 0.75, aiBoosts: false,
    rewardCash: 1800, rewardXp: 2600, firstWinItem: null,
  },
  {
    id: 'pro', name: 'COURIER CLASS',
    blurb: 'Both hands on the wheel. She stops narrating at turn three.',
    aiSpeed: 0.95, aiSkill: 0.95, aiBoosts: true,
    rewardCash: 4200, rewardXp: 5600, firstWinItem: 'epic',
  },
  {
    id: 'lunatic', name: 'REDLINE',
    blurb: 'The run she retired on. Nobody has beaten it. She checks.',
    aiSpeed: 1.07, aiSkill: 1.1, aiBoosts: true,
    rewardCash: 9500, rewardXp: 11000, firstWinItem: 'legendary',
  },
];

/** Start grid: two slots just behind the start/finish arch, facing north. */
export const RACE_START = {
  player: { x: -147, z: 4 },
  rival: { x: -153, z: 4 },
  yaw: Math.PI, // facing +z (up the west straight)
};

/** The contract: pass these in order, in any way you can drive. */
export const CHECKPOINTS: { x: number; z: number; r: number }[] = [
  { x: -120, z: 95, r: 13 },
  { x: 0, z: 148, r: 13 },
  { x: 130, z: 110, r: 13 },   // fork 1 opens here
  { x: 140, z: -60, r: 13 },   // fork 1 rejoins here
  { x: 60, z: -140, r: 13 },   // fork 2 opens here
  { x: -120, z: -100, r: 13 }, // fork 2 rejoins here
  { x: -150, z: 8, r: 14 },    // finish line, under the arch
];

/** AI racing lines: waypoints between checkpoints, with fork choices. The
 *  rival flips a coin at each fork; lunatic Rita always takes the cut. */
export const AI_LINE_COMMON_1: RacePoint[] = [
  { x: -150, z: 40 }, { x: -120, z: 95 }, { x: -78, z: 128 }, { x: -40, z: 145 },
  { x: 10, z: 150 }, { x: 60, z: 150 }, { x: 100, z: 132 }, { x: 130, z: 110 },
];
export const AI_FORK1_OUTER: RacePoint[] = [
  { x: 152, z: 76 }, { x: 165, z: 30 }, { x: 155, z: -18 }, { x: 140, z: -60 },
];
export const AI_FORK1_INNER: RacePoint[] = [
  { x: 112, z: 74 }, { x: 95, z: 40 }, { x: 116, z: -8 }, { x: 140, z: -60 },
];
export const AI_LINE_COMMON_2: RacePoint[] = [
  { x: 104, z: -102 }, { x: 60, z: -140 },
];
export const AI_FORK2_OUTER: RacePoint[] = [
  { x: 6, z: -150 }, { x: -50, z: -155 }, { x: -90, z: -130 }, { x: -120, z: -100 },
];
export const AI_FORK2_INNER: RacePoint[] = [
  { x: 26, z: -122 }, { x: -10, z: -108 }, { x: -70, z: -102 }, { x: -120, z: -100 },
];
export const AI_LINE_COMMON_3: RacePoint[] = [
  { x: -142, z: -62 }, { x: -150, z: -30 }, { x: -150, z: 8 },
];

/** Assemble a full lap line for the AI given its fork choices. */
export function buildAiLine(fork1Inner: boolean, fork2Inner: boolean): RacePoint[] {
  return [
    ...AI_LINE_COMMON_1,
    ...(fork1Inner ? AI_FORK1_INNER : AI_FORK1_OUTER),
    ...AI_LINE_COMMON_2,
    ...(fork2Inner ? AI_FORK2_INNER : AI_FORK2_OUTER),
    ...AI_LINE_COMMON_3,
  ];
}

// ===========================================================================
// TRACKS — every race is a TrackDef; the race system is track-agnostic.
export interface TrackDef {
  id: string;
  name: string;
  mapId: string;
  blurb: string;
  laps: number;
  /** Point-to-point: one pass, the last gate IS the finish, no return leg. */
  linear?: boolean;
  start: { player: RacePoint; rival: RacePoint; yaw: number };
  checkpoints: { x: number; z: number; r: number }[];
  buildAiLine: (fork1Inner: boolean, fork2Inner: boolean) => RacePoint[];
}

// THE CANOPY RUN (Veldt Minor GP circuit): jungle inland loop with a lagoon
// beach straight, a plateau cut with a launch ramp, and a south gap jump.
const CANOPY_COMMON_1: RacePoint[] = [
  { x: -140, z: 50 }, { x: -100, z: 110 }, { x: -60, z: 132 }, { x: -20, z: 140 },
  { x: 30, z: 136 }, { x: 60, z: 130 }, { x: 96, z: 108 }, { x: 120, z: 90 },
];
const CANOPY_F1_OUTER: RacePoint[] = [{ x: 144, z: 52 }, { x: 150, z: 30 }, { x: 142, z: -8 }, { x: 130, z: -40 }];
const CANOPY_F1_INNER: RacePoint[] = [{ x: 102, z: 60 }, { x: 98, z: 44 }, { x: 112, z: -2 }, { x: 130, z: -40 }];
const CANOPY_COMMON_2: RacePoint[] = [{ x: 110, z: -84 }, { x: 80, z: -120 }];
const CANOPY_F2_OUTER: RacePoint[] = [{ x: 36, z: -142 }, { x: 0, z: -150 }, { x: -56, z: -138 }, { x: -90, z: -120 }];
const CANOPY_F2_INNER: RacePoint[] = [{ x: 44, z: -118 }, { x: 10, z: -113 }, { x: -46, z: -114 }, { x: -90, z: -120 }];
const CANOPY_COMMON_3: RacePoint[] = [{ x: -122, z: -92 }, { x: -140, z: -60 }, { x: -140, z: 4 }];

// THE SHATTERLINE (Vitra Null GP): a truly LINEAR downhill sprint — one
// corridor of black glass under 11 m/s² of gravity, three launch ramps with
// hang time you could nap through. No laps. No second chances.
const SHATTERLINE_LINE: RacePoint[] = [
  { x: -110, z: 112 }, { x: -90, z: 96 }, { x: -60, z: 102 }, { x: -30, z: 110 },
  { x: 4, z: 92 }, { x: 30, z: 70 }, { x: 18, z: 40 }, { x: 0, z: 10 },
  { x: -34, z: -6 }, { x: -60, z: -20 }, { x: -48, z: -52 }, { x: -30, z: -80 },
  { x: 6, z: -70 }, { x: 40, z: -60 }, { x: 66, z: -86 }, { x: 90, z: -110 },
  { x: 112, z: -126 }, { x: 130, z: -140 },
];

// THE JAR RUN (Voltholm GP): linear storm gauntlet — a gale tailwind
// straight, the rod forest under live SKYFALL, a crater hop to the Eyewall
// rim. The wind drives with you; the sky files complaints.
const JARRUN_LINE: RacePoint[] = [
  { x: -120, z: 6 }, { x: -95, z: 30 }, { x: -62, z: 40 }, { x: -30, z: 45 },
  { x: 6, z: 46 }, { x: 40, z: 45 }, { x: 64, z: 30 }, { x: 80, z: 10 },
  { x: 74, z: -18 }, { x: 60, z: -45 }, { x: 84, z: -66 }, { x: 110, z: -85 },
  { x: 130, z: -102 }, { x: 150, z: -120 },
];

export const TRACKS: TrackDef[] = [
  {
    id: 'redline',
    name: 'REDLINE’S RUN',
    mapId: 'rustgulch',
    blurb: 'The gulch classic — canyon walls, two cuts, three jumps.',
    laps: 3,
    start: RACE_START,
    checkpoints: CHECKPOINTS,
    buildAiLine,
  },
  {
    id: 'canopy',
    name: 'THE CANOPY RUN',
    mapId: 'veldt_gp',
    blurb: 'Veldt Minor GP — lagoon beach straight, plateau cut, gap jump.',
    laps: 3,
    start: { player: { x: -137, z: 4 }, rival: { x: -143, z: 4 }, yaw: Math.PI },
    checkpoints: [
      { x: -100, z: 110, r: 13 },
      { x: 60, z: 130, r: 13 },
      { x: 120, z: 90, r: 13 },   // fork 1 opens
      { x: 130, z: -40, r: 13 },  // fork 1 rejoins
      { x: 80, z: -120, r: 13 },  // fork 2 opens
      { x: -90, z: -120, r: 13 }, // fork 2 rejoins
      { x: -140, z: 4, r: 14 },   // finish
    ],
    buildAiLine: (f1, f2) => [
      ...CANOPY_COMMON_1,
      ...(f1 ? CANOPY_F1_INNER : CANOPY_F1_OUTER),
      ...CANOPY_COMMON_2,
      ...(f2 ? CANOPY_F2_INNER : CANOPY_F2_OUTER),
      ...CANOPY_COMMON_3,
    ],
  },
  {
    id: 'shatterline',
    name: 'THE SHATTERLINE',
    mapId: 'vitra_gp',
    blurb: 'Vitra Null GP — downhill on glass, low gravity, three big airs. One way.',
    laps: 1,
    linear: true,
    start: { player: { x: -127, z: 127 }, rival: { x: -133, z: 133 }, yaw: Math.atan2(-(-90 - -130), -(96 - 130)) },
    checkpoints: [
      { x: -90, z: 96, r: 13 },
      { x: -30, z: 110, r: 13 },
      { x: 30, z: 70, r: 13 },    // ridge launch — commit before the lip
      { x: 0, z: 10, r: 13 },     // the chime bend
      { x: -60, z: -20, r: 13 },
      { x: -30, z: -80, r: 13 },  // the long float
      { x: 40, z: -60, r: 13 },
      { x: 90, z: -110, r: 12 },  // finish approach hop
      { x: 130, z: -140, r: 14 }, // the line, among the monoliths
    ],
    buildAiLine: () => SHATTERLINE_LINE,
  },
  {
    id: 'jarrun',
    name: 'THE JAR RUN',
    mapId: 'volt_gp',
    blurb: 'Voltholm GP — gale tailwind straight, rod forest under SKYFALL, crater hop.',
    laps: 1,
    linear: true,
    start: { player: { x: -138, z: -23 }, rival: { x: -143, z: -17 }, yaw: Math.atan2(-(-95 - -140), -(30 - -20)) },
    checkpoints: [
      { x: -95, z: 30, r: 13 },
      { x: -30, z: 45, r: 13 },   // mid-tailwind
      { x: 40, z: 45, r: 13 },    // the wind lets go here
      { x: 80, z: 10, r: 13 },    // rod forest crest
      { x: 60, z: -45, r: 13 },
      { x: 110, z: -85, r: 12 },  // crater hop
      { x: 150, z: -120, r: 14 }, // finish inside the weather
    ],
    buildAiLine: () => JARRUN_LINE,
  },
];

export function trackById(id: string): TrackDef {
  return TRACKS.find((t) => t.id === id) ?? TRACKS[0];
}

export const RITA_GREETINGS = [
  'REDLINE RITA. Fastest courier the wastes ever fired. Retired means I only race people I like now.',
  'Smell that? High-octane and bad decisions. Welcome to my office.',
];

export const RITA_RACE_LINES = {
  start: ['Wheels straight, eyes up. The gulch does the rest.', 'Try to lose PRETTY, at least.'],
  playerWins: ['WELL. Hang the leathers up AGAIN, I guess. Drinks are on your winnings.', 'You drive like a thrown wrench. I RESPECT that.'],
  ritaWins: ['The gulch keeps score, sugar. Pay up in pride.', 'Again? I got nowhere to be for the next forty years.'],
  dnf: ['That’s a Did-Not-Finish. The buggy forgives. I document.'],
};
