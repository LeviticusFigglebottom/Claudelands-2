// Skippable intro cutscene: letterboxed camera sweep over the wasteland with
// timed title cards, ending on the classic freeze-frame character splash.
// main.ts drives the camera along the waypoints; this module owns the DOM.

import { getPlayerClass } from '../data/classes';

export interface IntroWaypoint {
  x: number; y: number; z: number;
  lookX: number; lookY: number; lookZ: number;
  hold: number; // seconds to reach this point from the previous one
}

export const INTRO_PATH: IntroWaypoint[] = [
  { x: 0, y: 40, z: 150, lookX: 0, lookY: 2, lookZ: 60, hold: 0 },
  { x: -30, y: 14, z: 118, lookX: 0, lookY: 2, lookZ: 88, hold: 4.5 },
  { x: -12, y: 5, z: 96, lookX: 4, lookY: 2, lookZ: 80, hold: 4.5 },
  { x: 0, y: 2.4, z: 118, lookX: 0, lookY: 2, lookZ: 100, hold: 3.5 },
];

export const INTRO_CARDS: { at: number; text: string; sub?: string }[] = [
  { at: 0.6, text: 'THE CLAUDELANDS', sub: 'a wasteland of guns, rust, and unpaid invoices' },
  { at: 5.2, text: 'THEY CROWNED A KING OF GARBAGE', sub: 'somebody has to file the complaint' },
  { at: 9.6, text: 'THAT SOMEBODY IS YOU', sub: 'payment on completion. survival optional.' },
];

export const INTRO_TOTAL = 12.5;

export class IntroOverlay {
  private root = document.getElementById('title-screen')!;
  private shownCards = new Set<number>();
  private splashing = false;
  active = false;

  start(): void {
    this.active = true;
    this.splashing = false;
    this.shownCards.clear();
    this.root.classList.remove('hidden');
    this.root.innerHTML = `
      <div class="cine-bar top"></div>
      <div class="cine-bar bottom"></div>
      <div id="cine-cards"></div>
      <div class="cine-skip">press any key to skip</div>`;
    this.root.style.background = 'transparent';
    this.root.style.pointerEvents = 'none';
  }

  /** t = seconds elapsed. Returns true while still running. */
  update(t: number): boolean {
    if (!this.active) return false;
    INTRO_CARDS.forEach((c, i) => {
      if (t >= c.at && !this.shownCards.has(i)) {
        this.shownCards.add(i);
        const el = document.createElement('div');
        el.className = 'cine-card';
        el.innerHTML = `<div class="cine-title">${c.text}</div>${c.sub ? `<div class="cine-sub">${c.sub}</div>` : ''}`;
        document.getElementById('cine-cards')?.appendChild(el);
        setTimeout(() => el.classList.add('gone'), 3400);
        setTimeout(() => el.remove(), 4000);
      }
    });
    if (t >= INTRO_TOTAL) {
      if (!this.splashing) { this.splashing = true; this.finishToSplash(); }
      return false;
    }
    return true;
  }

  /** The character freeze-frame card, then done. */
  private finishToSplash(): void {
    const cls = getPlayerClass();
    const cards = document.getElementById('cine-cards');
    if (cards) {
      cards.innerHTML = `
        <div class="char-splash">
          <div class="char-name">${cls.charName.toUpperCase()}</div>
          <div class="char-as">as</div>
          <div class="char-class">${cls.name.toUpperCase()}</div>
        </div>`;
    }
    setTimeout(() => this.end(), 2200);
  }

  end(): void {
    if (!this.active) return;
    this.active = false;
    this.root.classList.add('hidden');
    this.root.innerHTML = '';
    this.root.style.background = '';
    this.root.style.pointerEvents = '';
    document.dispatchEvent(new CustomEvent('intro-finished'));
  }
}
