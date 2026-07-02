// BL2-style death → New-U sequence. The screen whites out with a "SIGNAL
// LOST" static card, then the camera sits in front of the Re-Constructor
// while a digistruct column assembles a glowing silhouette of you — rising
// rings, particle sparks, scanline flicker — and finally swoops INTO the
// silhouette's eyes as it solidifies into being the player. ~3.2 seconds,
// deliberately not skippable: death should cost a beat.

import * as THREE from 'three';
import { glowMat } from '../render/toon';
import { fx } from '../game/particles';
import { audio } from '../audio/synth';

const FLASH_END = 0.55;
const BUILD_END = 2.5;
const TOTAL = 3.2;

export interface RespawnHooks {
  scene: THREE.Scene;
  /** Where the player is standing (already teleported before start()). */
  eye: { pos: THREE.Vector3; yaw: number; pitch: number };
  onDone: () => void;
}

export class RespawnCinematic {
  active = false;
  private t = 0;
  private hooks: RespawnHooks | null = null;
  private rig: THREE.Group | null = null;
  private rings: THREE.Mesh[] = [];
  private column: THREE.Mesh | null = null;
  private silhouette: THREE.Group | null = null;
  private overlay: HTMLElement | null = null;
  private sparkT = 0;
  private camFrom = new THREE.Vector3();
  private camLook = new THREE.Vector3();

  start(hooks: RespawnHooks): void {
    this.hooks = hooks;
    this.active = true;
    this.t = 0;
    this.sparkT = 0;

    const p = hooks.eye.pos;
    // camera parked a few meters out, at chest height, facing the rebuild
    const back = new THREE.Vector3(Math.sin(hooks.eye.yaw), 0, Math.cos(hooks.eye.yaw)); // behind the player's facing
    this.camFrom.copy(p).addScaledVector(back, -4.6).add(new THREE.Vector3(1.4, 1.5, 0));
    this.camLook.copy(p).add(new THREE.Vector3(0, 1.1, 0));

    // ---- digistruct rig at the player's spot
    const rig = new THREE.Group();
    this.column = new THREE.Mesh(
      new THREE.CylinderGeometry(0.85, 1.1, 3.4, 14, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x54d4ff, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.column.position.set(p.x, p.y + 1.7, p.z);
    rig.add(this.column);

    this.rings = [];
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.85 - i * 0.12, 0.05, 8, 24), glowMat(0x54d4ff, 0.85));
      ring.rotation.x = Math.PI / 2;
      ring.position.set(p.x, p.y + 0.1, p.z);
      rig.add(ring);
      this.rings.push(ring);
    }

    // the you-shaped hologram being printed: torso capsule + head + gun arm
    const holo = new THREE.Group();
    const holoMat = glowMat(0x7de4ff, 0.5);
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.85, 4, 10), holoMat);
    torso.position.y = 0.95;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 10), holoMat);
    head.position.y = 1.72;
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.55, 4, 8), holoMat);
    arm.position.set(0.42, 1.25, -0.18);
    arm.rotation.x = Math.PI / 2.3;
    holo.add(torso, head, arm);
    holo.position.set(p.x, p.y, p.z);
    holo.rotation.y = hooks.eye.yaw;
    holo.scale.set(1, 0.01, 1);
    rig.add(holo);
    this.silhouette = holo;

    hooks.scene.add(rig);
    this.rig = rig;

    // ---- DOM: flash + static card
    if (!this.overlay) {
      this.overlay = document.createElement('div');
      this.overlay.id = 'respawn-overlay';
      this.overlay.style.cssText = 'position:absolute; inset:0; z-index:9; pointer-events:none; display:none;';
      document.getElementById('ui-root')?.appendChild(this.overlay);
    }
    this.overlay.innerHTML = `
      <div id="rsp-flash" style="position:absolute; inset:0; background:#e8f8ff; opacity:1;"></div>
      <div id="rsp-card" style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; flex-direction:column; opacity:1;">
        <div style="font-size:34px; font-weight:800; letter-spacing:6px; color:#54d4ff; text-shadow:0 0 18px #54d4ff;">SIGNAL LOST</div>
        <div style="font-size:13px; color:#f4ead8; opacity:0.8; margin-top:8px; letter-spacing:2px;">RE-CONSTRUCTING FROM LAST KNOWN GRUDGE…</div>
      </div>`;
    this.overlay.style.display = 'block';
    audio.digistruct();
  }

  /** Drives the camera; returns false when finished. */
  update(dt: number, camera: THREE.PerspectiveCamera): boolean {
    if (!this.active || !this.hooks) return false;
    this.t += dt;
    const t = this.t;
    const p = this.hooks.eye.pos;

    // flash + card fade out over the first phase
    const flash = document.getElementById('rsp-flash');
    if (flash) flash.style.opacity = String(Math.max(0, 1 - t / FLASH_END));
    const card = document.getElementById('rsp-card');
    if (card) card.style.opacity = String(Math.max(0, Math.min(1, (BUILD_END - 0.4 - t) / 0.5 + 1)));

    // ---- build phase: rings climb, column pulses, silhouette prints upward
    const build = Math.min(1, Math.max(0, (t - 0.25) / (BUILD_END - 0.25)));
    for (const [i, ring] of this.rings.entries()) {
      const f = Math.min(1, Math.max(0, build * 1.35 - i * 0.18));
      ring.position.y = p.y + 0.1 + f * 2.1;
      (ring.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - f * 0.75);
    }
    if (this.column) {
      const m = this.column.material as THREE.MeshBasicMaterial;
      m.opacity = (0.13 + Math.sin(t * 22) * 0.05) * (t < BUILD_END ? 1 : Math.max(0, 1 - (t - BUILD_END) * 2.4));
      this.column.rotation.y += dt * 1.6;
    }
    if (this.silhouette) {
      this.silhouette.scale.y = build;
      // scanline flicker while printing, solid hold at the end
      const flicker = t < BUILD_END ? 0.32 + Math.sin(t * 40) * 0.18 : Math.max(0, 0.6 - (t - BUILD_END) * 1.4);
      this.silhouette.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.material) (mesh.material as THREE.MeshBasicMaterial).opacity = flicker;
      });
    }
    this.sparkT -= dt;
    if (this.sparkT <= 0 && t < BUILD_END) {
      this.sparkT = 0.22;
      fx.burst(new THREE.Vector3(p.x, p.y + 0.2 + build * 1.8, p.z), 0x54d4ff, 8, 2.5, 0.08, 0.5, 1);
    }

    // ---- camera: hold the machine shot, then swoop into the new eyes
    if (t < BUILD_END) {
      const sway = Math.sin(t * 0.7) * 0.35;
      camera.position.set(this.camFrom.x + sway, this.camFrom.y, this.camFrom.z);
      camera.lookAt(this.camLook);
    } else {
      const f = Math.min(1, (t - BUILD_END) / (TOTAL - BUILD_END));
      const e = f * f * (3 - 2 * f);
      const eye = new THREE.Vector3(p.x, p.y + 1.65, p.z);
      camera.position.lerpVectors(this.camFrom, eye, e);
      // blend the look toward the player's actual facing
      const fwd = new THREE.Vector3(-Math.sin(this.hooks.eye.yaw), 0, -Math.cos(this.hooks.eye.yaw));
      const lookTarget = eye.clone().addScaledVector(fwd, 8);
      const look = this.camLook.clone().lerp(lookTarget, e);
      camera.lookAt(look);
    }

    if (t >= TOTAL) { this.end(); return false; }
    return true;
  }

  private end(): void {
    if (!this.active) return;
    this.active = false;
    if (this.rig && this.hooks) this.hooks.scene.remove(this.rig);
    this.rig = null;
    if (this.overlay) { this.overlay.style.display = 'none'; this.overlay.innerHTML = ''; }
    const h = this.hooks;
    this.hooks = null;
    fx.burst(h!.eye.pos.clone().add(new THREE.Vector3(0, 1, 0)), 0x54d4ff, 30, 6, 0.12, 0.9, 3);
    h!.onDone();
  }
}

export const respawnCine = new RespawnCinematic();
