// Player stat aggregation: skills (passive), kill-skill buffs (timed),
// class mod passives, relic passives, grit ranks, and shield gimmicks all
// fold into one query: mod('gunDamage') -> 1.23. Systems never hardcode
// where a bonus comes from.

import { PLAYER_CLASS } from '../data/classes';
import { state, bus } from './state';

interface KillBuff {
  stats: Record<string, number>;
  expires: number;
}

class StatSystem {
  private killBuffs: KillBuff[] = [];
  private now = 0;
  /** Set by shield logic when a ROID shield is depleted. */
  roidBonus = 0;
  /** Set by the action skill when Squall Line is up (Tempest haste augment). */
  tempestHaste = false;

  constructor() {
    bus.on('kill', () => this.triggerKillSkills());
  }

  update(dt: number): void {
    this.now += dt;
    this.killBuffs = this.killBuffs.filter((b) => b.expires > this.now);
  }

  private triggerKillSkills(): void {
    for (const tree of PLAYER_CLASS.trees) {
      for (const s of tree.skills) {
        if (s.kind !== 'killskill' || !s.stats) continue;
        const rank = state.skillRank(s.id);
        if (rank <= 0) continue;
        const stats: Record<string, number> = {};
        for (const [k, v] of Object.entries(s.stats)) stats[k] = v * rank;
        // refresh: remove old instance of the same skill footprint, add new
        this.killBuffs.push({ stats, expires: this.now + (s.killskillDuration ?? 7) });
      }
    }
  }

  get activeKillBuffCount(): number { return this.killBuffs.length; }

  /** Additive percentage total for a stat (0.25 = +25%). */
  bonus(stat: string): number {
    let total = 0;
    for (const tree of PLAYER_CLASS.trees) {
      for (const s of tree.skills) {
        if (s.kind !== 'passive' || !s.stats || s.stats[stat] === undefined) continue;
        total += s.stats[stat] * state.skillRank(s.id);
      }
    }
    for (const b of this.killBuffs) if (b.stats[stat]) total += b.stats[stat];
    if (state.classMod) for (const p of state.classMod.passives) if (p.stat === stat) total += p.amount;
    if (state.relic) for (const p of state.relic.passives) if (p.stat === stat) total += p.amount;
    total += state.gritBonus(stat);
    if (stat === 'gunDamage' && this.roidBonus > 0) total += this.roidBonus;
    if (this.tempestHaste && (stat === 'moveSpeed' || stat === 'reloadSpeed')) total += 0.25;
    return total;
  }

  /** Multiplier form: 1 + bonus. Cooldown-type stats use 1 - bonus. */
  mult(stat: string): number { return 1 + this.bonus(stat); }
  reduction(stat: string): number { return Math.max(0.2, 1 - this.bonus(stat)); }
}

export const statsys = new StatSystem();
