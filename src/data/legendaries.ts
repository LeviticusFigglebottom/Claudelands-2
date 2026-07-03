// Legendary signatures — a fixed, gameplay-altering part + original red
// flavor text. When a legendary drops, the generator rolls the base gun then
// stamps one of these on top. All names/red text are original to this world.

import type { ElementId, WeaponType } from '../game/types';

export interface LegendaryDef {
  id: string;
  name: string;
  maker: string;
  type: WeaponType;
  redText: string;
  effectLabel: string;      // shown on the card under the red text
  /** Never rolls from the world pool; only granted by its quest. */
  questOnly?: boolean;
  /** A boss's signature: drops from that boss (elevated odds), never from
   *  the world pool — it's a chase item, not a lottery ticket. */
  dedicatedTo?: string;
  effect:                   // consumed by combat/player code
    | { kind: 'pellet_storm'; pellets: number }        // massive extra pellets
    | { kind: 'bouncing_orbs' }                        // shots arc lightning twice
    | { kind: 'vampire'; leech: number }               // heal % of damage
    | { kind: 'money_shot'; multPerMissing: number }   // more damage the emptier the mag
    | { kind: 'meteor'; radius: number }               // impacts rain a second explosion
    | { kind: 'echo_round'; delay: number };           // every hit repeats itself once
  forceElement?: ElementId;
}

export const LEGENDARIES: LegendaryDef[] = [
  {
    id: 'leg_hail_mary', name: 'Hail Mary', maker: 'vulkram', type: 'launcher',
    redText: '“Throw hands. Then throw bigger hands.”',
    effectLabel: 'Impacts call down a second, delayed explosion.',
    effect: { kind: 'meteor', radius: 5 }, forceElement: 'blast',
  },
  {
    id: 'leg_gossip', name: 'The Gossip', maker: 'aetheric', type: 'smg',
    redText: '“She tells everyone. Everyone.”',
    effectLabel: 'Volt hits chain twice instead of once.',
    effect: { kind: 'bouncing_orbs' }, forceElement: 'volt',
  },
  {
    id: 'leg_tick', name: 'Greedy Tick', maker: 'ratworks', type: 'pistol',
    redText: '“Sukk the marro out uv life.”',
    effectLabel: 'Heals you for 4% of damage dealt.',
    effect: { kind: 'vampire', leech: 0.04 },
  },
  {
    id: 'leg_last_word', name: 'Last Word', maker: 'cordwood', type: 'sniper',
    redText: '“Everyone gets one. Make yours punctuation.”',
    effectLabel: 'Damage climbs as the magazine empties (+15%/missing round).',
    effect: { kind: 'money_shot', multPerMissing: 0.15 },
  },
  {
    id: 'leg_confetti', name: 'Confetti Cannon', maker: 'briskco', type: 'shotgun',
    redText: '“Congratulations!!! (on the murder)”',
    effectLabel: 'Fires a festive wall of extra pellets.',
    effect: { kind: 'pellet_storm', pellets: 6 },
  },
  {
    id: 'leg_deja_vu', name: 'Déjà Vu', maker: 'lumen', type: 'ar',
    redText: '“You’ve read this red text before.”',
    effectLabel: 'Every hit repeats itself a beat later.',
    effect: { kind: 'echo_round', delay: 0.35 },
  },
  {
    id: 'leg_avalanche', name: 'The Avalanche', maker: 'vulkram', type: 'shotgun',
    redText: '“It comes down all at once.”',
    effectLabel: 'A wall of freezing pellets; impacts call a second, delayed burst.',
    effect: { kind: 'meteor', radius: 4 }, forceElement: 'rime',
    dedicatedTo: 'old_man_avalanche',
  },
  {
    id: 'leg_smalltalk', name: 'Small Talk', maker: 'aetheric', type: 'pistol',
    redText: '“So. Cold enough for ya?”',
    effectLabel: 'Volt hits chain twice instead of once.',
    effect: { kind: 'bouncing_orbs' }, forceElement: 'volt',
  },
  // ---- boss signatures (dedicated drops; never in the world pool)
  {
    id: 'leg_trashjesty', name: 'His Trashjesty', maker: 'ratworks', type: 'shotgun',
    redText: '“One man’s garbage is one man’s ARSENAL.”',
    effectLabel: 'Fires a royal court of extra pellets.',
    effect: { kind: 'pellet_storm', pellets: 8 },
    dedicatedTo: 'gutterball',
  },
  {
    id: 'leg_site_policy', name: 'Site Policy', maker: 'lumen', type: 'ar',
    redText: '“Violations will be repeated. For emphasis.”',
    effectLabel: 'Every volt hit repeats itself a beat later.',
    effect: { kind: 'echo_round', delay: 0.3 }, forceElement: 'volt',
    dedicatedTo: 'warden_prime',
  },
  {
    id: 'leg_litany', name: 'The Litany', maker: 'cordwood', type: 'sniper',
    redText: '“Say it again. Warmer.”',
    effectLabel: 'Burning rounds; damage climbs as the magazine empties (+18%/missing).',
    effect: { kind: 'money_shot', multPerMissing: 0.18 }, forceElement: 'ember',
    dedicatedTo: 'saint_furnace',
  },
  {
    id: 'leg_pruning_song', name: 'Pruning Song', maker: 'aetheric', type: 'smg',
    redText: '“It grows back. You won’t.”',
    effectLabel: 'Corrosive spray that heals you for 5% of damage dealt.',
    effect: { kind: 'vampire', leech: 0.05 }, forceElement: 'bile',
    dedicatedTo: 'bloom_mother',
  },
  {
    id: 'leg_broadside', name: 'Broadside', maker: 'vulkram', type: 'pistol',
    redText: '“All guns. One hand.”',
    effectLabel: 'Every trigger pull fires a full naval volley of extra pellets.',
    effect: { kind: 'pellet_storm', pellets: 6 },
    dedicatedTo: 'admiral_anchorhead',
  },
  {
    id: 'leg_paydirt', name: 'Pay Dirt', maker: 'vulkram', type: 'launcher',
    redText: '“Strike the earth. The earth strikes back.”',
    effectLabel: 'Impacts call down a second, delayed cave-in.',
    effect: { kind: 'meteor', radius: 5.5 }, forceElement: 'blast',
    dedicatedTo: 'mother_lode',
  },
  // ---- quest-unique rewards (side jobs only; never in the world drop pool)
  {
    id: 'leg_ossuary', name: 'Ossuary', maker: 'vulkram', type: 'shotgun',
    redText: '“The Boneyard tithes in kind.”',
    effectLabel: 'Fires a rattling wall of extra pellets; impacts echo a second burst.',
    effect: { kind: 'pellet_storm', pellets: 7 }, questOnly: true,
  },
  {
    id: 'leg_lake_effect', name: 'Lake Effect', maker: 'aetheric', type: 'smg',
    redText: '“The thing under the ice says hi.”',
    effectLabel: 'Every freezing hit repeats itself a beat later.',
    effect: { kind: 'echo_round', delay: 0.35 }, forceElement: 'rime', questOnly: true,
  },
  {
    id: 'leg_adjuster', name: 'The Adjuster', maker: 'cordwood', type: 'sniper',
    redText: '“CLAIM STATUS: DENIED. APPEAL STATUS: DENIED. YOU: DENIED.”',
    effectLabel: 'Damage climbs steeply as the magazine empties (+20%/missing round).',
    effect: { kind: 'money_shot', multPerMissing: 0.2 }, questOnly: true,
  },
  {
    id: 'leg_undertow', name: 'The Undertow', maker: 'aetheric', type: 'smg',
    redText: '“What goes out comes back. Wetter.”',
    effectLabel: 'Freezing spray that heals you for 5% of damage dealt.',
    effect: { kind: 'vampire', leech: 0.05 }, forceElement: 'rime', questOnly: true,
  },
  {
    id: 'leg_lodestone', name: 'Lodestone', maker: 'aetheric', type: 'pistol',
    redText: '“Everything down here points at you.”',
    effectLabel: 'Volt hits chain twice instead of once.',
    effect: { kind: 'bouncing_orbs' }, forceElement: 'volt', questOnly: true,
  },
];

export function legendaryFor(type: WeaponType, roll: number): LegendaryDef | null {
  const pool = LEGENDARIES.filter((l) => l.type === type && !l.questOnly && !l.dedicatedTo);
  if (pool.length === 0) {
    const world = LEGENDARIES.filter((l) => !l.questOnly && !l.dedicatedTo);
    return world[Math.floor(roll * world.length) % world.length];
  }
  return pool[Math.floor(roll * pool.length) % pool.length];
}

/** A boss's signature drops (by enemy def id). */
export function dedicatedFor(bossId: string): LegendaryDef[] {
  return LEGENDARIES.filter((l) => l.dedicatedTo === bossId);
}
