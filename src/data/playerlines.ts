// Player character voice lines — each playable character has their own
// mouth. Kept SHORT (they play over gunfire) and rationed by the trigger
// system in game/playervoice.ts so they never wear out their welcome.

export interface PlayerLineSet {
  voiceId: string;          // profile in audio/voice.ts VOICES
  kill: string[];           // occasional, after a kill
  multikill: string[];      // 3+ kills in a short window
  crit: string[];           // occasional, on a crit kill
  skill: string[];          // action skill cast
  reload: string[];         // rare grumble mid-reload
  hurt: string[];           // dropped below ~35% health
  downed: string[];         // fight for your life
  secondwind: string[];     // got back up
  levelup: string[];
  legendary: string[];      // legendary drop hits the ground
}

export const PLAYER_LINES: Record<string, PlayerLineSet> = {
  gunsmith: {
    voiceId: 'harlan',
    kill: ['Warranty voided.', 'Tools did the talking.', 'Filed under DONE.', 'Craftsmanship.', 'Next customer.'],
    multikill: ['Batch job!', 'Assembly line, baby!', 'BULK DISCOUNT!'],
    crit: ['Right in the serial number!', 'Precision work.', 'Measured twice. Cut ONCE.'],
    skill: ['Rig out — hold the line!', 'Sentry’s clocked in!', 'Let the machine work!'],
    reload: ['C’mon, seat properly...', 'Feed cleaner, you rat-built thing.', 'I could BUILD faster ammo.'],
    hurt: ['Frame damage! Frame damage!', 'That’s coming out of somebody’s deposit!', 'Still under tolerance... barely.'],
    downed: ['Down for maintenance!', 'Not like THIS — not by JUNK!', 'Need a patch here!'],
    secondwind: ['Back to spec!', 'REBUILT and ANGRY!', 'Warranty renewed, courtesy of ME.'],
    levelup: ['Better tools, better me.', 'Upgraded. Naturally.', 'That’s a new tolerance rating.'],
    legendary: ['Now THAT’S engineering!', 'Oh, you beautiful machine.', 'Somebody CARED when they built this.'],
  },
  stormcaller: {
    voiceId: 'sable',
    kill: ['Grounded.', 'The storm keeps what it strikes.', 'Static. Then silence.', 'Forecast held.', 'Conducted.'],
    multikill: ['CHAIN LIGHTNING!', 'The whole sky came down!', 'Weather WARNING!'],
    crit: ['Struck true.', 'High voltage, low mercy.', 'Direct hit — nature approves.'],
    skill: ['Sky’s OPEN!', 'Come, storm!', 'Pressure’s dropping — DUCK!'],
    reload: ['Recharging the hard way.', 'Even lightning has to breathe.', 'Hold still, capacitor.'],
    hurt: ['Losing charge!', 'That one grounded ME!', 'Insulation’s failing!'],
    downed: ['Storm’s... flickering!', 'Not out yet — never out!', 'The sky owes me ONE!'],
    secondwind: ['The storm REMEMBERS!', 'Recharged. Furious.', 'You cannot ground the SKY!'],
    levelup: ['The pressure builds.', 'More sky in me now.', 'Charged and climbing.'],
    legendary: ['This one HUMS.', 'The storm chose this for me.', 'Oh — it’s ALIVE, isn’t it.'],
  },
  houndmaster: {
    voiceId: 'kez',
    kill: ['Fetched!', 'Good hit! Good hit!', 'That one’s buried.', 'Down, stay. Forever.', 'Marked and mauled!'],
    multikill: ['WHOLE PACK FED!', 'Everybody gets a piece!', 'That’s a FULL kennel!'],
    crit: ['Right between the ears!', 'BULLSEYE! Who’s a good shot? I am!', 'Chomped!'],
    skill: ['Sic ’em!', 'Go go go, get ’em!', 'Dinner time, boy!'],
    reload: ['Hold on, hold on —', 'Treats first, bullets after.', 'Fumble! Nobody saw that.'],
    hurt: ['Ow ow OW — bad!', 'They BIT me! That’s MY move!', 'Need a medic — or a vet!'],
    downed: ['Down! I’m down! Not dead!', 'Somebody drag me!', 'Playing dead! Strategically!'],
    secondwind: ['Back on all fours!', 'You cannot put me DOWN!', 'Good as new — GRRRR!'],
    levelup: ['New tricks! Old dog optional!', 'Leveled! Treats for everyone!', 'Bigger teeth. Metaphorically.'],
    legendary: ['GOOD LOOT! GOOD LOOT!', 'I’m keeping this FOREVER.', 'Shiny! MINE!'],
  },
  ravager: {
    voiceId: 'tovah',
    kill: ['Broken.', 'Stay down.', 'The pile grows.', 'One less.', 'Dust.'],
    multikill: ['THE HARVEST!', 'ALL of you — DOWN!', 'A good, loud silence.'],
    crit: ['Cracked the shell.', 'Straight through.', 'Felt that one MYSELF.'],
    skill: ['ENOUGH. My turn.', 'Come CLOSE. See what happens.', 'The ground shakes for ME.'],
    reload: ['Too slow. Too SLOW.', 'Feed me faster, iron.', 'Patience. Then violence.'],
    hurt: ['I felt that. IMPRESSIVE.', 'You DARE.', 'Blood’s mine. I’m keeping it.'],
    downed: ['Kneeling. Not BOWING.', 'This ground is temporary.', 'Closer. CLOSER.'],
    secondwind: ['I do not STAY down.', 'UP. Always up.', 'Death blinked first.'],
    levelup: ['Harder.', 'The mountain grows.', 'More.'],
    legendary: ['Worthy.', 'This will hurt them beautifully.', 'Heavy. GOOD.'],
  },
};

// ---- THUG MODE (Extras): every playable character's mouth is replaced by
// one unified pool of catastrophically over-the-top hype bellows, in loving
// tribute to a certain corner of the internet. Audio-only novelty toggle.
export const THUG_LINES: string[] = [
  'I\u2019M ABOUT TO CUM!!',
  'THAT MIGHT JUST BE WHAT I NEED TO BUST!',
  'YOU FUCKING THE SHIT OUT OF ME BRO!!',
  'DO THE THUG SHAKER!!',
  'I\u2019M BUSTING\u2026 YES, I\u2019M BUSTING\u2026!!',
  'I\u2019M ABOUT TO BLOW!!',
  'A well-timed ability can help make short work of your adversaries.',
  'Stay away from those oranges, and have fun in Hamburg!',
  'Lay off the bacon, egg, and cheeses, JRC!',
  'FNRK!!',
  'A little elbow grease and we\u2019ll be a well-oiled machine!',
  'AAAAAAAAAAAAAAAAAA!!',
  'Another one down, another rope shot!',
  'EXPOSEEEE ME! EXPOSEEEE ME!!',
  'I\u2019M GOONING IN MY FUCKING PISS BRO!!',
  'Enemy? Dead. Balloon knot? Heh\u2026 bred.',
  'AMBATUKAM!! OMAYGOT!!',
  'BUS. BUS. BUS!! I\u2019M BUSSIN\u2019!!',
  'YES KING!! YEEES KING!!',
  'WHO MADE THAT MESS? YOU MADE THAT MESS!!',
  'GET ME PREGNANT!!',
  'OH MY GOD!! OH MY GOOOOD!!',
  'CAN I CUM? CAN I CUM?! PLEASE!!',
];
