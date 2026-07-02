// Physical debris & surface marks: ejected shell casings, dropped magazines,
// pooled bullet-hole/scorch decals, bile puddles, and ambient tumbleweeds.
// Everything here is cosmetic, pooled, and cheap — the "the world remembers
// what just happened" layer.

import * as THREE from 'three';
import { glowMat, toonMat } from '../render/toon';
import { FX_LAYER } from '../render/post';
import { audio } from '../audio/synth';
import { terrainHeight, terrainNormal, WORLD } from '../data/world';

interface Chunk {
  mesh: THREE.Object3D;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  life: number;
  bounced: boolean;
  tink: boolean;       // casing sound on first bounce
}

const DECAL_POOL = 48;

export class DebrisSystem {
  private scene!: THREE.Scene;
  private chunks: Chunk[] = [];
  private casingGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.045, 6);
  private casingMat = toonMat({ color: 0xd8b028 });
  private magMat = toonMat({ color: 0x3a3632 });

  // decals: one shared pool of ground/wall marks
  private decals: THREE.Mesh[] = [];
  private decalIdx = 0;
  private decalMats: { hole: THREE.MeshBasicMaterial; scorch: THREE.MeshBasicMaterial; bile: THREE.MeshBasicMaterial } | null = null;

  // tumbleweeds
  private weeds: { mesh: THREE.Mesh; vel: THREE.Vector3 }[] = [];

  attach(scene: THREE.Scene): void {
    this.scene = scene;
    this.decalMats = {
      hole: this.makeDecalMat('#181410', 0.55),
      scorch: this.makeDecalMat('#241a10', 0.6),
      bile: this.makeDecalMat('#3d6a14', 0.5),
    };
    for (let i = 0; i < DECAL_POOL; i++) {
      const m = new THREE.Mesh(new THREE.CircleGeometry(0.16, 10), this.decalMats.hole);
      m.visible = false;
      m.layers.set(FX_LAYER);
      m.renderOrder = 2;
      scene.add(m);
      this.decals.push(m);
    }
    this.spawnTumbleweeds();
  }

  private makeDecalMat(color: string, alpha: number): THREE.MeshBasicMaterial {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
    g.addColorStop(0, color);
    g.addColorStop(0.7, color + 'cc');
    g.addColorStop(1, color + '00');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    // ragged edge speckle
    ctx.fillStyle = color;
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 22 + Math.random() * 8;
      ctx.beginPath();
      ctx.arc(32 + Math.cos(a) * r, 32 + Math.sin(a) * r, 1.5 + Math.random() * 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    return new THREE.MeshBasicMaterial({
      map: tex, transparent: true, opacity: alpha,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
    });
  }

  // ------------------------------------------------------------ decals
  /** Place a surface mark at hit point, oriented to the surface normal. */
  decal(point: THREE.Vector3, normal: THREE.Vector3, kind: 'hole' | 'scorch' | 'bile' = 'hole', size = 1): void {
    if (!this.decalMats) return;
    const m = this.decals[this.decalIdx];
    this.decalIdx = (this.decalIdx + 1) % DECAL_POOL;
    m.material = this.decalMats[kind];
    m.visible = true;
    m.scale.setScalar(size * (0.8 + Math.random() * 0.5));
    m.position.copy(point).addScaledVector(normal, 0.02);
    m.lookAt(point.clone().add(normal));
    m.rotateZ(Math.random() * Math.PI * 2);
  }

  groundDecal(x: number, z: number, kind: 'scorch' | 'bile', size = 2): void {
    const n = terrainNormal(x, z);
    this.decal(
      new THREE.Vector3(x, terrainHeight(x, z), z),
      new THREE.Vector3(n.x, n.y, n.z),
      kind, size,
    );
  }

  // ------------------------------------------------------------ chunks
  /** Ejected shell casing from a muzzle-ish position. */
  casing(pos: THREE.Vector3, rightDir: THREE.Vector3): void {
    if (this.chunks.length > 40) return;
    const mesh = new THREE.Mesh(this.casingGeo, this.casingMat);
    mesh.position.copy(pos);
    this.scene.add(mesh);
    this.chunks.push({
      mesh,
      vel: rightDir.clone().multiplyScalar(1.6 + Math.random()).add(new THREE.Vector3(0, 2.2 + Math.random(), 0)),
      spin: new THREE.Vector3(Math.random() * 20, Math.random() * 20, Math.random() * 20),
      life: 1.6,
      bounced: false,
      tink: true,
    });
  }

  /** Dropped magazine during reloads. */
  droppedMag(pos: THREE.Vector3): void {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.05), this.magMat);
    mesh.position.copy(pos);
    this.scene.add(mesh);
    this.chunks.push({
      mesh,
      vel: new THREE.Vector3((Math.random() - 0.5) * 0.6, -0.5, (Math.random() - 0.5) * 0.6),
      spin: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6),
      life: 2.5,
      bounced: false,
      tink: false,
    });
  }

  /** Generic physical chunk (gib support for enemies lives in enemies.ts). */
  chunk(mesh: THREE.Object3D, vel: THREE.Vector3, life = 2): void {
    this.scene.add(mesh);
    this.chunks.push({
      mesh, vel,
      spin: new THREE.Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10),
      life, bounced: false, tink: false,
    });
  }

  // ------------------------------------------------------------ tumbleweeds
  private spawnTumbleweeds(): void {
    for (let i = 0; i < 5; i++) {
      const geo = new THREE.IcosahedronGeometry(0.5 + Math.random() * 0.3, 0);
      const mesh = new THREE.Mesh(geo, toonMat({ color: 0x9a8558 }));
      // spiky wireframe-ish look: add a second smaller rotated shell
      const inner = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35, 0), toonMat({ color: 0x8a7548 }));
      inner.rotation.set(1, 2, 3);
      mesh.add(inner);
      mesh.castShadow = true;
      const half = WORLD.size / 2;
      mesh.position.set((Math.random() - 0.5) * half * 1.6, 2, (Math.random() - 0.5) * half * 1.6);
      this.scene.add(mesh);
      this.weeds.push({ mesh, vel: new THREE.Vector3(1.6 + Math.random(), 0, 0.5 + Math.random() * 0.5) });
    }
  }

  update(dt: number, playerPos: THREE.Vector3): void {
    // chunks
    for (let i = this.chunks.length - 1; i >= 0; i--) {
      const c = this.chunks[i];
      c.life -= dt;
      c.vel.y -= 20 * dt;
      c.mesh.position.addScaledVector(c.vel, dt);
      c.mesh.rotation.x += c.spin.x * dt;
      c.mesh.rotation.z += c.spin.z * dt;
      const gy = terrainHeight(c.mesh.position.x, c.mesh.position.z);
      if (c.mesh.position.y < gy + 0.02) {
        c.mesh.position.y = gy + 0.02;
        c.vel.y = Math.abs(c.vel.y) * 0.35;
        c.vel.x *= 0.6; c.vel.z *= 0.6;
        c.spin.multiplyScalar(0.5);
        if (c.tink && !c.bounced && c.mesh.position.distanceTo(playerPos) < 8) audio.casing();
        c.bounced = true;
      }
      if (c.life <= 0) {
        this.scene.remove(c.mesh);
        this.chunks.splice(i, 1);
      }
    }

    // tumbleweeds roll with the wind, bounce off dunes, wrap the map
    const half = WORLD.size / 2 + 20;
    for (const w of this.weeds) {
      w.vel.y -= 14 * dt;
      w.mesh.position.addScaledVector(w.vel, dt);
      const gy = terrainHeight(w.mesh.position.x, w.mesh.position.z) + 0.45;
      if (w.mesh.position.y < gy) {
        w.mesh.position.y = gy;
        w.vel.y = Math.abs(w.vel.y) * (0.4 + Math.random() * 0.35);
        const n = terrainNormal(w.mesh.position.x, w.mesh.position.z);
        w.vel.x += n.x * 2; w.vel.z += n.z * 2;
      }
      // wind keeps them drifting east-ish
      w.vel.x += (1.8 - w.vel.x) * dt * 0.3;
      w.vel.z += (0.6 - w.vel.z) * dt * 0.3;
      w.mesh.rotation.z -= w.vel.x * dt * 1.4;
      w.mesh.rotation.x += w.vel.z * dt * 1.4;
      if (w.mesh.position.x > half) w.mesh.position.x = -half;
      if (Math.abs(w.mesh.position.z) > half) w.mesh.position.z = -half * Math.sign(w.mesh.position.z) * 0.9;
    }
  }
}

export const debris = new DebrisSystem();
