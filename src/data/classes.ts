// Playable classes. Skills are data: passive stat mods, kill skills (timed
// buffs on kill), and action-skill augments keyed by id — but the passives
// include FLAG stats consumed by real mechanics in the engine (stack pools,
// last-round bonuses, pierce, on-kill shield refills, low-health berserk...)
// so every tree is a BUILD, not a spreadsheet. Where a mechanic has a
// Borderlands 2 ancestor, it is imported with pride and a new name.

export type SkillKind = 'passive' | 'killskill' | 'augment';

export interface SkillDef {
  id: string;
  name: string;
  desc: (pts: number) => string;
  kind: SkillKind;
  maxPoints: number;
  tier: number;                 // 1..6, capstone at 6
  // passive & killskill: stat deltas per point (killskills apply while buff active)
  stats?: Record<string, number>;
  killskillDuration?: number;
  augmentId?: string;           // consumed by action-skill code
  flavor?: string;
}

export interface SkillTreeDef {
  id: string;
  name: string;
  blurb: string;
  skills: SkillDef[];
}

export interface ClassDef {
  id: string;
  name: string;          // class archetype name
  charName: string;      // the character
  blurb: string;
  /** One-line "how it plays" summary for the character select screen. */
  playstyle: string;
  actionSkill: { id: string; name: string; desc: string; cooldown: number; duration: number };
  trees: SkillTreeDef[];
  playable: boolean;
}

const P = (n: number, unit = '%') => `${Math.round(n * 100) / 100}${unit}`;

// ---------------------------------------------------------------------------
// THE GUNSMITH — Harlan Vex. Deploys the SENTRY RIG, a welded auto-turret.
// Builds: last-round cannon (Hot Iron), commando dug in behind his turret
// (Ironworks), kill-chaining economist (Payday).
const gunsmith: ClassDef = {
  id: 'gunsmith',
  name: 'The Gunsmith',
  charName: 'Harlan Vex',
  blurb: 'Ex-armory foreman of the Helix Combine. Quit loudly. Took the tools.',
  playstyle: 'Set up a killzone and hold it: turret cover, last-round haymakers, and kills that pay the ability bill.',
  actionSkill: {
    id: 'sentry_rig',
    name: 'Sentry Rig',
    desc: 'Deploy a welded scrap turret that shreds anything in front of it. It judges your enemies so you don’t have to.',
    cooldown: 26,
    duration: 14,
  },
  trees: [
    {
      id: 'hot_iron',
      name: 'Hot Iron',
      blurb: 'Guns, but more so. The LAST round in the mag is the whole religion.',
      skills: [
        { id: 'hi_trigger', name: 'Trigger Discipline', kind: 'passive', maxPoints: 5, tier: 1, stats: { fireRate: 0.04 }, desc: (p) => `+${P(4 * p)} fire rate.` },
        { id: 'hi_racket', name: 'Full Metal Racket', kind: 'passive', maxPoints: 5, tier: 1, stats: { gunDamage: 0.04 }, desc: (p) => `+${P(4 * p)} gun damage.` },
        { id: 'hi_moneyshot', name: 'Money Shot', kind: 'passive', maxPoints: 5, tier: 2, stats: { moneyShot: 0.16 }, desc: (p) => `The LAST round in your magazine deals +${P(16 * p)} damage.`, flavor: 'Save the best for last. Then spend it.' },
        { id: 'hi_paid', name: 'Paid in Lead', kind: 'killskill', maxPoints: 5, tier: 2, stats: { fireRate: 0.05, reloadSpeed: 0.05 }, killskillDuration: 7, desc: (p) => `Kill Skill: +${P(5 * p)} fire rate and reload speed for 7s.` },
        { id: 'hi_chamber', name: 'Two in the Chamber', kind: 'passive', maxPoints: 5, tier: 3, stats: { freeAmmoChance: 0.05 }, desc: (p) => `${P(5 * p)} chance shots don’t consume ammo.` },
        { id: 'hi_dragons', name: 'Spicy Handloads', kind: 'passive', maxPoints: 5, tier: 4, stats: { elemChance: 0.05, elemDamage: 0.04 }, desc: (p) => `+${P(5 * p)} elemental proc chance, +${P(4 * p)} elemental damage.` },
        { id: 'hi_drill', name: 'Drill Rounds', kind: 'passive', maxPoints: 1, tier: 5, stats: { drillRounds: 1 }, desc: () => `Your shots BORE through the first target and hit whatever was hiding behind it for 60% damage.`, flavor: 'The Combine drilled one big hole. Harlan drills thousands of small ones.' },
        { id: 'hi_overkill', name: 'Overkill', kind: 'passive', maxPoints: 1, tier: 6, stats: { overkill: 1 }, desc: () => `CAPSTONE: overkill damage from a killing blow carries into your next shot.`, flavor: 'Waste not.' },
      ],
    },
    {
      id: 'ironworks',
      name: 'Ironworks',
      blurb: 'The rig provides. Fight NEXT TO the furniture, not instead of it.',
      skills: [
        { id: 'iw_plating', name: 'Boiler Plating', kind: 'passive', maxPoints: 5, tier: 1, stats: { maxHealth: 0.05 }, desc: (p) => `+${P(5 * p)} max health.` },
        { id: 'iw_grease', name: 'Elbow Grease', kind: 'passive', maxPoints: 5, tier: 1, stats: { skillCooldown: 0.04 }, desc: (p) => `-${P(4 * p)} Sentry Rig cooldown.` },
        { id: 'iw_caliber', name: 'Bigger Bolts', kind: 'passive', maxPoints: 5, tier: 2, stats: { turretDamage: 0.08 }, desc: (p) => `+${P(8 * p)} Sentry Rig damage.` },
        { id: 'iw_battlefront', name: 'Battlefront', kind: 'passive', maxPoints: 5, tier: 2, stats: { battlefront: 0.06 }, desc: (p) => `+${P(6 * p)} gun damage while your Sentry Rig is deployed.`, flavor: 'Two of you now. Act like it.' },
        { id: 'iw_longhaul', name: 'The Long Haul', kind: 'passive', maxPoints: 5, tier: 3, stats: { turretDuration: 0.1 }, desc: (p) => `+${P(10 * p)} Sentry Rig duration.` },
        { id: 'iw_magnet', name: 'Rig: Scrap Magnet', kind: 'augment', maxPoints: 1, tier: 4, augmentId: 'rig_taunt', desc: () => `Sentry Rig taunts nearby enemies to attack it instead of you.`, flavor: 'Hey! You! Shoot the furniture!' },
        { id: 'iw_grit', name: 'Foreman’s Grit', kind: 'passive', maxPoints: 5, tier: 5, stats: { grit: 0.04 }, desc: (p) => `${P(4 * p)} chance to flat-out IGNORE a hit that would have downed you.`, flavor: 'Clock says he died. Harlan disagrees.' },
        { id: 'iw_twins', name: 'The Twins', kind: 'augment', maxPoints: 1, tier: 6, augmentId: 'rig_twins', desc: () => `CAPSTONE: deploy TWO Sentry Rigs.`, flavor: 'Double the judgement.' },
      ],
    },
    {
      id: 'payday',
      name: 'Payday',
      blurb: 'Violence is a business expense. Kills are the invoice.',
      skills: [
        { id: 'pd_hustle', name: 'Hustle', kind: 'killskill', maxPoints: 5, tier: 1, stats: { moveSpeed: 0.04 }, killskillDuration: 7, desc: (p) => `Kill Skill: +${P(4 * p)} move speed for 7s.` },
        { id: 'pd_scrounge', name: 'Scrounger', kind: 'passive', maxPoints: 5, tier: 1, stats: { lootLuck: 0.04 }, desc: (p) => `+${P(4 * p)} rare loot luck.` },
        { id: 'pd_getsome', name: 'Get Some', kind: 'passive', maxPoints: 5, tier: 2, stats: { getSome: 0.6 }, desc: (p) => `Every kill shaves ${P(0.6 * p, 's')} off your Sentry Rig cooldown.`, flavor: 'The paperwork files itself if you keep shooting.' },
        { id: 'pd_adrenaline', name: 'Blood Bonus', kind: 'killskill', maxPoints: 5, tier: 2, stats: { gunDamage: 0.04 }, killskillDuration: 7, desc: (p) => `Kill Skill: +${P(4 * p)} gun damage for 7s.` },
        { id: 'pd_deeppockets', name: 'Deep Pockets', kind: 'passive', maxPoints: 5, tier: 3, stats: { magSize: 0.05 }, desc: (p) => `+${P(5 * p)} magazine size.` },
        { id: 'pd_severance', name: 'Severance Package', kind: 'passive', maxPoints: 5, tier: 4, stats: { grenadeDamage: 0.08 }, desc: (p) => `+${P(8 * p)} grenade damage.` },
        { id: 'pd_ledger', name: 'The Ledger', kind: 'killskill', maxPoints: 5, tier: 5, stats: { shieldRate: 0.08 }, killskillDuration: 7, desc: (p) => `Kill Skill: +${P(8 * p)} shield recharge rate for 7s.` },
        { id: 'pd_jackpot', name: 'Jackpot', kind: 'passive', maxPoints: 1, tier: 6, stats: { jackpot: 1 }, desc: () => `CAPSTONE: critical kills refund a full magazine and rain bonus cash.`, flavor: 'The house always wins. Be the house.' },
      ],
    },
  ],
  playable: true,
};

// ---------------------------------------------------------------------------
// THE STORMCALLER — Sable Anders. TEMPEST SHELL, a walking-thunderhead stance.
// Builds: cataclysm mage (Static), battlefield-control skirmisher (Squall),
// combat medic who heals by hurting (Groundwire).
const stormcaller: ClassDef = {
  id: 'stormcaller',
  name: 'The Stormcaller',
  charName: 'Sable Anders',
  blurb: 'Struck by lightning six times. On a first-name basis with the seventh.',
  playstyle: 'Elemental tempo: proc chains, crowd control that PULLS, and kills that pay you back in blood or thunder.',
  actionSkill: {
    id: 'tempest_shell',
    name: 'Tempest Shell',
    desc: 'Become a walking thunderhead: your shots turn Volt and chain, and arcs leap from you to anything rude enough to stand close.',
    cooldown: 30,
    duration: 9,
  },
  trees: [
    {
      id: 'static',
      name: 'Static',
      blurb: 'The elements owe YOU money. Collect with interest.',
      skills: [
        { id: 'st_conductor', name: 'Conductor', kind: 'passive', maxPoints: 5, tier: 1, stats: { elemDamage: 0.05 }, desc: (p) => `+${P(5 * p)} elemental damage.` },
        { id: 'st_charged', name: 'Flicker', kind: 'passive', maxPoints: 5, tier: 1, stats: { elemChance: 0.05 }, desc: (p) => `+${P(5 * p)} elemental proc chance.` },
        { id: 'st_grounded', name: 'Grounded', kind: 'passive', maxPoints: 5, tier: 2, stats: { shieldCapacity: 0.06 }, desc: (p) => `+${P(6 * p)} shield capacity.` },
        { id: 'st_aftershock', name: 'Aftershock', kind: 'killskill', maxPoints: 5, tier: 2, stats: { elemDamage: 0.06 }, killskillDuration: 7, desc: (p) => `Kill Skill: +${P(6 * p)} elemental damage for 7s.` },
        { id: 'st_arcflash', name: 'Arc Flash', kind: 'passive', maxPoints: 5, tier: 3, stats: { fireRate: 0.04 }, desc: (p) => `+${P(4 * p)} fire rate. Lightning is a tempo.` },
        { id: 'st_ruin', name: 'Shell: Ruin', kind: 'augment', maxPoints: 1, tier: 4, augmentId: 'tempest_ruin', desc: () => `Activating Tempest Shell detonates Volt, Ember AND Bile on every enemy near you.`, flavor: 'A dark day for everyone who is not Sable.' },
        { id: 'st_forked', name: 'Shell: Forked Sky', kind: 'augment', maxPoints: 1, tier: 5, augmentId: 'tempest_fork', desc: () => `Tempest arcs strike TWO targets at once.`, flavor: 'Why choose?' },
        { id: 'st_capstone', name: 'Live Wire', kind: 'passive', maxPoints: 1, tier: 6, stats: { liveWire: 1 }, desc: () => `CAPSTONE: while Tempest Shell is active, your shots NEVER consume ammo.`, flavor: 'The storm provides.' },
      ],
    },
    {
      id: 'squall',
      name: 'Squall',
      blurb: 'Move like weather. Herd them like sheep. Arrive like news.',
      skills: [
        { id: 'sq_tailwind', name: 'Tailwind', kind: 'passive', maxPoints: 5, tier: 1, stats: { moveSpeed: 0.04 }, desc: (p) => `+${P(4 * p)} move speed.` },
        { id: 'sq_slipstream', name: 'Slipstream', kind: 'passive', maxPoints: 5, tier: 1, stats: { reloadSpeed: 0.05 }, desc: (p) => `+${P(5 * p)} reload speed.` },
        { id: 'sq_fleet', name: 'Fleet', kind: 'passive', maxPoints: 5, tier: 2, stats: { fleet: 0.08 }, desc: (p) => `+${P(8 * p)} move speed while your shields are DOWN.`, flavor: 'No shield, no drag coefficient.' },
        { id: 'sq_downdraft', name: 'Downdraft', kind: 'killskill', maxPoints: 5, tier: 2, stats: { moveSpeed: 0.05, fireRate: 0.04 }, killskillDuration: 7, desc: (p) => `Kill Skill: +${P(5 * p)} move speed and +${P(4 * p)} fire rate for 7s.` },
        { id: 'sq_converge', name: 'Shell: Converge', kind: 'augment', maxPoints: 1, tier: 3, augmentId: 'tempest_converge', desc: () => `Tempest arcs DRAG nearby enemies toward whoever got struck. Group therapy.`, flavor: 'Everyone, huddle up. Closer. PERFECT.' },
        { id: 'sq_stormchaser', name: 'Storm Chaser', kind: 'passive', maxPoints: 5, tier: 4, stats: { turretDuration: 0.08 }, desc: (p) => `+${P(8 * p)} Tempest Shell duration.` },
        { id: 'sq_squallline', name: 'Shell: Squall Line', kind: 'augment', maxPoints: 1, tier: 5, augmentId: 'tempest_haste', desc: () => `Tempest Shell also grants +25% move speed and reload speed.`, flavor: 'Outrun the thunder. Rude, but possible.' },
        { id: 'sq_capstone', name: 'Eye of the Storm', kind: 'passive', maxPoints: 1, tier: 6, stats: { eyeStorm: 1 }, desc: () => `CAPSTONE: killing a target while Tempest Shell is active extends the Shell by 2 seconds.`, flavor: 'The weather likes a show.' },
      ],
    },
    {
      id: 'groundwire',
      name: 'Groundwire',
      blurb: 'The storm gives back. Bleed them, then bill them for the bandages.',
      skills: [
        { id: 'gw_insulated', name: 'Insulated', kind: 'passive', maxPoints: 5, tier: 1, stats: { maxHealth: 0.05 }, desc: (p) => `+${P(5 * p)} max health.` },
        { id: 'gw_trickle', name: 'Trickle Charge', kind: 'passive', maxPoints: 5, tier: 1, stats: { shieldRate: 0.06 }, desc: (p) => `+${P(6 * p)} shield recharge rate.` },
        { id: 'gw_release', name: 'Sweet Release', kind: 'passive', maxPoints: 5, tier: 2, stats: { reaper: 0.03 }, desc: (p) => `Kills while Tempest Shell is active restore ${P(3 * p)} of your max health.`, flavor: 'The storm keeps what it kills. It shares.' },
        { id: 'gw_surge', name: 'Surge Protector', kind: 'killskill', maxPoints: 5, tier: 2, stats: { shieldRate: 0.08 }, killskillDuration: 7, desc: (p) => `Kill Skill: +${P(8 * p)} shield recharge for 7s.` },
        { id: 'gw_lifetap', name: 'Life Tap', kind: 'killskill', maxPoints: 5, tier: 3, stats: { lifesteal: 0.012 }, killskillDuration: 7, desc: (p) => `Kill Skill: your shots heal you for ${P(1.2 * p)} of damage dealt, for 7s.`, flavor: 'Blood in, blood out, blood BACK.' },
        { id: 'gw_sustenance', name: 'Sustenance', kind: 'passive', maxPoints: 5, tier: 4, stats: { regen: 0.004 }, desc: (p) => `Regenerate ${P(0.4 * p)} of your max health per second.` },
        { id: 'gw_nova', name: 'Shell: Thunderclap', kind: 'augment', maxPoints: 1, tier: 5, augmentId: 'tempest_nova', desc: () => `Tempest Shell detonates a Volt nova when it ends.`, flavor: 'Always leave on a bang.' },
        { id: 'gw_capstone', name: 'Lightning Rod', kind: 'passive', maxPoints: 1, tier: 6, stats: { lightningRod: 1 }, desc: () => `CAPSTONE: 20% of damage you take while shields are up is dealt back as Volt to the nearest enemy.`, flavor: 'Return to sender.' },
      ],
    },
  ],
  playable: true,
};

// ---------------------------------------------------------------------------
// THE HOUNDMASTER — Kez Okafor. Summons RIVET, a bounding scrap-hound.
// Builds: pet mauler (Pack Instinct), shield-cycling skirmisher (Run With
// It), and ORDERED CHAOS — the anarchy pile, imported with its warning label.
const houndmaster: ClassDef = {
  id: 'houndmaster', name: 'The Houndmaster', charName: 'Kez Okafor',
  blurb: 'Rebuilt a scrap-hound from a wreck. It rebuilt her right back.',
  playstyle: 'Run-and-gun with a partner — or stack SCRAP ANARCHY until your guns hit like trains and aim like weather.',
  actionSkill: { id: 'iron_hound', name: 'Iron Hound', desc: 'Summon RIVET, a bounding scrap-hound that runs down your enemies and mauls them with recycled enthusiasm.', cooldown: 30, duration: 16 },
  trees: [
    {
      id: 'pack_instinct',
      name: 'Pack Instinct',
      blurb: 'Two of you. One leash. Zero rules.',
      skills: [
        { id: 'pi_goodboy', name: 'Good Boy', kind: 'passive', maxPoints: 5, tier: 1, stats: { turretDamage: 0.08 }, desc: (p) => `+${P(8 * p)} Iron Hound damage.` },
        { id: 'pi_whistle', name: 'Short Whistle', kind: 'passive', maxPoints: 5, tier: 1, stats: { skillCooldown: 0.04 }, desc: (p) => `-${P(4 * p)} Iron Hound cooldown.` },
        { id: 'pi_stamina', name: 'Junkyard Stamina', kind: 'passive', maxPoints: 5, tier: 2, stats: { turretDuration: 0.1 }, desc: (p) => `+${P(10 * p)} Iron Hound duration.` },
        { id: 'pi_fangs', name: 'Rebar Fangs', kind: 'killskill', maxPoints: 5, tier: 2, stats: { gunDamage: 0.04 }, killskillDuration: 7, desc: (p) => `Kill Skill: +${P(4 * p)} gun damage for 7s. Rivet gets excited. It spreads.` },
        { id: 'pi_scentblood', name: 'Scent of Blood', kind: 'passive', maxPoints: 5, tier: 3, stats: { fireRate: 0.04 }, desc: (p) => `+${P(4 * p)} fire rate.` },
        { id: 'pi_burning', name: 'Hound: Cinder Bite', kind: 'augment', maxPoints: 1, tier: 4, augmentId: 'hound_ember', desc: () => `Rivet’s bites ignite targets with Ember.`, flavor: 'Someone fed the dog a furnace.' },
        { id: 'pi_leech', name: 'Hound: Retriever', kind: 'augment', maxPoints: 1, tier: 5, augmentId: 'hound_fetch', desc: () => `Rivet’s bites return 3% of their damage to you as health. Fetch, but for vitality.`, flavor: 'DROP it. Good. Now give it to ME.' },
        { id: 'pi_capstone', name: 'Two Dog Night', kind: 'augment', maxPoints: 1, tier: 6, augmentId: 'hound_twins', desc: () => `CAPSTONE: summon TWO hounds.`, flavor: 'Rivet built a friend. Out of a mailbox.' },
      ],
    },
    {
      id: 'run_with_it',
      name: 'Run With It',
      blurb: 'Keep up or hold the leash. Shields are a rhythm instrument.',
      skills: [
        { id: 'rw_offleash', name: 'Off-Leash', kind: 'passive', maxPoints: 5, tier: 1, stats: { moveSpeed: 0.04 }, desc: (p) => `+${P(4 * p)} move speed.` },
        { id: 'rw_quickhands', name: 'Quick Hands', kind: 'passive', maxPoints: 5, tier: 1, stats: { reloadSpeed: 0.05 }, desc: (p) => `+${P(5 * p)} reload speed.` },
        { id: 'rw_houndstooth', name: 'Houndstooth', kind: 'killskill', maxPoints: 5, tier: 2, stats: { moveSpeed: 0.05, reloadSpeed: 0.04 }, killskillDuration: 7, desc: (p) => `Kill Skill: +${P(5 * p)} move speed and +${P(4 * p)} reload speed for 7s.` },
        { id: 'rw_flush', name: 'Flush Them Out', kind: 'passive', maxPoints: 5, tier: 2, stats: { gunDamage: 0.04 }, desc: (p) => `+${P(4 * p)} gun damage.` },
        { id: 'rw_bigbag', name: 'Bigger Saddlebags', kind: 'passive', maxPoints: 5, tier: 3, stats: { magSize: 0.05 }, desc: (p) => `+${P(5 * p)} magazine size.` },
        { id: 'rw_bloodsoaked', name: 'Blood-Soaked Plating', kind: 'passive', maxPoints: 1, tier: 4, stats: { bloodSoaked: 1 }, desc: () => `Every kill INSTANTLY refills your shields — and burns 2% of your health as the deposit.`, flavor: 'The shield runs on somebody. Today it’s them.' },
        { id: 'rw_chase', name: 'Chase Instinct', kind: 'killskill', maxPoints: 5, tier: 5, stats: { fireRate: 0.05 }, killskillDuration: 7, desc: (p) => `Kill Skill: +${P(5 * p)} fire rate for 7s.` },
        { id: 'rw_capstone', name: 'Second Wind (Literal)', kind: 'passive', maxPoints: 1, tier: 6, stats: { eyeStorm: 1 }, desc: () => `CAPSTONE: kills while Rivet is out extend the summon by 2 seconds.`, flavor: 'The walk is over when RIVET says it’s over.' },
      ],
    },
    {
      id: 'ordered_chaos',
      name: 'Ordered Chaos',
      blurb: 'Stack SCRAP. Gain power. Lose the ability to aim. A fair trade.',
      skills: [
        { id: 'oc_anarchy', name: 'Scrap Anarchy', kind: 'passive', maxPoints: 1, tier: 1, stats: { anarchy: 1 }, desc: () => `Kills and fully-empty reloads grant a SCRAP stack: +1.75% gun damage and +2% bullet spread EACH, up to 50. All of it spills if you go down.`, flavor: 'Kez stopped counting. That was the point.' },
        { id: 'oc_mutt', name: 'Mutt’s Constitution', kind: 'passive', maxPoints: 5, tier: 1, stats: { maxHealth: 0.05 }, desc: (p) => `+${P(5 * p)} max health.` },
        { id: 'oc_preshrunk', name: 'Preshrunk Chassis', kind: 'passive', maxPoints: 2, tier: 2, stats: { preshrunk: 25 }, desc: (p) => `+${25 * p} maximum SCRAP stacks.`, flavor: 'More pile. More problem. More YES.' },
        { id: 'oc_gristle', name: 'Gristle', kind: 'killskill', maxPoints: 5, tier: 2, stats: { shieldRate: 0.08 }, killskillDuration: 7, desc: (p) => `Kill Skill: +${P(8 * p)} shield recharge rate for 7s.` },
        { id: 'oc_shrapnel', name: 'Shrapnel Chew-Toys', kind: 'passive', maxPoints: 5, tier: 3, stats: { grenadeDamage: 0.07 }, desc: (p) => `+${P(7 * p)} grenade damage.` },
        { id: 'oc_scrapcash', name: 'Scrap for Cash', kind: 'passive', maxPoints: 5, tier: 4, stats: { cashBonus: 0.08 }, desc: (p) => `+${P(8 * p)} cash from all sources.` },
        { id: 'oc_stubborn', name: 'Old Yeller-Backer', kind: 'passive', maxPoints: 5, tier: 5, stats: { fflTime: 0.1 }, desc: (p) => `+${P(10 * p)} Fight For Your Life duration.` },
        { id: 'oc_capstone', name: 'The Nth Degree', kind: 'passive', maxPoints: 1, tier: 6, stats: { nthDegree: 1 }, desc: () => `CAPSTONE: every 7th bullet that hits an enemy RICOCHETS to another one for 50% damage.`, flavor: 'Math, but violent.' },
      ],
    },
  ],
  playable: true,
};

// ---------------------------------------------------------------------------
// THE RAVAGER — Tovah Grimm. RED MIST: a berserk stance of shockwave slams.
// Builds: overkill butcher who UNCAGES at low health (Slaughterhouse),
// tempo brawler (Adrenaline), spite tank that farms her own pain (Scar Tissue).
const ravager: ClassDef = {
  id: 'ravager', name: 'The Ravager', charName: 'Tovah Grimm',
  blurb: 'Former pit champion. Retired undefeated. Un-retired immediately.',
  playstyle: 'Get close and stay there: shockwave slams, overkill that FEEDS you, and a beast that comes out when the health bar runs low.',
  actionSkill: { id: 'red_mist', name: 'Red Mist', desc: 'See red: shed 40% of incoming damage and slam the ground in rolling shockwaves while it lasts. The yelling is load-bearing.', cooldown: 28, duration: 12 },
  trees: [
    {
      id: 'slaughterhouse',
      name: 'Slaughterhouse',
      blurb: 'The floor is a weapon. Your health bar is a trigger.',
      skills: [
        { id: 'sl_haymaker', name: 'Haymaker Rounds', kind: 'passive', maxPoints: 5, tier: 1, stats: { gunDamage: 0.04 }, desc: (p) => `+${P(4 * p)} gun damage.` },
        { id: 'sl_tremor', name: 'Tremor Sense', kind: 'passive', maxPoints: 5, tier: 1, stats: { splashDamage: 0.06 }, desc: (p) => `+${P(6 * p)} splash damage. The slam counts.` },
        { id: 'sl_followthrough', name: 'Follow-Through', kind: 'killskill', maxPoints: 5, tier: 2, stats: { gunDamage: 0.05 }, killskillDuration: 7, desc: (p) => `Kill Skill: +${P(5 * p)} gun damage for 7s.` },
        { id: 'sl_ringcraft', name: 'Ringcraft', kind: 'passive', maxPoints: 5, tier: 2, stats: { skillCooldown: 0.04 }, desc: (p) => `-${P(4 * p)} Red Mist cooldown.` },
        { id: 'sl_windup', name: 'Wind-Up', kind: 'passive', maxPoints: 5, tier: 3, stats: { turretDamage: 0.08 }, desc: (p) => `+${P(8 * p)} Red Mist slam damage.` },
        { id: 'sl_thrill', name: 'Thrill of the Kill', kind: 'passive', maxPoints: 5, tier: 4, stats: { thrillKill: 0.2 }, desc: (p) => `${P(20 * p)} of OVERKILL damage from killing blows comes back as healing.`, flavor: 'Dessert is included.' },
        { id: 'sl_quake', name: 'Mist: Ring the Bell', kind: 'augment', maxPoints: 1, tier: 5, augmentId: 'mist_quake', desc: () => `Red Mist slams reach much further.`, flavor: 'Everyone hears the bell. EVERYONE.' },
        { id: 'sl_capstone', name: 'Release the Beast', kind: 'passive', maxPoints: 1, tier: 6, stats: { releaseBeast: 1 }, desc: () => `CAPSTONE: trigger Red Mist at 35% health or less to FULLY HEAL, gain +25% gun damage and +50% slam damage for the whole Mist, and refund 60% of the cooldown.`, flavor: 'The pit never closed. It just moved inside her.' },
      ],
    },
    {
      id: 'adrenaline',
      name: 'Adrenaline',
      blurb: 'Anger is cardio.',
      skills: [
        { id: 'ad_roadwork', name: 'Roadwork', kind: 'passive', maxPoints: 5, tier: 1, stats: { moveSpeed: 0.04 }, desc: (p) => `+${P(4 * p)} move speed.` },
        { id: 'ad_slip', name: 'Slip the Jab', kind: 'passive', maxPoints: 5, tier: 1, stats: { shieldRate: 0.06 }, desc: (p) => `+${P(6 * p)} shield recharge rate.` },
        { id: 'ad_bell', name: 'Saved by the Bell', kind: 'killskill', maxPoints: 5, tier: 2, stats: { moveSpeed: 0.05, shieldRate: 0.06 }, killskillDuration: 7, desc: (p) => `Kill Skill: +${P(5 * p)} move speed and +${P(6 * p)} shield recharge for 7s.` },
        { id: 'ad_corner', name: 'Cut the Corner', kind: 'passive', maxPoints: 5, tier: 2, stats: { reloadSpeed: 0.05 }, desc: (p) => `+${P(5 * p)} reload speed.` },
        { id: 'ad_combination', name: 'Combination', kind: 'passive', maxPoints: 5, tier: 3, stats: { fireRate: 0.04 }, desc: (p) => `+${P(4 * p)} fire rate.` },
        { id: 'ad_secondround', name: 'Answer the Bell', kind: 'passive', maxPoints: 5, tier: 4, stats: { turretDuration: 0.08 }, desc: (p) => `+${P(8 * p)} Red Mist duration.` },
        { id: 'ad_bloodup', name: 'Blood Up', kind: 'killskill', maxPoints: 5, tier: 5, stats: { splashDamage: 0.06 }, killskillDuration: 7, desc: (p) => `Kill Skill: +${P(6 * p)} splash damage for 7s.` },
        { id: 'ad_capstone', name: 'No Corners, No Towel', kind: 'passive', maxPoints: 1, tier: 6, stats: { eyeStorm: 1 }, desc: () => `CAPSTONE: kills while Red Mist is up extend it by 2 seconds.`, flavor: 'The round ends when Tovah says.' },
      ],
    },
    {
      id: 'scar_tissue',
      name: 'Scar Tissue',
      blurb: 'Pain is information. File it under AMMUNITION.',
      skills: [
        { id: 'sc_chin', name: 'Iron Chin', kind: 'passive', maxPoints: 5, tier: 1, stats: { maxHealth: 0.05 }, desc: (p) => `+${P(5 * p)} max health.` },
        { id: 'sc_guard', name: 'High Guard', kind: 'passive', maxPoints: 5, tier: 1, stats: { shieldCapacity: 0.06 }, desc: (p) => `+${P(6 * p)} shield capacity.` },
        { id: 'sc_salt', name: 'Salt the Wound', kind: 'passive', maxPoints: 5, tier: 2, stats: { saltWound: 0.004 }, desc: (p) => `Taking a hit grants a SALT stack: +${P(0.4 * p)} gun damage each, up to 20. Stacks clear when your shield refills.`, flavor: 'Every bruise is a receipt. Tovah pays them FORWARD.' },
        { id: 'sc_clinch', name: 'Clinch', kind: 'killskill', maxPoints: 5, tier: 2, stats: { shieldRate: 0.08 }, killskillDuration: 7, desc: (p) => `Kill Skill: +${P(8 * p)} shield recharge for 7s.` },
        { id: 'sc_leather', name: 'Leather Lungs', kind: 'passive', maxPoints: 5, tier: 3, stats: { magSize: 0.05 }, desc: (p) => `+${P(5 * p)} magazine size.` },
        { id: 'sc_leech', name: 'Mist: Taste of Iron', kind: 'augment', maxPoints: 1, tier: 4, augmentId: 'mist_leech', desc: () => `Each Red Mist slam that connects feeds you 3% of your max health.`, flavor: 'Winner eats.' },
        { id: 'sc_cussed', name: 'Too Mean to Die', kind: 'passive', maxPoints: 5, tier: 5, stats: { fflTime: 0.1 }, desc: (p) => `+${P(10 * p)} Fight For Your Life duration.` },
        { id: 'sc_capstone', name: 'Receipts', kind: 'passive', maxPoints: 1, tier: 6, stats: { lightningRod: 1 }, desc: () => `CAPSTONE: 20% of damage you take while shields are up is returned to the nearest enemy. Itemized.`, flavor: 'Tovah remembers every hit. Out loud.' },
      ],
    },
  ],
  playable: true,
};

export const CLASSES: ClassDef[] = [gunsmith, stormcaller, houndmaster, ravager];

let playerClass: ClassDef = gunsmith;
export function getPlayerClass(): ClassDef { return playerClass; }
export function setPlayerClass(id: string): ClassDef {
  playerClass = CLASSES.find((c) => c.id === id && c.playable) ?? gunsmith;
  return playerClass;
}
/** Back-compat accessor: always reflects the selected class. */
export const PLAYER_CLASS = new Proxy({} as ClassDef, {
  get: (_t, prop) => (playerClass as unknown as Record<string | symbol, unknown>)[prop],
}) as ClassDef;

export function skillById(id: string): SkillDef | undefined {
  for (const c of CLASSES) for (const t of c.trees) for (const s of t.skills) if (s.id === id) return s;
  return undefined;
}

/** Points required in a tree to unlock a tier (5 per tier, capstone at 25). */
export function tierGate(tier: number): number { return (tier - 1) * 5; }
