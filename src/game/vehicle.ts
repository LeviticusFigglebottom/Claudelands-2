// Vehicle engine — pass 10. Arcade-but-weighted driving: forward/lateral
// grip separation (so drifts are a grip mode, not an animation), speed-scaled
// steering, a boost meter fed by clean drifting, ballistic airtime off
// crests, and AABB collision response with real bounce. The dune buggy is
// the first chassis; stats live on the instance so later vehicles are data.
//
// Conventions match the player: yaw 0 faces -z, forward = (-sin yaw, 0, -cos yaw).

import * as THREE from 'three';
import { toonMat, glowMat } from '../render/toon';
import { swatch } from '../render/textures';
import { terrainHeight, terrainNormal, WORLD } from '../data/world';
import { fx } from './particles';
import { audio } from '../audio/synth';
import { juice } from './juice';
import { enemySpawner } from './enemies';
import { applyDamage } from './combat';
import { clamp, damp, lerp } from '../util/maff';

const GRAV = 26;

export interface VehicleInput {
  throttle: number;   // -1..1
  steer: number;      // -1..1 (positive = left)
  drift: boolean;
  boost: boolean;
}

export interface VehicleStats {
  accel: number;
  maxSpeed: number;
  reverseMax: number;
  boostSpeed: number;
  boostAccel: number;
  turnRate: number;       // rad/s at reference speed
  grip: number;           // lateral velocity damping (1/s)
  driftGrip: number;      // ...while drifting
  drag: number;           // forward rolling drag (1/s)
  radius: number;         // collision radius
}

export const BUGGY_STATS: VehicleStats = {
  accel: 22,
  maxSpeed: 34,
  reverseMax: -9,
  boostSpeed: 47,
  boostAccel: 34,
  turnRate: 2.3,
  grip: 7.5,
  driftGrip: 1.7,
  drag: 0.65,   // engine braking, off-throttle only
  radius: 1.7,
};

export type BuggyScheme = 'player' | 'rival';

/** Procedural dune buggy: tube frame, roll cage, fat rear tires, engine
 *  block with twin exhausts that flame under boost. */
export function buildBuggy(scheme: BuggyScheme): { group: THREE.Group; body: THREE.Group; wheels: THREE.Object3D[]; frontPivots: THREE.Object3D[]; exhausts: THREE.Vector3[] } {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const paint = scheme === 'player' ? 0xd88428 : 0xb43a4a;
  const paintHex = scheme === 'player' ? '#c1731f' : '#9e3040';
  const frameMat = toonMat({ color: 0x4a4a52, map: swatch('#3f3f47', 60) });
  const paintMat = toonMat({ color: paint, map: swatch(paintHex, 70) });
  const tireMat = toonMat({ color: 0x22221f, map: swatch('#1d1d1a', 40) });
  const hubMat = toonMat({ color: 0x8a8a92 });

  // tub + nose (built facing -z)
  const tub = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 2.6), paintMat);
  tub.position.set(0, 0.62, 0.1);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.34, 1.0), paintMat);
  nose.position.set(0, 0.56, -1.55);
  nose.rotation.x = 0.12;
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.5), toonMat({ color: 0x3a2e26 }));
  seat.position.set(0, 1.05, 0.45);
  const seatBack = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.55, 0.16), toonMat({ color: 0x3a2e26 }));
  seatBack.position.set(0, 1.28, 0.72);
  const wheelBar = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.045, 6, 12), frameMat);
  wheelBar.position.set(0, 1.12, -0.28);
  wheelBar.rotation.x = -0.9;
  body.add(tub, nose, seat, seatBack, wheelBar);

  // roll cage: two hoops + cross rails
  const hoopGeo = new THREE.TorusGeometry(0.85, 0.055, 6, 12, Math.PI);
  for (const [z, s] of [[0.25, 1], [-0.55, 0.85]] as const) {
    const hoop = new THREE.Mesh(hoopGeo, frameMat);
    hoop.position.set(0, 0.85, z);
    hoop.scale.setScalar(s);
    body.add(hoop);
  }
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.05, 6), frameMat);
    rail.position.set(side * 0.78, 1.62, -0.14);
    rail.rotation.x = Math.PI / 2 - 0.18;
    rail.scale.y = 0.85;
    body.add(rail);
  }

  // engine block + twin exhausts
  const engine = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.7, 0.7), frameMat);
  engine.position.set(0, 0.88, 1.25);
  body.add(engine);
  const exhausts: THREE.Vector3[] = [];
  for (const side of [-1, 1]) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.7, 8), hubMat);
    pipe.position.set(side * 0.3, 1.1, 1.62);
    pipe.rotation.x = Math.PI / 2 - 0.35;
    body.add(pipe);
    exhausts.push(new THREE.Vector3(side * 0.3, 1.2, 1.95));
  }
  const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 0.42), paintMat);
  spoiler.position.set(0, 1.55, 1.45);
  spoiler.rotation.x = -0.16;
  const spoilerLegL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.36, 0.08), frameMat);
  spoilerLegL.position.set(-0.55, 1.35, 1.45);
  const spoilerLegR = spoilerLegL.clone();
  spoilerLegR.position.x = 0.55;
  body.add(spoiler, spoilerLegL, spoilerLegR);

  // bull bar + headlights
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.3, 8), frameMat);
  bar.position.set(0, 0.68, -2.1);
  bar.rotation.z = Math.PI / 2;
  body.add(bar);
  for (const side of [-1, 1]) {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), glowMat(0xfff2c0, 0.95));
    lamp.position.set(side * 0.4, 0.78, -2.05);
    body.add(lamp);
  }
  // racing number plate
  const plate = new THREE.Mesh(new THREE.CircleGeometry(0.3, 16), toonMat({ color: 0xf0e8d8 }));
  plate.position.set(0, 1.1, -0.95);
  plate.rotation.x = -0.5;
  body.add(plate);

  // wheels: front pair in steer pivots, fat rears
  const wheels: THREE.Object3D[] = [];
  const frontPivots: THREE.Object3D[] = [];
  const mkWheel = (r: number, w: number): THREE.Mesh => {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 12), tireMat);
    wheel.rotation.z = Math.PI / 2;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.45, r * 0.45, w + 0.04, 8), hubMat);
    wheel.add(hub);
    return wheel;
  };
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.92, 0.5, -1.5);
    const wheel = mkWheel(0.5, 0.3);
    pivot.add(wheel);
    g.add(pivot);
    wheels.push(wheel);
    frontPivots.push(pivot);

    const rear = mkWheel(0.62, 0.46);
    rear.position.set(side * 0.98, 0.62, 1.25);
    g.add(rear);
    wheels.push(rear);
  }

  g.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
  return { group: g, body, wheels, frontPivots, exhausts };
}

export class Vehicle {
  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  yaw = 0;
  grounded = true;
  airT = 0;
  boostMeter = 1;
  boosting = false;
  drifting = false;
  stats: VehicleStats;

  group: THREE.Group;
  private bodyGroup: THREE.Group;
  private wheels: THREE.Object3D[];
  private frontPivots: THREE.Object3D[];
  private exhausts: THREE.Vector3[];
  private wheelSpin = 0;
  private visSteer = 0;
  private visPitch = 0;
  private visRoll = 0;
  private driftYawVis = 0;
  private skidT = 0;
  private lastImpactT = 0;
  private prevPos = new THREE.Vector3();

  constructor(scheme: BuggyScheme, stats: VehicleStats = BUGGY_STATS) {
    this.stats = stats;
    const built = buildBuggy(scheme);
    this.group = built.group;
    this.bodyGroup = built.body;
    this.wheels = built.wheels;
    this.frontPivots = built.frontPivots;
    this.exhausts = built.exhausts;
  }

  get forward(): THREE.Vector3 {
    return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }
  get right(): THREE.Vector3 {
    const f = this.forward;
    return new THREE.Vector3(-f.z, 0, f.x);
  }
  /** Signed speed along the nose. */
  get forwardSpeed(): number {
    return this.vel.dot(this.forward);
  }

  place(x: number, z: number, yaw: number): void {
    this.pos.set(x, terrainHeight(x, z), z);
    this.yaw = yaw;
    this.vel.set(0, 0, 0);
    this.group.position.copy(this.pos);
    this.group.rotation.set(0, yaw, 0);
  }

  update(dt: number, input: VehicleInput, world: { resolveCollision: (p: THREE.Vector3, r: number) => void; arenaHalf: number }, isPlayer: boolean): void {
    const S = this.stats;
    const planarSpeed = Math.hypot(this.vel.x, this.vel.z);

    // ---- drift & boost bookkeeping
    this.drifting = this.grounded && input.drift && planarSpeed > 9;
    this.boosting = input.boost && this.boostMeter > 0.02;
    if (this.boosting) this.boostMeter = clamp(this.boostMeter - dt / 2.6, 0, 1);

    if (this.grounded) {
      // ---- steering FIRST: rotating the nose out from under the velocity
      // is what creates slip. Grip below decides how much of it sticks.
      const steerAuth = clamp(planarSpeed / 7, 0, 1) * (1 - clamp((planarSpeed - 24) / 46, 0, 0.4));
      const rate = S.turnRate * (this.drifting ? 1.65 : 1) * steerAuth;
      const reversing = this.vel.dot(this.forward) < -0.5;
      this.yaw += input.steer * rate * dt * (reversing ? -1 : 1);

      // decompose the WORLD velocity against the NEW heading: the angle the
      // nose just swung through shows up here as lateral slip
      const fwd = this.forward, right = this.right;
      let fSpeed = this.vel.dot(fwd);
      let lat = this.vel.dot(right);

      // ---- throttle: weighted acceleration toward a soft cap
      const cap = this.boosting ? S.boostSpeed : S.maxSpeed;
      if (input.throttle > 0) {
        const head = clamp(1 - fSpeed / cap, 0, 1);
        fSpeed += (this.boosting ? S.boostAccel : S.accel) * head * input.throttle * dt;
      } else if (input.throttle < 0) {
        if (fSpeed > 0.5) fSpeed -= 34 * -input.throttle * dt;              // brake
        else fSpeed += (S.reverseMax - fSpeed) * 2.2 * -input.throttle * dt; // ease into reverse
        fSpeed = Math.max(fSpeed, S.reverseMax);
      }
      // engine braking only when off-throttle — the soft cap above is the
      // real speed limit, drag would otherwise fight it to a crawl
      if (Math.abs(input.throttle) < 0.05) fSpeed -= fSpeed * S.drag * dt;
      const n = terrainNormal(this.pos.x, this.pos.z);
      const slope = fwd.x * n.x + fwd.z * n.z; // >0 when the nose points downhill
      fSpeed += slope * GRAV * 0.55 * dt;

      // ---- grip: lateral slip bleeds off fast (or lingers, mid-drift)
      const grip = this.drifting ? S.driftGrip : S.grip;
      // drifting cleanly feeds the boost meter — sliding IS the boost economy
      if (this.drifting) this.boostMeter = clamp(this.boostMeter + Math.abs(lat) * 0.0075 * dt * 60, 0, 1);
      else if (!this.boosting) this.boostMeter = clamp(this.boostMeter + dt * 0.045, 0, 1);
      lat *= Math.exp(-grip * dt);
      // handbrake without speed = a scrub, not a slide
      if (input.drift && planarSpeed <= 9) fSpeed *= Math.exp(-2.2 * dt);

      this.vel.set(
        fwd.x * fSpeed + right.x * lat,
        this.vel.y,
        fwd.z * fSpeed + right.z * lat,
      );

      // drift dust + skid audio
      if (this.drifting && Math.abs(lat) > 3) {
        this.skidT -= dt;
        if (this.skidT <= 0) {
          this.skidT = 0.14;
          if (isPlayer) audio.skid();
          fx.burst(this.pos.clone().add(new THREE.Vector3(-fwd.x, 0.2, -fwd.z)), 0xc8a878, 4, 3, 0.09, 0.5, 3);
        }
      }
    } else {
      // ---- airborne: tiny air control, hold the drift line
      this.yaw += input.steer * 0.55 * dt;
      this.airT += dt;
    }

    // ---- boost flames
    if (this.boosting) {
      if (Math.random() < 28 * dt) {
        for (const e of this.exhausts) {
          const p = e.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw).add(this.pos);
          fx.emit(p, this.forward.multiplyScalar(-7).add(new THREE.Vector3(0, 1.2, 0)), Math.random() < 0.5 ? 0xff8c2a : 0x54d4ff, 0.16, 0.3, 0);
        }
      }
    }

    // ---- integrate + ground
    this.vel.y -= GRAV * dt;
    this.prevPos.copy(this.pos);
    this.pos.addScaledVector(this.vel, dt);
    const g = terrainHeight(this.pos.x, this.pos.z);
    if (this.pos.y <= g) {
      if (!this.grounded && this.vel.y < -7) {
        // landing: crunch scaled to fall speed
        if (isPlayer) {
          audio.land(this.vel.y < -14);
          juice.addTrauma(clamp(-this.vel.y * 0.015, 0, 0.35));
        }
        fx.burst(this.pos.clone().add(new THREE.Vector3(0, 0.3, 0)), 0xc8a878, 12, 5, 0.12, 0.6, 3);
        this.visPitch += clamp(-this.vel.y * 0.012, 0, 0.2);
      }
      this.pos.y = g;
      if (this.vel.y < 0) this.vel.y = 0;
      this.grounded = true;
      this.airT = 0;
    } else {
      this.grounded = this.pos.y - g < 0.35;
    }

    // ---- collide with props: push-out + bounce + clank
    const before = this.pos.clone();
    world.resolveCollision(this.pos, S.radius);
    const push = this.pos.clone().sub(before);
    if (push.lengthSq() > 1e-6) {
      const nrm = push.clone().setY(0).normalize();
      const vn = this.vel.dot(nrm);
      if (vn < 0) {
        const hard = vn < -12;
        this.vel.addScaledVector(nrm, -vn * 1.55); // reflect with 0.55 restitution
        if (performance.now() - this.lastImpactT > 220 && Math.abs(vn) > 4) {
          this.lastImpactT = performance.now();
          if (isPlayer) {
            audio.vehicleImpact(hard);
            juice.addTrauma(clamp(-vn * 0.02, 0.08, 0.4));
          }
          fx.burst(this.pos.clone().add(nrm.clone().multiplyScalar(-S.radius)).add(new THREE.Vector3(0, 0.7, 0)), 0xffd23c, 10, 4, 0.08, 0.4, 6);
        }
      }
    }
    const half = world.arenaHalf - 2;
    this.pos.x = clamp(this.pos.x, -half, half);
    this.pos.z = clamp(this.pos.z, -half, half);

    // ---- ram damage: the bull bar is a weapon
    const speed = this.vel.length();
    if (speed > 9) {
      for (const e of enemySpawner.enemies) {
        if (!e.alive) continue;
        if (e.position.distanceTo(this.pos) < S.radius + 1.1) {
          applyDamage(e, speed * 6, 'blast', { source: isPlayer ? 'player' : 'world' });
          const away = e.position.clone().sub(this.pos).setY(0).normalize();
          e.position.addScaledVector(away, 1.6);
          fx.burst(e.position.clone().add(new THREE.Vector3(0, 1, 0)), 0xff8c2a, 12, 5, 0.1, 0.5, 4);
          if (isPlayer) { audio.vehicleImpact(false); juice.addTrauma(0.12); }
          this.vel.multiplyScalar(0.8);
        }
      }
    }

    this.updateVisuals(dt, input, this.forwardSpeed);
  }

  private updateVisuals(dt: number, input: VehicleInput, fSpeed: number): void {
    // wheel spin + front steer
    this.wheelSpin += fSpeed * dt / 0.55;
    for (const w of this.wheels) w.rotation.x = this.wheelSpin;
    this.visSteer = damp(this.visSteer, input.steer * 0.42, 10, dt);
    for (const p of this.frontPivots) p.rotation.y = this.visSteer;

    // body lean: pitch under throttle, roll into corners, drift kick
    const targetPitch = clamp(-input.throttle * 0.05 + (this.grounded ? 0 : 0.1), -0.12, 0.14);
    const targetRoll = clamp(-input.steer * Math.abs(fSpeed) * 0.004, -0.16, 0.16);
    this.visPitch = damp(this.visPitch, targetPitch, 5, dt);
    this.visRoll = damp(this.visRoll, targetRoll, 5, dt);
    this.driftYawVis = damp(this.driftYawVis, this.drifting ? input.steer * 0.35 : 0, 4.5, dt);

    // terrain alignment (grounded) or held attitude (air)
    let alignPitch = 0, alignRoll = 0;
    if (this.grounded) {
      const n = terrainNormal(this.pos.x, this.pos.z);
      const f = this.forward, r = this.right;
      alignPitch = (f.x * n.x + f.z * n.z) * 1.1;
      alignRoll = -(r.x * n.x + r.z * n.z) * 1.1;
    } else {
      alignPitch = clamp(-this.vel.y * 0.02, -0.28, 0.35); // nose follows the arc
    }

    this.group.position.copy(this.pos);
    this.group.rotation.set(0, this.yaw + this.driftYawVis, 0);
    this.bodyGroup.rotation.set(this.visPitch + alignPitch, 0, this.visRoll + alignRoll);
  }
}

// ---------------------------------------------------------------------------
// VehicleSystem: owns the player's buggy per-map, entry/exit, driving input,
// the chase camera, and the speed/boost HUD strip.

class VehicleSystem {
  buggy: Vehicle | null = null;
  driving = false;
  /** Set while a race owns the buggy — blocks exit-by-key. */
  raceLock = false;
  private keys = new Set<string>();
  private scene: THREE.Scene | null = null;
  private camPos = new THREE.Vector3();
  private hud: HTMLElement | null = null;
  private baseFov = 75;
  private visFov = 75;

  bind(): void {
    document.addEventListener('keydown', (e) => this.keys.add(e.code));
    document.addEventListener('keyup', (e) => this.keys.delete(e.code));
  }

  /** Rebuild the map's buggy on switch: the Junkstallion lives in the gulch. */
  onMapChanged(scene: THREE.Scene): void {
    this.scene = scene;
    if (this.buggy) { scene.remove(this.buggy.group); this.buggy = null; }
    this.driving = false;
    this.setHudVisible(false);
    audio.engineStop();
    const pad = WORLD.pois.find((p) => p.kind === 'buggy');
    if (pad) {
      this.buggy = new Vehicle('player');
      this.buggy.place(pad.x, pad.z, pad.rot ?? 0);
      scene.add(this.buggy.group);
    }
  }

  nearBuggy(playerPos: THREE.Vector3): boolean {
    return !!this.buggy && !this.driving && this.buggy.pos.distanceTo(playerPos) < 4.2;
  }

  enter(camera: THREE.PerspectiveCamera): void {
    if (!this.buggy || this.driving) return;
    this.driving = true;
    this.baseFov = camera.fov;
    this.visFov = camera.fov;
    this.camPos.copy(camera.position);
    this.setHudVisible(true);
    audio.engineStart();
    audio.uiClick();
  }

  /** Returns where the player should stand after climbing out. */
  exit(): THREE.Vector3 | null {
    if (!this.buggy || !this.driving) return null;
    this.driving = false;
    this.setHudVisible(false);
    audio.engineStop();
    const side = this.buggy.pos.clone().add(this.buggy.right.multiplyScalar(2.4));
    side.y = terrainHeight(side.x, side.z);
    return side;
  }

  input(): VehicleInput {
    return {
      throttle: (this.keys.has('KeyW') ? 1 : 0) + (this.keys.has('KeyS') ? -1 : 0),
      steer: (this.keys.has('KeyA') ? 1 : 0) + (this.keys.has('KeyD') ? -1 : 0),
      drift: this.keys.has('Space'),
      boost: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'),
    };
  }

  update(dt: number, world: { resolveCollision: (p: THREE.Vector3, r: number) => void; arenaHalf: number }, frozen: boolean): void {
    if (!this.buggy || !this.driving) return;
    const inp = frozen ? { throttle: 0, steer: 0, drift: false, boost: false } : this.input();
    const wasBoosting = this.buggy.boosting;
    this.buggy.update(dt, inp, world, true);
    if (this.buggy.boosting && !wasBoosting) {
      audio.boostIgnite();
      juice.kickFov(4);
    }
    const speed = this.buggy.vel.length();
    audio.engineUpdate(clamp(speed / this.buggy.stats.boostSpeed, 0, 1), clamp(Math.abs(inp.throttle), 0, 1));
    this.updateHud(speed);
  }

  /** Chase cam: damped follow with speed-pull and boost FOV. */
  updateCamera(camera: THREE.PerspectiveCamera, dt: number): void {
    if (!this.buggy) return;
    const v = this.buggy;
    const fwd = v.forward;
    const speed = v.vel.length();
    const dist = 8.2 + speed * 0.075;
    const height = 3.3 + speed * 0.02;
    const desired = v.pos.clone().addScaledVector(fwd, -dist).add(new THREE.Vector3(0, height, 0));
    // never sink the camera into a dune
    desired.y = Math.max(desired.y, terrainHeight(desired.x, desired.z) + 1.2);
    const k = 1 - Math.exp(-6.5 * dt);
    this.camPos.lerp(desired, k);
    camera.position.copy(this.camPos);
    const lookAt = v.pos.clone().addScaledVector(fwd, 7).add(new THREE.Vector3(0, 1.4, 0));
    camera.lookAt(lookAt);
    const targetFov = this.baseFov + speed * 0.32 + (v.boosting ? 7 : 0);
    this.visFov = damp(this.visFov, targetFov, 5, dt);
    camera.fov = this.visFov;
    camera.updateProjectionMatrix();
  }

  private setHudVisible(v: boolean): void {
    if (!this.hud) {
      this.hud = document.createElement('div');
      this.hud.id = 'drive-hud';
      this.hud.style.cssText = 'position:absolute; right:26px; bottom:120px; z-index:5; text-align:right; font-family:inherit; color:#f4ead8; text-shadow:0 2px 0 rgba(0,0,0,0.6); pointer-events:none; display:none;';
      this.hud.innerHTML = `
        <div id="drv-speed" style="font-size:38px; font-weight:800; letter-spacing:1px;">0</div>
        <div style="font-size:11px; opacity:0.75; margin-top:-6px;">SCRAP-KLICKS/H</div>
        <div style="width:150px; height:9px; border:2px solid rgba(244,234,216,0.6); margin-top:6px; margin-left:auto;">
          <div id="drv-boost" style="height:100%; width:100%; background:#54d4ff;"></div>
        </div>
        <div style="font-size:10px; opacity:0.75; margin-top:2px;">BOOST — drift to refill · SHIFT to burn</div>`;
      document.getElementById('ui-root')?.appendChild(this.hud);
    }
    this.hud.style.display = v ? 'block' : 'none';
  }

  private updateHud(speed: number): void {
    if (!this.hud || !this.buggy) return;
    const s = document.getElementById('drv-speed');
    if (s) s.textContent = String(Math.round(speed * 3.1));
    const b = document.getElementById('drv-boost');
    if (b) {
      b.style.width = `${Math.round(this.buggy.boostMeter * 100)}%`;
      b.style.background = this.buggy.boosting ? '#ff8c2a' : '#54d4ff';
    }
  }
}

export const vehicles = new VehicleSystem();
