// In-game HUD — pass 2: vitals, ammo/slots, skill ring, XP, money/grit,
// dynamic district plate (updates as you cross district lines), aim-target
// nameplate, boss health bar, dynamic crosshair spread, and the damage
// direction arc.

import * as THREE from 'three';
import { state, xpForLevel } from '../game/state';
import { statsys } from '../game/stats';
import { actionSkill } from '../game/actionskill';
import type { Player } from '../game/player';
import { PLAYER_CLASS } from '../data/classes';
import { WORLD } from '../data/world';
import { rarityById } from '../data/rarity';
import { fmtNum } from '../util/maff';
import { enemySpawner, type Enemy } from '../game/enemies';

export class Hud {
  private root = document.getElementById('hud')!;
  private els: Record<string, HTMLElement> = {};
  private lastDistrictId = '';
  private nameplateTimer = 0;
  private crossArms: HTMLElement[] = [];

  constructor() {
    this.root.innerHTML = `
      <div class="hud-corner hud-plate" id="hud-zone">
        <div class="zname" id="zone-name">${WORLD.name}</div>
        <div class="zsub" id="zone-sub">Rust never sleeps.</div>
      </div>
      <div class="hud-corner" id="hud-money">
        <div id="money-val">$0</div>
        <div class="grit" id="grit-val"></div>
      </div>
      <div class="hud-corner hud-plate" id="hud-vitals">
        <div class="charname" id="char-name">${PLAYER_CLASS.charName} — ${PLAYER_CLASS.name}</div>
        <div class="bar shield"><div class="fill" id="bar-shield"></div><div class="lbl" id="lbl-shield"></div></div>
        <div class="bar health"><div class="fill" id="bar-health"></div><div class="lbl" id="lbl-health"></div></div>
      </div>
      <div class="hud-corner hud-plate" id="hud-ammo">
        <div class="gun-name" id="gun-name">—</div>
        <div><span class="mag" id="ammo-mag">0</span> <span class="reserve" id="ammo-reserve">/ 0</span></div>
        <div class="gren" id="gren-count"></div>
        <div class="slots" id="weapon-slots"></div>
      </div>
      <div class="hud-corner" id="hud-skill"><div class="skill-ring" id="skill-ring"></div></div>
      <div class="hud-corner" id="hud-xp">
        <div class="xpbar"><div class="fill" id="bar-xp"></div></div>
        <div class="lvl" id="lbl-xp"></div>
      </div>
      <div class="hud-corner" id="hud-killskill"></div>
    `;
    for (const id of ['money-val', 'grit-val', 'bar-shield', 'lbl-shield', 'bar-health', 'lbl-health', 'gun-name', 'ammo-mag', 'ammo-reserve', 'gren-count', 'weapon-slots', 'skill-ring', 'bar-xp', 'lbl-xp', 'hud-killskill', 'zone-name', 'zone-sub']) {
      this.els[id] = document.getElementById(id)!;
    }
    const ch = document.getElementById('crosshair')!;
    ch.innerHTML = `
      <div class="arm h" id="ca-l"></div><div class="arm h" id="ca-r"></div>
      <div class="arm v" id="ca-t"></div><div class="arm v" id="ca-b"></div>
      <div id="ca-dot" style="position:absolute; left:50%; top:50%; width:3px; height:3px; margin:-1.5px; border-radius:50%; background:#f4ead8; opacity:0;"></div>
      <div id="ca-ring" style="position:absolute; left:50%; top:50%; width:40px; height:40px; border:1.5px solid rgba(244,234,216,0.85); border-radius:50%; transform:translate(-50%,-50%); opacity:0;"></div>`;
    this.crossArms = ['ca-l', 'ca-r', 'ca-t', 'ca-b'].map((id) => document.getElementById(id)!);

    // full sniper scope: vignette mask, crosshair lines, mil dots, rim
    this.scope = document.createElement('div');
    this.scope.id = 'scope-overlay';
    this.scope.style.cssText = 'position:absolute; inset:0; z-index:4; pointer-events:none; display:none;';
    this.scope.innerHTML = `
      <div style="position:absolute; inset:0; background:radial-gradient(circle at 50% 50%, transparent 0 30vmin, rgba(4,6,8,0.985) 31.5vmin 100%);"></div>
      <div style="position:absolute; left:50%; top:50%; width:60vmin; height:60vmin; transform:translate(-50%,-50%); border-radius:50%; box-shadow:inset 0 0 40px rgba(0,0,0,0.9), inset 0 0 4px rgba(84,212,255,0.5);"></div>
      <div style="position:absolute; left:calc(50% - 30vmin); top:50%; width:60vmin; height:1px; background:rgba(20,26,30,0.9);"></div>
      <div style="position:absolute; top:calc(50% - 30vmin); left:50%; height:60vmin; width:1px; background:rgba(20,26,30,0.9);"></div>
      ${[8, 14, 20].map((d) => `
        <div style="position:absolute; left:50%; top:calc(50% + ${d}vmin); width:5px; height:1.5px; margin-left:-2.5px; background:rgba(20,26,30,0.85);"></div>
        <div style="position:absolute; top:50%; left:calc(50% + ${d}vmin); height:5px; width:1.5px; margin-top:-2.5px; background:rgba(20,26,30,0.85);"></div>
        <div style="position:absolute; top:50%; left:calc(50% - ${d}vmin); height:5px; width:1.5px; margin-top:-2.5px; background:rgba(20,26,30,0.85);"></div>`).join('')}
      <div style="position:absolute; left:50%; top:50%; width:5px; height:5px; margin:-2.5px; border-radius:50%; border:1.5px solid rgba(255,90,90,0.9);"></div>`;
    document.getElementById('ui-root')?.appendChild(this.scope);

    // damage direction arc responder
  }

  private scope!: HTMLElement;
  private scopedNow = false;

  /** ADS presentation: arms tighten to a dot, shotguns/launchers get a ring,
   *  true scopes (zoom ≥ 2.5) go full-tube and holster the viewmodel. */
  private updateAds(player: Player): void {
    const w = state.activeWeapon;
    const ads = player.adsAmount;
    const zoom = w?.stats.zoom ?? 1;
    const kind = !w || ads < 0.45 ? 'none'
      : zoom >= 2.5 ? 'scope'
      : w.type === 'shotgun' || w.type === 'launcher' ? 'circle'
      : 'dot';

    const dot = document.getElementById('ca-dot');
    const ring = document.getElementById('ca-ring');
    if (dot) dot.style.opacity = kind === 'dot' ? String(ads) : '0';
    if (ring) {
      ring.style.opacity = kind === 'circle' ? String(ads * 0.9) : '0';
      const px = 26 + player.lastSpreadDeg * 16;
      ring.style.width = `${px}px`; ring.style.height = `${px}px`;
    }
    const arms = kind === 'scope' ? 0 : 1;
    for (const a of this.crossArms) a.style.opacity = String(arms * (kind === 'dot' ? 1 - ads * 0.5 : 1));

    const scoped = kind === 'scope' && ads > 0.7;
    this.scope.style.display = scoped ? 'block' : 'none';
    if (scoped !== this.scopedNow) {
      this.scopedNow = scoped;
      // the gun leaves the frame while you're in the tube
      player.viewmodel.scale.setScalar(scoped ? 0.0001 : 1);
    }
  }

  /** Refresh class-dependent labels (call after class select / load). */
  setCharacter(): void {
    const el = document.getElementById('char-name');
    if (el) el.textContent = `${PLAYER_CLASS.charName} — ${PLAYER_CLASS.name}`;
  }

  /** Rotate + flash the hurt-direction arc. relAngle: 0 = ahead, +right. */
  hurtFrom(relAngle: number): void {
    const el = document.getElementById('hurt-dir')!;
    el.style.transform = `translate(-50%, -50%) rotate(${relAngle}rad)`;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  setDistrict(name: string, subtitle: string): void {
    if (name === this.lastDistrictId) return;
    this.lastDistrictId = name;
    this.els['zone-name'].textContent = name;
    this.els['zone-sub'].textContent = subtitle;
    const plate = document.getElementById('hud-zone')!;
    plate.classList.remove('district-flash');
    void plate.offsetWidth;
    plate.classList.add('district-flash');
  }

  update(player: Player, dt: number): void {
    const e = this.els;
    e['money-val'].textContent = '$' + fmtNum(state.money);
    e['grit-val'].textContent = `GRIT ${state.grit.tokens - Object.values(state.grit.spent).reduce((a, b) => a + b, 0)}◆ / RANK ${state.grit.tokens}`;

    e['bar-shield'].style.transform = `scaleX(${player.maxShield > 0 ? player.shield / player.maxShield : 0})`;
    e['lbl-shield'].textContent = player.maxShield > 0 ? `${Math.ceil(player.shield)} / ${Math.ceil(player.maxShield)}` : 'NO SHIELD';
    e['bar-health'].style.transform = `scaleX(${Math.max(0, player.flesh / player.maxFlesh)})`;
    e['lbl-health'].textContent = `${Math.ceil(Math.max(0, player.flesh))} / ${Math.ceil(player.maxFlesh)}`;

    const w = state.activeWeapon;
    e['gun-name'].textContent = w ? w.name : 'UNARMED';
    e['gun-name'].style.color = w ? rarityById(w.rarity).css : '#888';
    e['ammo-mag'].textContent = w ? String(player.magazineCount) : '—';
    e['ammo-reserve'].textContent = w ? `/ ${fmtNum(state.ammo.get(w.type) ?? 0)}` : '';
    e['gren-count'].textContent = `◈ GRENADES ${state.grenades}${state.grenadeMod ? ' · ' + state.grenadeMod.deliveryLabel : ''}`;

    let slots = '';
    state.equippedWeapons.forEach((sw, i) => {
      slots += `<div class="slot ${i === state.activeSlot ? 'active' : ''}" style="border-color:${sw ? rarityById(sw.rarity).css : '#555'}"></div>`;
    });
    e['weapon-slots'].innerHTML = slots;

    const ring = e['skill-ring'];
    if (actionSkill.ready) {
      ring.classList.add('ready');
      ring.style.setProperty('--cd', '100%');
      const label = PLAYER_CLASS.actionSkill.name.toUpperCase().split(' ').join('<br>');
      ring.innerHTML = `${label}<br><span style="font-size:9px">[F]</span>`;
    } else {
      ring.classList.remove('ready');
      const f = actionSkill.activeCount > 0 ? 1 : 1 - actionSkill.cooldownRemaining / actionSkill.cooldownTotal;
      ring.style.setProperty('--cd', `${Math.round(f * 100)}%`);
      ring.innerHTML = actionSkill.activeCount > 0 ? 'ACTIVE' : `${Math.ceil(actionSkill.cooldownRemaining)}s`;
    }

    e['bar-xp'].style.transform = `scaleX(${state.xp / xpForLevel(state.level)})`;
    e['lbl-xp'].textContent = `LEVEL ${state.level}${state.skillPoints > 0 ? ` — ${state.skillPoints} SKILL POINT${state.skillPoints > 1 ? 'S' : ''} [K]` : ''}`;

    const ks = statsys.activeKillBuffCount;
    const scrap = statsys.stackCount('scrap');
    const salt = statsys.stackCount('salt');
    const chips = [
      ks > 0 ? `⚡ KILL SKILLS ×${ks}` : '',
      scrap > 0 ? `⚙ SCRAP ×${scrap}` : '',
      salt > 0 ? `✚ SALT ×${salt}` : '',
    ].filter(Boolean);
    e['hud-killskill'].textContent = chips.join('   ');

    // dynamic crosshair spread + ADS reticle morphing
    const px = 6 + player.lastSpreadDeg * 9;
    const [l, r, t, b] = this.crossArms;
    l.style.left = `-${px + 9}px`; r.style.right = `-${px + 9}px`;
    t.style.top = `-${px + 9}px`; b.style.bottom = `-${px + 9}px`;
    this.updateAds(player);

    // target nameplate (sampled every few frames)
    this.nameplateTimer -= dt;
    if (this.nameplateTimer <= 0) {
      this.nameplateTimer = 0.12;
      this.updateNameplate(player);
    }

    // boss bar
    this.updateBossBar();
  }

  private updateNameplate(player: Player): void {
    const plate = document.getElementById('target-plate')!;
    const dir = player.forward;
    const ray = new THREE.Raycaster(player.camera.position.clone(), dir, 0.1, 90);
    const hit = player.raycastTargets(ray);
    if (hit?.enemy && hit.enemy !== enemySpawner.boss) {
      const en = hit.enemy;
      const total = en.maxFlesh + en.maxShield + en.maxArmor;
      const cur = en.flesh + en.shield + en.armor;
      plate.innerHTML = `
        <div class="tp-name ${en.badass ? 'badass' : ''}">${en.displayName} <span class="tp-lvl">Lv ${en.level}</span></div>
        <div class="tp-bar"><div class="tp-fill" style="transform:scaleX(${Math.max(0, cur / total)})"></div></div>`;
      plate.style.display = 'block';
    } else {
      plate.style.display = 'none';
    }
  }

  /** Set by main: the boss bar stays hidden until the pre-fight cinematic has played. */
  bossIntroSeen: (bossId: string) => boolean = () => true;

  private updateBossBar(): void {
    const bar = document.getElementById('boss-bar')!;
    const boss: Enemy | null = enemySpawner.boss;
    if (boss && boss.alive && this.bossIntroSeen(boss.def.id)) {
      const total = boss.maxFlesh + boss.maxShield + boss.maxArmor;
      const cur = boss.flesh + boss.shield + boss.armor;
      bar.innerHTML = `
        <div class="bb-name">${boss.displayName}</div>
        <div class="bb-bar">
          <div class="bb-fill" style="transform:scaleX(${Math.max(0, cur / total)})"></div>
        </div>`;
      bar.style.display = 'block';
    } else {
      bar.style.display = 'none';
    }
  }
}
