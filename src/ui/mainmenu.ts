// The front end of the game: cinematic attract-mode title (main.ts pans the
// camera over the live world behind this DOM), press-any-key, main menu
// (campaign / endless / settings), a settings panel of persisted graphics
// toggles, and the character select with playstyle + skill-tree previews.

import { CLASSES, type ClassDef } from '../data/classes';
import { DIFFICULTIES, type DifficultyId } from '../game/settings';
import { prefs, setPref, resetPrefs, DEFAULT_PREFS, type Prefs } from '../game/prefs';
import { audio } from '../audio/synth';

export type StartMode = 'new' | 'veteran' | 'endless';

export interface MenuCallbacks {
  hasSave: () => boolean;
  bestWave: () => number;
  onContinue: () => void;
  onStart: (mode: StartMode, classId: string, difficultyId: DifficultyId) => void;
}

type Screen = 'press' | 'menu' | 'campaign' | 'select' | 'settings';

export class MainMenu {
  private root = document.getElementById('title-screen')!;
  private screen: Screen = 'press';
  private startMode: StartMode = 'new';
  private chosenClass = 'gunsmith';
  private chosenDiff: DifficultyId = 'normal';
  private cb!: MenuCallbacks;
  active = false;

  show(cb: MenuCallbacks): void {
    this.cb = cb;
    this.active = true;
    this.screen = 'press';
    this.root.classList.remove('hidden');
    this.render();
    const anyKey = (e: KeyboardEvent | MouseEvent) => {
      if (!this.active || this.screen !== 'press') return;
      e.stopPropagation();
      audio.unlock();
      audio.uiOpen();
      this.screen = 'menu';
      this.render();
    };
    document.addEventListener('keydown', anyKey);
    this.root.addEventListener('click', anyKey);
  }

  private finish(run: () => void): void {
    this.active = false;
    this.root.classList.add('hidden');
    this.root.innerHTML = '';
    run();
  }

  private render(): void {
    switch (this.screen) {
      case 'press': this.renderPress(); break;
      case 'menu': this.renderMenu(); break;
      case 'campaign': this.renderCampaign(); break;
      case 'select': this.renderSelect(); break;
      case 'settings': this.renderSettings(); break;
    }
  }

  private chrome(inner: string, backTo?: Screen): void {
    this.root.innerHTML = `
      <div class="mm-topfade"></div>
      <div class="mm-logo-sm">CLAUDELANDS <span class="two">2</span></div>
      ${inner}
      ${backTo ? '<div class="mm-back" id="mm-back">◂ BACK</div>' : ''}`;
    if (backTo) {
      this.root.querySelector('#mm-back')?.addEventListener('click', () => {
        audio.uiClick();
        this.screen = backTo;
        this.render();
      });
    }
  }

  // ------------------------------------------------------------- screens
  private renderPress(): void {
    this.root.innerHTML = `
      <div class="mm-topfade"></div>
      <div class="t-super">A RUST-BITTEN LOOTER-SHOOTER</div>
      <div class="t-logo">CLAUDELANDS <span class="two">2</span></div>
      <div class="t-tag">“Rust never sleeps. Neither do the guns.”</div>
      <div class="mm-press">PRESS ANY KEY</div>`;
  }

  private renderMenu(): void {
    const best = this.cb.bestWave();
    this.chrome(`
      <div class="mm-menu">
        <button class="mm-btn" id="mm-campaign">CAMPAIGN<span class="mm-sub">the claudelands contract — story, side jobs, four worlds</span></button>
        <button class="mm-btn" id="mm-endless">ENDLESS MODE<span class="mm-sub">the crucible — waves without end${best > 0 ? ` · best: wave ${best}` : ''}</span></button>
        <button class="mm-btn" id="mm-settings">SETTINGS<span class="mm-sub">look, feel, and how much the screen shakes</span></button>
      </div>`);
    this.root.querySelector('#mm-campaign')?.addEventListener('click', () => { audio.uiClick(); this.screen = 'campaign'; this.render(); });
    this.root.querySelector('#mm-endless')?.addEventListener('click', () => { audio.uiClick(); this.startMode = 'endless'; this.screen = 'select'; this.render(); });
    this.root.querySelector('#mm-settings')?.addEventListener('click', () => { audio.uiClick(); this.screen = 'settings'; this.render(); });
  }

  private renderCampaign(): void {
    const save = this.cb.hasSave();
    this.chrome(`
      <div class="mm-menu">
        ${save ? '<button class="mm-btn" id="mm-continue">CONTINUE CONTRACT<span class="mm-sub">pick up where the autosave left you</span></button>' : ''}
        <button class="mm-btn" id="mm-new">NEW CONTRACT<span class="mm-sub">full story from the gully up${save ? ' — overwrites the current save' : ''}</span></button>
        <button class="mm-btn" id="mm-veteran">VETERAN START<span class="mm-sub">skip the early jobs: level 10, geared, Brasshaven open, the Mayor waiting${save ? ' — overwrites the current save' : ''}</span></button>
      </div>`, 'menu');
    this.root.querySelector('#mm-continue')?.addEventListener('click', () => this.finish(() => this.cb.onContinue()));
    this.root.querySelector('#mm-new')?.addEventListener('click', () => { audio.uiClick(); this.startMode = 'new'; this.screen = 'select'; this.render(); });
    this.root.querySelector('#mm-veteran')?.addEventListener('click', () => { audio.uiClick(); this.startMode = 'veteran'; this.screen = 'select'; this.render(); });
  }

  // ------------------------------------------------------- character select
  private renderSelect(): void {
    const chosen: ClassDef = CLASSES.find((c) => c.id === this.chosenClass) ?? CLASSES[0];
    const cards = CLASSES.map((c) => `
      <div class="class-card ${this.chosenClass === c.id ? 'chosen' : ''}" data-cls="${c.id}">
        <div class="cc-name">${c.charName}</div>
        <div class="cc-class">${c.name}</div>
        <div class="cc-skill">◆ ${c.actionSkill.name}</div>
        <div class="cc-blurb">${c.blurb}</div>
      </div>`).join('');
    const trees = chosen.trees.map((t) => {
      const capstone = t.skills.find((s) => s.tier === 6);
      const notable = t.skills.filter((s) => s.tier <= 2).slice(0, 2);
      return `
        <div class="mm-tree">
          <div class="mm-tree-name">${t.name}</div>
          <div class="mm-tree-blurb">${t.blurb}</div>
          <div class="mm-tree-skills">
            ${notable.map((s) => `<div class="mm-skill">· ${s.name}</div>`).join('')}
            <div class="mm-skill mm-capstone">★ ${capstone?.name ?? ''} <span>${capstone ? capstone.desc(1).replace('CAPSTONE: ', '') : ''}</span></div>
          </div>
        </div>`;
    }).join('');
    const diffs = Object.values(DIFFICULTIES).map((d) => `
      <button class="diff-btn ${this.chosenDiff === d.id ? 'tab-on' : ''}" data-diff="${d.id}">${d.name}</button>`).join('');
    const modeLabel = this.startMode === 'endless' ? 'ENTER THE CRUCIBLE' : this.startMode === 'veteran' ? 'SIGN ON AS A VETERAN' : 'SIGN THE CONTRACT';

    this.chrome(`
      <div class="t-super">${this.startMode === 'endless' ? 'THE CRUCIBLE — CHOOSE YOUR FIGHTER' : 'CHOOSE YOUR CONTRACTOR'}</div>
      <div class="class-row">${cards}</div>
      <div class="mm-detail">
        <div class="mm-detail-head">
          <span class="mm-detail-name">${chosen.charName}</span> — ${chosen.name}
        </div>
        <div class="mm-playstyle">${chosen.playstyle}</div>
        <div class="mm-askill"><b>◆ ${chosen.actionSkill.name}</b> (${chosen.actionSkill.cooldown}s cooldown) — ${chosen.actionSkill.desc}</div>
        <div class="mm-trees">${trees}</div>
      </div>
      <div class="diff-row">${diffs}</div>
      <div class="diff-blurb">${DIFFICULTIES[this.chosenDiff].blurb}</div>
      <div class="t-buttons"><div class="t-start" id="cs-go">${modeLabel}</div></div>`,
      this.startMode === 'endless' ? 'menu' : 'campaign');

    this.root.querySelectorAll<HTMLElement>('.class-card').forEach((el) => {
      el.addEventListener('click', () => { this.chosenClass = el.dataset.cls!; audio.uiClick(); this.render(); });
    });
    this.root.querySelectorAll<HTMLElement>('.diff-btn').forEach((el) => {
      el.addEventListener('click', () => { this.chosenDiff = el.dataset.diff as DifficultyId; audio.uiClick(); this.render(); });
    });
    this.root.querySelector('#cs-go')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.finish(() => this.cb.onStart(this.startMode, this.chosenClass, this.chosenDiff));
    }, { once: true });
  }

  // ------------------------------------------------------------- settings
  private renderSettings(): void {
    const p = prefs();
    const toggle = (key: keyof Prefs, label: string, hint: string) => `
      <div class="mm-setting">
        <div><div class="mm-set-label">${label}</div><div class="mm-set-hint">${hint}</div></div>
        <button class="mm-toggle ${p[key] ? 'on' : ''}" data-key="${key}">${p[key] ? 'ON' : 'OFF'}</button>
      </div>`;
    const slider = (key: keyof Prefs, label: string, hint: string, min: number, max: number, step: number) => `
      <div class="mm-setting">
        <div><div class="mm-set-label">${label} <span class="mm-set-val" id="val-${key}">${p[key]}</span></div><div class="mm-set-hint">${hint}</div></div>
        <input class="mm-slider" type="range" data-key="${key}" min="${min}" max="${max}" step="${step}" value="${p[key]}">
      </div>`;
    this.chrome(`
      <div class="t-super">SETTINGS</div>
      <div class="mm-settings">
        <div class="mm-set-group">LOOK</div>
        ${toggle('inkOutlines', 'Ink Outlines', 'hand-drawn silhouette and edge lines')}
        ${toggle('crossHatch', 'Cross-Hatching', 'sketchy shading in the shadows')}
        ${toggle('bloom', 'Bloom', 'glow around lights, lava, and neon')}
        ${toggle('fxaa', 'Anti-Aliasing (FXAA)', 'smooths jagged edges')}
        ${toggle('filmGrain', 'Film Grain', 'a little paper texture on the frame')}
        ${toggle('vignette', 'Vignette', 'darkened frame corners')}
        ${slider('saturation', 'Color Saturation', 'how loud the wasteland dresses', 0.8, 1.5, 0.02)}
        <div class="mm-set-group">FEEL</div>
        ${toggle('screenShake', 'Screen Shake', 'explosions move the camera')}
        ${toggle('damageNumbers', 'Damage Numbers', 'comic-style hit numbers')}
        ${slider('fov', 'Field of View', 'wider sees more, warps more', 60, 100, 1)}
        <div class="t-buttons" style="margin-top:14px;"><div class="t-start t-secondary" id="mm-reset">RESET TO DEFAULTS</div></div>
      </div>`, 'menu');

    this.root.querySelectorAll<HTMLButtonElement>('.mm-toggle').forEach((b) => {
      b.addEventListener('click', () => {
        const key = b.dataset.key as keyof Prefs;
        setPref(key, !prefs()[key] as never);
        audio.uiClick();
        this.render();
      });
    });
    this.root.querySelectorAll<HTMLInputElement>('.mm-slider').forEach((s) => {
      s.addEventListener('input', () => {
        const key = s.dataset.key as keyof Prefs;
        setPref(key, Number(s.value) as never);
        const val = this.root.querySelector(`#val-${key}`);
        if (val) val.textContent = s.value;
      });
    });
    this.root.querySelector('#mm-reset')?.addEventListener('click', () => {
      resetPrefs();
      audio.uiClick();
      this.render();
      void DEFAULT_PREFS;
    });
  }
}
