// Pooled particle/FX system: CPU-simmed point sprites plus helper builders
// for tracers, lightning arcs, muzzle flashes, loot beams, explosions, and
// per-element hit effects. Everything spawns through `fx` so effects stay
// consistent and cheap. All FX live on the no-ink layer.

import * as THREE from 'three';
import { FX_LAYER } from '../render/post';
import { glowMat } from '../render/toon';
import { softDotTexture, starTexture, beamTexture } from '../render/textures';
import { ELEMENTS } from '../data/elements';
import type { ElementId } from './types';

const MAX = 3000;

interface TimedMesh { obj: THREE.Object3D; life: number; maxLife: number; kind: 'fade' | 'shrink' | 'flash'; mat: THREE.Material & { opacity: number } }

export class FxSystem {
  private geo = new THREE.BufferGeometry();
  private positions = new Float32Array(MAX * 3);
  private colors = new Float32Array(MAX * 3);
  private sizes = new Float32Array(MAX);
  private vel = new Float32Array(MAX * 3);
  private life = new Float32Array(MAX);
  private maxLife = new Float32Array(MAX);
  private grav = new Float32Array(MAX);
  private baseSize = new Float32Array(MAX);
  private cursor = 0;
  points: THREE.Points;
  private timed: TimedMesh[] = [];
  scene!: THREE.Scene;

  constructor() {
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.geo.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { tMap: { value: softDotTexture() } },
      vertexShader: `
        attribute float size;
        varying vec3 vColor;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (240.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D tMap;
        varying vec3 vColor;
        void main() {
          vec4 t = texture2D(tMap, gl_PointCoord);
          gl_FragColor = vec4(vColor, 1.0) * t;
          if (gl_FragColor.a < 0.02) discard;
        }`,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    this.points.layers.set(FX_LAYER);
  }

  attach(scene: THREE.Scene): void {
    this.scene = scene;
    scene.add(this.points);
  }

  emit(pos: THREE.Vector3, velv: THREE.Vector3, color: number, size: number, lifeSec: number, gravity = 0): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % MAX;
    this.positions.set([pos.x, pos.y, pos.z], i * 3);
    this.vel.set([velv.x, velv.y, velv.z], i * 3);
    const c = new THREE.Color(color);
    this.colors.set([c.r, c.g, c.b], i * 3);
    this.baseSize[i] = size;
    this.sizes[i] = size;
    this.life[i] = lifeSec;
    this.maxLife[i] = lifeSec;
    this.grav[i] = gravity;
  }

  burst(pos: THREE.Vector3, color: number, count: number, speed: number, size = 0.09, lifeSec = 0.6, gravity = 6, up = 0.5): void {
    const v = new THREE.Vector3();
    for (let n = 0; n < count; n++) {
      v.set(Math.random() - 0.5, Math.random() - 0.5 + up, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.8));
      this.emit(pos, v, color, size * (0.6 + Math.random() * 0.8), lifeSec * (0.5 + Math.random() * 0.8), gravity);
    }
  }

  update(dt: number): void {
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.sizes[i] = 0; continue; }
      const i3 = i * 3;
      this.vel[i3 + 1] -= this.grav[i] * dt;
      this.positions[i3] += this.vel[i3] * dt;
      this.positions[i3 + 1] += this.vel[i3 + 1] * dt;
      this.positions[i3 + 2] += this.vel[i3 + 2] * dt;
      this.sizes[i] = this.baseSize[i] * (this.life[i] / this.maxLife[i]);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;

    for (let i = this.timed.length - 1; i >= 0; i--) {
      const t = this.timed[i];
      t.life -= dt;
      const f = Math.max(0, t.life / t.maxLife);
      if (t.kind === 'fade') t.mat.opacity = f;
      else if (t.kind === 'shrink') t.obj.scale.multiplyScalar(Math.max(0.01, 1 - dt * 6));
      else if (t.kind === 'flash') { t.mat.opacity = f; t.obj.scale.setScalar(1 + (1 - f) * 2.2); }
      if (t.life <= 0) {
        this.scene.remove(t.obj);
        this.timed.splice(i, 1);
      }
    }
  }

  private addTimed(obj: THREE.Object3D, mat: THREE.Material & { opacity: number }, lifeSec: number, kind: TimedMesh['kind'] = 'fade'): void {
    obj.traverse((o) => o.layers.set(FX_LAYER));
    this.scene.add(obj);
    this.timed.push({ obj, mat, life: lifeSec, maxLife: lifeSec, kind });
  }

  // ------------------------------------------------------------- builders

  tracer(from: THREE.Vector3, to: THREE.Vector3, color: number): void {
    const dir = to.clone().sub(from);
    const len = dir.length();
    if (len < 0.5) return;
    const geo = new THREE.CylinderGeometry(0.012, 0.012, len, 4, 1, true);
    geo.rotateX(Math.PI / 2);
    const mat = glowMat(color, 0.7);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(from).addScaledVector(dir, 0.5);
    mesh.lookAt(to);
    this.addTimed(mesh, mat, 0.09);
  }

  lightningArc(from: THREE.Vector3, to: THREE.Vector3, color = ELEMENTS.volt.color): void {
    const pts: THREE.Vector3[] = [];
    const segs = 7;
    for (let i = 0; i <= segs; i++) {
      const p = from.clone().lerp(to, i / segs);
      if (i > 0 && i < segs) {
        p.x += (Math.random() - 0.5) * 0.7;
        p.y += (Math.random() - 0.5) * 0.7;
        p.z += (Math.random() - 0.5) * 0.7;
      }
      pts.push(p);
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const line = new THREE.Line(geo, mat);
    this.addTimed(line, mat, 0.18);
    this.burst(to, color, 6, 3, 0.07, 0.3, 2);
  }

  /** SKYFALL: a jagged bolt from the clouds to a ground point, with the
   *  flash and scorch to sell it. Voltholm's storm + the Abbot's judgment. */
  skyBolt(ground: THREE.Vector3, color = 0xf8ffc0): void {
    const sky = ground.clone().add(new THREE.Vector3((Math.random() - 0.5) * 8, 60, (Math.random() - 0.5) * 8));
    this.lightningArc(sky, ground, color);
    const mid = ground.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, 30, (Math.random() - 0.5) * 3));
    this.lightningArc(mid, ground, color);
    const mat = glowMat(color, 0.85);
    const flash = new THREE.Mesh(new THREE.SphereGeometry(1.4, 8, 8), mat);
    flash.position.copy(ground).add(new THREE.Vector3(0, 0.6, 0));
    this.addTimed(flash, mat, 0.14, 'flash');
    this.burst(ground, color, 18, 6, 0.12, 0.5, 6);
    this.burst(ground, 0x3a3230, 8, 3, 0.2, 0.9, 3);
  }

  muzzleFlash(pos: THREE.Vector3, dir: THREE.Vector3, color = 0xffd23c, scale = 1): void {
    const mat = new THREE.SpriteMaterial({ map: starTexture(), color, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, rotation: Math.random() * Math.PI });
    const s = new THREE.Sprite(mat);
    s.position.copy(pos).addScaledVector(dir, 0.12);
    s.scale.setScalar(0.35 * scale);
    this.addTimed(s, mat, 0.06, 'flash');
    this.burst(pos, color, 3, 4, 0.06, 0.15, 0, 0.1);
  }

  impact(pos: THREE.Vector3, element: ElementId, big = false): void {
    const e = ELEMENTS[element];
    const n = big ? 26 : 10;
    this.burst(pos, e.color, n, big ? 7 : 4.5, big ? 0.16 : 0.1, big ? 0.7 : 0.45, 7);
    this.burst(pos, e.colorAlt, Math.floor(n / 2), big ? 5 : 3, 0.08, 0.4, 5);
    if (element === 'volt') {
      for (let i = 0; i < 3; i++) {
        const off = new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 1.5, (Math.random() - 0.5) * 2);
        this.lightningArc(pos, pos.clone().add(off));
      }
    }
    if (element === 'rime') {
      // crystalline shards: slow, sparkly, low gravity
      this.burst(pos, 0xffffff, 8, 1.6, 0.07, 0.9, 1.5);
    }
    if (element === 'bile') {
      // dripping goo: heavy gravity
      this.burst(pos, e.color, 8, 2.5, 0.13, 0.9, 14);
    }
  }

  explosion(pos: THREE.Vector3, radius: number, color = 0xffd23c): void {
    const mat = glowMat(color, 0.85);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.55, 12, 12), mat);
    ball.position.copy(pos);
    this.addTimed(ball, mat, 0.28, 'flash');
    this.burst(pos, color, 30, radius * 2.6, 0.22, 0.8, 8, 0.7);
    this.burst(pos, 0x3a3230, 16, radius * 1.6, 0.3, 1.1, 3, 1); // smoke chunks
    const ringMat = glowMat(0xffffff, 0.6);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.5, 0.06, 6, 24), ringMat);
    ring.position.copy(pos);
    ring.rotation.x = Math.PI / 2;
    this.addTimed(ring, ringMat, 0.3, 'flash');
  }

  /** Signature moment: the vertical rarity beam over dropped loot. */
  lootBeam(pos: THREE.Vector3, color: number, tier: number): THREE.Group {
    const grp = new THREE.Group();
    const h = 5 + tier * 1.5;
    const beamMat = glowMat(color, 0.34 + tier * 0.07, beamTexture());
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.07 + tier * 0.015, 0.13 + tier * 0.025, h, 8, 1, true), beamMat);
    beam.position.y = h / 2;
    grp.add(beam);
    const glowM = glowMat(color, 0.5);
    const base = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), glowM);
    base.position.y = 0.15;
    grp.add(base);
    grp.position.copy(pos);
    grp.traverse((o) => o.layers.set(FX_LAYER));
    return grp;
  }

  /** Ambient smoke/fire column for burning barrels etc. */
  fireColumn(pos: THREE.Vector3): void {
    this.emit(pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0, (Math.random() - 0.5) * 0.3)),
      new THREE.Vector3((Math.random() - 0.5) * 0.3, 1.2 + Math.random(), (Math.random() - 0.5) * 0.3),
      Math.random() > 0.4 ? 0xff6a1a : 0xffc93c, 0.16, 0.9, -1.5);
  }

  statusFlames(pos: THREE.Vector3, element: ElementId): void {
    const e = ELEMENTS[element];
    this.emit(pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.7, Math.random() * 1.4, (Math.random() - 0.5) * 0.7)),
      new THREE.Vector3(0, element === 'bile' ? -1 : 1.4, 0),
      Math.random() > 0.5 ? e.color : e.colorAlt, 0.13, 0.5, element === 'bile' ? 6 : -2);
  }
}

export const fx = new FxSystem();
