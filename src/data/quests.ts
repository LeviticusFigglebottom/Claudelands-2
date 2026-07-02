// Quest chain data. Linear main-line for pass 2, structured so side quests
// are additive rows later. Objectives are declarative; game/quests.ts owns
// progression. All dialogue is original and lives here for the writers.

export type ObjectiveKind = 'goto' | 'kill_faction' | 'collect' | 'boss' | 'kill_elites' | 'notoriety';
export type QuestGiver = 'quibb' | 'zaza' | 'mayor' | 'brann' | 'mirelle' | 'okto';

/** Everyone who hands out work: display name, where they stand, greetings. */
export const GIVERS: Record<QuestGiver, { name: string; where: string; mapId: string; x: number; z: number; greetings: string[] }> = {
  quibb: {
    name: 'Foreman Quibb', where: 'in Gutterlight', mapId: 'claudelands', x: -3, z: 80,
    greetings: [
      'Quibb. Foreman. Retired, technically. Nobody told the paperwork.',
      'You again! Good. The paperwork multiplies when I\u2019m alone.',
    ],
  },
  zaza: {
    name: 'Madame Zaza', where: 'at Chatterjaw Landing', mapId: 'frosthollow', x: 3, z: 68,
    greetings: [
      'Zaza foresaw your visit, sugar. The crystal ball is a snow globe now. Budget cuts.',
      'The spirits say hello. They also say duck more.',
    ],
  },
  mayor: {
    name: 'Mayor Ottoline Brass', where: 'in Brasshaven', mapId: 'brasshaven', x: 0, z: -20,
    greetings: [
      'Welcome to MY city. I won it in a card game. The deck was mine too.',
      'Brasshaven runs on three things: brass, havens, and me.',
    ],
  },
  brann: {
    name: 'Brann the Adjuster', where: 'in Brasshaven', mapId: 'brasshaven', x: -14, z: 8,
    greetings: [
      'Brann. Claims adjuster, Helix Combine. Ex. VERY ex.',
      'I process three things: claims, grudges, and claims about grudges.',
    ],
  },
  mirelle: {
    name: 'Mirelle Two-Lines', where: 'in Brasshaven', mapId: 'brasshaven', x: 16, z: 10,
    greetings: [
      'Mirelle. I fished the Fathom for nine winters. The Fathom fished back.',
      'You smell like open water. That\u2019s not a compliment, sweetheart.',
    ],
  },
  okto: {
    name: 'Brother Okto', where: 'in Brasshaven', mapId: 'brasshaven', x: -6, z: 24,
    greetings: [
      'Okto. Bone-priest. Lapsed. The bones and I are on a break.',
      'The Boneyard remembers everyone. It has a WAITING LIST.',
    ],
  },
};

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
    faction?: 'rustborn' | 'helix' | 'frostborn' | 'kindled';
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
  /** Side quests: elite pack spawned at the target POI on accept. */
  elite?: { enemyId: string; count: number; x: number; z: number; mapId: string; levelOffset: number };
  /** Side quests: a quest-only legendary granted on completion. */
  rewardUnique?: string;
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
      'Gate’s open. Trash Mountain is that ugly lump down south — the Duke holds court at the summit.',
      'He’s big, he’s mean, and his crown is load-bearing. That last part is a TIP, contractor.',
      'De-throne him. Permanently. I’ll draft the invoice.',
    ],
    acceptLine: 'South! The mountain! Aim for the crown!',
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
  {
    id: 'q9_throat',
    name: 'Smoke Signals',
    giver: 'quibb',
    briefing: [
      'Contractor. Remember Helix Foundry 9? Decommissioned years back, down in the Cinder Throat.',
      'A Rustborn splinter cult — they call themselves THE KINDLED — moved in and lit the whole ravine.',
      'They worship the furnace. They feed it. Lately the smoke smells like... plans. Walk the Throat and see.',
    ],
    acceptLine: 'The Throat Gate node is live! South-southeast! Follow the smoke!',
    objective: { kind: 'goto', label: 'Enter the Cinder Throat', count: 1, markerX: 0, markerZ: 130, mapId: 'cinderthroat' },
    rewardCash: 800, rewardXp: 1200,
    completeLine: 'You\u2019re in the Throat. Everything is on fire in a very organized way. That\u2019s worse.',
    unlocksStation: 'Throat Gate',
  },
  {
    id: 'q10_kindling',
    name: 'De-Kindling',
    giver: 'quibb',
    briefing: [
      'The Kindled hold the whole ravine — camp, flats, kilns. One road, and they own every meter of it.',
      'Fight your way down the Throat. Twelve of them should unclog the path to the foundry.',
      'And contractor — they throw fire. Try to be somewhere else when it lands.',
    ],
    acceptLine: 'Twelve Kindled! Downhill! The scenic route!',
    objective: { kind: 'kill_faction', label: 'Kindled culled', count: 12, faction: 'kindled', markerX: -30, markerZ: -32, mapId: 'cinderthroat' },
    rewardCash: 1500, rewardXp: 2200, rewardItem: 'epic',
    completeLine: 'Twelve Kindled, extinguished. The road to the foundry is open. It is also on fire.',
  },
  {
    id: 'q11_saint',
    name: 'The Patron Saint of Arson',
    giver: 'quibb',
    briefing: [
      'End of the road. The Kindled bolted their god together from Foundry 9\u2019s smelter and it WALKS.',
      'They call it SAINT FURNACE. It calls everything else fuel.',
      'Rake out its firebox, contractor. That glowing door on its chest? That\u2019s a TIP.',
    ],
    acceptLine: 'The Foundry Court! Bottom of the Throat! Bring marshmallows or vengeance!',
    objective: { kind: 'boss', label: 'Saint Furnace raked out', count: 1, bossId: 'saint_furnace', markerX: 0, markerZ: -118, mapId: 'cinderthroat' },
    rewardCash: 4000, rewardXp: 5000, rewardItem: 'legendary',
    completeLine: 'The Saint is slag. The Kindled are unemployed. The Throat still smokes, but it\u2019s just smoke now.',
  },
  {
    id: 'q12_city',
    name: 'Key to the City',
    giver: 'quibb',
    briefing: [
      'Contractor... you de-throned a garbage king, decommissioned a company god, iced the weather, and raked out a saint.',
      'Word travels. BRASSHAVEN — the last real city, built in the hull of a beached mega-hauler — has opened its gate to you.',
      'Their Re-Constructor node is yours now. Go see the big lights. Buy something ridiculous. You\u2019ve earned it.',
    ],
    acceptLine: 'Brasshaven! The node\u2019s in your network! Try not to get charged for breathing!',
    objective: { kind: 'goto', label: 'Enter Brasshaven', count: 1, markerX: 0, markerZ: 0, mapId: 'brasshaven' },
    rewardCash: 5000, rewardXp: 4000,
    completeLine: 'Welcome to Brasshaven, contractor. The city already knows your name. It\u2019s on a poster.',
    unlocksStation: 'Brasshaven Gate',
  },
  {
    id: 'q13_notoriety',
    name: 'Local Notoriety',
    giver: 'mayor',
    briefing: [
      'So YOU\u2019RE the contractor. Heard about the saint. And the weather. And the filing cabinet.',
      'I have work \u2014 BIG work, off-world work \u2014 but this city runs on reputation, and yours is all imports.',
      'Do a job for one of my citizens first. Brann, Mirelle, Okto \u2014 they\u2019re all owed something by the wasteland. Then we talk.',
    ],
    acceptLine: 'Go be useful somewhere visible! The city is watching. Literally. I have cameras.',
    objective: { kind: 'notoriety', label: 'Local jobs finished', count: 1, markerX: 0, markerZ: 8, mapId: 'brasshaven' },
    rewardCash: 2000, rewardXp: 3000,
    completeLine: 'The city\u2019s talking about you. Mostly good things. The Mayor will see you now.',
  },
  {
    id: 'q14_signal',
    name: 'The Signal',
    giver: 'mayor',
    briefing: [
      'Three nights ago my relay caught a distress signal. Not from this planet, contractor. From VELDT MINOR.',
      'Somebody up there is still broadcasting, and whatever\u2019s making them broadcast is still chewing.',
      'I can get you there \u2014 IF we build a scrapship. Helix drive plating, out in the Slagflats. Salvage me five plates.',
    ],
    acceptLine: 'Five hull plates! The Slagflats! Try not to dent the good ones!',
    objective: { kind: 'collect', label: 'Scrapship plates salvaged', count: 5, faction: 'helix', markerX: 85, markerZ: -25, mapId: 'claudelands' },
    rewardCash: 8000, rewardXp: 8000, rewardItem: 'legendary',
    completeLine: 'The scrapship has a hull, a name (THE PAPERWEIGHT), and a heading: Veldt Minor. Wheels up soon, contractor.',
  },
];

// ---------------------------------------------------------------- side jobs
// Brasshaven citizens send you BACK into the wasteland: old landmarks, new
// (upgraded) trouble, one-of-a-kind rewards. Unlocked when the city opens.
export const SIDE_QUESTS: QuestDef[] = [
  {
    id: 'sq_boneyard',
    name: 'Repossession, With Teeth',
    giver: 'okto',
    briefing: [
      'The Boneyard\u2019s leviathan \u2014 I buried three congregations inside that ribcage. Sacred ground. WAS.',
      'A Rustborn crew moved in. Big ones. They\u2019re prying up the reliquary plates and WEARING them.',
      'Evict them. All of them. The bones will know, and the bones tip well.',
    ],
    acceptLine: 'The ribcage! West of the gully! Mind the sermon acoustics!',
    objective: { kind: 'kill_elites', label: 'Reliquary robbers evicted', count: 5, markerX: -85, markerZ: -25, mapId: 'claudelands' },
    elite: { enemyId: 'boilerbruiser', count: 5, x: -85, z: -25, mapId: 'claudelands', levelOffset: 3 },
    rewardCash: 3000, rewardXp: 3500, rewardUnique: 'leg_ossuary',
    completeLine: 'The ribcage is quiet again. Something in it exhaled. Take this \u2014 the bones insist.',
  },
  {
    id: 'sq_fathom',
    name: 'Nine Winters, One Grudge',
    giver: 'mirelle',
    briefing: [
      'Nine winters I fished the Frozen Fathom. Last winter something started fishing my crew.',
      'The Frostborn call the lake shore holy now. They put up TOTEMS. On MY dock.',
      'Clear the shore pack \u2014 the big ones \u2014 and I\u2019ll give you the only thing I saved from the ice.',
    ],
    acceptLine: 'Fathom Shore! East side of the Hollow! Don\u2019t stand on anything that breathes!',
    objective: { kind: 'kill_elites', label: 'Shore pack culled', count: 5, markerX: 40, markerZ: -14, mapId: 'frosthollow' },
    elite: { enemyId: 'avalanche_bruiser', count: 5, x: 40, z: -14, mapId: 'frosthollow', levelOffset: 3 },
    rewardCash: 3000, rewardXp: 3500, rewardUnique: 'leg_lake_effect',
    completeLine: 'The dock\u2019s mine again. Here \u2014 it came out of a fish. Don\u2019t ask which end.',
  },
  {
    id: 'sq_hauler',
    name: 'Claim Denied',
    giver: 'brann',
    briefing: [
      'Hauler HX-77. Crashed in the Slagflats. I filed the claim eleven years ago. Helix denied it. ELEVEN YEARS.',
      'Now their lattice wardens are back at the wreck, shredding the evidence \u2014 MY evidence.',
      'Scrap every warden at that crash site and the appeal writes itself. In shrapnel.',
    ],
    acceptLine: 'The crash site! East, past the crater! Aim for the paperwork!',
    objective: { kind: 'kill_elites', label: 'Site wardens scrapped', count: 4, markerX: 79, markerZ: -11, mapId: 'claudelands' },
    elite: { enemyId: 'lattice_warden', count: 4, x: 79, z: -11, mapId: 'claudelands', levelOffset: 4 },
    rewardCash: 3200, rewardXp: 3800, rewardUnique: 'leg_adjuster',
    completeLine: 'Eleven years of appeals, settled out of court. Take the settlement. It shoots.',
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
