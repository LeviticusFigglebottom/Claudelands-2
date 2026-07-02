// The Claudelands overworld — pass 2. Builds the heightfield terrain and five
// hand-dressed districts (Gutterlight hub, Gully Seven fort, the Boneyard,
// the Slagflats crash site, Trash Mountain), plus the quest gate, Foreman
// Quibb, explosive barrels, scrap-rat critters, circling vultures, and
// drifting clouds. Exposes ground height, colliders, static raycasts (with
// terrain ray-march), and interactables. Consumes data/world.ts only.

import * as THREE from 'three';
import { WORLD, terrainHeight, terrainNormal, roadFactor, districtAt, type WorldPoi, type DistrictDef } from '../data/world';
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
      new THREE.MeshBasicMaterial({ map: posterTexture({ lines: ['!!'], style: 'warning', bg: '#ffd23c', fg: '#181818', accent: '#181818' }) }));
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
  private vultures: { mesh: THREE.Group; angle: number; r: number; cx: number; cz: number; h: number; speed: number }[] = [];
  private quibb: THREE.Group | null = null;
  private raycaster = new THREE.Raycaster();

  constructor(scene: THREE.Scene) {
    this.buildSky(scene);
    this.buildTerrain();
    this.buildCanyonRing();
    this.buildScatter();
    this.buildDistricts();
    this.buildPois();
    this.buildCritters();
    scene.add(this.group);
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
    scene.add(new THREE.HemisphereLight(WORLD.ambient.sky, WORLD.ambient.ground, WORLD.ambient.intensity));
  }

  /** Big world: the shadow frustum follows the player. */
  followSun(playerPos: THREE.Vector3): void {
    this.sun.position.copy(playerPos).add(this.sunOffset);
    this.sun.target.position.copy(playerPos);
  }

  // ------------------------------------------------------------------ terrain
  private buildTerrain(): void {
    const span = WORLD.size * 1.7;
    const segs = 170;
    const geo = new THREE.PlaneGeometry(span, span, segs, segs);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.getAttribute('position');
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      pos.setY(i, terrainHeight(x, z));
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
    const mat = toonMat({ map: groundTexture(), rim: 0 });
    mat.vertexColors = true;
    mat.map!.repeat.set(24, 24);
    const ground = new THREE.Mesh(geo, mat);
    ground.receiveShadow = true;
    this.group.add(ground);
    // NOTE: terrain is NOT in staticTargets — hitscan uses the ray-march in raycastStatics
  }

  private buildCanyonRing(): void {
    const rockMat = toonMat({ map: rockTexture() });
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
      if (districtAt(x, z)?.id === 'gutterlight') continue;
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
    const tuftMat = toonMat({ color: 0x7d8a4a });
    const tufts = new THREE.InstancedMesh(tuftGeo, tuftMat, 700);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    let placed = 0;
    for (let i = 0; i < 3000 && placed < 700; i++) {
      const x = (rng() - 0.5) * WORLD.size * 1.15;
      const z = (rng() - 0.5) * WORLD.size * 1.15;
      const d = districtAt(x, z);
      if (d && (d.id === 'gutterlight' || d.id === 'trashmount')) continue;
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

  private buildDistricts(): void {
    this.buildGutterlight();
    this.buildGully();
    this.buildBoneyard();
    this.buildSlagflats();
    this.buildTrashMountain();
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

  private poster(x: number, z: number, ry: number, idx: number, y?: number): void {
    const spec = POSTERS[idx % POSTERS.length];
    const poster = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.9),
      new THREE.MeshBasicMaterial({ map: posterTexture(spec) }));
    poster.position.set(x, (y ?? terrainHeight(x, z) + 1.7), z);
    poster.rotation.y = ry;
    poster.rotation.z = (idx % 2 === 0 ? 1 : -1) * 0.04;
    this.group.add(poster);
  }

  private graffiti(x: number, z: number, ry: number, idx: number): void {
    const spec = GRAFFITI[idx % GRAFFITI.length];
    const tex = posterTexture({ ...spec, bg: '#00000000' });
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
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.6),
      new THREE.MeshBasicMaterial({ map: posterTexture({ lines: ['GUTTERLIGHT'], style: 'propaganda', bg: '#3a4a5a', fg: '#f2e4c4' }), side: THREE.DoubleSide }));
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
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.5),
      new THREE.MeshBasicMaterial({ map: posterTexture({ lines: ['TAXED'], style: 'graffiti', bg: '#00000000', fg: '#f2e4c4', accent: '#241a10' }), transparent: true }));
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
    const logo = new THREE.Mesh(new THREE.PlaneGeometry(4, 4),
      new THREE.MeshBasicMaterial({ map: posterTexture({ lines: ['HELIX', 'HX-77'], style: 'warning', bg: '#e8e4da', fg: '#1a1a1a', accent: '#2ba8a0' }) }));
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
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.2),
        new THREE.MeshBasicMaterial({ map: posterTexture({ lines: ['OBEY', 'THE DUKE'], style: 'propaganda', bg: '#8a2f24', fg: '#f2e4c4' }), side: THREE.DoubleSide }));
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
        case 'npc': this.buildQuibb(poi); break;
        case 'gate': this.buildGate(poi); break;
        case 'sign': this.buildSign(poi); break;
      }
    }
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
        : { lines: ['DOC', 'FIZZY', 'JUICE'], style: 'ad', bg: '#2a6a5a', fg: '#eafff4', accent: '#7dff2a' }) }),
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
    const warning = new THREE.Mesh(new THREE.PlaneGeometry(3, 2),
      new THREE.MeshBasicMaterial({ map: posterTexture({ lines: ['SEALED BY', 'HELIX', 'ORDER 88-C'], style: 'warning', bg: '#d8a828', fg: '#1a1a1a', accent: '#1a1a1a' }) }));
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
    const board = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.8),
      new THREE.MeshBasicMaterial({ map: posterTexture({ lines: [poi.data ?? '???'], style: 'graffiti', bg: '#4a3a26', fg: '#f2e4c4', accent: '#241a10' }), side: THREE.DoubleSide }));
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
      const home = i < 3 ? new THREE.Vector3(0, 0, 92) : new THREE.Vector3(0, 0, 5);
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
      const over = i < 2 ? { x: -85, z: -20 } : { x: 0, z: -95 };
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
    // vultures circle
    for (const v of this.vultures) {
      v.angle += v.speed * dt;
      v.mesh.position.set(v.cx + Math.cos(v.angle) * v.r, v.h + Math.sin(v.angle * 2.3) * 1.5, v.cz + Math.sin(v.angle) * v.r);
      v.mesh.rotation.y = -v.angle;
      v.mesh.rotation.z = 0.15;
    }
    // ambient dust motes near the player
    if (Math.random() < 6 * dt) {
      const a = Math.random() * Math.PI * 2;
      const r = 4 + Math.random() * 14;
      const p = playerPos.clone().add(new THREE.Vector3(Math.cos(a) * r, 0.5 + Math.random() * 3, Math.sin(a) * r));
      fx.emit(p, new THREE.Vector3(0.4, 0.15, 0.15), 0xd8c8a8, 0.05, 2.5, -0.02);
    }
  }
}
