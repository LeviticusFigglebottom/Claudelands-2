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
  },
  {
    id: 'leg_smalltalk', name: 'Small Talk', maker: 'aetheric', type: 'pistol',
    redText: '“So. Cold enough for ya?”',
    effectLabel: 'Volt hits chain twice instead of once.',
    effect: { kind: 'bouncing_orbs' }, forceElement: 'volt',
  },
];

export function legendaryFor(type: WeaponType, roll: number): LegendaryDef | null {
  const pool = LEGENDARIES.filter((l) => l.type === type);
  if (pool.length === 0) return LEGENDARIES[Math.floor(roll * LEGENDARIES.length) % LEGENDARIES.length];
  return pool[Math.floor(roll * pool.length) % pool.length];
}
