// Small UI pieces: pickup feed, subtitles/barks, wire-spool playback,
// interact prompt, downed overlay, level-up banner, title screen.

import type { ItemInstance } from '../game/types';
import { rarityById } from '../data/rarity';
import { WIRE_LOGS } from '../data/flavor';
import { audio } from '../audio/synth';

export function feedPickup(item: ItemInstance): void {
  const rarity = rarityById(item.rarity);
  const el = document.createElement('div');
  el.className = 'feed-entry';
  el.style.setProperty('--rarity', rarity.css);
  el.innerHTML = `PICKED UP <b>${item.name}</b>`;
  const feed = document.getElementById('pickup-feed')!;
  feed.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

export function feedText(html: string, color = '#f2e4c4'): void {
  const el = document.createElement('div');
  el.className = 'feed-entry';
  el.style.setProperty('--rarity', color);
  el.innerHTML = html;
  document.getElementById('pickup-feed')!.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// ---------------------------------------------------------------- subtitles
const subRoot = () => document.getElementById('subtitles')!;

export function bark(speaker: string, line: string): void {
  const el = document.createElement('div');
  el.innerHTML = `<span class="subtitle-line bark"><span class="speaker">${speaker}:</span> ${line}</span>`;
  subRoot().appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

let wirePlaying = false;
export function playWireLog(logId: string): boolean {
  if (wirePlaying) return false;
  const log = WIRE_LOGS.find((l) => l.id === logId);
  if (!log) return false;
  wirePlaying = true;
  let i = 0;
  const showNext = () => {
    if (i >= log.lines.length) { wirePlaying = false; return; }
    const line = log.lines[i++];
    const el = document.createElement('div');
    el.innerHTML = `<span class="subtitle-line"><span class="speaker">${log.speaker}:</span> ${line}</span>`;
    subRoot().appendChild(el);
    const dur = 1400 + line.length * 45;
    audio.radioVoice(Math.min(dur / 1000, 3.2));
    setTimeout(() => { el.remove(); showNext(); }, dur);
  };
  showNext();
  return true;
}

// ---------------------------------------------------------------- prompts
export function showInteract(label: string | null): void {
  const el = document.getElementById('interact-prompt')!;
  if (label) {
    el.innerHTML = `<span class="key">[E]</span> ${label}`;
    el.style.display = 'block';
  } else {
    el.style.display = 'none';
  }
}

// ---------------------------------------------------------------- downed
export function setDownedOverlay(downed: boolean, frac = 0): void {
  const el = document.getElementById('downed-overlay')!;
  if (!downed) { el.classList.remove('show'); return; }
  if (!el.classList.contains('show')) {
    el.classList.add('show');
    el.innerHTML = `
      <div class="big">FIGHT FOR YOUR LIFE!</div>
      <div class="sub">Get a kill for a SECOND WIND</div>
      <div class="timer"><div class="fill" id="downed-fill"></div></div>`;
  }
  const fill = document.getElementById('downed-fill');
  if (fill) fill.style.transform = `scaleX(${1 - frac})`;
}

export function banner(text: string): void {
  const el = document.getElementById('levelup-banner')!;
  el.textContent = text;
  el.classList.remove('show');
  void el.offsetWidth; // restart animation
  el.classList.add('show');
}

// ---------------------------------------------------------------- title

