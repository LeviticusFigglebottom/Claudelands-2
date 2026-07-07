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
import { terrainHeight, terrainNormal, WORLD, galeAt } from '../data/world';
import { fx } from './particles';
import { audio } from '../audio/synth';
import { juice } from './juice';
import { enemySpawner } from './enemies';
import { applyDamage } from './combat';
import { clamp, damp, lerp } from '../util/maff';

// Base gravity; maps can run lighter (Vitra) — the buggy scales with them
// but keeps a floor so it never turns into a boat.
const GRAV = 26;
const grav = () => GRAV * ((WORLD.gravity ?? 24) / 24);

export interface VehicleInput {
  throttle: number;   // -1..1
  steer: number;      // -1..1 (positive = left)
  /** Held = drift (Mario Kart style: hop, land turning, slide). */
  drift: boolean;
  /** Edge-triggered on the same key: a small jump. */
  hop: boolean;
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
  // must stay in the same league as the drift yaw rate (~3.4 rad/s) or the
  // slip angle grows unbounded and every drift decays into a spin-out
  driftGrip: 4.2,
  drag: 0.65,   // engine braking, off-throttle only
  radius: 1.7,
};

export type BuggyScheme = 'player' | 'rival';

/** Procedural dune buggy: tube frame, roll cage, fat rear tires, engine
 *  block with twin exhausts that flame under boost. */
export function buildBuggy(scheme: BuggyScheme): { group: THREE.Group; body: THREE.Group; wheels: THREE.Object3D[]; frontPivots: THREE.Object3D[]; exhausts: THREE.Vector3[]; flames: THREE.Mesh[]; sparks: THREE.Mesh[] } {
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
  const flames: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.7, 8), hubMat);
    pipe.position.set(side * 0.3, 1.1, 1.62);
    pipe.rotation.x = Math.PI / 2 - 0.35;
    body.add(pipe);
    exhausts.push(new THREE.Vector3(side * 0.3, 1.2, 1.95));
    // afterburner cones — invisible until the boost lights them
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.16, 1.2, 8), glowMat(0xff8c2a, 0.85));
    flame.position.set(side * 0.3, 1.24, 2.1);
    flame.rotation.x = -Math.PI / 2;
    flame.scale.setScalar(0.001);
    const core = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.8, 8), glowMat(0x54d4ff, 0.95));
    core.position.y = -0.1;
    flame.add(core);
    body.add(flame);
    flames.push(flame);
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
  const sparks: THREE.Mesh[] = [];
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

    // drift sparks trailing the rear tires — tier-colored while charging
    const spark = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 6), glowMat(0x54d4ff, 0.95));
    spark.position.set(side * 1.05, 0.22, 1.6);
    spark.visible = false;
    g.add(spark);
    sparks.push(spark);
  }

  g.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
  return { group: g, body, wheels, frontPivots, exhausts, flames, sparks };
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
  private flames: THREE.Mesh[];
  private sparks: THREE.Mesh[];
  private wheelSpin = 0;
  private visSteer = 0;
  private visPitch = 0;
  private visRoll = 0;
  private driftYawVis = 0;
  private skidT = 0;
  private lastImpactT = 0;
  private prevPos = new THREE.Vector3();

  // ---- Mario-Kart drift/boost + hop + launch state ----
  /** Smoothed steering — inputs have mass now. */
  private steerSmooth = 0;
  /** Locked slide direction while drifting (±1). */
  driftDir = 0;
  /** Seconds of charged slide; tiers pay out on release. */
  driftCharge = 0;
  /** Mini-turbo burn remaining (drift payout — doesn't touch the meter). */
  miniTurboT = 0;
  private squashT = 0;
  private lastGroundY: number | null = null;
  private lastGroundVy = 0;
  /** Visual-only: lifts the body to the axle midpoint on slopes/crests. */
  private groundLift = 0;

  constructor(scheme: BuggyScheme, stats: VehicleStats = BUGGY_STATS) {
    this.stats = stats;
    const built = buildBuggy(scheme);
    this.group = built.group;
    this.bodyGroup = built.body;
    this.wheels = built.wheels;
    this.frontPivots = built.frontPivots;
    this.exhausts = built.exhausts;
    this.flames = built.flames;
    this.sparks = built.sparks;
  }

  /** Current drift tier (0–3) for HUD + spark color. MK pacing: tiers come
   *  slower and the slide builds gradually. */
  get driftTier(): number {
    return this.driftCharge > 2.8 ? 3 : this.driftCharge > 1.7 ? 2 : this.driftCharge > 0.8 ? 1 : 0;
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

    // ---- inputs have mass: steering eases in and out instead of snapping
    this.steerSmooth = damp(this.steerSmooth, input.steer, 8.5, dt);

    // ---- hop: same button as the drift, Mario Kart rules
    if (input.hop && this.grounded) {
      this.vel.y = 6.8;
      this.grounded = false;
      this.squashT = 0.22;
      fx.burst(this.pos.clone().add(new THREE.Vector3(0, 0.2, 0)), 0xc8a878, 6, 3, 0.08, 0.4, 2);
    }

    // ---- drift lifecycle: engage while held + turning at speed; charge
    // while sliding; RELEASE pays out a tiered mini-turbo
    const wantDrift = input.drift && planarSpeed > 9 && (this.drifting || Math.abs(this.steerSmooth) > 0.12);
    if (wantDrift && this.grounded && !this.drifting) {
      this.drifting = true;
      this.driftDir = this.steerSmooth >= 0 ? 1 : -1;
      this.driftCharge = 0;
    }
    if (this.drifting && (!input.drift || planarSpeed < 6)) {
      // payout: the slide was slow — the RELEASE is the reward. A hard
      // directional burst along the nose, plus a short turbo to carry it.
      const tier = this.driftTier;
      if (tier > 0) {
        const fwd = this.forward;
        const burst = [0, 6.5, 10, 14][tier];
        const fSpeedNow = this.vel.dot(fwd);
        const target = Math.min(fSpeedNow + burst, S.boostSpeed * 0.96);
        this.vel.x += fwd.x * (target - fSpeedNow);
        this.vel.z += fwd.z * (target - fSpeedNow);
        this.miniTurboT = [0, 0.4, 0.7, 1.05][tier];
        if (isPlayer) { audio.boostIgnite(); juice.kickFov(4 + tier * 2); }
        fx.burst(this.pos.clone().add(new THREE.Vector3(0, 0.5, 0)),
          [0, 0x54d4ff, 0xff8c2a, 0xc06bff][tier], 14 + tier * 8, 6, 0.12, 0.6, 3);
      }
      this.drifting = false;
      this.driftCharge = 0;
      this.driftDir = 0;
    }
    this.miniTurboT = Math.max(0, this.miniTurboT - dt);

    const meterBoost = input.boost && this.boostMeter > 0.02;
    this.boosting = meterBoost || this.miniTurboT > 0;
    if (meterBoost) this.boostMeter = clamp(this.boostMeter - dt / 2.6, 0, 1);

    if (this.grounded) {
      // ---- steering: drift locks the slide direction; stick input tightens
      // or widens the arc (counter-steer to run shallow)
      const steerAuth = clamp(planarSpeed / 7, 0, 1) * (1 - clamp((planarSpeed - 24) / 46, 0, 0.4));
      let steerCmd = this.steerSmooth;
      if (this.drifting) {
        const trim = clamp(this.steerSmooth * this.driftDir, -1, 1); // 1 = into the slide
        // built for SUSTAINED turns: the bare slide runs a gentle arc, holding
        // INTO the slide tightens it hard, counter-steering opens it out to a
        // near-straight power slide — never a 90° snap
        steerCmd = this.driftDir * clamp(0.2 + 0.4 * trim, 0.02, 0.62);
        this.driftCharge += dt * (1.5 + 0.7 * Math.max(0, trim));
      }
      const rate = S.turnRate * steerAuth;
      const reversing = this.vel.dot(this.forward) < -0.5;
      this.yaw += steerCmd * rate * dt * (reversing ? -1 : 1);

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
      } else if (this.miniTurboT > 0) {
        // a mini-turbo shoves even off-throttle
        fSpeed += S.boostAccel * 0.6 * clamp(1 - fSpeed / cap, 0, 1) * dt;
      }
      // engine braking only when off-throttle — the soft cap above is the
      // real speed limit, drag would otherwise fight it to a crawl
      if (Math.abs(input.throttle) < 0.05 && this.miniTurboT <= 0) fSpeed -= fSpeed * S.drag * dt;
      const n = terrainNormal(this.pos.x, this.pos.z);
      const slope = fwd.x * n.x + fwd.z * n.z; // >0 when the nose points downhill
      fSpeed += slope * grav() * 0.55 * dt;

      // ---- grip: lateral slip bleeds off fast (or lingers, mid-drift)
      const grip = this.drifting ? S.driftGrip : S.grip;
      // drifting cleanly still feeds the meter — sliding IS the boost economy
      if (this.drifting) this.boostMeter = clamp(this.boostMeter + Math.abs(lat) * 0.0075 * dt * 60, 0, 1);
      else if (!this.boosting) this.boostMeter = clamp(this.boostMeter + dt * 0.045, 0, 1);
      const latBefore = Math.abs(lat);
      lat *= Math.exp(-grip * dt);
      // drifting is deliberately SLOW: some slip feeds back into the nose so
      // the slide doesn't stall, but a bleed drags it toward ~60% of top
      // speed — control now, the burst on release pays the speed back
      if (this.drifting && fSpeed > 0) {
        fSpeed = Math.min(fSpeed + (latBefore - Math.abs(lat)) * 0.35, Math.max(fSpeed, cap * 0.9));
        // keep the pace in the slide: only trim the very top end, slowly —
        // the arc/steering feel is untouched, you just don't shed speed
        if (fSpeed > S.maxSpeed * 0.82) fSpeed -= (fSpeed - S.maxSpeed * 0.82) * 1.1 * dt;
      }
      // handbrake without speed = a scrub, not a slide
      if (input.drift && planarSpeed <= 6) fSpeed *= Math.exp(-2.2 * dt);

      this.vel.set(
        fwd.x * fSpeed + right.x * lat,
        this.vel.y,
        fwd.z * fSpeed + right.z * lat,
      );

      // drift dust + skid audio
      if (this.drifting && Math.abs(lat) > 2.2) {
        this.skidT -= dt;
        if (this.skidT <= 0) {
          this.skidT = 0.14;
          if (isPlayer) audio.skid();
          fx.burst(this.pos.clone().add(new THREE.Vector3(-fwd.x, 0.2, -fwd.z)), 0xc8a878, 4, 3, 0.09, 0.5, 3);
        }
      }
    } else {
      // ---- airborne: real air control — steer the nose, pitch with W/S
      this.yaw += this.steerSmooth * 0.95 * dt;
      this.airT += dt;
      // feathering the throttle stretches or shortens the arc a touch
      const fwd = this.forward;
      this.vel.x += fwd.x * input.throttle * 2.4 * dt;
      this.vel.z += fwd.z * input.throttle * 2.4 * dt;
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

    // ---- integrate + ground (floatier while rising: big-air jumps hang)
    this.vel.y -= grav() * (this.vel.y > 0 && !this.grounded ? 0.72 : 1) * dt;
    // gale channels shove the chassis too — a tailwind is free speed, a
    // crosswind is a problem you steer against
    const gale = galeAt(this.pos.x, this.pos.z);
    if (gale) {
      this.vel.x += gale.x * 0.55 * dt;
      this.vel.z += gale.z * 0.55 * dt;
    }
    this.prevPos.copy(this.pos);
    this.pos.addScaledVector(this.vel, dt);
    const g = terrainHeight(this.pos.x, this.pos.z);
    const wasGrounded = this.grounded;
    if (this.pos.y <= g) {
      if (!this.grounded && this.vel.y < -7) {
        // landing: crunch + suspension squash scaled to fall speed
        if (isPlayer) {
          audio.land(this.vel.y < -14);
          juice.addTrauma(clamp(-this.vel.y * 0.018, 0, 0.4));
        }
        fx.burst(this.pos.clone().add(new THREE.Vector3(0, 0.3, 0)), 0xc8a878, 12, 5, 0.12, 0.6, 3);
        this.visPitch += clamp(-this.vel.y * 0.012, 0, 0.2);
        this.squashT = Math.max(this.squashT, clamp(-this.vel.y * 0.02, 0.1, 0.35));
      }
      this.pos.y = g;
      if (this.vel.y < 0) this.vel.y = 0;
      this.grounded = true;
      this.airT = 0;
      // peak-hold how fast the ground rose under the wheels: on a smooth
      // bump the slope is ZERO right at the top, so the launch has to
      // inherit the rise from a few frames back, decaying slowly
      if (this.lastGroundY !== null && dt > 0) {
        this.lastGroundVy = Math.max((g - this.lastGroundY) / dt, this.lastGroundVy - 30 * dt);
      }
      this.lastGroundY = g;
    } else if (wasGrounded && this.lastGroundVy > 1.5 && (() => {
      // only a REAL crest launches: the ground ahead must actually fall.
      // Without this check, grid noise mid-slope popped the buggy airborne
      // all the way up a hill — flat body, floating tires.
      const sp = Math.hypot(this.vel.x, this.vel.z);
      if (sp < 1) return false;
      const ax = this.pos.x + (this.vel.x / sp) * 2.2, az = this.pos.z + (this.vel.z / sp) * 2.2;
      return terrainHeight(ax, az) < g - 0.12;
    })()) {
      // crest launch: the frame the ground falls away after a rising slope
      // inherits the slope's vertical momentum — hills throw you instead of
      // dropping you
      this.vel.y = Math.max(this.vel.y, Math.min(this.lastGroundVy * 0.9, 13));
      this.grounded = false;
      this.lastGroundY = null;
      this.lastGroundVy = 0;
    } else {
      // snap tolerance only applies while descending — an ascending buggy
      // (hop, launch) must NOT get glued back down on frame one
      this.grounded = this.vel.y <= 0 && this.pos.y - g < 0.35;
      if (this.grounded) {
        // hover-snap frame: keep the height base fresh but never let the
        // falling backside overwrite the rise peak
        this.lastGroundY = g;
      } else {
        this.lastGroundY = null;
        this.lastGroundVy = 0;
      }
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
    this.visSteer = damp(this.visSteer, this.steerSmooth * 0.42, 10, dt);
    for (const p of this.frontPivots) p.rotation.y = this.visSteer;

    // body lean: pitch under throttle, roll HARD into corners, drift kick
    const targetPitch = clamp(-input.throttle * 0.06 + (this.grounded ? 0 : 0.1), -0.14, 0.16);
    const targetRoll = clamp(-this.steerSmooth * Math.abs(fSpeed) * 0.006, -0.22, 0.22);
    this.visPitch = damp(this.visPitch, targetPitch, 5, dt);
    this.visRoll = damp(this.visRoll, targetRoll, 5, dt);
    this.driftYawVis = damp(this.driftYawVis, this.drifting ? this.driftDir * 0.42 : 0, 4.5, dt);

    // hop/landing squash — suspension you can see
    this.squashT = Math.max(0, this.squashT - dt * 2.2);
    const squash = Math.sin(Math.min(1, this.squashT / 0.35) * Math.PI) * 0.16;
    this.bodyGroup.scale.y = 1 - squash;

    // afterburners: cones flare while boosting, flicker while mini-turboing
    const flameOn = this.boosting;
    for (const f of this.flames) {
      const target = flameOn ? 0.9 + Math.sin(this.wheelSpin * 3) * 0.25 : 0.001;
      f.scale.setScalar(damp(f.scale.x, target, 12, dt));
    }

    // drift sparks: tier-colored, growing with the charge
    const tier = this.driftTier;
    const sparkColor = [0x54d4ff, 0x54d4ff, 0xff8c2a, 0xc06bff][tier];
    for (const s of this.sparks) {
      s.visible = this.drifting && this.driftCharge > 0.2;
      if (s.visible) {
        (s.material as THREE.MeshBasicMaterial).color.setHex(sparkColor);
        s.scale.setScalar(0.7 + tier * 0.35 + Math.random() * 0.3);
      }
    }
    if (this.drifting && tier > 0 && Math.random() < 14 * dt) {
      const back = this.forward.multiplyScalar(-1.8).add(this.pos).add(new THREE.Vector3(0, 0.3, 0));
      fx.burst(back, sparkColor, 3, 2.5, 0.07, 0.35, 2);
    }

    // terrain alignment (grounded) or held attitude (air). Grounded pitch
    // samples the actual axle heights so climbs read as CLIMBING — nose up,
    // tires on the slope — instead of a flat body floating up the grade.
    let alignPitch = 0, alignRoll = 0;
    if (this.grounded) {
      const f = this.forward, r = this.right;
      const hF = terrainHeight(this.pos.x + f.x * 1.15, this.pos.z + f.z * 1.15);
      const hR = terrainHeight(this.pos.x - f.x * 1.15, this.pos.z - f.z * 1.15);
      const hRt = terrainHeight(this.pos.x + r.x * 0.85, this.pos.z + r.z * 0.85);
      const hLt = terrainHeight(this.pos.x - r.x * 0.85, this.pos.z - r.z * 0.85);
      alignPitch = -Math.atan2(hF - hR, 2.3);
      alignRoll = Math.atan2(hRt - hLt, 1.7);
      // seat the body on the axle midpoint so the wheels track the slope
      this.groundLift = (hF + hR) / 2 - terrainHeight(this.pos.x, this.pos.z);
    } else {
      alignPitch = clamp(-this.vel.y * 0.02, -0.28, 0.35); // nose follows the arc
      this.groundLift = 0;
    }

    this.group.position.copy(this.pos);
    this.group.position.y += Math.max(0, this.groundLift);
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

  private prevSpace = false;

  input(): VehicleInput {
    // SPACE is the jump; holding E slides — no hop on engage, the drift
    // just leans in
    const space = this.keys.has('Space');
    const hop = space && !this.prevSpace;
    this.prevSpace = space;
    return {
      throttle: (this.keys.has('KeyW') ? 1 : 0) + (this.keys.has('KeyS') ? -1 : 0),
      steer: (this.keys.has('KeyA') ? 1 : 0) + (this.keys.has('KeyD') ? -1 : 0),
      drift: this.keys.has('KeyE'),
      hop,
      boost: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'),
    };
  }

  update(dt: number, world: { resolveCollision: (p: THREE.Vector3, r: number) => void; arenaHalf: number }, frozen: boolean): void {
    if (!this.buggy || !this.driving) return;
    const inp = frozen ? { throttle: 0, steer: 0, drift: false, hop: false, boost: false } : this.input();
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
        <div style="font-size:10px; opacity:0.75; margin-top:2px;">SPACE jump · hold E to drift, release for the burst · SHIFT burns the tank</div>`;
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
      const v = this.buggy;
      if (v.drifting) {
        // the bar becomes the drift charge, colored by tier
        b.style.width = `${Math.round(Math.min(1, v.driftCharge / 2.8) * 100)}%`;
        b.style.background = ['#8a949e', '#54d4ff', '#ff8c2a', '#c06bff'][v.driftTier];
      } else {
        b.style.width = `${Math.round(v.boostMeter * 100)}%`;
        b.style.background = v.boosting ? '#ff8c2a' : '#54d4ff';
      }
    }
  }
}

export const vehicles = new VehicleSystem();
