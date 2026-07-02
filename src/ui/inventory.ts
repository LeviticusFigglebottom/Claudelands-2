// Inventory panel (TAB): equipped gear slots + backpack list + full item
// card with compare-vs-equipped. Click to select, buttons to equip/drop/sell.

import { state } from '../game/state';
import type { ItemInstance, WeaponInstance } from '../game/types';
import { itemCardHTML } from './itemcard';
import { rarityById } from '../data/rarity';
import { audio } from '../audio/synth';

export interface InventoryCallbacks {
  onEquipChange: () => void;      // re-derive vitals / viewmodel
  onDrop: (item: ItemInstance) => void;
}

export class InventoryPanel {
  private selected: ItemInstance | null = null;
  private cb: InventoryCallbacks;

  constructor(cb: InventoryCallbacks) {
    this.cb = cb;
  }

  render(root: HTMLElement): void {
    const kindLabel: Record<string, string> = { weapon: 'WEAPON', shield: 'SHIELD', grenade: 'GRENADE', classmod: 'CLASS MOD', relic: 'RELIC' };
    const rows = state.inventory
      .map((item, i) => {
        const r = rarityById(item.rarity);
        return `<div class="inv-row ${item === this.selected ? 'sel' : ''}" data-idx="${i}" style="--rarity:${r.css}">
          <div class="r-kind">${kindLabel[item.kind]}</div>
          <div class="r-name">${item.name}</div>
          <div class="r-lvl">Lv ${item.level}</div>
        </div>`;
      })
      .join('');

    const slotHtml = (label: string, item: ItemInstance | null, extra = '', slotClass = '') => {
      const r = item ? rarityById(item.rarity) : null;
      return `<div class="equip-slot ${slotClass}" ${extra} style="--rarity:${r?.css ?? '#888'}">
        <div class="es-label">${label}</div>
        <div class="es-item">${item ? item.name : '— empty —'}</div>
      </div>`;
    };

    const equipped = `
      <div class="equip-slots">
        ${state.equippedWeapons.map((w, i) => slotHtml(`WEAPON ${i + 1}`, w, `data-wslot="${i}"`, i === state.activeSlot ? 'active-weapon' : '')).join('')}
        ${slotHtml('SHIELD', state.shield, 'data-gslot="shield"')}
        ${slotHtml('GRENADE MOD', state.grenadeMod, 'data-gslot="grenade"')}
        ${slotHtml('CLASS MOD', state.classMod, 'data-gslot="classmod"')}
        ${slotHtml('RELIC', state.relic, 'data-gslot="relic"')}
      </div>`;

    const compare = this.compareTarget(this.selected);
    const detail = this.selected
      ? `${itemCardHTML(this.selected, compare)}
         <div style="display:flex; gap:8px; margin-top:10px;">
           <button id="inv-equip">EQUIP</button>
           <button id="inv-drop">DROP</button>
         </div>
         ${compare ? `<div style="margin-top:12px; opacity:0.8; font-size:11px; letter-spacing:0.1em;">CURRENTLY EQUIPPED:</div>${itemCardHTML(compare)}` : ''}`
      : `<div style="opacity:0.6; padding:30px 10px;">Select an item, Vault-Rat.</div>`;

    root.innerHTML = `
      <h1>BACKPACK</h1>
      <div class="p-sub">${state.inventory.length} items · $${state.money} · Every gun a snowflake, every snowflake a murder weapon.</div>
      <div class="p-body">
        <div style="flex:1.4; display:flex; flex-direction:column; min-height:0;">
          ${equipped}
          <div class="inv-list">${rows || '<div style="opacity:0.5; padding:16px;">Backpack’s empty. The gully will fix that.</div>'}</div>
        </div>
        <div class="inv-detail">${detail}</div>
      </div>
      <div class="p-hint">CLICK item to inspect · EQUIP puts weapons in the active slot · TAB / ESC to close</div>`;

    root.querySelectorAll<HTMLElement>('.inv-row').forEach((row) => {
      row.addEventListener('click', () => {
        this.selected = state.inventory[Number(row.dataset.idx)];
        audio.uiClick();
        this.render(root);
      });
    });
    root.querySelectorAll<HTMLElement>('[data-wslot]').forEach((slot) => {
      slot.addEventListener('click', () => {
        state.activeSlot = Number(slot.dataset.wslot);
        audio.uiClick();
        this.cb.onEquipChange();
        this.render(root);
      });
    });
    root.querySelector('#inv-equip')?.addEventListener('click', () => { this.equipSelected(); this.render(root); });
    root.querySelector('#inv-drop')?.addEventListener('click', () => {
      if (!this.selected) return;
      const i = state.inventory.indexOf(this.selected);
      if (i >= 0) state.inventory.splice(i, 1);
      this.cb.onDrop(this.selected);
      this.selected = null;
      audio.uiClick();
      this.render(root);
    });
  }

  private compareTarget(item: ItemInstance | null): ItemInstance | null {
    if (!item) return null;
    switch (item.kind) {
      case 'weapon': return state.activeWeapon !== item ? state.activeWeapon : null;
      case 'shield': return state.shield !== item ? state.shield : null;
      case 'grenade': return state.grenadeMod !== item ? state.grenadeMod : null;
      case 'classmod': return state.classMod !== item ? state.classMod : null;
      case 'relic': return state.relic !== item ? state.relic : null;
    }
  }

  private equipSelected(): void {
    const item = this.selected;
    if (!item) return;
    audio.pickup();
    const inv = state.inventory;
    const takeOut = () => { const i = inv.indexOf(item); if (i >= 0) inv.splice(i, 1); };
    switch (item.kind) {
      case 'weapon': {
        takeOut();
        const old = state.equippedWeapons[state.activeSlot];
        if (old) inv.push(old);
        state.equippedWeapons[state.activeSlot] = item as WeaponInstance;
        break;
      }
      case 'shield': { takeOut(); if (state.shield) inv.push(state.shield); state.shield = item; break; }
      case 'grenade': { takeOut(); if (state.grenadeMod) inv.push(state.grenadeMod); state.grenadeMod = item; break; }
      case 'classmod': { takeOut(); if (state.classMod) inv.push(state.classMod); state.classMod = item; break; }
      case 'relic': { takeOut(); if (state.relic) inv.push(state.relic); state.relic = item; break; }
    }
    this.cb.onEquipChange();
  }
}
