// Serverless co-op session — up to four contractors, campaign only.
//
// Topology: a star. The host's browser is the party line; clients hold one
// reliable data channel to it and the host relays. There is no dedicated
// server anywhere — WebRTC brokered by the public PeerJS cloud for real
// parties, or a BroadcastChannel loopback for two tabs on one machine.
//
// Simulation philosophy (the Borderlands-with-a-twist ruleset):
//  - Every player runs their own FULL world sim: enemies, loot drops, and
//    sound effects are instanced per player. That's what makes biome
//    independence free — the party can be spread across three planets.
//  - The SHARED ledger is the story: quest accepts, objective progress, and
//    turn-ins replicate to everyone. Counters are host-authoritative so two
//    people shooting the same objective ADD UP instead of racing.
//  - Presence is social: teammates on your map render as live avatars, the
//    party HUD tracks everyone everywhere, and trade/duels work anywhere
//    (trade is an ECHO transfer; duels demand shared ground).
//
// Everything here is transport-agnostic message plumbing + three little
// state machines (membership, trade escrow, duel). Rendering lives in
// remoteplayers.ts; game glue lives in main.ts.

import { questSystem, type SharedQuestRow } from '../game/quests';
import { state } from '../game/state';
import type { ItemInstance } from '../game/types';
import { LocalTransport, PeerTransport, makePartyCode, type Transport } from './transport';
import { remotePlayers } from './remoteplayers';

export const MAX_PARTY = 4;
const STATE_HZ_MS = 100;
const QUEST_SYNC_MS = 400;
const MEMBER_TIMEOUT = 8;

// ------------------------------------------------------------------ types
export interface MemberState {
  mapId: string;
  x: number; y: number; z: number; yaw: number;
  hpF: number; shF: number;
  flesh: number; shield: number; maxFlesh: number; maxShield: number;
  downed: boolean;
  firing: boolean;
  level: number;
  started: boolean;
}

export interface PartyMember extends MemberState {
  pid: string;
  name: string;
  classId: string;
  lastSeen: number;
}

interface OfferSide { item: ItemInstance | null; money: number; lock: boolean }
export interface TradeState {
  withPid: string; withName: string;
  phase: 'invited_out' | 'invited_in' | 'open';
  mine: OfferSide; theirs: OfferSide;
  doneSent: boolean; doneRecv: boolean;
}
export interface DuelState {
  withPid: string; withName: string;
  phase: 'invited_out' | 'invited_in' | 'countdown' | 'live';
  t: number;
}

export interface CoopHooks {
  identity(): { name: string; classId: string };
  localState(): MemberState;
  toast(html: string, color?: string): void;
  banner(text: string): void;
  inCampaign(): boolean;
  /** Duel round landed on ME — route through the real player damage path. */
  applyDuelHit(amount: number, fromPid: string): void;
  onDuelPhase(phase: 'countdown' | 'live' | 'won' | 'lost' | 'off', otherName: string): void;
  onPartyChanged(): void;
  onTradeChanged(): void;
}

// ---------------------------------------------------------------- messages
type Msg =
  | { t: 'hello'; name: string; classId: string }
  | { t: 'welcome'; pid: string; members: { pid: string; name: string; classId: string; st: MemberState }[]; quests: SharedQuestRow[] }
  | { t: 'full' }
  | { t: 'join'; pid: string; name: string; classId: string }
  | { t: 'leave'; pid: string }
  | { t: 'state'; pid: string; st: MemberState }
  | { t: 'qdiff'; rows: SharedQuestRow[] }
  | { t: 'qevent'; kind: 'kill' | 'collect' | 'goto' | 'boss' | 'elite'; qid: string }
  | { t: 'route'; to: string; inner: PairMsg };

type PairMsg =
  | { t: 'trade_invite'; from: string }
  | { t: 'trade_open'; from: string }
  | { t: 'trade_decline'; from: string }
  | { t: 'trade_set'; from: string; item: ItemInstance | null; money: number }
  | { t: 'trade_lock'; from: string; lock: boolean }
  | { t: 'trade_done'; from: string }
  | { t: 'trade_cancel'; from: string }
  | { t: 'duel_challenge'; from: string }
  | { t: 'duel_accept'; from: string }
  | { t: 'duel_decline'; from: string }
  | { t: 'duel_hit'; from: string; amount: number }
  | { t: 'duel_end'; from: string; winner: string };

// ---------------------------------------------------------------- session
class CoopSession {
  active = false;
  isHost = false;
  code = '';
  selfPid = '';
  lastError = '';
  /** Remote members only, keyed by pid. */
  members = new Map<string, PartyMember>();
  trade: TradeState | null = null;
  duel: DuelState | null = null;

  private hooks: CoopHooks | null = null;
  private transport: Transport | null = null;
  private addrToPid = new Map<string, string>();   // host: transport addr → pid
  private pidToAddr = new Map<string, string>();
  private nextPid = 2;
  private stateTimer: ReturnType<typeof setInterval> | null = null;
  private questTimer: ReturnType<typeof setInterval> | null = null;
  private lastQuestRows = new Map<string, string>();
  private pendingSnapshot = new Map<string, SharedQuestRow>();
  private runStarted = false;
  private now = 0;

  init(hooks: CoopHooks): void { this.hooks = hooks; }

  // ------------------------------------------------------------ lifecycle
  async host(local = false): Promise<string> {
    this.teardown();
    this.code = makePartyCode();
    this.isHost = true;
    this.selfPid = 'P1';
    this.lastError = '';
    await this.openTransport(local, true);
    this.active = true;
    this.startTimers();
    this.hooks?.onPartyChanged();
    return this.code;
  }

  async join(code: string, local = false): Promise<void> {
    this.teardown();
    this.code = code.toUpperCase().trim();
    this.isHost = false;
    this.selfPid = '';
    this.lastError = '';
    await this.openTransport(local, false);
    this.active = true;
    this.startTimers();
    this.hooks?.onPartyChanged();
  }

  private async openTransport(local: boolean, isHost: boolean): Promise<void> {
    const ev = {
      onOpen: () => { if (!isHost) this.sendToHost({ t: 'hello', ...this.hooks!.identity() }); },
      onPeerConnect: () => { /* identity arrives with hello */ },
      onPeerDisconnect: (addr: string) => this.onPipeClosed(addr),
      onMessage: (addr: string, msg: unknown) => this.onMessage(addr, msg as Msg),
      onError: (err: string) => {
        this.lastError = err;
        this.hooks?.toast(`<b>PARTY LINE:</b> ${err}`, '#ff5a5a');
        this.hooks?.onPartyChanged();
      },
    };
    this.transport = local
      ? new LocalTransport(this.code, isHost, ev)
      : await PeerTransport.create(this.code, isHost, ev);
  }

  leave(): void {
    if (!this.active) return;
    if (this.duel && (this.duel.phase === 'live' || this.duel.phase === 'countdown')) this.endDuel(this.duel.withPid);
    this.cancelTrade(false);
    this.teardown();
    this.hooks?.toast('You left the party. The wasteland is quiet again.', '#c8b8a8');
    this.hooks?.onPartyChanged();
  }

  private teardown(): void {
    this.transport?.close();
    this.transport = null;
    this.active = false;
    this.members.clear();
    this.addrToPid.clear();
    this.pidToAddr.clear();
    this.trade = null;
    this.duel = null;
    this.nextPid = 2;
    this.runStarted = false;
    this.pendingSnapshot.clear();
    remotePlayers.clear();
    questSystem.onObjectiveEvent = null;
    if (this.stateTimer) { clearInterval(this.stateTimer); this.stateTimer = null; }
    if (this.questTimer) { clearInterval(this.questTimer); this.questTimer = null; }
  }

  private startTimers(): void {
    this.stateTimer = setInterval(() => this.broadcastState(), STATE_HZ_MS);
    this.questTimer = setInterval(() => this.syncQuests(), QUEST_SYNC_MS);
    if (!this.isHost) {
      // clients don't count objectives — they report the deed to the host,
      // whose ledger is the ledger
      questSystem.onObjectiveEvent = (kind, qid) => {
        if (!this.active) return false;
        this.sendToHost({ t: 'qevent', kind, qid });
        return true;
      };
    }
  }

  /** Campaign run began on this client — adopt the party's story silently. */
  onRunStarted(): void {
    this.runStarted = true;
    if (!this.active || this.isHost) { this.resyncQuestBaseline(); return; }
    if (this.pendingSnapshot.size > 0) {
      questSystem.applySnapshot([...this.pendingSnapshot.values()]);
      this.pendingSnapshot.clear();
      this.hooks?.toast('Party story synced — objectives are shared. Kills count for everyone.', '#54d4ff');
    }
    this.resyncQuestBaseline();
  }

  onMapChanged(): void {
    if (this.duel && (this.duel.phase === 'live' || this.duel.phase === 'countdown')) {
      // walking off the map is a forfeit — duels demand shared ground
      this.sendPair(this.duel.withPid, { t: 'duel_end', from: this.selfPid, winner: this.duel.withPid });
      this.finishDuel(this.duel.withPid);
    }
  }

  // ------------------------------------------------------------ messaging
  private sendToHost(msg: Msg): void { this.transport?.sendHost(msg); }

  private sendToAll(msg: Msg, exceptPid?: string): void {
    if (!this.transport) return;
    if (this.isHost) {
      for (const [pid, addr] of this.pidToAddr) {
        if (pid !== exceptPid) this.transport.send(addr, msg);
      }
    } else {
      this.transport.sendHost(msg);
    }
  }

  private sendPair(toPid: string, inner: PairMsg): void {
    if (!this.active) return;
    if (this.isHost) {
      const addr = this.pidToAddr.get(toPid);
      if (addr) this.transport?.send(addr, { t: 'route', to: toPid, inner });
    } else {
      this.sendToHost({ t: 'route', to: toPid, inner });
    }
  }

  private onMessage(addr: string, msg: Msg): void {
    if (!msg || typeof msg !== 'object') return;
    if (this.isHost) this.onHostMessage(addr, msg);
    else this.onClientMessage(msg);
  }

  // The host: greeter, relay, and keeper of the ledger.
  private onHostMessage(addr: string, msg: Msg): void {
    const pid = this.addrToPid.get(addr);
    switch (msg.t) {
      case 'hello': {
        if (this.members.size + 1 >= MAX_PARTY) { this.transport?.send(addr, { t: 'full' }); return; }
        const newPid = 'P' + this.nextPid++;
        this.addrToPid.set(addr, newPid);
        this.pidToAddr.set(newPid, addr);
        const member: PartyMember = {
          pid: newPid, name: msg.name, classId: msg.classId, lastSeen: this.now,
          ...emptyState(),
        };
        this.members.set(newPid, member);
        this.transport?.send(addr, {
          t: 'welcome', pid: newPid,
          members: [
            { pid: this.selfPid, ...this.hooks!.identity(), st: this.hooks!.localState() },
            ...[...this.members.values()].filter((m) => m.pid !== newPid).map((m) => ({ pid: m.pid, name: m.name, classId: m.classId, st: memberState(m) })),
          ],
          quests: questSystem.sharedRows(),
        });
        this.sendToAll({ t: 'join', pid: newPid, name: msg.name, classId: msg.classId }, newPid);
        this.hooks?.toast(`<b>${msg.name}</b> joined the party (${this.members.size + 1}/${MAX_PARTY})`, '#3ddc4e');
        this.hooks?.onPartyChanged();
        return;
      }
      case 'state': {
        if (!pid) return;
        this.applyState(pid, msg.st);
        this.sendToAll({ t: 'state', pid, st: msg.st }, pid);
        return;
      }
      case 'qevent': {
        if (!pid || !this.hooks?.inCampaign()) return;
        questSystem.applyEvent(msg.kind, msg.qid);
        return;
      }
      case 'qdiff': {
        if (!pid) return;
        this.applyQuestRows(msg.rows);
        this.sendToAll({ t: 'qdiff', rows: msg.rows }, pid);
        return;
      }
      case 'route': {
        if (!pid) return;
        if (msg.to === this.selfPid) this.onPairMessage(msg.inner);
        else {
          const fwd = this.pidToAddr.get(msg.to);
          if (fwd) this.transport?.send(fwd, msg);
        }
        return;
      }
      case 'leave': {
        if (pid) this.dropMember(pid, true);
        return;
      }
      default: return;
    }
  }

  private onClientMessage(msg: Msg): void {
    switch (msg.t) {
      case 'welcome': {
        this.selfPid = msg.pid;
        for (const m of msg.members) {
          this.members.set(m.pid, { pid: m.pid, name: m.name, classId: m.classId, lastSeen: this.now, ...m.st });
          remotePlayers.ensure(m.pid, m.name, m.classId);
        }
        // the party's story: adopt now if we're already playing, else hold it
        if (this.runStarted && this.hooks?.inCampaign()) {
          questSystem.applySnapshot(msg.quests);
          this.resyncQuestBaseline();
        } else {
          for (const r of msg.quests) this.pendingSnapshot.set(r.id, r);
        }
        this.hooks?.toast(`Connected — party of <b>${this.members.size + 1}</b>. Code <b>${this.code}</b>.`, '#3ddc4e');
        this.hooks?.onPartyChanged();
        return;
      }
      case 'full': {
        this.lastError = 'That party is full (4/4).';
        this.hooks?.toast('<b>PARTY LINE:</b> that party is full (4/4).', '#ff5a5a');
        this.teardown();
        this.hooks?.onPartyChanged();
        return;
      }
      case 'join': {
        this.members.set(msg.pid, { pid: msg.pid, name: msg.name, classId: msg.classId, lastSeen: this.now, ...emptyState() });
        remotePlayers.ensure(msg.pid, msg.name, msg.classId);
        this.hooks?.toast(`<b>${msg.name}</b> joined the party`, '#3ddc4e');
        this.hooks?.onPartyChanged();
        return;
      }
      case 'leave': { this.dropMember(msg.pid, false); return; }
      case 'state': { this.applyState(msg.pid, msg.st); return; }
      case 'qdiff': { this.applyQuestRows(msg.rows); return; }
      case 'route': { if (msg.to === this.selfPid) this.onPairMessage(msg.inner); return; }
      default: return;
    }
  }

  private onPipeClosed(addr: string): void {
    if (this.isHost) {
      const pid = this.addrToPid.get(addr);
      if (pid) this.dropMember(pid, true);
    } else {
      // the host hung up: the party line is dead
      this.hooks?.toast('<b>PARTY DISBANDED</b> — lost the host. Playing on solo.', '#ff8c5a');
      this.teardown();
      this.hooks?.onPartyChanged();
    }
  }

  private dropMember(pid: string, rebroadcast: boolean): void {
    const m = this.members.get(pid);
    if (!m) return;
    this.members.delete(pid);
    remotePlayers.remove(pid);
    if (this.isHost) {
      const addr = this.pidToAddr.get(pid);
      if (addr) { this.addrToPid.delete(addr); this.pidToAddr.delete(pid); }
      if (rebroadcast) this.sendToAll({ t: 'leave', pid });
    }
    if (this.trade?.withPid === pid) { this.trade = null; this.hooks?.onTradeChanged(); }
    if (this.duel?.withPid === pid) this.finishDuel(this.selfPid, true);
    this.hooks?.toast(`<b>${m.name}</b> left the party`, '#c8b8a8');
    this.hooks?.onPartyChanged();
  }

  // ------------------------------------------------------------ state sync
  private broadcastState(): void {
    if (!this.active || !this.hooks) return;
    const st = this.hooks.localState();
    if (this.isHost) this.sendToAll({ t: 'state', pid: this.selfPid, st });
    else this.sendToHost({ t: 'state', pid: this.selfPid, st });
  }

  private applyState(pid: string, st: MemberState): void {
    const m = this.members.get(pid);
    if (!m) return;
    Object.assign(m, st);
    m.lastSeen = this.now;
    remotePlayers.ensure(pid, m.name, m.classId);
    remotePlayers.setState(pid, st);
  }

  /** Per-frame: duel timers, member liveness, duel damage forwarding. */
  update(dt: number): void {
    if (!this.active) return;
    this.now += dt;
    // duel countdown → live
    if (this.duel?.phase === 'countdown') {
      this.duel.t -= dt;
      if (this.duel.t <= 0) {
        this.duel.phase = 'live';
        remotePlayers.duelPid = this.duel.withPid;
        this.hooks?.onDuelPhase('live', this.duel.withName);
      }
    }
    // damage my guns did to my duel opponent's avatar → send it to them
    if (this.duel?.phase === 'live') {
      const dealt = remotePlayers.drainDamage(this.duel.withPid);
      if (dealt > 0.5) this.sendPair(this.duel.withPid, { t: 'duel_hit', from: this.selfPid, amount: dealt });
    }
    // liveness: a vanished tab shouldn't haunt the roster forever
    if (this.isHost) {
      for (const m of [...this.members.values()]) {
        if (this.now - m.lastSeen > MEMBER_TIMEOUT) this.dropMember(m.pid, true);
      }
    }
  }

  // ------------------------------------------------------------ quest sync
  private resyncQuestBaseline(): void {
    this.lastQuestRows.clear();
    for (const r of questSystem.sharedRows()) this.lastQuestRows.set(r.id, `${r.s}:${r.p}`);
  }

  private syncQuests(): void {
    if (!this.active || !this.runStarted || !this.hooks?.inCampaign() || questSystem.applyingShared) return;
    const changed: SharedQuestRow[] = [];
    for (const r of questSystem.sharedRows()) {
      const key = `${r.s}:${r.p}`;
      if (this.lastQuestRows.get(r.id) !== key) {
        this.lastQuestRows.set(r.id, key);
        changed.push(r);
      }
    }
    if (changed.length === 0) return;
    if (this.isHost) this.sendToAll({ t: 'qdiff', rows: changed });
    else this.sendToHost({ t: 'qdiff', rows: changed });
  }

  private applyQuestRows(rows: SharedQuestRow[]): void {
    if (!this.runStarted || !this.hooks?.inCampaign()) {
      for (const r of rows) this.pendingSnapshot.set(r.id, r);
      return;
    }
    // a burst of completions is a catch-up (someone loaded a farther save),
    // not live play — adopt it silently instead of showering rewards
    const completions = rows.filter((r) => r.s === 'complete').length;
    if (completions > 3) questSystem.applySnapshot(rows);
    else questSystem.applyShared(rows);
    this.resyncQuestBaseline();
  }

  // ------------------------------------------------------------ trade
  tradeInvite(pid: string): void {
    if (!this.active || this.trade || !this.members.has(pid)) return;
    const m = this.members.get(pid)!;
    this.trade = { withPid: pid, withName: m.name, phase: 'invited_out', mine: freshOffer(), theirs: freshOffer(), doneSent: false, doneRecv: false };
    this.sendPair(pid, { t: 'trade_invite', from: this.selfPid });
    this.hooks?.toast(`Trade offer sent to <b>${m.name}</b>…`, '#ffd23c');
    this.hooks?.onTradeChanged();
  }

  tradeRespond(accept: boolean): void {
    if (this.trade?.phase !== 'invited_in') return;
    if (accept) {
      this.trade.phase = 'open';
      this.sendPair(this.trade.withPid, { t: 'trade_open', from: this.selfPid });
    } else {
      this.sendPair(this.trade.withPid, { t: 'trade_decline', from: this.selfPid });
      this.trade = null;
    }
    this.hooks?.onTradeChanged();
  }

  tradeSetOffer(item: ItemInstance | null, money: number): void {
    const tr = this.trade;
    if (!tr || tr.phase !== 'open') return;
    money = Math.max(0, Math.min(Math.floor(money), state.money));
    tr.mine = { item, money, lock: false };
    tr.theirs.lock = false;  // any change unlocks both sides — no swap scams
    tr.doneSent = tr.doneRecv = false;
    this.sendPair(tr.withPid, { t: 'trade_set', from: this.selfPid, item, money });
    this.hooks?.onTradeChanged();
  }

  tradeLock(): void {
    const tr = this.trade;
    if (!tr || tr.phase !== 'open' || tr.mine.lock) return;
    tr.mine.lock = true;
    this.sendPair(tr.withPid, { t: 'trade_lock', from: this.selfPid, lock: true });
    this.maybeCommitTrade();
    this.hooks?.onTradeChanged();
  }

  cancelTrade(notify = true): void {
    if (!this.trade) return;
    if (notify) this.sendPair(this.trade.withPid, { t: 'trade_cancel', from: this.selfPid });
    this.trade = null;
    this.hooks?.onTradeChanged();
  }

  private maybeCommitTrade(): void {
    const tr = this.trade;
    if (!tr || tr.phase !== 'open' || !tr.mine.lock || !tr.theirs.lock || tr.doneSent) return;
    // my half of the goods must still exist — dropping the offered gun on
    // the floor mid-trade voids the deal for both sides
    if (tr.mine.item && !state.inventory.includes(tr.mine.item)) { this.cancelTrade(); this.hooks?.toast('Trade voided — the offered item is gone.', '#ff5a5a'); return; }
    if (tr.mine.money > state.money) { this.cancelTrade(); this.hooks?.toast('Trade voided — not enough cash to cover the offer.', '#ff5a5a'); return; }
    tr.doneSent = true;
    this.sendPair(tr.withPid, { t: 'trade_done', from: this.selfPid });
    if (tr.doneRecv) this.commitTrade();
  }

  private commitTrade(): void {
    const tr = this.trade!;
    if (tr.mine.item) {
      const idx = state.inventory.indexOf(tr.mine.item);
      if (idx >= 0) state.inventory.splice(idx, 1);
    }
    state.money = state.money - tr.mine.money + tr.theirs.money;
    if (tr.theirs.item) state.inventory.push(tr.theirs.item);
    const got = [tr.theirs.item ? `<b>${tr.theirs.item.name}</b>` : '', tr.theirs.money > 0 ? `<b>$${tr.theirs.money.toLocaleString()}</b>` : ''].filter(Boolean).join(' + ') || 'their gratitude';
    this.hooks?.toast(`TRADE COMPLETE with <b>${tr.withName}</b> — received ${got}.`, '#3ddc4e');
    this.trade = null;
    this.hooks?.onTradeChanged();
  }

  // ------------------------------------------------------------ duel
  /** Duels demand shared ground: same map, both in campaign. */
  canDuel(pid: string): string | null {
    const m = this.members.get(pid);
    if (!m) return 'They left.';
    if (!this.hooks?.inCampaign()) return 'Duels are a campaign pastime.';
    if (this.duel) return 'One duel at a time.';
    const me = this.hooks.localState();
    if (!m.started || m.mapId !== me.mapId) return 'You need to stand on the same ground. Meet up first.';
    return null;
  }

  duelChallenge(pid: string): void {
    const why = this.canDuel(pid);
    if (why) { this.hooks?.toast(`<b>DUEL:</b> ${why}`, '#ff8c5a'); return; }
    const m = this.members.get(pid)!;
    this.duel = { withPid: pid, withName: m.name, phase: 'invited_out', t: 0 };
    this.sendPair(pid, { t: 'duel_challenge', from: this.selfPid });
    this.hooks?.toast(`Glove thrown at <b>${m.name}</b>…`, '#ff8c5a');
    this.hooks?.onPartyChanged();
  }

  duelRespond(accept: boolean): void {
    if (this.duel?.phase !== 'invited_in') return;
    if (accept) {
      this.sendPair(this.duel.withPid, { t: 'duel_accept', from: this.selfPid });
      this.startDuelCountdown();
    } else {
      this.sendPair(this.duel.withPid, { t: 'duel_decline', from: this.selfPid });
      this.duel = null;
      this.hooks?.onPartyChanged();
    }
  }

  private startDuelCountdown(): void {
    if (!this.duel) return;
    this.duel.phase = 'countdown';
    this.duel.t = 3;
    this.hooks?.onDuelPhase('countdown', this.duel.withName);
    this.hooks?.onPartyChanged();
  }

  /** I went down mid-duel: concede the round. */
  duelLost(): void {
    if (this.duel?.phase !== 'live') return;
    this.sendPair(this.duel.withPid, { t: 'duel_end', from: this.selfPid, winner: this.duel.withPid });
    this.finishDuel(this.duel.withPid);
  }

  private endDuel(winnerPid: string): void {
    if (!this.duel) return;
    this.sendPair(this.duel.withPid, { t: 'duel_end', from: this.selfPid, winner: winnerPid });
    this.finishDuel(winnerPid);
  }

  private finishDuel(winnerPid: string, silent = false): void {
    const d = this.duel;
    this.duel = null;
    remotePlayers.duelPid = null;
    if (!d) return;
    remotePlayers.drainDamage(d.withPid);
    if (!silent) this.hooks?.onDuelPhase(winnerPid === this.selfPid ? 'won' : 'lost', d.withName);
    else this.hooks?.onDuelPhase('off', d.withName);
    this.hooks?.onPartyChanged();
  }

  get duelLivePid(): string | null {
    return this.duel && this.duel.phase === 'live' ? this.duel.withPid : null;
  }

  // ------------------------------------------------------------ pair msgs
  private onPairMessage(msg: PairMsg): void {
    const from = this.members.get(msg.from);
    const name = from?.name ?? 'someone';
    switch (msg.t) {
      case 'trade_invite': {
        if (this.trade) { this.sendPair(msg.from, { t: 'trade_decline', from: this.selfPid }); return; }
        this.trade = { withPid: msg.from, withName: name, phase: 'invited_in', mine: freshOffer(), theirs: freshOffer(), doneSent: false, doneRecv: false };
        this.hooks?.toast(`<b>${name}</b> wants to trade — open the PARTY panel (P) to respond.`, '#ffd23c');
        this.hooks?.onTradeChanged();
        return;
      }
      case 'trade_open': {
        if (this.trade?.withPid === msg.from && this.trade.phase === 'invited_out') {
          this.trade.phase = 'open';
          this.hooks?.toast(`<b>${name}</b> accepted the trade — table's open (P).`, '#3ddc4e');
          this.hooks?.onTradeChanged();
        }
        return;
      }
      case 'trade_decline': {
        if (this.trade?.withPid === msg.from) {
          this.trade = null;
          this.hooks?.toast(`<b>${name}</b> declined the trade.`, '#c8b8a8');
          this.hooks?.onTradeChanged();
        }
        return;
      }
      case 'trade_set': {
        const tr = this.trade;
        if (tr?.withPid !== msg.from || tr.phase !== 'open') return;
        tr.theirs = { item: msg.item, money: msg.money, lock: false };
        tr.mine.lock = false;
        tr.doneSent = tr.doneRecv = false;
        this.hooks?.onTradeChanged();
        return;
      }
      case 'trade_lock': {
        const tr = this.trade;
        if (tr?.withPid !== msg.from || tr.phase !== 'open') return;
        tr.theirs.lock = msg.lock;
        this.maybeCommitTrade();
        this.hooks?.onTradeChanged();
        return;
      }
      case 'trade_done': {
        const tr = this.trade;
        if (tr?.withPid !== msg.from || tr.phase !== 'open') return;
        tr.doneRecv = true;
        if (tr.doneSent) this.commitTrade();
        return;
      }
      case 'trade_cancel': {
        if (this.trade?.withPid === msg.from) {
          this.trade = null;
          this.hooks?.toast(`Trade with <b>${name}</b> cancelled.`, '#c8b8a8');
          this.hooks?.onTradeChanged();
        }
        return;
      }
      case 'duel_challenge': {
        if (this.duel) { this.sendPair(msg.from, { t: 'duel_decline', from: this.selfPid }); return; }
        this.duel = { withPid: msg.from, withName: name, phase: 'invited_in', t: 0 };
        this.hooks?.toast(`<b>${name}</b> threw down the glove! Open the PARTY panel (P) to answer.`, '#ff8c5a');
        this.hooks?.onPartyChanged();
        return;
      }
      case 'duel_accept': {
        if (this.duel?.withPid === msg.from && this.duel.phase === 'invited_out') this.startDuelCountdown();
        return;
      }
      case 'duel_decline': {
        if (this.duel?.withPid === msg.from) {
          this.duel = null;
          this.hooks?.toast(`<b>${name}</b> declined the duel. Wise.`, '#c8b8a8');
          this.hooks?.onPartyChanged();
        }
        return;
      }
      case 'duel_hit': {
        if (this.duel?.withPid === msg.from && this.duel.phase === 'live') {
          this.hooks?.applyDuelHit(msg.amount, msg.from);
        }
        return;
      }
      case 'duel_end': {
        if (this.duel?.withPid === msg.from) this.finishDuel(msg.winner);
        return;
      }
    }
  }
}

function emptyState(): MemberState {
  return { mapId: '', x: 0, y: 0, z: 0, yaw: 0, hpF: 1, shF: 1, flesh: 100, shield: 50, maxFlesh: 100, maxShield: 50, downed: false, firing: false, level: 1, started: false };
}
function memberState(m: PartyMember): MemberState {
  const { mapId, x, y, z, yaw, hpF, shF, flesh, shield, maxFlesh, maxShield, downed, firing, level, started } = m;
  return { mapId, x, y, z, yaw, hpF, shF, flesh, shield, maxFlesh, maxShield, downed, firing, level, started };
}
function freshOffer(): OfferSide { return { item: null, money: 0, lock: false }; }

export const coop = new CoopSession();
