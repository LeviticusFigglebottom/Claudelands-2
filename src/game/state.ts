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
}

export const state = new GameState();
