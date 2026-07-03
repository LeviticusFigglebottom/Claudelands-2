// Central game state + the event bus. Progression (XP/levels/skill points),
// inventory, equipped gear, money/ammo, and the account-wide GRIT RANK
// meta-progression (persisted to localStorage across characters/runs).

import { EventBus } from '../util/events';
import type { ClassModInstance, ElementId, GrenadeModInstance, ItemInstance, RelicInstance, ShieldInstance, WeaponInstance, WeaponType } from './types';
import { WEAPON_TYPES } from '../data/weapons';
import { PLAYER_CLASS, skillById } from '../data/classes';

export interface GameEvents extends Record<string, unknown> {
  kill: { xp: number; worldPos: { x: number; y: number; z: number }; crit: boolean; overkill: number };
  levelup: { level: number };
  pickup: { item: ItemInstance };
  cash: { amount: number };
  gritTick: { label: string };
  secondwind: Record<string, never>;
  downed: Record<string, never>;
}

export const bus = new EventBus<GameEvents>();

export function xpForLevel(level: number): number {
  return Math.round(60 * Math.pow(level, 1.9));
}

const GRIT_KEY = 'claudelands2.grit';

export interface GritState {
  tokens: number;
  spent: Record<string, number>; // stat -> ranks bought
  killCount: number;
  critCount: number;
  lootCount: number;
}

export const GRIT_PERKS: { stat: string; label: string; perRank: number }[] = [
  { stat: 'gunDamage', label: 'Gun Damage', perRank: 0.01 },
  { stat: 'maxHealth', label: 'Max Health', perRank: 0.01 },
  { stat: 'reloadSpeed', label: 'Reload Speed', perRank: 0.01 },
  { stat: 'lootLuck', label: 'Loot Luck', perRank: 0.01 },
];

export class GameState {
  level = 1;
  xp = 0;
  skillPoints = 0;
  money = 0;

  /** skillId -> invested points */
  skills = new Map<string, number>();

  inventory: ItemInstance[] = [];
  equippedWeapons: (WeaponInstance | null)[] = [null, null, null, null];
  activeSlot = 0;
  shield: ShieldInstance | null = null;
  grenadeMod: GrenadeModInstance | null = null;
  classMod: ClassModInstance | null = null;
  relic: RelicInstance | null = null;

  ammo = new Map<WeaponType, number>();
  grenades = 3;
  maxGrenades = 6;

  grit: GritState = { tokens: 0, spent: {}, killCount: 0, critCount: 0, lootCount: 0 };

  constructor() {
    for (const t of Object.values(WEAPON_TYPES)) this.ammo.set(t.id, Math.floor(t.ammoPool * 0.4));
    this.loadGrit();
  }

  get activeWeapon(): WeaponInstance | null { return this.equippedWeapons[this.activeSlot]; }

  addXp(amount: number): void {
    this.xp += Math.round(amount);
    while (this.xp >= xpForLevel(this.level)) {
      this.xp -= xpForLevel(this.level);
      this.level++;
      this.skillPoints++;
      bus.emit('levelup', { level: this.level });
    }
  }

  // ---------------------------------------------------------------- skills
  pointsInTree(treeId: string): number {
    const tree = PLAYER_CLASS.trees.find((t) => t.id === treeId);
    if (!tree) return 0;
    let sum = 0;
    for (const s of tree.skills) sum += this.skills.get(s.id) ?? 0;
    return sum;
  }

  skillRank(skillId: string): number {
    let pts = this.skills.get(skillId) ?? 0;
    if (pts > 0 && this.classMod) {
      // class mods boost only skills you've invested in — classic rule
      for (const b of this.classMod.skillBoosts) if (b.skillId === skillId) pts += b.points;
    }
    return pts;
  }

  hasAugment(augmentId: string): boolean {
    for (const [id, pts] of this.skills) {
      if (pts <= 0) continue;
      const def = skillById(id);
      if (def?.augmentId === augmentId) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- grit
  private loadGrit(): void {
    try {
      const raw = localStorage.getItem(GRIT_KEY);
      if (raw) this.grit = { ...this.grit, ...JSON.parse(raw) };
    } catch { /* fresh profile */ }
  }

  saveGrit(): void {
    try { localStorage.setItem(GRIT_KEY, JSON.stringify(this.grit)); } catch { /* private mode */ }
  }

  /** Challenge counters that pay out account-wide tokens. */
  recordGrit(kind: 'kill' | 'crit' | 'loot'): void {
    const g = this.grit;
    if (kind === 'kill' && ++g.killCount % 10 === 0) this.awardGritToken(`${g.killCount} kills`);
    if (kind === 'crit' && ++g.critCount % 25 === 0) this.awardGritToken(`${g.critCount} crits`);
    if (kind === 'loot' && ++g.lootCount % 15 === 0) this.awardGritToken(`${g.lootCount} items looted`);
    this.saveGrit();
  }

  private awardGritToken(label: string): void {
    this.grit.tokens++;
    bus.emit('gritTick', { label });
  }

  gritBonus(stat: string): number {
    const perk = GRIT_PERKS.find((p) => p.stat === stat);
    return perk ? (this.grit.spent[stat] ?? 0) * perk.perRank : 0;
  }

  // ---------------------------------------------------------------- save/load
  // Character save: everything but Grit (which persists separately). Items
  // are plain data by design, so serialization is direct JSON.
  serialize(extra: Record<string, unknown>): string {
    return JSON.stringify({
      v: 2,
      level: this.level, xp: this.xp, skillPoints: this.skillPoints, money: this.money,
      skills: [...this.skills.entries()],
      ammo: [...this.ammo.entries()],
      grenades: this.grenades,
      inventory: this.inventory,
      equippedWeapons: this.equippedWeapons,
      activeSlot: this.activeSlot,
      shield: this.shield, grenadeMod: this.grenadeMod, classMod: this.classMod, relic: this.relic,
      ...extra,
    });
  }

  /** Returns the parsed save (for callers to restore quests etc.), or null. */
  loadFrom(raw: string): Record<string, unknown> | null {
    try {
      const d = JSON.parse(raw) as Record<string, unknown> & {
        level: number; xp: number; skillPoints: number; money: number;
        skills: [string, number][]; ammo: [string, number][]; grenades: number;
        inventory: ItemInstance[]; equippedWeapons: (WeaponInstance | null)[];
        activeSlot: number; shield: ShieldInstance | null; grenadeMod: GrenadeModInstance | null;
        classMod: ClassModInstance | null; relic: RelicInstance | null;
      };
      if (!d || typeof d.level !== 'number') return null;
      this.level = d.level; this.xp = d.xp; this.skillPoints = d.skillPoints; this.money = d.money;
      this.skills = new Map(d.skills);
      this.ammo = new Map(d.ammo as [never, number][]);
      this.grenades = d.grenades;
      this.inventory = d.inventory ?? [];
      this.equippedWeapons = d.equippedWeapons ?? [null, null, null, null];
      this.activeSlot = d.activeSlot ?? 0;
      this.shield = d.shield ?? null;
      this.grenadeMod = d.grenadeMod ?? null;
      this.classMod = d.classMod ?? null;
      this.relic = d.relic ?? null;
      return d;
    } catch {
      return null;
    }
  }
}

export const SAVE_KEY = 'claudelands2.save'; // legacy single-slot key (migrated to slot 1)
export const state = new GameState();

// ---------------------------------------------------------------- save slots
// Three campaign slots. The active slot is chosen in the main menu; autosave
// and load go through it. The pre-slots single save migrates into slot 1.

export type SaveSlotId = 's1' | 's2' | 's3';
export const SAVE_SLOTS: SaveSlotId[] = ['s1', 's2', 's3'];
let activeSaveSlot: SaveSlotId = 's1';

function slotKey(slot: SaveSlotId): string { return `${SAVE_KEY}.${slot}`; }

/** One-time migration: the old single save becomes slot 1. */
(function migrateLegacySave(): void {
  try {
    const legacy = localStorage.getItem(SAVE_KEY);
    if (legacy && !localStorage.getItem(slotKey('s1'))) {
      localStorage.setItem(slotKey('s1'), legacy);
    }
    if (legacy) localStorage.removeItem(SAVE_KEY);
  } catch { /* private mode */ }
})();

export function setActiveSaveSlot(slot: SaveSlotId): void { activeSaveSlot = slot; }
export function getActiveSaveSlot(): SaveSlotId { return activeSaveSlot; }

export function hasSave(slot: SaveSlotId = activeSaveSlot): boolean {
  try { return localStorage.getItem(slotKey(slot)) !== null; } catch { return false; }
}
export function writeSave(extra: Record<string, unknown>): void {
  try { localStorage.setItem(slotKey(activeSaveSlot), state.serialize(extra)); } catch { /* storage full/blocked */ }
}
export function readSave(): Record<string, unknown> | null {
  try {
    const raw = localStorage.getItem(slotKey(activeSaveSlot));
    return raw ? state.loadFrom(raw) : null;
  } catch { return null; }
}
export function clearSave(slot: SaveSlotId = activeSaveSlot): void {
  try { localStorage.removeItem(slotKey(slot)); } catch { /* nothing to clear */ }
}

/** Lightweight peek for the slot picker — never mutates game state. */
export function slotSummary(slot: SaveSlotId): { level: number; money: number; classId: string; mapId: string } | null {
  try {
    const raw = localStorage.getItem(slotKey(slot));
    if (!raw) return null;
    const d = JSON.parse(raw) as { level?: number; money?: number; classId?: string; mapId?: string };
    if (typeof d.level !== 'number') return null;
    return { level: d.level, money: d.money ?? 0, classId: (d.classId as string) ?? 'gunsmith', mapId: (d.mapId as string) ?? 'claudelands' };
  } catch { return null; }
}

/** Export a slot as a portable base64 string (clipboard-friendly). */
export function exportSlot(slot: SaveSlotId): string | null {
  try {
    const raw = localStorage.getItem(slotKey(slot));
    return raw ? btoa(unescape(encodeURIComponent(raw))) : null;
  } catch { return null; }
}

/** Import a base64 save string into a slot. Returns false on garbage. */
export function importSlot(slot: SaveSlotId, encoded: string): boolean {
  try {
    const raw = decodeURIComponent(escape(atob(encoded.trim())));
    const d = JSON.parse(raw) as { level?: number };
    if (typeof d.level !== 'number') return false;
    localStorage.setItem(slotKey(slot), raw);
    return true;
  } catch { return false; }
}
