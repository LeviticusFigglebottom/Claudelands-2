// Gear modifiers — the chaos-gear layer: any weapon can roll one, rarer
// tiers hit harder. A modifier multiplies the gun's final stats, prefixes
// the name, paints its own trim on the mesh, and bumps the price. Pure data.

import type { Rng } from '../util/rng';

export interface GunModifierDef {
  id: string;
  name: string;          // name prefix, e.g. "Chaotic"
  css: string;           // UI + trim color
  color: number;
  chance: number;        // roll chance (checked in tier order, rarest first)
  blurb: string;
  mods: { damage?: number; fireRate?: number; magSize?: number; reloadTime?: number; elemChance?: number };
  valueMult: number;
}

export const GUN_MODIFIERS: GunModifierDef[] = [
  {
    id: 'ascended', name: 'ASCENDED', css: '#ffd23c', color: 0xffd23c, chance: 0.004,
    blurb: '+55% damage, +10% fire rate, faster reload. It remembers being a god.',
    mods: { damage: 1.55, fireRate: 1.1, reloadTime: 0.88 }, valueMult: 4,
  },
  {
    id: 'primordial', name: 'Primordial', css: '#6bffd8', color: 0x6bffd8, chance: 0.012,
    blurb: '+38% damage, +12% magazine, +10% elemental chance. Older than the Combine.',
    mods: { damage: 1.38, magSize: 1.12, elemChance: 0.1 }, valueMult: 3,
  },
  {
    id: 'volatile', name: 'Volatile', css: '#ff6bd0', color: 0xff6bd0, chance: 0.03,
    blurb: '+24% damage, +8% fire rate. Handle loudly.',
    mods: { damage: 1.24, fireRate: 1.08 }, valueMult: 2.2,
  },
  {
    id: 'chaotic', name: 'Chaotic', css: '#b46bff', color: 0xb46bff, chance: 0.07,
    blurb: '+13% damage. The serial number is screaming.',
    mods: { damage: 1.13 }, valueMult: 1.6,
  },
];

export function modifierById(id: string | undefined): GunModifierDef | null {
  return id ? GUN_MODIFIERS.find((m) => m.id === id) ?? null : null;
}

/** Roll for a modifier — rarest checked first, luck nudges the odds. */
export function rollModifier(rng: Rng, luck = 0): GunModifierDef | null {
  const boost = 1 + Math.min(luck, 2) * 0.35;
  for (const m of GUN_MODIFIERS) {
    if (rng() < m.chance * boost) return m;
  }
  return null;
}
