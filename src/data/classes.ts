// Playable classes. Pass 1 ships THE GUNSMITH fully playable (action skill +
// three 6-tier trees); the other three are data stubs proving the format
// scales. Skills are pure data: passive stat mods, kill skills (timed buffs
// on kill), and action-skill augments keyed by id.

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
  actionSkill: { id: string; name: string; desc: string; cooldown: number; duration: number };
  trees: SkillTreeDef[];
  playable: boolean;
}

const P = (n: number, unit = '%') => `${n}${unit}`;

// ---------------------------------------------------------------------------
// THE GUNSMITH — Harlan Vex. Deploys the SENTRY RIG, a welded auto-turret.
const gunsmith: ClassDef = {
  id: 'gunsmith',
  name: 'The Gunsmith',
  charName: 'Harlan Vex',
  blurb: 'Ex-armory foreman of the Helix Combine. Quit loudly. Took the tools.',
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
      blurb: 'Guns, but more so.',
      skills: [
        { id: 'hi_trigger', name: 'Trigger Discipline', kind: 'passive', maxPoints: 5, tier: 1, stats: { fireRate: 0.04 }, desc: (p) => `+${P(4 * p)} fire rate.` },
        { id: 'hi_racket', name: 'Full Metal Racket', kind: 'passive', maxPoints: 5, tier: 1, stats: { gunDamage: 0.04 }, desc: (p) => `+${P(4 * p)} gun damage.` },
        { id: 'hi_powder', name: 'Powder Keg', kind: 'passive', maxPoints: 5, tier: 2, stats: { splashDamage: 0.06 }, desc: (p) => `+${P(6 * p)} splash/explosive damage.` },
        { id: 'hi_paid', name: 'Paid in Lead', kind: 'killskill', maxPoints: 5, tier: 2, stats: { fireRate: 0.05, reloadSpeed: 0.05 }, killskillDuration: 7, desc: (p) => `Kill Skill: +${P(5 * p)} fire rate and reload speed for 7s.` },
        { id: 'hi_chamber', name: 'Two in the Chamber', kind: 'passive', maxPoints: 5, tier: 3, stats: { freeAmmoChance: 0.05 }, desc: (p) => `${P(5 * p)} chance shots don’t consume ammo.` },
        { id: 'hi_dragons', name: 'Spicy Handloads', kind: 'passive', maxPoints: 5, tier: 4, stats: { elemChance: 0.05, elemDamage: 0.04 }, desc: (p) => `+${P(5 * p)} elemental proc chance, +${P(4 * p)} elemental damage.` },
        { id: 'hi_incendiary', name: 'Rig: Dragonfire', kind: 'augment', maxPoints: 1, tier: 5, augmentId: 'rig_ember', desc: () => `Sentry Rig fires Ember rounds that ignite targets.`, flavor: 'The rig learned arson. You taught it.' },
        { id: 'hi_overkill', name: 'Overkill', kind: 'passive', maxPoints: 1, tier: 6, stats: { overkill: 1 }, desc: () => `CAPSTONE: overkill damage from a killing blow carries into your next shot.`, flavor: 'Waste not.' },
      ],
    },
    {
      id: 'ironworks',
      name: 'Ironworks',
      blurb: 'The rig provides. Feed the rig.',
      skills: [
        { id: 'iw_plating', name: 'Boiler Plating', kind: 'passive', maxPoints: 5, tier: 1, stats: { maxHealth: 0.05 }, desc: (p) => `+${P(5 * p)} max health.` },
        { id: 'iw_grease', name: 'Elbow Grease', kind: 'passive', maxPoints: 5, tier: 1, stats: { skillCooldown: 0.04 }, desc: (p) => `-${P(4 * p)} Sentry Rig cooldown.` },
        { id: 'iw_caliber', name: 'Bigger Bolts', kind: 'passive', maxPoints: 5, tier: 2, stats: { turretDamage: 0.08 }, desc: (p) => `+${P(8 * p)} Sentry Rig damage.` },
        { id: 'iw_surplus', name: 'Surplus Shielding', kind: 'passive', maxPoints: 5, tier: 2, stats: { shieldCapacity: 0.06 }, desc: (p) => `+${P(6 * p)} shield capacity.` },
        { id: 'iw_longhaul', name: 'The Long Haul', kind: 'passive', maxPoints: 5, tier: 3, stats: { turretDuration: 0.1 }, desc: (p) => `+${P(10 * p)} Sentry Rig duration.` },
        { id: 'iw_magnet', name: 'Rig: Scrap Magnet', kind: 'augment', maxPoints: 1, tier: 4, augmentId: 'rig_taunt', desc: () => `Sentry Rig taunts nearby enemies to attack it instead of you.`, flavor: 'Hey! You! Shoot the furniture!' },
        { id: 'iw_secondwind', name: 'Stubborn Bastard', kind: 'passive', maxPoints: 5, tier: 5, stats: { fflTime: 0.1 }, desc: (p) => `+${P(10 * p)} Fight For Your Life duration.` },
        { id: 'iw_twins', name: 'The Twins', kind: 'augment', maxPoints: 1, tier: 6, augmentId: 'rig_twins', desc: () => `CAPSTONE: deploy TWO Sentry Rigs.`, flavor: 'Double the judgement.' },
      ],
    },
    {
      id: 'payday',
      name: 'Payday',
      blurb: 'Violence is a business expense.',
      skills: [
        { id: 'pd_hustle', name: 'Hustle', kind: 'killskill', maxPoints: 5, tier: 1, stats: { moveSpeed: 0.04 }, killskillDuration: 7, desc: (p) => `Kill Skill: +${P(4 * p)} move speed for 7s.` },
        { id: 'pd_scrounge', name: 'Scrounger', kind: 'passive', maxPoints: 5, tier: 1, stats: { lootLuck: 0.04 }, desc: (p) => `+${P(4 * p)} rare loot luck.` },
        { id: 'pd_margin', name: 'Profit Margin', kind: 'passive', maxPoints: 5, tier: 2, stats: { cashBonus: 0.08 }, desc: (p) => `+${P(8 * p)} cash from all sources.` },
        { id: 'pd_adrenaline', name: 'Blood Bonus', kind: 'killskill', maxPoints: 5, tier: 2, stats: { gunDamage: 0.04 }, killskillDuration: 7, desc: (p) => `Kill Skill: +${P(4 * p)} gun damage for 7s. Stacks with itself in your heart.` },
        { id: 'pd_deeppockets', name: 'Deep Pockets', kind: 'passive', maxPoints: 5, tier: 3, stats: { magSize: 0.05 }, desc: (p) => `+${P(5 * p)} magazine size.` },
        { id: 'pd_severance', name: 'Severance Package', kind: 'passive', maxPoints: 5, tier: 4, stats: { grenadeDamage: 0.08 }, desc: (p) => `+${P(8 * p)} grenade damage.` },
        { id: 'pd_ledger', name: 'The Ledger', kind: 'killskill', maxPoints: 5, tier: 5, stats: { shieldRate: 0.08 }, killskillDuration: 7, desc: (p) => `Kill Skill: +${P(8 * p)} shield recharge rate for 7s.` },
        { id: 'pd_jackpot', name: 'Jackpot', kind: 'passive', maxPoints: 1, tier: 6, stats: { jackpot: 1 }, desc: () => `CAPSTONE: critical kills refund a full magazine and rain bonus cash.`, flavor: 'The house always wins. Be the house.' },
      ],
    },
  ],
  playable: true,
};

// --------------------------------------------------------------------------
// Data stubs — prove the format; pass 2 wires them up.
const stormcaller: ClassDef = {
  id: 'stormcaller',
  name: 'The Stormcaller',
  charName: 'Sable Anders',
  blurb: 'Struck by lightning six times. On a first-name basis with the seventh.',
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
      blurb: 'The elements owe YOU money.',
      skills: [
        { id: 'st_conductor', name: 'Conductor', kind: 'passive', maxPoints: 5, tier: 1, stats: { elemDamage: 0.05 }, desc: (p) => `+${P(5 * p)} elemental damage.` },
        { id: 'st_charged', name: 'Charged Rounds', kind: 'passive', maxPoints: 5, tier: 1, stats: { elemChance: 0.05 }, desc: (p) => `+${P(5 * p)} elemental proc chance.` },
        { id: 'st_grounded', name: 'Grounded', kind: 'passive', maxPoints: 5, tier: 2, stats: { shieldCapacity: 0.06 }, desc: (p) => `+${P(6 * p)} shield capacity.` },
        { id: 'st_aftershock', name: 'Aftershock', kind: 'killskill', maxPoints: 5, tier: 2, stats: { elemDamage: 0.06 }, killskillDuration: 7, desc: (p) => `Kill Skill: +${P(6 * p)} elemental damage for 7s.` },
        { id: 'st_arcflash', name: 'Arc Flash', kind: 'passive', maxPoints: 5, tier: 3, stats: { fireRate: 0.04 }, desc: (p) => `+${P(4 * p)} fire rate. Lightning is a tempo.` },
        { id: 'st_stormfront', name: 'Stormfront', kind: 'passive', maxPoints: 5, tier: 4, stats: { skillCooldown: 0.05 }, desc: (p) => `-${P(5 * p)} Tempest Shell cooldown.` },
        { id: 'st_forked', name: 'Shell: Forked Sky', kind: 'augment', maxPoints: 1, tier: 5, augmentId: 'tempest_fork', desc: () => `Tempest arcs strike TWO targets at once.`, flavor: 'Why choose?' },
        { id: 'st_capstone', name: 'Live Wire', kind: 'passive', maxPoints: 1, tier: 6, stats: { liveWire: 1 }, desc: () => `CAPSTONE: while Tempest Shell is active, your shots NEVER consume ammo.`, flavor: 'The storm provides.' },
      ],
    },
    {
      id: 'squall',
      name: 'Squall',
      blurb: 'Move like weather. Arrive like news.',
      skills: [
        { id: 'sq_tailwind', name: 'Tailwind', kind: 'passive', maxPoints: 5, tier: 1, stats: { moveSpeed: 0.04 }, desc: (p) => `+${P(4 * p)} move speed.` },
        { id: 'sq_slipstream', name: 'Slipstream', kind: 'passive', maxPoints: 5, tier: 1, stats: { reloadSpeed: 0.05 }, desc: (p) => `+${P(5 * p)} reload speed.` },
        { id: 'sq_downdraft', name: 'Downdraft', kind: 'killskill', maxPoints: 5, tier: 2, stats: { moveSpeed: 0.05, fireRate: 0.04 }, killskillDuration: 7, desc: (p) => `Kill Skill: +${P(5 * p)} move speed and +${P(4 * p)} fire rate for 7s.` },
        { id: 'sq_pressure', name: 'Pressure Drop', kind: 'passive', maxPoints: 5, tier: 2, stats: { gunDamage: 0.04 }, desc: (p) => `+${P(4 * p)} gun damage.` },
        { id: 'sq_updraft', name: 'Updraft', kind: 'passive', maxPoints: 5, tier: 3, stats: { magSize: 0.05 }, desc: (p) => `+${P(5 * p)} magazine size.` },
        { id: 'sq_stormchaser', name: 'Storm Chaser', kind: 'passive', maxPoints: 5, tier: 4, stats: { turretDuration: 0.08 }, desc: (p) => `+${P(8 * p)} Tempest Shell duration.` },
        { id: 'sq_squallline', name: 'Shell: Squall Line', kind: 'augment', maxPoints: 1, tier: 5, augmentId: 'tempest_haste', desc: () => `Tempest Shell also grants +25% move speed and reload speed.`, flavor: 'Outrun the thunder. Rude, but possible.' },
        { id: 'sq_capstone', name: 'Eye of the Storm', kind: 'passive', maxPoints: 1, tier: 6, stats: { eyeStorm: 1 }, desc: () => `CAPSTONE: killing a target while Tempest Shell is active extends the Shell by 2 seconds.`, flavor: 'The weather likes a show.' },
      ],
    },
    {
      id: 'groundwire',
      name: 'Groundwire',
      blurb: 'You can\u2019t shock what\u2019s already shocking.',
      skills: [
        { id: 'gw_insulated', name: 'Insulated', kind: 'passive', maxPoints: 5, tier: 1, stats: { maxHealth: 0.05 }, desc: (p) => `+${P(5 * p)} max health.` },
        { id: 'gw_trickle', name: 'Trickle Charge', kind: 'passive', maxPoints: 5, tier: 1, stats: { shieldRate: 0.06 }, desc: (p) => `+${P(6 * p)} shield recharge rate.` },
        { id: 'gw_surge', name: 'Surge Protector', kind: 'killskill', maxPoints: 5, tier: 2, stats: { shieldRate: 0.08 }, killskillDuration: 7, desc: (p) => `Kill Skill: +${P(8 * p)} shield recharge for 7s.` },
        { id: 'gw_breaker', name: 'Breaker Box', kind: 'passive', maxPoints: 5, tier: 2, stats: { splashDamage: 0.05 }, desc: (p) => `+${P(5 * p)} splash damage.` },
        { id: 'gw_capacitor', name: 'Capacitor', kind: 'passive', maxPoints: 5, tier: 3, stats: { grenadeDamage: 0.07 }, desc: (p) => `+${P(7 * p)} grenade damage.` },
        { id: 'gw_stubborn', name: 'Rubber Soles', kind: 'passive', maxPoints: 5, tier: 4, stats: { fflTime: 0.1 }, desc: (p) => `+${P(10 * p)} Fight For Your Life duration.` },
        { id: 'gw_nova', name: 'Shell: Thunderclap', kind: 'augment', maxPoints: 1, tier: 5, augmentId: 'tempest_nova', desc: () => `Tempest Shell detonates a Volt nova when it ends.`, flavor: 'Always leave on a bang.' },
        { id: 'gw_capstone', name: 'Lightning Rod', kind: 'passive', maxPoints: 1, tier: 6, stats: { lightningRod: 1 }, desc: () => `CAPSTONE: 20% of damage you take while shields are up is dealt back as Volt to your attacker\u2019s side of the field (nearest enemy).`, flavor: 'Return to sender.' },
      ],
    },
  ],
  playable: true,
};
const houndmaster: ClassDef = {
  id: 'houndmaster', name: 'The Houndmaster', charName: 'Kez Okafor',
  blurb: 'Rebuilt a scrap-hound from a wreck. It rebuilt her right back.',
  actionSkill: { id: 'iron_hound', name: 'Iron Hound', desc: 'Summon RIVET, a bounding scrap-hound that mauls and fetches (mostly mauls).', cooldown: 30, duration: 16 },
  trees: [], playable: false,
};
const ravager: ClassDef = {
  id: 'ravager', name: 'The Ravager', charName: 'Tovah Grimm',
  blurb: 'Former pit champion. Retired undefeated. Un-retired immediately.',
  actionSkill: { id: 'red_mist', name: 'Red Mist', desc: 'Holster your guns and go in swinging: massive melee damage, damage resistance, and a lot of yelling.', cooldown: 28, duration: 12 },
  trees: [], playable: false,
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
