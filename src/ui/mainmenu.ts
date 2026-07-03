// The front end of the game: cinematic attract-mode title (main.ts pans the
// camera over the live world behind this DOM), press-any-key, main menu
// (campaign / endless / settings), a settings panel of persisted graphics
// toggles, and the character select with playstyle + skill-tree previews.

import { CLASSES, type ClassDef } from '../data/classes';
import { DIFFICULTIES, type DifficultyId } from '../game/settings';
import { prefs, setPref, resetPrefs, DEFAULT_PREFS, type Prefs } from '../game/prefs';
import { SAVE_SLOTS, slotSummary, clearSave, exportSlot, importSlot, type SaveSlotId } from '../game/state';
import { audio } from '../audio/synth';
import { TRACKS } from '../data/race';
import { RACE_DIFFICULTIES } from '../data/race';
import { coop, MAX_PARTY } from '../net/coop';

export type StartMode = 'new' | 'veteran' | 'endless';

export interface MenuCallbacks {
  hasSave: () => boolean;
  bestWave: () => number;
  onContinue: (slot: SaveSlotId) => void;
  onStart: (mode: StartMode, classId: string, difficultyId: DifficultyId, slot: SaveSlotId) => void;
  onRace: (trackId: string, tier: string) => void;
}

type Screen = 'press' | 'menu' | 'campaign' | 'select' | 'settings' | 'race' | 'extras' | 'coop';

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
      case 'race': this.renderRace(); break;
      case 'extras': this.renderExtras(); break;
      case 'coop': this.renderCoop(); break;
    }
  }

  /** Called by main when the party roster changes — live-refresh the screen. */
  notifyCoop(): void {
    if (this.active && this.screen === 'coop') this.render();
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
        <button class="mm-btn" id="mm-race">RACE<span class="mm-sub">any circuit, three laps — solo practice or a grid duel</span></button>
        <button class="mm-btn" id="mm-coop">CO-OP<span class="mm-sub">party up — four contractors, no server, one shared story${coop.active ? ` · <b>LIVE: ${coop.code}</b>` : ''}</span></button>
        <button class="mm-btn" id="mm-extras">EXTRAS<span class="mm-sub">cheats, toggles, and one deeply cursed voice pack</span></button>
        <button class="mm-btn" id="mm-settings">SETTINGS<span class="mm-sub">look, feel, and how much the screen shakes</span></button>
      </div>`);
    this.root.querySelector('#mm-campaign')?.addEventListener('click', () => { audio.uiClick(); this.screen = 'campaign'; this.render(); });
    this.root.querySelector('#mm-endless')?.addEventListener('click', () => { audio.uiClick(); this.startMode = 'endless'; this.screen = 'select'; this.render(); });
    this.root.querySelector('#mm-race')?.addEventListener('click', () => { audio.uiClick(); this.screen = 'race'; this.render(); });
    this.root.querySelector('#mm-settings')?.addEventListener('click', () => { audio.uiClick(); this.screen = 'settings'; this.render(); });
    this.root.querySelector('#mm-coop')?.addEventListener('click', () => { audio.uiClick(); this.screen = 'coop'; this.render(); });
    this.root.querySelector('#mm-extras')?.addEventListener('click', () => { audio.uiClick(); this.screen = 'extras'; this.render(); });
  }


  // ---------------------------------------------------------- extras
  // Same visual language as SETTINGS (rows, toggles, sliders) -- the cheats
  // are dials now, not hardwired constants. Thug mode stays a toggle;
  // there is no half thug.
  private renderExtras(): void {
    const p = prefs();
    const toggle = (key: keyof Prefs, label: string, hint: string) => `
      <div class="mm-setting">
        <div><div class="mm-set-label">${label}</div><div class="mm-set-hint">${hint}</div></div>
        <button class="mm-toggle ${p[key] ? 'on' : ''}" data-extra="${key}">${p[key] ? 'ON' : 'OFF'}</button>
      </div>`;
    const fmt: Record<string, (v: number) => string> = {
      cheatSpeed: (v) => v <= 1 ? 'OFF' : `\u00d7${v.toFixed(2)}`,
      cheatLevel: (v) => v <= 1 ? 'OFF' : `LV ${Math.round(v)}`,
      cheatRich: (v) => v <= 0 ? 'OFF' : `$${Math.round(v).toLocaleString()}`,
    };
    const slider = (key: keyof Prefs, label: string, hint: string, min: number, max: number, step: number) => `
      <div class="mm-setting">
        <div><div class="mm-set-label">${label} <span class="mm-set-val" id="val-${key}">${fmt[key](p[key] as number)}</span></div><div class="mm-set-hint">${hint}</div></div>
        <input class="mm-slider" type="range" data-extra="${key}" min="${min}" max="${max}" step="${step}" value="${p[key]}">
      </div>`;
    this.chrome(`
      <div class="t-super">EXTRAS \u2014 TOYS, CHEATS, AND REGRETS</div>
      <div class="mm-settings">
        <div class="mm-set-group">THE CURSED SHELF</div>
        ${toggle('thugMode', 'Thug Mode', 'your character\u2019s voicelines, replaced by the sauce. audio only. you did this to yourself.')}
        <div class="mm-set-group">CHEATS</div>
        ${slider('cheatSpeed', 'Gotta Go Fast', 'move-speed multiplier, applied instantly \u2014 far left is OFF', 1, 2.5, 0.05)}
        ${slider('cheatLevel', 'Skip Leg Day', 'campaign level floor on run start or save load \u2014 far left is OFF', 1, 50, 1)}
        ${slider('cheatRich', 'Fat Stacks', 'wallet floor on run start or save load \u2014 far left is OFF', 0, 500000, 10000)}
        ${toggle('cheatTravel', 'Already Been Everywhere', 'every fast-travel station pre-discovered on load')}
      </div>`, 'menu');
    this.root.querySelectorAll<HTMLButtonElement>('button[data-extra]').forEach((btn) => {
      btn.addEventListener('click', () => {
        audio.uiClick();
        const key = btn.dataset.extra as keyof Prefs;
        setPref(key, !prefs()[key] as never);
        this.render();
      });
    });
    this.root.querySelectorAll<HTMLInputElement>('input[data-extra]').forEach((s) => {
      s.addEventListener('input', () => {
        const key = s.dataset.extra as keyof Prefs;
        setPref(key, Number(s.value) as never);
        const val = this.root.querySelector(`#val-${key}`);
        if (val) val.textContent = fmt[key](Number(s.value));
      });
    });
  }

  // ---------------------------------------------------------- co-op
  private coopBusy = false;

  private renderCoop(): void {
    const p = prefs();
    if (!p.playerName) {
      setPref('playerName', 'DRIFTER-' + Math.random().toString(36).slice(2, 5).toUpperCase());
    }
    const name = prefs().playerName;
    const roster = coop.active
      ? `<div class="mm-slot">
          <div class="mm-slot-head"><b>PARTY LIVE — CODE ${coop.code}</b> · ${coop.members.size + 1}/${MAX_PARTY} · ${coop.isHost ? 'you host the story ledger' : 'story follows the host'}</div>
          <div class="mm-slot-sub">you — ${name}</div>
          ${[...coop.members.values()].map((m) => `<div class="mm-slot-sub">◉ ${m.name} — LV ${m.level}</div>`).join('')}
          <div class="mm-slot-acts">
            <button class="mm-btn mm-slot-btn" id="coop-leave">LEAVE PARTY</button>
          </div>
        </div>
        <div class="dialogue-box">Party's on the line. Now open <b>CAMPAIGN</b> and pick a save — everyone plays their own
        character on their own worlds, and the story ledger stays shared. In game, <b>P</b> opens the party panel
        (trade anywhere, duel face to face).</div>`
      : `
        <div class="mm-slot">
          <div class="mm-slot-head"><b>HOST A PARTY</b></div>
          <div class="mm-slot-sub">get a 5-letter code, read it to up to three friends. your save is the story ledger.</div>
          <div class="mm-slot-acts"><button class="mm-btn mm-slot-btn" id="coop-host" ${this.coopBusy ? 'disabled' : ''}>OPEN THE LINE</button></div>
        </div>
        <div class="mm-slot">
          <div class="mm-slot-head"><b>JOIN A PARTY</b></div>
          <div class="mm-slot-sub">type the host's code. your character and loot stay yours; the story follows theirs.</div>
          <div class="mm-slot-acts">
            <input id="coop-code" maxlength="5" placeholder="CODE" style="width:110px; text-transform:uppercase" value="">
            <button class="mm-btn mm-slot-btn" id="coop-join" ${this.coopBusy ? 'disabled' : ''}>JOIN</button>
          </div>
        </div>
        <div class="mm-setting">
          <div><div class="mm-set-label">Same-device party</div><div class="mm-set-hint">two tabs in this browser instead of the internet — great for testing the ropes</div></div>
          <button class="mm-toggle ${this.coopLocal ? 'on' : ''}" id="coop-local">${this.coopLocal ? 'ON' : 'OFF'}</button>
        </div>
        ${coop.lastError ? `<div class="mm-slot-sub" style="color:#ff5a5a">${coop.lastError}</div>` : ''}
        ${this.coopBusy ? '<div class="mm-slot-sub">dialling…</div>' : ''}`;

    this.chrome(`
      <div class="t-super">CO-OP — FOUR CONTRACTORS, NO SERVER, ONE LEDGER</div>
      <div class="mm-menu" style="max-width:640px; gap:12px;">
        <div class="mm-setting">
          <div><div class="mm-set-label">Your handle</div><div class="mm-set-hint">what the party sees over your head</div></div>
          <input id="coop-name" maxlength="12" value="${name}" style="width:150px; text-transform:uppercase">
        </div>
        ${roster}
        <div class="mm-slot-sub">campaign only · objectives, enemies &amp; bosses shared on shared ground (scaled for the posse) · loot &amp; sound stay yours · trade and duel built in</div>
      </div>`, 'menu');

    this.root.querySelector<HTMLInputElement>('#coop-name')?.addEventListener('change', (e) => {
      const v = (e.target as HTMLInputElement).value.toUpperCase().replace(/[^A-Z0-9 _-]/g, '').trim().slice(0, 12);
      setPref('playerName', v || name);
    });
    this.root.querySelector('#coop-local')?.addEventListener('click', () => { this.coopLocal = !this.coopLocal; audio.uiClick(); this.render(); });
    this.root.querySelector('#coop-leave')?.addEventListener('click', () => { coop.leave(); audio.uiClick(); this.render(); });
    this.root.querySelector('#coop-host')?.addEventListener('click', () => {
      audio.uiClick();
      this.coopBusy = true;
      this.render();
      void coop.host(this.coopLocal).finally(() => { this.coopBusy = false; this.notifyRender(); });
    });
    this.root.querySelector('#coop-join')?.addEventListener('click', () => {
      const code = this.root.querySelector<HTMLInputElement>('#coop-code')?.value ?? '';
      if (code.trim().length < 4) return;
      audio.uiClick();
      this.coopBusy = true;
      this.render();
      void coop.join(code, this.coopLocal).finally(() => { this.coopBusy = false; this.notifyRender(); });
    });
  }

  private coopLocal = false;
  private notifyRender(): void { if (this.active && this.screen === 'coop') this.render(); }

  // ---------------------------------------------------------- race mode
  private renderRace(): void {
    const tiers = [
      { id: 'practice', name: 'PRACTICE', sub: 'solo — just you, the clock, and the racing line' },
      ...RACE_DIFFICULTIES.map((d) => ({ id: d.id, name: d.name, sub: d.blurb })),
    ];
    const cards = TRACKS.map((t) => `
      <div class="mm-slot">
        <div class="mm-slot-head"><b>${t.name}</b><span style="opacity:0.65"> · ${t.laps} laps</span></div>
        <div class="mm-slot-sub">${t.blurb}</div>
        <div class="mm-slot-acts">
          ${tiers.map((tr) => `<button class="mm-slot-btn" data-track="${t.id}" data-tier="${tr.id}" title="${tr.sub}">${tr.name}</button>`).join('')}
        </div>
      </div>`).join('');
    this.chrome(`
      <div class="mm-menu" style="max-width:640px;">
        <div class="mm-section">PICK A CIRCUIT — PICK A GRID</div>
        ${cards}
      </div>`, 'menu');
    this.root.querySelectorAll<HTMLButtonElement>('[data-track]').forEach((btn) => {
      btn.addEventListener('click', () => {
        audio.uiClick();
        const track = btn.dataset.track!;
        const tier = btn.dataset.tier!;
        this.finish(() => this.cb.onRace(track, tier));
      });
    });
  }

  // ---------------------------------------------------------- save slots
  private chosenSlot: SaveSlotId = 's1';
  private confirmDelete: SaveSlotId | null = null;

  private renderCampaign(): void {
    const classNames: Record<string, string> = {};
    for (const c of CLASSES) classNames[c.id] = c.charName;
    const cards = SAVE_SLOTS.map((slot, i) => {
      const s = slotSummary(slot);
      if (!s) {
        return `
          <div class="mm-slot" data-slot="${slot}">
            <div class="mm-slot-head">SLOT ${i + 1} — <span style="opacity:0.6">EMPTY</span></div>
            <div class="mm-slot-actions">
              <button class="mm-btn mm-slot-btn" data-act="new" data-slot="${slot}">NEW CONTRACT<span class="mm-sub">full story from the gully up</span></button>
              <button class="mm-btn mm-slot-btn" data-act="veteran" data-slot="${slot}">VETERAN START<span class="mm-sub">level 10, geared, Brasshaven open</span></button>
              <button class="mm-btn mm-slot-btn" data-act="import" data-slot="${slot}">IMPORT<span class="mm-sub">paste an exported save string</span></button>
            </div>
          </div>`;
      }
      const confirm = this.confirmDelete === slot;
      return `
        <div class="mm-slot" data-slot="${slot}">
          <div class="mm-slot-head">SLOT ${i + 1} — <b>${classNames[s.classId] ?? s.classId}</b> · LV ${s.level} · $${s.money.toLocaleString()} · ${s.mapId.replace('_', ' ')}</div>
          <div class="mm-slot-actions">
            <button class="mm-btn mm-slot-btn" data-act="continue" data-slot="${slot}">CONTINUE<span class="mm-sub">pick up where the autosave left you</span></button>
            <button class="mm-btn mm-slot-btn" data-act="new" data-slot="${slot}">NEW<span class="mm-sub">overwrites THIS slot only</span></button>
            <button class="mm-btn mm-slot-btn" data-act="export" data-slot="${slot}">EXPORT<span class="mm-sub">copy save string</span></button>
            <button class="mm-btn mm-slot-btn" data-act="delete" data-slot="${slot}" ${confirm ? 'style="border-color:#ff5a5a; color:#ff5a5a"' : ''}>${confirm ? 'REALLY DELETE?' : 'DELETE'}<span class="mm-sub">${confirm ? 'click again to erase forever' : 'clear this slot'}</span></button>
          </div>
        </div>`;
    }).join('');
    this.chrome(`
      <div class="t-super">CONTRACT LEDGER — THREE DESKS, PICK ONE</div>
      <div class="mm-menu" style="max-width:720px; gap:14px;">${cards}</div>`, 'menu');

    this.root.querySelectorAll<HTMLButtonElement>('.mm-slot-btn').forEach((b) => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const slot = b.dataset.slot as SaveSlotId;
        const act = b.dataset.act!;
        audio.uiClick();
        if (act === 'continue') { this.finish(() => this.cb.onContinue(slot)); return; }
        if (act === 'new') { this.chosenSlot = slot; this.startMode = 'new'; this.screen = 'select'; this.render(); return; }
        if (act === 'veteran') { this.chosenSlot = slot; this.startMode = 'veteran'; this.screen = 'select'; this.render(); return; }
        if (act === 'delete') {
          if (this.confirmDelete === slot) { clearSave(slot); this.confirmDelete = null; }
          else this.confirmDelete = slot;
          this.render();
          return;
        }
        if (act === 'export') {
          const code = exportSlot(slot);
          if (code) {
            void navigator.clipboard?.writeText(code).catch(() => { /* clipboard blocked */ });
            window.prompt('Save string (copied to clipboard where allowed) — keep it somewhere safe:', code);
          }
          return;
        }
        if (act === 'import') {
          const code = window.prompt('Paste an exported save string:');
          if (code && importSlot(slot, code)) this.render();
          else if (code) window.alert('That string didn’t parse as a save. No changes made.');
          return;
        }
      });
    });
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
      this.finish(() => this.cb.onStart(this.startMode, this.chosenClass, this.chosenDiff, this.chosenSlot));
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
        ${toggle('characterVoices', 'Character Voices', 'NPCs and the pit announcer perform their lines')}
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
