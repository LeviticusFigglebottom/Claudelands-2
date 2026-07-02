// The Claudelands overworld — pass 2. Builds the heightfield terrain and five
// hand-dressed districts (Gutterlight hub, Gully Seven fort, the Boneyard,
// the Slagflats crash site, Trash Mountain), plus the quest gate, Foreman
// Quibb, explosive barrels, scrap-rat critters, circling vultures, and
// drifting clouds. Exposes ground height, colliders, static raycasts (with
// terrain ray-march), and interactables. Consumes data/world.ts only.

import * as THREE from 'three';
import { WORLD, terrainHeight, terrainNormal, meshHeight, roadFactor, districtAt, TERRAIN_SEGS, TERRAIN_SPAN_FACTOR, type WorldPoi, type DistrictDef } from '../data/world';
import { toonMat, glowMat, flatMat } from '../render/toon';
import { groundTexture, rockTexture, corrugatedTexture, posterTexture, swatch, cloudTexture } from '../render/textures';
import { POSTERS, GRAFFITI } from '../data/flavor';
import { LootChest } from './loot';
import { fx } from './particles';
import { FX_LAYER } from '../render/post';
import { mulberry32, type Rng } from '../util/rng';
import { splashDamage, type Damageable, type StatusEffect } from './combat';
import { audio } from '../audio/synth';

interface AABB { minX: number; maxX: number; minZ: number; maxZ: number }

export interface Interactable {
  kind: 'chest' | 'vendor_gun' | 'vendor_med' | 'fast_travel' | 'wirelog' | 'npc';
  pos: THREE.Vector3;
  label: string;
  data?: string;
  chest?: LootChest;
}

export interface StaticHit {
  point: THREE.Vector3;
  distance: number;
  normal: THREE.Vector3;
}

/** Shootable red barrel — a Damageable that explodes. */
export class ExplosiveBarrel implements Damageable {
  position: THREE.Vector3;
  alive = true;
  shield = 0; maxShield = 0;
  armor = 0; maxArmor = 0;
  flesh = 30; maxFlesh = 30;
  statuses: StatusEffect[] = [];
  slowUntil = 0;
  group: THREE.Group;
  exploded = false;

  constructor(x: number, z: number) {
    const y = terrainHeight(x, z);
    this.position = new THREE.Vector3(x, y, z);
    this.group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.1, 10), toonMat({ color: 0xb43a2a, map: swatch('#a43426', 80) }));
    body.position.y = 0.55;
    body.castShadow = true;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.43, 0.14, 10), toonMat({ color: 0xffd23c }));
    band.position.y = 0.75;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4),
      new THREE.MeshBasicMaterial({ map: posterTexture({ lines: ['!!'], style: 'warning', bg: '#ffd23c', fg: '#181818', accent: '#181818' }, 1) }));
    sign.position.set(0, 0.55, 0.43);
    this.group.add(body, band, sign);
    this.group.position.copy(this.position);
  }

  onDeath(): void {
    if (this.exploded) return;
    this.exploded = true;
    this.group.visible = false;
    splashDamage(this.position.clone().add(new THREE.Vector3(0, 0.6, 0)), 4.5, 40 + this.maxFlesh, 'blast', { source: 'world' });
  }
}

export class World {
  group = new THREE.Group();
  colliders: AABB[] = [];
  staticTargets: THREE.Object3D[] = [];
  interactables: Interactable[] = [];
  chests: LootChest[] = [];
  barrels: ExplosiveBarrel[] = [];
  private barrelFlames: THREE.Vector3[] = [];
  private sun!: THREE.DirectionalLight;
  private sunOffset = new THREE.Vector3();
  private gate: { group: THREE.Group; collider: AABB; open: boolean; openT: number; id: string } | null = null;
  private rats: { mesh: THREE.Group; vel: THREE.Vector3; wanderT: number; home: THREE.Vector3 }[] = [];
  private citizens: { mesh: THREE.Group; vel: THREE.Vector3; wanderT: number; home: THREE.Vector3 }[] = [];
  private vultures: { mesh: THREE.Group; angle: number; r: number; cx: number; cz: number; h: number; speed: number }[] = [];
  private quibb: THREE.Group | null = null;
  private zaza: THREE.Group | null = null;
  private hemi!: THREE.HemisphereLight;
  private raycaster = new THREE.Raycaster();

  constructor(scene: THREE.Scene) {
    this.buildSky(scene);
    this.buildTerrain();
    this.buildDistricts();
    this.buildPois();
    this.buildCanyonRing();
    this.buildScatter();
    this.buildCritters();
    scene.add(this.group);
  }

  /** Tear down for a map switch: remove everything this world added. */
  dispose(scene: THREE.Scene): void {
    scene.remove(this.group);
    scene.remove(this.sun, this.sun.target, this.hemi);
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
  }

  get arenaHalf(): number { return WORLD.size / 2; }
  groundHeight(x: number, z: number): number { return terrainHeight(x, z); }
  districtAt(x: number, z: number): DistrictDef | null { return districtAt(x, z); }

  // ------------------------------------------------------------------ sky
  private buildSky(scene: THREE.Scene): void {
    const geo = new THREE.SphereGeometry(560, 16, 12);
    const top = new THREE.Color(WORLD.skyTop);
    const horizon = new THREE.Color(WORLD.skyHorizon);
    const colors: number[] = [];
    const posAttr = geo.getAttribute('position');
    for (let i = 0; i < posAttr.count; i++) {
      const y = posAttr.getY(i) / 560;
      const c = horizon.clone().lerp(top, Math.max(0, y) ** 0.7);
      colors.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const sky = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false }));
    sky.layers.set(FX_LAYER);
    this.group.add(sky);

    // sun disc (blooms nicely)
    const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(26, 20), glowMat(0xfff2d0, 0.9));
    sunDisc.position.set(WORLD.sun.dirX, WORLD.sun.dirY, WORLD.sun.dirZ).multiplyScalar(500);
    sunDisc.lookAt(0, 0, 0);
    sunDisc.layers.set(FX_LAYER);
    (sunDisc.material as THREE.MeshBasicMaterial).fog = false;
    this.group.add(sunDisc);

    const cloudMat = flatMat(0xf4ead8, cloudTexture());
    cloudMat.transparent = true; cloudMat.opacity = 0.85; cloudMat.fog = false;
    const rng = mulberry32(777);
    for (let i = 0; i < 12; i++) {
      const w = 26 + rng() * 46;
      const cloud = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.375), cloudMat);
      const a = rng() * Math.PI * 2;
      const r = 260 + rng() * 180;
      cloud.position.set(Math.cos(a) * r, 80 + rng() * 90, Math.sin(a) * r);
      cloud.lookAt(0, cloud.position.y, 0);
      cloud.layers.set(FX_LAYER);
      cloud.name = 'cloud';
      this.group.add(cloud);
    }

    scene.fog = new THREE.Fog(WORLD.fog.color, WORLD.fog.near, WORLD.fog.far);

    this.sun = new THREE.DirectionalLight(WORLD.sun.color, WORLD.sun.intensity);
    this.sunOffset.set(WORLD.sun.dirX, WORLD.sun.dirY, WORLD.sun.dirZ).multiplyScalar(120);
    this.sun.position.copy(this.sunOffset);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -60; this.sun.shadow.camera.right = 60;
    this.sun.shadow.camera.top = 60; this.sun.shadow.camera.bottom = -60;
    this.sun.shadow.camera.far = 320;
    this.sun.shadow.bias = -0.002;
    scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(WORLD.ambient.sky, WORLD.ambient.ground, WORLD.ambient.intensity);
    scene.add(this.hemi);

    // aurora ribbons — the Frosthollow's night-sky signature
    if (WORLD.biome.aurora) {
      for (let i = 0; i < 3; i++) {
        const ribbon = new THREE.Mesh(
          new THREE.PlaneGeometry(340 + i * 60, 26 + i * 8, 24, 1),
          glowMat([0x54ffb4, 0x54d4ff, 0xc06bff][i], 0.16),
        );
        const p = ribbon.geometry.getAttribute('position');
        for (let v = 0; v < p.count; v++) {
          p.setY(v, p.getY(v) + Math.sin(p.getX(v) * 0.03 + i * 2) * 14);
          p.setZ(v, Math.sin(p.getX(v) * 0.02 + i) * 20);
        }
        ribbon.position.set(i * 40 - 40, 150 + i * 22, -220 - i * 30);
        ribbon.rotation.x = 0.35;
        ribbon.layers.set(FX_LAYER);
        ribbon.name = 'aurora';
        this.group.add(ribbon);
      }
    }
  }

  /** Big world: the shadow frustum follows the player. */
  followSun(playerPos: THREE.Vector3): void {
    this.sun.position.copy(playerPos).add(this.sunOffset);
    this.sun.target.position.copy(playerPos);
  }

  // ------------------------------------------------------------------ terrain
  private buildTerrain(): void {
    const span = WORLD.size * TERRAIN_SPAN_FACTOR;
    const segs = TERRAIN_SEGS;
    const geo = new THREE.PlaneGeometry(span, span, segs, segs);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.getAttribute('position');
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      pos.setY(i, meshHeight(x, z));
      // vertex tint: roads read as packed dark ruts, no extra geometry
      const road = roadFactor(x, z);
      const shade = 1 - road * 0.38;
      const warm = 1 - road * 0.30;
      colors[i * 3] = shade;
      colors[i * 3 + 1] = warm * shade;
      colors[i * 3 + 2] = warm * warm * shade;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const g = WORLD.biome.ground;
    const mat = toonMat({ map: groundTexture(g.base, g.light, g.dark, g.crack), rim: 0 });
    mat.vertexColors = true;
    mat.map!.repeat.set(24, 24);
    const ground = new THREE.Mesh(geo, mat);
    ground.receiveShadow = true;
    this.group.add(ground);
    // NOTE: terrain is NOT in staticTargets — hitscan uses the ray-march in raycastStatics
  }

  private buildCanyonRing(): void {
    const rockMat = toonMat({ map: rockTexture(WORLD.biome.rock) });
    const rng = mulberry32(1234);
    const ringR = this.arenaHalf + 14;
    const n = 34;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const h = 18 + rng() * 26;
      const w = 14 + rng() * 12;
      const mesa = new THREE.Mesh(new THREE.CylinderGeometry(w * (0.55 + rng() * 0.2), w, h, 5 + Math.floor(rng() * 3)), rockMat);
      mesa.position.set(Math.cos(a) * (ringR + rng() * 14), h / 2 - 2, Math.sin(a) * (ringR + rng() * 14));
      mesa.rotation.y = rng() * Math.PI;
      mesa.castShadow = true; mesa.receiveShadow = true;
      this.group.add(mesa);
      this.staticTargets.push(mesa);
      if (WORLD.biome.trees === 'pine') {
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.58, w * 0.72, h * 0.12, 6), toonMat({ color: 0xf0f6fa }));
        cap.position.copy(mesa.position);
        cap.position.y = h - 2 + h * 0.02;
        cap.rotation.y = mesa.rotation.y;
        this.group.add(cap);
      }
    }
    for (let i = 0; i < 10; i++) {
      const a = rng() * Math.PI * 2;
      const h = 46 + rng() * 60;
      const mesa = new THREE.Mesh(new THREE.CylinderGeometry(20 + rng() * 16, 30 + rng() * 18, h, 6), rockMat);
      mesa.position.set(Math.cos(a) * (300 + rng() * 120), h / 2 - 6, Math.sin(a) * (300 + rng() * 120));
      this.group.add(mesa);
    }
    // scattered inner rocks
    for (let i = 0; i < 26; i++) {
      const x = (rng() - 0.5) * WORLD.size * 0.95;
      const z = (rng() - 0.5) * WORLD.size * 0.95;
      const dd = districtAt(x, z);
      if (dd && (dd.dress === 'hub' || dd.dress === 'frosthub' || dd.dress === 'throatgate')) continue;
      if (!this.clearOfAssets(x, z, 2.2)) continue;
      const s = 0.8 + rng() * 2.6;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rockMat);
      rock.position.set(x, terrainHeight(x, z) + s * 0.3, z);
      rock.rotation.set(rng() * 3, rng() * 3, rng() * 3);
      rock.castShadow = true;
      this.group.add(rock);
      this.staticTargets.push(rock);
      if (s > 1.6) this.addCollider(x, z, s * 0.8, s * 0.8);
    }
  }

  private buildScatter(): void {
    // instanced scrub tufts + pebbles — cheap ground life across the map
    const rng = mulberry32(31337);
    const tuftGeo = new THREE.ConeGeometry(0.16, 0.5, 5);
    const tuftMat = toonMat({ color: WORLD.biome.scrub });
    const tufts = new THREE.InstancedMesh(tuftGeo, tuftMat, 700);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    let placed = 0;
    for (let i = 0; i < 3000 && placed < 700; i++) {
      const x = (rng() - 0.5) * WORLD.size * 1.15;
      const z = (rng() - 0.5) * WORLD.size * 1.15;
      const d = districtAt(x, z);
      if (d && (d.dress === 'hub' || d.dress === 'frosthub' || d.dress === 'throne' || d.dress === 'throatgate')) continue;
      if (!this.clearOfAssets(x, z, 1.2)) continue;
      const sc = 0.6 + rng() * 1.3;
      q.setFromEuler(new THREE.Euler(0.15 * (rng() - 0.5), rng() * Math.PI, 0.15 * (rng() - 0.5)));
      s.set(sc, sc * (0.7 + rng() * 0.8), sc);
      m.compose(new THREE.Vector3(x, terrainHeight(x, z) + 0.2 * sc, z), q, s);
      tufts.setMatrixAt(placed++, m);
    }
    tufts.count = placed;
    tufts.castShadow = true;
    this.group.add(tufts);
  }

  // ------------------------------------------------------------------ districts
  private addCollider(x: number, z: number, hw: number, hd: number): void {
    this.colliders.push({ minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd });
  }

  /** Free-placed props must not block the walk-up to a zone exit. */
  private clearOfExits(x: number, z: number): boolean {
    for (const ex of WORLD.exits ?? []) {
      if (Math.hypot(x - ex.x, z - ex.z) < 12) return false;
    }
    return true;
  }

  /** Scatter keep-out: too close to a collider, POI, or road = don't place. */
  private clearOfAssets(x: number, z: number, margin = 1.6): boolean {
    if (roadFactor(x, z) > 0.12) return false;
    for (const c of this.colliders) {
      if (x > c.minX - margin && x < c.maxX + margin && z > c.minZ - margin && z < c.maxZ + margin) return false;
    }
    for (const p of WORLD.pois) {
      if (Math.hypot(x - p.x, z - p.z) < 5.5) return false;
    }
    if (!this.clearOfExits(x, z)) return false;
    return true;
  }

  private buildDistricts(): void {
    for (const d of WORLD.districts) {
      switch (d.dress) {
        case 'hub': this.buildGutterlight(); break;
        case 'fort': this.buildGully(); break;
        case 'boneyard': this.buildBoneyard(); break;
        case 'slagflats': this.buildSlagflats(); break;
        case 'throne': this.buildTrashMountain(); break;
        case 'frosthub': this.buildChatterjaw(d); break;
        case 'pinebreak': this.buildPinebreak(d); break;
        case 'fathom': this.buildFathom(d); break;
        case 'icebox': this.buildIcebox(d); break;
        case 'throatgate': this.buildThroatGate(d); break;
        case 'cindercamp': this.buildCinderCamp(d); break;
        case 'ashflats': this.buildAshFlats(d); break;
        case 'kilnyard': this.buildKilnYard(d); break;
        case 'foundrycourt': this.buildFoundryCourt(d); break;
        case 'brassplaza': this.buildBrassPlaza(d); break;
        case 'crucible': this.buildCrucible(d); break;
      }
    }
  }

  /** Toon pine: stacked cones on a trunk. The Frosthollow staple. */
  private pine(x: number, z: number, scale = 1): void {
    const y = terrainHeight(x, z);
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14 * scale, 0.2 * scale, 1.1 * scale, 6), toonMat({ color: 0x5a4030, map: swatch('#4e3828', 50) }));
    trunk.position.y = 0.55 * scale;
    tree.add(trunk);
    const green = toonMat({ color: 0x2e5a44, map: swatch('#28503c', 40) });
    for (let i = 0; i < 3; i++) {
      const tier = new THREE.Mesh(new THREE.ConeGeometry((1.35 - i * 0.34) * scale, 1.5 * scale, 7), green);
      tier.position.y = (1.4 + i * 0.95) * scale;
      tree.add(tier);
      const snow = new THREE.Mesh(new THREE.ConeGeometry((1.0 - i * 0.26) * scale, 0.45 * scale, 7), toonMat({ color: 0xf0f6fa }));
      snow.position.y = (1.85 + i * 0.95) * scale;
      tree.add(snow);
    }
    tree.position.set(x, y, z);
    tree.rotation.y = Math.random() * Math.PI;
    tree.traverse((o) => (o.castShadow = true));
    this.group.add(tree);
    this.staticTargets.push(tree);
    this.addCollider(x, z, 0.35 * scale, 0.35 * scale);
  }

  /** Charred snag: blackened trunk with bare branch stubs. */
  private burntTree(x: number, z: number, scale = 1): void {
    if (!this.clearOfExits(x, z)) return;
    const y = terrainHeight(x, z);
    const tree = new THREE.Group();
    const charMat = toonMat({ color: 0x241e1a, map: swatch('#1f1a16', 40) });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * scale, 0.24 * scale, 3.2 * scale, 6), charMat);
    trunk.position.y = 1.6 * scale;
    trunk.rotation.z = (Math.random() - 0.5) * 0.12;
    tree.add(trunk);
    for (let i = 0; i < 3; i++) {
      const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.04 * scale, 0.07 * scale, 1.1 * scale, 5), charMat);
      const a = Math.random() * Math.PI * 2;
      branch.position.set(Math.cos(a) * 0.25 * scale, (1.6 + i * 0.6) * scale, Math.sin(a) * 0.25 * scale);
      branch.rotation.z = 0.9 + Math.random() * 0.5;
      branch.rotation.y = a;
      tree.add(branch);
    }
    // a few embers still glowing in the bark
    const ember = new THREE.Mesh(new THREE.SphereGeometry(0.05 * scale, 5, 5), glowMat(0xff6a1a, 0.9));
    ember.position.set(0.1 * scale, 0.8 * scale, 0.1 * scale);
    ember.name = 'blinker';
    tree.add(ember);
    tree.position.set(x, y, z);
    tree.rotation.y = Math.random() * Math.PI;
    tree.traverse((o) => (o.castShadow = true));
    this.group.add(tree);
    this.staticTargets.push(tree);
    this.addCollider(x, z, 0.3 * scale, 0.3 * scale);
  }

  private lavaPool(x: number, z: number, r: number): void {
    const y = terrainHeight(x, z);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(r, 14), glowMat(0xff7a1a, 0.7));
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(x, y + 0.05, z);
    pool.layers.set(FX_LAYER);
    this.group.add(pool);
    const core = new THREE.Mesh(new THREE.CircleGeometry(r * 0.5, 12), glowMat(0xffd23c, 0.85));
    core.rotation.x = -Math.PI / 2;
    core.position.set(x, y + 0.07, z);
    core.layers.set(FX_LAYER);
    this.group.add(core);
    const light = new THREE.PointLight(0xff6a1a, 14, r * 5);
    light.position.set(x, y + 1.2, z);
    this.group.add(light);
    this.barrelFlames.push(new THREE.Vector3(x, y + 0.4, z));
  }

  // --------------------------------------------------- Cinder Throat dresses
  private buildThroatGate(d: DistrictDef): void {
    const rng = mulberry32(6001);
    // scorched arch over the entry
    const charMat = toonMat({ color: 0x2c2624, map: swatch('#241f1c', 60) });
    const postL = new THREE.Mesh(new THREE.BoxGeometry(1.2, 8, 1.2), charMat);
    postL.position.set(-7, terrainHeight(-7, 118) + 4, 118);
    const postR = postL.clone(); postR.position.x = 7;
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(15.6, 1.4, 1.4), charMat);
    lintel.position.set(0, terrainHeight(0, 118) + 7.6, 118);
    const skullSign = World.textSign(3.2, 2, { lines: ['THE', 'KINDLED', 'WELCOME FUEL'], style: 'warning', bg: '#d8843c', fg: '#1a1210', accent: '#1a1210' }, { twoSided: true });
    skullSign.position.set(0, terrainHeight(0, 118) + 5.4, 118.8);
    this.group.add(postL, postR, lintel, skullSign);
    this.staticTargets.push(postL, postR);
    this.campfire(5, 128);
    this.junkPiles(rng, d.cx, d.cz + 4, 12, 3);
    for (let i = 0; i < 5; i++) this.burntTree(d.cx + (rng() - 0.5) * 30, d.cz + (rng() - 0.5) * 26, 0.8 + rng() * 0.6);
  }

  private buildCinderCamp(d: DistrictDef): void {
    const rng = mulberry32(6002);
    const tentMat = toonMat({ color: 0x6a4434, map: swatch('#5a3a2c', 70) });
    for (const [x, z] of [[d.cx + 6, d.cz - 4], [d.cx - 8, d.cz + 6], [d.cx + 2, d.cz + 10]] as const) {
      const tent = new THREE.Mesh(new THREE.ConeGeometry(1.8, 2.6, 6), tentMat);
      tent.position.set(x, terrainHeight(x, z) + 1.2, z);
      tent.castShadow = true;
      this.group.add(tent);
      this.staticTargets.push(tent);
      this.addCollider(x, z, 1.5, 1.5);
    }
    this.campfire(d.cx, d.cz);
    this.campfire(d.cx - 12, d.cz - 8);
    this.lavaPool(d.cx + 14, d.cz + 4, 2.4);
    this.explosiveBarrel(d.cx + 8, d.cz + 8);
    this.explosiveBarrel(d.cx - 14, d.cz + 2);
    this.junkPiles(rng, d.cx, d.cz, 18, 5);
    for (let i = 0; i < 8; i++) this.burntTree(d.cx + (rng() - 0.5) * 44, d.cz + (rng() - 0.5) * 40, 0.7 + rng() * 0.7);
    this.poster(d.cx + 5, d.cz - 3, Math.PI, 0);
    this.graffiti(d.cx - 7, d.cz + 7.2, 0.4, 1);
  }

  private buildAshFlats(d: DistrictDef): void {
    const rng = mulberry32(6003);
    // open killing field: bone-char mounds, lava seams, wrecked hauler cart
    for (let i = 0; i < 6; i++) {
      const a = rng() * Math.PI * 2;
      const r = rng() * d.radius * 0.7;
      const x = d.cx + Math.cos(a) * r, z = d.cz + Math.sin(a) * r;
      const mound = new THREE.Mesh(new THREE.SphereGeometry(1 + rng() * 1.6, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), toonMat({ color: 0x3a322e, map: swatch('#332c28', 60) }));
      mound.position.set(x, terrainHeight(x, z), z);
      mound.castShadow = true;
      this.group.add(mound);
      this.staticTargets.push(mound);
      this.addCollider(x, z, 1.4, 1.4);
    }
    this.lavaPool(d.cx - 8, d.cz + 10, 3);
    this.lavaPool(d.cx + 12, d.cz - 6, 2.2);
    const cart = new THREE.Mesh(new THREE.BoxGeometry(4, 2, 2.4), toonMat({ map: corrugatedTexture('#5a4a42', '#7a3a20') }));
    cart.position.set(d.cx + 2, terrainHeight(d.cx + 2, d.cz + 16) + 1, d.cz + 16);
    cart.rotation.z = 0.3;
    cart.castShadow = true;
    this.group.add(cart);
    this.staticTargets.push(cart);
    this.addCollider(d.cx + 2, d.cz + 16, 2.4, 1.6);
    this.explosiveBarrel(d.cx - 12, d.cz - 10);
    this.explosiveBarrel(d.cx + 16, d.cz + 6);
    for (let i = 0; i < 10; i++) this.burntTree(d.cx + (rng() - 0.5) * 52, d.cz + (rng() - 0.5) * 48, 0.7 + rng() * 0.8);
  }

  private buildKilnYard(d: DistrictDef): void {
    const rng = mulberry32(6004);
    // brick kilns: squat domes with glowing mouths
    const brickMat = toonMat({ color: 0x6a4434, map: swatch('#5e3c2e', 90) });
    for (const [x, z] of [[d.cx - 8, d.cz - 6], [d.cx + 10, d.cz + 4], [d.cx - 2, d.cz + 12]] as const) {
      const y = terrainHeight(x, z);
      const kiln = new THREE.Mesh(new THREE.SphereGeometry(2.2, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), brickMat);
      kiln.position.set(x, y, z);
      const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.7, 10), glowMat(0xff7a1a, 0.9));
      mouth.position.set(x, y + 0.8, z + 2.1);
      const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 1.6, 8), brickMat);
      chimney.position.set(x, y + 2.6, z);
      kiln.castShadow = true;
      this.group.add(kiln, mouth, chimney);
      this.staticTargets.push(kiln);
      this.addCollider(x, z, 2.2, 2.2);
      this.barrelFlames.push(new THREE.Vector3(x, y + 3.4, z));
    }
    this.campfire(d.cx + 4, d.cz - 12);
    this.lavaPool(d.cx - 14, d.cz + 8, 2);
    this.explosiveBarrel(d.cx + 14, d.cz - 4);
    this.junkPiles(rng, d.cx, d.cz, 16, 4);
    this.poster(d.cx - 7.8, d.cz - 6, Math.PI / 2, 2);
  }

  private buildFoundryCourt(d: DistrictDef): void {
    const rng = mulberry32(6005);
    // the stolen Helix foundry: a hulking furnace facade at the court's back
    const hullMat = toonMat({ color: 0x4a4442, map: swatch('#413c3a', 70) });
    const teal = toonMat({ color: 0x2ba8a0 });
    const facade = new THREE.Group();
    const wall = new THREE.Mesh(new THREE.BoxGeometry(26, 12, 3), hullMat);
    wall.position.y = 6;
    const maw = new THREE.Mesh(new THREE.PlaneGeometry(7, 8), glowMat(0xff6a1a, 0.85));
    maw.position.set(0, 4.5, 1.6);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(26.2, 1, 3.2), teal);
    stripe.position.y = 10.5;
    for (let i = 0; i < 4; i++) {
      const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 6, 8), hullMat);
      stack.position.set(-9 + i * 6, 14, 0);
      facade.add(stack);
    }
    const logo = World.textSign(5, 3, { lines: ['HELIX', 'FOUNDRY 9', '(UNDER NEW MGMT)'], style: 'warning', bg: '#4a4442', fg: '#ffd23c', accent: '#2ba8a0' });
    logo.position.set(8, 8, 1.6);
    facade.add(wall, maw, stripe, logo);
    facade.position.set(d.cx, terrainHeight(d.cx, d.cz - 14), d.cz - 14);
    facade.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
    this.group.add(facade);
    this.staticTargets.push(facade);
    this.addCollider(d.cx, d.cz - 14, 13, 2);
    // offering piles + lava moat accents
    this.lavaPool(d.cx - 12, d.cz + 6, 2.6);
    this.lavaPool(d.cx + 12, d.cz + 4, 2.2);
    this.campfire(d.cx - 6, d.cz + 14);
    this.campfire(d.cx + 6, d.cz + 14);
    this.junkPiles(rng, d.cx, d.cz + 6, 14, 4);
    for (let i = 0; i < 4; i++) this.burntTree(d.cx + (rng() - 0.5) * 40, d.cz + 16 + rng() * 8, 0.9 + rng() * 0.5);
  }

  // --------------------------------------------------- Brasshaven (the city)
  private cityBuilding(x: number, z: number, rng: Rng): void {
    const y = terrainHeight(x, z);
    const b = new THREE.Group();
    const palettes = ['#6a5a48', '#5a626a', '#6a4a52', '#52604a', '#5c5462'];
    const floors = 2 + Math.floor(rng() * 3);
    let hgt = 0;
    let w = 6 + rng() * 4, d = 5 + rng() * 3;
    for (let f = 0; f < floors; f++) {
      const fh = 3 + rng() * 1.4;
      const box = new THREE.Mesh(new THREE.BoxGeometry(w, fh, d),
        toonMat({ color: 0xffffff, map: swatch(palettes[Math.floor(rng() * palettes.length)], 80) }));
      box.position.y = hgt + fh / 2;
      b.add(box);
      // window strips: warm glow slits
      for (let side = 0; side < 2; side++) {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 0.28, 0.06), glowMat(rng() > 0.3 ? 0xffd23c : 0x54d4ff, 0.85));
        strip.position.set(0, hgt + fh * 0.6, (side ? 1 : -1) * (d / 2 + 0.03));
        b.add(strip);
      }
      hgt += fh;
      w *= 0.82 + rng() * 0.1; d *= 0.85 + rng() * 0.1;
    }
    // rooftop dressing + occasional neon board
    const vent = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 1, 8), toonMat({ color: 0x3a3632 }));
    vent.position.set(1, hgt + 0.5, 0);
    b.add(vent);
    if (rng() > 0.5) {
      const ads = [
        { lines: ['HOT', 'SLAG'], bg: '#5a2a6a', fg: '#ffd23c' },
        { lines: ['ROOMS', 'SOME CLEAN'], bg: '#2a4a6a', fg: '#8ff4ff' },
        { lines: ['TEETH', 'BOUGHT'], bg: '#6a2a2a', fg: '#ffe8b0' },
        { lines: ['NOODLE', 'CHURCH'], bg: '#2a6a5a', fg: '#eafff4' },
      ];
      const ad = ads[Math.floor(rng() * ads.length)];
      const sign = World.textSign(3.4, 2.2, { lines: ad.lines, style: 'ad', bg: ad.bg, fg: ad.fg, accent: '#ff5a86' }, { twoSided: true });
      sign.position.set(0, hgt + 1.6, 0);
      sign.rotation.y = rng() * Math.PI;
      b.add(sign);
      const neon = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 6), glowMat(0xff5a86, 1));
      neon.position.set(1.8, hgt + 1.6, 0);
      neon.name = 'blinker';
      b.add(neon);
    }
    b.position.set(x, y, z);
    b.rotation.y = rng() * Math.PI * 2;
    b.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
    this.group.add(b);
    this.staticTargets.push(b);
    this.addCollider(x, z, 4.2, 3.6);
  }

  private buildBrassPlaza(d: DistrictDef): void {
    const rng = mulberry32(7777);
    // the beached mega-hauler looming over the north edge — the city's roof
    const hullMat = toonMat({ color: 0xffffff, map: swatch('#7a6a58', 90) });
    const teal = toonMat({ color: 0x2ba8a0 });
    const hull = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(16, 20, 90, 10), hullMat);
    body.rotation.z = Math.PI / 2;
    body.position.y = 8;
    const fin = new THREE.Mesh(new THREE.BoxGeometry(10, 16, 1.4), teal);
    fin.position.set(34, 20, 0);
    fin.rotation.z = 0.3;
    const name = World.textSign(24, 7, { lines: ['BRASSHAVEN'], style: 'propaganda', bg: '#4a4442', fg: '#ffd23c', accent: 'rgba(255,220,120,0.2)' });
    name.position.set(0, 12, 19.2);
    hull.add(body, fin, name);
    hull.position.set(0, terrainHeight(0, -52), -52);
    hull.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
    this.group.add(hull);
    this.staticTargets.push(hull);
    this.addCollider(0, -52, 46, 18);

    // city blocks around the plaza
    const spots: [number, number][] = [
      [-24, 20], [24, 22], [-32, -4], [34, -2], [-22, -26], [26, -24], [-8, 34], [12, 36], [-38, 24],
    ];
    for (const [x, z] of spots) this.cityBuilding(x, z, rng);

    // market row: striped awning stalls
    for (const [x, z, a] of [[-6, -8, 0.4], [4, -10, -0.3], [-14, 2, 1.2], [14, 0, -1.1]] as const) {
      const y = terrainHeight(x, z);
      const stall = new THREE.Group();
      const counter = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1, 1), toonMat({ color: 0x8a6a42, map: swatch('#7a5a36', 80) }));
      counter.position.y = 0.5;
      const awning = new THREE.Mesh(new THREE.ConeGeometry(1.9, 1, 4), toonMat({ color: [0xb43a5a, 0x3a6ab4, 0xb4952a][Math.floor(rng() * 3)] }));
      awning.position.y = 2.4;
      awning.rotation.y = Math.PI / 4;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2, 6), toonMat({ color: 0x4a4440 }));
      pole.position.y = 1;
      const goods = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.6), toonMat({ color: 0x7d8a4a }));
      goods.position.set(0.5, 1.2, 0);
      stall.add(counter, pole, awning, goods);
      stall.position.set(x, y, z);
      stall.rotation.y = a;
      stall.traverse((o) => (o.castShadow = true));
      this.group.add(stall);
      this.staticTargets.push(stall);
      this.addCollider(x, z, 1.4, 0.8);
    }

    // plaza string lights, barrels, junk
    for (let s = 0; s < 4; s++) {
      const from = new THREE.Vector3(-20 + s * 8, 5.2, -14 + s * 9);
      const to = new THREE.Vector3(18 - s * 6, 4.8, -8 + s * 10);
      for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        const p = from.clone().lerp(to, t);
        p.y -= Math.sin(t * Math.PI) * 1.2;
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6),
          glowMat([0xffd23c, 0xff5a86, 0x54d4ff, 0x7dff2a][i % 4], 0.95));
        bulb.position.copy(p);
        bulb.layers.set(FX_LAYER);
        this.group.add(bulb);
      }
    }
    this.fireBarrel(-4, 22);
    this.fireBarrel(18, -16);
    this.junkPiles(rng, 0, 10, 30, 5);
    this.poster(-23.2, 21, Math.PI / 2, 3);
    this.poster(25.2, 21, -Math.PI / 2, 4);
    this.graffiti(-31, -2.5, 0.3, 2);
    this.graffiti(27, -22.6, 0.2, 0);

    // citizens: Brasshaven has people. They walk. They judge.
    const skins = ['#c89878', '#a87858', '#8a6848'];
    const fits = [0x5a4a6a, 0x4a6a5a, 0x6a5a3a, 0x3a5a6a, 0x6a3a4a, 0x8a7a3a];
    for (let i = 0; i < 7; i++) {
      const c = new THREE.Group();
      const legs = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.68, 0.24), toonMat({ color: 0x33302c }));
      legs.position.y = 0.34;
      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.7, 0.3), toonMat({ color: fits[i % fits.length] }));
      torso.position.y = 1.0;
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.3, 0.28), toonMat({ color: skins[i % skins.length] as unknown as number, map: swatch(skins[i % skins.length], 30) }));
      head.position.y = 1.55;
      const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.14, 8), toonMat({ color: fits[(i + 3) % fits.length] }));
      hat.position.y = 1.76;
      c.add(legs, torso, head, hat);
      const x = (rng() - 0.5) * 44, z = (rng() - 0.5) * 44;
      c.position.set(x, terrainHeight(x, z), z);
      c.traverse((o) => (o.castShadow = true));
      this.group.add(c);
      this.citizens.push({ mesh: c, vel: new THREE.Vector3(), wanderT: rng() * 2, home: new THREE.Vector3(0, 0, 4) });
    }
  }

  private campfire(x: number, z: number): void {
    const y = terrainHeight(x, z);
    const logs = new THREE.Group();
    const logMat = toonMat({ color: 0x5a4030 });
    for (let i = 0; i < 3; i++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1, 6), logMat);
      log.rotation.z = Math.PI / 2;
      log.rotation.y = (i / 3) * Math.PI;
      log.position.y = 0.12;
      logs.add(log);
    }
    const stones = toonMat({ color: 0x6a7a8a });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16, 0), stones);
      s.position.set(Math.cos(a) * 0.7, 0.1, Math.sin(a) * 0.7);
      logs.add(s);
    }
    logs.position.set(x, y, z);
    logs.traverse((o) => (o.castShadow = true));
    this.group.add(logs);
    const light = new THREE.PointLight(0xff7a1a, 12, 9);
    light.position.set(x, y + 1.4, z);
    this.group.add(light);
    this.barrelFlames.push(new THREE.Vector3(x, y + 0.5, z));
  }

  // --------------------------------------------------- Chatterjaw Landing
  private buildChatterjaw(d: DistrictDef): void {
    const rng = mulberry32(2101);
    // frozen shacks ring the landing
    this.shack(-14, 88, 1.1, rng);
    this.shack(14, 90, -1.2, rng);
    this.shack(-16, 70, 1.9, rng);
    // icicles under every roofline read wintry without new geometry systems
    const iceMat = toonMat({ color: 0xbfe9f5 });
    for (const [x, z] of [[-14, 88], [14, 90], [-16, 70]] as const) {
      for (let i = 0; i < 5; i++) {
        const ice = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.4 + rng() * 0.5, 5), iceMat);
        ice.position.set(x + (rng() - 0.5) * 4, terrainHeight(x, z) + 3.1, z + (rng() - 0.5) * 3);
        ice.rotation.x = Math.PI;
        this.group.add(ice);
      }
    }
    // Zaza's caravan: a rounded wagon with a glowing crystal sign
    const caravan = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(1.5, 3.2, 4, 10), toonMat({ color: 0xffffff, map: swatch('#5a2a6a', 80) }));
    body.rotation.z = Math.PI / 2;
    body.position.y = 1.9;
    const wheelMat = toonMat({ color: 0x3a3632 });
    for (const [wx, wz] of [[-1.4, 1.1], [1.4, 1.1], [-1.4, -1.1], [1.4, -1.1]] as const) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.2, 10), wheelMat);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(wx, 0.55, wz);
      caravan.add(wheel);
    }
    const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 1, 6), wheelMat);
    chimney.position.set(-0.8, 3.4, 0);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 10), glowMat(0xc06bff, 0.9));
    orb.position.set(1.6, 3.2, 0);
    orb.name = 'blinker';
    const sign = World.textSign(2.4, 1.2, { lines: ['ZAZA\u2019S', 'WINTER', 'WONDERS'], style: 'ad', bg: '#5a2a6a', fg: '#ffd23c', accent: '#ff5a86' });
    sign.position.set(0, 2.2, 1.55);
    caravan.add(body, chimney, orb, sign);
    caravan.position.set(7, terrainHeight(7, 66), 66);
    caravan.rotation.y = 0.5;
    caravan.traverse((o) => (o.castShadow = true));
    this.group.add(caravan);
    this.staticTargets.push(caravan);
    this.addCollider(7, 66, 2.6, 1.8);

    this.campfire(-4, 82);
    this.campfire(9, 92);
    this.junkPiles(rng, 0, 84, 20, 4);
    for (let i = 0; i < 8; i++) this.pine(d.cx + (rng() - 0.5) * 50, d.cz + (rng() - 0.5) * 40, 0.8 + rng() * 0.6);
    this.poster(-13.2, 88, 1.1 + Math.PI / 2, 4);
    this.graffiti(13, 88.5, -1.2 + Math.PI, 3);
  }

  // --------------------------------------------------- The Pinebreak
  private buildPinebreak(d: DistrictDef): void {
    const rng = mulberry32(3141);
    // the forest itself
    for (let i = 0; i < 46; i++) {
      const a = rng() * Math.PI * 2;
      const r = 6 + rng() * d.radius * 0.9;
      this.pine(d.cx + Math.cos(a) * r, d.cz + Math.sin(a) * r, 0.7 + rng() * 1.1);
    }
    // frostborn camp: tents (canvas cones) + campfires + totems
    const tentMat = toonMat({ color: 0x7a8a9a, map: swatch('#6a7a8a', 70) });
    for (const [x, z] of [[d.cx + 8, d.cz - 6], [d.cx + 13, d.cz + 2], [d.cx + 4, d.cz + 6]] as const) {
      const tent = new THREE.Mesh(new THREE.ConeGeometry(1.8, 2.6, 6), tentMat);
      tent.position.set(x, terrainHeight(x, z) + 1.2, z);
      tent.castShadow = true;
      this.group.add(tent);
      this.staticTargets.push(tent);
      this.addCollider(x, z, 1.5, 1.5);
    }
    this.campfire(d.cx + 8, d.cz);
    this.campfire(d.cx - 16, d.cz + 14);
    // totem: stacked skull-boxes crowned with antlers
    const boneMat = toonMat({ color: 0xd8ccb4 });
    const totem = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const skull = new THREE.Mesh(new THREE.BoxGeometry(0.7 - i * 0.12, 0.6, 0.6), boneMat);
      skull.position.y = 0.4 + i * 0.62;
      skull.rotation.y = (rng() - 0.5) * 0.6;
      totem.add(skull);
    }
    const antler = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 5, 8, Math.PI), boneMat);
    antler.position.y = 2.3;
    totem.add(antler);
    totem.position.set(d.cx - 4, terrainHeight(d.cx - 4, d.cz - 12), d.cz - 12);
    totem.traverse((o) => (o.castShadow = true));
    this.group.add(totem);
    this.staticTargets.push(totem);
    this.explosiveBarrel(d.cx + 18, d.cz - 10);
    this.explosiveBarrel(d.cx - 10, d.cz + 20);
    this.poster(d.cx + 12.5, d.cz + 2, Math.PI / 2, 2);
  }

  // --------------------------------------------------- The Frozen Fathom
  private buildFathom(d: DistrictDef): void {
    const rng = mulberry32(2718);
    const lake = WORLD.terrain.lake;
    if (lake) {
      // the ice sheet: pale disc with painted cracks, faint glow beneath
      const iceTex = groundTexture('#cfe4f0', '#ffffff', '#9fc4d8', 'rgba(70,110,150,0.7)');
      iceTex.repeat.set(6, 6);
      const ice = new THREE.Mesh(new THREE.CircleGeometry(lake.r, 36), toonMat({ map: iceTex, rim: 0.4 }));
      ice.rotation.x = -Math.PI / 2;
      ice.position.set(lake.x, lake.level + 0.06, lake.z);
      ice.receiveShadow = true;
      this.group.add(ice);
      // something vast, frozen mid-swim beneath the ice
      const shadow = new THREE.Mesh(new THREE.CapsuleGeometry(3, 14, 4, 8),
        new THREE.MeshBasicMaterial({ color: 0x2a4a5a, transparent: true, opacity: 0.35 }));
      shadow.rotation.z = Math.PI / 2;
      shadow.rotation.y = 0.7;
      shadow.position.set(lake.x - 4, lake.level - 1.2, lake.z + 3);
      shadow.layers.set(FX_LAYER);
      this.group.add(shadow);
      // frozen-in-place fishing shacks
      for (const [x, z] of [[lake.x - 10, lake.z - 8], [lake.x + 12, lake.z + 6]] as const) {
        this.shack(x, z, rng() * Math.PI, rng);
      }
      // ice spikes bursting from the sheet
      const iceMat = toonMat({ color: 0xbfe9f5 });
      for (let i = 0; i < 9; i++) {
        const a = rng() * Math.PI * 2;
        const r = rng() * lake.r * 0.8;
        const x = lake.x + Math.cos(a) * r, z = lake.z + Math.sin(a) * r;
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.4 + rng() * 0.5, 1.5 + rng() * 2.5, 6), iceMat);
        spike.position.set(x, lake.level + 0.6, z);
        spike.rotation.z = (rng() - 0.5) * 0.4;
        spike.castShadow = true;
        this.group.add(spike);
        this.staticTargets.push(spike);
        this.addCollider(x, z, 0.6, 0.6);
      }
    }
    for (let i = 0; i < 10; i++) {
      const a = rng() * Math.PI * 2;
      const r = d.radius * (0.85 + rng() * 0.2);
      this.pine(d.cx + Math.cos(a) * r, d.cz + Math.sin(a) * r, 0.7 + rng() * 0.8);
    }
    this.campfire(d.cx - 24, d.cz + 12);
    this.explosiveBarrel(d.cx + 6, d.cz + 22);
  }

  // --------------------------------------------------- The Icebox
  private buildIcebox(d: DistrictDef): void {
    const rng = mulberry32(1618);
    const iceMat = toonMat({ color: 0xbfe9f5 });
    // ring of glacial shards around the Old Man's court
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const r = 20 + rng() * 8;
      const x = d.cx + Math.cos(a) * r, z = d.cz + Math.sin(a) * r;
      const shard = new THREE.Mesh(new THREE.ConeGeometry(1.6 + rng() * 1.6, 5 + rng() * 6, 5), iceMat);
      shard.position.set(x, terrainHeight(x, z) + 2, z);
      shard.rotation.z = (rng() - 0.5) * 0.35;
      shard.castShadow = true;
      this.group.add(shard);
      this.staticTargets.push(shard);
      this.addCollider(x, z, 1.6, 1.6);
    }
    // the Old Man's "bed": a snow mound with hiker gear frozen around it
    const mound = new THREE.Mesh(new THREE.SphereGeometry(5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), toonMat({ color: 0xf0f6fa }));
    mound.position.set(d.cx, terrainHeight(d.cx, d.cz - 6), d.cz - 6);
    mound.receiveShadow = true;
    this.group.add(mound);
    const gearMat = toonMat({ color: 0xb43a2a });
    for (let i = 0; i < 4; i++) {
      const pack = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.3), gearMat);
      const a = rng() * Math.PI * 2;
      pack.position.set(d.cx + Math.cos(a) * 8, terrainHeight(d.cx, d.cz) + 0.35, d.cz + Math.sin(a) * 8);
      pack.rotation.set(rng(), rng() * 3, rng());
      this.group.add(pack);
    }
    this.campfire(d.cx + 8, d.cz + 12);
    for (let i = 0; i < 6; i++) this.pine(d.cx + (rng() - 0.5) * 56, d.cz + 18 + rng() * 10, 0.8 + rng() * 0.7);
    this.explosiveBarrel(d.cx - 10, d.cz + 4);
    this.explosiveBarrel(d.cx + 12, d.cz - 2);
  }

  // --------------------------------------------------- Madame Zaza (NPC)
  private buildZaza(poi: WorldPoi): void {
    const y = terrainHeight(poi.x, poi.z);
    const q = new THREE.Group();
    const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.1, 8), toonMat({ color: 0x5a2a6a, map: swatch('#4e2460', 60) }));
    skirt.position.y = 0.55;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.6, 0.32), toonMat({ color: 0x8a3a7a }));
    torso.position.y = 1.35;
    const shawl = new THREE.Mesh(new THREE.ConeGeometry(0.46, 0.5, 8), toonMat({ color: 0xffd23c }));
    shawl.position.y = 1.62;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.32, 0.3), toonMat({ color: 0xc89878 }));
    head.position.y = 1.9;
    const turban = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), toonMat({ color: 0xc06bff }));
    turban.position.y = 2.12;
    const jewel = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), glowMat(0xff5a86, 1));
    jewel.position.set(0, 2.14, 0.2);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), glowMat(0xc06bff, 0.85));
    orb.position.set(0.42, 1.35, 0.24);
    const marker = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 4), glowMat(0xffd23c, 0.95));
    marker.position.y = 2.6;
    marker.rotation.x = Math.PI;
    marker.name = 'quest_marker';
    q.add(skirt, torso, shawl, head, turban, jewel, orb, marker);
    q.position.set(poi.x, y, poi.z);
    q.rotation.y = poi.rot ?? 0;
    q.traverse((o) => (o.castShadow = true));
    q.name = 'zaza';
    this.group.add(q);
    this.zaza = q;
    this.addCollider(poi.x, poi.z, 0.5, 0.5);
    this.interactables.push({
      kind: 'npc',
      pos: new THREE.Vector3(poi.x, y, poi.z),
      label: 'TALK TO MADAME ZAZA',
      data: poi.data,
    });
  }

  /** Shared shack builder used by hub + gully. */
  private shack(x: number, z: number, rot: number, rng: Rng, big = false): void {
    const corru = corrugatedTexture();
    const wallMat = toonMat({ map: corru });
    const darkMat = toonMat({ color: 0x4a4440, map: swatch('#4a4440', 70) });
    const woodMat = toonMat({ color: 0x8a6a42, map: swatch('#7a5a36', 80) });
    const y = terrainHeight(x, z);
    const shack = new THREE.Group();
    const w = (big ? 7 : 5) + rng() * 3, d = (big ? 6 : 4) + rng() * 2, h = 3 + rng() * 1.2;
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
    for (let i = 0; i < 5; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.9 + rng() * 0.6, 5), darkMat);
      spike.position.set((i / 4 - 0.5) * w, h + 0.7, -d / 2);
      spike.rotation.z = (rng() - 0.5) * 0.3;
      shack.add(spike);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.18, h * 1.1, 0.18), woodMat);
    beam.position.set(w / 2 - 0.2, h * 0.55, d / 2 - 0.2);
    beam.rotation.x = -0.15;
    shack.add(beam);
    shack.position.set(x, y, z);
    shack.rotation.y = rot;
    shack.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
    this.group.add(shack);
    this.staticTargets.push(shack);
    this.addCollider(x, z, w / 2 + 0.4, d / 2 + 0.4);
  }

  private junkPiles(rng: Rng, cx: number, cz: number, radius: number, count: number): void {
    const wallMat = toonMat({ map: corrugatedTexture() });
    const darkMat = toonMat({ color: 0x4a4440, map: swatch('#4a4440', 70) });
    const woodMat = toonMat({ color: 0x8a6a42, map: swatch('#7a5a36', 80) });
    for (let i = 0; i < count; i++) {
      const a = rng() * Math.PI * 2;
      const r = rng() * radius * 0.85;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (!this.clearOfExits(x, z)) continue;
      const y = terrainHeight(x, z);
      const pile = new THREE.Group();
      const kind = rng();
      if (kind < 0.4) {
        for (let j = 0; j < 4; j++) {
          const junk = new THREE.Mesh(new THREE.BoxGeometry(0.5 + rng(), 0.3 + rng() * 0.6, 0.5 + rng()), rng() > 0.5 ? darkMat : wallMat);
          junk.position.set((rng() - 0.5) * 1.4, 0.3 + j * 0.25, (rng() - 0.5) * 1.4);
          junk.rotation.set(rng() * 0.6, rng() * Math.PI, rng() * 0.4);
          pile.add(junk);
        }
        this.addCollider(x, z, 1.1, 1.1);
      } else if (kind < 0.7) {
        for (let j = 0; j < 2 + Math.floor(rng() * 2); j++) {
          const crate = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), woodMat);
          crate.position.set((rng() - 0.5) * 0.5, 0.55 + j * 1.1, (rng() - 0.5) * 0.5);
          crate.rotation.y = rng() * 0.8;
          pile.add(crate);
        }
        this.addCollider(x, z, 0.9, 0.9);
      } else {
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
      pile.position.set(x, y, z);
      pile.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
      this.group.add(pile);
      this.staticTargets.push(pile);
    }
  }

  private fireBarrel(x: number, z: number): void {
    const y = terrainHeight(x, z);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.1, 10), toonMat({ color: 0x7a4a28, map: swatch('#6a3f22', 90) }));
    barrel.position.set(x, y + 0.55, z);
    barrel.castShadow = true;
    this.group.add(barrel);
    this.staticTargets.push(barrel);
    this.addCollider(x, z, 0.5, 0.5);
    const light = new THREE.PointLight(0xff7a1a, 12, 9);
    light.position.set(x, y + 1.6, z);
    this.group.add(light);
    this.barrelFlames.push(new THREE.Vector3(x, y + 1.15, z));
  }

  private explosiveBarrel(x: number, z: number): void {
    const b = new ExplosiveBarrel(x, z);
    this.group.add(b.group);
    this.barrels.push(b);
  }

  /** Aspect-correct text plane; twoSided adds a mirrored-back copy so text never reads reversed. */
  private static textSign(w: number, h: number, spec: Parameters<typeof posterTexture>[0], opts: { transparent?: boolean; opacity?: number; twoSided?: boolean } = {}): THREE.Object3D {
    const mat = new THREE.MeshBasicMaterial({ map: posterTexture(spec, w / h), transparent: opts.transparent, opacity: opts.opacity ?? 1 });
    const front = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    if (!opts.twoSided) return front;
    const g = new THREE.Group();
    const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    back.rotation.y = Math.PI;
    front.position.z = 0.012;
    back.position.z = -0.012;
    g.add(front, back);
    return g;
  }

  private poster(x: number, z: number, ry: number, idx: number, y?: number): void {
    const spec = POSTERS[idx % POSTERS.length];
    const poster = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.9),
      new THREE.MeshBasicMaterial({ map: posterTexture(spec, 1.5 / 1.9) }));
    poster.position.set(x, (y ?? terrainHeight(x, z) + 1.7), z);
    poster.rotation.y = ry;
    poster.rotation.z = (idx % 2 === 0 ? 1 : -1) * 0.04;
    this.group.add(poster);
  }

  private graffiti(x: number, z: number, ry: number, idx: number): void {
    const spec = GRAFFITI[idx % GRAFFITI.length];
    const tex = posterTexture({ ...spec, bg: '#00000000' }, 2.2 / 2.6);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.92 });
    const tag = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.6), mat);
    tag.position.set(x, terrainHeight(x, z) + 1.3, z);
    tag.rotation.y = ry;
    tag.rotation.z = (idx % 2 ? -1 : 1) * 0.08;
    this.group.add(tag);
  }

  // --------------------------------------------------- Gutterlight (hub)
  private buildGutterlight(): void {
    const rng = mulberry32(101);
    // town wall of shacks around the plaza
    this.shack(-16, 92, 1.2, rng, true);
    this.shack(16, 94, -1.3, rng, true);
    this.shack(-12, 108, 0.3, rng);
    this.shack(13, 108, -0.4, rng);
    this.shack(-20, 78, 1.8, rng);
    // string lights: catenary of small glow bulbs across the plaza
    for (let s = 0; s < 3; s++) {
      const from = new THREE.Vector3(-14 + s * 4, 4.6, 86 + s * 8);
      const to = new THREE.Vector3(14 - s * 3, 4.2, 90 + s * 7);
      for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        const p = from.clone().lerp(to, t);
        p.y -= Math.sin(t * Math.PI) * 1.1;
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6),
          glowMat([0xffd23c, 0xff5a86, 0x54d4ff][i % 3], 0.95));
        bulb.position.copy(p);
        bulb.layers.set(FX_LAYER);
        this.group.add(bulb);
      }
    }
    this.fireBarrel(-6, 96);
    this.fireBarrel(9, 79);
    this.junkPiles(rng, 0, 95, 26, 6);
    this.poster(-15.2, 92, 1.2 + Math.PI / 2, 3);
    this.poster(15.2, 94, -1.3 - Math.PI / 2, 4);
    this.graffiti(-11, 106.8, 0.3, 3);
    // town sign arch
    const woodMat = toonMat({ color: 0x8a6a42, map: swatch('#7a5a36', 80) });
    const postL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 5, 0.3), woodMat);
    postL.position.set(-4, terrainHeight(-4, 70) + 2.5, 70);
    const postR = postL.clone(); postR.position.x = 4;
    const banner = World.textSign(9, 1.6, { lines: ['GUTTERLIGHT'], style: 'propaganda', bg: '#3a4a5a', fg: '#f2e4c4' }, { twoSided: true });
    banner.position.set(0, terrainHeight(0, 70) + 4.6, 70);
    this.group.add(postL, postR, banner);
    this.staticTargets.push(postL, postR);
  }

  // --------------------------------------------------- Gully Seven
  private buildGully(): void {
    const rng = mulberry32(9001);
    this.shack(-24, -8, 0.4, rng);
    this.shack(20, -12, -0.7, rng);
    this.shack(-18, 24, 2.2, rng);
    this.shack(28, 18, 1.4, rng);
    this.shack(2, -18, 0.1, rng);
    this.junkPiles(rng, 0, 5, 40, 14);
    this.fireBarrel(-10, 16);
    this.fireBarrel(14, 2);
    this.fireBarrel(-26, -20);
    this.explosiveBarrel(8, -8);
    this.explosiveBarrel(-14, -2);
    this.explosiveBarrel(24, 6);
    this.poster(-23, -5.4, 0.4, 0);
    this.poster(21, -9.6, -0.7, 1);
    this.poster(3, -15.6, 0.1, 2);
    this.graffiti(-17, 25.5, 2.2 + Math.PI, 0);
    this.graffiti(27, 19.5, 1.4 + Math.PI, 1);
    this.graffiti(1, -16.4, 0.1, 2);

    // watchtowers
    const woodMat = toonMat({ color: 0x8a6a42, map: swatch('#7a5a36', 80) });
    const darkMat = toonMat({ color: 0x4a4440 });
    for (const [x, z] of [[-34, 4], [34, -6]] as const) {
      const y = terrainHeight(x, z);
      const tower = new THREE.Group();
      for (let i = 0; i < 4; i++) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 6, 0.22), woodMat);
        leg.position.set((i % 2 ? 1 : -1) * 0.9, 3, (i < 2 ? 1 : -1) * 0.9);
        leg.rotation.z = (i % 2 ? -1 : 1) * 0.06;
        tower.add(leg);
      }
      const deck = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.2, 2.6), woodMat);
      deck.position.y = 6;
      const rail = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.6, 0.12), darkMat);
      rail.position.set(0, 6.5, 1.3);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(2.2, 1.2, 4), darkMat);
      roof.position.y = 7.8;
      tower.add(deck, rail, roof);
      tower.position.set(x, y, z);
      tower.traverse((o) => (o.castShadow = true));
      this.group.add(tower);
      this.staticTargets.push(tower);
      this.addCollider(x, z, 1.2, 1.2);
    }

    // the unlucky previous visitor
    const bones = new THREE.Group();
    const boneMat = toonMat({ color: 0xd8ccb4 });
    const skull = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.28, 0.32), boneMat);
    skull.position.set(0, 0.16, 0);
    const ribs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.7), boneMat);
    ribs.position.set(0.1, 0.1, 0.6);
    const sign = World.textSign(0.9, 0.5, { lines: ['TAXED'], style: 'graffiti', bg: '#00000000', fg: '#f2e4c4', accent: '#241a10' }, { transparent: true });
    sign.position.set(0, 0.7, -0.3);
    sign.rotation.x = -0.4;
    bones.add(skull, ribs, sign);
    bones.position.set(-33, terrainHeight(-33, 19), 19);
    this.group.add(bones);
  }

  // --------------------------------------------------- The Boneyard
  private buildBoneyard(): void {
    const rng = mulberry32(404);
    const boneMat = toonMat({ color: 0xd8ccb4, map: swatch('#cfc2a8', 60) });
    const cx = -85, cz = -20;
    // colossal ribcage: arcs along a spine
    for (let i = 0; i < 7; i++) {
      const t = i / 6;
      const x = cx - 24 + t * 48;
      const z = cz + Math.sin(t * 2.2) * 6;
      const r = 7 - Math.abs(t - 0.45) * 8;
      if (r < 2.5) continue;
      const rib = new THREE.Mesh(new THREE.TorusGeometry(r, 0.55, 6, 14, Math.PI), boneMat);
      const y = terrainHeight(x, z);
      rib.position.set(x, y, z);
      rib.rotation.y = Math.PI / 2 + (rng() - 0.5) * 0.25;
      rib.rotation.z = (rng() - 0.5) * 0.15;
      rib.castShadow = true;
      this.group.add(rib);
      this.staticTargets.push(rib);
      this.addCollider(x, z - r, 1, 1);
      this.addCollider(x, z + r, 1, 1);
    }
    // skull: giant blocky head half-buried
    const skull = new THREE.Group();
    const cranium = new THREE.Mesh(new THREE.BoxGeometry(9, 6.5, 8), boneMat);
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(7, 2, 6), boneMat);
    jaw.position.set(0, -3.4, -2);
    const eyeL = new THREE.Mesh(new THREE.CircleGeometry(1.1, 10), toonMat({ color: 0x181410 }));
    eyeL.position.set(-2.2, 0.6, 4.02);
    const eyeR = eyeL.clone(); eyeR.position.x = 2.2;
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 8), glowMat(0x7dff2a, 0.9));
    glow.position.set(-2.2, 0.6, 3.8);
    skull.add(cranium, jaw, eyeL, eyeR, glow);
    const sx = cx - 34, sz = cz - 2;
    skull.position.set(sx, terrainHeight(sx, sz) + 1.6, sz);
    skull.rotation.y = 0.5;
    skull.traverse((o) => (o.castShadow = true));
    this.group.add(skull);
    this.staticTargets.push(skull);
    this.addCollider(sx, sz, 5, 4.5);

    // grave markers inside the ribcage ("for the upgrade")
    const woodMat = toonMat({ color: 0x6a5138 });
    for (let i = 0; i < 10; i++) {
      const x = cx - 18 + rng() * 36, z = cz - 6 + rng() * 12;
      const y = terrainHeight(x, z);
      const mound = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), toonMat({ color: 0x7a5a38 }));
      mound.position.set(x, y, z);
      const marker = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.08), woodMat);
      marker.position.set(x, y + 0.5, z - 0.5);
      marker.rotation.z = (rng() - 0.5) * 0.4;
      this.group.add(mound, marker);
    }
    this.fireBarrel(cx + 12, cz + 10);
    this.explosiveBarrel(cx - 6, cz + 6);
    this.junkPiles(rng, cx, cz, 26, 5);

    // cacti
    const cactusMat = toonMat({ color: 0x4a7a3a, map: swatch('#437536', 50) });
    for (let i = 0; i < 8; i++) {
      const x = cx + (rng() - 0.5) * 70, z = cz + (rng() - 0.5) * 60;
      const y = terrainHeight(x, z);
      const c = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 2.4 + rng() * 1.4, 8), cactusMat);
      trunk.position.y = 1.2;
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 1.1, 8), cactusMat);
      arm.position.set(0.55, 1.6, 0);
      arm.rotation.z = -0.5;
      c.add(trunk, arm);
      c.position.set(x, y, z);
      c.traverse((o) => (o.castShadow = true));
      this.group.add(c);
      this.staticTargets.push(c);
      this.addCollider(x, z, 0.4, 0.4);
    }
  }

  // --------------------------------------------------- The Slagflats
  private buildSlagflats(): void {
    const rng = mulberry32(707);
    const cx = 85, cz = -25;
    const hullMat = toonMat({ color: 0xe8e4da, map: swatch('#d8d4ca', 60) });
    const teal = toonMat({ color: 0x2ba8a0 });
    const darkMat = toonMat({ color: 0x3a3a3a });

    // crashed hauler: big tilted hull + broken ring engine
    const hauler = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(20, 6, 9), hullMat);
    hull.rotation.z = 0.22;
    hull.position.y = 2.4;
    const nose = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 4.5, 6, 8), hullMat);
    nose.rotation.z = Math.PI / 2 - 0.22;
    nose.position.set(-12, 1.6, 0);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(6, 5, 0.5), teal);
    fin.position.set(8, 6.5, 0);
    fin.rotation.z = 0.4;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(20.2, 1, 9.2), teal);
    stripe.rotation.z = 0.22;
    stripe.position.y = 3.4;
    const logo = World.textSign(4, 4, { lines: ['HELIX', 'HX-77'], style: 'warning', bg: '#e8e4da', fg: '#1a1a1a', accent: '#2ba8a0' });
    logo.position.set(2, 3.2, 4.72);
    logo.rotation.z = -0.22;
    hauler.add(hull, nose, fin, stripe, logo);
    const hx = cx - 6, hz = cz + 14;
    hauler.position.set(hx, terrainHeight(hx, hz), hz);
    hauler.rotation.y = -0.5;
    hauler.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
    this.group.add(hauler);
    this.staticTargets.push(hauler);
    this.addCollider(hx, hz, 11, 6);

    // broken ring engine, half-buried
    const ring = new THREE.Mesh(new THREE.TorusGeometry(5, 1, 8, 20, Math.PI * 1.35), hullMat);
    const rx = cx + 16, rz = cz - 8;
    ring.position.set(rx, terrainHeight(rx, rz) + 0.5, rz);
    ring.rotation.set(0.3, 0.8, 2.6);
    ring.castShadow = true;
    this.group.add(ring);
    this.staticTargets.push(ring);
    this.addCollider(rx, rz, 4, 4);

    // glowing slag pools
    for (let i = 0; i < 6; i++) {
      const x = cx + (rng() - 0.5) * 50, z = cz + (rng() - 0.5) * 44;
      const pool = new THREE.Mesh(new THREE.CircleGeometry(1.2 + rng() * 1.8, 12), glowMat(0xff8438, 0.55));
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(x, terrainHeight(x, z) + 0.04, z);
      pool.layers.set(FX_LAYER);
      this.group.add(pool);
      const light = new THREE.PointLight(0xff7a1a, 8, 7);
      light.position.set(x, terrainHeight(x, z) + 1, z);
      this.group.add(light);
    }

    // white helix cargo crates
    for (let i = 0; i < 9; i++) {
      const x = cx + (rng() - 0.5) * 46, z = cz + (rng() - 0.5) * 40;
      const y = terrainHeight(x, z);
      const crate = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), hullMat);
      crate.position.set(x, y + 0.7, z);
      crate.rotation.y = rng() * Math.PI;
      const tealStripe = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.3, 1.45), teal);
      tealStripe.position.y = 0.3;
      crate.add(tealStripe);
      crate.castShadow = true;
      this.group.add(crate);
      this.staticTargets.push(crate);
      this.addCollider(x, z, 0.9, 0.9);
    }
    // antenna
    const mastX = cx + 4, mastZ = cz - 20;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 9, 6), darkMat);
    mast.position.set(mastX, terrainHeight(mastX, mastZ) + 4.5, mastZ);
    const dish = new THREE.Mesh(new THREE.SphereGeometry(1.2, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), hullMat);
    dish.position.set(mastX, terrainHeight(mastX, mastZ) + 8.6, mastZ);
    dish.rotation.x = 1.2;
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 6), glowMat(0xff3030, 1));
    beacon.position.set(mastX, terrainHeight(mastX, mastZ) + 9.2, mastZ);
    beacon.layers.set(FX_LAYER);
    beacon.name = 'blinker';
    this.group.add(mast, dish, beacon);
    this.staticTargets.push(mast);
    this.explosiveBarrel(cx - 14, cz - 6);
    this.explosiveBarrel(cx + 22, cz + 4);
  }

  // --------------------------------------------------- Trash Mountain
  private buildTrashMountain(): void {
    const rng = mulberry32(666);
    const cx = 0, cz = -95;
    const darkMat = toonMat({ color: 0x4a4440, map: swatch('#4a4440', 70) });
    const wallMat = toonMat({ map: corrugatedTexture() });

    // trash heaps ringing the court
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const r = 22 + rng() * 8;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      const y = terrainHeight(x, z);
      const heap = new THREE.Mesh(new THREE.ConeGeometry(3 + rng() * 3, 4 + rng() * 5, 7), rng() > 0.5 ? darkMat : wallMat);
      heap.position.set(x, y + 1.5, z);
      heap.rotation.y = rng() * Math.PI;
      heap.castShadow = true;
      this.group.add(heap);
      this.staticTargets.push(heap);
      this.addCollider(x, z, 2.4, 2.4);
    }

    // the throne: hubcap crown on a junk chair on a dais
    const throne = new THREE.Group();
    const dais = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 5.5, 1.2, 8), darkMat);
    dais.position.y = 0.6;
    const seatBack = new THREE.Mesh(new THREE.BoxGeometry(2.4, 4.5, 0.5), wallMat);
    seatBack.position.set(0, 3.4, -0.9);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 2), wallMat);
    seat.position.y = 1.6;
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.7, 0.7, 8), toonMat({ color: 0xd8b028 }));
    crown.position.set(0, 6, -0.9);
    for (let i = 0; i < 5; i++) {
      const spikeM = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.5, 4), toonMat({ color: 0xd8b028 }));
      const a = (i / 5) * Math.PI * 2;
      spikeM.position.set(Math.cos(a) * 0.7, 6.55, -0.9 + Math.sin(a) * 0.7);
      throne.add(spikeM);
    }
    throne.add(dais, seatBack, seat, crown);
    throne.position.set(cx, terrainHeight(cx, cz - 8), cz - 8);
    throne.traverse((o) => (o.castShadow = true));
    this.group.add(throne);
    this.staticTargets.push(throne);
    this.addCollider(cx, cz - 8, 3, 3);

    // banners on poles
    for (const [x, z] of [[cx - 8, cz + 4], [cx + 8, cz + 4]] as const) {
      const y = terrainHeight(x, z);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 6, 6), darkMat);
      pole.position.set(x, y + 3, z);
      const flag = World.textSign(1.6, 2.2, { lines: ['OBEY', 'THE DUKE'], style: 'propaganda', bg: '#8a2f24', fg: '#f2e4c4' }, { twoSided: true });
      flag.position.set(x + 0.85, y + 4.8, z);
      this.group.add(pole, flag);
      this.staticTargets.push(pole);
    }
    this.fireBarrel(cx - 5, cz + 8);
    this.fireBarrel(cx + 5, cz + 8);
    this.explosiveBarrel(cx - 10, cz - 2);
    this.explosiveBarrel(cx + 12, cz);
  }

  // ------------------------------------------------------------------ POIs
  private buildPois(): void {
    for (const poi of WORLD.pois) {
      switch (poi.kind) {
        case 'chest': this.buildChest(poi); break;
        case 'vendor_gun': this.buildVendor(poi, true); break;
        case 'vendor_med': this.buildVendor(poi, false); break;
        case 'fast_travel': this.buildFastTravel(poi); break;
        case 'wirelog': this.buildWireLog(poi); break;
        case 'npc':
          if (poi.data === 'zaza') this.buildZaza(poi);
          else if (poi.data === 'quibb' || !poi.data) this.buildQuibb(poi);
          else this.buildTownNpc(poi);
          break;
        case 'gate': this.buildGate(poi); break;
        case 'sign': this.buildSign(poi); break;
      }
    }
    this.buildZoneExits();
  }

  private buildChest(poi: WorldPoi): void {
    const y = terrainHeight(poi.x, poi.z);
    const chest = new LootChest(new THREE.Vector3(poi.x, y, poi.z), poi.rot ?? 0);
    this.group.add(chest.group);
    this.chests.push(chest);
    this.staticTargets.push(chest.group);
    this.addCollider(poi.x, poi.z, 0.9, 0.6);
    this.interactables.push({ kind: 'chest', pos: chest.pos, label: 'OPEN WEAPON CHEST', chest });
  }

  private buildVendor(poi: WorldPoi, guns: boolean): void {
    const y = terrainHeight(poi.x, poi.z);
    const v = new THREE.Group();
    const bodyColor = guns ? '#5a2a6a' : '#2a6a5a';
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.4, 1.0), toonMat({ color: 0xffffff, map: swatch(bodyColor, 60) }));
    body.position.y = 1.2;
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(1.3, 1.5),
      new THREE.MeshBasicMaterial({ map: posterTexture(guns
        ? { lines: ['ZAZA’S', 'BANG', 'BANG'], style: 'ad', bg: '#5a2a6a', fg: '#ffd23c', accent: '#ff5a86' }
        : { lines: ['DOC', 'FIZZY', 'JUICE'], style: 'ad', bg: '#2a6a5a', fg: '#eafff4', accent: '#7dff2a' }, 1.3 / 1.5) }),
    );
    face.position.set(0, 1.45, 0.51);
    const marquee = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.3, 1.1), toonMat({ color: guns ? 0xffd23c : 0x7dff2a }));
    marquee.position.y = 2.55;
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), glowMat(guns ? 0xff5a86 : 0x7dff2a, 1));
    glow.position.set(0.6, 2.55, 0.5);
    glow.name = 'blinker';
    v.add(body, face, marquee, glow);
    v.position.set(poi.x, y, poi.z);
    v.rotation.y = poi.rot ?? 0;
    v.traverse((o) => (o.castShadow = true));
    this.group.add(v);
    this.staticTargets.push(v);
    this.addCollider(poi.x, poi.z, 1.0, 0.7);
    this.interactables.push({
      kind: guns ? 'vendor_gun' : 'vendor_med',
      pos: new THREE.Vector3(poi.x, y, poi.z),
      label: guns ? 'BROWSE ZAZA’S BANG-BANG EMPORIUM' : 'USE DOC FIZZY’S MED-O-MAT',
    });
  }

  private buildFastTravel(poi: WorldPoi): void {
    const y = terrainHeight(poi.x, poi.z);
    const ft = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.7, 0.3, 8), toonMat({ color: 0x4a5460, map: swatch('#3f4854', 60) }));
    base.position.y = 0.15;
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.6, 0.4), toonMat({ color: 0x5a646e }));
    pillar.position.set(-1.1, 1.3, 0);
    const ringM = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.06, 8, 24), glowMat(0x54d4ff, 0.9));
    ringM.rotation.x = Math.PI / 2;
    ringM.position.y = 0.35;
    ringM.layers.set(FX_LAYER);
    ringM.name = 'ft_ring';
    ft.add(base, pillar, ringM);
    ft.position.set(poi.x, y, poi.z);
    ft.traverse((o) => (o.castShadow = true));
    this.group.add(ft);
    this.staticTargets.push(ft);
    this.interactables.push({
      kind: 'fast_travel',
      pos: new THREE.Vector3(poi.x, y, poi.z),
      label: `RE-CONSTRUCTOR: ${poi.data ?? 'STATION'}`,
      data: poi.data,
    });
  }

  private buildWireLog(poi: WorldPoi): void {
    const y = terrainHeight(poi.x, poi.z);
    const log = new THREE.Group();
    const spool = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.22, 10), toonMat({ color: 0xd8b028 }));
    spool.position.y = 0.5;
    spool.rotation.z = Math.PI / 2;
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), glowMat(0x38c8ff, 1));
    glow.position.y = 0.5;
    glow.name = 'blinker';
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.1), toonMat({ color: 0x5a4a3a }));
    post.position.y = 0.25;
    log.add(post, spool, glow);
    log.position.set(poi.x, y, poi.z);
    this.group.add(log);
    this.interactables.push({
      kind: 'wirelog',
      pos: new THREE.Vector3(poi.x, y, poi.z),
      label: 'PLAY WIRE SPOOL',
      data: poi.data,
    });
  }

  /** Named townsfolk (Brasshaven givers): distinct palette per character. */
  private buildTownNpc(poi: WorldPoi): void {
    const looks: Record<string, { coat: number; skin: number; hat: number; hatKind: 'top' | 'hood' | 'cap'; accent: number; label: string }> = {
      mayor: { coat: 0x8a6a1a, skin: 0xc89878, hat: 0x2a2622, hatKind: 'top', accent: 0xffd23c, label: 'TALK TO MAYOR BRASS' },
      brann: { coat: 0x2ba8a0, skin: 0xb08868, hat: 0x4a4442, hatKind: 'cap', accent: 0x7dffef, label: 'TALK TO BRANN' },
      mirelle: { coat: 0x4a6a8a, skin: 0xd8b090, hat: 0x8a94a0, hatKind: 'hood', accent: 0x9ad8e8, label: 'TALK TO MIRELLE' },
      okto: { coat: 0xe8e0cc, skin: 0x9a7858, hat: 0xe8e0cc, hatKind: 'hood', accent: 0xffb43c, label: 'TALK TO BROTHER OKTO' },
    };
    const look = looks[poi.data ?? ''] ?? looks.brann;
    const y = terrainHeight(poi.x, poi.z);
    const g = new THREE.Group();
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.7, 0.3), toonMat({ color: 0x3a3632 }));
    legs.position.y = 0.35;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.66, 0.34), toonMat({ color: look.coat }));
    torso.position.y = 1.06;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.32, 0.3), toonMat({ color: look.skin }));
    head.position.y = 1.6;
    g.add(legs, torso, head);
    if (look.hatKind === 'top') {
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.04, 10), toonMat({ color: look.hat }));
      brim.position.y = 1.78;
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.18, 0.34, 10), toonMat({ color: look.hat }));
      crown.position.y = 1.96;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.185, 0.185, 0.07, 10), toonMat({ color: look.accent }));
      band.position.y = 1.85;
      g.add(brim, crown, band);
    } else if (look.hatKind === 'hood') {
      const hood = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.42, 8), toonMat({ color: look.hat }));
      hood.position.y = 1.86;
      g.add(hood);
    } else {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 0.34), toonMat({ color: look.hat }));
      cap.position.y = 1.8;
      g.add(cap);
    }
    const pin = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), glowMat(look.accent, 1));
    pin.position.set(0.18, 1.24, 0.18);
    const marker = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 4), glowMat(0xc06bff, 0.95));
    marker.position.y = 2.35;
    marker.rotation.x = Math.PI;
    marker.name = 'quest_marker';
    g.add(pin, marker);
    g.position.set(poi.x, y, poi.z);
    g.rotation.y = poi.rot ?? 0;
    g.traverse((o) => (o.castShadow = true));
    this.group.add(g);
    this.addCollider(poi.x, poi.z, 0.5, 0.5);
    this.interactables.push({ kind: 'npc', pos: new THREE.Vector3(poi.x, y, poi.z), label: look.label, data: poi.data });
  }

  /** THE CRUCIBLE — endless-mode fighting pit: scrap bleachers, floodlights,
   *  faction banners, and a scorched center ring. */
  private buildCrucible(d: DistrictDef): void {
    const rng = mulberry32(777);
    const scrapMat = toonMat({ map: corrugatedTexture() });
    const darkMat = toonMat({ color: 0x3a322e, map: swatch('#332c28', 60) });
    // ring of bleacher stands
    const SEGS = 14;
    for (let i = 0; i < SEGS; i++) {
      const a = (i / SEGS) * Math.PI * 2;
      if (Math.abs(Math.sin(a)) < 0.28 && Math.cos(a) > 0) continue; // gap at the north entrance
      const r = 48 + rng() * 3;
      const x = Math.sin(a) * r, z = Math.cos(a) * r;
      const stand = new THREE.Group();
      for (let t = 0; t < 3; t++) {
        const row = new THREE.Mesh(new THREE.BoxGeometry(16, 1.4, 3), t % 2 ? scrapMat : darkMat);
        row.position.set(0, 0.7 + t * 1.5, -t * 2.2);
        stand.add(row);
      }
      stand.position.set(x, terrainHeight(x, z), z);
      stand.rotation.y = a + Math.PI;
      stand.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
      this.group.add(stand);
      this.staticTargets.push(stand);
      this.addCollider(x, z, 8, 4);
    }
    // floodlight pylons
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      const x = Math.sin(a) * 40, z = Math.cos(a) * 40;
      const y = terrainHeight(x, z);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 11, 6), darkMat);
      pole.position.set(x, y + 5.5, z);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), glowMat(0xffe8b0, 1));
      lamp.position.set(x, y + 11, z);
      lamp.name = 'blinker';
      this.group.add(pole, lamp);
      this.staticTargets.push(pole);
      this.addCollider(x, z, 0.4, 0.4);
    }
    // center ring scorch + announcer board
    const ring = new THREE.Mesh(new THREE.RingGeometry(10, 11, 40), toonMat({ color: 0x2a1a12 }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(d.cx, terrainHeight(d.cx, d.cz) + 0.04, d.cz);
    this.group.add(ring);
    const banner = World.textSign(10, 2.2, { lines: ['THE CRUCIBLE'], style: 'propaganda', bg: '#6a1a1a', fg: '#ffd23c', accent: 'rgba(255,220,120,0.2)' }, { twoSided: true });
    banner.position.set(0, terrainHeight(0, 44) + 7, 44);
    this.group.add(banner);
    this.fireBarrel(-14, 30);
    this.fireBarrel(14, 30);
    this.explosiveBarrel(-20, -10);
    this.explosiveBarrel(20, -12);
    this.explosiveBarrel(0, -24);
    for (let i = 0; i < 4; i++) this.junkPiles(rng, d.cx, d.cz, 30, 2);
  }

  /** Zone-exit arch: two posts, a lintel, and the destination on a board. */
  private buildZoneExits(): void {
    for (const ex of WORLD.exits ?? []) {
      const y = terrainHeight(ex.x, ex.z);
      const g = new THREE.Group();
      const postMat = toonMat({ color: 0x5a5248, map: swatch('#4a4440', 70) });
      const postL = new THREE.Mesh(new THREE.BoxGeometry(0.5, 6.4, 0.5), postMat);
      postL.position.set(-4, 3.2, 0);
      const postR = postL.clone(); postR.position.x = 4;
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(9.4, 0.8, 0.7), postMat);
      lintel.position.y = 6;
      const board = World.textSign(7.5, 1.5, { lines: ['→ ' + ex.label + ' →'], style: 'graffiti', bg: '#3a3226', fg: '#f2e4c4', accent: '#241a10' }, { twoSided: true });
      board.position.y = 4.9;
      const lampL = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), glowMat(0x54d4ff, 0.95));
      lampL.position.set(-4, 6.6, 0);
      const lampR = lampL.clone(); lampR.position.x = 4;
      g.add(postL, postR, lintel, board, lampL, lampR);
      // face the map centre so the arch reads on approach
      g.rotation.y = Math.atan2(ex.x, ex.z) + Math.PI / 2 + (Math.abs(ex.x) > Math.abs(ex.z) ? 0 : Math.PI / 2);
      g.position.set(ex.x, y, ex.z);
      g.traverse((o) => (o.castShadow = true));
      this.group.add(g);
      this.staticTargets.push(postL, postR);
    }
  }

  private buildQuibb(poi: WorldPoi): void {
    const y = terrainHeight(poi.x, poi.z);
    const q = new THREE.Group();
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.7, 0.26), toonMat({ color: 0x3a4a5a }));
    legs.position.y = 0.35;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.75, 0.34), toonMat({ color: 0xb8742a, map: swatch('#a8681f', 60) }));
    torso.position.y = 1.05;
    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.5, 0.38), toonMat({ color: 0xd8b028 }));
    vest.position.y = 1.15;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.32, 0.3), toonMat({ color: 0xc89878 }));
    head.position.y = 1.64;
    const hardhat = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.16, 8), toonMat({ color: 0xffd23c }));
    hardhat.position.y = 1.85;
    const beard = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.14, 0.06), toonMat({ color: 0xd8d0c4 }));
    beard.position.set(0, 1.52, 0.16);
    const clipboard = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.32, 0.03), toonMat({ color: 0xe8dcc0 }));
    clipboard.position.set(0.34, 1.1, 0.2);
    clipboard.rotation.x = -0.5;
    const marker = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 4), glowMat(0xffd23c, 0.95));
    marker.position.y = 2.35;
    marker.rotation.x = Math.PI;
    marker.name = 'quest_marker';
    q.add(legs, torso, vest, head, hardhat, beard, clipboard, marker);
    q.position.set(poi.x, y, poi.z);
    q.rotation.y = poi.rot ?? 0;
    q.traverse((o) => (o.castShadow = true));
    q.name = 'quibb';
    this.group.add(q);
    this.quibb = q;
    this.addCollider(poi.x, poi.z, 0.5, 0.5);
    this.interactables.push({
      kind: 'npc',
      pos: new THREE.Vector3(poi.x, y, poi.z),
      label: 'TALK TO FOREMAN QUIBB',
      data: poi.data,
    });
  }

  private buildGate(poi: WorldPoi): void {
    const y = terrainHeight(poi.x, poi.z);
    const g = new THREE.Group();
    const frameMat = toonMat({ color: 0xe8e4da, map: swatch('#d8d4ca', 60) });
    const teal = toonMat({ color: 0x2ba8a0 });
    const postL = new THREE.Mesh(new THREE.BoxGeometry(1.4, 7, 1.4), frameMat);
    postL.position.set(-6, 3.5, 0);
    const postR = postL.clone(); postR.position.x = 6;
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(13.4, 1.2, 1.4), frameMat);
    lintel.position.y = 6.6;
    const door = new THREE.Mesh(new THREE.BoxGeometry(11, 6, 0.6), teal);
    door.position.y = 3;
    door.name = 'gate_door';
    const warning = World.textSign(3, 2, { lines: ['SEALED BY', 'HELIX', 'ORDER 88-C'], style: 'warning', bg: '#d8a828', fg: '#1a1a1a', accent: '#1a1a1a' });
    warning.position.set(0, 3.4, 0.35);
    door.add(warning);
    g.add(postL, postR, lintel, door);
    g.position.set(poi.x, y, poi.z);
    g.rotation.y = poi.rot ?? 0;
    g.traverse((o) => (o.castShadow = true));
    this.group.add(g);
    this.staticTargets.push(g);
    const collider: AABB = { minX: poi.x - 6.8, maxX: poi.x + 6.8, minZ: poi.z - 1, maxZ: poi.z + 1 };
    this.colliders.push(collider);
    this.gate = { group: g, collider, open: false, openT: 0, id: poi.data ?? 'gate' };
  }

  private buildSign(poi: WorldPoi): void {
    const y = terrainHeight(poi.x, poi.z);
    const woodMat = toonMat({ color: 0x8a6a42, map: swatch('#7a5a36', 80) });
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.4, 0.16), woodMat);
    post.position.set(poi.x, y + 1.2, poi.z);
    const board = World.textSign(3.4, 0.8, { lines: [poi.data ?? '???'], style: 'graffiti', bg: '#4a3a26', fg: '#f2e4c4', accent: '#241a10' }, { twoSided: true });
    board.position.set(poi.x, y + 2.1, poi.z);
    board.rotation.y = poi.rot ?? 0;
    board.rotation.z = 0.03;
    this.group.add(post, board);
    this.staticTargets.push(post);
  }

  /** Opens the quest gate with a rumble. */
  openGate(id: string): void {
    if (!this.gate || this.gate.id !== id || this.gate.open) return;
    this.gate.open = true;
    audio.gateOpen();
    const i = this.colliders.indexOf(this.gate.collider);
    if (i >= 0) this.colliders.splice(i, 1);
  }

  get gateOpen(): boolean { return this.gate?.open ?? false; }

  // ------------------------------------------------------------------ critters
  private buildCritters(): void {
    // scrap rats — skittering set dressing in hub & gully
    for (let i = 0; i < 6; i++) {
      const rat = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.34), toonMat({ color: 0x6a5a48 }));
      body.position.y = 0.08;
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.25), toonMat({ color: 0x8a7458 }));
      tail.position.set(0, 0.08, 0.28);
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.08, 4), toonMat({ color: 0x6a5a48 }));
      ear.position.set(0.06, 0.17, -0.12);
      rat.add(body, tail, ear);
      const hubD = WORLD.districts.find((dd) => dd.dress === 'hub' || dd.dress === 'frosthub');
      const secondD = WORLD.districts.find((dd) => dd.dress === 'fort' || dd.dress === 'pinebreak');
      const home = i < 3
        ? new THREE.Vector3(hubD?.cx ?? 0, 0, hubD?.cz ?? 0)
        : new THREE.Vector3(secondD?.cx ?? 0, 0, secondD?.cz ?? 0);
      const x = home.x + (Math.random() - 0.5) * 24;
      const z = home.z + (Math.random() - 0.5) * 24;
      rat.position.set(x, terrainHeight(x, z), z);
      this.group.add(rat);
      this.rats.push({ mesh: rat, vel: new THREE.Vector3(), wanderT: 0, home });
    }
    // vultures — lazy circles over the boneyard & trash mountain
    for (let i = 0; i < 4; i++) {
      const bird = new THREE.Group();
      const wingMat = toonMat({ color: 0x2a2626 });
      const wl = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), wingMat);
      wl.position.x = -0.8; wl.rotation.z = 0.25;
      const wr = wl.clone(); wr.position.x = 0.8; wr.rotation.z = -0.25;
      wingMat.side = THREE.DoubleSide;
      bird.add(wl, wr);
      const spots = WORLD.districts.filter((dd) => dd.dress === 'boneyard' || dd.dress === 'throne' || dd.dress === 'icebox' || dd.dress === 'fathom');
      const over = spots[i % Math.max(1, spots.length)] ? { x: spots[i % spots.length].cx, z: spots[i % spots.length].cz } : { x: 0, z: 0 };
      this.group.add(bird);
      this.vultures.push({
        mesh: bird, angle: Math.random() * Math.PI * 2,
        r: 14 + Math.random() * 10, cx: over.x, cz: over.z,
        h: 22 + Math.random() * 8, speed: 0.25 + Math.random() * 0.15,
      });
    }
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
        pos.x = c.maxX + radius;
      }
    }
  }

  /** Sphere-vs-collider test for projectiles: returns outward push normal. */
  collideSphere(pos: THREE.Vector3, radius: number): THREE.Vector3 | null {
    for (const c of this.colliders) {
      const nx = Math.max(c.minX, Math.min(pos.x, c.maxX));
      const nz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
      const dx = pos.x - nx, dz = pos.z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 < radius * radius) {
        if (d2 < 1e-6) return new THREE.Vector3(1, 0, 0);
        const d = Math.sqrt(d2);
        return new THREE.Vector3(dx / d, 0, dz / d);
      }
    }
    return null;
  }

  /** Raycast props + ray-march the terrain heightfield; nearest hit wins. */
  raycastStatics(ray: THREE.Raycaster): StaticHit | null {
    const hits = ray.intersectObjects(this.staticTargets, true);
    let best: StaticHit | null = null;
    const propHit = hits.find((h) => !(h.object as THREE.Sprite).isSprite);
    if (propHit) {
      const normal = propHit.face
        ? propHit.face.normal.clone().transformDirection(propHit.object.matrixWorld)
        : new THREE.Vector3(0, 1, 0);
      best = { point: propHit.point, distance: propHit.distance, normal };
    }
    // terrain march
    const o = ray.ray.origin, d = ray.ray.direction;
    const maxDist = Math.min(best?.distance ?? 220, 220);
    let t = 0.5;
    let prevT = 0;
    let prevAbove = o.y - terrainHeight(o.x, o.z) > 0;
    while (t < maxDist) {
      const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
      const above = y - terrainHeight(x, z) > 0;
      if (!above && prevAbove) {
        // bisect for precision
        let lo = prevT, hi = t;
        for (let i = 0; i < 6; i++) {
          const mid = (lo + hi) / 2;
          const my = o.y + d.y * mid;
          if (my - terrainHeight(o.x + d.x * mid, o.z + d.z * mid) > 0) lo = mid; else hi = mid;
        }
        const ht = (lo + hi) / 2;
        const p = new THREE.Vector3(o.x + d.x * ht, o.y + d.y * ht, o.z + d.z * ht);
        const n = terrainNormal(p.x, p.z);
        const hit: StaticHit = { point: p, distance: ht, normal: new THREE.Vector3(n.x, n.y, n.z) };
        if (!best || ht < best.distance) best = hit;
        break;
      }
      prevAbove = above;
      prevT = t;
      t += Math.max(0.5, (o.y + d.y * t - terrainHeight(x, z)) * 0.5);
    }
    return best;
  }

  removeInteractable(it: Interactable): void {
    const i = this.interactables.indexOf(it);
    if (i >= 0) this.interactables.splice(i, 1);
  }

  private blinkT = 0;
  update(dt: number, playerPos: THREE.Vector3): void {
    for (const c of this.chests) c.update(dt);
    for (const b of this.barrelFlames) {
      if (b.distanceTo(playerPos) < 60 && Math.random() < 20 * dt) fx.fireColumn(b);
    }
    // clean up exploded barrels
    for (let i = this.barrels.length - 1; i >= 0; i--) {
      if (this.barrels[i].exploded) {
        this.group.remove(this.barrels[i].group);
        this.barrels.splice(i, 1);
      }
    }
    // gate slide
    if (this.gate?.open && this.gate.openT < 1) {
      this.gate.openT = Math.min(1, this.gate.openT + dt * 0.4);
      const door = this.gate.group.getObjectByName('gate_door');
      if (door) door.position.y = 3 - this.gate.openT * 6.2;
      if (Math.random() < 0.4) {
        fx.burst(this.gate.group.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 10, 0.4, 0)), 0xc8b498, 3, 2, 0.09, 0.5, 6);
      }
    }
    // blinking beacons + drifting clouds + quest marker bob
    this.blinkT += dt;
    const blinkOn = Math.sin(this.blinkT * 4) > 0;
    this.group.traverse((o) => {
      if (o.name === 'cloud') o.position.x += dt * 0.8;
      else if (o.name === 'blinker') o.visible = blinkOn;
      else if (o.name === 'quest_marker') o.position.y = 2.35 + Math.sin(this.blinkT * 2.5) * 0.12;
      else if (o.name === 'ft_ring') o.rotation.z += dt * 0.8;
    });
    if (this.zaza) {
      const d = this.zaza.position.distanceTo(playerPos);
      if (d < 8) {
        const target = Math.atan2(playerPos.x - this.zaza.position.x, playerPos.z - this.zaza.position.z);
        this.zaza.rotation.y += (target - this.zaza.rotation.y) * Math.min(1, dt * 5);
      }
    }
    // Quibb idles: faces the player when close
    if (this.quibb) {
      const d = this.quibb.position.distanceTo(playerPos);
      if (d < 8) {
        const target = Math.atan2(playerPos.x - this.quibb.position.x, playerPos.z - this.quibb.position.z);
        this.quibb.rotation.y += (target - this.quibb.rotation.y) * Math.min(1, dt * 5);
      }
      this.quibb.position.y = terrainHeight(this.quibb.position.x, this.quibb.position.z) + Math.abs(Math.sin(this.blinkT * 1.5)) * 0.02;
    }
    // rats scurry, flee the player
    for (const r of this.rats) {
      r.wanderT -= dt;
      const toPlayer = playerPos.distanceTo(r.mesh.position);
      if (toPlayer < 4) {
        const flee = r.mesh.position.clone().sub(playerPos).setY(0).normalize();
        r.vel.lerp(flee.multiplyScalar(4.5), 0.3);
        r.wanderT = 0.5;
      } else if (r.wanderT <= 0) {
        r.wanderT = 1 + Math.random() * 3;
        if (Math.random() < 0.5) r.vel.set(0, 0, 0);
        else {
          const a = Math.random() * Math.PI * 2;
          r.vel.set(Math.cos(a), 0, Math.sin(a)).multiplyScalar(1.2);
          // drift back home
          if (r.mesh.position.distanceTo(r.home) > 20) {
            r.vel.copy(r.home.clone().sub(r.mesh.position).setY(0).normalize().multiplyScalar(1.5));
          }
        }
      }
      if (r.vel.lengthSq() > 0.01) {
        r.mesh.position.addScaledVector(r.vel, dt);
        r.mesh.position.y = terrainHeight(r.mesh.position.x, r.mesh.position.z) + Math.abs(Math.sin(this.blinkT * 18)) * 0.03;
        r.mesh.rotation.y = Math.atan2(r.vel.x, r.vel.z) + Math.PI;
      }
    }
    // citizens amble around the plaza
    for (const cz of this.citizens) {
      cz.wanderT -= dt;
      if (cz.wanderT <= 0) {
        cz.wanderT = 2 + Math.random() * 4;
        if (Math.random() < 0.45) cz.vel.set(0, 0, 0);
        else {
          const a = Math.random() * Math.PI * 2;
          cz.vel.set(Math.cos(a), 0, Math.sin(a)).multiplyScalar(1.1);
          if (cz.mesh.position.distanceTo(cz.home) > 30) {
            cz.vel.copy(cz.home.clone().sub(cz.mesh.position).setY(0).normalize().multiplyScalar(1.2));
          }
        }
      }
      if (cz.vel.lengthSq() > 0.01) {
        const nx = cz.mesh.position.x + cz.vel.x * dt, nz = cz.mesh.position.z + cz.vel.z * dt;
        if (this.collideSphere(new THREE.Vector3(nx, 0, nz), 0.5)) { cz.wanderT = 0; continue; }
        cz.mesh.position.set(nx, terrainHeight(nx, nz) + Math.abs(Math.sin(this.blinkT * 8)) * 0.03, nz);
        cz.mesh.rotation.y = Math.atan2(cz.vel.x, cz.vel.z);
      }
    }
    // vultures circle
    for (const v of this.vultures) {
      v.angle += v.speed * dt;
      v.mesh.position.set(v.cx + Math.cos(v.angle) * v.r, v.h + Math.sin(v.angle * 2.3) * 1.5, v.cz + Math.sin(v.angle) * v.r);
      v.mesh.rotation.y = -v.angle;
      v.mesh.rotation.z = 0.15;
    }
    // ambient particles: desert dust motes or falling snow
    if (WORLD.biome.ambientParticle === 'snow') {
      if (Math.random() < 40 * dt) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * 22;
        const p = playerPos.clone().add(new THREE.Vector3(Math.cos(a) * r, 6 + Math.random() * 6, Math.sin(a) * r));
        fx.emit(p, new THREE.Vector3(0.35 + Math.random() * 0.3, -1.1, 0.15), 0xffffff, 0.07, 6, 0.02);
      }
    } else if (WORLD.biome.ambientParticle === 'ash') {
      if (Math.random() < 30 * dt) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * 20;
        const p = playerPos.clone().add(new THREE.Vector3(Math.cos(a) * r, 5 + Math.random() * 6, Math.sin(a) * r));
        fx.emit(p, new THREE.Vector3(0.2, -0.7, 0.1), Math.random() > 0.85 ? 0xff6a1a : 0x8a8078, 0.06, 7, 0.01);
      }
    } else if (Math.random() < 6 * dt) {
      const a = Math.random() * Math.PI * 2;
      const r = 4 + Math.random() * 14;
      const p = playerPos.clone().add(new THREE.Vector3(Math.cos(a) * r, 0.5 + Math.random() * 3, Math.sin(a) * r));
      fx.emit(p, new THREE.Vector3(0.4, 0.15, 0.15), 0xd8c8a8, 0.05, 2.5, -0.02);
    }
    // aurora shimmer
    if (WORLD.biome.aurora) {
      this.group.traverse((o) => {
        if (o.name === 'aurora') o.position.x += Math.sin(this.blinkT * 0.3 + o.position.z) * dt * 2;
      });
    }
  }
}
