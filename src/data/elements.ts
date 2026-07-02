// The five damage elements (+ plain kinetic). Each element owns a color
// language, a status effect, and a matrix of multipliers vs the three
// defense layers. Combat consults this table for every hit — adding an
// element later means adding a row here plus a particle recipe.

import type { DefenseLayer, ElementId } from '../game/types';

export interface ElementDef {
  id: ElementId;
  name: string;
  statusName: string;        // what the status effect is called
  color: number;             // primary VFX / damage-number color
  colorAlt: number;          // secondary particle color
  css: string;               // damage number CSS color
  vs: Record<DefenseLayer, number>;
  dotFraction: number;       // status DPS as a fraction of hit damage
  dotDuration: number;       // seconds
  chains?: boolean;          // volt arcs to nearby enemies
  slows?: boolean;           // rime slows and amplifies
  splash?: boolean;          // blast always splashes
  blurb: string;             // item-card one-liner
}

export const ELEMENTS: Record<ElementId, ElementDef> = {
  kinetic: {
    id: 'kinetic', name: 'Kinetic', statusName: '',
    color: 0xffffff, colorAlt: 0xffe0a0, css: '#ffffff',
    vs: { shield: 1.0, armor: 1.0, flesh: 1.0 },
    dotFraction: 0, dotDuration: 0,
    blurb: '',
  },
  ember: {
    id: 'ember', name: 'Ember', statusName: 'Ignited',
    color: 0xff6a1a, colorAlt: 0xffc93c, css: '#ff8c3b',
    vs: { shield: 0.75, armor: 0.6, flesh: 1.6 },
    dotFraction: 0.5, dotDuration: 4,
    blurb: 'Sets flesh alight. Meat burns. Metal shrugs.',
  },
  bile: {
    id: 'bile', name: 'Bile', statusName: 'Corroding',
    color: 0x7dff2a, colorAlt: 0xc4ff58, css: '#8fff3d',
    vs: { shield: 0.75, armor: 1.65, flesh: 0.85 },
    dotFraction: 0.45, dotDuration: 5,
    blurb: 'Eats armor like cheap stew. Keep off skin. Or don’t.',
  },
  volt: {
    id: 'volt', name: 'Volt', statusName: 'Overloaded',
    color: 0x38c8ff, colorAlt: 0xb2ecff, css: '#54d4ff',
    vs: { shield: 2.1, armor: 0.8, flesh: 0.9 },
    dotFraction: 0.35, dotDuration: 2.5,
    chains: true,
    blurb: 'Pops shields and arcs to whoever’s standing too close.',
  },
  rime: {
    id: 'rime', name: 'Rime', statusName: 'Frostbitten',
    color: 0x9ad8e8, colorAlt: 0xe4f7ff, css: '#bfe9f5',
    vs: { shield: 0.9, armor: 1.0, flesh: 1.0 },
    dotFraction: 0.15, dotDuration: 3.5,
    slows: true,
    blurb: 'Slows targets to a crawl — and frostbitten meat takes +25% damage.',
  },
  blast: {
    id: 'blast', name: 'Blast', statusName: '',
    color: 0xffd23c, colorAlt: 0xff8438, css: '#ffd23c',
    vs: { shield: 0.9, armor: 1.25, flesh: 1.1 },
    dotFraction: 0, dotDuration: 0,
    splash: true,
    blurb: 'The subtle art of making everything nearby stop existing.',
  },
};

/** Damage multiplier bonus taken by Frostbitten targets. */
export const RIME_AMP = 1.25;
/** Movement/fire-rate slow applied by Frostbitten. */
export const RIME_SLOW = 0.45;
/** Volt chain: fraction of hit damage arced to one nearby enemy. */
export const VOLT_CHAIN_FRACTION = 0.5;
export const VOLT_CHAIN_RANGE = 9;

export const ELEMENT_LIST = Object.values(ELEMENTS);
export const COMBAT_ELEMENTS: ElementId[] = ['ember', 'bile', 'volt', 'rime', 'blast'];
