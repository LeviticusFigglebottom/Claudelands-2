// Remote party members, rendered. Each teammate on YOUR map gets a live
// class-tinted avatar: interpolated movement, a nameplate with a health bar,
// a muzzle flash when they're shooting, and a slump when they're down.
//
// Every avatar also carries a Damageable PROXY — invisible to combat until
// a duel goes live, at which point main.ts feeds it to the hitscan/splash
// target lists. Your guns hit the proxy locally (numbers, shield pops, all
// the feedback), and coop.ts drains the damage each frame and wires it to
// the real player on the other end, whose client is authoritative for
// their own health.

import * as THREE from 'three';
import { toonMat, glowMat } from '../render/toon';
import type { Damageable } from '../game/combat';
import type { MemberState } from './coop';

const CLASS_TINT: Record<string, number> = {
  gunsmith: 0xd8a03c,
  stormcaller: 0x54a8ff,
  houndmaster: 0x6ad86a,
  ravager: 0xff6a5a,
};

interface AvatarTarget extends MemberState { }

class RemoteAvatar {
  readonly pid: string;
  name: string;
  classId: string;
  group = new THREE.Group();
  proxy: Damageable;
  target: AvatarTarget | null = null;
  private head: THREE.Mesh;
  private flash: THREE.Mesh;
  private plate: THREE.Sprite;
  private plateCanvas = document.createElement('canvas');
  private plateKey = '';
  private yaw = 0;
  private flashT = 0;
  private baseline = 150; // expected shield+flesh — drained deltas are duel damage

  constructor(pid: string, name: string, classId: string) {
    this.pid = pid;
    this.name = name;
    this.classId = classId;
    const tint = CLASS_TINT[classId] ?? 0xd8a03c;
    const coat = toonMat({ color: tint });
    const dark = toonMat({ color: 0x2a2622 });
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.7, 0.3), dark);
    legs.position.y = 0.35;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.66, 0.34), coat);
    torso.position.y = 1.06;
    this.head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.32, 0.3), toonMat({ color: 0xc89878 }));
    this.head.position.y = 1.6;
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 0.1), glowMat(tint, 0.9));
    visor.position.set(0, 1.62, 0.13);
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.56, 0.15), coat);
    armL.position.set(-0.38, 1.06, 0);
    const armR = armL.clone();
    armR.position.set(0.34, 1.16, 0.22);
    armR.rotation.x = -1.2;
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.72), dark);
    gun.position.set(0.34, 1.3, 0.55);
    this.flash = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), glowMat(0xffe8b0, 0.95));
    this.flash.position.set(0.34, 1.3, 0.95);
    this.flash.visible = false;
    this.group.add(legs, torso, this.head, visor, armL, armR, gun, this.flash);
    this.group.traverse((o) => (o.castShadow = true));
    this.group.visible = false;

    this.plateCanvas.width = 256;
    this.plateCanvas.height = 64;
    const tex = new THREE.CanvasTexture(this.plateCanvas);
    this.plate = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    this.plate.scale.set(2.6, 0.65, 1);
    this.plate.position.y = 2.35;
    this.plate.layers.set(1); // render layer only — hitscan rays must never see it
    this.group.add(this.plate);

    this.proxy = {
      position: this.group.position,
      alive: true,
      shield: 50, maxShield: 50,
      armor: 0, maxArmor: 0,
      flesh: 100, maxFlesh: 100,
      statuses: [],
      slowUntil: 0,
      onDeath: () => { /* the other player's client decides their own downs */ },
      isPlayer: false,
    };
  }

  setState(st: MemberState): void {
    this.target = st;
    // absolute pools ride along so duel shots chew realistic health bars
    this.proxy.maxShield = st.maxShield;
    this.proxy.maxFlesh = st.maxFlesh;
  }

  /** Duel bookkeeping: how much my guns hurt this avatar since last frame. */
  drainDamage(): number {
    const actual = Math.max(0, this.proxy.shield) + Math.max(0, this.proxy.flesh);
    const dealt = Math.max(0, this.baseline - actual);
    this.syncProxy();
    return dealt;
  }

  syncProxy(): void {
    const st = this.target;
    if (st) {
      this.proxy.shield = st.shield;
      this.proxy.flesh = Math.max(1, st.flesh);
    }
    this.proxy.alive = true;
    this.proxy.statuses.length = 0;
    this.baseline = Math.max(0, this.proxy.shield) + Math.max(0, this.proxy.flesh);
  }

  get headMesh(): THREE.Object3D { return this.head; }

  update(dt: number, localMapId: string, groundHeight: (x: number, z: number) => number): void {
    const st = this.target;
    if (!st || !st.started || st.mapId !== localMapId) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;
    const k = 1 - Math.exp(-11 * dt);
    const gy = groundHeight(st.x, st.z);
    const ty = Math.max(st.y, gy);
    this.group.position.x += (st.x - this.group.position.x) * k;
    this.group.position.y += (ty - this.group.position.y) * k;
    this.group.position.z += (st.z - this.group.position.z) * k;
    let dy = st.yaw - this.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.yaw += dy * k;
    this.group.rotation.y = this.yaw;
    // down but not out: the slump
    this.group.scale.y += ((st.downed ? 0.45 : 1) - this.group.scale.y) * k;
    // shooting: flash flickers while their firing flag is up
    if (st.firing) this.flashT = 0.12;
    this.flashT = Math.max(0, this.flashT - dt);
    this.flash.visible = this.flashT > 0 && Math.random() > 0.35;
    this.renderPlate(st);
  }

  private renderPlate(st: MemberState): void {
    const hp = Math.round(Math.max(0, Math.min(1, st.hpF)) * 20) / 20;
    const sh = Math.round(Math.max(0, Math.min(1, st.shF)) * 20) / 20;
    const key = `${this.name}:${st.level}:${hp}:${sh}:${st.downed}`;
    if (key === this.plateKey) return;
    this.plateKey = key;
    const ctx = this.plateCanvas.getContext('2d')!;
    ctx.clearRect(0, 0, 256, 64);
    ctx.font = 'bold 22px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(10,8,6,0.6)';
    ctx.fillRect(28, 4, 200, 30);
    ctx.fillStyle = st.downed ? '#ff5a5a' : '#ffe8c0';
    ctx.fillText(`${this.name} · LV ${st.level}${st.downed ? ' · DOWN!' : ''}`, 128, 27);
    ctx.fillStyle = 'rgba(10,8,6,0.6)';
    ctx.fillRect(48, 40, 160, 14);
    ctx.fillStyle = '#ff4a4a';
    ctx.fillRect(50, 48, 156 * hp, 4);
    ctx.fillStyle = '#54d4ff';
    ctx.fillRect(50, 42, 156 * sh, 4);
    (this.plate.material.map as THREE.CanvasTexture).needsUpdate = true;
  }
}

class RemotePlayerManager {
  root = new THREE.Group();
  private avatars = new Map<string, RemoteAvatar>();
  groundHeight: (x: number, z: number) => number = () => 0;
  /** Set by coop while a duel is live: that avatar's proxy keeps its damage
   *  deltas for drainDamage instead of being re-synced every frame. */
  duelPid: string | null = null;

  attach(scene: THREE.Scene): void {
    this.root.name = 'remote-players';
    scene.add(this.root);
  }

  ensure(pid: string, name: string, classId: string): RemoteAvatar {
    let a = this.avatars.get(pid);
    if (!a) {
      a = new RemoteAvatar(pid, name, classId);
      this.avatars.set(pid, a);
      this.root.add(a.group);
    }
    return a;
  }

  setState(pid: string, st: MemberState): void {
    this.avatars.get(pid)?.setState(st);
  }

  remove(pid: string): void {
    const a = this.avatars.get(pid);
    if (!a) return;
    this.root.remove(a.group);
    this.avatars.delete(pid);
  }

  clear(): void {
    for (const pid of [...this.avatars.keys()]) this.remove(pid);
  }

  update(dt: number, localMapId: string): void {
    for (const a of this.avatars.values()) {
      a.update(dt, localMapId, this.groundHeight);
      if (a.pid !== this.duelPid) a.syncProxy();
    }
  }

  drainDamage(pid: string): number {
    return this.avatars.get(pid)?.drainDamage() ?? 0;
  }

  /** Duel target for hitscan rays: rig to intersect, proxy to damage, head crits. */
  rayTarget(pid: string): { group: THREE.Group; target: Damageable; critZone: THREE.Object3D } | null {
    const a = this.avatars.get(pid);
    if (!a || !a.group.visible) return null;
    return { group: a.group, target: a.proxy, critZone: a.headMesh };
  }

  proxy(pid: string): Damageable | null {
    return this.avatars.get(pid)?.proxy ?? null;
  }

  /** Same-map teammates, for compass/minimap markers. */
  onMapPositions(localMapId: string): { pid: string; name: string; x: number; z: number; classId: string }[] {
    const out: { pid: string; name: string; x: number; z: number; classId: string }[] = [];
    for (const a of this.avatars.values()) {
      if (a.target?.started && a.target.mapId === localMapId) {
        out.push({ pid: a.pid, name: a.name, x: a.target.x, z: a.target.z, classId: a.classId });
      }
    }
    return out;
  }
}

export const CLASS_TINT_CSS: Record<string, string> = {
  gunsmith: '#d8a03c', stormcaller: '#54a8ff', houndmaster: '#6ad86a', ravager: '#ff6a5a',
};

export const remotePlayers = new RemotePlayerManager();
