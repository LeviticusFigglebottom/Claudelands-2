// THE PAPERWEIGHT's interplanetary hop — a Going Commando-style travel
// cinematic in three phases: LAUNCH (the ship roars off the pad in the live
// world), SPACE (world hidden; starfield, the origin planet shrinking behind,
// the destination swelling ahead, with camera cuts), and LANDING (map already
// switched; the ship drops onto the destination pad in the new world).
// Skippable after a grace window — skipping jumps straight to arrival.

import * as THREE from 'three';
import { toonMat, glowMat } from '../render/toon';
import { buildScrapship } from '../render/scrapship';
import { fx } from '../game/particles';
import { audio } from '../audio/synth';

const GRACE = 1.2;
const LAUNCH_END = 4.0;
const SPACE_END = 11.0;
const TOTAL = 15.5;

/** How a planet reads from orbit: body color + two glow shells. */
export interface PlanetLook {
  body: number;
  shellA: { color: number; opacity: number };
  shellB?: { color: number; opacity: number };
}

export const PLANET_LOOKS: Record<string, PlanetLook> = {
  // Claude Prime: rust, dust, and a thin gold smog band
  claudeprime: { body: 0xa3703f, shellA: { color: 0xd8a828, opacity: 0.12 } },
  // Veldt Minor: jungle green wrapped in sea-glint and pollen haze
  veldtminor: { body: 0x4a9a58, shellA: { color: 0x54d4ff, opacity: 0.16 }, shellB: { color: 0x9adc4a, opacity: 0.08 } },
};

export interface ShipTravelHooks {
  scene: THREE.Scene;
  /** Which planet is falling away behind, and which is dead ahead. */
  fromPlanet: PlanetLook;
  toPlanet: PlanetLook;
  /** Called once at the space→landing boundary; must switch the map. */
  onSwitch: () => void;
  /** Called when the cinematic finishes (or is skipped). */
  onDone: () => void;
  /** Pad position in the CURRENT world (launch) — landing pad comes after onSwitch. */
  padPos: () => THREE.Vector3;
  setWorldVisible: (v: boolean) => void;
}

export class ShipTravelCinematic {
  active = false;
  private t = 0;
  private hooks: ShipTravelHooks | null = null;
  private ship: THREE.Group | null = null;
  private rig: THREE.Group | null = null;
  private switched = false;
  private root: HTMLElement | null = null;
  private origin = new THREE.Vector3();

  start(hooks: ShipTravelHooks): void {
    this.hooks = hooks;
    this.active = true;
    this.t = 0;
    this.switched = false;
    this.origin.copy(hooks.padPos());

    this.ship = buildScrapship();
    this.ship.position.copy(this.origin);
    hooks.scene.add(this.ship);

    // letterbox + skip hint (same visual language as the cinematics)
    if (!this.root) {
      this.root = document.createElement('div');
      this.root.id = 'ship-root';
      this.root.style.cssText = 'position:absolute; inset:0; pointer-events:none; z-index:8;';
      document.getElementById('ui-root')?.appendChild(this.root);
    }
    this.root.innerHTML = `
      <div class="cine-bar top"></div>
      <div class="cine-bar bottom"></div>
      <div class="cine-skip" style="display:none">press any key to skip</div>`;
    this.root.style.display = 'block';
    document.getElementById('ui-root')?.classList.add('cine-on');
    audio.turretDeploy();
  }

  /** Build the deep-space rig: starfield + two planets + travel lane. */
  private buildSpaceRig(): void {
    const rig = new THREE.Group();
    rig.position.set(0, 4000, 0); // far above any world geometry

    const starGeo = new THREE.BufferGeometry();
    const pts: number[] = [];
    for (let i = 0; i < 900; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(260 + Math.random() * 120);
      pts.push(v.x, v.y, v.z);
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false }));
    rig.add(stars);

    // space carries its own light — the world's sun is hidden with the world
    const key = new THREE.DirectionalLight(0xfff2d0, 1.2);
    key.position.set(60, 40, 80);
    const fill = new THREE.AmbientLight(0x8090a8, 0.5);
    rig.add(key, fill);

    // the world you left, falling behind — and the one ahead, swelling
    const addPlanet = (look: PlanetLook, r: number, pos: THREE.Vector3): void => {
      const body = new THREE.Mesh(new THREE.SphereGeometry(r, 26, 20), toonMat({ color: look.body }));
      body.position.copy(pos);
      rig.add(body);
      const a = new THREE.Mesh(new THREE.SphereGeometry(r * 1.015, 26, 20), glowMat(look.shellA.color, look.shellA.opacity));
      a.position.copy(pos);
      rig.add(a);
      if (look.shellB) {
        const b = new THREE.Mesh(new THREE.SphereGeometry(r * 1.07, 22, 16), glowMat(look.shellB.color, look.shellB.opacity));
        b.position.copy(pos);
        rig.add(b);
      }
    };
    addPlanet(this.hooks!.fromPlanet, 26, new THREE.Vector3(-30, -12, 130));
    addPlanet(this.hooks!.toPlanet, 34, new THREE.Vector3(8, 4, -260));

    this.rig = rig;
    this.hooks!.scene.add(rig);
  }

  private teardownSpaceRig(): void {
    if (this.rig) { this.hooks?.scene.remove(this.rig); this.rig = null; }
  }

  skip(): void {
    if (this.t < GRACE || !this.active) return;
    if (!this.switched) { this.switched = true; this.hooks?.onSwitch(); }
    this.end();
  }

  private end(): void {
    if (!this.active) return;
    this.active = false;
    this.teardownSpaceRig();
    if (this.ship) { this.hooks?.scene.remove(this.ship); this.ship = null; }
    this.hooks?.setWorldVisible(true);
    if (this.root) { this.root.style.display = 'none'; this.root.innerHTML = ''; }
    document.getElementById('ui-root')?.classList.remove('cine-on');
    const h = this.hooks;
    this.hooks = null;
    h?.onDone();
  }

  /** Drives ship + camera; returns false when finished. */
  update(dt: number, camera: THREE.PerspectiveCamera): boolean {
    if (!this.active || !this.hooks || !this.ship) return false;
    this.t += dt;
    const t = this.t;

    if (t >= GRACE && this.root) {
      const hint = this.root.querySelector('.cine-skip') as HTMLElement | null;
      if (hint && hint.style.display === 'none') hint.style.display = 'block';
    }

    if (t < LAUNCH_END) {
      // ---- LAUNCH: rise off the pad, gathering speed, engines shaking
      const k = t / LAUNCH_END;
      const rise = k * k * k * 90;
      this.ship.position.set(this.origin.x, this.origin.y + 0.5 + rise, this.origin.z);
      this.ship.rotation.z = Math.sin(t * 22) * 0.015 * (1 + k * 2);
      this.ship.rotation.x = -k * 0.5;
      if (Math.random() < 0.8) {
        fx.emit(this.ship.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.4, -0.6, 1.6 + Math.random())),
          new THREE.Vector3(0, -8, 2), Math.random() < 0.5 ? 0xff8c2a : 0xffd23c, 0.22, 0.5, 0);
      }
      // camera: low at the pad edge, craning up as she climbs
      const camA = 0.9 + k * 0.4;
      camera.position.set(this.origin.x + Math.sin(camA) * 13, this.origin.y + 1.6 + k * 6, this.origin.z + Math.cos(camA) * 13);
      camera.lookAt(this.ship.position.clone().add(new THREE.Vector3(0, 1, 0)));
      if (t + dt >= LAUNCH_END) {
        // hard cut to space
        this.hooks.setWorldVisible(false);
        this.buildSpaceRig();
        audio.elemental('blast');
      }
    } else if (t < SPACE_END) {
      // ---- SPACE: three cut shots along the lane
      if (!this.rig) {
        // big-dt catch-up: enter space even if the launch boundary was skipped
        this.hooks.setWorldVisible(false);
        this.buildSpaceRig();
      }
      const st = t - LAUNCH_END;               // 0..7
      const rigY = 4000;
      const shipZ = 60 - (st / (SPACE_END - LAUNCH_END)) * 260; // 60 → -200
      this.ship.position.set(Math.sin(st * 0.7) * 2, rigY + Math.sin(st * 1.3) * 1.2, shipZ);
      this.ship.rotation.set(-0.08, 0, Math.sin(st * 0.9) * 0.1);
      if (Math.random() < 0.9) {
        fx.emit(this.ship.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.8, 0, 3.2)),
          new THREE.Vector3(0, 0, 26), 0xff8c2a, 0.3, 0.35, 0);
      }
      if (st < 2.4) {
        // shot 1: side flyby — ship crosses the frame, home world behind
        camera.position.set(26, rigY + 4, shipZ - 6);
        camera.lookAt(this.ship.position.x, this.ship.position.y, this.ship.position.z + 6);
      } else if (st < 4.8) {
        // shot 2: chase cam, destination swelling ahead
        camera.position.set(this.ship.position.x + 2.5, rigY + 3.2, shipZ + 12);
        camera.lookAt(this.ship.position.x, rigY + 1, shipZ - 60);
      } else {
        // shot 3: nose-on, planet filling the frame behind the camera's shoulder
        camera.position.set(this.ship.position.x - 7, rigY - 2.5, shipZ - 16);
        camera.lookAt(this.ship.position.x, this.ship.position.y + 0.6, this.ship.position.z + 4);
      }
      if (t + dt >= SPACE_END && !this.switched) {
        // ---- cut: arrive over the destination pad
        this.switched = true;
        this.teardownSpaceRig();
        this.hooks.setWorldVisible(true);
        this.hooks.onSwitch();
        this.origin.copy(this.hooks.padPos()); // pad in the NEW world
        audio.questAccept();
      }
    } else {
      // ---- LANDING: drop onto the pad, flare, settle
      if (!this.switched) {
        // a huge dt step can jump the boundary — catch up here
        this.switched = true;
        this.teardownSpaceRig();
        this.hooks.setWorldVisible(true);
        this.hooks.onSwitch();
        this.origin.copy(this.hooks.padPos());
      }
      const k = Math.min(1, (t - SPACE_END) / (TOTAL - SPACE_END - 0.6));
      const e = 1 - (1 - k) * (1 - k);
      const h = (1 - e) * 85;
      this.ship.position.set(this.origin.x, this.origin.y + 0.5 + h, this.origin.z);
      this.ship.rotation.set(k < 0.85 ? -0.12 * (1 - k) : 0, 0.4, 0);
      if (h > 0.5 && Math.random() < 0.7) {
        fx.emit(this.ship.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.4, -0.7, 1.8)),
          new THREE.Vector3(0, -10, 0), 0xff8c2a, 0.2, 0.4, 0);
      }
      if (h <= 0.5 && h > 0.1 && Math.random() < 0.5) {
        fx.burst(this.origin.clone().add(new THREE.Vector3(0, 0.6, 0)), 0xd8c8a0, 10, 5, 0.1, 0.5, 2);
      }
      // camera: grounded at the pad's edge watching her come down
      camera.position.set(this.origin.x + 11, this.origin.y + 2.2, this.origin.z + 9);
      camera.lookAt(this.ship.position.clone().add(new THREE.Vector3(0, 1.2, 0)));
    }

    if (this.t >= TOTAL) { this.end(); return false; }
    return true;
  }
}

export const shipTravel = new ShipTravelCinematic();
