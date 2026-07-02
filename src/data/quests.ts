// Quest chain data. Linear main-line for pass 2, structured so side quests
// are additive rows later. Objectives are declarative; game/quests.ts owns
// progression. All dialogue is original and lives here for the writers.

export type ObjectiveKind = 'goto' | 'kill_faction' | 'collect' | 'boss';

export interface QuestDef {
  id: string;
  name: string;
  /** Quibb's pitch, line by line, shown in the dialogue panel. */
  briefing: string[];
  acceptLine: string;              // Quibb's send-off
  objective: {
    kind: ObjectiveKind;
    label: string;                 // HUD tracker text, e.g. "Rustborn culled"
    count: number;
    districtId?: string;           // goto target / kill scope (optional)
    faction?: 'rustborn' | 'helix';
    bossId?: string;
    markerX?: number; markerZ?: number;  // compass/objective marker
  };
  rewardCash: number;              // scaled by level in code
  rewardXp: number;
  rewardItem?: 'epic' | 'legendary';
  completeLine: string;            // toast on completion
  unlocksGate?: string;            // gate poi data id to open on ACCEPT
}

export const QUESTS: QuestDef[] = [
  {
    id: 'q1_boots',
    name: 'Boots in the Gully',
    briefing: [
      'You’re the new contractor? Great. Fantastic. You’re hired, whatever your name is.',
      'Job’s simple: Gully Seven, just south. The Rustborn crowned a garbage king and he TAXED MY BOOTS.',
      'Walk down there and get eyes on the fort. Try not to die before payroll clears.',
    ],
    acceptLine: 'South! The road! The one with all the screaming!',
    objective: { kind: 'goto', label: 'Reach Gully Seven', count: 1, districtId: 'gully7', markerX: 0, markerZ: 5 },
    rewardCash: 40, rewardXp: 60,
    completeLine: 'You reached Gully Seven. It smells like ambition and tetanus.',
  },
  {
    id: 'q2_pest',
    name: 'Pest Control',
    briefing: [
      'Good, you’re not dead. The Rustborn respect exactly one thing: percussive unemployment.',
      'Thin the herd in the gully. Eight of them ought to send a memo.',
      'Their stuff is your stuff afterward. That’s the whole economy out here.',
    ],
    acceptLine: 'Eight! Rustborn! Any flavor! Go!',
    objective: { kind: 'kill_faction', label: 'Rustborn culled', count: 8, faction: 'rustborn', markerX: 0, markerZ: 5 },
    rewardCash: 120, rewardXp: 160,
    completeLine: 'Eight Rustborn, unsubscribed. The Duke has noticed you.',
  },
  {
    id: 'q3_parts',
    name: 'Sparepartology',
    briefing: [
      'The Duke’s throne room is behind a Helix blast gate. Company hardware. I can crack it — with parts.',
      'East, in the Slagflats, Helix machines patrol their crashed hauler. Their drive cores pop right out.',
      'Well. "Pop." There’s shooting involved. Bring me four cores.',
    ],
    acceptLine: 'Four drive cores! East! Mind the lawsuits!',
    objective: { kind: 'collect', label: 'Drive cores salvaged', count: 4, faction: 'helix', markerX: 85, markerZ: -25 },
    rewardCash: 220, rewardXp: 260, rewardItem: 'epic',
    completeLine: 'Four cores. Warm, humming, extremely stolen. The gate is toast.',
  },
  {
    id: 'q4_regicide',
    name: 'Regicide, Please',
    briefing: [
      'Gate’s open. Trash Mountain is that ugly lump up north — the Duke holds court at the summit.',
      'He’s big, he’s mean, and his crown is load-bearing. That last part is a TIP, contractor.',
      'De-throne him. Permanently. I’ll draft the invoice.',
    ],
    acceptLine: 'North! The mountain! Aim for the crown!',
    objective: { kind: 'boss', label: 'Grand Duke Gutterball de-throned', count: 1, bossId: 'gutterball', markerX: 0, markerZ: -98 },
    rewardCash: 500, rewardXp: 600, rewardItem: 'epic',
    completeLine: 'The Duke is dead. The gully is quieter. The seagulls are not.',
    unlocksGate: 'trashgate',
  },
  {
    id: 'q5_warden',
    name: 'The Warden Below',
    briefing: [
      'Bad news. Those cores we pulled? They were the LOCK on something in the Slagflat crater.',
      'Helix buried their site warden out there. HX-1. It has woken up and started "itemizing" the wasteland.',
      'It’s you or it, contractor. Personally I have money on... well, it. But prove me wrong!',
    ],
    acceptLine: 'The crater! East! It sounds like a filing cabinet learning to hate!',
    objective: { kind: 'boss', label: 'HX-1 Warden Prime decommissioned', count: 1, bossId: 'warden_prime', markerX: 88, markerZ: -30 },
    rewardCash: 1200, rewardXp: 1500, rewardItem: 'legendary',
    completeLine: 'HX-1 decommissioned. The Claudelands are yours. Rust never sleeps — but tonight, it naps.',
  },
];

export const QUEST_DONE_IDLE = [
  'That’s the whole job list, contractor. Everything else is recreational violence.',
  'No more work! Go shoot something for fun. Or me. NOT me.',
  'Payroll’s closed. The wasteland restocks itself, if you’re bored.',
];

export const QUIBB_GREETINGS = [
  'Quibb. Foreman. Retired, technically. Nobody told the paperwork.',
  'You again! Good. The paperwork multiplies when I’m alone.',
  'Welcome back. The lemonade is sold out. It was never in stock.',
];
