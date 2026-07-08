// Player stat aggregation: skills (passive), kill-skill buffs (timed),
// stack pools (Anarchy-style ramping mechanics), class mod passives, relic
// passives, grit ranks, and shield gimmicks all fold into one query:
// mod('gunDamage') -> 1.23. Systems never hardcode where a bonus comes from.

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
  /** Set by the action skill each frame: any skill entity/stance is live. */
  skillActive = false;
  /** Set by the player each frame: shields at zero (Fleet reads this). */
  shieldsDown = false;
  /** Set while a Release-the-Beast Red Mist is running. */
  redBeast = false;

  // ---- stack pools: ramping mechanics that build and crash (the fun kind)
  private stackPools = new Map<string, number>();

  constructor() {
    bus.on('kill', () => {
      this.triggerKillSkills();
      // SCRAP ANARCHY: every kill feeds the pile
      if (this.rawBonus('anarchy') > 0) this.addStack('scrap', 1, this.scrapCap);
    });
    // going down spills the whole scrap pile — the Anarchy deal
    bus.on('downed', () => this.clearStacks('scrap'));
  }

  get scrapCap(): number { return 50 + this.rawBonus('preshrunk'); }

  stackCount(pool: string): number { return this.stackPools.get(pool) ?? 0; }
  addStack(pool: string, n: number, cap: number): void {
    this.stackPools.set(pool, Math.min(cap, (this.stackPools.get(pool) ?? 0) + n));
  }
  clearStacks(pool: string): void { this.stackPools.delete(pool); }

  /** Fully-empty-magazine reloads feed Anarchy too (the classic rule). */
  onEmptyReload(): void {
    if (this.rawBonus('anarchy') > 0) this.addStack('scrap', 1, this.scrapCap);
  }

  /** External timed buff (legendary procs like Metronome) — same pipeline
   *  as kill skills, so the HUD counter and stacking rules come free. */
  addTempBuff(stats: Record<string, number>, duration: number): void {
    this.killBuffs.push({ stats, expires: this.now + duration });
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

  /** Skill/buff/gear total for a stat with NO dynamic layers — safe to call
   *  from inside bonus() without recursing. */
  rawBonus(stat: string): number {
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
    return total;
  }

  /** Additive percentage total for a stat (0.25 = +25%). */
  bonus(stat: string): number {
    let total = this.rawBonus(stat);
    if (stat === 'gunDamage') {
      if (this.roidBonus > 0) total += this.roidBonus;
      // SCRAP ANARCHY: +1.75% per stack. The bloom is the price.
      total += this.stackCount('scrap') * 0.0175;
      // SALT THE WOUND: shield hits made you angrier, per stack per point
      total += this.stackCount('salt') * this.rawBonus('saltWound');
      // BATTLEFRONT: the rig is out — push with it
      if (this.skillActive) total += this.rawBonus('battlefront');
      if (this.redBeast) total += 0.25;
    }
    if (stat === 'bloom') {
      // Anarchy's tax: the pile widens the spread
      total += this.stackCount('scrap') * 0.02;
    }
    if (stat === 'moveSpeed' && this.shieldsDown) total += this.rawBonus('fleet');
    if (stat === 'turretDamage' && this.redBeast) total += 0.5;
    if (this.tempestHaste && (stat === 'moveSpeed' || stat === 'reloadSpeed')) total += 0.25;
    return total;
  }

  /** Multiplier form: 1 + bonus. Cooldown-type stats use 1 - bonus. */
  mult(stat: string): number { return 1 + this.bonus(stat); }
  reduction(stat: string): number { return Math.max(0.2, 1 - this.bonus(stat)); }
}

export const statsys = new StatSystem();
