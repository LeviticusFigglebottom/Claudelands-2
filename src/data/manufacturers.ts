// Six original arms manufacturers. Each has (1) a mechanical gimmick, (2) a
// visual/material language consumed by gunmesh.ts, and (3) stat biases +
// reload behavior. A gun's body part decides its manufacturer; you should be
// able to name the maker from the silhouette alone.

import type { StatMods } from '../game/types';

export type MakerGimmick =
  | 'splash'          // VULKRAM: every shot gains explosive splash
  | 'laser_focus'     // LUMEN: zero recoil, accuracy tightens while firing
  | 'mag_dump'        // RATWORKS: comical mag size, spread, fire rate
  | 'always_elemental'// AETHERIC: guaranteed element, 2 ammo per boosted shot
  | 'crit_ricochet'   // CORDWOOD: no elements, huge crit, crits ricochet
  | 'throw_reload';   // BRISKCO: reload = throw the gun, it explodes; free replacement digistructs

export interface ManufacturerDef {
  id: string;
  name: string;
  tagline: string;             // card flavor
  gimmick: MakerGimmick;
  gimmickLabel: string;        // one-liner shown on the item card
  // visual language
  palette: { primary: number; secondary: number; accent: number };
  finish: 'riveted' | 'panel' | 'junk' | 'runic' | 'timber' | 'molded';
  silhouette: 'brick' | 'sleek' | 'cobbled' | 'coiled' | 'classic' | 'toy';
  // stat bias applied on top of part rolls
  bias: StatMods;
  reloadStyle: 'heavy_clunk' | 'smooth_snap' | 'slap_rattle' | 'hum_glow' | 'lever_flick' | 'toss_new';
  shotSound: 'heavy' | 'clean' | 'junk' | 'arcane' | 'antique' | 'plastic';
  namePool: string[];          // gun name nouns in the maker's voice
}

export const MANUFACTURERS: Record<string, ManufacturerDef> = {
  vulkram: {
    id: 'vulkram',
    name: 'VULKRAM',
    tagline: 'Forged loud. Warranty void on ignition.',
    gimmick: 'splash',
    gimmickLabel: 'Every round detonates on impact (splash damage).',
    palette: { primary: 0x8c2f24, secondary: 0x4a4440, accent: 0xffb43c },
    finish: 'riveted',
    silhouette: 'brick',
    bias: { damage: 1.35, fireRate: 0.7, magSize: 0.75, reloadTime: 1.3, accuracy: 0.9, recoil: 1.35 },
    reloadStyle: 'heavy_clunk',
    shotSound: 'heavy',
    namePool: ['Anvil', 'Slag Hammer', 'Doorbell', 'Grudge', 'Pile Driver', 'Argument Ender', 'Kiln'],
  },
  lumen: {
    id: 'lumen',
    name: 'Lumen Dynamics',
    tagline: 'Precision is a moral position.',
    gimmick: 'laser_focus',
    gimmickLabel: 'Zero recoil. Sustained fire tightens accuracy.',
    palette: { primary: 0xe8e4da, secondary: 0x2ba8a0, accent: 0x9ef2ea },
    finish: 'panel',
    silhouette: 'sleek',
    bias: { damage: 0.95, accuracy: 1.3, recoil: 0.15, reloadTime: 0.9, critBonus: 0.1 },
    reloadStyle: 'smooth_snap',
    shotSound: 'clean',
    namePool: ['Theorem', 'Auditor', 'White Paper', 'Metronome', 'Peer Review', 'Fine Print', 'Compliance'],
  },
  ratworks: {
    id: 'ratworks',
    name: 'RATWURKS',
    tagline: 'Built frum stuff we faund. Praboblee safe.',
    gimmick: 'mag_dump',
    gimmickLabel: 'Comically oversized magazine. Accuracy sold separately.',
    palette: { primary: 0x6b6455, secondary: 0x9c5a28, accent: 0xc8b428 },
    finish: 'junk',
    silhouette: 'cobbled',
    bias: { magSize: 2.1, fireRate: 1.35, accuracy: 0.62, damage: 0.85, reloadTime: 1.15, recoil: 1.25 },
    reloadStyle: 'slap_rattle',
    shotSound: 'junk',
    namePool: ['Shooty Boy', 'Bang Stik', 'Ratt King', 'Skreemer', 'Chatterbawks', 'Spraypray', 'Bullit Hoze'],
  },
  aetheric: {
    id: 'aetheric',
    name: 'Ætheric Concern',
    tagline: 'The elements owe us money.',
    gimmick: 'always_elemental',
    gimmickLabel: 'Always elemental. Draws 2 ammo per empowered shot.',
    palette: { primary: 0x2c2440, secondary: 0x5a3f8a, accent: 0xc06bff },
    finish: 'runic',
    silhouette: 'coiled',
    bias: { damage: 1.05, elemChance: 0.35, fireRate: 0.9, accuracy: 1.1 },
    reloadStyle: 'hum_glow',
    shotSound: 'arcane',
    namePool: ['Hypothesis', 'Sooth Sayer', 'Candle', 'Widow’s Lantern', 'Murmur', 'Long Winter', 'Grimoire'],
  },
  cordwood: {
    id: 'cordwood',
    name: 'Cordwood & Kin',
    tagline: 'If it needed batteries, we wouldn’t sell it.',
    gimmick: 'crit_ricochet',
    gimmickLabel: 'Never elemental. Critical hits ricochet to a second target.',
    palette: { primary: 0x6e4a2a, secondary: 0xb08d55, accent: 0xd8b878 },
    finish: 'timber',
    silhouette: 'classic',
    bias: { damage: 1.25, critBonus: 0.35, fireRate: 0.85, accuracy: 1.15, recoil: 1.2, magSize: 0.8 },
    reloadStyle: 'lever_flick',
    shotSound: 'antique',
    namePool: ['Heirloom', 'Widowmaker Jr.', 'Grandpa’s Word', 'Last Sermon', 'Ol’ Regret', 'Porch Light', 'Debt Collector'],
  },
  briskco: {
    id: 'briskco',
    name: 'BRISKCO!',
    tagline: 'Don’t reload. Litter.',
    gimmick: 'throw_reload',
    gimmickLabel: 'Reload throws the gun as a grenade. A new one prints instantly.',
    palette: { primary: 0xd8d0c4, secondary: 0x2f7dff, accent: 0xff5a86 },
    finish: 'molded',
    silhouette: 'toy',
    bias: { damage: 0.9, reloadTime: 0.55, magSize: 0.9, fireRate: 1.1, accuracy: 0.95 },
    reloadStyle: 'toss_new',
    shotSound: 'plastic',
    namePool: ['Value Meal', 'Coupon', 'Refund', 'Impulse Buy', 'Free Sample', 'Store Brand', 'Loyalty Card'],
  },
};

export const MAKER_LIST = Object.values(MANUFACTURERS);
export function makerById(id: string): ManufacturerDef { return MANUFACTURERS[id] ?? MAKER_LIST[0]; }
