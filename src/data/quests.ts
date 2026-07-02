// Quest chain data. Linear main-line for pass 2, structured so side quests
// are additive rows later. Objectives are declarative; game/quests.ts owns
// progression. All dialogue is original and lives here for the writers.

export type ObjectiveKind = 'goto' | 'kill_faction' | 'collect' | 'boss';
export type QuestGiver = 'quibb' | 'zaza';

export interface QuestDef {
  id: string;
  name: string;
  giver: QuestGiver;
  /** The giver's pitch, line by line, shown in the dialogue panel. */
  briefing: string[];
  acceptLine: string;
  objective: {
    kind: ObjectiveKind;
    label: string;
    count: number;
    districtId?: string;
    faction?: 'rustborn' | 'helix' | 'frostborn';
    bossId?: string;
    markerX?: number; markerZ?: number;
    mapId?: string;                // which map the marker/boss lives on (default claudelands)
  };
  rewardCash: number;
  rewardXp: number;
  rewardItem?: 'epic' | 'legendary';
  completeLine: string;
  unlocksGate?: string;
  /** Station name auto-discovered on accept (story-driven map unlock). */
  unlocksStation?: string;
}

export const QUESTS: QuestDef[] = [
  {
    id: 'q1_boots',
    giver: 'quibb',
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
    giver: 'quibb',
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
    giver: 'quibb',
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
    giver: 'quibb',
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
    giver: 'quibb',
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
  {
    id: 'q6_coldcall',
    name: 'Cold Call',
    giver: 'quibb',
    briefing: [
      'One more thing, contractor. Madame Zaza packed her caravan north last thaw. To the FROSTHOLLOW.',
      'A Helix terraformer misfired up there decades back. Winter moved in and never paid rent.',
      'Her machines down here still hum, but Zaza herself went quiet. Take the Re-Constructor to Chatterjaw Landing and check on her. Bring a coat. Or don\u2019t, you heal fast.',
    ],
    acceptLine: 'The network node\u2019s unlocked! North! Where the air BITES!',
    objective: { kind: 'goto', label: 'Reach Chatterjaw Landing', count: 1, markerX: 0, markerZ: 82, mapId: 'frosthollow' },
    rewardCash: 300, rewardXp: 500,
    completeLine: 'You made it to the Frosthollow. Your breath is visible and so are the problems.',
    unlocksStation: 'Chatterjaw Landing',
  },
  {
    id: 'q7_frostcull',
    name: 'Winter Clearance',
    giver: 'zaza',
    briefing: [
      'Sugar! You came! The spirits said a heavily armed disappointment would arrive, and here you are.',
      'The locals call themselves the Frostborn. They worship the cold and tax my caravan in TEETH.',
      'Thin them out \u2014 ten ought to chill their enthusiasm. Zaza pays in bullets and affection.',
    ],
    acceptLine: 'Ten Frostborn, sugar! Any flavor of frozen!',
    objective: { kind: 'kill_faction', label: 'Frostborn culled', count: 10, faction: 'frostborn', markerX: -62, markerZ: -2, mapId: 'frosthollow' },
    rewardCash: 500, rewardXp: 800, rewardItem: 'epic',
    completeLine: 'Ten Frostborn, defrosted permanently. Zaza smiles upon you.',
  },
  {
    id: 'q8_avalanche',
    name: 'An Avalanche, Personally',
    giver: 'zaza',
    briefing: [
      'Now the bad news, sugar. The Frostborn answer to something older. They call him OLD MAN AVALANCHE.',
      'He sleeps in the Icebox, south past the pines. When he rolls over, whole trade routes disappear.',
      'The spirits are unanimous: it\u2019s him or my caravan. And I have SO much inventory.',
    ],
    acceptLine: 'The Icebox, sugar! Aim for the grumpy end!',
    objective: { kind: 'boss', label: 'Old Man Avalanche put to bed', count: 1, bossId: 'old_man_avalanche', markerX: 0, markerZ: -85, mapId: 'frosthollow' },
    rewardCash: 2000, rewardXp: 2500, rewardItem: 'legendary',
    completeLine: 'The Old Man sleeps forever. The Hollow is quieter. Still freezing, but quieter.',
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
