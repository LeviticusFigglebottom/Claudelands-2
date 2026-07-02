// In-game HUD: vitals, ammo/weapon slots, action-skill cooldown ring,
// XP bar, money/grit, zone plate, kill-skill indicator, crosshair spread.

import { state, xpForLevel } from '../game/state';
import { statsys } from '../game/stats';
import { actionSkill } from '../game/actionskill';
import type { Player } from '../game/player';
import { PLAYER_CLASS } from '../data/classes';
import { GULLY_SEVEN } from '../data/zone';
import { rarityById } from '../data/rarity';
import { fmtNum } from '../util/maff';

export class Hud {
  private root = document.getElementById('hud')!;
  private els: Record<string, HTMLElement> = {};

  constructor() {
    this.root.innerHTML = `
      <div class="hud-corner hud-plate" id="hud-zone">
        <div class="zname">${GULLY_SEVEN.name}</div>
        <div class="zsub">${GULLY_SEVEN.subtitle}</div>
      </div>
      <div class="hud-corner" id="hud-money">
        <div id="money-val">$0</div>
        <div class="grit" id="grit-val"></div>
      </div>
      <div class="hud-corner hud-plate" id="hud-vitals">
        <div class="charname">${PLAYER_CLASS.charName} — ${PLAYER_CLASS.name}</div>
        <div class="bar shield"><div class="fill" id="bar-shield"></div><div class="lbl" id="lbl-shield"></div></div>
        <div class="bar health"><div class="fill" id="bar-health"></div><div class="lbl" id="lbl-health"></div></div>
      </div>
      <div class="hud-corner hud-plate" id="hud-ammo">
        <div class="gun-name" id="gun-name">—</div>
        <div><span class="mag" id="ammo-mag">0</span> <span class="reserve" id="ammo-reserve">/ 0</span></div>
        <div class="gren" id="gren-count"></div>
        <div class="slots" id="weapon-slots"></div>
      </div>
      <div class="hud-corner" id="hud-skill"><div class="skill-ring" id="skill-ring">SENTRY<br>RIG</div></div>
      <div class="hud-corner" id="hud-xp">
        <div class="xpbar"><div class="fill" id="bar-xp"></div></div>
        <div class="lvl" id="lbl-xp"></div>
      </div>
      <div class="hud-corner" id="hud-killskill"></div>
    `;
    for (const id of ['money-val', 'grit-val', 'bar-shield', 'lbl-shield', 'bar-health', 'lbl-health', 'gun-name', 'ammo-mag', 'ammo-reserve', 'gren-count', 'weapon-slots', 'skill-ring', 'bar-xp', 'lbl-xp', 'hud-killskill']) {
      this.els[id] = document.getElementById(id)!;
    }
    const ch = document.getElementById('crosshair')!;
    ch.innerHTML = `
      <div class="arm h" style="left:6px"></div><div class="arm h" style="right:6px"></div>
      <div class="arm v" style="top:6px"></div><div class="arm v" style="bottom:6px"></div>`;
  }

  update(player: Player): void {
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
      ring.innerHTML = 'SENTRY<br>RIG<br><span style="font-size:9px">[F]</span>';
    } else {
      ring.classList.remove('ready');
      const f = actionSkill.activeCount > 0 ? 1 : 1 - actionSkill.cooldownRemaining / actionSkill.cooldownTotal;
      ring.style.setProperty('--cd', `${Math.round(f * 100)}%`);
      ring.innerHTML = actionSkill.activeCount > 0 ? 'ACTIVE' : `${Math.ceil(actionSkill.cooldownRemaining)}s`;
    }

    e['bar-xp'].style.transform = `scaleX(${state.xp / xpForLevel(state.level)})`;
    e['lbl-xp'].textContent = `LEVEL ${state.level}${state.skillPoints > 0 ? ` — ${state.skillPoints} SKILL POINT${state.skillPoints > 1 ? 'S' : ''} [K]` : ''}`;

    const ks = statsys.activeKillBuffCount;
    e['hud-killskill'].textContent = ks > 0 ? `⚡ KILL SKILLS ×${ks}` : '';
  }
}
