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
