// Vendor panels for the two machines: Zaza's Bang-Bang Emporium (guns/ammo)
// and Doc Fizzy's Med-O-Mat (health). Stock is generated per visit at the
// player's level; each opening delivers a fresh line of vendor patter.

import { state } from '../game/state';
import { generateWeapon } from '../gen/weapongen';
import { generateShield, generateGrenadeMod } from '../gen/geargen';
import type { ItemInstance } from '../game/types';
import { itemCardHTML } from './itemcard';
import { rarityById } from '../data/rarity';
import { WEAPON_TYPES } from '../data/weapons';
import { VENDOR_LINES } from '../data/flavor';
import { audio } from '../audio/synth';
import { pick } from '../util/rng';
import { fmtNum } from '../util/maff';

export interface VendorCallbacks {
  onBuyItem: (item: ItemInstance) => void;
  onBuyAmmo: () => void;
  onBuyHealth: (frac: number) => void;
  playerHealthFrac: () => number;
}

export class VendorPanel {
  private stock: ItemInstance[] = [];
  private stockLevel = -1;
  private selected: ItemInstance | null = null;

  private restock(): void {
    if (this.stockLevel === state.level && this.stock.length > 0) return;
    this.stockLevel = state.level;
    this.stock = [
      generateWeapon({ level: state.level }),
      generateWeapon({ level: state.level }),
      generateWeapon({ level: state.level, luck: 1.5 }), // "item of the day" rolls hot
      generateShield(state.level),
      generateGrenadeMod(state.level),
    ];
  }

  render(root: HTMLElement, kind: 'vendor_gun' | 'vendor_med', cb: VendorCallbacks): void {
    if (kind === 'vendor_gun') this.renderGuns(root, cb);
    else this.renderMed(root, cb);
  }

  private renderGuns(root: HTMLElement, cb: VendorCallbacks): void {
    this.restock();
    const line = pick(Math.random as never, VENDOR_LINES.gunveda);
    const ammoCost = 20 + state.level * 4;
    const rows = this.stock.map((item, i) => {
      const r = rarityById(item.rarity);
      const dayTag = i === 2 ? ' <b style="color:#ffd23c">★ ITEM OF THE DAY</b>' : '';
      return `<div class="inv-row ${item === this.selected ? 'sel' : ''}" data-idx="${i}" style="--rarity:${r.css}">
        <div class="r-name">${item.name}${dayTag}</div>
        <div class="r-lvl" style="color:#8fff3d">$${fmtNum(item.value)}</div>
      </div>`;
    }).join('');

    root.innerHTML = `
      <h1>MADAME ZAZA’S BANG-BANG EMPORIUM</h1>
      <div class="p-sub vendor-line">“${line}”</div>
      <div class="p-body">
        <div style="flex:1.2; display:flex; flex-direction:column; min-height:0;">
          <div class="vendor-stock">${rows}</div>
          <div style="margin-top:10px; display:flex; gap:8px;">
            <button id="v-ammo">REFILL ALL AMMO — $${ammoCost}</button>
          </div>
          <div class="p-hint">Your wallet: <b style="color:#8fff3d">$${fmtNum(state.money)}</b></div>
        </div>
        <div class="inv-detail">
          ${this.selected ? itemCardHTML(this.selected) + `<div style="margin-top:10px"><button id="v-buy">BUY — $${fmtNum(this.selected.value)}</button></div>` : '<div style="opacity:0.6; padding:30px 10px;">Point at something shiny, sugar.</div>'}
        </div>
      </div>
      <div class="p-hint">E / ESC to close · stock refreshes when you level</div>`;

    root.querySelectorAll<HTMLElement>('.inv-row').forEach((row) => {
      row.addEventListener('click', () => { this.selected = this.stock[Number(row.dataset.idx)]; audio.uiClick(); this.renderGuns(root, cb); });
    });
    root.querySelector('#v-buy')?.addEventListener('click', () => {
      const item = this.selected;
      if (!item || state.money < item.value) { audio.uiError(); return; }
      state.money -= item.value;
      this.stock.splice(this.stock.indexOf(item), 1);
      this.selected = null;
      audio.uiBuy();
      cb.onBuyItem(item);
      this.renderGuns(root, cb);
    });
    root.querySelector('#v-ammo')?.addEventListener('click', () => {
      if (state.money < ammoCost) { audio.uiError(); return; }
      state.money -= ammoCost;
      for (const t of Object.values(WEAPON_TYPES)) state.ammo.set(t.id, t.ammoPool);
      state.grenades = state.maxGrenades;
      audio.uiBuy();
      cb.onBuyAmmo();
      this.renderGuns(root, cb);
    });
  }

  private renderMed(root: HTMLElement, cb: VendorCallbacks): void {
    const line = pick(Math.random as never, VENDOR_LINES.medveda);
    const smallCost = 15 + state.level * 3;
    const bigCost = 40 + state.level * 8;
    const hp = Math.round(cb.playerHealthFrac() * 100);
    root.innerHTML = `
      <h1>DOC FIZZY’S MED-O-MAT</h1>
      <div class="p-sub vendor-line">“${line}”</div>
      <div class="p-body"><div style="flex:1">
        <div class="p-sub">Current meat integrity: <b style="color:#ff5a5a">${hp}%</b> · Wallet: <b style="color:#8fff3d">$${fmtNum(state.money)}</b></div>
        <div style="display:flex; flex-direction:column; gap:10px; max-width:420px; margin-top:14px;">
          <button id="v-small">FIZZY JUICE (heal 35%) — $${smallCost}</button>
          <button id="v-big">FAMILY-SIZE FIZZY (heal 100%) — $${bigCost}</button>
        </div>
      </div></div>
      <div class="p-hint">E / ESC to close · no refunds, juice is juice</div>`;
    root.querySelector('#v-small')?.addEventListener('click', () => {
      if (state.money < smallCost) { audio.uiError(); return; }
      state.money -= smallCost; audio.uiBuy(); cb.onBuyHealth(0.35); this.renderMed(root, cb);
    });
    root.querySelector('#v-big')?.addEventListener('click', () => {
      if (state.money < bigCost) { audio.uiError(); return; }
      state.money -= bigCost; audio.uiBuy(); cb.onBuyHealth(1); this.renderMed(root, cb);
    });
  }
}
