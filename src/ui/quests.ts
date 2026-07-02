// Quest UI: HUD tracker (always-on objective readout), quest log panel (J),
// and Quibb's dialogue panel (typewriter briefing + accept button).

import { questSystem, type QuestRuntime } from '../game/quests';
import { QUEST_DONE_IDLE, GIVERS } from '../data/quests';
import type { QuestGiver } from '../data/quests';
import { audio } from '../audio/synth';
import { voice, voiceOf } from '../audio/voice';
import { prefs } from '../game/prefs';
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
      const g = GIVERS[questSystem.available.def.giver];
      key = 'avail:' + questSystem.available.def.id;
      html = `<div class="qt-name">◆ NEW JOB AVAILABLE</div><div class="qt-obj">Talk to ${g.name} ${g.where}</div>`;
    } else if (questSystem.allDone) {
      key = 'done';
      html = `<div class="qt-name" style="color:#3ddc4e">◆ CONTRACT FULFILLED</div><div class="qt-obj">The wasteland restocks itself. Enjoy.</div>`;
    }
    const s = questSystem.activeSide;
    if (s) {
      const sObj = s.def.objective;
      const sProg = sObj.count > 1 ? ` — ${s.progress}/${sObj.count}` : '';
      key += `|${s.def.id}:${s.progress}`;
      html += `
        <div class="qt-name" style="color:#c06bff">◇ ${s.def.name}</div>
        <div class="qt-obj">${sObj.label}${sProg}</div>`;
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
    const sideRows = questSystem.sides.map((q) => {
      const badge = q.status === 'complete' ? '✔' : q.status === 'active' ? '▶' : q.status === 'available' ? '!' : '·';
      const obj = q.def.objective;
      const progress = q.status === 'active' && obj.count > 1 ? ` (${q.progress}/${obj.count})` : '';
      const g = GIVERS[q.def.giver];
      return `
        <div class="quest-row ${q.status}">
          <div class="q-badge" style="color:#c06bff">${badge}</div>
          <div>
            <div class="q-name">${q.def.name} <span style="opacity:0.6; font-weight:400">· ${g.name}</span></div>
            <div class="q-obj">${q.status === 'locked' ? '— Brasshaven keeps its problems to itself. For now. —' : obj.label + progress}</div>
          </div>
        </div>`;
    }).join('');
    root.innerHTML = `
      <h1>CONTRACT LEDGER</h1>
      <div class="p-sub">“Payment on completion. Survival optional but encouraged.”</div>
      <div class="p-body"><div style="flex:1; overflow-y:auto;">
        <div class="ql-section">MAIN CONTRACTS</div>${rows}
        <div class="ql-section" style="color:#c06bff">SIDE JOBS · BRASSHAVEN</div>${sideRows}
      </div></div>
      <div class="p-hint">J / ESC to close</div>`;
  }
}

export class DialoguePanel {
  private typing: number | null = null;

  render(root: HTMLElement, giver: QuestGiver, onAccept: () => void, onClose: () => void): void {
    const available: QuestRuntime | null = questSystem.availableFrom(giver);
    const info = GIVERS[giver];
    const greeting = pick(Math.random as never, info.greetings);
    const active = questSystem.active;
    const activeSide = questSystem.activeSide;
    // Idle lines are giver-aware: only the quest's OWN giver nags about it;
    // everyone else points you at whoever actually holds your work, or offers
    // their own queued job for later.
    let lines: string[];
    if (available) {
      lines = available.def.briefing;
    } else if (active && active.def.giver === giver) {
      lines = [`Job’s not done, contractor: ${active.def.objective.label}.`, 'Off you go. Gravity helps.'];
    } else if (activeSide && activeSide.def.giver === giver) {
      lines = [`You’re already on my job: ${activeSide.def.objective.label}.`, 'I believe in you. Statistically.'];
    } else if (activeSide && questSystem.sides.some((s) => s.status === 'available' && s.def.giver === giver)) {
      const busyWith = GIVERS[activeSide.def.giver];
      lines = [`I’ve got work for you — but you’re still carrying ${busyWith.name}’s job.`, 'Finish that first. I’ll keep the grudge warm.'];
    } else if (active) {
      const owner = GIVERS[active.def.giver];
      lines = [`You look busy. ${owner.name} is waiting on you: ${active.def.objective.label}.`, 'Don’t let me keep you.'];
    } else if (questSystem.available) {
      const pendingElsewhere = GIVERS[questSystem.available.def.giver];
      lines = [`Not my department. ${pendingElsewhere.name} is holding work for you ${pendingElsewhere.where}.`];
    } else {
      lines = [pick(Math.random as never, QUEST_DONE_IDLE)];
    }

    root.innerHTML = `
      <h1>${info.name.toUpperCase()}</h1>
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

    // typewriter — the character voice performs each line as it types
    // (radio blips remain the fallback when voices are off)
    const box = root.querySelector('#dlg-box') as HTMLElement;
    let lineIdx = 0, charIdx = 0;
    let current: HTMLElement | null = null;
    const tick = () => {
      if (lineIdx >= lines.length) { this.typing = null; return; }
      if (!current) {
        current = document.createElement('div');
        current.className = 'dlg-line';
        box.appendChild(current);
        voice.speak(lines[lineIdx], voiceOf(giver));
      }
      const line = lines[lineIdx];
      charIdx += 2;
      current.textContent = line.slice(0, charIdx);
      if (!prefs().characterVoices && charIdx % 6 === 0) audio.dialogBlip();
      if (charIdx >= line.length) {
        lineIdx++; charIdx = 0; current = null;
        // let the voice finish its line before the next one starts talking over it
        const wait = () => {
          if (voice.speaking) this.typing = window.setTimeout(wait, 120);
          else this.typing = window.setTimeout(tick, 280);
        };
        this.typing = window.setTimeout(wait, 120);
      } else this.typing = window.setTimeout(tick, 18);
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
    voice.cancel();
  }
}
