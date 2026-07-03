// Quest chain data. Linear main-line for pass 2, structured so side quests
// are additive rows later. Objectives are declarative; game/quests.ts owns
// progression. All dialogue is original and lives here for the writers.

export type ObjectiveKind = 'goto' | 'kill_faction' | 'collect' | 'boss' | 'kill_elites' | 'notoriety';
export type QuestGiver = 'quibb' | 'zaza' | 'mayor' | 'brann' | 'mirelle' | 'okto' | 'juno' | 'peg';

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
  juno: {
    name: 'Dr. Juno Calla', where: 'at Mangrove Landing', mapId: 'veldt', x: 6, z: 80,
    greetings: [
      'You got my signal! Wonderful! Everything here is trying to eat me. Even the FLOWERS. ESPECIALLY the flowers.',
      'Dr. Juno Calla, xenobotany. Field note one: this planet is gorgeous. Field note two: RUN.',
    ],
  },
  peg: {
    name: 'Quartermistress Peg', where: 'at Driftwood Rest', mapId: 'veldt_shallows', x: -66, z: 76,
    greetings: [
      'Peg. Quartermistress of the PELICAN. Ship’s in two pieces, crew’s in a MOOD, but the paperwork survived. It always does.',
      'Welcome to Driftwood Rest. Occupancy: me, four crabs, and whatever you are. Wipe your feet.',
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
    faction?: 'rustborn' | 'helix' | 'frostborn' | 'kindled' | 'verdant' | 'brine' | 'hollow';
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
      'I can get you there \u2014 IF we build a scrapship. East past the Slagflats there\u2019s a canyon where the old haulers came down: THE RUST GULCH. Whole hulls, rusting in the wind.',
      'Strip me FIVE drive plates off the wrecks out there. Mind the scavvers. And if something in that gulch has wheels \u2014 it\u2019s faster than you are.',
    ],
    acceptLine: 'East of the Slagflats! Through the gulch gate! Five plates, and DRIVE, don\u2019t walk!',
    objective: { kind: 'collect', label: 'Hull plates salvaged from the wrecks', count: 5, markerX: 112, markerZ: 156, mapId: 'rustgulch' },
    rewardCash: 8000, rewardXp: 8000, rewardItem: 'legendary',
    completeLine: 'The scrapship has a hull, a name (THE PAPERWEIGHT), and a heading: Veldt Minor. Wheels up soon, contractor.',
    unlocksStation: 'Gulch Gate',
  },
  {
    id: 'q15_wheelsup',
    name: 'Wheels Up',
    giver: 'mayor',
    briefing: [
      'THE PAPERWEIGHT is fueled, blessed, and only mildly haunted. She\u2019s parked on the west pad.',
      'The signal\u2019s coming from a jungle shelf on Veldt Minor \u2014 a Dr. Juno Calla, xenobotanist. Expedition of nine. Now an expedition of one, and counting down.',
      'Board the ship, contractor. Bring her home. Or at least bring back whatever\u2019s left of the paperwork.',
    ],
    acceptLine: 'The west pad! Try not to scratch the ship. It\u2019s load-bearing scratches only!',
    objective: { kind: 'goto', label: 'Reach Mangrove Landing on Veldt Minor', count: 1, markerX: 0, markerZ: 88, mapId: 'veldt' },
    rewardCash: 3000, rewardXp: 5000,
    completeLine: 'Boots on Veldt Minor. The air is 90% humidity and 10% screaming birds.',
    unlocksStation: 'Mangrove Landing',
  },
  {
    id: 'q16_garden',
    name: 'The Loudest Garden',
    giver: 'juno',
    briefing: [
      'The locals call themselves THE VERDANT. They were fine \u2014 standoffish, big on drums \u2014 until the bloom season came early.',
      'Now they\u2019re CRAZED. They took my whole expedition to the deep groves. For \u201cplanting.\u201d I did not stay to learn what that means.',
      'Thin the war parties around the landing \u2014 ten should quiet the drums \u2014 and then we can talk about getting my people back.',
    ],
    acceptLine: 'Ten of them! And if a flower asks you ANYTHING, do not answer!',
    objective: { kind: 'kill_faction', label: 'Verdant war party culled', count: 10, faction: 'verdant', markerX: -60, markerZ: 4, mapId: 'veldt' },
    rewardCash: 4000, rewardXp: 6000, rewardItem: 'epic',
    completeLine: 'The drums stopped. The jungle is still louder than a foundry, but now it\u2019s just... jungle.',
  },
  {
    id: 'q17_drums',
    name: 'Where the Drums Go',
    giver: 'juno',
    briefing: [
      'I triangulated the war parties\u2019 routes. They all funnel through the deep thicket south of the Overgrowth \u2014 into a place the old maps call THE TANGLE.',
      'That\u2019s where they took my people. That\u2019s where the drumming goes at night.',
      'The thicket parts if you\u2019re rude enough. Be rude. I\u2019ll patch your suit\u2019s canopy filters from here.',
    ],
    acceptLine: 'South, past the Overgrowth! If the leaves start harmonizing, KEEP WALKING!',
    objective: { kind: 'goto', label: 'Push through into the Tangle', count: 1, markerX: 0, markerZ: 116, mapId: 'veldt_tangle' },
    rewardCash: 4500, rewardXp: 6500,
    completeLine: 'You\u2019re inside. The light is green, the air chews, and something enormous is humming downhill.',
    unlocksStation: 'Tangle Mouth',
  },
  {
    id: 'q18_names',
    name: 'Nine Names',
    giver: 'juno',
    briefing: [
      'My expedition wore Helix dog tags \u2014 nine names, nine tags. The Verdant took them as TROPHIES.',
      'The war parties in the Tangle wear them strung on cord. It\u2019s ghoulish and, frankly, unhygienic.',
      'Bring me four tags. I\u2019m not asking for miracles. I\u2019m asking for POSTAGE.',
    ],
    acceptLine: 'Four tags! Check the loud ones \u2014 rank follows volume out here!',
    objective: { kind: 'collect', label: 'Expedition tags recovered', count: 4, faction: 'verdant', markerX: -44, markerZ: 48, mapId: 'veldt_tangle' },
    rewardCash: 5500, rewardXp: 7500, rewardItem: 'epic',
    completeLine: 'Four tags. Four names. Juno reads each one out loud, twice, and pockets them gently.',
  },
  {
    id: 'q19_bloom',
    name: 'The Early Bloom',
    giver: 'juno',
    briefing: [
      'It\u2019s not a chief driving them. It\u2019s a GOD \u2014 a garden god the Verdant call THE BLOOM MOTHER, and she woke four months early. Angry. Hungry. In CHARGE.',
      'My people are staked around her court as... fertilizer-in-waiting. They\u2019re alive. She likes her offerings fresh.',
      'Rake that flower down to the roots, contractor. The seed-heart in the crown \u2014 that\u2019s a TIP.',
    ],
    acceptLine: 'The Bloom Court! Bottom of the Tangle! Aim for the glow and DO NOT smell anything she offers you!',
    objective: { kind: 'boss', label: 'The Bloom Mother pruned', count: 1, bossId: 'bloom_mother', markerX: 0, markerZ: -110, mapId: 'veldt_tangle' },
    rewardCash: 9000, rewardXp: 10000, rewardItem: 'legendary',
    completeLine: 'The Bloom Mother is compost. Juno\u2019s people are cut loose \u2014 shaky, sunburnt, alive. Eight of nine. She\u2019ll take it.',
  },
  // ---- ARC: SHIPWRECK SHALLOWS (the lagoon)
  {
    id: 'q20_tidechart',
    name: 'Low Tide, Long Ledger',
    giver: 'juno',
    briefing: [
      'With the Bloom Mother gone the tide charts finally make SENSE again \u2014 the crossing to the east lagoon is open. Which matters, because my supply barge went down out there five months ago. The PELICAN. Full expedition resupply. Never arrived.',
      'Last night somebody lit a signal fire on that shore. Regulation Helix distress spacing. Whoever\u2019s burning it knows procedure.',
      'Walk the beach crossing east of the landing and find that fire, contractor. If any of my cargo is dry, I want it. If any of that crew is alive, I want that MORE.',
    ],
    acceptLine: 'East shore, past the palms! Follow the smoke, and do NOT trust the surf \u2014 it\u2019s been WRONG lately!',
    objective: { kind: 'goto', label: 'Reach Driftwood Rest in the Shallows', count: 1, markerX: -70, markerZ: 80, mapId: 'veldt_shallows' },
    rewardCash: 5000, rewardXp: 7000,
    completeLine: 'The fire\u2019s keeper is one Quartermistress Peg \u2014 dry, furious, and inventorying a beach. Juno wants updates. Peg wants LABOR.',
  },
  {
    id: 'q21_crewcut',
    name: 'Overtime, Waived',
    giver: 'peg',
    briefing: [
      'Here\u2019s the situation, sailor. The PELICAN broke her back on the shoals and my crew went down with the stern. Then they came back UP. Still in uniform. Still on shift. Still hauling cargo \u2014 the wrong way. INTO the sea.',
      'I\u2019ve re-salvaged the same crate nine times. NINE. The tide keeps receipts and so do I.',
      'They\u2019re past a medic\u2019s help \u2014 trust me, I checked, it cost me a rowboat. Retire the shift, contractor. Twelve of them should break the work rhythm.',
    ],
    acceptLine: 'The Hullgrave and the Pans! And if something says "back to work" \u2014 that\u2019s NOT me talking!',
    objective: { kind: 'kill_faction', label: 'Drowned crew retired', count: 12, faction: 'brine', markerX: 6, markerZ: -36, mapId: 'veldt_shallows' },
    rewardCash: 6000, rewardXp: 8000, rewardItem: 'epic',
    completeLine: 'Twelve punch-outs, permanent. The hauling rhythm on the beach has audibly slowed. Peg is updating the muster roll with a nail.',
  },
  {
    id: 'q22_manifest',
    name: 'The Wet Manifest',
    giver: 'peg',
    briefing: [
      'Now the real work. Dr. Calla\u2019s resupply \u2014 five sealed expedition crates, stamped HELIX-9, soaked through but watertight. The crew treats them like holy cargo. Carries them in PROCESSION.',
      'I want them back on dry sand. All five. They\u2019re strapped to the biggest, wettest backs out there.',
      'Pry them loose however you like. I\u2019ll be here, building a fifth chair out of a fourth boat.',
    ],
    acceptLine: 'Five crates! Follow the processions \u2014 and lift with your LEGS, they\u2019re full of science!',
    objective: { kind: 'collect', label: 'Expedition crates recovered', count: 5, faction: 'brine', markerX: 6, markerZ: -36, mapId: 'veldt_shallows' },
    rewardCash: 7000, rewardXp: 9000, rewardItem: 'epic',
    completeLine: 'Five crates, dry-ish, accounted for. Juno\u2019s instruments survived. Peg\u2019s opinion of Helix packaging has, grudgingly, improved.',
  },
  {
    id: 'q23_admiral',
    name: 'Striking the Colors',
    giver: 'peg',
    briefing: [
      'You\u2019ve met the crew. Now meet MANAGEMENT. Captain Anchorhead went down lashed to the wheel, and the sea \u2014 the sea PROMOTED him. He walks the Anchorage now with the bower anchor on his back, taking salutes from things with too many legs.',
      'Every drowned deckhand on this beach clocks in for HIM. Strike the Admiral and the whole shift ends.',
      'He was a good captain, contractor. Make it quick, make it loud, and bring me his lantern. I\u2019ll keep it lit. Tradition.',
    ],
    acceptLine: 'The Anchorage, east shore! Salute first \u2014 he appreciates FORM \u2014 then open fire!',
    objective: { kind: 'boss', label: 'Admiral Anchorhead relieved of command', count: 1, bossId: 'admiral_anchorhead', markerX: 52, markerZ: 56, mapId: 'veldt_shallows' },
    rewardCash: 10000, rewardXp: 12000, rewardItem: 'legendary',
    completeLine: 'The Admiral is dismissed. The beach went QUIET \u2014 first ebb tide in five months that didn\u2019t carry cargo. Peg hung his lantern at Driftwood Rest and saluted it. Once.',
  },
  // ---- ARC: THE HOLLOWDEEP (the cave)
  {
    id: 'q24_seismic',
    name: 'The Hum Below',
    giver: 'juno',
    briefing: [
      'Peg\u2019s crates saved my expedition \u2014 and buried it in a NEW problem. My seismographs came back online and they are SCREAMING. Rhythmic tremors, under the west jungle. Not tectonic. Tectonics don\u2019t keep a WORK TEMPO.',
      'The old survey calls it the Hollowdeep \u2014 a Helix bore mine, sealed sixty years ago with the dig crew still logged on shift. Nobody ever filed them out.',
      'And contractor \u2014 the tremor that dragged Peg\u2019s barge chain? Same signature. The thing under this island has been DIGGING TOWARD THE SEA. Get down there.',
    ],
    acceptLine: 'The cave mouth, west of the Overgrowth! Take a light! Take TWO! Take a third for THROWING!',
    objective: { kind: 'goto', label: 'Descend into the Hollowdeep', count: 1, markerX: 0, markerZ: 112, mapId: 'veldt_caves' },
    rewardCash: 6000, rewardXp: 8000,
    completeLine: 'You\u2019re in. The dark down here has LANTERNS, and the lanterns are WALKING. Juno\u2019s seismograph is doing a drumroll.',
  },
  {
    id: 'q25_nightshift',
    name: 'Ending the Night Shift',
    giver: 'juno',
    briefing: [
      'Your suit telemetry is a HORROR NOVEL. Those pale things in the grove \u2014 that\u2019s the dig crew, contractor. Sixty years under a singing seam changes a workforce. They never stopped mining. They just stopped INVOICING.',
      'They\u2019re hauling ore to something below \u2014 tribute, tempo, whatever that hum wants. Thin the shift. Twelve should break the rhythm section.',
      'And whatever the wisps are \u2014 do NOT let them read your badge.',
    ],
    acceptLine: 'Twelve of the Undergrown! Grove and Cryptworks! If the hum gets CATCHY, hum something ELSE!',
    objective: { kind: 'kill_faction', label: 'Undergrown shift broken', count: 12, faction: 'hollow', markerX: 38, markerZ: -30, mapId: 'veldt_caves' },
    rewardCash: 7000, rewardXp: 9500, rewardItem: 'epic',
    completeLine: 'Twelve clocked out. The hum below dropped half a step \u2014 Juno says that\u2019s either grief or a KEY CHANGE.',
  },
  {
    id: 'q26_motherlode',
    name: 'The Mother Lode',
    giver: 'juno',
    briefing: [
      'There it is. The seam\u2019s singer. The survey\u2019s final page just calls it THE MOTHER LODE \u2014 the thing the dig crew found on level nine and started FEEDING instead of filing.',
      'Sixty years of ore tribute grew it a crystal crown, and the crown is load-bearing \u2014 my scans show the resonance node right at the top. That\u2019s a TIP.',
      'It dug at the Tangle. It dragged Peg\u2019s barge down by the CHAIN. It is not staying below, contractor. Close the shift. All of it.',
    ],
    acceptLine: 'The Lode Court! Bottom of the deep! Shoot the crown and do NOT sing along!',
    objective: { kind: 'boss', label: 'The Mother Lode closed out', count: 1, bossId: 'mother_lode', markerX: 0, markerZ: -112, mapId: 'veldt_caves' },
    rewardCash: 14000, rewardXp: 16000, rewardItem: 'legendary',
    completeLine: 'The Mother Lode cracked like a geode and the hum STOPPED \u2014 planet-wide, mid-note. Juno logged the silence. Peg\u2019s tide came in clean. Somewhere under all that quiet, sixty years of shift-work finally ended.',
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
  {
    id: 'sq_undertow',
    name: 'What the Sea Owes Me',
    giver: 'mirelle',
    briefing: [
      'Word came up the wire: there’s a beach on Veldt Minor where the drowned WALK. Nine winters I begged the Fathom to give my crew back, and some jungle lagoon gets them WHOLESALE?',
      'The big ones — the anchor-draggers — they’re wearing deep-water rig. MY fleet’s pattern. Explain THAT.',
      'Put four of them down and check the rig tags. Whatever the sea owes me, collect it. I pay finder’s rates.',
    ],
    acceptLine: 'The Shallows! Off-world, east lagoon! If the water calls your name — new rule — DON’T ANSWER!',
    objective: { kind: 'kill_elites', label: 'Anchor-draggers put down', count: 4, markerX: -20, markerZ: -50, mapId: 'veldt_shallows' },
    elite: { enemyId: 'anchor_hulk', count: 4, x: -20, z: -50, mapId: 'veldt_shallows', levelOffset: 8 },
    rewardCash: 5000, rewardXp: 6000, rewardUnique: 'leg_undertow',
    completeLine: 'The tags came back. Not her fleet — nobody’s fleet. Mirelle stared at them a long time, then paid double. "For the crews," she said. Don’t ask which ones.',
  },
  {
    id: 'sq_wrongbones',
    name: 'An Ossuary Complaint',
    giver: 'okto',
    briefing: [
      'The bones and I are on a break. The bones under VELDT MINOR did not get the memo.',
      'A cave full of rollers — armored things wearing their skeletons OUTSIDE, which is showing off — has started grinding up the old dig crew’s remains for... aggregate. Structural bone. UNSANCTIONED structural bone.',
      'Crack four of the big rollers and scatter what they’ve hoarded. The dead down there clocked out sixty years ago. Let them STAY out.',
    ],
    acceptLine: 'The Hollowdeep! Bring a light and an APOLOGY — you’ll know when to use it!',
    objective: { kind: 'kill_elites', label: 'Deep rollers cracked', count: 4, markerX: 44, markerZ: -66, mapId: 'veldt_caves' },
    elite: { enemyId: 'deep_roller', count: 4, x: 44, z: -66, mapId: 'veldt_caves', levelOffset: 9 },
    rewardCash: 5000, rewardXp: 6000, rewardUnique: 'leg_lodestone',
    completeLine: 'The rollers are gravel and the hoard is scattered. Okto says the cave exhaled. He also says take this — the bones down there INSISTED.',
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
