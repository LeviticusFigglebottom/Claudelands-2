// Party UI: the persistent teammate HUD (left edge), and the PARTY panel (P)
// with the roster, the trade table, and duel prompts. All state lives in
// coop.ts — this file only draws it and forwards clicks.

import { coop } from '../net/coop';
import { CLASS_TINT_CSS } from '../net/remoteplayers';
import { state } from '../game/state';
import { MAPS } from '../data/world';
import { CLASSES } from '../data/classes';
import { itemCardHTML } from './itemcard';
import { audio } from '../audio/synth';
import type { ItemInstance } from '../game/types';

function className(classId: string): string {
  return CLASSES.find((c) => c.id === classId)?.charName ?? classId;
}
function mapName(mapId: string): string {
  if (mapId.startsWith('__') || mapId === '') return 'in the menus';
  return MAPS[mapId]?.name ?? mapId;
}
function esc(s: string): string {
  return s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]!));
}

// ---------------------------------------------------------------- HUD strip
export function updatePartyHud(): void {
  let root = document.getElementById('party-hud');
  if (!root) {
    root = document.createElement('div');
    root.id = 'party-hud';
    document.getElementById('ui-root')?.appendChild(root);
  }
  if (!coop.active || coop.members.size === 0) { root.innerHTML = ''; return; }
  root.innerHTML = [...coop.members.values()].map((m) => {
    const tint = CLASS_TINT_CSS[m.classId] ?? '#d8a03c';
    const hp = Math.round(Math.max(0, Math.min(1, m.hpF)) * 100);
    const sh = Math.round(Math.max(0, Math.min(1, m.shF)) * 100);
    return `
      <div class="ph-row" style="border-left-color:${tint}">
        <div class="ph-name">${esc(m.name)} <span class="ph-lv">LV ${m.level}</span>${m.downed ? ' <span class="ph-down">DOWN</span>' : ''}</div>
        <div class="ph-map">${m.started ? mapName(m.mapId) : 'in the menus'}</div>
        <div class="ph-bar"><i style="width:${sh}%; background:#54d4ff"></i></div>
        <div class="ph-bar"><i style="width:${hp}%; background:#ff4a4a"></i></div>
      </div>`;
  }).join('');
}

// ---------------------------------------------------------------- panel
export interface PartyPanelCallbacks {
  close: () => void;
  rerender: () => void;
}

export function renderPartyPanel(panel: HTMLElement, cb: PartyPanelCallbacks): void {
  const off = () => { audio.uiClick(); cb.rerender(); };

  if (!coop.active) {
    panel.innerHTML = `
      <h1>PARTY</h1>
      <div class="p-sub">Nobody on the line. Co-op parties are formed from the main menu — CO-OP, then share the code.</div>
      <div class="p-body"><div class="dialogue-box" style="max-width:520px">
        Up to <b>four contractors</b>, no server, campaign only. Story objectives are <b>shared</b>, and on
        shared ground the <b>fight itself is shared</b> — same enemies, same bosses, scaled up for the posse.
        Loot and sound stay <b>yours</b>. Spread across three planets, the ledger still adds up. Trade anywhere,
        duel face to face.
      </div></div>
      <div class="p-hint">P / ESC to close</div>`;
    return;
  }

  const membersHtml = [...coop.members.values()].map((m) => {
    const tint = CLASS_TINT_CSS[m.classId] ?? '#d8a03c';
    const duelWhy = coop.canDuel(m.pid);
    return `
      <div class="mm-slot" style="border-left:3px solid ${tint}">
        <div class="mm-slot-head"><b>${esc(m.name)}</b> — ${className(m.classId)} · LV ${m.level}</div>
        <div class="mm-slot-sub">${m.started ? mapName(m.mapId) : 'in the menus'}${m.downed ? ' · <span style="color:#ff5a5a">DOWN</span>' : ''}</div>
        <div class="mm-slot-acts">
          <button class="mm-slot-btn" data-trade="${m.pid}" ${coop.trade ? 'disabled' : ''}>⇄ TRADE</button>
          <button class="mm-slot-btn" data-duel="${m.pid}" ${duelWhy ? `disabled title="${esc(duelWhy)}"` : ''}>⚔ DUEL</button>
        </div>
      </div>`;
  }).join('') || '<div class="mm-slot-sub">Party is open — waiting for contractors on code <b>' + coop.code + '</b>.</div>';

  panel.innerHTML = `
    <h1>PARTY — CODE ${coop.code}</h1>
    <div class="p-sub">${coop.members.size + 1}/4 contractors · ${coop.isHost ? 'you are hosting (the ledger is yours)' : 'story ledger follows the host'} · shared fights, instanced loot</div>
    <div class="p-body"><div style="flex:1; max-width:640px; display:flex; flex-direction:column; gap:10px;">
      ${duelPromptHtml()}
      ${membersHtml}
      ${tradeHtml()}
      <div style="margin-top:6px"><button class="mm-slot-btn" id="pp-leave">HANG UP — LEAVE PARTY</button></div>
    </div></div>
    <div class="p-hint">P / ESC to close · trades work across planets · duels need shared ground</div>`;

  panel.querySelectorAll<HTMLButtonElement>('[data-trade]').forEach((b) =>
    b.addEventListener('click', () => { coop.tradeInvite(b.dataset.trade!); off(); }));
  panel.querySelectorAll<HTMLButtonElement>('[data-duel]').forEach((b) =>
    b.addEventListener('click', () => { coop.duelChallenge(b.dataset.duel!); off(); }));
  panel.querySelector('#pp-leave')?.addEventListener('click', () => { coop.leave(); off(); });

  // duel prompt buttons
  panel.querySelector('#duel-accept')?.addEventListener('click', () => { coop.duelRespond(true); audio.uiClick(); cb.close(); });
  panel.querySelector('#duel-decline')?.addEventListener('click', () => { coop.duelRespond(false); off(); });

  // trade wiring
  panel.querySelector('#trade-accept')?.addEventListener('click', () => { coop.tradeRespond(true); off(); });
  panel.querySelector('#trade-decline')?.addEventListener('click', () => { coop.tradeRespond(false); off(); });
  panel.querySelector('#trade-cancel')?.addEventListener('click', () => { coop.cancelTrade(); off(); });
  panel.querySelector('#trade-lock')?.addEventListener('click', () => { coop.tradeLock(); off(); });
  panel.querySelector('#trade-clear')?.addEventListener('click', () => { coop.tradeSetOffer(null, moneyVal(panel)); off(); });
  panel.querySelector('#trade-money-set')?.addEventListener('click', () => {
    coop.tradeSetOffer(coop.trade?.mine.item ?? null, moneyVal(panel));
    off();
  });
  panel.querySelectorAll<HTMLButtonElement>('[data-offer]').forEach((b) =>
    b.addEventListener('click', () => {
      const item = state.inventory[Number(b.dataset.offer)] as ItemInstance | undefined;
      coop.tradeSetOffer(item ?? null, coop.trade?.mine.money ?? 0);
      off();
    }));
}

function moneyVal(panel: HTMLElement): number {
  const input = panel.querySelector<HTMLInputElement>('#trade-money');
  return input ? Math.max(0, Math.floor(Number(input.value) || 0)) : 0;
}

function duelPromptHtml(): string {
  const d = coop.duel;
  if (!d) return '';
  if (d.phase === 'invited_in') {
    return `<div class="dialogue-box" style="border-color:#ff5a86">
      <b>${esc(d.withName)}</b> challenges you to a DUEL — first one down loses, nobody dies, both walk away healed.
      <div class="mm-slot-acts" style="margin-top:8px">
        <button class="mm-slot-btn" id="duel-accept">⚔ ACCEPT</button>
        <button class="mm-slot-btn" id="duel-decline">DECLINE</button>
      </div></div>`;
  }
  if (d.phase === 'invited_out') return `<div class="mm-slot-sub">⚔ Glove thrown at <b>${esc(d.withName)}</b> — waiting…</div>`;
  return `<div class="mm-slot-sub" style="color:#ff5a86">⚔ DUEL with <b>${esc(d.withName)}</b> is ${d.phase === 'countdown' ? 'counting down' : 'LIVE'} — close this panel and fight!</div>`;
}

function offerLine(side: { item: ItemInstance | null; money: number; lock: boolean }): string {
  const bits = [
    side.item ? `<b>${esc(side.item.name)}</b>` : '<span style="opacity:0.6">no item</span>',
    side.money > 0 ? `<b>$${side.money.toLocaleString()}</b>` : '<span style="opacity:0.6">$0</span>',
  ];
  return `${bits.join(' + ')} ${side.lock ? '<span style="color:#3ddc4e">■ LOCKED</span>' : '<span style="opacity:0.6">□ open</span>'}`;
}

function tradeHtml(): string {
  const tr = coop.trade;
  if (!tr) return '';
  if (tr.phase === 'invited_out') return `<div class="mm-slot-sub">⇄ Trade offer sent to <b>${esc(tr.withName)}</b> — waiting…</div>`;
  if (tr.phase === 'invited_in') {
    return `<div class="dialogue-box">
      <b>${esc(tr.withName)}</b> wants to trade.
      <div class="mm-slot-acts" style="margin-top:8px">
        <button class="mm-slot-btn" id="trade-accept">⇄ OPEN THE TABLE</button>
        <button class="mm-slot-btn" id="trade-decline">DECLINE</button>
      </div></div>`;
  }
  // open table
  const inv = state.inventory.map((it, i) =>
    `<button class="ft-row" data-offer="${i}" ${tr.mine.item === it ? 'style="border-color:#3ddc4e"' : ''}>${esc(it.name)}</button>`).join('')
    || '<div class="mm-slot-sub">backpack is empty — cash-only trade, then</div>';
  const offered = tr.theirs.item ? `<div style="max-width:340px">${itemCardHTML(tr.theirs.item, null)}</div>` : '';
  return `
    <div class="dialogue-box">
      <b>TRADE TABLE — with ${esc(tr.withName)}</b>
      <div class="trade-cols">
        <div>
          <div class="trade-head">YOUR OFFER — ${offerLine(tr.mine)}</div>
          <div class="trade-inv">${inv}</div>
          <div style="display:flex; gap:6px; margin-top:6px; align-items:center;">
            $ <input id="trade-money" type="number" min="0" step="50" value="${tr.mine.money}" style="width:110px">
            <button class="mm-slot-btn" id="trade-money-set">SET CASH</button>
            <button class="mm-slot-btn" id="trade-clear">CLEAR ITEM</button>
          </div>
        </div>
        <div>
          <div class="trade-head">THEIR OFFER — ${offerLine(tr.theirs)}</div>
          ${offered}
        </div>
      </div>
      <div class="mm-slot-acts" style="margin-top:10px">
        <button class="mm-slot-btn" id="trade-lock" ${tr.mine.lock ? 'disabled' : ''}>${tr.mine.lock ? '■ LOCKED IN' : '□ LOCK IT IN'}</button>
        <button class="mm-slot-btn" id="trade-cancel">WALK AWAY</button>
      </div>
      <div class="mm-slot-sub" style="margin-top:4px">both sides lock → the swap happens. changing anything unlocks both — no switcheroos.</div>
    </div>`;
}
