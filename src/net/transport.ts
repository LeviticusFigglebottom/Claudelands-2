// Co-op wire layer. Two interchangeable transports behind one interface:
//
//  - PeerTransport: real play. WebRTC data channels brokered by the free
//    public PeerJS cloud — no dedicated game server anywhere; once the
//    handshake completes, traffic is browser-to-browser. Star topology:
//    everyone connects to the host, the host relays.
//  - LocalTransport: a BroadcastChannel loopback for same-browser parties
//    (two tabs) and the headless test suite. Identical semantics.
//
// The transport moves opaque JSON and reports peers by ADDRESS (a transport
// detail). Player identity (pid, name, class) lives one layer up in coop.ts.

export interface TransportEvents {
  /** Ready: host is listening / client's pipe to the host is open. */
  onOpen: () => void;
  /** Host only: a new client pipe opened. */
  onPeerConnect: (addr: string) => void;
  onPeerDisconnect: (addr: string) => void;
  onMessage: (addr: string, msg: unknown) => void;
  onError: (err: string) => void;
}

export interface Transport {
  readonly isHost: boolean;
  /** Host → one client. */
  send(addr: string, msg: unknown): void;
  /** Client → host. */
  sendHost(msg: unknown): void;
  close(): void;
}

/** Party codes: five glyphs, no ambiguous characters. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function makePartyCode(): string {
  let code = '';
  for (let i = 0; i < 5; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return code;
}

// ---------------------------------------------------------------------------
// LOCAL: BroadcastChannel party line with addressed envelopes.

interface LocalEnvelope {
  to: string;            // uid | 'host' | uid of a client
  from: string;
  body: unknown;
}

export class LocalTransport implements Transport {
  readonly isHost: boolean;
  private chan: BroadcastChannel;
  private uid = 'u' + Math.random().toString(36).slice(2, 10);
  private ev: TransportEvents;
  private known = new Set<string>();
  private closed = false;

  constructor(code: string, isHost: boolean, ev: TransportEvents) {
    this.isHost = isHost;
    this.ev = ev;
    this.chan = new BroadcastChannel('cl2-coop-' + code.toUpperCase());
    this.chan.onmessage = (e) => this.receive(e.data as LocalEnvelope);
    // both roles are "connected" the instant the channel exists — the coop
    // layer's hello/welcome handshake is the real liveness check
    setTimeout(() => { if (!this.closed) ev.onOpen(); }, 0);
  }

  private receive(env: LocalEnvelope): void {
    if (this.closed || env.from === this.uid) return;
    if (this.isHost) {
      if (env.to !== 'host') return;
      if (!this.known.has(env.from)) {
        this.known.add(env.from);
        this.ev.onPeerConnect(env.from);
      }
      if ((env.body as { __bye?: boolean }).__bye) {
        this.known.delete(env.from);
        this.ev.onPeerDisconnect(env.from);
        return;
      }
      this.ev.onMessage(env.from, env.body);
    } else {
      if (env.to !== this.uid) return;
      this.ev.onMessage('host', env.body);
    }
  }

  send(addr: string, msg: unknown): void {
    if (this.closed) return;
    this.chan.postMessage({ to: addr, from: this.uid, body: msg } satisfies LocalEnvelope);
  }

  sendHost(msg: unknown): void {
    if (this.closed) return;
    this.chan.postMessage({ to: 'host', from: this.uid, body: msg } satisfies LocalEnvelope);
  }

  close(): void {
    if (this.closed) return;
    if (!this.isHost) this.sendHost({ __bye: true });
    this.closed = true;
    this.chan.close();
  }
}

// ---------------------------------------------------------------------------
// PEER: WebRTC data channels via the public PeerJS broker. Loaded lazily so
// the netcode never weighs down a solo boot.

type PeerConn = {
  peer: string;
  open: boolean;
  send: (d: unknown) => void;
  close: () => void;
  on: (ev: string, fn: (arg?: unknown) => void) => void;
};
type PeerLike = {
  on: (ev: string, fn: (arg?: unknown) => void) => void;
  connect: (id: string, opts?: Record<string, unknown>) => PeerConn;
  destroy: () => void;
};

function brokerId(code: string): string {
  return 'claudelands2-party-' + code.toUpperCase();
}

export class PeerTransport implements Transport {
  readonly isHost: boolean;
  private peer: PeerLike | null = null;
  private conns = new Map<string, PeerConn>();   // host: addr → conn
  private hostConn: PeerConn | null = null;      // client: the one pipe
  private ev: TransportEvents;
  private closed = false;

  private constructor(isHost: boolean, ev: TransportEvents) {
    this.isHost = isHost;
    this.ev = ev;
  }

  static async create(code: string, isHost: boolean, ev: TransportEvents): Promise<PeerTransport> {
    const t = new PeerTransport(isHost, ev);
    const { Peer } = await import('peerjs');
    const peer = (isHost ? new Peer(brokerId(code)) : new Peer()) as unknown as PeerLike;
    t.peer = peer;
    peer.on('error', (err) => {
      const e = err as { type?: string; message?: string };
      if (t.closed) return;
      if (e.type === 'unavailable-id') ev.onError('That party code is already hosting. Roll a new one.');
      else if (e.type === 'peer-unavailable') ev.onError('No party found on that code. Check it with the host.');
      else ev.onError(`Signal broker trouble (${e.type ?? 'unknown'}) — try LOCAL PARTY or a fresh code.`);
    });
    if (isHost) {
      peer.on('open', () => { if (!t.closed) ev.onOpen(); });
      peer.on('connection', (c) => {
        const conn = c as PeerConn;
        conn.on('open', () => {
          if (t.closed) { conn.close(); return; }
          t.conns.set(conn.peer, conn);
          ev.onPeerConnect(conn.peer);
        });
        conn.on('data', (d) => { if (!t.closed) ev.onMessage(conn.peer, d); });
        conn.on('close', () => {
          if (t.conns.delete(conn.peer) && !t.closed) ev.onPeerDisconnect(conn.peer);
        });
      });
    } else {
      peer.on('open', () => {
        if (t.closed) return;
        const conn = peer.connect(brokerId(code), { reliable: true });
        t.hostConn = conn;
        conn.on('open', () => { if (!t.closed) ev.onOpen(); });
        conn.on('data', (d) => { if (!t.closed) ev.onMessage('host', d); });
        conn.on('close', () => { if (!t.closed) ev.onPeerDisconnect('host'); });
      });
    }
    return t;
  }

  send(addr: string, msg: unknown): void {
    const c = this.conns.get(addr);
    if (c?.open) c.send(msg);
  }

  sendHost(msg: unknown): void {
    if (this.hostConn?.open) this.hostConn.send(msg);
  }

  close(): void {
    this.closed = true;
    for (const c of this.conns.values()) c.close();
    this.hostConn?.close();
    this.peer?.destroy();
  }
}
