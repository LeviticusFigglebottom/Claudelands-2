// Pause menu (ESC): resume, master volume, controls recap, restart run.
// Also home of the vendor sell flow's confirm? No — this stays small.

import { audio } from '../audio/synth';
import { clearSave } from '../game/state';

export class PausePanel {
  render(root: HTMLElement, onResume: () => void): void {
    root.innerHTML = `
      <h1>PAUSED</h1>
      <div class="p-sub">The wasteland waits. Impatiently.</div>
      <div class="p-body"><div style="flex:1; max-width:520px;">
        <div style="display:flex; flex-direction:column; gap:12px;">
          <button id="pp-resume">RESUME</button>
          <label style="font-size:13px; letter-spacing:0.08em; color:#b09a60;">
            MASTER VOLUME
            <input type="range" id="pp-vol" min="0" max="1" step="0.05" value="${audio.getMasterVolume()}" style="width:100%;">
          </label>
          <button id="pp-restart">ABANDON RUN (clears save, keeps Grit)</button>
        </div>
        <div style="margin-top:22px; font-size:12px; color:#998a6a; line-height:1.9;">
          <b style="color:#f2e4c4;">WASD</b> move · <b style="color:#f2e4c4;">LMB</b> fire · <b style="color:#f2e4c4;">RMB</b> aim ·
          <b style="color:#f2e4c4;">R</b> reload · <b style="color:#f2e4c4;">F</b> action skill · <b style="color:#f2e4c4;">G</b> grenade ·
          <b style="color:#f2e4c4;">E</b> interact<br>
          <b style="color:#f2e4c4;">1-4</b> weapons · <b style="color:#f2e4c4;">TAB</b> backpack · <b style="color:#f2e4c4;">K</b> skills ·
          <b style="color:#f2e4c4;">J</b> quest log · <b style="color:#f2e4c4;">Space</b> jump · <b style="color:#f2e4c4;">Shift</b> sprint
        </div>
        <div style="margin-top:14px; font-size:11px; color:#776;">Progress autosaves. Grit Rank survives everything, including your decisions.</div>
      </div></div>
      <div class="p-hint">ESC to resume</div>`;

    root.querySelector('#pp-resume')?.addEventListener('click', onResume);
    root.querySelector('#pp-vol')?.addEventListener('input', (e) => {
      audio.setMasterVolume(Number((e.target as HTMLInputElement).value));
    });
    root.querySelector('#pp-restart')?.addEventListener('click', () => {
      clearSave();
      location.reload();
    });
  }
}
