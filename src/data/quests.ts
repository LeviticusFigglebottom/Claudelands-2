// Quest chain data. Linear main-line for pass 2, structured so side quests
// are additive rows later. Objectives are declarative; game/quests.ts owns
// progression. All dialogue is original and lives here for the writers.

export type ObjectiveKind = 'goto' | 'kill_faction' | 'collect' | 'boss' | 'kill_elites' | 'notoriety';
export type QuestGiver = 'quibb' | 'zaza' | 'mayor' | 'brann' | 'mirelle' | 'okto' | 'juno' | 'peg' | 'faro' | 'wick' | 'coil' | 'bet';

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
  faro: {
    name: 'Keeper Faro', where: 'at the Last Light', mapId: 'vitra', x: -6, z: 80,
    greetings: [
      'Faro. I keep the light. The light keeps everything else.',
      'Welcome back to the bright side of nowhere.',
    ],
  },
  wick: {
    name: 'Wick', where: 'at the Bothy on the Unlit Mile', mapId: 'vitra_mile', x: 4, z: -16,
    greetings: [
      'A VISITOR! Sit down, sit — mind the lamps, they bite when they’re hungry. I’m Wick. Like the middle of a candle. It’s a WORK name.',
      'Back again! The dark talked about you all night. Rude things. You must be doing WONDERFULLY.',
    ],
  },
  coil: {
    name: 'Forewoman Coil', where: 'at the Jarworks on Voltholm', mapId: 'voltholm', x: -4, z: 80,
    greetings: [
      'Coil. Forewoman, Jarworks. I bottle the weather and the weather resents it. We manage.',
      'Contractor. Good timing — the sky just invoiced us again and I am NOT paying.',
    ],
  },
  bet: {
    name: 'Barometer Bet', where: 'at the Stilling Gate in the Becalmed', mapId: 'volt_still', x: -6, z: 86,
    greetings: [
      'Bet. Forecast officer, Voltholm Harvest Authority. Today’s forecast: nothing. Same as yesterday. Same as the last seven thousand yesterdays. I keep EXCELLENT records.',
      'Shhh. Not for safety. Habit. Twenty years in a place with no weather makes a person respect the volume knob.',
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
    faction?: 'rustborn' | 'helix' | 'frostborn' | 'kindled' | 'verdant' | 'brine' | 'hollow' | 'vitrified' | 'galebound';
    bossId?: string;
    markerX?: number; markerZ?: number;
    mapId?: string;                // which map the marker/boss lives on (default claudelands)
    /** Collect quests: what the dropped quest item calls itself. */
    itemName?: string;
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
  /** Fetch quests: collecting fills the bag, but the quest only completes
   *  standing in front of the giver — a real return trip, no holocall. */
  returnToGiver?: boolean;
  /** Completing this quest IS the story's ending — roll victory here; later
   *  quests are the post-game frontier and never re-trigger it. */
  finale?: boolean;
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
      'I have work \u2014 BIG work, off-world work \u2014 but before I hand a stranger my ship budget, I want to see you help MY people with my own eyes.',
      'Three of my citizens have jobs posted \u2014 Brann, Mirelle, Brother Okto. The purple marks, right here in the city. Pick ONE, finish it, and come back. That\u2019s the whole ask.',
    ],
    acceptLine: 'Help one of my citizens \u2014 any of the purple marks! Do it properly. The city talks, and I listen.',
    objective: { kind: 'notoriety', label: 'A citizen helped (finish any side job)', count: 1, markerX: 0, markerZ: 8, mapId: 'brasshaven' },
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
    objective: { kind: 'collect', label: 'Drive plates for the scrapship’s hull', count: 5, markerX: 30, markerZ: 90, mapId: 'rustgulch' },
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
      'Now the real work. Dr. Calla\u2019s resupply \u2014 five sealed expedition crates, stamped HELIX-9, soaked through but watertight. The tide scattered them from the Hullgrave to the Pans when the stern went under.',
      'The crew stacks them in little shrines wherever they wash up. Beacons still blinking. They won\u2019t carry them far \u2014 but they WILL object to you taking them.',
      'Find all five and HAUL them back to me at Driftwood Rest. No shortcuts, no radio hand-offs \u2014 I sign for cargo in PERSON.',
    ],
    acceptLine: 'Five crates, back to THIS desk! Follow the beacons \u2014 and lift with your LEGS, they\u2019re full of science!',
    objective: { kind: 'collect', label: 'Expedition crates hauled back to Peg', count: 5, markerX: 6, markerZ: -36, mapId: 'veldt_shallows' },
    returnToGiver: true,
    rewardCash: 7000, rewardXp: 9000, rewardItem: 'epic',
    completeLine: 'Five crates, dry-ish, signed for. Juno\u2019s instruments survived. Peg\u2019s opinion of Helix packaging has, grudgingly, improved.',
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
    finale: true,
    rewardCash: 14000, rewardXp: 16000, rewardItem: 'legendary',
    completeLine: 'The Mother Lode cracked like a geode and the hum STOPPED \u2014 planet-wide, mid-note. Juno logged the silence. Peg\u2019s tide came in clean. Somewhere under all that quiet, sixty years of shift-work finally ended.',
  },
  {
    id: 'q27_landfall',
    name: 'The Answering Light',
    giver: 'juno',
    briefing: [
      'Contractor. The night the hum stopped, every dish on this planet caught the same thing: a lighthouse. Not a metaphor — an actual, sweeping, STUBBORN lighthouse beam, from the third rock out. Vitra Null. The charts call it uninhabitable. The beam calls the charts LIARS.',
      'It’s been dark out there for two hundred years. Something kept one light burning through all of it, and the second this system went quiet, it started SIGNALING.',
      'The Paperweight’s fueled. Go knock on the lighthouse. Politely. Whatever kept that light alive has outlasted everything else on that glass.',
    ],
    acceptLine: 'Vitra Null, contractor! Land at the light! And bring a coat — the readings say the NIGHT there has opinions!',
    objective: { kind: 'goto', label: 'Make landfall at the Last Light', count: 1, markerX: 0, markerZ: 88, mapId: 'vitra' },
    rewardCash: 8000, rewardXp: 10000,
    completeLine: 'You’re down. That beam overhead — that’s two centuries of somebody REFUSING to let it end. Go say hello.',
  },
  {
    id: 'q28_glasswalk',
    name: 'The Glass Is Walking',
    giver: 'faro',
    briefing: [
      'So the sky finally sent somebody. Two hundred years I’ve kept this lamp lit, and you’re the first thing it’s pulled in that isn’t made of GLASS.',
      'Here’s your welcome brief: the shards out there walk. The Chimefield sings them awake and the Shardsea marches them around, and every year the dark between the lamps gets a little BOLDER.',
      'I don’t need a hero. I need MAINTENANCE. Thin the glass — ten of them — and the lamps stay lit another season. That’s the whole job. That’s always been the whole job.',
    ],
    acceptLine: 'Ten of the vitrified! Aim for the shine — and DON’T stand where they shatter!',
    objective: { kind: 'kill_faction', label: 'Walking glass swept', count: 10, faction: 'vitrified', markerX: -70, markerZ: -10, mapId: 'vitra' },
    rewardCash: 9000, rewardXp: 12000, rewardItem: 'epic',
    completeLine: 'Ten panes down and the night got QUIETER. The lamps hold. You’ll do, contractor. The dark and I have a long ledger — plenty of work left in it.',
  },
  // ---- ARC: THE UNLIT MILE (the sister lamp)
  {
    id: 'q29_darkmile',
    name: 'The Sister Lamp',
    giver: 'faro',
    briefing: [
      'Since you’re still standing, here’s the page of the ledger I don’t read out loud. There were TWO lights on this rock. Mine, and Lampfall Spire — a mile down the old coast road. Keeper Morrow’s lamp.',
      'Two hundred years ago the glass started walking, and Morrow… stopped feeding his light. Didn’t die. Didn’t leave. Just decided the dark was less WORK. The whole mile of street lamps between us went out in one night. I heard it happen. It sounded like applause.',
      'Something on that mile is still ringing, and my lamp flickers every time it does. Walk the Unlit Mile and find out what’s left down there. Take the south road past the Basin — and contractor, once you pass the Gloaming Gate, the only light you’ll meet is the kind you BRING.',
    ],
    acceptLine: 'The Gloaming Gate node is yours! South past the Basin — and keep your muzzle flash HANDY, it counts as a lamp!',
    objective: { kind: 'goto', label: 'Walk the Unlit Mile', count: 1, markerX: 0, markerZ: 112, mapId: 'vitra_mile' },
    rewardCash: 9000, rewardXp: 12000,
    completeLine: 'You’re on the mile. Dead lamps in rows, like a parade that never got dismissed. And halfway down — one window still burning. That’s not Morrow. Go see who it is.',
    unlocksStation: 'Gloaming Gate',
  },
  {
    id: 'q30_lamplighter',
    name: 'Rounds',
    giver: 'wick',
    briefing: [
      'You walked the ROWS? In the DARK? And you’ve still got both your… yes, both. Wonderful. Sit. I’m Wick — Keeper Morrow’s apprentice. Was. AM? Tense is hard when you’re two hundred and still on probation.',
      'The night the lamp died I was halfway up a ladder with a wick-trimmer. The glass took my arm to the shoulder — see, it chimes in cold weather now, very festive — and I’ve held this bothy ever since. Me, forty salvaged lamps, and a kettle with opinions.',
      'The Rows out there fill up with walking glass every night, and every night my lamps buy me one more morning. Help me with my rounds: put ten of them down before they crowd the light. That’s the job. That’s been the job for two centuries. It’s nice to finally have STAFF.',
    ],
    acceptLine: 'Ten of them, any shape! And if one of them rings like a doorbell — DON’T ANSWER IT!',
    objective: { kind: 'kill_faction', label: 'The Rows swept for Wick', count: 10, faction: 'vitrified', markerX: -46, markerZ: 50, mapId: 'vitra_mile' },
    rewardCash: 10000, rewardXp: 13000, rewardItem: 'epic',
    completeLine: 'Ten down, and the bothy got a whole quiet hour. Wick made tea to celebrate. The kettle objected. You’re on the roster now — there’s a hook for your coat and everything.',
  },
  {
    id: 'q31_cinders',
    name: 'Fuel for the Forty',
    giver: 'wick',
    briefing: [
      'Now the awkward part of lamp-keeping on a planet with no oil, no wood, and no sun: FUEL. My forty lamps burn living cinders — the little cores the walking glass carries where a heart would go. Morrow’s design, ironically. He was BRILLIANT before he was… dim.',
      'The strongest cores are down in the Echo Organ, where the big glass goes to hum. Crack the vitrified open and the cinder pops right out, still warm, slightly indignant.',
      'Bring me FOUR — and hand them over HERE, at the bothy. Cinders go out if you dawdle, and I do not have the wardrobe for a second one-armed sprint through the dark.',
    ],
    acceptLine: 'Four living cinders, back to THIS table! Cup your hands around them — they like to feel IMPORTANT!',
    objective: { kind: 'collect', label: 'Living cinders hauled back to Wick', count: 4, faction: 'vitrified', markerX: 46, markerZ: -34, mapId: 'vitra_mile' },
    returnToGiver: true,
    rewardCash: 11000, rewardXp: 14000, rewardItem: 'epic',
    completeLine: 'Four cinders, delivered warm. The forty lamps are fat and bright for the first time in a decade — Wick walked the yard twice just to look at them. “Morrow used to say a fed lamp forgives you anything,” they said. “Let’s go test that.”',
  },
  {
    id: 'q32_secondlamp',
    name: 'Lights Out',
    giver: 'faro',
    briefing: [
      'Wick’s wire reached me — first signal off that mile in two hundred years. A fed lamp, a live apprentice, and a name I’d filed under GONE. So here’s the last entry, contractor, and I’ll say it plain.',
      'Morrow is still down there. The mile’s glass tolls on HIS rounds — he walks the spire base every night with his lantern out, winding the dark like I wind my light. My opposite number. My old friend. THE UNKEEPER, if you want what the glass calls him.',
      'A keeper’s shift only ends one way, and he’s two centuries past his. Go down to Lampfall Spire and end it. Aim for the lantern on his crook — it’s empty, it’s cold, and it is STILL the only thing he’d hate to lose.',
    ],
    acceptLine: 'Lampfall Spire, the bottom of the mile! Snuff him gently if you can, LOUDLY if you can’t!',
    objective: { kind: 'boss', label: 'The Unkeeper’s shift ended', count: 1, bossId: 'unkeeper', markerX: 0, markerZ: -114, mapId: 'vitra_mile' },
    rewardCash: 16000, rewardXp: 18000, rewardItem: 'legendary',
    completeLine: 'The Unkeeper is out. The mile went silent — then, one by one, the Snuffed Rows flickered ON, two hundred years of stored dark paying its bill. Wick is already up a ladder. Faro logged one line in the ledger: “Shift covered. Sleep well, Morrow.”',
  },
  // ---- PLANET 4: VOLTHOLM (the storm that answers)
  {
    id: 'q33_stormcall',
    name: 'The Sky That Answers',
    giver: 'faro',
    briefing: [
      'One more page, contractor, and it isn’t mine. The night my beam went out to the system, something answered from the FOURTH rock. Not a lighthouse. A work signal — a repeating crew-call, the kind you send when the shift is drowning and nobody’s coming.',
      'Voltholm. Storm-harvest world. The charts say the colony sold bottled lightning to half the sector, then went quiet twenty years back. The signal says somebody is still bottling.',
      'The Paperweight knows the way. Fly into the weather and find whoever is still clocking in under that sky. And contractor — the readings show the storm there runs on a SCHEDULE. Learn it fast.',
    ],
    acceptLine: 'The fourth rock, contractor! Follow the crew-call down — and if the sky starts SINGING, find something tall and metal that isn’t YOU!',
    objective: { kind: 'goto', label: 'Make landfall at the Jarworks', count: 1, markerX: 0, markerZ: 88, mapId: 'voltholm' },
    rewardCash: 10000, rewardXp: 13000,
    completeLine: 'Down through the thunderhead in one piece. The Jarworks is lit, racked, and RUNNING — and the woman on the landing pad has been expecting somebody for twenty years. Not you specifically. Anybody.',
    unlocksStation: 'Jarworks Landing',
  },
  {
    id: 'q34_windwork',
    name: 'Overtime in the Wind',
    giver: 'coil',
    briefing: [
      'So the crew-call finally caught a live one. Coil. Forewoman of the Jarworks, last supervisor standing on this entire rock, and I will skip to the part you can shoot.',
      'My harvest crews wired themselves into the weather to work the storms hands-free. Clever, right up until the storm started doing the MANAGING. Now they’re the Galebound — my own people, out on the flats, harvesting nothing, forever, and violently opposed to backpay.',
      'The Gale Flats crews are the worst of it. Thin them out — ten of them — so my last live linemen can walk their own routes again. Watch the wind channels: the gale shoves EVERYTHING, and it does not check whose side you’re on.',
    ],
    acceptLine: 'Ten Galebound off my flats! Lean INTO the crosswind and shoot DOWNWIND, it’s basic site safety!',
    objective: { kind: 'kill_faction', label: 'Galebound crews thinned', count: 10, faction: 'galebound', markerX: -75, markerZ: -5, mapId: 'voltholm' },
    rewardCash: 11000, rewardXp: 14000, rewardItem: 'epic',
    completeLine: 'Ten of the wind’s employees terminated, and the flats went quiet enough to hear the rods hum. Coil crossed ten names off a twenty-year-old crew roster. She didn’t say anything for a while. Then: “Back to work.”',
  },
  {
    id: 'q35_bottling',
    name: 'Bottling Day',
    giver: 'coil',
    briefing: [
      'Here’s the economics of Voltholm: the jars keep the town lit, the town keeps the rods fed, the rods keep the SKYFALL off our heads. No jars, no town. And my shelves are down to the decorative ones.',
      'The Galebound still carry their old harvest jars — full ones, riding their rigs like hearts. The Conductors on the Row have the freshest stock; they call it TITHE now, because everything out there found religion except the weather.',
      'Crack four of them open and bring the jars back HERE, to the racks. Intact, please. A dropped storm jar doesn’t break, it FILES A COMPLAINT, at speed, in every direction.',
    ],
    acceptLine: 'Four full jars, back to my racks! Carry them like they’re angry — because they ARE!',
    objective: { kind: 'collect', label: 'Storm jars racked at the Jarworks', count: 4, faction: 'galebound', markerX: 70, markerZ: -15, mapId: 'voltholm', itemName: 'Storm Jar' },
    returnToGiver: true,
    rewardCash: 12000, rewardXp: 15000, rewardItem: 'epic',
    completeLine: 'Four jars racked and humming, and the Jarworks lights stopped flickering for the first time in a season. Coil tapped each jar once, like saying a name. “Bottling day,” she said. “Best day on the calendar. Used to be a hundred of us on it.”',
  },
  {
    id: 'q36_abbot',
    name: 'The Collection Plate',
    giver: 'coil',
    briefing: [
      'Now the part I’ve been dreading out loud. My old shift supervisor — Brother Aldan, ran the capacitor banks, kindest man on the payroll — wired himself DEEPEST when the storm took the crews. The banks called him. He answered. Twenty years on, they call him THE STATIC ABBOT, and the Capacitorium is his chapel.',
      'He’s not harvesting the storm anymore. He’s TAKING CONFESSION from it. Every jar my crews lose, every bolt the rods eat, the tithe rolls south to his banks — and lately his sermons have been walking my linemen off their routes, straight into the wind.',
      'Go south to the Capacitorium and close the account. Aim for the halo — the capacitor ring over his head. It was his hard hat, once. It’s the only part of him the storm hasn’t bought.',
    ],
    acceptLine: 'The Capacitorium, due south! When the sky marks the ground — MOVE, that’s not decoration, that’s his OPENING PRAYER!',
    objective: { kind: 'boss', label: 'The Static Abbot unplugged', count: 1, bossId: 'static_abbot', markerX: -15, markerZ: -100, mapId: 'voltholm' },
    rewardCash: 15000, rewardXp: 17000, rewardItem: 'legendary',
    completeLine: 'The halo cracked, the banks sighed twenty years of stored charge into the dirt, and the Static Abbot sat down like a man at the end of a very long shift. Coil filed it as a retirement. The storm, for one whole night, forgot to collect.',
  },
  {
    id: 'q37_eyewall',
    name: 'The Last Mooring',
    giver: 'coil',
    briefing: [
      'The storm’s got one hand left, and it’s the one that took the crews in the first place. GALE PRIME. Site manager, first shift, the one who signed the wiring order twenty years ago. The weather liked the chain of command so much it PROMOTED itself into him.',
      'He cut every mooring that held him to the ground — every one but the last shackle, bolted to his chest, and my name is on the requisition slip for it. He keeps it. I’ve stopped asking myself why.',
      'He holds the Eyewall, east past the crater rim, where the storm keeps its heart. End the shift, contractor. All of it. Shoot the shackle — if any part of the man I hired is still in there, that’s where he’s holding on.',
    ],
    acceptLine: 'The Eyewall, east! When he breathes IN, hold on to the planet — and when he breathes OUT, SHOOT!',
    objective: { kind: 'boss', label: 'Gale Prime brought to ground', count: 1, bossId: 'gale_prime', markerX: 100, markerZ: -85, mapId: 'voltholm' },
    rewardCash: 20000, rewardXp: 22000, rewardItem: 'legendary',
    completeLine: 'The last mooring snapped and the wind fell out of him like a crew going home. The Eyewall opened — actual sky, actual sun, the first anyone on Voltholm has seen in twenty years. Coil stood in it, checked the weather out of habit, and laughed. “Clear,” she said. “Well. Now what do I DO all day?”',
  },
  // ---- ARC: THE BECALMED (where Voltholm's wind went)
  {
    id: 'q38_deadair',
    name: 'The Missing Weather',
    giver: 'coil',
    briefing: [
      'One more thing, contractor, and it’s the one nobody at the Jarworks says out loud. Twenty years of storms, gales, SKYFALL — and one patch of the flats where there is NOTHING. No wind. No bolts. The rods out there have never eaten a single strike. We call it the Becalmed and we do not go.',
      'My forecast officer went, the week the crews wired in. Bet. Best weather-eye on the payroll. Never came back, never died either — the wire still carries a pressure report every morning at six sharp. Twenty years of “no change.”',
      'The storm is beaten. The sky is open. Go find out where all that missing wind WENT — and tell Bet the office reopened.',
    ],
    acceptLine: 'The Stilling Gate, south past the flats! And contractor — when the wind stops, that’s not the ABSENCE of weather. Bet taught me that. That’s weather WAITING!',
    objective: { kind: 'goto', label: 'Walk into the Becalmed', count: 1, markerX: 0, markerZ: 92, mapId: 'volt_still' },
    rewardCash: 11000, rewardXp: 14000,
    completeLine: 'Dead air. Kites hanging overhead like the sky pressed pause. And at the gate — a small, precise person with twenty years of weather logs and a finger to her lips. Bet. Alive. Whispering. “About time,” she says. “Don’t SLAM anything.”',
    unlocksStation: 'The Stilling Gate',
  },
  {
    id: 'q39_lullaby',
    name: 'Do Not Wake the Crews',
    giver: 'bet',
    briefing: [
      'Here’s twenty years of forecasting in one line: the wind didn’t stop. Something is HOLDING it. Middle of the zone, past the Barrow Line. It inhaled the night the crews wired in and it has not exhaled since.',
      'The crews that wander in here stop harvesting and start SLEEPWALKING — it sings to them, under the hearing. They’re not aggressive, exactly. They’re PROTECTIVE. Of their naps. Of it.',
      'I need the Hang Fields thinned before we go any deeper — ten of the sleepers, put down gently. And I mean it about gently: every one of those rigs still has a person’s name on the requisition.',
    ],
    acceptLine: 'Ten sleepers, contractor — and keep your reloads QUIET, everything in here echoes like a held breath!',
    objective: { kind: 'kill_faction', label: 'Sleepwalking crews laid down', count: 10, faction: 'galebound', markerX: -66, markerZ: -4, mapId: 'volt_still' },
    rewardCash: 12000, rewardXp: 15000, rewardItem: 'epic',
    completeLine: 'Ten rigs down, ten names logged in Bet’s neat cold hand. The Hang Fields went quiet — a DIFFERENT quiet, the honest kind. Bet stared at the middle of the zone for a long time. “Barometer’s falling,” she whispered. “First change in twenty years. It knows we’re coming.”',
  },
  {
    id: 'q40_exhale',
    name: 'Exhale',
    giver: 'bet',
    briefing: [
      'Final forecast, contractor. Everything Voltholm lost is sitting in that hollow — every gale, every gust, every breath of working wind from twenty years of harvest weather, coiled up and HELD. It swallowed a crew kite on night one. Still got it. You’ll see the glow.',
      'You freed the storm. You cut Gale Prime down. This is the last of it: the wind that hid instead of fighting. I’ve logged it every morning for twenty years and I am telling you, professionally — it is TIRED. Holding your breath is WORK.',
      'Go to the middle and make it let go. Shoot the kite in its chest — that’s the cork. And when it finally exhales… stand somewhere with a handhold.',
    ],
    acceptLine: 'The hollow, dead centre! When it inhales, DIG IN — and when that kite cracks, twenty years of weather comes out ALL AT ONCE!',
    objective: { kind: 'boss', label: 'The Held Breath released', count: 1, bossId: 'held_breath', markerX: 0, markerZ: -86, mapId: 'volt_still' },
    rewardCash: 18000, rewardXp: 20000, rewardItem: 'legendary',
    completeLine: 'The kite cracked and the Becalmed EXHALED — twenty years of wind going home in one long gust that you felt on three other maps. The hanging kites finally landed. The sleepers woke up asking about overtime. And Bet stood in the first breeze of her long career’s second act, checked her instruments, and said — out loud, at full volume — “PARTLY WINDY. Back to work.”',
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
  // ---- THE AUGER: Brann's oldest open claim
  {
    id: 'sq_auger1',
    name: 'The Open Claim',
    giver: 'brann',
    briefing: [
      'Eleven years, contractor. Claim number 0001 — the FIRST claim I was ever handed, and the only one still open. Helix Bore Site One: deepest hole the Combine ever cut, abandoned mid-shift, no incident report, no site survey, no CLOSURE.',
      'The file says the drill "encountered acoustic resistance." That is corporate for: it hit something, and the something MINDED. Every adjuster before me marked it unverifiable and moved on. I do not move on.',
      'The site is a spiral — one road, two and a half turns, straight down. Walk the thread to the bottom, put eyes on the drill head, and my eleven-year headache finally gets a page-one photograph.',
    ],
    acceptLine: 'Bore Site One, east past the canyon rim! Walk it DOWN, photograph it, and touch NOTHING that hums!',
    objective: { kind: 'goto', label: 'Reach the drill floor at the bottom', count: 1, markerX: 0, markerZ: 0, mapId: 'auger' },
    rewardCash: 4500, rewardXp: 5200,
    completeLine: 'You stood on the drill floor and the file finally has a photo: the auger, mid-bite, with CRYSTAL growing up its flutes like the planet is healing around a splinter. Brann stared at it for a full minute. Then, quietly: "Claim 0001. Verified." He bought drinks. For EVERYONE.',
    unlocksStation: 'Bore Site One',
  },
  {
    id: 'sq_auger2',
    name: 'Acoustic Resistance',
    giver: 'brann',
    briefing: [
      'The photo did it. Helix legal responded in ELEVEN HOURS after eleven years — they want the site "remediated." Corporate for: the things living in my crime scene are eating the evidence.',
      'The hum down that spiral is the same hum the Hollowdeep sings — the bore broke into the same gallery system. And the biggest things in it have moved into the drill floor like it\u2019s subsidized housing.',
      'Clear the squatters — four of the big ones — and the claim CLOSES. Eleven years, contractor. I have the stamp ready. I have had the stamp ready since YEAR TWO.',
    ],
    acceptLine: 'The drill floor! Four of the big ones! And mind the spiral on the way down — everything below you can hear everything above you!',
    objective: { kind: 'kill_elites', label: 'Drill-floor squatters evicted', count: 4, markerX: 0, markerZ: 0, mapId: 'auger' },
    elite: { enemyId: 'shardcaster', count: 4, x: 0, z: 0, mapId: 'auger', levelOffset: 11 },
    rewardCash: 6000, rewardXp: 7000, rewardUnique: 'leg_depth_gauge',
    completeLine: 'Four squatters evicted and the claim is CLOSED. Brann stamped the file so hard the desk cracked. He framed the stamp. He gave you the gun from the evidence locker — "eleven years of storage fees," he says, "you\u2019ve earned the interest."',
  },
  // ---- THE TERRACES: Juno's oldest unanswered question
  {
    id: 'sq_stairs1',
    name: 'The Garden Before the God',
    giver: 'juno',
    briefing: [
      'Contractor! Field question, possibly career-defining: the Verdant worship the Bloom, yes? Except their FARMING is older than their religion. Satellite pass found terraced paddies up a canyon east of the shelf — five stepped fields, five waterfalls, still planted, still FLOODING ON SCHEDULE. Nobody tends them. Officially.',
      'Terrace agriculture needs coordination. Coordination needs people. So either the tribe is running a secret farm they never chant about — or the garden has been running ITSELF since before the drums.',
      'Climb it for me. All five steps, to the crown at the top. Photograph the idols, count the rows, and DO NOT eat anything, I know how field trips go.',
    ],
    acceptLine: 'The Terraces, east canyon! Five steps up — count EVERYTHING, touch NOTHING, and if the water flows uphill anywhere, TIME IT!',
    objective: { kind: 'goto', label: 'Climb to the Garden Crown', count: 1, markerX: 0, markerZ: -74, mapId: 'veldt_stairs' },
    rewardCash: 4200, rewardXp: 5000,
    completeLine: 'You climbed all five steps and stood in the crown — six carved heads older than the tribe, all facing a flower that blooms on a SCHEDULE. Juno went through your photos twice and got very quiet. Then, reverently: "The garden didn\u2019t join the religion. The garden FOUNDED it."',
    unlocksStation: 'The Paddy Gate',
  },
  {
    id: 'sq_stairs2',
    name: 'Crop Rotation',
    giver: 'juno',
    briefing: [
      'Follow-up, and it\u2019s urgent: the tribe noticed my drone. Now their biggest totem-carriers have moved onto the terraces as PERMANENT GROUNDSKEEPERS, and their idea of weeding is anything that walks on two legs and owns a camera.',
      'I need three more survey passes and I cannot get ONE while the Fifth Step is patrolled by walking shrubbery the size of a shed.',
      'Four of the big groundskeepers, gently retired. The terraces have run themselves for a thousand years — they will survive a staffing change.',
    ],
    acceptLine: 'The upper steps! Four totem-carriers! And save me a cutting from anything that SCREAMS when you prune it!',
    objective: { kind: 'kill_elites', label: 'Groundskeepers retired', count: 4, markerX: 0, markerZ: -36, mapId: 'veldt_stairs' },
    elite: { enemyId: 'totem_bruiser', count: 4, x: 0, z: -36, mapId: 'veldt_stairs', levelOffset: 10 },
    rewardCash: 5500, rewardXp: 6400, rewardUnique: 'leg_green_thumb',
    completeLine: 'Four groundskeepers composted, three survey passes flown, and Juno\u2019s paper is titled: "Agricultural Theology: the Farm That Grew a God." She gave you the shotgun she keeps for field work. "It plants things," she said. "In a way."',
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
