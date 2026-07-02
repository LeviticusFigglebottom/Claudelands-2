// Generic in-game cinematic runner: letterboxed, gameplay-pausing, any-key
// skippable camera moves with timed title cards. Used for biome entries,
// boss introductions, and first-meeting character splashes. Each plays once
// (seen-set persisted in the save).

import * as THREE from 'three';

export interface CineWaypoint {
  x: number; y: number; z: number;
  lookX: number; lookY: number; lookZ: number;
  hold: number;
}

export interface CineCard {
  at: number;
  title: string;
  sub?: string;
  style?: 'area' | 'boss' | 'char';
}

export interface CineDef {
  path: CineWaypoint[];
  cards: CineCard[];
  total: number;
}

export const BOSS_EPITHETS: Record<string, string> = {
  gutterball: 'self-crowned king of trash mountain',
  warden_prime: 'helix site custodian of the year, 12 years running',
  old_man_avalanche: 'the weather, personally',
  saint_furnace: 'patron saint of arson',
  bloom_mother: 'the garden god who woke up hungry',
};

export const NPC_INTROS: Record<string, { name: string; sub: string }> = {
  quibb: { name: 'FOREMAN QUIBB', sub: 'retired. technically. nobody told the paperwork.' },
  zaza: { name: 'MADAME ZAZA', sub: 'seer, merchant, menace.' },
  mayor: { name: 'MAYOR OTTOLINE BRASS', sub: 'won the city in a card game. owned the deck.' },
  brann: { name: 'BRANN THE ADJUSTER', sub: 'eleven years of denied claims. one grudge.' },
  mirelle: { name: 'MIRELLE TWO-LINES', sub: 'fished the fathom nine winters. it fished back.' },
  okto: { name: 'BROTHER OKTO', sub: 'bone-priest, lapsed. the bones and he are on a break.' },
  juno: { name: 'DR. JUNO CALLA', sub: 'xenobotanist. sole survivor. extremely caffeinated.' },
  rita: { name: 'REDLINE RITA', sub: 'fastest courier the wastes ever fired. retired. allegedly.' },
};

/** Slow orbit around a boss, ending face-to-face. */
export function bossCine(pos: THREE.Vector3, scale: number, name: string, epithet: string): CineDef {
  const r = 7 + scale * 2.4;
  const h = scale * 1.4;
  const look = { lookX: pos.x, lookY: pos.y + scale * 0.9, lookZ: pos.z };
  const pt = (a: number, hold: number): CineWaypoint => ({
    x: pos.x + Math.sin(a) * r, y: pos.y + h, z: pos.z + Math.cos(a) * r, hold, ...look,
  });
  return {
    path: [pt(0.6, 0), pt(-0.5, 2.2), pt(-1.4, 2.2)],
    cards: [{ at: 0.7, title: name, sub: epithet, style: 'boss' }],
    total: 4.4,
  };
}

/** High sweep down toward the player on first entry to a map. */
export function biomeCine(spawn: THREE.Vector3, name: string, tagline: string): CineDef {
  return {
    path: [
      { x: spawn.x + 26, y: spawn.y + 42, z: spawn.z + 40, lookX: spawn.x, lookY: spawn.y + 2, lookZ: spawn.z - 30, hold: 0 },
      { x: spawn.x + 6, y: spawn.y + 10, z: spawn.z + 14, lookX: spawn.x, lookY: spawn.y + 2, lookZ: spawn.z - 20, hold: 3.6 },
      { x: spawn.x, y: spawn.y + 1.7, z: spawn.z, lookX: spawn.x, lookY: spawn.y + 1.7, lookZ: spawn.z - 10, hold: 1.6 },
    ],
    cards: [{ at: 0.5, title: name, sub: tagline, style: 'area' }],
    total: 5.2,
  };
}

/** Quick dolly toward an NPC on first meeting. */
export function charCine(from: THREE.Vector3, npcPos: THREE.Vector3, name: string, sub: string): CineDef {
  const dir = npcPos.clone().sub(from).setY(0).normalize();
  const near = npcPos.clone().addScaledVector(dir, -2.4);
  return {
    path: [
      { x: from.x, y: from.y + 1.65, z: from.z, lookX: npcPos.x, lookY: npcPos.y + 1.5, lookZ: npcPos.z, hold: 0 },
      { x: near.x, y: npcPos.y + 1.6, z: near.z, lookX: npcPos.x, lookY: npcPos.y + 1.5, lookZ: npcPos.z, hold: 2.0 },
    ],
    cards: [{ at: 0.5, title: name, sub, style: 'char' }],
    total: 3.0,
  };
}

/** A cinematic ignores skip input for its first moments so a held key or a
 *  buffered press can't blow past it before the player even sees it. */
const SKIP_GRACE = 1.1;

export class CinematicSystem {
  active = false;
  private t = 0;
  private def: CineDef | null = null;
  private onEnd: (() => void) | null = null;
  private shown = new Set<number>();
  private root: HTMLElement | null = null;

  start(def: CineDef, onEnd?: () => void): void {
    this.def = def;
    this.onEnd = onEnd ?? null;
    this.t = 0;
    this.shown.clear();
    this.active = true;
    if (!this.root) {
      this.root = document.createElement('div');
      this.root.id = 'cine-root';
      document.getElementById('ui-root')?.appendChild(this.root);
    }
    this.root.innerHTML = `
      <div class="cine-bar top"></div>
      <div class="cine-bar bottom"></div>
      <div id="cine-cards2"></div>
      <div class="cine-skip" style="display:none">press any key to skip</div>`;
    this.root.style.display = 'block';
    document.getElementById('ui-root')?.classList.add('cine-on');
  }

  skip(): void {
    if (this.t < SKIP_GRACE) return; // still in the no-accidents window
    this.end();
  }

  private end(): void {
    if (!this.active) return;
    this.active = false;
    if (this.root) { this.root.style.display = 'none'; this.root.innerHTML = ''; }
    document.getElementById('ui-root')?.classList.remove('cine-on');
    const cb = this.onEnd;
    this.onEnd = null;
    cb?.();
  }

  /** Returns false once finished. */
  update(dt: number, camera: THREE.PerspectiveCamera): boolean {
    if (!this.active || !this.def) return false;
    this.t += dt;
    const def = this.def;

    if (this.t >= SKIP_GRACE) {
      const hint = this.root?.querySelector('.cine-skip') as HTMLElement | null;
      if (hint && hint.style.display === 'none') hint.style.display = 'block';
    }

    def.cards.forEach((c, i) => {
      if (this.t >= c.at && !this.shown.has(i)) {
        this.shown.add(i);
        const el = document.createElement('div');
        el.className = `cine-card cine-${c.style ?? 'area'}`;
        el.innerHTML = `<div class="cine-title">${c.title}</div>${c.sub ? `<div class="cine-sub">${c.sub}</div>` : ''}`;
        document.getElementById('cine-cards2')?.appendChild(el);
        setTimeout(() => el.classList.add('gone'), Math.max(1200, (def.total - c.at - 0.6) * 1000));
      }
    });

    // piecewise smooth path
    let t = this.t;
    let seg = 0;
    while (seg < def.path.length - 1 && t > def.path[seg + 1].hold) {
      t -= def.path[seg + 1].hold;
      seg++;
    }
    const a = def.path[seg];
    const b = def.path[Math.min(seg + 1, def.path.length - 1)];
    const f = b.hold > 0 ? Math.min(1, t / b.hold) : 1;
    const e = f * f * (3 - 2 * f);
    camera.position.set(a.x + (b.x - a.x) * e, a.y + (b.y - a.y) * e, a.z + (b.z - a.z) * e);
    camera.lookAt(
      a.lookX + (b.lookX - a.lookX) * e,
      a.lookY + (b.lookY - a.lookY) * e,
      a.lookZ + (b.lookZ - a.lookZ) * e,
    );

    if (this.t >= def.total) { this.end(); return false; }
    return true;
  }
}
