// Gully Seven itself: terrain, canyon walls, sky, sun, and the hand-dressed
// bandit fort — shacks, spikes, barrels, posters/graffiti, vendors, the
// fast-travel Re-Constructor, chests, and Wire Spool pickups. Consumes zone
// data; exposes ground height, prop colliders, and static raycast targets.

import * as THREE from 'three';
import type { ZoneDef, ZonePoi } from '../data/zone';
import { toonMat, glowMat, flatMat } from '../render/toon';
import { groundTexture, rockTexture, corrugatedTexture, posterTexture, swatch, cloudTexture } from '../render/textures';
import { POSTERS, GRAFFITI } from '../data/flavor';
import { LootChest } from './loot';
import { fx } from './particles';
import { FX_LAYER } from '../render/post';
import { mulberry32 } from '../util/rng';

interface AABB { minX: number; maxX: number; minZ: number; maxZ: number }

export interface Interactable {
  kind: 'chest' | 'vendor_gun' | 'vendor_med' | 'fast_travel' | 'wirelog';
  pos: THREE.Vector3;
  label: string;
  data?: string;
  used?: boolean;
  chest?: LootChest;
}

export class World {
  group = new THREE.Group();
  colliders: AABB[] = [];
  staticTargets: THREE.Object3D[] = [];
  interactables: Interactable[] = [];
  chests: LootChest[] = [];
  private barrelFlames: THREE.Vector3[] = [];
  zone: ZoneDef;
  private raycaster = new THREE.Raycaster();

  constructor(zone: ZoneDef, scene: THREE.Scene) {
    this.zone = zone;
    this.buildSky(scene);
    this.buildTerrain();
    this.buildCanyon();
    this.dress();
    this.buildPois();
    scene.add(this.group);
  }

  get arenaHalf(): number { return this.zone.size / 2; }

  groundHeight(_x: number, _z: number): number { return 0; }

  // ------------------------------------------------------------------ sky
  private buildSky(scene: THREE.Scene): void {
    const z = this.zone;
    // gradient dome via vertex-colored sphere
    const geo = new THREE.SphereGeometry(400, 16, 12);
    const top = new THREE.Color(z.skyTop);
    const horizon = new THREE.Color(z.skyHorizon);
    const colors: number[] = [];
    const posAttr = geo.getAttribute('position');
    for (let i = 0; i < posAttr.count; i++) {
      const y = posAttr.getY(i) / 400;
      const c = horizon.clone().lerp(top, Math.max(0, y) ** 0.7);
      colors.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const sky = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false }));
    sky.layers.set(FX_LAYER); // no ink on the sky
    this.group.add(sky);

    // flat painted clouds — drifting panels sell the graphic-novel sky
    const cloudMat = flatMat(0xf4ead8, cloudTexture());
    cloudMat.transparent = true; cloudMat.opacity = 0.85; cloudMat.fog = false;
    const rng = mulberry32(777);
    for (let i = 0; i < 10; i++) {
      const w = 22 + rng() * 40;
      const cloud = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.375), cloudMat);
      const a = rng() * Math.PI * 2;
      const r = 200 + rng() * 120;
      cloud.position.set(Math.cos(a) * r, 60 + rng() * 70, Math.sin(a) * r);
      cloud.lookAt(0, cloud.position.y, 0);
      cloud.layers.set(FX_LAYER);
      cloud.name = 'cloud';
      this.group.add(cloud);
    }

    scene.fog = new THREE.Fog(z.fog.color, z.fog.near, z.fog.far);

    const sun = new THREE.DirectionalLight(z.sun.color, z.sun.intensity);
    sun.position.set(z.sun.dirX * 100, z.sun.dirY * 100, z.sun.dirZ * 100);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -70; sun.shadow.camera.right = 70;
    sun.shadow.camera.top = 70; sun.shadow.camera.bottom = -70;
    sun.shadow.camera.far = 260;
    sun.shadow.bias = -0.002;
    scene.add(sun);
    scene.add(new THREE.HemisphereLight(z.ambient.sky, z.ambient.ground, z.ambient.intensity));
  }

  // ------------------------------------------------------------------ terrain
  private buildTerrain(): void {
    const size = this.zone.size * 1.6;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size, 1, 1),
      toonMat({ map: groundTexture(), rim: 0 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.group.add(ground);
    this.staticTargets.push(ground);

    // scattered dirt patches for tonal variety
    const patchMat = toonMat({ color: 0x8a5a30, map: swatch('#8a5a30', 100), rim: 0 });
    const rng = mulberry32(4242);
    for (let i = 0; i < 14; i++) {
      const patch = new THREE.Mesh(new THREE.CircleGeometry(2 + rng() * 5, 10), patchMat);
      patch.rotation.x = -Math.PI / 2;
      patch.position.set((rng() - 0.5) * this.zone.size, 0.02, (rng() - 0.5) * this.zone.size);
      this.group.add(patch);
    }
  }

  private buildCanyon(): void {
    // ring of rock mesas boxing the arena — reads as a dry canyon
    const rockMat = toonMat({ map: rockTexture() });
    const rng = mulberry32(1234);
    const half = this.arenaHalf;
    const ringR = half + 8;
    const n = 26;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const h = 14 + rng() * 22;
      const w = 12 + rng() * 10;
      const mesa = new THREE.Mesh(new THREE.CylinderGeometry(w * (0.55 + rng() * 0.2), w, h, 5 + Math.floor(rng() * 3)), rockMat);
      mesa.position.set(Math.cos(a) * (ringR + rng() * 10), h / 2 - 1.5, Math.sin(a) * (ringR + rng() * 10));
      mesa.rotation.y = rng() * Math.PI;
      mesa.castShadow = true; mesa.receiveShadow = true;
      this.group.add(mesa);
      this.staticTargets.push(mesa);
    }
    // distant super-mesas for skyline depth
    for (let i = 0; i < 8; i++) {
      const a = rng() * Math.PI * 2;
      const h = 40 + rng() * 50;
      const mesa = new THREE.Mesh(new THREE.CylinderGeometry(18 + rng() * 14, 26 + rng() * 16, h, 6), rockMat);
      mesa.position.set(Math.cos(a) * (220 + rng() * 90), h / 2 - 4, Math.sin(a) * (220 + rng() * 90));
      this.group.add(mesa);
    }
  }

  // ------------------------------------------------------------------ props
  private addCollider(x: number, z: number, hw: number, hd: number): void {
    this.colliders.push({ minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd });
  }

  private dress(): void {
    const rng = mulberry32(9001);
    const corru = corrugatedTexture();
    const wallMat = toonMat({ map: corru });
    const darkMat = toonMat({ color: 0x4a4440, map: swatch('#4a4440', 70) });
    const woodMat = toonMat({ color: 0x8a6a42, map: swatch('#7a5a36', 80) });

    // --- bandit shacks (walls + slanted roofs + spikes) ---
    const shackSpots = [
      { x: -24, z: -18, r: 0.4 }, { x: 20, z: -22, r: -0.7 }, { x: -18, z: 14, r: 2.2 },
      { x: 28, z: 8, r: 1.4 }, { x: 2, z: -28, r: 0.1 },
    ];
    for (const s of shackSpots) {
      const shack = new THREE.Group();
      const w = 5 + rng() * 3, d = 4 + rng() * 2, h = 3 + rng() * 1.2;
      const back = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.25), wallMat);
      back.position.set(0, h / 2, -d / 2);
      const left = new THREE.Mesh(new THREE.BoxGeometry(0.25, h, d), wallMat);
      left.position.set(-w / 2, h / 2, 0);
      const right = new THREE.Mesh(new THREE.BoxGeometry(0.25, h * 0.8, d), wallMat);
      right.position.set(w / 2, h * 0.4, 0);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 1.4, 0.18, d + 1.2), darkMat);
      roof.position.set(0, h + 0.2, 0);
      roof.rotation.z = 0.12 + rng() * 0.1;
      shack.add(back, left, right, roof);
      // spikes on the roofline
      for (let i = 0; i < 5; i++) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.9 + rng() * 0.6, 5), darkMat);
        spike.position.set((i / 4 - 0.5) * w, h + 0.7, -d / 2);
        spike.rotation.z = (rng() - 0.5) * 0.3;
        shack.add(spike);
      }
      // support beams
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.18, h * 1.1, 0.18), woodMat);
      beam.position.set(w / 2 - 0.2, h * 0.55, d / 2 - 0.2);
      beam.rotation.x = -0.15;
      shack.add(beam);
      shack.position.set(s.x, 0, s.z);
      shack.rotation.y = s.r;
      shack.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
      this.group.add(shack);
      this.staticTargets.push(shack);
      this.addCollider(s.x, s.z, w / 2 + 0.4, d / 2 + 0.4);
    }

    // --- barricades / junk piles / crates ---
    for (let i = 0; i < 16; i++) {
      const x = (rng() - 0.5) * (this.zone.size - 20);
      const z = (rng() - 0.5) * (this.zone.size - 20);
      if (Math.abs(x) < 8 && z > 25) continue; // keep spawn plaza clear
      const pile = new THREE.Group();
      const kind = rng();
      if (kind < 0.4) {
        // junk pile
        for (let j = 0; j < 4; j++) {
          const junk = new THREE.Mesh(new THREE.BoxGeometry(0.5 + rng(), 0.3 + rng() * 0.6, 0.5 + rng()), rng() > 0.5 ? darkMat : wallMat);
          junk.position.set((rng() - 0.5) * 1.4, 0.3 + j * 0.25, (rng() - 0.5) * 1.4);
          junk.rotation.set(rng() * 0.6, rng() * Math.PI, rng() * 0.4);
          pile.add(junk);
        }
        this.addCollider(x, z, 1.1, 1.1);
      } else if (kind < 0.7) {
        // crate stack
        for (let j = 0; j < 2 + Math.floor(rng() * 2); j++) {
          const crate = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), woodMat);
          crate.position.set((rng() - 0.5) * 0.5, 0.55 + j * 1.1, (rng() - 0.5) * 0.5);
          crate.rotation.y = rng() * 0.8;
          pile.add(crate);
        }
        this.addCollider(x, z, 0.9, 0.9);
      } else {
        // wrecked barricade wall
        const bar = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.4, 0.3), wallMat);
        bar.position.y = 0.7;
        bar.rotation.y = rng() * Math.PI;
        bar.rotation.z = (rng() - 0.5) * 0.15;
        pile.add(bar);
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.1, 1.1, 5), darkMat);
        spike.position.set(0.8, 1.6, 0);
        spike.rotation.z = -0.4;
        pile.add(spike);
        this.addCollider(x, z, 1.8, 0.6);
      }
      pile.position.set(x, 0, z);
      pile.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
      this.group.add(pile);
      this.staticTargets.push(pile);
    }

    // --- burning barrels (light + fire column) ---
    const barrelMat = toonMat({ color: 0x7a4a28, map: swatch('#6a3f22', 90) });
    const barrelSpots = [[-10, 6], [14, -8], [-26, -30], [30, 24], [6, 34]];
    for (const [x, z] of barrelSpots) {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.1, 10), barrelMat);
      barrel.position.set(x, 0.55, z);
      barrel.castShadow = true;
      this.group.add(barrel);
      this.staticTargets.push(barrel);
      this.addCollider(x, z, 0.5, 0.5);
      const light = new THREE.PointLight(0xff7a1a, 12, 9);
      light.position.set(x, 1.6, z);
      this.group.add(light);
      this.barrelFlames.push(new THREE.Vector3(x, 1.15, z));
    }

    // --- posters & graffiti on walls and rocks ---
    const posterSpots: { x: number; z: number; ry: number; y?: number }[] = [
      { x: -24, z: -15.4, ry: 0.4 }, { x: 20, z: -19.6, ry: -0.7 }, { x: -18, z: 16.5, ry: 2.2 + Math.PI },
      { x: 28, z: 10.4, ry: 1.4 + Math.PI }, { x: 2, z: -25.6, ry: 0.1 }, { x: -3, z: 40.8, ry: Math.PI },
    ];
    posterSpots.forEach((s, i) => {
      const spec = POSTERS[i % POSTERS.length];
      const poster = new THREE.Mesh(
        new THREE.PlaneGeometry(1.5, 1.9),
        new THREE.MeshBasicMaterial({ map: posterTexture(spec), transparent: false }),
      );
      poster.position.set(s.x, s.y ?? 1.7, s.z);
      poster.rotation.y = s.ry;
      poster.rotation.z = (i % 2 === 0 ? 1 : -1) * 0.04; // slightly crooked, always
      this.group.add(poster);
    });
    // graffiti: unlit decal planes slapped on shack walls
    const graffitiSpots: { x: number; z: number; ry: number }[] = [
      { x: -23, z: -15.3, ry: 0.4 }, { x: 21, z: -19.5, ry: -0.7 }, { x: 27, z: 10.5, ry: 1.4 + Math.PI }, { x: 3, z: -25.5, ry: 0.1 },
    ];
    graffitiSpots.forEach((s, i) => {
      const spec = GRAFFITI[i % GRAFFITI.length];
      const tex = posterTexture({ ...spec, bg: '#00000000' });
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.92 });
      const tag = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.6), mat);
      tag.position.set(s.x + Math.sin(s.ry) * 0.1, 1.3, s.z + Math.cos(s.ry) * 0.1);
      tag.rotation.y = s.ry;
      tag.rotation.z = (i % 2 ? -1 : 1) * 0.08;
      this.group.add(tag);
    });

    // --- unlucky previous visitor + their loot pile (environmental story) ---
    const bones = new THREE.Group();
    const boneMat = toonMat({ color: 0xd8ccb4 });
    const skull = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.28, 0.32), boneMat);
    skull.position.set(0, 0.16, 0);
    const ribs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.7), boneMat);
    ribs.position.set(0.1, 0.1, 0.6);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.5),
      new THREE.MeshBasicMaterial({ map: posterTexture({ lines: ['TAXED'], style: 'graffiti', bg: '#00000000', fg: '#f2e4c4', accent: '#241a10' }), transparent: true }));
    sign.position.set(0, 0.7, -0.3);
    sign.rotation.x = -0.4;
    bones.add(skull, ribs, sign);
    bones.position.set(-33, 0, 9);
    this.group.add(bones);
  }

  // ------------------------------------------------------------------ POIs
  private buildPois(): void {
    for (const poi of this.zone.pois) {
      switch (poi.kind) {
        case 'chest': this.buildChest(poi); break;
        case 'vendor_gun': this.buildVendor(poi, true); break;
        case 'vendor_med': this.buildVendor(poi, false); break;
        case 'fast_travel': this.buildFastTravel(poi); break;
        case 'wirelog': this.buildWireLog(poi); break;
        default: break; // spawners/boss gates are logical-only
      }
    }
  }

  private buildChest(poi: ZonePoi): void {
    const chest = new LootChest(new THREE.Vector3(poi.x, 0, poi.z), poi.rot ?? 0);
    this.group.add(chest.group);
    this.chests.push(chest);
    this.staticTargets.push(chest.group);
    this.addCollider(poi.x, poi.z, 0.9, 0.6);
    this.interactables.push({ kind: 'chest', pos: chest.pos, label: 'OPEN WEAPON CHEST', chest });
  }

  private buildVendor(poi: ZonePoi, guns: boolean): void {
    const v = new THREE.Group();
    const bodyColor = guns ? '#5a2a6a' : '#2a6a5a';
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.4, 1.0), toonMat({ color: 0xffffff, map: swatch(bodyColor, 60) }));
    body.position.y = 1.2;
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(1.3, 1.5),
      new THREE.MeshBasicMaterial({ map: posterTexture(guns
        ? { lines: ['ZAZA’S', 'BANG', 'BANG'], style: 'ad', bg: '#5a2a6a', fg: '#ffd23c', accent: '#ff5a86' }
        : { lines: ['DOC', 'FIZZY', 'JUICE'], style: 'ad', bg: '#2a6a5a', fg: '#eafff4', accent: '#7dff2a' }) }),
    );
    face.position.set(0, 1.45, 0.51);
    const marquee = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.3, 1.1), toonMat({ color: guns ? 0xffd23c : 0x7dff2a }));
    marquee.position.y = 2.55;
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), glowMat(guns ? 0xff5a86 : 0x7dff2a, 1));
    glow.position.set(0.6, 2.55, 0.5);
    v.add(body, face, marquee, glow);
    v.position.set(poi.x, 0, poi.z);
    v.rotation.y = poi.rot ?? 0;
    v.traverse((o) => (o.castShadow = true));
    this.group.add(v);
    this.staticTargets.push(v);
    this.addCollider(poi.x, poi.z, 1.0, 0.7);
    this.interactables.push({
      kind: guns ? 'vendor_gun' : 'vendor_med',
      pos: new THREE.Vector3(poi.x, 0, poi.z),
      label: guns ? 'BROWSE ZAZA’S BANG-BANG EMPORIUM' : 'USE DOC FIZZY’S MED-O-MAT',
    });
  }

  private buildFastTravel(poi: ZonePoi): void {
    const ft = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.7, 0.3, 8), toonMat({ color: 0x4a5460, map: swatch('#3f4854', 60) }));
    base.position.y = 0.15;
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.6, 0.4), toonMat({ color: 0x5a646e }));
    pillar.position.set(-1.1, 1.3, 0);
    const ringM = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.06, 8, 24), glowMat(0x54d4ff, 0.9));
    ringM.rotation.x = Math.PI / 2;
    ringM.position.y = 0.35;
    ringM.layers.set(FX_LAYER);
    ft.add(base, pillar, ringM);
    ft.position.set(poi.x, 0, poi.z);
    ft.traverse((o) => (o.castShadow = true));
    this.group.add(ft);
    this.staticTargets.push(ft);
    this.interactables.push({
      kind: 'fast_travel',
      pos: new THREE.Vector3(poi.x, 0, poi.z),
      label: 'RE-CONSTRUCTOR STATION (fast travel — network offline, one node)',
    });
  }

  private buildWireLog(poi: ZonePoi): void {
    const log = new THREE.Group();
    const spool = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.22, 10), toonMat({ color: 0xd8b028 }));
    spool.position.y = 0.5;
    spool.rotation.z = Math.PI / 2;
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), glowMat(0x38c8ff, 1));
    glow.position.y = 0.5;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.1), toonMat({ color: 0x5a4a3a }));
    post.position.y = 0.25;
    log.add(post, spool, glow);
    log.position.set(poi.x, 0, poi.z);
    this.group.add(log);
    this.interactables.push({
      kind: 'wirelog',
      pos: new THREE.Vector3(poi.x, 0, poi.z),
      label: 'PLAY WIRE SPOOL',
      data: poi.data,
    });
  }

  // ------------------------------------------------------------------ queries
  resolveCollision(pos: THREE.Vector3, radius: number): void {
    for (const c of this.colliders) {
      const nx = Math.max(c.minX, Math.min(pos.x, c.maxX));
      const nz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
      const dx = pos.x - nx, dz = pos.z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 < radius * radius && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        pos.x = nx + (dx / d) * radius;
        pos.z = nz + (dz / d) * radius;
      } else if (d2 <= 1e-6) {
        pos.x = c.maxX + radius; // inside: push out along +x
      }
    }
  }

  raycastStatics(ray: THREE.Raycaster): THREE.Intersection | null {
    const hits = ray.intersectObjects(this.staticTargets, true);
    return hits[0] ?? null;
  }

  removeInteractable(it: Interactable): void {
    const i = this.interactables.indexOf(it);
    if (i >= 0) this.interactables.splice(i, 1);
  }

  update(dt: number): void {
    for (const c of this.chests) c.update(dt);
    // barrel fire
    for (const b of this.barrelFlames) {
      if (Math.random() < 20 * dt) fx.fireColumn(b);
    }
    // drifting clouds
    this.group.traverse((o) => {
      if (o.name === 'cloud') o.position.x += dt * 0.8;
    });
  }
}
