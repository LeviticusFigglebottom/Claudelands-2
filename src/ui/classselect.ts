// New-game setup: pick a Vault-Rat (class) and a difficulty. Shown after
// NEW CONTRACT on the title screen, before the intro cutscene.

import { CLASSES } from '../data/classes';
import { DIFFICULTIES, type DifficultyId } from '../game/settings';
import { audio } from '../audio/synth';

export function showClassSelect(onDone: (classId: string, difficultyId: DifficultyId) => void): void {
  const root = document.getElementById('title-screen')!;
  root.classList.remove('hidden');
  let chosenClass = 'gunsmith';
  let chosenDiff: DifficultyId = 'normal';

  const render = () => {
    const cards = CLASSES.map((c) => `
      <div class="class-card ${c.playable ? '' : 'locked'} ${chosenClass === c.id ? 'chosen' : ''}" data-cls="${c.id}" ${c.playable ? '' : 'title="Coming in a later pass"'}>
        <div class="cc-name">${c.charName}</div>
        <div class="cc-class">${c.name}</div>
        <div class="cc-skill">◆ ${c.actionSkill.name}</div>
        <div class="cc-blurb">${c.playable ? c.blurb : 'IN TRANSIT TO THE CLAUDELANDS…'}</div>
      </div>`).join('');
    const diffs = Object.values(DIFFICULTIES).map((d) => `
      <button class="diff-btn ${chosenDiff === d.id ? 'tab-on' : ''}" data-diff="${d.id}">${d.name}</button>`).join('');
    root.innerHTML = `
      <div class="t-super">CHOOSE YOUR CONTRACTOR</div>
      <div class="class-row">${cards}</div>
      <div class="t-super" style="margin-top:26px;">DIFFICULTY</div>
      <div class="diff-row">${diffs}</div>
      <div class="diff-blurb">${DIFFICULTIES[chosenDiff].blurb}</div>
      <div class="t-buttons"><div class="t-start" id="cs-go">SIGN THE CONTRACT</div></div>`;

    root.querySelectorAll<HTMLElement>('.class-card:not(.locked)').forEach((el) => {
      el.addEventListener('click', () => { chosenClass = el.dataset.cls!; audio.uiClick(); render(); });
    });
    root.querySelectorAll<HTMLElement>('.diff-btn').forEach((el) => {
      el.addEventListener('click', () => { chosenDiff = el.dataset.diff as DifficultyId; audio.uiClick(); render(); });
    });
    root.querySelector('#cs-go')?.addEventListener('click', (e) => {
      e.stopPropagation();
      root.classList.add('hidden');
      onDone(chosenClass, chosenDiff);
    }, { once: true });
  };
  render();
}
