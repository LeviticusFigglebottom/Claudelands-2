// The loot fountain: drop tables by enemy tier, world pickups with rarity
// beams + stings, cash/ammo/health drops, and the red weapon chest with its
// open ceremony. Picking up a gun spawns its actual generated mesh on the
// ground — what you see is what you rolled.

import * as THREE from 'three';
import { generateWeapon, rollRarity } from '../gen/weapongen';
import { generateShield, generateGrenadeMod, generateClassMod, generateRelic } from '../gen/geargen';
import { buildGunMesh } from '../gen/gunmesh';
import { rarityById } from '../data/rarity';
import type { ItemInstance } from './types';
import { fx } from './particles';
import { audio } from '../audio/synth';
import { state, bus } from './state';
import { statsys } from './stats';
import { toonMat, glowMat } from '../render/toon';
import { swatch } from '../render/textures';
import { chance, pick } from '../util/rng';
import { CHEST_LINES } from '../data/flavor';

export type PickupKind = 'item' | 'cash' | 'ammo' | 'health';

export interface Pickup {
  kind: PickupKind;
  item?: ItemInstance;
  amount?: number;
  group: THREE.Group;
  beam?: THREE.Group;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  settled: boolean;
  bobT: number;
  magnet: boolean;      // cash/ammo/health fly to the player when close
}

export class LootSystem {
  pickups: Pickup[] = [];
  scene!: THREE.Scene;
  groundHeight: (x: number, z: number) => number = () => 0;

  attach(scene: THREE.Scene): void { this.scene = scene; }

  private luck(): number { return statsys.bonus('lootLuck'); }

  /** Enemy died: roll the table for its tier. */
  dropForTier(tier: number, level: number, pos: THREE.Vector3): void {
    // cash almost always
    if (chance(Math.random as never, 0.85)) this.spawnCash(pos, Math.round((6 + level * 3) * (1 + tier) * statsys.mult('cashBonus')));
    if (chance(Math.random as never, 0.5)) this.spawnAmmo(pos);
    if (chance(Math.random as never, 0.12)) this.spawnHealth(pos);

    const gunChance = [0.28, 0.55, 1.0, 1.0][Math.min(tier, 3)];
    const rolls = tier >= 3 ? 3 : tier >= 2 ? 2 : 1;
    for (let i = 0; i < rolls; i++) {
      if (!chance(Math.random as never, gunChance)) continue;
      const luck = this.luck() + tier * 0.5;
      const roll = Math.random();
      let item: ItemInstance;
      if (roll < 0.62) item = generateWeapon({ level, luck });
      else if (roll < 0.78) item = generateShield(level, undefined, luck);
      else if (roll < 0.9) item = generateGrenadeMod(level, undefined, luck);
      else if (roll < 0.96) item = generateClassMod(level, undefined, luck);
      else item = generateRelic(level, undefined, luck);
      this.spawnItem(item, pos, true);
    }
  }

  spawnItem(item: ItemInstance, pos: THREE.Vector3, toss = false): void {
    const rarity = rarityById(item.rarity);
    const group = new THREE.Group();

    if (item.kind === 'weapon') {
      const gun = buildGunMesh(item);
      gun.scale.setScalar(1.6); // ground guns read bigger
      gun.rotation.z = Math.PI / 2 * 0.9;
      gun.position.y = 0.35;
      group.add(gun);
    } else {
      // gear pickups: small themed totems
      const color = item.kind === 'shield' ? 0x54d4ff : item.kind === 'grenade' ? 0x8fff3d : item.kind === 'classmod' ? 0xc06bff : 0xffd23c;
      const core = new THREE.Mesh(
        item.kind === 'shield' ? new THREE.OctahedronGeometry(0.22) :
        item.kind === 'grenade' ? new THREE.SphereGeometry(0.18, 8, 8) :
        item.kind === 'classmod' ? new THREE.BoxGeometry(0.3, 0.36, 0.06) :
        new THREE.TorusGeometry(0.16, 0.06, 6, 10),
        toonMat({ color: 0xffffff, map: swatch('#8a8478', 40) }),
      );
      core.position.y = 0.4;
      const tint = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 6), glowMat(color, 0.9));
      tint.position.y = 0.62;
      group.add(core, tint);
    }

    const beam = fx.lootBeam(new THREE.Vector3(0, 0, 0), rarity.color, rarity.tier);
    group.add(beam);

    group.position.copy(pos);
    this.scene.add(group);

    const p: Pickup = {
      kind: 'item', item, group, beam,
      pos: pos.clone(),
      vel: toss ? new THREE.Vector3((Math.random() - 0.5) * 4, 5 + Math.random() * 3, (Math.random() - 0.5) * 4) : new THREE.Vector3(),
      settled: !toss, bobT: Math.random() * 6, magnet: false,
    };
    this.pickups.push(p);
    audio.lootSting(rarity.tier);
  }

  spawnCash(pos: THREE.Vector3, amount: number): void {
    this.spawnSimple('cash', pos, amount, 0x7dff2a, new THREE.CylinderGeometry(0.1, 0.1, 0.04, 8));
  }
  spawnAmmo(pos: THREE.Vector3): void {
    this.spawnSimple('ammo', pos, 0, 0xd8b028, new THREE.BoxGeometry(0.22, 0.14, 0.14));
  }
  spawnHealth(pos: THREE.Vector3, amount = 0.25): void {
    this.spawnSimple('health', pos, amount, 0xff5a5a, new THREE.BoxGeometry(0.18, 0.18, 0.18));
  }

  private spawnSimple(kind: PickupKind, pos: THREE.Vector3, amount: number, color: number, geo: THREE.BufferGeometry): void {
    const group = new THREE.Group();
    const m = new THREE.Mesh(geo, toonMat({ color }));
    m.position.y = 0.25;
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), glowMat(color, 0.8));
    glow.position.y = 0.45;
    group.add(m, glow);
    group.position.copy(pos);
    this.scene.add(group);
    this.pickups.push({
      kind, amount, group,
      pos: pos.clone(),
      vel: new THREE.Vector3((Math.random() - 0.5) * 5, 4 + Math.random() * 3, (Math.random() - 0.5) * 5),
      settled: false, bobT: Math.random() * 6, magnet: true,
    });
  }

  /** Find nearest interactable item pickup within reach. */
  nearestItem(playerPos: THREE.Vector3, maxDist = 2.6): Pickup | null {
    let best: Pickup | null = null;
    let bestD = maxDist;
    for (const p of this.pickups) {
      if (p.kind !== 'item') continue;
      const d = p.pos.distanceTo(playerPos);
      if (d < bestD) { best = p; bestD = d; }
    }
    return best;
  }

  take(p: Pickup): void {
    const i = this.pickups.indexOf(p);
    if (i < 0) return;
    this.pickups.splice(i, 1);
    this.scene.remove(p.group);
  }

  update(dt: number, playerPos: THREE.Vector3, onAutoPickup: (p: Pickup) => void): void {
    for (const p of this.pickups) {
      if (!p.settled) {
        p.vel.y -= 18 * dt;
        p.pos.addScaledVector(p.vel, dt);
        const gy = this.groundHeight(p.pos.x, p.pos.z);
        if (p.pos.y <= gy) {
          p.pos.y = gy;
          if (Math.abs(p.vel.y) < 2) p.settled = true;
          else { p.vel.y = Math.abs(p.vel.y) * 0.4; p.vel.x *= 0.6; p.vel.z *= 0.6; }
        }
      } else {
        p.bobT += dt * 2;
      }

      // magnet pull for consumables
      if (p.magnet && p.settled) {
        const d = p.pos.distanceTo(playerPos);
        if (d < 3.2) {
          p.pos.lerp(playerPos, Math.min(1, dt * (4.5 - d)));
          if (d < 0.9) { onAutoPickup(p); continue; }
        }
      }

      p.group.position.copy(p.pos);
      if (p.kind === 'item') {
        p.group.children[0].rotation.y += dt * 1.2;
        p.group.children[0].position.y = 0.35 + Math.sin(p.bobT) * 0.05;
      }
    }
  }
}

export const loot = new LootSystem();

// ---------------------------------------------------------------------------
// Weapon chest — opening one is a small ceremony.

export class LootChest {
  group = new THREE.Group();
  private lid: THREE.Mesh;
  opened = false;
  private opening = 0;
  pos: THREE.Vector3;

  constructor(pos: THREE.Vector3, rotY: number) {
    this.pos = pos.clone();
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.7, 0.9), toonMat({ color: 0xa82a2a, map: swatch('#8a2424', 90) }));
    base.position.y = 0.35;
    const trim = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.12, 0.96), toonMat({ color: 0xd8b028 }));
    trim.position.y = 0.72;
    this.lid = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.35, 0.9), toonMat({ color: 0x8a2424, map: swatch('#7a2020', 90) }));
    this.lid.geometry.translate(0, 0.17, 0.45); // hinge at back edge
    this.lid.position.set(0, 0.72, -0.45);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), glowMat(0xff9500, 1));
    lamp.position.set(0, 0.82, 0.42);
    this.group.add(base, trim, this.lid, lamp);
    this.group.position.copy(pos);
    this.group.rotation.y = rotY;
    this.group.traverse((o) => (o.castShadow = true));
  }

  open(playerLevel: number, bark: (name: string, line: string) => void): void {
    if (this.opened) return;
    this.opened = true;
    audio.chestOpen();
    bark('CHEST', pick(Math.random as never, CHEST_LINES));
    // guaranteed goodies fanning out of the chest
    setTimeout(() => {
      const fan = (i: number, n: number) => {
        const a = this.group.rotation.y + ((i + 0.5) / n - 0.5) * 1.8;
        return this.pos.clone().add(new THREE.Vector3(Math.sin(a) * 1.6, 0.8, Math.cos(a) * 1.6));
      };
      const luck = statsys.bonus('lootLuck') + 1.2; // chests roll hot
      loot.spawnItem(generateWeapon({ level: playerLevel, luck }), fan(0, 3), true);
      loot.spawnItem(generateWeapon({ level: playerLevel, luck }), fan(1, 3), true);
      const r = Math.random();
      if (r < 0.45) loot.spawnItem(generateShield(playerLevel, undefined, luck), fan(2, 3), true);
      else if (r < 0.8) loot.spawnItem(generateGrenadeMod(playerLevel, undefined, luck), fan(2, 3), true);
      else loot.spawnItem(generateRelic(playerLevel, undefined, luck), fan(2, 3), true);
      loot.spawnCash(this.pos.clone().add(new THREE.Vector3(0, 0.8, 0)), 40 + playerLevel * 10);
      fx.burst(this.pos.clone().add(new THREE.Vector3(0, 1, 0)), 0xffd23c, 30, 5, 0.12, 0.8, 6);
    }, 350);
    bus.emit('gritTick', { label: '' }); // nudge: chests count nothing yet, seam for challenges
  }

  update(dt: number): void {
    if (this.opened && this.opening < 1) {
      this.opening = Math.min(1, this.opening + dt * 2.2);
      this.lid.rotation.x = -this.opening * 1.9;
    }
  }
}
