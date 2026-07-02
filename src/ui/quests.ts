// Quest UI: HUD tracker (always-on objective readout), quest log panel (J),
// and Quibb's dialogue panel (typewriter briefing + accept button).

import { questSystem, type QuestRuntime } from '../game/quests';
import { QUEST_DONE_IDLE, QUIBB_GREETINGS } from '../data/quests';
import { audio } from '../audio/synth';
import { pick } from '../util/rng';

export class QuestTracker {
  private root = document.getElementById('quest-tracker')!;
  private lastKey = '';

  update(): void {
    const q = questSystem.active;
    let html = '';
    let key = 'none';
    if (q) {
      const obj = q.def.objective;
      const progress = obj.count > 1 ? ` — ${q.progress}/${obj.count}` : '';
      key = `${q.def.id}:${q.progress}`;
      html = `
        <div class="qt-name">◆ ${q.def.name}</div>
        <div class="qt-obj">${obj.label}${progress}</div>`;
    } else if (questSystem.available) {
      key = 'avail';
      html = `<div class="qt-name">◆ NEW JOB AVAILABLE</div><div class="qt-obj">Talk to Foreman Quibb in Gutterlight</div>`;
    } else if (questSystem.allDone) {
      key = 'done';
      html = `<div class="qt-name" style="color:#3ddc4e">◆ CONTRACT FULFILLED</div><div class="qt-obj">The wasteland restocks itself. Enjoy.</div>`;
    }
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.root.innerHTML = html;
      this.root.classList.remove('pulse');
      void this.root.offsetWidth;
      this.root.classList.add('pulse');
    }
  }
}

export class QuestLogPanel {
  render(root: HTMLElement): void {
    const rows = questSystem.quests.map((q) => {
      const badge = q.status === 'complete' ? '✔' : q.status === 'active' ? '▶' : q.status === 'available' ? '!' : '·';
      const cls = q.status;
      const obj = q.def.objective;
      const progress = q.status === 'active' && obj.count > 1 ? ` (${q.progress}/${obj.count})` : '';
      return `
        <div class="quest-row ${cls}">
          <div class="q-badge">${badge}</div>
          <div>
            <div class="q-name">${q.def.name}</div>
            <div class="q-obj">${q.status === 'locked' ? '— classified until Quibb trusts you —' : obj.label + progress}</div>
          </div>
        </div>`;
    }).join('');
    root.innerHTML = `
      <h1>CONTRACT LEDGER</h1>
      <div class="p-sub">Employer: Foreman Quibb · Gutterlight · “Payment on completion. Survival optional but encouraged.”</div>
      <div class="p-body"><div style="flex:1; overflow-y:auto;">${rows}</div></div>
      <div class="p-hint">J / ESC to close</div>`;
  }
}

export class DialoguePanel {
  private typing: number | null = null;

  render(root: HTMLElement, onAccept: () => void, onClose: () => void): void {
    const available: QuestRuntime | null = questSystem.available;
    const greeting = pick(Math.random as never, QUIBB_GREETINGS);
    const lines = available
      ? available.def.briefing
      : questSystem.active
        ? [`Job’s not done, contractor: ${questSystem.active.def.objective.label}.`, 'The wasteland won’t shoot itself. Well. Sometimes it does.']
        : [pick(Math.random as never, QUEST_DONE_IDLE)];

    root.innerHTML = `
      <h1>FOREMAN QUIBB</h1>
      <div class="p-sub">${greeting}</div>
      <div class="p-body"><div style="flex:1">
        <div class="dialogue-box" id="dlg-box"></div>
        ${available ? `<div class="dialogue-quest">NEW CONTRACT: <b>${available.def.name}</b> — $${available.def.rewardCash}+ · ${available.def.rewardXp} XP${available.def.rewardItem ? ' · item bonus' : ''}</div>` : ''}
        <div style="display:flex; gap:10px; margin-top:14px;">
          ${available ? '<button id="dlg-accept">TAKE THE JOB</button>' : ''}
          <button id="dlg-close">${available ? 'NOT YET' : 'LEAVE'}</button>
        </div>
      </div></div>
      <div class="p-hint">E / ESC to close</div>`;

    // typewriter with radio blips
    const box = root.querySelector('#dlg-box') as HTMLElement;
    let lineIdx = 0, charIdx = 0;
    let current: HTMLElement | null = null;
    const tick = () => {
      if (lineIdx >= lines.length) { this.typing = null; return; }
      if (!current) {
        current = document.createElement('div');
        current.className = 'dlg-line';
        box.appendChild(current);
      }
      const line = lines[lineIdx];
      charIdx += 2;
      current.textContent = line.slice(0, charIdx);
      if (charIdx % 6 === 0) audio.dialogBlip();
      if (charIdx >= line.length) { lineIdx++; charIdx = 0; current = null; this.typing = window.setTimeout(tick, 320); }
      else this.typing = window.setTimeout(tick, 18);
    };
    tick();

    root.querySelector('#dlg-accept')?.addEventListener('click', () => {
      this.stop();
      onAccept();
    });
    root.querySelector('#dlg-close')?.addEventListener('click', () => {
      this.stop();
      onClose();
    });
  }

  stop(): void {
    if (this.typing !== null) { clearTimeout(this.typing); this.typing = null; }
  }
}
