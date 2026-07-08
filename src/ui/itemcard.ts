// Item card renderer: one HTML builder for every gear kind, showing
// manufacturer, rarity, stats, parts list, element, gimmick and red text.
// Used by the hover card, the inventory panel, and vendors.

import type { ItemInstance, WeaponInstance } from '../game/types';
import { rarityById } from '../data/rarity';
import { makerById } from '../data/manufacturers';
import { ELEMENTS } from '../data/elements';
import { WEAPON_TYPES } from '../data/weapons';
import { LEGENDARIES } from '../data/legendaries';
import { modifierById } from '../data/modifiers';
import { fmtNum } from '../util/maff';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** DPS estimate shown big on weapon cards. */
export function weaponDps(w: WeaponInstance): number {
  const s = w.stats;
  const cycle = s.magSize / s.fireRate + s.reloadTime;
  return s.damage * s.pellets * s.fireRate * ((s.magSize / s.fireRate) / cycle);
}

function cmp(now: number, other: number | undefined, higherBetter = true): string {
  if (other === undefined) return '';
  const diff = now - other;
  if (Math.abs(diff) < 0.01) return '';
  const up = higherBetter ? diff > 0 : diff < 0;
  const arrow = diff > 0 ? '▲' : '▼';
  return ` <span class="ic-cmp ${up ? 'cmp-up' : 'cmp-down'}">${arrow}</span>`;
}

export function itemCardHTML(item: ItemInstance, compare?: ItemInstance | null): string {
  const rarity = rarityById(item.rarity);
  const glow = rarity.tier >= 3 ? rarity.css + '66' : 'transparent';
  const head = (typeLabel: string, mfr?: string, tagline?: string) => `
    <div class="ic-name">${esc(item.name)}</div>
    ${mfr ? `<div class="ic-mfr">${esc(mfr)}</div>` : ''}
    ${tagline ? `<div class="ic-tagline">${esc(tagline)}</div>` : ''}
    <div class="ic-type">${rarity.name} ${typeLabel} · Lv ${item.level}</div>`;

  let body = '';

  if (item.kind === 'weapon') {
    const maker = makerById(item.maker);
    const s = item.stats;
    const cw = compare && compare.kind === 'weapon' ? compare : null;
    const elem = ELEMENTS[item.element];
    const leg = item.legendaryId ? LEGENDARIES.find((l) => l.id === item.legendaryId) : null;
    const partsList = Object.values(item.parts).map((p) => esc(p.name)).join(' · ');
    body = `
      ${head(WEAPON_TYPES[item.type].name, maker.name, maker.tagline)}
      <div class="ic-bigstat">
        <div><div class="num">${fmtNum(weaponDps(item))}${cmp(weaponDps(item), cw ? weaponDps(cw) : undefined)}</div><div class="cap">DPS</div></div>
        <div><div class="num">${fmtNum(s.damage)}${s.pellets > 1 ? ` <span style="font-size:14px">×${s.pellets}</span>` : ''}${cmp(s.damage, cw?.stats.damage)}</div><div class="cap">DAMAGE</div></div>
        <div><div class="num">${s.fireRate.toFixed(1)}${cmp(s.fireRate, cw?.stats.fireRate)}</div><div class="cap">RATE</div></div>
      </div>
      <table>
        <tr><td>Accuracy</td><td class="v">${s.accuracy.toFixed(0)}${cmp(s.accuracy, cw?.stats.accuracy)}</td></tr>
        <tr><td>Magazine</td><td class="v">${s.magSize}${cmp(s.magSize, cw?.stats.magSize)}</td></tr>
        <tr><td>Reload</td><td class="v">${s.reloadTime.toFixed(1)}s${cmp(s.reloadTime, cw?.stats.reloadTime, false)}</td></tr>
        ${s.critBonus > 0 ? `<tr><td>Crit Bonus</td><td class="v">+${Math.round(s.critBonus * 100)}%</td></tr>` : ''}
      </table>
      ${item.element !== 'kinetic' ? `<div class="ic-elem" style="color:${elem.css}">◆ ${elem.name} — ${Math.round(s.elemChance * 100)}% chance · ${fmtNum(s.elemDps)}/s ${esc(elem.statusName)}</div>` : ''}
      ${(() => { const m = modifierById(item.modifier); return m ? `<div class="ic-effect" style="color:${m.css}">✦ ${esc(m.name)} — ${esc(m.blurb)}</div>` : ''; })()}
      <div class="ic-effect">★ ${esc(maker.gimmickLabel)}</div>
      ${leg ? `<div class="ic-effect">★ ${esc(leg.effectLabel)}</div>` : ''}
      ${item.redText ? `<div class="ic-red">${esc(item.redText)}</div>` : ''}
      <div class="ic-parts"><b>PARTS:</b> ${partsList}</div>`;
  } else if (item.kind === 'shield') {
    const maker = makerById(item.maker);
    const cs = compare && compare.kind === 'shield' ? compare : null;
    body = `
      ${head('Shield', maker.name, maker.tagline)}
      <div class="ic-bigstat">
        <div><div class="num">${fmtNum(item.capacity)}${cmp(item.capacity, cs?.capacity)}</div><div class="cap">CAPACITY</div></div>
        <div><div class="num">${fmtNum(item.rechargeRate)}${cmp(item.rechargeRate, cs?.rechargeRate)}</div><div class="cap">RECHARGE</div></div>
        <div><div class="num">${item.rechargeDelay.toFixed(1)}s${cmp(item.rechargeDelay, cs?.rechargeDelay, false)}</div><div class="cap">DELAY</div></div>
      </div>
      ${item.special ? `<div class="ic-effect">★ ${esc(item.special.label)}</div>` : ''}
      ${item.redText ? `<div class="ic-red">${esc(item.redText)}</div>` : ''}`;
  } else if (item.kind === 'grenade') {
    const elem = ELEMENTS[item.element];
    body = `
      ${head('Grenade Mod')}
      <div class="ic-bigstat">
        <div><div class="num">${fmtNum(item.damage)}</div><div class="cap">DAMAGE</div></div>
        <div><div class="num">${item.radius.toFixed(1)}m</div><div class="cap">RADIUS</div></div>
        <div><div class="num">${item.fuse.toFixed(1)}s</div><div class="cap">FUSE</div></div>
      </div>
      <div class="ic-elem" style="color:${elem.css}">◆ ${elem.name} payload</div>
      <div class="ic-effect">★ ${esc(item.deliveryLabel)}${item.childCount ? ` — splits into ${item.childCount}` : ''}</div>
      ${item.redText ? `<div class="ic-red">${esc(item.redText)}</div>` : ''}`;
  } else if (item.kind === 'classmod') {
    body = `
      ${head(`${esc(item.className)} Class Mod`)}
      ${item.skillBoosts.map((b) => `<div class="ic-effect">+${b.points} ${esc(b.skillName)}</div>`).join('')}
      <table>${item.passives.map((p) => `<tr><td>${esc(p.label)}</td><td class="v">+${Math.round(p.amount * 100)}%</td></tr>`).join('')}</table>`;
  } else {
    body = `
      ${head('Relic')}
      <table>${item.passives.map((p) => `<tr><td>${esc(p.label)}</td><td class="v">+${Math.round(p.amount * 100)}%</td></tr>`).join('')}</table>
      <div class="ic-red">${esc(item.flavor)}</div>`;
  }

  return `<div class="item-card" style="--rarity:${rarity.css}; --rarity-glow:${glow}">${body}<div class="ic-value">$${fmtNum(item.value)}</div></div>`;
}
