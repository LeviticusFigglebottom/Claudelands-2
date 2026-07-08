// The Claudelands overworld — pass 2. Builds the heightfield terrain and five
// hand-dressed districts (Gutterlight hub, Gully Seven fort, the Boneyard,
// the Slagflats crash site, Trash Mountain), plus the quest gate, Foreman
// Quibb, explosive barrels, scrap-rat critters, circling vultures, and
// drifting clouds. Exposes ground height, colliders, static raycasts (with
// terrain ray-march), and interactables. Consumes data/world.ts only.

import * as THREE from 'three';
import { WORLD, terrainHeight, terrainNormal, meshHeight, roadFactor, districtAt, galeAt, TERRAIN_SEGS, TERRAIN_SPAN_FACTOR, type WorldPoi, type DistrictDef } from '../data/world';
import { toonMat, glowMat, flatMat } from '../render/toon';
import { groundTexture, rockTexture, corrugatedTexture, posterTexture, swatch, cloudTexture, waterTexture, fallTexture } from '../render/textures';
import { buildScrapship } from '../render/scrapship';
import { POSTERS, GRAFFITI } from '../data/flavor';
import { LootChest } from './loot';
import { fx } from './particles';
import { FX_LAYER } from '../render/post';
import { mulberry32, type Rng } from '../util/rng';
import { splashDamage, type Damageable, type StatusEffect } from './combat';
import { audio } from '../audio/synth';

interface AABB {
  minX: number; maxX: number; minZ: number; maxZ: number;
  /** Vertical extent (absolute Y) — bullets/arcs clear a crate but not a wall. */
  bottom: number; top: number;
}

export interface Interactable {
  kind: 'chest' | 'vendor_gun' | 'vendor_med' | 'fast_travel' | 'wirelog' | 'npc' | 'ship' | 'wreck' | 'racer' | 'pit' | 'cargo';
  pos: THREE.Vector3;
  label: string;
  data?: string;
  chest?: LootChest;
  /** Interact reach override — big props (wrecks) push the player out past the default 3.4. */
  range?: number;
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
  /** Textures that scroll every frame (waterfall sheets, pool glints). */
  private scrollTex: { tex: THREE.Texture; vy: number }[] = [];
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
  /** Named NPCs get idle life: breathing, sway, head-tracking, fidgets. */
  private npcRigs: { group: THREE.Group; head: THREE.Object3D | null; armR: THREE.Object3D | null; baseY: number; phase: number; fidgetT: number; fidgetK: number }[] = [];
  private hemi!: THREE.HemisphereLight;
  private raycaster = new THREE.Raycaster();

  constructor(scene: THREE.Scene) {
    // GP maps race down the corridor floor: the centerline is a keep-out
    // for anything solid, and the shoulders get race dressing
    this.raceLine = WORLD.id.endsWith('_gp') && WORLD.terrain.corridor ? WORLD.terrain.corridor.pts : null;
    this.buildSky(scene);
    this.buildTerrain();
    this.buildDistricts();
    this.buildPois();
    this.buildCharm();
    if (this.raceLine) this.buildRaceDecor();
    this.buildCanyonRing();
    this.buildScatter();
    this.buildCritters();
    scene.add(this.group);
  }

  /** The active race centerline (GP maps only) — solid props keep off it. */
  private raceLine: { x: number; z: number }[] | null = null;

  /** Closest point on the racing line; d = Infinity when no race here. */
  private trackClosest(x: number, z: number): { d: number; px: number; pz: number; nx: number; nz: number } {
    const pts = this.raceLine;
    if (!pts) return { d: Infinity, px: 0, pz: 0, nx: 0, nz: 0 };
    let best = Infinity, px = 0, pz = 0, nx = 0, nz = 1;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1];
      const dx = b.x - a.x, dz = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
      const cx = a.x + dx * t, cz = a.z + dz * t;
      const d = Math.hypot(x - cx, z - cz);
      if (d < best) {
        best = d; px = cx; pz = cz;
        const len = Math.hypot(dx, dz) || 1;
        nx = -dz / len; nz = dx / len; // segment normal, for degenerate pushes
      }
    }
    return { d: best, px, pz, nx, nz };
  }

  private trackDist(x: number, z: number): number { return this.trackClosest(x, z).d; }

  /** Race maps: shove a POI perpendicular off the racing line to a safe
   *  shoulder — rods still shelter the track without standing in it. */
  private offTrack<T extends { x: number; z: number }>(poi: T, min: number): T {
    const c = this.trackClosest(poi.x, poi.z);
    if (c.d >= min || !isFinite(c.d)) return poi;
    let nx = c.nx, nz = c.nz;
    if (c.d > 0.01) { nx = (poi.x - c.px) / c.d; nz = (poi.z - c.pz) / c.d; }
    return { ...poi, x: c.px + nx * min, z: c.pz + nz * min };
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
  /** Dome, sun disc, and clouds ride this anchor, which follows the camera:
   *  on big maps a fixed dome's far wall drifts past the camera far plane
   *  (700) and clips to raw black — the flickering "black box" horizon. */
  private skyAnchor = new THREE.Group();

  private buildSky(scene: THREE.Scene): void {
    this.group.add(this.skyAnchor);
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
    this.skyAnchor.add(sky);

    // sun disc (blooms nicely)
    const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(26, 20), glowMat(0xfff2d0, 0.9));
    sunDisc.position.set(WORLD.sun.dirX, WORLD.sun.dirY, WORLD.sun.dirZ).multiplyScalar(500);
    sunDisc.lookAt(0, 0, 0);
    sunDisc.layers.set(FX_LAYER);
    (sunDisc.material as THREE.MeshBasicMaterial).fog = false;
    this.skyAnchor.add(sunDisc);

    // clouds wear the planet's palette — storm-grey over Voltholm, sea-glass
    // over the Veldt, violet dusk over Vitra — instead of one universal puff
    const cloudTint = new THREE.Color(WORLD.skyHorizon).lerp(new THREE.Color(0xffffff), 0.55);
    const cloudMat = flatMat(cloudTint.getHex(), cloudTexture());
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
      this.skyAnchor.add(cloud);
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
    this.sun.shadow.bias = -0.0005;
    // low-poly terrain at grazing sun angles is acne bait — offset along the
    // surface normal instead of piling on depth bias
    this.sun.shadow.normalBias = 0.6;
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

  /** Big world: the shadow frustum follows the player — SNAPPED to shadow
   *  texels. A frustum that crawls sub-texel every frame makes shadow edges
   *  shimmer and throws transient dark patches across the ground while
   *  running; quantizing the follow kills the crawl. */
  followSun(playerPos: THREE.Vector3): void {
    const texel = 120 / 2048; // ortho span / shadow map size
    const sx = Math.round(playerPos.x / texel) * texel;
    const sz = Math.round(playerPos.z / texel) * texel;
    this.sun.position.set(sx, playerPos.y, sz).add(this.sunOffset);
    this.sun.target.position.set(sx, playerPos.y, sz);
    this.skyAnchor.position.set(playerPos.x, 0, playerPos.z);
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

  /** One rim piece in the active biome's handwriting. Every planet's
   *  horizon should be recognizable in silhouette alone. */
  private rimPiece(rng: () => number, w: number, h: number, rockMat: THREE.Material): THREE.Object3D {
    const style = WORLD.biome.rim ?? 'mesa';
    switch (style) {
      case 'slate': { // Voltholm: storm-sheared slab stacks, all leaning downwind
        const g = new THREE.Group();
        const tiers = 2 + Math.floor(rng() * 3);
        let y = 0;
        for (let t = 0; t < tiers; t++) {
          const th = h / tiers * (0.8 + rng() * 0.5);
          const slab = new THREE.Mesh(new THREE.BoxGeometry(w * (1.6 - t * 0.28), th, w * (1.1 - t * 0.15)), rockMat);
          slab.position.set((rng() - 0.2) * w * 0.3 + t * w * 0.14, y + th / 2, (rng() - 0.5) * w * 0.2);
          slab.rotation.y = (rng() - 0.5) * 0.4;
          slab.rotation.z = -0.06 - t * 0.03; // the wind always won
          g.add(slab);
          y += th * 0.82;
        }
        return g;
      }
      case 'barrow': { // the Becalmed: smooth rounded mounds, a quiet skyline
        const dome = new THREE.Mesh(new THREE.SphereGeometry(w * 1.15, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), rockMat);
        dome.scale.y = h / (w * 1.15) * 0.75;
        return dome;
      }
      case 'prism': { // Vitra Null: sheared black-glass prisms with lit edges
        const g = new THREE.Group();
        const glass = new THREE.MeshToonMaterial({ color: 0x241c48, transparent: true, opacity: 0.92 });
        const n = 1 + Math.floor(rng() * 2);
        for (let k = 0; k < n; k++) {
          const ph = h * (0.7 + rng() * 0.6);
          const prism = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.12, w * (0.5 + rng() * 0.3), ph, 3 + Math.floor(rng() * 2)), glass);
          prism.position.set((rng() - 0.5) * w * 0.8, ph / 2, (rng() - 0.5) * w * 0.8);
          prism.rotation.y = rng() * Math.PI;
          prism.rotation.z = (rng() - 0.5) * 0.16;
          g.add(prism);
          const vein = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, ph * 0.7, 4), glowMat(rng() < 0.5 ? 0x7af0ff : 0xc06bff, 0.5));
          vein.position.copy(prism.position);
          vein.rotation.copy(prism.rotation);
          g.add(vein);
        }
        return g;
      }
      case 'jungle': { // Veldt: mossy-capped mesas trailing vines
        const g = new THREE.Group();
        const mesa = new THREE.Mesh(new THREE.CylinderGeometry(w * (0.55 + rng() * 0.2), w, h, 5 + Math.floor(rng() * 3)), rockMat);
        mesa.position.y = h / 2;
        g.add(mesa);
        const moss = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.62, w * 0.7, h * 0.14, 7), toonMat({ color: 0x3a7a3a, map: swatch('#2e6a30', 40) }));
        moss.position.y = h * 0.98;
        g.add(moss);
        for (let v = 0; v < 3; v++) {
          const vl = h * (0.3 + rng() * 0.4);
          const vine = new THREE.Mesh(new THREE.BoxGeometry(0.3, vl, 0.12), toonMat({ color: 0x2e6a30 }));
          const va = rng() * Math.PI * 2;
          vine.position.set(Math.cos(va) * w * 0.62, h * 0.92 - vl / 2, Math.sin(va) * w * 0.62);
          g.add(vine);
        }
        return g;
      }
      case 'floe': { // Frosthollow: jagged ice peaks in rafted clusters
        const g = new THREE.Group();
        const ice = toonMat({ color: 0xd8ecf8, map: swatch('#c8e0f0', 40) });
        const deepIce = toonMat({ color: 0x9ac8e8 });
        const n = 2 + Math.floor(rng() * 3);
        for (let k = 0; k < n; k++) {
          const ph = h * (0.6 + rng() * 0.7);
          const peak = new THREE.Mesh(new THREE.ConeGeometry(w * (0.35 + rng() * 0.3), ph, 5), k === 0 ? ice : deepIce);
          peak.position.set((rng() - 0.5) * w * 1.1, ph / 2, (rng() - 0.5) * w * 1.1);
          peak.rotation.y = rng() * Math.PI;
          peak.rotation.z = (rng() - 0.5) * 0.22; // rafted, not grown
          g.add(peak);
        }
        const base = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.9, w * 1.1, h * 0.16, 7), rockMat);
        base.position.y = h * 0.06;
        g.add(base);
        return g;
      }
      case 'basalt': { // Cinder Throat: hex column organs, cracks still warm
        const g = new THREE.Group();
        const charcoal = toonMat({ color: 0x3a3230, map: rockTexture('#332c28') });
        const n = 3 + Math.floor(rng() * 3);
        for (let k = 0; k < n; k++) {
          const ch = h * (0.45 + rng() * 0.75);
          const col = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.28, w * 0.3, ch, 6), charcoal);
          const ca = (k / n) * Math.PI * 2;
          col.position.set(Math.cos(ca) * w * 0.42, ch / 2, Math.sin(ca) * w * 0.42);
          col.rotation.y = rng();
          g.add(col);
          if (rng() < 0.4) { // an ember seam glowing between columns
            const seam = new THREE.Mesh(new THREE.BoxGeometry(0.3, ch * 0.5, 0.3), glowMat(0xff6a1a, 0.7));
            seam.position.set(Math.cos(ca) * w * 0.42, ch * 0.35, Math.sin(ca) * w * 0.42 + w * 0.16);
            seam.name = 'blinker';
            g.add(seam);
          }
        }
        return g;
      }
      default: { // 'mesa': the Claude Prime truncated cones
        const mesa = new THREE.Mesh(new THREE.CylinderGeometry(w * (0.55 + rng() * 0.2), w, h, 5 + Math.floor(rng() * 3)), rockMat);
        mesa.position.y = h / 2;
        if (WORLD.biome.trees === 'pine') {
          const g = new THREE.Group();
          g.add(mesa);
          const cap = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.58, w * 0.72, h * 0.12, 6), toonMat({ color: 0xf0f6fa }));
          cap.position.y = h;
          g.add(cap);
          return g;
        }
        return mesa;
      }
    }
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
      const piece = this.rimPiece(rng, w, h, rockMat);
      piece.position.x = Math.cos(a) * (ringR + rng() * 14);
      piece.position.y += -2;
      piece.position.z = Math.sin(a) * (ringR + rng() * 14);
      piece.rotation.y = rng() * Math.PI;
      piece.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
      this.group.add(piece);
      this.staticTargets.push(piece);
    }
    for (let i = 0; i < 10; i++) {
      const a = rng() * Math.PI * 2;
      const h = 46 + rng() * 60;
      const far = this.rimPiece(rng, 24 + rng() * 14, h, rockMat);
      far.position.set(Math.cos(a) * (300 + rng() * 120), -6, Math.sin(a) * (300 + rng() * 120));
      this.group.add(far);
    }
    // scattered inner rocks
    for (let i = 0; i < 26; i++) {
      const x = (rng() - 0.5) * WORLD.size * 0.95;
      const z = (rng() - 0.5) * WORLD.size * 0.95;
      const dd = districtAt(x, z);
      if (dd && (dd.dress === 'hub' || dd.dress === 'frosthub' || dd.dress === 'throatgate' || dd.dress === 'porttown' || dd.dress === 'jarworks' || dd.dress === 'stillgate' || dd.dress === 'paddygate')) continue;
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
    // instanced ground life — each biome grows its own kind
    const rng = mulberry32(31337);
    const life = WORLD.biome.groundLife ?? 'scrub';
    let tuftGeo: THREE.BufferGeometry;
    let tuftMat: THREE.Material;
    switch (life) {
      case 'sedge': // Voltholm: storm-combed grass, every blade bent the same way
        tuftGeo = new THREE.ConeGeometry(0.1, 0.8, 4);
        tuftGeo.translate(0, 0.4, 0);
        tuftGeo.rotateZ(-0.55); // combed flat by the gales
        tuftMat = toonMat({ color: WORLD.biome.scrub });
        break;
      case 'reeds': // the Becalmed: tall reeds standing PERFECTLY straight
        tuftGeo = new THREE.CylinderGeometry(0.02, 0.035, 1.3, 4);
        tuftGeo.translate(0, 0.65, 0);
        tuftMat = toonMat({ color: 0x6a7a58 });
        break;
      case 'shards': // Vitra: no plants — splinters of standing glass
        tuftGeo = new THREE.ConeGeometry(0.12, 0.55, 3);
        tuftGeo.translate(0, 0.27, 0);
        tuftMat = new THREE.MeshToonMaterial({ color: 0x4a3e8a, transparent: true, opacity: 0.8 });
        break;
      case 'fern': // Veldt: wide two-tone fronds
        tuftGeo = new THREE.ConeGeometry(0.34, 0.5, 6);
        tuftGeo.scale(1, 1, 0.45);
        tuftGeo.translate(0, 0.25, 0);
        tuftMat = toonMat({ color: WORLD.biome.scrub });
        break;
      default:
        tuftGeo = new THREE.ConeGeometry(0.16, 0.5, 5);
        tuftMat = toonMat({ color: WORLD.biome.scrub });
    }
    const tufts = new THREE.InstancedMesh(tuftGeo, tuftMat, 700);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    let placed = 0;
    for (let i = 0; i < 3000 && placed < 700; i++) {
      const x = (rng() - 0.5) * WORLD.size * 1.15;
      const z = (rng() - 0.5) * WORLD.size * 1.15;
      const d = districtAt(x, z);
      if (d && (d.dress === 'hub' || d.dress === 'frosthub' || d.dress === 'throne' || d.dress === 'throatgate' || d.dress === 'porttown' || d.dress === 'castaway' || d.dress === 'cavemouth' || d.dress === 'anchorage' || d.dress === 'jarworks' || d.dress === 'stillgate' || d.dress === 'paddygate')) continue;
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

  // ---------------------------------------------------------------- race decor

  /** GP tracks: make the ribbon READABLE at 47 scrap-klicks — glow studs
   *  down both shoulders and chevron boards leaning into every bend. */
  private buildRaceDecor(): void {
    const pts = this.raceLine!;
    const studGeo = new THREE.SphereGeometry(0.24, 6, 6);
    const studL = glowMat(0xffd23c, 0.85);
    const studR = glowMat(0x54d4ff, 0.85);
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1];
      const dx = b.x - a.x, dz = b.z - a.z;
      const len = Math.hypot(dx, dz) || 1;
      const nx = -dz / len, nz = dx / len;
      const steps = Math.max(1, Math.floor(len / 14));
      for (let s = 0; s < steps; s++) {
        const t = (s + 0.5) / steps;
        const x = a.x + dx * t, z = a.z + dz * t;
        for (const side of [-1, 1] as const) {
          const sx = x + nx * 12.5 * side, sz = z + nz * 12.5 * side;
          const stud = new THREE.Mesh(studGeo, side < 0 ? studL : studR);
          stud.position.set(sx, terrainHeight(sx, sz) + 0.26, sz);
          this.group.add(stud);
        }
      }
    }
    // chevron boards on the OUTSIDE of each bend, facing the incoming leg
    for (let i = 1; i + 1 < pts.length; i++) {
      const p0 = pts[i - 1], p1 = pts[i], p2 = pts[i + 1];
      const inX = p1.x - p0.x, inZ = p1.z - p0.z;
      const outX = p2.x - p1.x, outZ = p2.z - p1.z;
      const cross = inX * outZ - inZ * outX;
      if (Math.abs(cross) < 40) continue; // basically straight — no board
      const inLen = Math.hypot(inX, inZ) || 1;
      let nx = -inZ / inLen, nz = inX / inLen; // left of travel
      if (cross > 0) { nx = -nx; nz = -nz; }   // outside = away from the turn
      const bx = p1.x + nx * 13.5, bz = p1.z + nz * 13.5;
      const by = terrainHeight(bx, bz);
      // chevrons point INTO the turn (screen-left when the track bends left)
      const glyph = cross > 0 ? '◀◀◀' : '▶▶▶';
      const tex = posterTexture({ lines: [glyph], style: 'warning', bg: '#b4321e', fg: '#f4ead8', accent: '#f4ead8' }, 2.2);
      const board = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.6),
        new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
      board.position.set(bx, by + 1.7, bz);
      board.rotation.y = Math.atan2(-inX, -inZ);
      this.group.add(board);
      const legMat = toonMat({ color: 0x3a3a42 });
      for (const s of [-1.4, 1.4]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.8, 5), legMat);
        leg.position.set(bx + Math.cos(board.rotation.y) * s, by + 0.9, bz - Math.sin(board.rotation.y) * s);
        this.group.add(leg);
      }
      this.addCollider(bx, bz, 0.5, 0.5, 3);
    }
  }

  // --------------------------------------------------------------- map charm
  // Little lived-in touches, keyed per map — nothing quest-critical, just
  // proof that somebody's day keeps happening when the player looks away.

  private buildCharm(): void {
    const rng = mulberry32(350035);
    switch (WORLD.id) {
      case 'claudelands': {
        const hub = WORLD.districts.find((d) => d.dress === 'hub');
        if (!hub) break;
        this.laundryLine(hub.cx - 16, hub.cz + 8, hub.cx - 8, hub.cz + 13, rng);
        this.laundryLine(hub.cx + 10, hub.cz - 14, hub.cx + 17, hub.cz - 9, rng);
        this.scrapWindmill(hub.cx + 27, hub.cz + 17);
        this.hubcapShrine(hub.cx - 22, hub.cz - 15);
        break;
      }
      case 'frosthollow': {
        const lake = WORLD.terrain.lake;
        if (lake) this.iceCamp(lake.x + lake.r * 0.35, lake.z + lake.r * 0.2);
        const hub = WORLD.districts.find((d) => d.dress === 'frosthub');
        if (hub) {
          this.snowman(hub.cx + 14, hub.cz + 12, rng);
          for (const [ox, oz] of [[-8, -6], [6, 4], [12, -10]] as const) {
            this.smokePlume(hub.cx + ox, hub.cz + oz);
          }
        }
        break;
      }
      case 'cinderthroat': {
        const kiln = WORLD.districts.find((d) => d.dress === 'kilnyard');
        if (!kiln) break;
        for (let i = 0; i < 3; i++) {
          const a = rng() * Math.PI * 2, r = 10 + rng() * (kiln.radius * 0.45);
          const x = kiln.cx + Math.cos(a) * r, z = kiln.cz + Math.sin(a) * r;
          if (this.clearOfAssets(x, z, 2.4)) this.kilnMound(x, z, rng);
        }
        this.ingotStack(kiln.cx - 12, kiln.cz + 8);
        this.ingotStack(kiln.cx + 9, kiln.cz - 11);
        break;
      }
      case 'brasshaven': {
        const plaza = WORLD.districts.find((d) => d.dress === 'brassplaza');
        if (!plaza) break;
        this.bunting(plaza.cx - 14, plaza.cz - 6, plaza.cx + 12, plaza.cz - 2, rng);
        this.bunting(plaza.cx - 10, plaza.cz + 10, plaza.cx + 14, plaza.cz + 6, rng);
        this.marketBarrow(plaza.cx + 16, plaza.cz + 12, rng);
        this.marketBarrow(plaza.cx - 18, plaza.cz + 14, rng);
        break;
      }
      case 'rustgulch': {
        const pit = WORLD.districts.find((d) => d.dress === 'gulchgate');
        if (!pit) break;
        this.drumFire(pit.cx - 16, pit.cz + 18);
        this.drumFire(pit.cx + 18, pit.cz + 20);
        this.drumFire(pit.cx + 2, pit.cz + 34);
        break;
      }
      case 'veldt': {
        const port = WORLD.districts.find((d) => d.dress === 'porttown');
        if (!port) break;
        for (const [ox, oz] of [[-12, 14], [-4, 18], [6, 17], [14, 12]] as const) {
          const x = port.cx + ox, z = port.cz + oz;
          if (this.flatEnough(x, z, 1.2, 1.2)) this.tikiTorch(x, z);
        }
        this.fishRack(port.cx + 18, port.cz - 4);
        break;
      }
      case 'veldt_shallows': {
        const lake = WORLD.terrain.lake;
        if (lake) {
          for (let i = 0; i < 4; i++) {
            const a = rng() * Math.PI * 2, r = lake.r * (0.3 + rng() * 0.4);
            this.buoy(lake.x + Math.cos(a) * r, lake.z + Math.sin(a) * r, lake.level + 0.2);
          }
        }
        const anch = WORLD.districts.find((d) => d.dress === 'anchorage');
        if (anch) {
          this.rowboat(anch.cx + 15, anch.cz + 10, rng() * Math.PI);
          this.netSpool(anch.cx - 12, anch.cz + 8);
        }
        break;
      }
      case 'veldt_caves': {
        const mouth = WORLD.districts.find((d) => d.dress === 'cavemouth');
        if (mouth) {
          for (let i = 0; i < 5; i++) {
            const a = rng() * Math.PI * 2, r = 8 + rng() * (mouth.radius * 0.5);
            const x = mouth.cx + Math.cos(a) * r, z = mouth.cz + Math.sin(a) * r;
            if (this.clearOfAssets(x, z, 1.4)) this.mushroomCluster(x, z, rng);
          }
          this.minecart(mouth.cx - 10, mouth.cz - 8, rng() * Math.PI);
        }
        break;
      }
      case 'vitra': {
        const chime = WORLD.districts.find((d) => d.dress === 'chimefield');
        if (chime) {
          this.glassChimes(chime.cx + 10, chime.cz - 8, rng);
          this.glassChimes(chime.cx - 12, chime.cz + 10, rng);
          this.stargazerCamp(chime.cx - 4, chime.cz + 18);
        }
        break;
      }
      case 'voltholm': {
        const jar = WORLD.districts.find((d) => d.dress === 'jarworks');
        if (jar) {
          this.jarRack(jar.cx + 20, jar.cz + 6, rng);
          this.jarRack(jar.cx - 22, jar.cz + 2, rng);
          this.weathervane(jar.cx + 8, jar.cz + 22);
          this.weathervane(jar.cx - 10, jar.cz - 18);
        }
        break;
      }
    }
  }

  /** Two poles, a sagging line, somebody's wash drying over the alley. */
  private laundryLine(x1: number, z1: number, x2: number, z2: number, rng: Rng): void {
    const poleMat = toonMat({ color: 0x5a4a3a, map: swatch('#4e3f30', 50) });
    const y1 = terrainHeight(x1, z1), y2 = terrainHeight(x2, z2);
    for (const [x, z, y] of [[x1, z1, y1], [x2, z2, y2]] as const) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 3.2, 5), poleMat);
      pole.position.set(x, y + 1.6, z);
      this.group.add(pole);
    }
    const top1 = new THREE.Vector3(x1, y1 + 3.0, z1), top2 = new THREE.Vector3(x2, y2 + 3.0, z2);
    for (let b = 1; b < 9; b++) {
      const t = b / 9;
      const bead = new THREE.Mesh(new THREE.SphereGeometry(0.035, 4, 4), toonMat({ color: 0x2a2622 }));
      bead.position.lerpVectors(top1, top2, t);
      bead.position.y -= Math.sin(t * Math.PI) * 0.5;
      this.group.add(bead);
    }
    const colors = [0xb4543a, 0x5a7a9a, 0xc8b464, 0x7a9a5a];
    for (let i = 0; i < 3 + Math.floor(rng() * 2); i++) {
      const t = 0.18 + i * 0.22 + rng() * 0.06;
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.7 + rng() * 0.5, 0.8 + rng() * 0.4),
        new THREE.MeshToonMaterial({ color: colors[i % colors.length], side: THREE.DoubleSide }));
      cloth.position.lerpVectors(top1, top2, t);
      cloth.position.y -= Math.sin(t * Math.PI) * 0.5 + 0.45;
      cloth.rotation.y = Math.atan2(x2 - x1, z2 - z1) + Math.PI / 2;
      cloth.rotation.x = (rng() - 0.5) * 0.15;
      this.group.add(cloth);
    }
  }

  /** A scrap windmill that still turns water nobody remembers plumbing. */
  private scrapWindmill(x: number, z: number): void {
    const y = terrainHeight(x, z);
    const g = new THREE.Group();
    const frameMat = toonMat({ color: 0x6a5a4a, map: corrugatedTexture('#5e5040') });
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.4, 8, 6), frameMat);
    mast.position.y = 4;
    g.add(mast);
    const hub = new THREE.Mesh(new THREE.SphereGeometry(0.3, 6, 6), toonMat({ color: 0x3a3a42 }));
    hub.position.set(0, 8, -0.4);
    g.add(hub);
    for (let i = 0; i < 4; i++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3.2, 0.06), frameMat);
      blade.position.set(0, 8, -0.5);
      blade.rotation.z = (i / 4) * Math.PI * 2 + 0.4;
      blade.translateY(1.8);
      g.add(blade);
    }
    const vane = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.8, 1.4), frameMat);
    vane.position.set(0, 7.6, 1.2);
    g.add(vane);
    g.position.set(x, y, z);
    g.traverse((o) => (o.castShadow = true));
    this.group.add(g);
    this.staticTargets.push(g);
    this.addCollider(x, z, 0.5, 0.5, 8);
  }

  /** Roadside shrine of polished hubcaps — the gulch prays to horsepower. */
  private hubcapShrine(x: number, z: number): void {
    const y = terrainHeight(x, z);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.6, 0.2), toonMat({ color: 0x4e3f30, map: swatch('#443626', 50) }));
    post.position.set(x, y + 1.3, z);
    this.group.add(post);
    const capMat = toonMat({ color: 0xb8bcc4, map: swatch('#a8acb4', 80) });
    for (const [oy, s] of [[2.2, 0.42], [1.5, 0.3], [0.9, 0.24]] as const) {
      const cap = new THREE.Mesh(new THREE.CircleGeometry(s, 10), capMat);
      cap.position.set(x, y + oy, z + 0.12);
      this.group.add(cap);
    }
    for (let i = 0; i < 3; i++) {
      const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.16, 5), toonMat({ color: 0xe8e0c8 }));
      candle.position.set(x - 0.3 + i * 0.3, y + 0.08, z + 0.4);
      this.group.add(candle);
      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.04, 4, 4), glowMat(0xffb84a, 0.95));
      flame.position.set(candle.position.x, y + 0.2, candle.position.z);
      flame.name = 'blinker';
      this.group.add(flame);
    }
    this.addCollider(x, z, 0.4, 0.3, 2.6);
  }

  /** Chimney smoke standing over a hut — the day keeps happening inside.
   *  Anchors to a real roof (nearest collider top): no roof, no smoke. */
  private smokePlume(x: number, z: number): void {
    let top = -Infinity;
    for (const c of this.colliders) {
      if (x > c.minX - 2 && x < c.maxX + 2 && z > c.minZ - 2 && z < c.maxZ + 2) top = Math.max(top, c.top);
    }
    if (!isFinite(top)) return;
    const mat = new THREE.MeshToonMaterial({ color: 0xc8ccd4, transparent: true, opacity: 0.35 });
    for (let i = 0; i < 4; i++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(0.3 + i * 0.22, 6, 6), mat);
      puff.position.set(x + i * 0.25, top + 0.3 + i * 0.9, z + (i % 2) * 0.2);
      this.group.add(puff);
    }
  }

  /** Ice-fishing camp: a dark hole, a stool, a lantern, endless patience. */
  private iceCamp(x: number, z: number): void {
    const y = terrainHeight(x, z);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.9, 12), new THREE.MeshBasicMaterial({ color: 0x0c1a26 }));
    hole.rotation.x = -Math.PI / 2;
    hole.position.set(x, y + 0.1, z);
    this.group.add(hole);
    const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.5, 7), toonMat({ color: 0x5a4a3a }));
    stool.position.set(x + 1.7, y + 0.25, z + 0.4);
    this.group.add(stool);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 1.7, 4), toonMat({ color: 0x4e3f30 }));
    rod.position.set(x + 0.9, y + 0.7, z + 0.2);
    rod.rotation.z = 0.7;
    this.group.add(rod);
    const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 6), glowMat(0xffd88a, 0.95));
    lantern.position.set(x + 2.1, y + 0.62, z - 0.4);
    lantern.name = 'blinker';
    this.group.add(lantern);
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.5), toonMat({ color: 0x6a5a4a, map: swatch('#5e5040', 50) }));
    crate.position.set(x - 1.6, y + 0.25, z + 0.8);
    this.group.add(crate);
  }

  /** Snowman. Coal eyes. Judging you. */
  private snowman(x: number, z: number, rng: Rng): void {
    const y = terrainHeight(x, z);
    const snow = toonMat({ color: 0xf0f6fa });
    for (const [oy, s] of [[0.55, 0.62], [1.35, 0.45], [1.95, 0.3]] as const) {
      const ball = new THREE.Mesh(new THREE.SphereGeometry(s, 8, 8), snow);
      ball.position.set(x, y + oy, z);
      this.group.add(ball);
    }
    for (const ox of [-0.1, 0.1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 4, 4), toonMat({ color: 0x181818 }));
      eye.position.set(x + ox, y + 2.05, z - 0.27);
      this.group.add(eye);
    }
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3, 5), toonMat({ color: 0xd88428 }));
    nose.position.set(x, y + 1.95, z - 0.4);
    nose.rotation.x = -Math.PI / 2;
    this.group.add(nose);
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.045, 0.9, 4), toonMat({ color: 0x4e3f30 }));
      arm.position.set(x + side * 0.6, y + 1.45, z);
      arm.rotation.z = side * (1.1 + rng() * 0.3);
      this.group.add(arm);
    }
    this.addCollider(x, z, 0.55, 0.55, 2.2);
  }

  /** Charcoal kiln: an earthen dome venting embers through its seams. */
  private kilnMound(x: number, z: number, rng: Rng): void {
    const y = terrainHeight(x, z);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1.7, 9, 7), toonMat({ color: 0x3a3230, map: rockTexture('#342c2a') }));
    dome.position.set(x, y + 0.5, z);
    dome.scale.y = 0.75;
    this.group.add(dome);
    this.staticTargets.push(dome);
    for (let i = 0; i < 3; i++) {
      const a = rng() * Math.PI * 2;
      const seam = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.12), glowMat(0xff6a1a, 0.8));
      seam.position.set(x + Math.cos(a) * 1.3, y + 0.9, z + Math.sin(a) * 1.3);
      seam.name = 'blinker';
      this.group.add(seam);
    }
    this.addCollider(x, z, 1.5, 1.5, 1.8);
    this.smokePlume(x, z); // rides the kiln's own collider top
  }

  /** Cooling brass ingots stacked in a courses — the day shift's receipts. */
  private ingotStack(x: number, z: number): void {
    const y = terrainHeight(x, z);
    const brass = toonMat({ color: 0xb08a3c, map: swatch('#9a7834', 70) });
    for (let r = 0; r < 3; r++) {
      for (let i = 0; i < 3 - r; i++) {
        const ingot = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.28, 0.4), brass);
        ingot.position.set(x + i * 0.85 + r * 0.42 - 0.85, y + 0.14 + r * 0.3, z + (r % 2) * 0.1);
        this.group.add(ingot);
      }
    }
    const glow = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.28, 0.4), glowMat(0xff8a3a, 0.6));
    glow.position.set(x - 0.85, y + 0.14, z - 0.5);
    this.group.add(glow);
    this.addCollider(x, z, 1.4, 0.7, 1.2);
  }

  /** Festival bunting: little flags strung pole-to-pole over the plaza. */
  private bunting(x1: number, z1: number, x2: number, z2: number, rng: Rng): void {
    const poleMat = toonMat({ color: 0x8a6a3c, map: swatch('#7a5c32', 60) });
    for (const [px, pz] of [[x1, z1], [x2, z2]] as const) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 4.6, 6), poleMat);
      pole.position.set(px, terrainHeight(px, pz) + 2.3, pz);
      this.group.add(pole);
      const finial = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 6), toonMat({ color: 0xd8b44a }));
      finial.position.set(px, terrainHeight(px, pz) + 4.65, pz);
      this.group.add(finial);
    }
    const y1 = terrainHeight(x1, z1) + 4.4, y2 = terrainHeight(x2, z2) + 4.4;
    const a = new THREE.Vector3(x1, y1, z1), b = new THREE.Vector3(x2, y2, z2);
    const colors = [0xd88428, 0x54d4ff, 0xc06bff, 0xc8d24a, 0xb4543a];
    const n = 11;
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const flag = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.42, 3),
        new THREE.MeshToonMaterial({ color: colors[i % colors.length], side: THREE.DoubleSide }));
      flag.position.lerpVectors(a, b, t);
      flag.position.y -= Math.sin(t * Math.PI) * 1.0 + 0.2;
      flag.rotation.x = Math.PI; // point down
      flag.rotation.y = rng() * 0.6;
      this.group.add(flag);
    }
  }

  /** A market barrow parked mid-errand: two wheels, awning, produce. */
  private marketBarrow(x: number, z: number, rng: Rng): void {
    const y = terrainHeight(x, z);
    const g = new THREE.Group();
    const wood = toonMat({ color: 0x8a6a4a, map: swatch('#7a5c3e', 50) });
    const bed = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.3, 1.1), wood);
    bed.position.y = 0.7;
    g.add(bed);
    for (const side of [-1, 1]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.1, 10), toonMat({ color: 0x3a3a42 }));
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(side * 0.95, 0.4, 0);
      g.add(wheel);
    }
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.4, 4), wood);
    post.position.set(-0.7, 1.5, -0.4);
    g.add(post);
    const awning = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.2),
      new THREE.MeshToonMaterial({ color: 0xb4543a, side: THREE.DoubleSide }));
    awning.position.set(0, 2.15, -0.1);
    awning.rotation.x = -1.25;
    g.add(awning);
    const produce = [0xd88428, 0xc8d24a, 0xb4543a];
    for (let i = 0; i < 7; i++) {
      const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 6), toonMat({ color: produce[i % 3] }));
      fruit.position.set((rng() - 0.5) * 1.4, 0.95, (rng() - 0.5) * 0.8);
      g.add(fruit);
    }
    g.position.set(x, y, z);
    g.rotation.y = rng() * Math.PI * 2;
    g.traverse((o) => (o.castShadow = true));
    this.group.add(g);
    this.staticTargets.push(g);
    this.addCollider(x, z, 1.1, 0.8, 1.6);
  }

  /** Oil-drum fire: pit row's central heating. */
  private drumFire(x: number, z: number): void {
    const y = terrainHeight(x, z);
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.95, 10), toonMat({ color: 0x6a4a3a, map: corrugatedTexture('#5e4030') }));
    drum.position.set(x, y + 0.48, z);
    this.group.add(drum);
    this.staticTargets.push(drum);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.7, 6), glowMat(0xff8a3a, 0.9));
    flame.position.set(x, y + 1.25, z);
    flame.name = 'blinker';
    this.group.add(flame);
    this.addCollider(x, z, 0.5, 0.5, 1.2);
    this.barrelFlames.push(new THREE.Vector3(x, y + 1.1, z));
  }

  /** Tiki torch: the port's boardwalk lighting budget. */
  private tikiTorch(x: number, z: number): void {
    const y = terrainHeight(x, z);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 2.2, 5), toonMat({ color: 0x6a5030, map: swatch('#5e4628', 50) }));
    pole.position.set(x, y + 1.1, z);
    this.group.add(pole);
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.1, 0.3, 6), toonMat({ color: 0x8a6a4a }));
    head.position.set(x, y + 2.3, z);
    this.group.add(head);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.4, 5), glowMat(0xffb84a, 0.95));
    flame.position.set(x, y + 2.6, z);
    flame.name = 'blinker';
    this.group.add(flame);
    this.barrelFlames.push(new THREE.Vector3(x, y + 2.5, z));
  }

  /** Fish drying rack — the catch, publicly audited by seabirds. */
  private fishRack(x: number, z: number): void {
    const y = terrainHeight(x, z);
    const wood = toonMat({ color: 0x6a5030, map: swatch('#5e4628', 50) });
    for (const ox of [-1.1, 1.1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 1.8, 5), wood);
      post.position.set(x + ox, y + 0.9, z);
      this.group.add(post);
    }
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.3, 4), wood);
    rail.rotation.z = Math.PI / 2;
    rail.position.set(x, y + 1.65, z);
    this.group.add(rail);
    const silver = toonMat({ color: 0x9ab4bc, map: swatch('#8aa4ac', 80) });
    for (let i = 0; i < 5; i++) {
      const fish = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.5, 5), silver);
      fish.position.set(x - 0.9 + i * 0.45, y + 1.35, z);
      fish.rotation.x = Math.PI; // hung by the tail
      this.group.add(fish);
    }
    this.addCollider(x, z, 1.2, 0.3, 1.8);
  }

  /** Mooring buoy riding the lagoon swell (the swell is decorative). */
  private buoy(x: number, z: number, level: number): void {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), toonMat({ color: 0xb4543a, map: swatch('#9e4630', 70) }));
    ball.position.set(x, level + 0.15, z);
    this.group.add(ball);
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.51, 0.51, 0.16, 10), toonMat({ color: 0xf0e8d8 }));
    stripe.position.set(x, level + 0.2, z);
    this.group.add(stripe);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.08, 5, 5), glowMat(0xffd23c, 0.9));
    tip.position.set(x, level + 0.85, z);
    tip.name = 'blinker';
    this.group.add(tip);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 4), toonMat({ color: 0x3a3a42 }));
    mast.position.set(x, level + 0.55, z);
    this.group.add(mast);
  }

  /** A rowboat pulled up past the tideline, oars shipped, story over. */
  private rowboat(x: number, z: number, rot: number): void {
    const y = terrainHeight(x, z);
    const g = new THREE.Group();
    const hullMat = toonMat({ color: 0x7a5c3e, map: swatch('#6a4e32', 50) });
    const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.65, 3.4, 8, 1, false, 0, Math.PI), hullMat);
    hull.rotation.set(Math.PI / 2, 0, Math.PI / 2);
    hull.position.y = 0.55;
    g.add(hull);
    for (const oz of [-0.7, 0.5]) {
      const bench = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.1, 0.3), hullMat);
      bench.position.set(0, 0.6, oz);
      g.add(bench);
    }
    const oar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.4, 4), hullMat);
    oar.rotation.set(0, 0, Math.PI / 2 - 0.15);
    oar.position.set(0.3, 0.75, -0.1);
    g.add(oar);
    g.position.set(x, y, z);
    g.rotation.y = rot;
    g.traverse((o) => (o.castShadow = true));
    this.group.add(g);
    this.staticTargets.push(g);
    this.addCollider(x, z, 1.7, 1.0, 1.2);
  }

  /** Net spool: half the port's economy, wound up for the night. */
  private netSpool(x: number, z: number): void {
    const y = terrainHeight(x, z);
    const spool = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 1.1, 10), toonMat({ color: 0x6a5030, map: swatch('#5e4628', 50) }));
    spool.rotation.z = Math.PI / 2;
    spool.position.set(x, y + 0.7, z);
    this.group.add(spool);
    this.staticTargets.push(spool);
    const net = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.8, 10), toonMat({ color: 0x4a5a48 }));
    net.rotation.z = Math.PI / 2;
    net.position.set(x, y + 0.7, z);
    this.group.add(net);
    this.addCollider(x, z, 0.8, 0.8, 1.4);
  }

  /** Glow mushrooms — the caves' street lighting, self-installing. */
  private mushroomCluster(x: number, z: number, rng: Rng): void {
    const y = terrainHeight(x, z);
    const n = 3 + Math.floor(rng() * 3);
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2, r = rng() * 0.8;
      const mx = x + Math.cos(a) * r, mz = z + Math.sin(a) * r;
      const h = 0.25 + rng() * 0.5;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, h, 5), toonMat({ color: 0xd8d4c8 }));
      stem.position.set(mx, y + h / 2, mz);
      this.group.add(stem);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(h * 0.5, 7, 5), glowMat(rng() < 0.5 ? 0x6adcb8 : 0x8ab8ff, 0.75));
      cap.position.set(mx, y + h, mz);
      cap.scale.y = 0.55;
      if (rng() < 0.4) cap.name = 'blinker';
      this.group.add(cap);
    }
  }

  /** A tipped mine cart that never made its last delivery. */
  private minecart(x: number, z: number, rot: number): void {
    const y = terrainHeight(x, z);
    const g = new THREE.Group();
    const iron = toonMat({ color: 0x4a4a52, map: swatch('#3f3f47', 60) });
    const tub = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.8, 0.9), iron);
    tub.position.y = 0.75;
    tub.rotation.z = 0.5; // tipped
    g.add(tub);
    for (const [ox, oz] of [[-0.5, -0.35], [-0.5, 0.35], [0.5, -0.35], [0.5, 0.35]] as const) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.08, 8), toonMat({ color: 0x2a2a30 }));
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(ox, 0.35, oz);
      g.add(wheel);
    }
    const oreMat = toonMat({ color: 0x8ab8ff });
    for (let i = 0; i < 4; i++) {
      const ore = new THREE.Mesh(new THREE.DodecahedronGeometry(0.14, 0), oreMat);
      ore.position.set(-0.9 - i * 0.25, 0.12, (i % 2) * 0.4 - 0.2);
      g.add(ore);
    }
    g.position.set(x, y, z);
    g.rotation.y = rot;
    g.traverse((o) => (o.castShadow = true));
    this.group.add(g);
    this.staticTargets.push(g);
    this.addCollider(x, z, 1.0, 0.8, 1.2);
  }

  /** Glass chimes strung from a shard arch — Vitra's wind has one job left. */
  private glassChimes(x: number, z: number, rng: Rng): void {
    const y = terrainHeight(x, z);
    const shardMat = new THREE.MeshToonMaterial({ color: 0x6a5adf, transparent: true, opacity: 0.75 });
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.ConeGeometry(0.2, 3.4, 4), shardMat);
      post.position.set(x + side * 1.4, y + 1.7, z);
      post.rotation.z = -side * 0.2;
      this.group.add(post);
    }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.8, 4), toonMat({ color: 0x2e2652 }));
    bar.rotation.z = Math.PI / 2;
    bar.position.set(x, y + 3.0, z);
    this.group.add(bar);
    for (let i = 0; i < 5; i++) {
      const len = 0.5 + rng() * 0.7;
      const sliver = new THREE.Mesh(new THREE.BoxGeometry(0.08, len, 0.03),
        new THREE.MeshToonMaterial({ color: i % 2 ? 0x7af0ff : 0xb0a0ff, transparent: true, opacity: 0.8 }));
      sliver.position.set(x - 1.0 + i * 0.5, y + 2.9 - len / 2 - 0.1, z);
      sliver.rotation.y = rng() * 0.6;
      this.group.add(sliver);
    }
    this.addCollider(x, z, 1.4, 0.3, 3.2);
  }

  /** Somebody watches the aurora from here. Blanket, telescope, thermos. */
  private stargazerCamp(x: number, z: number): void {
    const y = terrainHeight(x, z);
    const blanket = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.6), toonMat({ color: 0x8a4a6a }));
    blanket.rotation.x = -Math.PI / 2;
    blanket.rotation.z = 0.4;
    blanket.position.set(x, y + 0.04, z);
    this.group.add(blanket);
    const tripod = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 1.3, 4), toonMat({ color: 0x3a3a42 }));
      leg.position.set(Math.cos(a) * 0.35, 0.6, Math.sin(a) * 0.35);
      leg.rotation.z = Math.cos(a) * 0.4;
      leg.rotation.x = -Math.sin(a) * 0.4;
      tripod.add(leg);
    }
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.9, 8), toonMat({ color: 0x5a48a8 }));
    tube.position.set(0, 1.35, 0);
    tube.rotation.x = 0.9;
    tripod.add(tube);
    tripod.position.set(x + 1.4, y, z + 0.6);
    this.group.add(tripod);
    const thermos = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.24, 6), toonMat({ color: 0xb4543a }));
    thermos.position.set(x - 0.5, y + 0.16, z + 0.3);
    this.group.add(thermos);
  }

  /** Racked lightning in mason jars — Voltholm's export, aging nicely. */
  private jarRack(x: number, z: number, rng: Rng): void {
    const y = terrainHeight(x, z);
    const wood = toonMat({ color: 0x5a5248, map: swatch('#4e483e', 50) });
    for (const ox of [-1.3, 1.3]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.0, 0.14), wood);
      post.position.set(x + ox, y + 1.0, z);
      this.group.add(post);
    }
    for (let s = 0; s < 3; s++) {
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.08, 0.5), wood);
      shelf.position.set(x, y + 0.55 + s * 0.6, z);
      this.group.add(shelf);
      for (let i = 0; i < 6; i++) {
        if (rng() < 0.25) continue; // sold out
        const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.3, 6), glowMat(0xc8d24a, 0.55 + rng() * 0.3));
        jar.position.set(x - 1.1 + i * 0.44, y + 0.75 + s * 0.6, z);
        if (rng() < 0.2) jar.name = 'blinker';
        this.group.add(jar);
      }
    }
    this.addCollider(x, z, 1.5, 0.4, 2.0);
  }

  /** A weathervane that has never once been wrong, or still. */
  private weathervane(x: number, z: number): void {
    const y = terrainHeight(x, z);
    const iron = toonMat({ color: 0x32383e, map: swatch('#2c3238', 60) });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 3.6, 5), iron);
    pole.position.set(x, y + 1.8, z);
    this.group.add(pole);
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.5, 4), iron);
    arrow.rotation.z = -Math.PI / 2;
    arrow.position.set(x + 0.35, y + 3.5, z);
    this.group.add(arrow);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.25, 0.04), iron);
    tail.position.set(x - 0.3, y + 3.5, z);
    this.group.add(tail);
    const cups = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.05, 5, 8), iron);
    cups.rotation.x = Math.PI / 2;
    cups.position.set(x, y + 3.1, z);
    this.group.add(cups);
  }

  // ------------------------------------------------------------------ districts
  private addCollider(x: number, z: number, hw: number, hd: number, height = 2.4): void {
    const g = terrainHeight(x, z);
    this.colliders.push({ minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd, bottom: g - 1, top: g + height });
  }

  private registerNpcRig(group: THREE.Group, head: THREE.Object3D | null, armR: THREE.Object3D | null): void {
    this.npcRigs.push({ group, head, armR, baseY: group.position.y, phase: Math.random() * 6, fidgetT: 4 + Math.random() * 7, fidgetK: -1 });
  }

  /** Hide spots for the enemy AI: points on the far side of solid props
   *  from a threat, nearest first. Skips slivers (no cover) and walls
   *  (can't wrap around them believably). */
  coverSpots(near: THREE.Vector3, threat: THREE.Vector3, maxDist: number): THREE.Vector3[] {
    const spots: { p: THREE.Vector3; d: number }[] = [];
    for (const c of this.colliders) {
      const hw = (c.maxX - c.minX) / 2, hd = (c.maxZ - c.minZ) / 2;
      const half = Math.max(hw, hd);
      if (half < 0.7 || half > 7) continue;
      const cx = (c.minX + c.maxX) / 2, cz = (c.minZ + c.maxZ) / 2;
      const dNear = Math.hypot(cx - near.x, cz - near.z);
      if (dNear > maxDist) continue;
      const away = new THREE.Vector3(cx - threat.x, 0, cz - threat.z);
      if (away.lengthSq() < 0.01) continue;
      away.normalize();
      const px = cx + away.x * (half + 1.1), pz = cz + away.z * (half + 1.1);
      spots.push({ p: new THREE.Vector3(px, terrainHeight(px, pz), pz), d: dNear });
    }
    spots.sort((a, b) => a.d - b.d);
    return spots.slice(0, 6).map((s) => s.p);
  }

  /** Free-placed props must not block the walk-up to a zone exit. */
  private clearOfExits(x: number, z: number): boolean {
    for (const ex of WORLD.exits ?? []) {
      if (Math.hypot(x - ex.x, z - ex.z) < 12) return false;
    }
    return true;
  }

  /** Scatter keep-out: too close to a collider, POI, or road = don't place. */
  /** Registered pond/paddy circles — nothing organic or loose gets placed
   *  IN the water (palms, tufts, lanterns, crates...). */
  private ponds: { x: number; z: number; r: number }[] = [];

  /** True when the ground around a spot is close to level — random prop
   *  placement must never decorate a canyon wall or a terrace ramp. */
  private flatEnough(x: number, z: number, spread = 1.8, maxRise = 1.3): boolean {
    const h0 = terrainHeight(x, z);
    for (const [dx, dz] of [[spread, 0], [-spread, 0], [0, spread], [0, -spread]] as [number, number][]) {
      if (Math.abs(terrainHeight(x + dx, z + dz) - h0) > maxRise) return false;
    }
    return true;
  }

  private clearOfAssets(x: number, z: number, margin = 1.6): boolean {
    if (roadFactor(x, z) > 0.12) return false;
    for (const c of this.colliders) {
      if (x > c.minX - margin && x < c.maxX + margin && z > c.minZ - margin && z < c.maxZ + margin) return false;
    }
    for (const p of WORLD.pois) {
      if (Math.hypot(x - p.x, z - p.z) < 5.5) return false;
    }
    for (const pd of this.ponds) {
      if (Math.hypot(x - pd.x, z - pd.z) < pd.r + margin) return false;
    }
    if (!this.clearOfExits(x, z)) return false;
    // a lenient global slope gate: random scatter never climbs the walls
    if (!this.flatEnough(x, z, 1.8, 2.2)) return false;
    // GP maps: the racing line is sacred — no prop parks on it
    if (this.trackDist(x, z) < 11) return false;
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
        case 'porttown': this.buildPortTown(d); break;
        case 'verdantcamp': this.buildVerdantCamp(d); break;
        case 'grove': this.buildIdolGrove(d); break;
        case 'jungle': this.buildJungle(d); break;
        case 'gulchgate': this.buildGulchGate(d); break;
        case 'shipbreak': this.buildShipbreak(d); break;
        case 'castaway': this.buildCastaway(d); break;
        case 'hullgrave': this.buildHullgrave(d); break;
        case 'brinepans': this.buildBrinepans(d); break;
        case 'anchorage': this.buildAnchorage(d); break;
        case 'cavemouth': this.buildCavemouth(d); break;
        case 'gloomgrove': this.buildGloomgrove(d); break;
        case 'cryptworks': this.buildCryptworks(d); break;
        case 'lodecourt': this.buildLodecourt(d); break;
        case 'lastlight': this.buildLastLight(d); break;
        case 'chimefield': this.buildChimefield(d); break;
        case 'shardsea': this.buildShardsea(d); break;
        case 'nullbasin': this.buildNullBasin(d); break;
        case 'gloamgate': this.buildGloamGate(d); break;
        case 'snuffrows': this.buildSnuffRows(d); break;
        case 'wickbothy': this.buildWickBothy(d); break;
        case 'echoorgan': this.buildEchoOrgan(d); break;
        case 'lampfall': this.buildLampfall(d); break;
        case 'jarworks': this.buildJarworks(d); break;
        case 'galeflats': this.buildGaleFlats(d); break;
        case 'conductorrow': this.buildConductorRow(d); break;
        case 'capacitorium': this.buildCapacitorium(d); break;
        case 'eyewall': this.buildEyewall(d); break;
        case 'stillgate': this.buildStillgate(d); break;
        case 'hangfields': this.buildHangFields(d); break;
        case 'barrowline': this.buildBarrowLine(d); break;
        case 'breathhall': this.buildBreathHall(d); break;
        case 'boregate': this.buildBoreGate(d); break;
        case 'threadway': this.buildThreadway(d); break;
        case 'coreworks': this.buildCoreworks(d); break;
        case 'paddygate': this.buildPaddyGate(d); break;
        case 'terrace': this.buildTerrace(d); break;
        case 'gardencrown': this.buildGardenCrown(d); break;
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
    const w0 = w, d0 = d;
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
    // quarter-turn snaps only: the collider box is axis-aligned, so a freely
    // rotated house left corners poking through it and blocked thin air
    const quarter = Math.floor(rng() * 4);
    b.rotation.y = (quarter * Math.PI) / 2 + (rng() - 0.5) * 0.05;
    b.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
    this.group.add(b);
    this.staticTargets.push(b);
    const hw = (quarter % 2 === 0 ? w0 : d0) / 2 + 0.15;
    const hd = (quarter % 2 === 0 ? d0 : w0) / 2 + 0.15;
    this.addCollider(x, z, hw, hd, hgt);
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
    this.addCollider(0, -52, 46, 18, 22);

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
    orb.name = 'npc_orb'; // floats on its own — seer stuff
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
    this.registerNpcRig(q, head, null);
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
      // junk must not bury stations, vendors, or anyone's front door
      if (WORLD.pois.some((p) => Math.hypot(x - p.x, z - p.z) < 5)) continue;
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
        case 'ship': this.buildShipPad(poi); break;
        case 'gate': this.buildGate(poi); break;
        case 'sign': this.buildSign(poi); break;
        case 'wreck': this.buildWreck(poi); break;
        case 'racer': this.buildRacerNpc(poi); break;
        case 'buggy': this.buildBuggyPad(poi); break;
        case 'pit': this.buildPitDoor(poi); break;
        case 'cargo': this.buildCargo(poi); break;
        case 'vent': this.buildVent(poi); break;
        // rods shelter the racers from SKYFALL — beside the line, not in it
        case 'rod': this.buildRod(this.offTrack(poi, 12.5)); break;
      }
    }
    this.buildZoneExits();

    // non-frozen lakes render as real water (frost keeps its ice sheet).
    // Sea-sized lakes (the Shallows lagoon) skip the pond dressing.
    if (WORLD.terrain.lake && WORLD.biome.ambientParticle !== 'snow') {
      const lake = WORLD.terrain.lake;
      this.water(lake.x, lake.z, lake.r, { lilies: WORLD.biome.trees === 'palm' && lake.r < 60, level: lake.level + 0.2 });
    }

    // the gulch dresses its racing circuit
    if (WORLD.id === 'rustgulch') this.buildGulchTrackDecor();

    // palm biomes: the wilds between districts stay jungle, not lawn
    if (WORLD.biome.trees === 'palm') {
      const rng = mulberry32(90210);
      let placed = 0;
      for (let i = 0; i < 400 && placed < 55; i++) {
        const x = (rng() - 0.5) * WORLD.size * 1.05;
        const z = (rng() - 0.5) * WORLD.size * 1.05;
        const d = districtAt(x, z);
        if (d && (d.dress === 'porttown' || d.dress === 'castaway' || d.dress === 'anchorage' || d.dress === 'paddygate')) continue;
        if (WORLD.terrain.lake && Math.hypot(x - WORLD.terrain.lake.x, z - WORLD.terrain.lake.z) < WORLD.terrain.lake.r * 0.85) continue;
        if (!this.clearOfAssets(x, z, 2.4) || !this.clearOfExits(x, z)) continue;
        if (!this.flatEnough(x, z, 2.0, 1.5)) continue; // no palms up the canyon walls
        this.palm(x, z, 0.7 + rng() * 0.9);
        if (rng() < 0.5) this.fern(x + 1.5, z + 1, 0.6 + rng());
        placed++;
      }
    }

    // mushroom biomes (the Hollowdeep): glow-shrooms and stalagmites along
    // the corridor floor — the cave grows its own light
    if (WORLD.biome.trees === 'shard') {
      const rng = mulberry32(555777);
      let placed = 0;
      for (let i = 0; i < 400 && placed < 48; i++) {
        const x = (rng() - 0.5) * WORLD.size * 1.05;
        const z = (rng() - 0.5) * WORLD.size * 1.05;
        const d = districtAt(x, z);
        if (d && (d.dress === 'lastlight' || d.dress === 'shardsea' || d.dress === 'gloamgate' || d.dress === 'wickbothy' || d.dress === 'lampfall')) continue;
        if (!this.clearOfAssets(x, z, 2) || !this.clearOfExits(x, z)) continue;
        const h = 2 + rng() * 5;
        const shard = this.glassShard(h, rng() > 0.6 ? 0xb0a0ff : 0x7af0ff, rng);
        shard.position.set(x, terrainHeight(x, z) + h * 0.42, z);
        this.group.add(shard);
        this.staticTargets.push(shard);
        if (h > 3.4) this.addCollider(x, z, h * 0.15 + 0.4, h * 0.15 + 0.4, h * 0.8);
        placed++;
      }
    }

    if (WORLD.biome.trees === 'mushroom') {
      const rng = mulberry32(60660);
      let placed = 0;
      for (let i = 0; i < 700 && placed < 70; i++) {
        const x = (rng() - 0.5) * WORLD.size * 0.9;
        const z = (rng() - 0.5) * WORLD.size * 0.9;
        if (terrainHeight(x, z) > 8) continue; // corridor walls: nothing grows on the ceiling-slope
        const d = districtAt(x, z);
        if (d && (d.dress === 'cavemouth' || d.dress === 'lodecourt')) continue;
        if (!this.clearOfAssets(x, z, 2) || !this.clearOfExits(x, z)) continue;
        if (rng() < 0.55) this.mushroom(x, z, 0.5 + rng() * 1.1, rng() < 0.3);
        else this.stalagmite(x, z, 0.6 + rng() * 1);
        placed++;
      }
    }

    // the Shallows dresses its shoreline: shells, driftwood, kelp at the tideline
    if (WORLD.id === 'veldt_shallows') this.buildShoreline();
  }

  /** Beach dressing for the Shallows: shells, starfish, driftwood, kelp
   *  clumps where the sand dips toward the lagoon. */
  private buildShoreline(): void {
    const rng = mulberry32(20000);
    const lake = WORLD.terrain.lake!;
    const shellMat = toonMat({ color: 0xffe8e0 });
    const kelpMat = toonMat({ color: 0x2f6a4a });
    const woodMat = toonMat({ color: 0xb8a888, map: swatch('#a89878', 60) });
    let placed = 0;
    for (let i = 0; i < 900 && placed < 60; i++) {
      const x = (rng() - 0.5) * WORLD.size * 1.05;
      const z = (rng() - 0.5) * WORLD.size * 1.05;
      const h = terrainHeight(x, z);
      const toLake = Math.hypot(x - lake.x, z - lake.z);
      if (!this.clearOfAssets(x, z, 1.4)) continue;
      const nearTide = toLake > lake.r * 0.8 && toLake < lake.r * 1.25;
      const roll = rng();
      if (nearTide && roll < 0.4) {
        // kelp clump at the waterline
        for (let k = 0; k < 4; k++) {
          const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.09, 0.9 + rng() * 1.1, 4), kelpMat);
          blade.position.set(x + (rng() - 0.5) * 0.8, h + 0.45, z + (rng() - 0.5) * 0.8);
          blade.rotation.z = (rng() - 0.5) * 0.5;
          this.group.add(blade);
        }
        placed++;
      } else if (roll < 0.6) {
        const shell = new THREE.Mesh(new THREE.ConeGeometry(0.16 + rng() * 0.1, 0.24, 5), shellMat);
        shell.position.set(x, h + 0.12, z);
        shell.rotation.z = rng() * 2;
        this.group.add(shell);
        placed++;
      } else if (roll < 0.75) {
        // starfish: five stubby arms
        const star = new THREE.Group();
        for (let k = 0; k < 5; k++) {
          const arm = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.06, 0.1), toonMat({ color: 0xff8c5a }));
          arm.position.x = 0.14;
          const holder = new THREE.Group();
          holder.rotation.y = (k / 5) * Math.PI * 2;
          holder.add(arm);
          star.add(holder);
        }
        star.position.set(x, h + 0.08, z);
        this.group.add(star);
        placed++;
      } else if (roll < 0.88) {
        const drift = new THREE.Mesh(new THREE.CylinderGeometry(0.14 + rng() * 0.12, 0.2 + rng() * 0.12, 2.4 + rng() * 2.4, 6), woodMat);
        drift.rotation.z = Math.PI / 2 + (rng() - 0.5) * 0.3;
        drift.rotation.y = rng() * Math.PI;
        drift.position.set(x, h + 0.24, z);
        drift.castShadow = true;
        this.group.add(drift);
        this.staticTargets.push(drift);
        placed++;
      } else if (nearTide) {
        // a crab, mid-errand (decor-only)
        const crab = new THREE.Group();
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), toonMat({ color: 0xd87a4a }));
        body.scale.y = 0.6;
        body.position.y = 0.12;
        for (const side of [-1, 1]) {
          const claw = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), toonMat({ color: 0xe89a6a }));
          claw.position.set(side * 0.2, 0.1, 0.12);
          crab.add(claw);
        }
        crab.add(body);
        crab.position.set(x, h, z);
        crab.rotation.y = rng() * Math.PI * 2;
        this.group.add(crab);
        placed++;
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
    this.addCollider(poi.x - 1.1, poi.z, 0.35, 0.35, 2.8); // the pillar is solid
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
    const looks: Record<string, { coat: number; skin: number; hat: number; hatKind: 'top' | 'hood' | 'cap' | 'bun'; accent: number; label: string }> = {
      mayor: { coat: 0x8a6a1a, skin: 0xc89878, hat: 0x2a2622, hatKind: 'top', accent: 0xffd23c, label: 'TALK TO MAYOR BRASS' },
      brann: { coat: 0x2ba8a0, skin: 0xb08868, hat: 0x4a4442, hatKind: 'cap', accent: 0x7dffef, label: 'TALK TO BRANN' },
      mirelle: { coat: 0x4a6a8a, skin: 0xd8b090, hat: 0x8a94a0, hatKind: 'hood', accent: 0x9ad8e8, label: 'TALK TO MIRELLE' },
      okto: { coat: 0xe8e0cc, skin: 0x9a7858, hat: 0xe8e0cc, hatKind: 'hood', accent: 0xffb43c, label: 'TALK TO BROTHER OKTO' },
      juno: { coat: 0x3a8a5a, skin: 0xc89878, hat: 0xd8c898, hatKind: 'cap', accent: 0x9adc4a, label: 'TALK TO DR. CALLA' },
      peg: { coat: 0x4a5a66, skin: 0xb89070, hat: 0xd8d0c0, hatKind: 'bun', accent: 0x7dffd4, label: 'TALK TO QUARTERMISTRESS PEG' },
      wick: { coat: 0x3a2f6a, skin: 0xd8b090, hat: 0x2a2244, hatKind: 'hood', accent: 0x9a6aff, label: 'TALK TO WICK' },
      coil: { coat: 0x4a5248, skin: 0xb08868, hat: 0x8a7a2c, hatKind: 'cap', accent: 0xc8d24a, label: 'TALK TO FOREWOMAN COIL' },
      bet: { coat: 0x3a4a46, skin: 0xd8b090, hat: 0x2c3834, hatKind: 'hood', accent: 0x9adcd0, label: 'TALK TO BAROMETER BET' },
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
    } else if (look.hatKind === 'bun') {
      const bun = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), toonMat({ color: look.hat }));
      bun.position.set(0, 1.82, -0.08);
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.34, 4), toonMat({ color: look.accent }));
      pin.rotation.z = 1.1;
      pin.position.set(0.06, 1.86, -0.08);
      g.add(bun, pin);
    } else {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 0.34), toonMat({ color: look.hat }));
      cap.position.y = 1.8;
      g.add(cap);
    }
    // arms + boots + a belt — statues no more
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.56, 0.15), toonMat({ color: look.coat }));
    armL.position.set(-0.38, 1.06, 0);
    armL.rotation.z = 0.1;
    const armR = armL.clone();
    armR.position.x = 0.38;
    armR.rotation.z = -0.1;
    // Wick's right arm is glass to the shoulder — it chimes in cold weather
    if (poi.data === 'wick') {
      armR.material = new THREE.MeshToonMaterial({ color: 0x7af0ff, transparent: true, opacity: 0.55 });
      const knuckle = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), glowMat(0x7af0ff, 0.9));
      knuckle.position.set(0.4, 0.76, 0.02);
      g.add(knuckle);
    }
    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.08, 0.36), toonMat({ color: 0x2a2622 }));
    belt.position.y = 0.74;
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.03), toonMat({ color: look.accent }));
    buckle.position.set(0, 0.74, 0.19);
    for (const side of [-1, 1]) {
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.26), toonMat({ color: 0x2a2622 }));
      boot.position.set(side * 0.12, 0.06, 0.03);
      g.add(boot);
    }
    const pin = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), glowMat(look.accent, 1));
    pin.position.set(0.18, 1.24, 0.18);
    const marker = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 4), glowMat(0xc06bff, 0.95));
    marker.position.y = 2.35;
    marker.rotation.x = Math.PI;
    marker.name = 'quest_marker';
    g.add(armL, armR, belt, buckle, pin, marker);
    g.position.set(poi.x, y, poi.z);
    g.rotation.y = poi.rot ?? 0;
    g.traverse((o) => (o.castShadow = true));
    this.group.add(g);
    this.registerNpcRig(g, head, armR);
    this.addCollider(poi.x, poi.z, 0.5, 0.5);
    this.interactables.push({ kind: 'npc', pos: new THREE.Vector3(poi.x, y, poi.z), label: look.label, data: poi.data });
  }

  /** REDLINE RITA — leathers, goggles, and a stopwatch she doesn't need. */
  private buildRacerNpc(poi: WorldPoi): void {
    const y = terrainHeight(poi.x, poi.z);
    const g = new THREE.Group();
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.7, 0.3), toonMat({ color: 0x3a3632 }));
    legs.position.y = 0.35;
    const jacket = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.66, 0.36), toonMat({ color: 0xb43a2a, map: swatch('#9e3226', 70) }));
    jacket.position.y = 1.06;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.1, 0.38), toonMat({ color: 0xf0e8d8 }));
    stripe.position.y = 1.12;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.32, 0.3), toonMat({ color: 0xc09070 }));
    head.position.y = 1.6;
    // grey bun + goggles pushed up
    const bun = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), toonMat({ color: 0xd8d8d0 }));
    bun.position.set(0, 1.82, 0.08);
    const goggleBand = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.08, 10), toonMat({ color: 0x2a2622 }));
    goggleBand.position.y = 1.74;
    for (const side of [-1, 1]) {
      const lens = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), glowMat(0x54d4ff, 0.85));
      lens.position.set(side * 0.08, 1.76, -0.14);
      g.add(lens);
    }
    // stopwatch hand
    const watch = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), glowMat(0xffd23c, 0.9));
    watch.position.set(0.32, 1.15, -0.2);
    const marker = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 4), glowMat(0xff8c2a, 0.95));
    marker.position.y = 2.35;
    marker.rotation.x = Math.PI;
    marker.name = 'quest_marker';
    // arms — one permanently checking the stopwatch
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.56, 0.15), toonMat({ color: 0xb43a2a }));
    armL.position.set(-0.38, 1.06, 0);
    const armR = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.44, 0.15), toonMat({ color: 0xb43a2a }));
    armR.position.set(0.36, 1.12, -0.1);
    armR.rotation.x = -0.9;
    g.add(legs, jacket, stripe, head, bun, goggleBand, watch, marker, armL, armR);
    g.position.set(poi.x, y, poi.z);
    g.rotation.y = poi.rot ?? 0;
    g.traverse((o) => (o.castShadow = true));
    this.group.add(g);
    this.registerNpcRig(g, head, armR);
    this.addCollider(poi.x, poi.z, 0.5, 0.5);
    this.interactables.push({ kind: 'racer', pos: new THREE.Vector3(poi.x, y, poi.z), label: 'TALK RACING WITH REDLINE RITA', data: poi.data, range: 5 });
  }

  /** Pit-row pad where the Junkstallion parks. The buggy itself is owned by
   *  the vehicle system; the world just dresses the spot. */
  private buildBuggyPad(poi: WorldPoi): void {
    const y = terrainHeight(poi.x, poi.z);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.6, 0.18, 16), toonMat({ color: 0x4a4a52, map: swatch('#3f3f47', 50) }));
    pad.position.set(poi.x, y + 0.09, poi.z);
    pad.receiveShadow = true;
    this.group.add(pad);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.9, 0.16), toonMat({ color: 0xd88428 }));
      post.position.set(poi.x + Math.cos(a) * 3.2, y + 0.45, poi.z + Math.sin(a) * 3.2);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), glowMat(0xffd23c, 0.9));
      lamp.position.set(post.position.x, y + 0.98, post.position.z);
      this.group.add(post, lamp);
    }
  }

  /** A downed hauler chunk: tilted hull plate, ribs, and a salvage point. */
  private buildWreck(poi: WorldPoi): void {
    const y = terrainHeight(poi.x, poi.z);
    const g = new THREE.Group();
    const hullMat = toonMat({ color: 0x7a5a44, map: corrugatedTexture('#6a4a36') });
    const ribMat = toonMat({ color: 0x5a4a42, map: swatch('#4e4038', 60) });
    // main hull slab, nose-down in the dirt
    const slab = new THREE.Mesh(new THREE.BoxGeometry(7, 0.8, 4.6), hullMat);
    slab.position.set(0, 2.2, 0);
    slab.rotation.set(0.5, 0.2, 0.65);
    g.add(slab);
    // ribs poking out
    for (let i = 0; i < 3; i++) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(2.2 - i * 0.3, 0.16, 6, 12, Math.PI * 0.85), ribMat);
      rib.position.set(-1.5 + i * 1.6, 0.4, 1.2 - i * 0.8);
      rib.rotation.set(0, i * 0.5, 0.35);
      g.add(rib);
    }
    // an engine drum spilled beside it
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 2.2, 12), ribMat);
    drum.position.set(2.6, 1.05, -1.6);
    drum.rotation.z = Math.PI / 2 - 0.2;
    g.add(drum);
    // salvage glow: the plate you're here for
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), glowMat(0xffd23c, 1));
    glow.position.set(0.4, 1.6, 0.6);
    glow.name = 'blinker';
    g.add(glow);
    g.position.set(poi.x, y, poi.z);
    g.rotation.y = poi.rot ?? 0;
    g.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
    this.group.add(g);
    this.staticTargets.push(g);
    this.addCollider(poi.x, poi.z, 3.6, 2.8);
    this.interactables.push({ kind: 'wreck', pos: new THREE.Vector3(poi.x, y, poi.z), label: 'SALVAGE THE WRECK', data: poi.id, range: 6.2 });
  }

  /** HELIX-9 expedition crates: Peg's fetch cargo, scattered where the
   *  supply drop broke up. Strapped crate + beacon; hauled (removed) on pickup. */
  private cargoCrates = new Map<string, { group: THREE.Group; box: AABB }>();
  private buildCargo(poi: WorldPoi): void {
    const y = terrainHeight(poi.x, poi.z);
    const g = new THREE.Group();
    const crateMat = toonMat({ color: 0x9a7a4e, map: corrugatedTexture('#7c5f3c') });
    const strapMat = toonMat({ color: 0x2c343c, map: swatch('#262e36', 60) });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.1, 1.1), crateMat);
    body.position.y = 0.55;
    g.add(body);
    for (const off of [-0.45, 0.45]) {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.16, 1.16), strapMat);
      strap.position.set(off, 0.55, 0);
      g.add(strap);
    }
    // stencil plate on the lid
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.04, 0.6), toonMat({ color: 0xd8c56a, map: swatch('#c9b45a', 60) }));
    plate.position.y = 1.12;
    g.add(plate);
    // drop-beacon stub with a blinking gold light
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 6), strapMat);
    mast.position.set(0.55, 1.55, -0.35);
    g.add(mast);
    const blink = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 8), glowMat(0xffd23c, 1));
    blink.position.set(0.55, 2.0, -0.35);
    blink.name = 'blinker';
    g.add(blink);
    g.position.set(poi.x, y, poi.z);
    g.rotation.y = poi.rot ?? 0;
    g.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
    this.group.add(g);
    this.staticTargets.push(g);
    this.addCollider(poi.x, poi.z, 0.85, 0.7, 1.4);
    this.cargoCrates.set(poi.id, { group: g, box: this.colliders[this.colliders.length - 1] });
    this.interactables.push({ kind: 'cargo', pos: new THREE.Vector3(poi.x, y, poi.z), label: 'RECOVER EXPEDITION CRATE (HELIX-9)', data: poi.id, range: 3.8 });
  }

  /** Haul a crate away: mesh, collider, and target all leave the world. */
  consumeCargo(id: string): void {
    const c = this.cargoCrates.get(id);
    if (!c) return;
    this.group.remove(c.group);
    const ti = this.staticTargets.indexOf(c.group);
    if (ti >= 0) this.staticTargets.splice(ti, 1);
    const ci = this.colliders.indexOf(c.box);
    if (ci >= 0) this.colliders.splice(ci, 1);
    this.cargoCrates.delete(id);
  }

  /** The Crucible's street entrance (Brasshaven) / exit tunnel (pit side):
   *  a scrap arch, caged bulbs, and a house Re-Constructor for the losers. */
  private buildPitDoor(poi: WorldPoi): void {
    const y = terrainHeight(poi.x, poi.z);
    const g = new THREE.Group();
    const isExit = poi.data === 'exit';
    const frameMat = toonMat({ color: 0x5a4a44, map: rockTexture('#54453f') });
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.9, 5.2, 0.9), frameMat);
      post.position.set(side * 2.6, 2.6, 0);
      g.add(post);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(6.6, 1.0, 1.1), frameMat);
    lintel.position.y = 5.4;
    g.add(lintel);
    const boardTex = posterTexture(
      isExit
        ? { lines: ['DAYLIGHT', '→'], style: 'warning', bg: '#2a1a2e', fg: '#ffd23c', accent: '#ff5a86' }
        : { lines: ['THE', 'CRUCIBLE'], style: 'ad', bg: '#2a1a2e', fg: '#ff5a86', accent: '#ffd23c' },
      6.0 / 1.4,
    );
    const board = new THREE.Mesh(new THREE.PlaneGeometry(6.0, 1.4), new THREE.MeshBasicMaterial({ map: boardTex }));
    board.position.set(0, 5.42, 0.58);
    g.add(board);
    // the doorway glow: hot pit light bleeding out
    const maw = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.6), glowMat(isExit ? 0xffd8a0 : 0xc86a3a, 0.3));
    maw.position.set(0, 2.35, -0.1);
    g.add(maw);
    for (const side of [-1, 1]) {
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), glowMat(0xff5a86, 0.95));
      bulb.position.set(side * 2.6, 5.05, 0.5);
      bulb.name = 'blinker';
      g.add(bulb);
    }
    // house Re-Constructor beside the door — where the pit spits you out
    if (!isExit) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.8, 0.5), toonMat({ color: 0x5a646e }));
      pillar.position.set(4.2, 1.4, 0.4);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.05, 8, 22), glowMat(0x54d4ff, 0.9));
      ring.rotation.x = Math.PI / 2;
      ring.position.set(4.2, 0.3, 1.6);
      ring.name = 'ft_ring';
      g.add(pillar, ring);
    }
    g.position.set(poi.x, y, poi.z);
    g.rotation.y = poi.rot ?? 0;
    g.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
    this.group.add(g);
    this.staticTargets.push(g);
    // posts collide; the doorway stays walkable
    const rot = poi.rot ?? 0;
    for (const side of [-1, 1]) {
      const px = poi.x + Math.cos(rot) * side * 2.6;
      const pz = poi.z - Math.sin(rot) * side * 2.6;
      this.addCollider(px, pz, 0.7, 0.7);
    }
    this.interactables.push({
      kind: 'pit',
      pos: new THREE.Vector3(poi.x, y, poi.z),
      label: isExit ? 'WALK BACK OUT TO BRASSHAVEN' : 'ENTER THE CRUCIBLE — WAVES FOR CASH',
      data: poi.data,
    });
  }

  // ------------------------------------------------------------ rust gulch
  /** Pit row: Rita's garage, the start/finish arch, bleachers, tire walls. */
  private buildGulchGate(d: DistrictDef): void {
    const rng = mulberry32(4242);
    // start/finish arch spans ACROSS the local racing line. Rust Gulch's
    // grid runs along +z; the GP corridors run diagonals, so the gate reads
    // its heading off the first track segment instead of assuming one.
    let vx = 0, vz = 1;           // direction of travel
    let archX = d.cx, archZ = d.cz + 8;
    if (this.raceLine && this.raceLine.length > 1) {
      const a = this.raceLine[0], b = this.raceLine[1];
      const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      vx = (b.x - a.x) / len; vz = (b.z - a.z) / len;
      const c = this.trackClosest(d.cx, d.cz);
      archX = c.px + vx * 8; archZ = c.pz + vz * 8;
    }
    const ux = -vz, uz = vx;      // across the track
    const gy = terrainHeight(archX, archZ);
    const poleMat = toonMat({ color: 0xd88428, map: swatch('#c1731f', 70) });
    for (const side of [-1, 1]) {
      const px = archX + ux * side * 11, pz = archZ + uz * side * 11;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 9, 10), poleMat);
      pole.position.set(px, terrainHeight(px, pz) + 4.5, pz);
      this.group.add(pole);
      this.addCollider(px, pz, 0.8, 0.8);
    }
    // the arch names ITS track — the gulch is Rita's, the GP paddocks brand
    // themselves after their own map
    const archLines = WORLD.id === 'rustgulch' ? ['REDLINE’S', 'RUN'] : (() => {
      const words = WORLD.name.split(' ');
      return words.length > 1 ? [words.slice(0, -1).join(' '), words[words.length - 1]] : [WORLD.name];
    })();
    const bannerTex = posterTexture({ lines: archLines, style: 'ad', bg: '#2a2622', fg: '#ffd23c', accent: '#ff5a86' }, 20 / 2.6);
    const bannerYaw = Math.atan2(-vx, -vz);
    for (const flip of [0, Math.PI]) { // readable from both directions
      const banner = new THREE.Mesh(new THREE.PlaneGeometry(20, 2.6), new THREE.MeshBasicMaterial({ map: bannerTex }));
      const off = flip === 0 ? 0.05 : -0.05;
      banner.position.set(archX + vx * off, gy + 8.6, archZ + vz * off);
      banner.rotation.y = bannerYaw + flip;
      this.group.add(banner);
    }
    // checkered start line painted on the road — laid as short segments
    // across the travel direction, each seated on ITS OWN patch of ground,
    // so a cambered grid can't leave any part of the stripe floating
    const lineTex = posterTexture({ lines: ['▚▚'], style: 'warning', bg: '#f0e8d8', fg: '#181818', accent: '#181818' }, 1.5);
    const lineMat = new THREE.MeshBasicMaterial({ map: lineTex, transparent: true, opacity: 0.85 });
    const spin = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.atan2(-uz, ux));
    for (let s = 0; s < 6; s++) {
      const along = -7.5 + s * 3;
      const sx = archX + ux * along, sz = archZ + uz * along;
      const seg = new THREE.Mesh(new THREE.PlaneGeometry(3.06, 2), lineMat);
      const sn = terrainNormal(sx, sz);
      seg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(sn.x, sn.y, sn.z).normalize()).multiply(spin);
      seg.position.set(sx, terrainHeight(sx, sz) + 0.1, sz);
      this.group.add(seg);
    }

    // Rita's garage: lean-to + workbench + a work lamp so the inside reads.
    // On the GP paddocks the default spot can land on a corridor wall — the
    // garage shops around for level ground before pouring a slab
    const garageSpot = (x: number, z: number): boolean => this.flatEnough(x, z, 3.4, 1.6) && this.trackDist(x, z) > 14;
    let gx = d.cx + 10, gz = d.cz + 28;
    if (!garageSpot(gx, gz)) { gx = d.cx - 12; gz = d.cz - 8; }
    if (!garageSpot(gx, gz)) { gx = d.cx + 12; gz = d.cz - 10; }
    if (!garageSpot(gx, gz)) { gx = d.cx - 14; gz = d.cz + 14; }
    const garageOk = this.flatEnough(gx, gz, 3.4, 1.8) && this.trackDist(gx, gz) > 14;
    const gyy = terrainHeight(gx, gz);
    if (garageOk) {
    const shack = new THREE.Group();
    const wallMat = toonMat({ color: 0x9a7a58, map: corrugatedTexture('#8a6a4c') });
    const back = new THREE.Mesh(new THREE.BoxGeometry(7, 3.4, 0.3), wallMat);
    back.position.set(0, 1.7, -2.4);
    const sideW = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.4, 4.8), wallMat);
    sideW.position.set(-3.4, 1.7, 0);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.24, 5.6), toonMat({ color: 0x5a4a42, map: corrugatedTexture('#4e4038') }));
    roof.position.set(0, 3.5, 0.2);
    roof.rotation.x = 0.1;
    const bench = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.0, 0.9), toonMat({ color: 0x4a4a52 }));
    bench.position.set(-1.8, 0.5, -1.6);
    const toolbox = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.4, 0.4), toonMat({ color: 0xb43a2a }));
    toolbox.position.set(-1.6, 1.2, -1.6);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), glowMat(0xffe8b0, 0.95));
    lamp.position.set(0, 3.1, -0.6);
    const lampCord = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 4), toonMat({ color: 0x2a2622 }));
    lampCord.position.set(0, 3.34, -0.6);
    const pinup = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.0),
      new THREE.MeshBasicMaterial({ map: posterTexture({ lines: ['11:40', 'FLAT'], style: 'graffiti', bg: '#2a2622', fg: '#ffd23c', accent: '#ff5a86' }, 1.4) }));
    pinup.position.set(1.6, 1.9, -2.2);
    shack.add(back, sideW, roof, bench, toolbox, lamp, lampCord, pinup);
    shack.position.set(gx, gyy, gz);
    shack.rotation.y = -0.5;
    shack.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
    this.group.add(shack);
    this.staticTargets.push(shack);
    // colliders hug the actual walls (the old whole-shack AABB read as an
    // invisible wall and boxed Rita in) — the open side stays walkable
    const cos = Math.cos(-0.5), sin = Math.sin(-0.5);
    const wallSpot = (lx: number, lz: number): [number, number] => [gx + lx * cos + lz * sin, gz - lx * sin + lz * cos];
    const [bwx, bwz] = wallSpot(0, -2.4);
    this.addCollider(bwx, bwz, 3.3, 0.6);        // back wall
    const [swx, swz] = wallSpot(-3.4, 0);
    this.addCollider(swx, swz, 0.6, 2.2);        // side wall
    const [bx2, bz2] = wallSpot(-1.8, -1.6);
    this.addCollider(bx2, bz2, 1.4, 0.6);        // bench
    }

    // tire stacks + oil drums scattered around pit row
    const tireMat = toonMat({ color: 0x22221f, map: swatch('#1d1d1a', 40) });
    for (let i = 0; i < 9; i++) {
      const a = rng() * Math.PI * 2;
      const r = 12 + rng() * 22;
      const x = d.cx + Math.cos(a) * r, z = d.cz + Math.sin(a) * r;
      if (Math.abs((x - archX) * ux + (z - archZ) * uz) < 10 && Math.abs((x - archX) * vx + (z - archZ) * vz) < 6) continue; // the grid box stays clear
      if (roadFactor(x, z) > 0.15) continue;      // never on any racing line
      if (this.trackDist(x, z) < 12.5) continue;  // ...including the GP corridors
      if (!this.flatEnough(x, z, 1.2, 0.9)) continue; // never up the paddock walls
      const stackH = 1 + Math.floor(rng() * 3);
      for (let s = 0; s < stackH; s++) {
        const tire = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.22, 8, 14), tireMat);
        tire.rotation.x = Math.PI / 2;
        tire.position.set(x, terrainHeight(x, z) + 0.22 + s * 0.42, z);
        tire.castShadow = true;
        this.group.add(tire);
      }
      this.addCollider(x, z, 0.75, 0.75);
    }

    // plank bleachers facing the straight (only where the ground allows,
    // and always OFF the ribbon itself)
    const bleachX = archX + ux * 16 - vx * 8, bleachZ = archZ + uz * 16 - vz * 8;
    if (this.flatEnough(bleachX, bleachZ, 3, 1.4) && this.trackDist(bleachX, bleachZ) > 13.5) {
      for (let row = 0; row < 3; row++) {
        const plank = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.22, 10), toonMat({ color: 0x8a6a4a, map: swatch('#7a5a3e', 60) }));
        plank.position.set(bleachX + row * 1.1, terrainHeight(bleachX, bleachZ) + 0.5 + row * 0.55, bleachZ);
        plank.castShadow = true;
        this.group.add(plank);
      }
      this.addCollider(bleachX + 1, bleachZ, 2.2, 5.2);
    }

    // string lights from the arch to the garage
    if (garageOk) for (let i = 0; i < 6; i++) {
      const t = i / 5;
      const ax = archX + ux * 11, az = archZ + uz * 11; // from the nearer pole
      const lx = ax + (gx - ax) * t, lz = az + (gz - az) * t;
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 6), glowMat([0xffd23c, 0xff5a86, 0x54d4ff][i % 3], 0.9));
      bulb.position.set(lx, terrainHeight(lx, lz) + 4.6 - Math.sin(t * Math.PI) * 0.7, lz);
      this.group.add(bulb);
    }
  }

  /** Race-day set dressing along REDLINE'S RUN — all of it OFF the racing
   *  line: billboards on the outfield, flag bunting strung high over two
   *  checkpoints, a windsock, and pit-row clutter. */
  private buildGulchTrackDecor(): void {
    const legMat = toonMat({ color: 0x4a4a52, map: swatch('#3f3f47', 50) });

    const billboard = (x: number, z: number, rot: number, lines: string[], bg: string, fg: string): void => {
      const y = terrainHeight(x, z);
      const g = new THREE.Group();
      for (const side of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 4.6, 0.3), legMat);
        leg.position.set(side * 2.6, 2.3, 0);
        g.add(leg);
      }
      const board = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 3.0),
        new THREE.MeshBasicMaterial({ map: posterTexture({ lines, style: 'ad', bg, fg, accent: '#ff5a86' }, 6.4 / 3.0) }));
      board.position.set(0, 5.6, 0.06);
      const boardBack = new THREE.Mesh(new THREE.BoxGeometry(6.5, 3.1, 0.12), legMat);
      boardBack.position.set(0, 5.6, -0.05);
      g.add(board, boardBack);
      g.position.set(x, y, z);
      g.rotation.y = rot;
      g.traverse((o) => { o.castShadow = true; });
      this.group.add(g);
      this.staticTargets.push(g);
      const cos = Math.cos(rot), sin = Math.sin(rot);
      for (const side of [-1, 1]) {
        this.addCollider(x + side * 2.6 * cos, z - side * 2.6 * sin, 0.4, 0.4);
      }
    };
    billboard(-168, 64, 1.1, ['EAT MY', 'DUST', '— R. (ret.)'], '#2a2622', '#ffd23c');
    billboard(36, 168, Math.PI + 0.15, ['BOOST', 'RESPONSIBLY'], '#5a2a6a', '#7dffef');
    billboard(72, 74, -1.3, ['SHIPBREAK', 'SALVAGE CO.'], '#7a5030', '#f0e8d8');
    billboard(-14, -172, 0.15, ['LAST DRINK', 'BEFORE', 'THE JUMP'], '#2a4a5a', '#ffd23c');

    // flag bunting strung high across the line at two checkpoints
    const bunting = (cx: number, cz: number, dirX: number, dirZ: number): void => {
      const len = Math.hypot(dirX, dirZ);
      const px = -dirZ / len, pz = dirX / len; // perpendicular to the road
      const flagColors = [0xffd23c, 0xff5a86, 0x54d4ff, 0x7dff2a];
      for (const side of [-1, 1]) {
        const x = cx + px * 12 * side, z = cz + pz * 12 * side;
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 7.4, 6), legMat);
        pole.position.set(x, terrainHeight(x, z) + 3.7, z);
        pole.castShadow = true;
        this.group.add(pole);
        this.addCollider(x, z, 0.35, 0.35);
      }
      const yTop = Math.max(terrainHeight(cx + px * 12, cz + pz * 12), terrainHeight(cx - px * 12, cz - pz * 12)) + 7;
      for (let i = 0; i < 11; i++) {
        const t = i / 10;
        const x = cx + px * 12 * (t * 2 - 1);
        const z = cz + pz * 12 * (t * 2 - 1);
        const sag = Math.sin(t * Math.PI) * 0.9;
        const flag = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.55, 3), toonMat({ color: flagColors[i % flagColors.length] }));
        flag.position.set(x, yTop - sag, z);
        flag.rotation.x = Math.PI; // pennant points down
        this.group.add(flag);
      }
    };
    bunting(-40, 145, 180, 55);   // north-west sweep (gate 2)
    bunting(140, -60, 0, -1);     // fork-1 rejoin (gate 4)

    // windsock at pit row — race day has weather opinions
    const wx = -158, wz = 16;
    const wy = terrainHeight(wx, wz);
    const wPole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 5.2, 6), legMat);
    wPole.position.set(wx, wy + 2.6, wz);
    const sock = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.6, 8, 1, true), toonMat({ color: 0xff8c2a }));
    sock.position.set(wx + 0.9, wy + 5.0, wz);
    sock.rotation.z = Math.PI / 2 + 0.25;
    sock.name = 'windsock';
    this.group.add(wPole, sock);
    this.addCollider(wx, wz, 0.3, 0.3);

    // a stripped kart husk parked behind the garage, picked clean
    const kx = -134, kz = 36;
    const ky = terrainHeight(kx, kz);
    const husk = new THREE.Group();
    const tub = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 2.4), toonMat({ color: 0x6a5a4a, map: swatch('#5e5040', 60) }));
    tub.position.y = 0.55;
    husk.add(tub);
    for (const [sx, sz] of [[-0.8, -1], [0.8, 0.9]] as const) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.3, 10), toonMat({ color: 0x22221f }));
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(sx, 0.45, sz);
      husk.add(wheel); // the other two wheels are, of course, gone
    }
    const cactusNote = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5),
      new THREE.MeshBasicMaterial({ map: posterTexture({ lines: ['4 SALE', 'RAN WNCE'], style: 'graffiti', bg: '#e8dcc0', fg: '#181818' }, 1.6) }));
    cactusNote.position.set(0, 1.05, -1.21);
    husk.add(cactusNote);
    husk.position.set(kx, ky, kz);
    husk.rotation.y = 0.7;
    husk.traverse((o) => { o.castShadow = true; });
    this.group.add(husk);
    this.staticTargets.push(husk);
    this.addCollider(kx, kz, 1.1, 1.4);

    // pit-row oil stains — every garage has a story
    for (const [ox, oz, r] of [[-138, 12, 1.3], [-133, 8, 0.9], [-142, 18, 1.1]] as const) {
      const stain = new THREE.Mesh(new THREE.CircleGeometry(r, 12),
        new THREE.MeshBasicMaterial({ color: 0x1a1512, transparent: true, opacity: 0.55 }));
      stain.rotation.x = -Math.PI / 2;
      stain.position.set(ox, terrainHeight(ox, oz) + 0.03, oz);
      this.group.add(stain);
    }
  }

  /** Wreck fields: hauler spines, plate lean-tos, cargo spill, scrap piles. */
  private buildShipbreak(d: DistrictDef): void {
    const rng = mulberry32(d.cx * 31 + d.cz * 7);
    const hullMat = toonMat({ color: 0x7a5a44, map: corrugatedTexture('#6a4a36') });
    const ribMat = toonMat({ color: 0x5a4a42, map: swatch('#4e4038', 60) });
    // one great spine down the middle: rib arcs shrinking along an axis
    const spineA = rng() * Math.PI * 2;
    for (let i = 0; i < 6; i++) {
      const t = i / 5;
      const x = d.cx + Math.cos(spineA) * (t - 0.5) * d.radius * 1.1;
      const z = d.cz + Math.sin(spineA) * (t - 0.5) * d.radius * 1.1;
      const r = 6.5 - t * 3;
      const rib = new THREE.Mesh(new THREE.TorusGeometry(r, 0.35, 8, 16, Math.PI), ribMat);
      rib.position.set(x, terrainHeight(x, z) + 0.2, z);
      rib.rotation.set(0, spineA + Math.PI / 2, 0);
      rib.castShadow = true;
      this.group.add(rib);
      this.staticTargets.push(rib);
      this.addCollider(x, z, 1.2, 1.2);
    }
    // tilted plate walls + cargo crates + scrap piles
    for (let i = 0; i < 10; i++) {
      const a = rng() * Math.PI * 2;
      const r = d.radius * (0.25 + rng() * 0.65);
      const x = d.cx + Math.cos(a) * r, z = d.cz + Math.sin(a) * r;
      const y = terrainHeight(x, z);
      const kind = rng();
      if (kind < 0.4) {
        const plate = new THREE.Mesh(new THREE.BoxGeometry(4 + rng() * 3, 3 + rng() * 2, 0.4), hullMat);
        plate.position.set(x, y + 1.2, z);
        plate.rotation.set((rng() - 0.5) * 0.5, rng() * Math.PI, (rng() - 0.5) * 0.6);
        plate.castShadow = true;
        this.group.add(plate);
        this.staticTargets.push(plate);
        this.addCollider(x, z, 2.2, 1.4);
      } else if (kind < 0.7) {
        const crate = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), toonMat({ color: 0x8a6a1a, map: swatch('#7a5e18', 60) }));
        crate.position.set(x, y + 0.8, z);
        crate.rotation.y = rng() * Math.PI;
        crate.castShadow = true;
        this.group.add(crate);
        this.staticTargets.push(crate);
        this.addCollider(x, z, 1.0, 1.0);
      } else {
        const pile = new THREE.Mesh(new THREE.DodecahedronGeometry(0.9 + rng() * 0.8, 0), ribMat);
        pile.position.set(x, y + 0.5, z);
        pile.rotation.set(rng() * 2, rng() * 2, rng());
        pile.castShadow = true;
        this.group.add(pile);
        this.addCollider(x, z, 0.9, 0.9);
      }
    }
    // salvage-company floodlight on a mast
    const mx = d.cx + 6, mz = d.cz - 4;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 8, 8), ribMat);
    mast.position.set(mx, terrainHeight(mx, mz) + 4, mz);
    const lampHead = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 8), glowMat(0xffe8b0, 0.9));
    lampHead.position.set(mx, terrainHeight(mx, mz) + 8.1, mz);
    this.group.add(mast, lampHead);
    this.addCollider(mx, mz, 0.4, 0.4);
  }

  /** Still water: toon disc + drifting glint texture; ponds get lilies + reeds. */
  private water(x: number, z: number, r: number, opts: { lilies?: boolean; level?: number } = {}): void {
    const level = opts.level ?? terrainHeight(x, z) + 0.18;
    this.ponds.push({ x, z, r });
    // pond-sized water gets an earthen berm hugging the shoreline so the
    // disc never reads as a bare blue circle laid on open grass — each berm
    // segment sits on ITS OWN terrain height, sealing gaps on slopes
    if (r <= 12) {
      const berm = toonMat({ color: 0xffffff, map: swatch(WORLD.biome.ground.dark, 50) });
      const n = Math.max(10, Math.round(r * 2.2));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const bx = x + Math.cos(a) * (r + 0.5), bz = z + Math.sin(a) * (r + 0.5);
        const by = terrainHeight(bx, bz);
        const seg = new THREE.Mesh(new THREE.BoxGeometry((2 * Math.PI * r) / n * 1.35, 0.9, 1.7), berm);
        seg.position.set(bx, Math.max(by, level - 0.55) + 0.18, bz);
        seg.rotation.y = -a + Math.PI / 2;
        seg.rotation.z = (Math.sin(i * 3.7) * 0.06);
        this.group.add(seg);
      }
    }
    const tex = waterTexture();
    const pool = new THREE.Mesh(new THREE.CircleGeometry(r, 28),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.88 }));
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(x, level, z);
    this.group.add(pool);
    this.scrollTex.push({ tex, vy: 0.02 });
    const rim = new THREE.Mesh(new THREE.RingGeometry(r * 0.97, r * 1.04, 28),
      new THREE.MeshBasicMaterial({ color: 0xcfeaf5, transparent: true, opacity: 0.5 }));
    rim.rotation.x = -Math.PI / 2;
    rim.position.set(x, level + 0.02, z);
    this.group.add(rim);
    if (opts.lilies) {
      const lilyMat = toonMat({ color: 0x3a9a3a });
      for (let i = 0; i < Math.min(6, r); i++) {
        const a = i * 2.4, rr = (0.3 + (i % 3) * 0.22) * r;
        const lily = new THREE.Mesh(new THREE.CircleGeometry(0.4, 7), lilyMat);
        lily.rotation.x = -Math.PI / 2;
        lily.position.set(x + Math.cos(a) * rr, level + 0.03, z + Math.sin(a) * rr);
        this.group.add(lily);
        if (i % 2 === 0) {
          const bloom = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), glowMat(0xff6aa0, 0.85));
          bloom.position.set(lily.position.x, level + 0.14, lily.position.z);
          this.group.add(bloom);
        }
      }
      const reedMat = toonMat({ color: 0x2f7a34 });
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + 0.3;
        const reed = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.2 + (i % 3) * 0.4, 4), reedMat);
        reed.position.set(x + Math.cos(a) * r * 1.02, level + 0.6, z + Math.sin(a) * r * 1.02);
        reed.rotation.z = (i % 2 ? 1 : -1) * 0.08;
        this.group.add(reed);
      }
    }
  }

  // ================================================== SHIPWRECK SHALLOWS
  /** Driftwood Rest — Peg's camp: shack, signal fire, fish racks, one very
   *  repurposed rowboat. The only dry furniture on the coast. */
  private buildCastaway(d: DistrictDef): void {
    const cx = d.cx, cz = d.cz;
    const wood = toonMat({ color: 0xb8a078, map: swatch('#a89068', 80) });
    const tarpMat = toonMat({ color: 0x4a7a72, map: swatch('#3f6a62', 60) });
    const spot = (lx: number, lz: number): [number, number] => [cx + lx, cz + lz];

    // Peg's shack: three driftwood walls + tarp roof, open toward the fire
    const shack = new THREE.Group();
    const [sx, sz] = spot(6, -4);
    const back = new THREE.Mesh(new THREE.BoxGeometry(6.4, 3.2, 0.4), wood);
    back.position.set(0, 1.6, -2.8);
    const sideL = new THREE.Mesh(new THREE.BoxGeometry(0.4, 3.0, 5.6), wood);
    sideL.position.set(-3.1, 1.5, 0);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(7.4, 0.24, 7), tarpMat);
    roof.position.set(0, 3.3, 0.2);
    roof.rotation.x = 0.08;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 3.3, 6), wood);
    post.position.set(3, 1.65, 2.6);
    const desk = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.9, 1.1), wood);
    desk.position.set(0.4, 0.45, 1.4);
    // the ledger: a glowing white slab of paperwork that SURVIVED
    const ledger = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.7), toonMat({ color: 0xf0ead8 }));
    ledger.position.set(0.4, 0.95, 1.4);
    ledger.rotation.y = 0.3;
    shack.add(back, sideL, roof, post, desk, ledger);
    shack.position.set(sx, terrainHeight(sx, sz), sz);
    shack.rotation.y = -0.4;
    shack.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
    this.group.add(shack);
    this.staticTargets.push(shack);
    // wall-hugging colliders only — the bay stays walkable
    const cos = Math.cos(0.4), sin = Math.sin(0.4);
    const wallSpot = (lx: number, lz: number): [number, number] => [sx + lx * cos + lz * sin, sz - lx * sin + lz * cos];
    const [bx, bz] = wallSpot(0, -2.8);
    this.addCollider(bx, bz, 3.2, 0.5);
    const [lx2, lz2] = wallSpot(-3.1, 0);
    this.addCollider(lx2, lz2, 0.5, 2.8);
    const [dx2, dz2] = wallSpot(0.4, 1.4);
    this.addCollider(dx2, dz2, 1.3, 0.6);

    // the regulation signal fire — log tripod, flame, smoke
    const [fx2, fz2] = spot(-4, 4);
    const fy = terrainHeight(fx2, fz2);
    const fire = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 2.4, 5), wood);
      log.position.set(Math.cos(a) * 0.5, 1, Math.sin(a) * 0.5);
      log.rotation.z = Math.cos(a) * 0.5;
      log.rotation.x = Math.sin(a) * 0.5;
      fire.add(log);
    }
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.3, 7), glowMat(0xffb43c, 0.95));
    flame.position.y = 0.8;
    flame.name = 'blinker';
    const smoke = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.2, 4.5, 7), new THREE.MeshBasicMaterial({ color: 0xbfc8c8, transparent: true, opacity: 0.24 }));
    smoke.position.y = 4;
    fire.add(flame, smoke);
    fire.position.set(fx2, fy, fz2);
    this.group.add(fire);
    this.addCollider(fx2, fz2, 0.7, 0.7);

    // fish rack: two posts, a line, and the day's catch drying
    const [rx, rz] = spot(-8, -3);
    const ry = terrainHeight(rx, rz);
    const rack = new THREE.Group();
    for (const side of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 2.3, 5), wood);
      p.position.set(side * 1.6, 1.15, 0);
      rack.add(p);
    }
    const line = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 3.2, 4), toonMat({ color: 0x3a3632 }));
    line.rotation.z = Math.PI / 2;
    line.position.y = 2.1;
    rack.add(line);
    const fishMat = toonMat({ color: 0x9ab8c8 });
    for (let i = 0; i < 4; i++) {
      const fish = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.55, 4), fishMat);
      fish.position.set(-1.1 + i * 0.7, 1.75, 0);
      fish.rotation.x = Math.PI;
      rack.add(fish);
    }
    rack.position.set(rx, ry, rz);
    rack.rotation.y = 0.7;
    this.group.add(rack);
    this.staticTargets.push(rack);
    this.addCollider(rx, rz, 1.7, 0.4);

    // the rowboat that became furniture (a chair count of four, allegedly)
    const [ox, oz] = spot(2, 9);
    const oy = terrainHeight(ox, oz);
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 0.7, 4.4, 7, 1, false, 0, Math.PI), wood);
    hull.rotation.z = Math.PI / 2;
    hull.rotation.x = Math.PI;
    hull.position.y = 0.7;
    boat.add(hull);
    boat.position.set(ox, oy, oz);
    boat.rotation.y = 1.9;
    boat.rotation.z = 0.14;
    this.group.add(boat);
    this.staticTargets.push(boat);
    this.addCollider(ox, oz, 2.2, 1.2);

    // crate stacks — salvage, re-salvaged, re-RE-salvaged
    const crateMat = toonMat({ color: 0x8a7a5a, map: corrugatedTexture('#7a6a4c') });
    const rng = mulberry32(777);
    for (let i = 0; i < 4; i++) {
      const [qx, qz] = spot(-2 + Math.cos(i * 2.4) * 10, 1 + Math.sin(i * 2.4) * 8);
      const qy = terrainHeight(qx, qz);
      const s = 0.9 + rng() * 0.5;
      const crate = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), crateMat);
      crate.position.set(qx, qy + s / 2, qz);
      crate.rotation.y = rng() * 1.5;
      crate.castShadow = true;
      this.group.add(crate);
      this.staticTargets.push(crate);
      this.addCollider(qx, qz, s * 0.55, s * 0.55);
    }

    // string lights from the shack post out to the fire — home, insistently
    const [pA, pB] = [spot(8.6, -1), spot(-3, 3)];
    for (let i = 1; i < 6; i++) {
      const t = i / 6;
      const lx3 = pA[0] + (pB[0] - pA[0]) * t;
      const lz3 = pA[1] + (pB[1] - pA[1]) * t;
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), glowMat(i % 2 ? 0xffd23c : 0x7dffd4, 0.9));
      bulb.position.set(lx3, terrainHeight(lx3, lz3) + 3.1 - Math.sin(t * Math.PI) * 0.5, lz3);
      this.group.add(bulb);
    }
  }

  /** The Hullgrave — the PELICAN, filed in two places. Bow and stern halves,
   *  a leaning mast, cargo spill, and the anchor chain running out to sea. */
  private buildHullgrave(d: DistrictDef): void {
    const hullMat = toonMat({ color: 0x5a7a72, map: corrugatedTexture('#4c6a62') });
    const rustMat = toonMat({ color: 0x8a5a44, map: swatch('#7a4c38', 80) });
    const barnacleMat = toonMat({ color: 0xd8e0d0 });
    const rng = mulberry32(5150);

    const half = (hx: number, hz: number, rot: number, bowShape: boolean): void => {
      const y = terrainHeight(hx, hz);
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(16, 7, 8), hullMat);
      body.position.y = 2.6;
      body.rotation.z = bowShape ? 0.16 : -0.12;
      g.add(body);
      if (bowShape) {
        const prow = new THREE.Mesh(new THREE.ConeGeometry(4.4, 7, 4), hullMat);
        prow.rotation.z = -Math.PI / 2;
        prow.rotation.y = Math.PI / 4;
        prow.position.set(9.5, 3.2, 0);
        g.add(prow);
      }
      // the broken end: torn deck plates jutting up
      for (let i = 0; i < 4; i++) {
        const tear = new THREE.Mesh(new THREE.ConeGeometry(0.7, 2.6 + rng() * 1.6, 4), rustMat);
        tear.position.set((bowShape ? -8 : 8) + (rng() - 0.5) * 2, 5.4 + rng() * 1.2, (i - 1.5) * 1.8);
        tear.rotation.z = (bowShape ? 0.5 : -0.5) + (rng() - 0.5) * 0.4;
        g.add(tear);
      }
      // barnacle crust along the waterline
      for (let i = 0; i < 9; i++) {
        const b = new THREE.Mesh(new THREE.DodecahedronGeometry(0.24 + rng() * 0.22, 0), barnacleMat);
        b.position.set((rng() - 0.5) * 14, 0.4 + rng() * 1.2, (rng() > 0.5 ? 1 : -1) * 4.1);
        g.add(b);
      }
      // portholes, one still lit
      for (let i = 0; i < 4; i++) {
        const port = new THREE.Mesh(new THREE.CircleGeometry(0.3, 10), i === 1 ? glowMat(0x7dffd4, 0.85) : flatMat(0x24322e));
        port.position.set(-5 + i * 3.2, 2.6, 4.06);
        g.add(port);
      }
      g.position.set(hx, y, hz);
      g.rotation.y = rot;
      g.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
      this.group.add(g);
      this.staticTargets.push(g);
      this.addCollider(hx, hz, 8.5, 4.5, 7);
    };
    half(d.cx - 12, d.cz + 6, 0.5, true);    // bow
    half(d.cx + 14, d.cz - 12, -0.9, false); // stern

    // leaning mast with a crow's nest, guyed by rigging
    const mx = d.cx - 2, mz = d.cz - 6;
    const my = terrainHeight(mx, mz);
    const mast = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.36, 15, 7), rustMat);
    pole.position.y = 7;
    const nest = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 0.8, 1, 8), hullMat);
    nest.position.y = 12.5;
    const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 7, 5), rustMat);
    boom.rotation.z = Math.PI / 2;
    boom.position.y = 10;
    mast.add(pole, nest, boom);
    mast.position.set(mx, my, mz);
    mast.rotation.z = 0.26;
    mast.traverse((o) => (o.castShadow = true));
    this.group.add(mast);
    this.staticTargets.push(mast);
    this.addCollider(mx + 1.8, mz, 0.8, 0.8);

    // cargo spill: containers make the firefight (and the AI's cover)
    for (let i = 0; i < 7; i++) {
      const a = rng() * Math.PI * 2;
      const r = 10 + rng() * 24;
      const qx = d.cx + Math.cos(a) * r, qz = d.cz + Math.sin(a) * r;
      if (!this.clearOfAssets(qx, qz, 2)) continue;
      const qy = terrainHeight(qx, qz);
      const w = 2.4 + rng() * 1.4, h = 1.6 + rng() * 0.8;
      const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, 1.9), i % 3 === 0 ? rustMat : hullMat);
      box.position.set(qx, qy + h / 2, qz);
      box.rotation.y = rng() * Math.PI;
      box.rotation.z = (rng() - 0.5) * 0.14;
      box.castShadow = true;
      this.group.add(box);
      this.staticTargets.push(box);
      this.addCollider(qx, qz, w * 0.55, 1.1);
    }

    // the bower anchor chain, paying out toward the lagoon — link by link
    for (let i = 0; i < 8; i++) {
      const t = i / 7;
      const qx = d.cx - 8 + t * 46, qz = d.cz + 8 + t * 22;
      const link = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.16, 6, 10), rustMat);
      link.position.set(qx, terrainHeight(qx, qz) + 0.25, qz);
      link.rotation.x = Math.PI / 2 + (i % 2 ? 0.5 : 0);
      link.rotation.z = 0.45;
      link.castShadow = true;
      this.group.add(link);
    }
  }

  /** The Brine Pans — salt flats: tide pools, crust mounds, and the Drowned's
   *  tide totems. The salt is ambitious. */
  private buildBrinepans(d: DistrictDef): void {
    const rng = mulberry32(808);
    const saltMat = toonMat({ color: 0xeae8dc, map: swatch('#dcd8c8', 40) });
    const woodMat = toonMat({ color: 0x7a6a52, map: swatch('#6a5a44', 70) });

    // tide pools with salt rims
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.6;
      const r = 8 + (i % 3) * 9;
      const px = d.cx + Math.cos(a) * r, pz = d.cz + Math.sin(a) * r;
      const py = terrainHeight(px, pz);
      const pr = 2.6 + rng() * 2;
      this.water(px, pz, pr, { level: py + 0.12 });
      const crust = new THREE.Mesh(new THREE.RingGeometry(pr * 1.02, pr * 1.3, 18), new THREE.MeshBasicMaterial({ color: 0xeae8dc, transparent: true, opacity: 0.8 }));
      crust.rotation.x = -Math.PI / 2;
      crust.position.set(px, py + 0.1, pz);
      this.group.add(crust);
    }

    // salt mounds + barnacled rocks
    for (let i = 0; i < 8; i++) {
      const a = rng() * Math.PI * 2;
      const r = 6 + rng() * 26;
      const px = d.cx + Math.cos(a) * r, pz = d.cz + Math.sin(a) * r;
      if (!this.clearOfAssets(px, pz, 1.6)) continue;
      const py = terrainHeight(px, pz);
      if (i % 2 === 0) {
        const s = 0.8 + rng() * 1.2;
        const mound = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.5, s, s * 0.8, 8), saltMat);
        mound.position.set(px, py + s * 0.4, pz);
        this.group.add(mound);
        this.staticTargets.push(mound);
        this.addCollider(px, pz, s * 0.8, s * 0.8);
      } else {
        const s = 1 + rng() * 1.4;
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), toonMat({ color: 0x6a8a7a, map: rockTexture('#5a7a6a') }));
        rock.position.set(px, py + s * 0.4, pz);
        rock.rotation.set(rng() * 2, rng() * 3, rng());
        this.group.add(rock);
        this.staticTargets.push(rock);
        this.addCollider(px, pz, s * 0.8, s * 0.8);
      }
    }

    // tide totems: the Drowned's shrine-buoys — poles hung with floats and a lit lamp
    for (const [tx, tz] of [[d.cx - 8, d.cz + 12], [d.cx + 14, d.cz - 6], [d.cx - 16, d.cz - 14]] as const) {
      const ty = terrainHeight(tx, tz);
      const totem = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 4.2, 6), woodMat);
      pole.position.y = 2.1;
      totem.add(pole);
      for (let i = 0; i < 3; i++) {
        const float = new THREE.Mesh(new THREE.SphereGeometry(0.3 - i * 0.05, 8, 8), toonMat({ color: [0xd87a4a, 0x54a8c8, 0xeae8dc][i] }));
        float.position.set(Math.sin(i * 2.4) * 0.35, 1.2 + i * 1.1, Math.cos(i * 2.4) * 0.35);
        totem.add(float);
      }
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), glowMat(0x7dffd4, 0.9));
      lamp.position.y = 4.5;
      lamp.name = 'blinker';
      totem.add(lamp);
      totem.position.set(tx, ty, tz);
      totem.rotation.y = tx + tz;
      totem.traverse((o) => (o.castShadow = true));
      this.group.add(totem);
      this.staticTargets.push(totem);
      this.addCollider(tx, tz, 0.5, 0.5);
    }
  }

  /** The Anchorage — the Admiral's parade ground: a bow-rib arena rim in the
   *  wading shallows, a giant anchor monument, lantern buoys. Center stays
   *  clear for the fight. */
  private buildAnchorage(d: DistrictDef): void {
    const iron = toonMat({ color: 0x3a4442, map: swatch('#324a42', 70) });
    const rustMat = toonMat({ color: 0x8a5a44, map: swatch('#7a4c38', 80) });

    // ring of hull ribs around the rim — a drowned cathedral
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.3;
      if (a > 2.4 && a < 3.4) continue; // leave the shoreward approach open
      const rx = d.cx + Math.cos(a) * (d.radius - 6);
      const rz = d.cz + Math.sin(a) * (d.radius - 6);
      const ry = terrainHeight(rx, rz);
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.7, 7 + Math.sin(i * 2.2) * 1.6, 1.6), i % 2 ? iron : rustMat);
      rib.position.set(rx, ry + 3.2, rz);
      rib.rotation.y = a + Math.PI / 2;
      rib.rotation.z = Math.cos(a) * 0.3;
      rib.rotation.x = Math.sin(a) * 0.3;
      rib.castShadow = true;
      this.group.add(rib);
      this.staticTargets.push(rib);
      this.addCollider(rx, rz, 0.9, 0.9);
    }

    // the monument: HIS anchor, planted at the north rim
    const ax = d.cx, az = d.cz + d.radius - 10;
    const ay = terrainHeight(ax, az);
    const mon = new THREE.Group();
    const shank = new THREE.Mesh(new THREE.BoxGeometry(0.5, 9, 0.5), iron);
    shank.position.y = 4.5;
    const stock = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.4, 0.4), iron);
    stock.position.y = 7.6;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.18, 6, 12), iron);
    ring.position.y = 9.2;
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 3.6, 6), iron);
      arm.position.set(side * 1.5, 0.9, 0);
      arm.rotation.z = side * 1.05;
      const fluke = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.6, 4), iron);
      fluke.position.set(side * 3, 1.9, 0);
      fluke.rotation.z = side * 2.2;
      mon.add(arm, fluke);
    }
    mon.add(shank, stock, ring);
    mon.position.set(ax, ay, az);
    mon.rotation.y = 0.3;
    mon.traverse((o) => (o.castShadow = true));
    this.group.add(mon);
    this.staticTargets.push(mon);
    this.addCollider(ax, az, 1.2, 1.2, 9);

    // lantern buoys bobbing in the shallows around the arena
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.8;
      const bx = d.cx + Math.cos(a) * (d.radius + 6);
      const bz = d.cz + Math.sin(a) * (d.radius + 6);
      const by = terrainHeight(bx, bz);
      const buoy = new THREE.Group();
      const body = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.4, 7), toonMat({ color: i % 2 ? 0xd87a4a : 0x54a8c8 }));
      body.position.y = 0.9;
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), glowMat(0x7dffd4, 0.95));
      lamp.position.y = 1.8;
      lamp.name = 'blinker';
      buoy.add(body, lamp);
      buoy.position.set(bx, by + 0.1, bz);
      buoy.rotation.z = Math.sin(i * 3.1) * 0.12;
      this.group.add(buoy);
    }
  }

  // ===================================================== THE HOLLOWDEEP
  /** The Mouth — the old head-frame over the shaft: lift wheel, lanterns,
   *  crates, and the last stub of rail line before the dark takes over. */
  private buildCavemouth(d: DistrictDef): void {
    const timber = toonMat({ color: 0x5a4a3a, map: swatch('#4c3e30', 80) });
    const iron = toonMat({ color: 0x3a4252, map: swatch('#323a48', 70) });

    // head-frame: two A-frames + crossbeam + winding wheel
    const hx = d.cx - 6, hz = d.cz - 4;
    const hy = terrainHeight(hx, hz);
    const frame = new THREE.Group();
    for (const side of [-1, 1]) {
      for (const lean of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.4, 8.4, 0.4), timber);
        leg.position.set(side * 2.2, 4, lean * 1.5);
        leg.rotation.x = lean * 0.32;
        frame.add(leg);
      }
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.5, 0.6), timber);
    beam.position.y = 7.9;
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.16, 6, 16), iron);
    wheel.position.y = 8;
    for (let i = 0; i < 4; i++) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.1, 0.1), iron);
      spoke.position.y = 8;
      spoke.rotation.z = (i / 4) * Math.PI;
      frame.add(spoke);
    }
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 6.6, 4), iron);
    cable.position.y = 4.6;
    frame.add(beam, wheel, cable);
    frame.position.set(hx, hy, hz);
    frame.rotation.y = 0.5;
    frame.traverse((o) => (o.castShadow = true));
    this.group.add(frame);
    this.staticTargets.push(frame);
    this.addCollider(hx - 2.2, hz, 0.6, 1.8);
    this.addCollider(hx + 2.2, hz, 0.6, 1.8);

    // lantern posts — warm light, spaced like they mattered
    for (const [lx, lz] of [[d.cx + 5, d.cz + 6], [d.cx - 3, d.cz + 12], [d.cx + 9, d.cz - 4]] as const) {
      const ly = terrainHeight(lx, lz);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 3, 6), timber);
      post.position.set(lx, ly + 1.5, lz);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.08, 0.08), timber);
      arm.position.set(lx + 0.35, ly + 2.9, lz);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), glowMat(0xffb43c, 0.95));
      lamp.position.set(lx + 0.7, ly + 2.7, lz);
      lamp.name = 'blinker';
      post.castShadow = true;
      this.group.add(post, arm, lamp);
      this.staticTargets.push(post);
      this.addCollider(lx, lz, 0.3, 0.3);
    }

    // rail stub + ore cart, tipped
    this.railLine(d.cx - 2, d.cz + 8, d.cx + 2, d.cz - 12, timber, iron);
    const cx2 = d.cx + 1, cz2 = d.cz - 2;
    this.oreCart(cx2, cz2, 0.9, true, iron);

    // supply crates
    const crateMat = toonMat({ color: 0x6a5a44, map: corrugatedTexture('#5a4c38') });
    const rng = mulberry32(2601);
    for (let i = 0; i < 3; i++) {
      const qx = d.cx + Math.cos(i * 2.6) * 9, qz = d.cz + 6 + Math.sin(i * 2.6) * 6;
      const qy = terrainHeight(qx, qz);
      const s = 0.9 + rng() * 0.5;
      const crate = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), crateMat);
      crate.position.set(qx, qy + s / 2, qz);
      crate.rotation.y = rng() * 1.5;
      crate.castShadow = true;
      this.group.add(crate);
      this.staticTargets.push(crate);
      this.addCollider(qx, qz, s * 0.55, s * 0.55);
    }
  }

  /** A stretch of narrow-gauge rail: sleepers + two rails between two points. */
  private railLine(x0: number, z0: number, x1: number, z1: number, timber: THREE.Material, iron: THREE.Material): void {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const ang = Math.atan2(x1 - x0, z1 - z0);
    const steps = Math.floor(len / 1.4);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
      const y = terrainHeight(x, z);
      const sleeper = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.1, 0.3), timber);
      sleeper.position.set(x, y + 0.06, z);
      sleeper.rotation.y = ang;
      this.group.add(sleeper);
    }
    for (const side of [-0.5, 0.5]) {
      const segs = Math.floor(len / 4);
      for (let i = 0; i < segs; i++) {
        const t0 = i / segs, t1 = (i + 1) / segs;
        const xA = x0 + (x1 - x0) * t0, zA = z0 + (z1 - z0) * t0;
        const xB = x0 + (x1 - x0) * t1, zB = z0 + (z1 - z0) * t1;
        const mid = { x: (xA + xB) / 2, z: (zA + zB) / 2 };
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, Math.hypot(xB - xA, zB - zA) + 0.1), iron);
        rail.position.set(mid.x + Math.cos(ang) * side, terrainHeight(mid.x, mid.z) + 0.2, mid.z - Math.sin(ang) * side);
        rail.rotation.y = ang;
        this.group.add(rail);
      }
    }
  }

  /** A mine cart, optionally tipped over, optionally full of glowing ore. */
  private oreCart(x: number, z: number, rot: number, tipped: boolean, iron: THREE.Material): void {
    const y = terrainHeight(x, z);
    const cart = new THREE.Group();
    const tub = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.9, 1.0), iron);
    tub.position.y = 0.85;
    cart.add(tub);
    for (const [wx, wz] of [[-0.5, 0.5], [0.5, 0.5], [-0.5, -0.5], [0.5, -0.5]] as const) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.1, 8), iron);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(wx * 1.2, 0.24, wz * 0.7);
      cart.add(wheel);
    }
    if (!tipped) {
      for (let i = 0; i < 5; i++) {
        const ore = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), glowMat(0x54d4ff, 0.8));
        ore.position.set((i % 3 - 1) * 0.4, 1.35, (i % 2 - 0.5) * 0.4);
        cart.add(ore);
      }
    } else {
      cart.rotation.z = 1.35;
      cart.position.y = -0.25;
      for (let i = 0; i < 5; i++) {
        const ore = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), glowMat(0x54d4ff, 0.8));
        ore.position.set(-1 - i * 0.35, 0.35 - 0.1, (Math.sin(i * 4.2)) * 0.5);
        this.group.add(ore); // spilled on the floor, in world space below
        ore.position.set(x - 1 - i * 0.35, y + 0.2, z + Math.sin(i * 4.2) * 0.6);
      }
    }
    cart.position.set(x, y + (tipped ? 0.35 : 0), z);
    cart.rotation.y = rot;
    cart.traverse((o) => (o.castShadow = true));
    this.group.add(cart);
    this.staticTargets.push(cart);
    this.addCollider(x, z, 1, 0.8);
  }

  /** The Gloomgrove — a cavern of giant bioluminescent mushrooms. The little
   *  ones come from the map-wide flora pass; these are the elders. */
  private buildGloomgrove(d: DistrictDef): void {
    const rng = mulberry32(9021);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + rng();
      const r = 8 + rng() * (d.radius - 14);
      const mx = d.cx + Math.cos(a) * r, mz = d.cz + Math.sin(a) * r;
      if (!this.clearOfAssets(mx, mz, 2.4)) continue;
      this.mushroom(mx, mz, 1.8 + rng() * 1.6, true);
    }
    // ground glow discs — spore-lit rings where the caps drip
    for (let i = 0; i < 7; i++) {
      const a = rng() * Math.PI * 2;
      const r = rng() * (d.radius - 6);
      const px = d.cx + Math.cos(a) * r, pz = d.cz + Math.sin(a) * r;
      const disc = new THREE.Mesh(new THREE.CircleGeometry(0.8 + rng() * 1.2, 12), new THREE.MeshBasicMaterial({ color: 0x2fd8c8, transparent: true, opacity: 0.16 }));
      disc.rotation.x = -Math.PI / 2;
      disc.position.set(px, terrainHeight(px, pz) + 0.05, pz);
      this.group.add(disc);
    }
  }

  /** The Cryptworks — the old workings: timber tunnel braces, rail, carts,
   *  ore heaps (the AI's cover), and the Undergrown's cold-fire camp. */
  private buildCryptworks(d: DistrictDef): void {
    const timber = toonMat({ color: 0x4c3e30, map: swatch('#40342a', 80) });
    const iron = toonMat({ color: 0x3a4252, map: swatch('#323a48', 70) });
    const rng = mulberry32(1849);

    // a row of tunnel braces marching through the arena — ruins of the drift
    for (let i = 0; i < 4; i++) {
      const bx = d.cx - 14 + i * 9, bz = d.cz - 8 + Math.sin(i * 1.8) * 5;
      const by = terrainHeight(bx, bz);
      const brace = new THREE.Group();
      for (const side of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4.6, 0.5), timber);
        post.position.set(side * 2.4, 2.3, 0);
        post.rotation.z = side * -0.07;
        brace.add(post);
      }
      const cap = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.55, 0.6), timber);
      cap.position.y = 4.6;
      cap.rotation.z = (rng() - 0.5) * 0.12;
      brace.add(cap);
      brace.position.set(bx, by, bz);
      brace.rotation.y = 0.5 + i * 0.12;
      brace.traverse((o) => (o.castShadow = true));
      this.group.add(brace);
      this.staticTargets.push(brace);
      this.addCollider(bx - 2.3, bz, 0.5, 0.5);
      this.addCollider(bx + 2.3, bz, 0.5, 0.5);
    }

    // rail through the works + carts
    this.railLine(d.cx - 18, d.cz - 2, d.cx + 16, d.cz + 4, timber, iron);
    this.oreCart(d.cx - 6, d.cz, 1.1, false, iron);
    this.oreCart(d.cx + 10, d.cz + 3, 1.2, true, iron);

    // ore heaps: chest-high cover with a faint glow vein
    for (let i = 0; i < 5; i++) {
      const a = rng() * Math.PI * 2;
      const r = 6 + rng() * (d.radius - 12);
      const px = d.cx + Math.cos(a) * r, pz = d.cz + Math.sin(a) * r;
      if (!this.clearOfAssets(px, pz, 2)) continue;
      const py = terrainHeight(px, pz);
      const s = 1.2 + rng() * 0.9;
      const heap = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), toonMat({ color: 0x3f4656, map: rockTexture('#38404e') }));
      heap.position.set(px, py + s * 0.45, pz);
      heap.rotation.set(rng() * 2, rng() * 3, rng());
      heap.scale.y = 0.7;
      heap.castShadow = true;
      this.group.add(heap);
      this.staticTargets.push(heap);
      this.addCollider(px, pz, s * 0.85, s * 0.85);
      const vein = new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 0), glowMat(0x54d4ff, 0.75));
      vein.position.set(px + 0.3, py + s * 0.8, pz);
      this.group.add(vein);
    }

    // the Undergrown camp: a cold-fire ring and a bone tidy-pile (Okto disapproves)
    const fx2 = d.cx + 6, fz2 = d.cz - 10;
    const fy = terrainHeight(fx2, fz2);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.3, 0), iron);
      stone.position.set(fx2 + Math.cos(a) * 1.1, fy + 0.2, fz2 + Math.sin(a) * 1.1);
      this.group.add(stone);
    }
    const coldflame = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.2, 7), glowMat(0x2fd8c8, 0.9));
    coldflame.position.set(fx2, fy + 0.7, fz2);
    coldflame.name = 'blinker';
    this.group.add(coldflame);
    const boneMat = toonMat({ color: 0xe0d8c4 });
    for (let i = 0; i < 5; i++) {
      const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.8 + rng() * 0.5, 5), boneMat);
      bone.position.set(fx2 + 2.4 + rng() * 1.4, fy + 0.15, fz2 + rng() * 1.6 - 0.8);
      bone.rotation.z = Math.PI / 2 + rng();
      bone.rotation.y = rng() * 3;
      this.group.add(bone);
    }
  }

  /** The Lode Court — the singer's chamber: a ring of giant resonant crystals,
   *  tribute heaps, and the broken company drill that never made it back up.
   *  The center stays open — it's a boss floor. */
  private buildLodecourt(d: DistrictDef): void {
    const rng = mulberry32(1111);
    // ring of giant crystals — cover, cathedral, and the light source
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.2;
      if (a > 1.2 && a < 1.9) continue; // the approach gap
      const cx2 = d.cx + Math.cos(a) * (d.radius - 7);
      const cz2 = d.cz + Math.sin(a) * (d.radius - 7);
      const cy = terrainHeight(cx2, cz2);
      const cluster = new THREE.Group();
      const n = 2 + Math.floor(rng() * 2);
      for (let k = 0; k < n; k++) {
        const h = 2.6 + rng() * 3.4;
        const shard = new THREE.Mesh(new THREE.ConeGeometry(0.5 + rng() * 0.4, h, 5), glowMat(k % 2 ? 0x54d4ff : 0x8ae8ff, 0.42));
        shard.position.set((rng() - 0.5) * 1.6, h / 2, (rng() - 0.5) * 1.6);
        shard.rotation.z = (rng() - 0.5) * 0.5;
        shard.rotation.x = (rng() - 0.5) * 0.5;
        cluster.add(shard);
      }
      cluster.position.set(cx2, cy, cz2);
      this.group.add(cluster);
      this.staticTargets.push(cluster);
      this.addCollider(cx2, cz2, 1.3, 1.3);
    }

    // tribute heaps: sixty years of hand-carried ore
    for (let i = 0; i < 6; i++) {
      const a = rng() * Math.PI * 2;
      const r = 10 + rng() * (d.radius - 18);
      const px = d.cx + Math.cos(a) * r, pz = d.cz + Math.sin(a) * r;
      if (Math.hypot(px - d.cx, pz - d.cz) < 9) continue; // keep the floor clear
      const py = terrainHeight(px, pz);
      const heap = new THREE.Mesh(new THREE.ConeGeometry(1 + rng(), 1 + rng() * 0.8, 7), toonMat({ color: 0x3f4656, map: rockTexture('#38404e') }));
      heap.position.set(px, py + 0.5, pz);
      this.group.add(heap);
      const glow = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), glowMat(0x9ae8ff, 0.8));
      glow.position.set(px, py + 1.3, pz);
      glow.name = 'blinker';
      this.group.add(glow);
    }

    // the company drill, nose-down where it died — a landmark and a warning
    const dx2 = d.cx - d.radius + 12, dz2 = d.cz + 6;
    const dy = terrainHeight(dx2, dz2);
    const drill = new THREE.Group();
    const bit = new THREE.Mesh(new THREE.ConeGeometry(1.4, 4.4, 8), toonMat({ color: 0x5a6478, map: swatch('#4c5668', 70) }));
    bit.rotation.x = Math.PI; // nose down
    bit.position.y = 2.2;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 3.4, 8), toonMat({ color: 0x3a4252 }));
    body.position.y = 5.6;
    body.rotation.z = 0.18;
    drill.add(bit, body);
    drill.position.set(dx2, dy, dz2);
    drill.rotation.z = 0.3;
    drill.traverse((o) => (o.castShadow = true));
    this.group.add(drill);
    this.staticTargets.push(drill);
    this.addCollider(dx2, dz2, 1.6, 1.6);
  }

  /** Toon glow-mushroom: stem, luminous cap, gill ring, spots. The Hollowdeep's
   *  trees. Big ones get colliders; scatter-size ones don't. */
  private mushroom(x: number, z: number, scale = 1, collide = false): void {
    const y = terrainHeight(x, z);
    const g = new THREE.Group();
    const seed = Math.abs(Math.sin(x * 12.9898 + z * 78.233));
    const stemMat = toonMat({ color: 0xc8c0d8, map: swatch('#b8b0cc', 40) });
    const capColor = seed > 0.5 ? 0x2fd8c8 : 0x7a6ae8;
    const h = 2.2 * scale;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * scale, 0.26 * scale, h, 7), stemMat);
    stem.position.y = h / 2;
    stem.rotation.z = (seed - 0.5) * 0.2;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.85 * scale, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), toonMat({ color: capColor }));
    cap.position.y = h;
    cap.scale.y = 0.62;
    const gills = new THREE.Mesh(new THREE.CylinderGeometry(0.8 * scale, 0.5 * scale, 0.12 * scale, 12), glowMat(capColor, 0.65));
    gills.position.y = h - 0.03;
    g.add(stem, cap, gills);
    for (let i = 0; i < 4; i++) {
      const a = i * 2.1 + seed * 6;
      const spot = new THREE.Mesh(new THREE.CircleGeometry(0.09 * scale, 6), glowMat(0xeafaff, 0.8));
      const sr = 0.45 * scale;
      spot.position.set(Math.cos(a) * sr, h + 0.33 * scale, Math.sin(a) * sr);
      spot.rotation.x = -Math.PI / 2;
      spot.rotation.z = a;
      g.add(spot);
    }
    g.position.set(x, y, z);
    g.traverse((o) => (o.castShadow = true));
    this.group.add(g);
    if (collide) {
      this.staticTargets.push(g);
      this.addCollider(x, z, 0.4 * scale, 0.4 * scale);
    }
  }

  /** Stalagmite cluster — the Hollowdeep's boulders. */
  private stalagmite(x: number, z: number, scale = 1): void {
    const y = terrainHeight(x, z);
    const g = new THREE.Group();
    const mat = toonMat({ color: 0x48566a, map: rockTexture('#3f4a5c') });
    const seed = Math.abs(Math.sin(x * 3.7 + z * 9.1));
    const n = 2 + Math.floor(seed * 2);
    for (let i = 0; i < n; i++) {
      const h = (1.4 + Math.abs(Math.sin(seed * 9 + i * 2.4)) * 2.2) * scale;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.42 * scale * (1 - i * 0.18), h, 6), mat);
      spike.position.set(Math.cos(i * 2.6) * 0.5 * scale, h / 2, Math.sin(i * 2.6) * 0.5 * scale);
      spike.rotation.z = (seed - 0.5) * 0.18;
      g.add(spike);
    }
    g.position.set(x, y, z);
    g.traverse((o) => (o.castShadow = true));
    this.group.add(g);
    this.staticTargets.push(g);
    this.addCollider(x, z, 0.6 * scale, 0.6 * scale);
  }

  /** Waterfall: mossy rock shelf, a scrolling water sheet, splash pool + foam. */
  private waterfall(x: number, z: number, faceRot: number, height = 8, width = 5): void {
    const y = terrainHeight(x, z);
    const g = new THREE.Group();
    // plain biome rock — a tinted map DOUBLE-darkens under toon lighting and
    // the whole shelf reads as a black cube
    const rockMat = toonMat({ map: rockTexture(WORLD.biome.rock) });
    // the shelf the water pours over, sunk into the hill
    const cliff = new THREE.Mesh(new THREE.BoxGeometry(width + 3, height + 0.8, 3.4), rockMat);
    cliff.position.set(0, height / 2 - 0.5, -1.8);
    const capL = new THREE.Mesh(new THREE.DodecahedronGeometry(2.0, 0), rockMat);
    capL.position.set(-(width / 2 + 1.4), height * 0.85, -0.6);
    const capR = capL.clone();
    capR.position.x = width / 2 + 1.4;
    g.add(cliff, capL, capR);
    // boulders clad BOTH faces so it reads as an outcrop from every angle,
    // not a slab with a rocky back
    for (let i = 0; i < 5; i++) {
      const t = i / 4;
      const r = 1.6 + (1 - t) * 1.8;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), rockMat);
      rock.position.set(
        (t - 0.5) * (width + 4),
        height * (0.25 + 0.5 * Math.abs(Math.sin(i * 2.4))) - r * 0.3,
        -3.2 - (i % 2) * 1.6,
      );
      rock.rotation.set(i * 0.7, i * 1.3, i * 0.5);
      g.add(rock);
    }
    for (const side of [-1, 1]) { // front corners, framing the sheet
      const fr = new THREE.Mesh(new THREE.DodecahedronGeometry(1.5, 0), rockMat);
      fr.position.set(side * (width / 2 + 1.2), 1.0, 0.4);
      fr.rotation.set(side, side * 2.1, 0.4);
      g.add(fr);
    }
    // the falling sheet — texture scrolls downward, with a lip tongue where
    // the water actually leaves the shelf
    const sheetTex = fallTexture();
    sheetTex.repeat.set(2, 2);
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({ map: sheetTex, transparent: true, opacity: 0.82, side: THREE.DoubleSide }));
    sheet.position.set(0, height / 2 + 0.2, 0.06);
    g.add(sheet);
    const tongue = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.9, 1.4),
      new THREE.MeshBasicMaterial({ map: sheetTex, transparent: true, opacity: 0.75, side: THREE.DoubleSide }));
    tongue.position.set(0, height + 0.35, -0.5);
    tongue.rotation.x = -1.05;
    g.add(tongue);
    this.scrollTex.push({ tex: sheetTex, vy: -1.6 });
    // splash pool + foam
    const poolTex = waterTexture();
    const pool = new THREE.Mesh(new THREE.CircleGeometry(width * 0.85, 22),
      new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, opacity: 0.88 }));
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(0, 0.16, 2.2);
    this.scrollTex.push({ tex: poolTex, vy: 0.05 });
    const foam = new THREE.Mesh(new THREE.RingGeometry(width * 0.28, width * 0.5, 18),
      new THREE.MeshBasicMaterial({ color: 0xeafaff, transparent: true, opacity: 0.65 }));
    foam.rotation.x = -Math.PI / 2;
    foam.position.set(0, 0.2, 1.2);
    const mistA = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), glowMat(0xcfeaf5, 0.25));
    mistA.position.set(-width * 0.25, 0.9, 0.9);
    const mistB = mistA.clone();
    mistB.position.set(width * 0.25, 1.2, 1.1);
    g.add(pool, foam, mistA, mistB);
    g.position.set(x, y, z);
    g.rotation.y = faceRot;
    g.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
    this.group.add(g);
    this.staticTargets.push(cliff);
    this.addCollider(x, z, (width + 5) / 2, 2.4, height);
  }

  /** Toon palm: curved trunk segments + a burst of leaf blades + coconuts. */
  private palm(x: number, z: number, scale = 1): void {
    const y = terrainHeight(x, z);
    const g = new THREE.Group();
    const trunkMat = toonMat({ color: 0x9a7a4a, map: swatch('#8a6a3c', 70) });
    const leafMat = toonMat({ color: 0x3a9a3a, map: swatch('#2f8a34', 40) });
    const lean = (Math.sin(x * 12.9898 + z * 78.233) % 1) * 0.5;
    const h = 4.2 * scale;
    let px = 0;
    for (let i = 0; i < 3; i++) {
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.14 * scale * (1 - i * 0.15), 0.18 * scale * (1 - i * 0.15), h / 3 + 0.1, 6), trunkMat);
      px += lean * (i + 0.5) * 0.4;
      seg.position.set(px, h / 6 + (i * h) / 3, 0);
      seg.rotation.z = -lean * 0.35;
      g.add(seg);
    }
    const crownX = px + lean * 0.3;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(2.1 * scale, 0.05, 0.5 * scale), leafMat);
      leaf.position.set(crownX + Math.cos(a) * 0.9 * scale, h + 0.1, Math.sin(a) * 0.9 * scale);
      leaf.rotation.y = -a;
      leaf.rotation.z = 0.45 + Math.sin(a * 3) * 0.1;
      leaf.castShadow = true;
      g.add(leaf);
    }
    for (let i = 0; i < 3; i++) {
      const nut = new THREE.Mesh(new THREE.SphereGeometry(0.12 * scale, 6, 6), toonMat({ color: 0x6a4a2a }));
      nut.position.set(crownX + (i - 1) * 0.18 * scale, h - 0.12, 0.1);
      g.add(nut);
    }
    g.position.set(x, y, z);
    g.traverse((o) => (o.castShadow = true));
    this.group.add(g);
    this.staticTargets.push(g);
    this.addCollider(x, z, 0.3 * scale, 0.3 * scale);
  }

  /** Big flowering fern clump — jungle ground cover with color. */
  private fern(x: number, z: number, scale = 1): void {
    const y = terrainHeight(x, z);
    const g = new THREE.Group();
    const mat = toonMat({ color: 0x2f8a3f });
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + x;
      const blade = new THREE.Mesh(new THREE.ConeGeometry(0.16 * scale, 1.1 * scale, 4), mat);
      blade.position.set(Math.cos(a) * 0.3 * scale, 0.5 * scale, Math.sin(a) * 0.3 * scale);
      blade.rotation.x = Math.sin(a) * 0.5;
      blade.rotation.z = Math.cos(a) * 0.5;
      g.add(blade);
    }
    const bloom = new THREE.Mesh(new THREE.SphereGeometry(0.14 * scale, 6, 6), glowMat(0xff6aa0, 0.8));
    bloom.position.y = 0.9 * scale;
    g.add(bloom);
    g.position.set(x, y, z);
    this.group.add(g);
  }

  // --------------------------------------------------- Veldt: Mangrove Landing
  private buildPortTown(d: DistrictDef): void {
    const rng = mulberry32(4242);
    const woodMat = toonMat({ color: 0x9a7a4a, map: swatch('#8a6a3c', 80) });
    const thatchMat = toonMat({ color: 0xc8a858, map: swatch('#b8983c', 90) });
    // stilt huts around the plaza
    for (const [hx, hz, rot] of [[-16, 78, 0.6], [18, 74, -0.7], [-20, 96, 1.8], [22, 96, -2.0], [8, 104, 2.8]] as const) {
      const hut = new THREE.Group();
      for (let i = 0; i < 4; i++) {
        const stilt = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 1.6, 6), woodMat);
        stilt.position.set((i % 2 ? 1.6 : -1.6), 0.8, (i < 2 ? 1.4 : -1.4));
        hut.add(stilt);
      }
      const floor = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.24, 3.4), woodMat);
      floor.position.y = 1.7;
      const walls = new THREE.Mesh(new THREE.BoxGeometry(3.8, 1.9, 3.0), toonMat({ map: corrugatedTexture() }));
      walls.position.y = 2.8;
      const roof = new THREE.Mesh(new THREE.ConeGeometry(3.1, 1.6, 4), thatchMat);
      roof.position.y = 4.6;
      roof.rotation.y = Math.PI / 4;
      hut.add(floor, walls, roof);
      hut.position.set(hx, terrainHeight(hx, hz), hz);
      hut.rotation.y = rot;
      hut.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
      this.group.add(hut);
      this.staticTargets.push(hut);
      this.addCollider(hx, hz, 2.2, 1.9);
    }
    // boardwalk toward the lagoon
    for (let i = 0; i < 7; i++) {
      const bx = 14 + i * 4.4, bz = 76 - i * 2.4;
      const plank = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.2, 2.2), woodMat);
      plank.position.set(bx, terrainHeight(bx, bz) + 0.45, bz);
      plank.rotation.y = 0.5;
      plank.receiveShadow = true;
      this.group.add(plank);
    }
    // string lights between huts
    for (const [x0, z0, x1, z1] of [[-14, 84, 12, 88], [12, 78, 0, 70]] as const) {
      const from = new THREE.Vector3(x0, terrainHeight(x0, z0) + 4.4, z0);
      const to = new THREE.Vector3(x1, terrainHeight(x1, z1) + 4.2, z1);
      for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        const bp = from.clone().lerp(to, t);
        bp.y -= Math.sin(t * Math.PI) * 1.0;
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6),
          glowMat([0xffd23c, 0xff6aa0, 0x54d4ff][i % 3], 0.95));
        bulb.position.copy(bp);
        bulb.layers.set(FX_LAYER);
        this.group.add(bulb);
      }
    }
    // town palms + flowers
    for (let i = 0; i < 10; i++) this.palm(d.cx + (rng() - 0.5) * 52, d.cz + (rng() - 0.5) * 40, 0.8 + rng() * 0.5);
    for (let i = 0; i < 10; i++) this.fern(d.cx + (rng() - 0.5) * 48, d.cz + (rng() - 0.5) * 36, 0.7 + rng() * 0.8);
    // welcome banner
    const banner = World.textSign(8, 1.5, { lines: ['MANGROVE LANDING'], style: 'ad', bg: '#2a6a5a', fg: '#ffe8a0', accent: '#ff6aa0' }, { twoSided: true });
    banner.position.set(0, terrainHeight(0, 70) + 4.4, 70);
    this.group.add(banner);
    // the lagoon falls: a mossy shelf on the south rim pouring north into the water,
    // fall sheet facing the town and the boardwalk
    this.waterfall(46, 34, 0, 9, 6);
  }

  // --------------------------------------------------- Veldt: tribal camp
  private buildVerdantCamp(d: DistrictDef): void {
    const rng = mulberry32(5151);
    const boneMat = toonMat({ color: 0xe8e0cc, map: swatch('#ddd3b8', 60) });
    const paintMat = [0xff6aa0, 0x54d4ff, 0xffd23c].map((c) => glowMat(c, 0.6));
    // totem poles: stacked carved boxes with glowing eyes
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const tx = d.cx + Math.cos(a) * (14 + rng() * 16), tz = d.cz + Math.sin(a) * (12 + rng() * 16);
      const ty = terrainHeight(tx, tz);
      const totem = new THREE.Group();
      const tiers = 2 + Math.floor(rng() * 3);
      for (let t = 0; t < tiers; t++) {
        const s = 1.1 - t * 0.16;
        const block = new THREE.Mesh(new THREE.BoxGeometry(s, 0.9, s), toonMat({ color: 0x8a6a3c, map: swatch('#7a5a30', 80) }));
        block.position.y = 0.45 + t * 0.9;
        totem.add(block);
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 6), paintMat[t % 3]);
        eye.position.set(0.2, 0.55 + t * 0.9, s / 2 + 0.02);
        const eye2 = eye.clone(); eye2.position.x = -0.2;
        totem.add(eye, eye2);
      }
      totem.position.set(tx, ty, tz);
      totem.rotation.y = rng() * Math.PI * 2;
      totem.traverse((o) => (o.castShadow = true));
      this.group.add(totem);
      this.staticTargets.push(totem);
      this.addCollider(tx, tz, 0.7, 0.7);
    }
    // bone arch at the camp mouth
    const archL = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 5.6, 6), boneMat);
    archL.position.set(d.cx + 10, terrainHeight(d.cx + 10, d.cz + 20) + 2.6, d.cz + 20);
    archL.rotation.z = -0.5;
    const archR = archL.clone();
    archR.position.x = d.cx + 16;
    archR.rotation.z = 0.5;
    this.group.add(archL, archR);
    // thatch huts + fire pits + drums
    for (let i = 0; i < 4; i++) {
      const hx = d.cx + (rng() - 0.5) * 30, hz = d.cz + (rng() - 0.5) * 26;
      const hut = new THREE.Mesh(new THREE.ConeGeometry(2.6, 3.2, 7), toonMat({ color: 0xb8983c, map: swatch('#a8882c', 90) }));
      hut.position.set(hx, terrainHeight(hx, hz) + 1.5, hz);
      hut.castShadow = true;
      this.group.add(hut);
      this.staticTargets.push(hut);
      this.addCollider(hx, hz, 1.8, 1.8);
    }
    this.campfire(d.cx, d.cz);
    this.campfire(d.cx - 14, d.cz + 10);
    for (let i = 0; i < 3; i++) {
      const dx = d.cx + (rng() - 0.5) * 20, dz = d.cz + 6 + (rng() - 0.5) * 16;
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 1.0, 8), toonMat({ color: 0x8a3a3a, map: swatch('#7a3030', 70) }));
      drum.position.set(dx, terrainHeight(dx, dz) + 0.5, dz);
      drum.castShadow = true;
      this.group.add(drum);
      this.addCollider(dx, dz, 0.7, 0.7);
    }
    for (let i = 0; i < 14; i++) this.palm(d.cx + (rng() - 0.5) * 70, d.cz + (rng() - 0.5) * 60, 0.7 + rng() * 0.7);
    for (let i = 0; i < 12; i++) this.fern(d.cx + (rng() - 0.5) * 60, d.cz + (rng() - 0.5) * 54, 0.6 + rng());
  }

  // --------------------------------------------------- Veldt: Idol Hollow
  private buildIdolGrove(d: DistrictDef): void {
    const rng = mulberry32(6262);
    const mossStone = toonMat({ color: 0x6a8a5a, map: swatch('#5a7a4c', 70) });
    // the idol: stacked stone, glowing gaze
    const idol = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 4.2, 2.2, 8), mossStone);
    base.position.y = 1.1;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(4.2, 3.6, 3.2), mossStone);
    torso.position.y = 4;
    const head = new THREE.Mesh(new THREE.BoxGeometry(2.8, 2.4, 2.6), mossStone);
    head.position.y = 7;
    const brow = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.5, 2.7), toonMat({ color: 0x4a6a44 }));
    brow.position.y = 7.9;
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), glowMat(0x9adc4a, 1));
    eyeL.position.set(0.7, 7.2, 1.35);
    const eyeR = eyeL.clone(); eyeR.position.x = -0.7;
    idol.add(base, torso, head, brow, eyeL, eyeR);
    idol.position.set(d.cx, terrainHeight(d.cx, d.cz), d.cz);
    idol.rotation.y = 0.6;
    idol.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
    this.group.add(idol);
    this.staticTargets.push(idol);
    this.addCollider(d.cx, d.cz, 3, 2.6);
    // offering stones ring
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const sx = d.cx + Math.cos(a) * 9, sz = d.cz + Math.sin(a) * 9;
      const stone = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.4 + rng() * 0.8, 0.9), mossStone);
      stone.position.set(sx, terrainHeight(sx, sz) + 0.7, sz);
      stone.rotation.y = a;
      stone.castShadow = true;
      this.group.add(stone);
      this.staticTargets.push(stone);
      this.addCollider(sx, sz, 0.7, 0.7);
    }
    for (let i = 0; i < 16; i++) this.palm(d.cx + (rng() - 0.5) * 64, d.cz + (rng() - 0.5) * 58, 0.8 + rng() * 0.7);
    for (let i = 0; i < 14; i++) this.fern(d.cx + (rng() - 0.5) * 56, d.cz + (rng() - 0.5) * 50, 0.7 + rng());
    // the idol's reflecting pond
    this.water(d.cx - 14, d.cz + 12, 5, { lilies: true });
  }

  // --------------------------------------------------- Veldt: the Overgrowth
  private buildJungle(d: DistrictDef): void {
    const rng = mulberry32(7373);
    for (let i = 0; i < 26; i++) {
      const x = d.cx + (rng() - 0.5) * d.radius * 1.9;
      const z = d.cz + (rng() - 0.5) * d.radius * 1.7;
      if (!this.clearOfAssets(x, z, 1.8) || !this.clearOfExits(x, z)) continue;
      this.palm(x, z, 0.8 + rng() * 0.9);
    }
    for (let i = 0; i < 20; i++) {
      const x = d.cx + (rng() - 0.5) * d.radius * 1.8;
      const z = d.cz + (rng() - 0.5) * d.radius * 1.6;
      if (!this.clearOfExits(x, z)) continue;
      this.fern(x, z, 0.7 + rng() * 1.1);
    }
    // a spring-fed pond hiding in the growth
    this.water(d.cx + 16, d.cz - 10, 4, { lilies: true });
    // fallen mossy log
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.9, 9, 8), toonMat({ color: 0x6a8a5a, map: swatch('#5a7a4c', 70) }));
    log.rotation.z = Math.PI / 2;
    log.rotation.y = 0.7;
    log.position.set(d.cx + 8, terrainHeight(d.cx + 8, d.cz + 4) + 0.7, d.cz + 4);
    log.castShadow = true;
    this.group.add(log);
    this.staticTargets.push(log);
    this.addCollider(d.cx + 8, d.cz + 4, 4, 1);
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

  /** Launch pad + THE PAPERWEIGHT — the scrapship between planets. */
  private buildShipPad(poi: WorldPoi): void {
    const y = terrainHeight(poi.x, poi.z);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(6.5, 7, 0.5, 12), toonMat({ color: 0x5a5248, map: swatch('#4a4440', 70) }));
    pad.position.set(poi.x, y + 0.25, poi.z);
    pad.receiveShadow = true;
    const stripe = new THREE.Mesh(new THREE.RingGeometry(5.4, 6.1, 12), toonMat({ color: 0xd8a828 }));
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.set(poi.x, y + 0.52, poi.z);
    this.group.add(pad, stripe);
    const ship = buildScrapship();
    ship.name = 'pad_ship';
    ship.position.set(poi.x, y + 0.5, poi.z);
    ship.rotation.y = poi.rot ?? 0;
    this.group.add(ship);
    this.staticTargets.push(ship);
    this.addCollider(poi.x, poi.z, 2.4, 3.2);
    this.interactables.push({
      kind: 'ship',
      pos: new THREE.Vector3(poi.x + 3, y, poi.z + 3),
      label: 'BOARD THE PAPERWEIGHT',
      data: WORLD.id,
    });
  }

  /** Zone exits, dressed by style: scrap arch, cave mouth, dense thicket,
   *  or a sandy shell-lined path — each with the destination on a board. */
  private buildZoneExits(): void {
    for (const ex of WORLD.exits ?? []) {
      const y = terrainHeight(ex.x, ex.z);
      const g = new THREE.Group();
      const style = ex.style ?? 'arch';
      const board = World.textSign(7.5, 1.5, { lines: ['→ ' + ex.label + ' →'], style: 'graffiti', bg: '#3a3226', fg: '#f2e4c4', accent: '#241a10' }, { twoSided: true });

      if (style === 'cave') {
        const rockMat = toonMat({ color: 0x4a4a44, map: swatch('#3f3f3a', 70) });
        // jawbone of boulders around a dark mouth
        for (let i = 0; i < 7; i++) {
          const a = Math.PI * (0.12 + (i / 6) * 0.76);
          const s = 2.2 + Math.sin(i * 2.4) * 0.8;
          const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rockMat);
          rock.position.set(Math.cos(a) * 5.2, Math.sin(a) * 4.6, 0);
          rock.rotation.set(i, i * 2, i * 0.7);
          g.add(rock);
        }
        const maw = new THREE.Mesh(new THREE.CircleGeometry(3.1, 12), new THREE.MeshBasicMaterial({ color: 0x050505 }));
        maw.position.set(0, 2.2, 0.4);
        const drip = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), glowMat(0x54d4ff, 0.8));
        drip.position.set(1.1, 4.2, 0.6);
        board.position.set(0, 5.9, 0.8);
        g.add(maw, drip, board);
      } else if (style === 'thicket') {
        const leafMat = toonMat({ color: 0x2f7a34, map: swatch('#286c2e', 50) });
        const trunkMat = toonMat({ color: 0x6a4a2a });
        for (const side of [-1, 1]) {
          for (let i = 0; i < 3; i++) {
            const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(2.4 - i * 0.4, 0), leafMat);
            blob.position.set(side * (4 - i * 0.8), 1.6 + i * 1.7, (i % 2) * 0.8);
            g.add(blob);
          }
          const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 4, 6), trunkMat);
          trunk.position.set(side * 4, 2, 0);
          g.add(trunk);
        }
        const vine = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 8.4, 6), trunkMat);
        vine.rotation.z = Math.PI / 2;
        vine.position.y = 5.6;
        const bloom = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 6), glowMat(0xff6aa0, 0.9));
        bloom.position.set(1.4, 5.3, 0.3);
        board.position.set(0, 4.6, 0.6);
        g.add(vine, bloom, board);
      } else if (style === 'beach') {
        const sandMat = toonMat({ color: 0xe8d8a8, map: swatch('#ddcc94', 60) });
        const sand = new THREE.Mesh(new THREE.CylinderGeometry(6.5, 7.5, 0.3, 10), sandMat);
        sand.position.y = 0.1;
        g.add(sand);
        for (let i = 0; i < 5; i++) {
          const shell = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.3, 5), toonMat({ color: 0xffe8e0 }));
          shell.position.set(Math.sin(i * 2.2) * 4, 0.3, Math.cos(i * 1.7) * 3);
          g.add(shell);
        }
        const drift = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 5.4, 6), toonMat({ color: 0xb8a888 }));
        drift.rotation.z = 1.2;
        drift.position.set(-3, 0.7, 1);
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 3.6, 6), toonMat({ color: 0xb8a888 }));
        post.position.set(2.4, 1.8, 0);
        board.position.set(2.4, 3.3, 0.2);
        const buoyGlow = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), glowMat(0xffd23c, 0.9));
        buoyGlow.position.set(2.4, 3.9, 0);
        g.add(drift, post, board, buoyGlow);
      } else {
        const postMat = toonMat({ color: 0x5a5248, map: swatch('#4a4440', 70) });
        const postL = new THREE.Mesh(new THREE.BoxGeometry(0.5, 6.4, 0.5), postMat);
        postL.position.set(-4, 3.2, 0);
        const postR = postL.clone(); postR.position.x = 4;
        const lintel = new THREE.Mesh(new THREE.BoxGeometry(9.4, 0.8, 0.7), postMat);
        lintel.position.y = 6;
        board.position.y = 4.9;
        const lampL = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), glowMat(0x54d4ff, 0.95));
        lampL.position.set(-4, 6.6, 0);
        const lampR = lampL.clone(); lampR.position.x = 4;
        g.add(postL, postR, lintel, board, lampL, lampR);
      }

      // the portal plane's local +z faces the map centre, so walking toward
      // the exit means walking THROUGH the gate — not past its side profile
      g.rotation.y = Math.atan2(-ex.x, -ex.z);
      g.position.set(ex.x, y, ex.z);
      g.traverse((o) => (o.castShadow = true));
      this.group.add(g);
      this.staticTargets.push(g);
    }
  }


  // ------------------------------------------------------------ VITRA NULL
  /** Shimmer vents — the planet exhales and you ride it. Player physics
   *  reads this list every frame; the visual is a glowing throat + motes. */
  updrafts: { x: number; z: number; r: number; power: number; top: number }[] = [];
  private ventMotes: THREE.Vector3[] = [];

  private buildVent(poi: WorldPoi): void {
    const y = terrainHeight(poi.x, poi.z);
    const g = new THREE.Group();
    const rockMat = toonMat({ map: rockTexture(WORLD.biome.rock) });
    const rng = mulberry32((poi.x * 73 + poi.z * 31) | 0);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + rng() * 0.4;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.7 + rng() * 0.7, 0), rockMat);
      rock.position.set(Math.cos(a) * 2.6, 0.3, Math.sin(a) * 2.6);
      rock.rotation.set(rng() * 3, rng() * 3, rng() * 3);
      g.add(rock);
    }
    const throat = new THREE.Mesh(new THREE.CircleGeometry(2.0, 14), glowMat(0x7af0ff, 0.75));
    throat.rotation.x = -Math.PI / 2;
    throat.position.y = 0.12;
    g.add(throat);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.1, 6, 20), glowMat(0xb0a0ff, 0.6));
    halo.rotation.x = Math.PI / 2;
    halo.position.y = 0.35;
    halo.name = 'blinker';
    g.add(halo);
    g.position.set(poi.x, y, poi.z);
    this.group.add(g);
    // the column has a CEILING — lift fades out near the top so riders
    // crest and drift instead of ascending into orbit on low-g worlds
    this.updrafts.push({ x: poi.x, z: poi.z, r: 2.4, power: 46, top: y + 15 });
    this.ventMotes.push(new THREE.Vector3(poi.x, y + 0.4, poi.z));
  }

  /** LAST LIGHT — the lighthouse town. One stubborn beam, a ring of huts
   *  with lit windows, and lamp posts holding back two centuries of night. */
  private buildLastLight(d: DistrictDef): void {
    const y = terrainHeight(d.cx, d.cz);
    const stoneMat = toonMat({ color: 0x3a3260, map: rockTexture('#332b56') });
    const bandMat = toonMat({ color: 0xd8c56a, map: swatch('#c9b45a', 60) });
    // the lighthouse: tapered tower, gold bands, glow lamp room
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 2.2, 17, 10), stoneMat);
    tower.position.set(d.cx, y + 8.5, d.cz);
    this.group.add(tower);
    this.staticTargets.push(tower);
    this.addCollider(d.cx, d.cz, 2.3, 2.3, 18);
    for (const bandY of [4.5, 9.5, 14.5]) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(1.55 + (14.5 - bandY) * 0.055, 1.6 + (14.5 - bandY) * 0.055, 0.5, 10), bandMat);
      band.position.set(d.cx, y + bandY, d.cz);
      this.group.add(band);
    }
    const lampRoom = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 2.2, 8), bandMat);
    lampRoom.position.set(d.cx, y + 18.2, d.cz);
    this.group.add(lampRoom);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(1.05, 12, 12), glowMat(0xfff2b0, 1));
    beacon.position.set(d.cx, y + 18.3, d.cz);
    this.group.add(beacon);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(2.0, 1.6, 8), stoneMat);
    cap.position.set(d.cx, y + 20.1, d.cz);
    this.group.add(cap);
    // the keeper's huts: squat stone drums with warm windows
    const rng = mulberry32(777001);
    for (let i = 0; i < 5; i++) {
      const a = Math.PI * 0.25 + (i / 5) * Math.PI * 1.5;
      const hx = d.cx + Math.cos(a) * (12 + rng() * 6);
      const hz = d.cz + Math.sin(a) * (12 + rng() * 6);
      const hy = terrainHeight(hx, hz);
      const hut = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.7, 2.6, 8), stoneMat);
      hut.position.set(hx, hy + 1.3, hz);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(3.0, 1.6, 8), toonMat({ color: 0x241c40 }));
      roof.position.set(hx, hy + 3.3, hz);
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.1), glowMat(0xffd88a, 0.95));
      win.position.set(hx + Math.cos(a + Math.PI) * 2.45, hy + 1.4, hz + Math.sin(a + Math.PI) * 2.45);
      win.lookAt(d.cx, hy + 1.4, d.cz);
      this.group.add(hut, roof, win);
      this.staticTargets.push(hut);
      this.addCollider(hx, hz, 2.6, 2.6, 3.4);
    }
    // lamp posts along the walk
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const lx = d.cx + Math.cos(a) * 22, lz = d.cz + Math.sin(a) * 22;
      const ly = terrainHeight(lx, lz);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 3.4, 6), stoneMat);
      post.position.set(lx, ly + 1.7, lz);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), glowMat(0xffd88a, 0.95));
      lamp.position.set(lx, ly + 3.5, lz);
      this.group.add(post, lamp);
      this.addCollider(lx, lz, 0.25, 0.25, 3.4);
    }
  }

  /** Translucent glass shard — the planet's signature prop. */
  private glassShard(h: number, tint: number, rng: () => number): THREE.Mesh {
    const geo = new THREE.ConeGeometry(h * 0.16, h, 5);
    const mat = new THREE.MeshToonMaterial({ color: tint, transparent: true, opacity: 0.55 });
    const shard = new THREE.Mesh(geo, mat);
    shard.rotation.set((rng() - 0.5) * 0.35, rng() * Math.PI, (rng() - 0.5) * 0.35);
    return shard;
  }

  /** THE CHIMEFIELD — glass flora that rings when the wind argues with it. */
  private buildChimefield(d: DistrictDef): void {
    const rng = mulberry32(424242);
    for (let i = 0; i < 34; i++) {
      const a = rng() * Math.PI * 2, r = rng() * d.radius * 0.9;
      const x = d.cx + Math.cos(a) * r, z = d.cz + Math.sin(a) * r;
      if (!this.clearOfAssets(x, z, 1.6)) continue;
      const y = terrainHeight(x, z);
      const cluster = new THREE.Group();
      const n = 2 + Math.floor(rng() * 3);
      for (let k = 0; k < n; k++) {
        const h = 1.6 + rng() * 3.2;
        const stalk = this.glassShard(h, k % 2 ? 0x7af0ff : 0xb0a0ff, rng);
        stalk.position.set((rng() - 0.5) * 1.6, h * 0.45, (rng() - 0.5) * 1.6);
        cluster.add(stalk);
        const bead = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 6), glowMat(0x7af0ff, 0.9));
        bead.position.set(stalk.position.x, h * 0.95, stalk.position.z);
        cluster.add(bead);
      }
      cluster.position.set(x, y, z);
      this.group.add(cluster);
      this.staticTargets.push(cluster);
      if (n >= 3) this.addCollider(x, z, 0.9, 0.9, 2.4);
    }
  }

  /** THE SHARDSEA — a storm of glass monoliths, paused mid-shatter. */
  private buildShardsea(d: DistrictDef): void {
    const rng = mulberry32(90909);
    for (let i = 0; i < 16; i++) {
      const a = rng() * Math.PI * 2, r = 8 + rng() * d.radius * 0.85;
      const x = d.cx + Math.cos(a) * r, z = d.cz + Math.sin(a) * r;
      if (!this.clearOfAssets(x, z, 3)) continue;
      const y = terrainHeight(x, z);
      const h = 7 + rng() * 15;
      const mono = this.glassShard(h, rng() > 0.5 ? 0x8ab8ff : 0xc0a8ff, rng);
      mono.position.set(x, y + h * 0.42, z);
      this.group.add(mono);
      this.staticTargets.push(mono);
      this.addCollider(x, z, h * 0.14 + 0.6, h * 0.14 + 0.6, h * 0.8);
      // a glow vein up the face
      const vein = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, h * 0.7, 5), glowMat(0x7af0ff, 0.8));
      vein.position.set(x + 0.2, y + h * 0.4, z);
      vein.rotation.copy(mono.rotation);
      this.group.add(vein);
    }
  }

  /** THE NULL BASIN — a sunken ring of dead obelisks around a dark eye. */
  private buildNullBasin(d: DistrictDef): void {
    const stoneMat = toonMat({ color: 0x241c40, map: rockTexture('#1d1636') });
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const x = d.cx + Math.cos(a) * 16, z = d.cz + Math.sin(a) * 16;
      const y = terrainHeight(x, z);
      const ob = new THREE.Mesh(new THREE.BoxGeometry(1.6, 7 + (i % 3) * 2, 1.2), stoneMat);
      ob.position.set(x, y + 3.2 + (i % 3), z);
      ob.rotation.y = a;
      this.group.add(ob);
      this.staticTargets.push(ob);
      this.addCollider(x, z, 1.2, 1.0, 8);
      const rune = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.6, 0.06), glowMat(0xc06bff, 0.7));
      rune.position.set(x + Math.cos(a + Math.PI) * 0.85, y + 3.4, z + Math.sin(a + Math.PI) * 0.85);
      rune.rotation.y = a;
      this.group.add(rune);
    }
    const eye = new THREE.Mesh(new THREE.CircleGeometry(6, 20), new THREE.MeshBasicMaterial({ color: 0x050310 }));
    eye.rotation.x = -Math.PI / 2;
    eye.position.set(d.cx, terrainHeight(d.cx, d.cz) + 0.08, d.cz);
    this.group.add(eye);
  }

  // ------------------------------------------------------- THE UNLIT MILE
  /** A mile street lamp: iron post, swing arm, caged head. The mile's dead
   *  ones are the scenery; the lit ones are the plot. */
  private mileLamp(x: number, z: number, lit: boolean, lean = 0): void {
    const y = terrainHeight(x, z);
    const g = new THREE.Group();
    const iron = toonMat({ color: 0x1e1836, map: swatch('#181230', 70) });
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 4.4, 6), iron);
    post.position.y = 2.2;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.1, 0.1), iron);
    arm.position.set(0.35, 4.3, 0);
    const cage = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.52, 0.44), iron);
    cage.position.set(0.75, 3.98, 0);
    const pane = lit
      ? new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.4, 0.32), glowMat(0xffd88a, 0.95))
      : new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.4, 0.32), new THREE.MeshToonMaterial({ color: 0x0c0918 }));
    pane.position.set(0.75, 3.98, 0);
    if (lit) pane.name = 'blinker';
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.3, 4), iron);
    cap.position.set(0.75, 4.4, 0);
    g.add(post, arm, cage, pane, cap);
    g.rotation.set(0, (x * 13 + z * 7) % 6, lean);
    g.position.set(x, y, z);
    g.traverse((o) => (o.castShadow = true));
    this.group.add(g);
    this.staticTargets.push(g);
    if (Math.abs(lean) < 0.8) this.addCollider(x, z, 0.3, 0.3, 4.4);
  }

  /** THE GLOAMING GATE — the last two lit lamps on the planet's last road,
   *  and the first few dead ones, leaning in to listen. */
  private buildGloamGate(d: DistrictDef): void {
    this.mileLamp(d.cx - 5.5, d.cz + 4, true);
    this.mileLamp(d.cx + 5.5, d.cz + 4, true);
    const rng = mulberry32(616001);
    for (let i = 0; i < 4; i++) {
      const a = Math.PI * (0.9 + rng() * 1.2);
      this.mileLamp(d.cx + Math.cos(a) * (9 + rng() * 6), d.cz - 6 - rng() * 8, false, (rng() - 0.5) * 0.5);
    }
    // the guild's cracked call-bell, grounded beside the road
    const y = terrainHeight(d.cx + 7, d.cz - 4);
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.15, 1.3, 10, 1, true), toonMat({ color: 0x2e2652, map: rockTexture('#282048') }));
    bell.position.set(d.cx + 7, y + 0.7, d.cz - 4);
    bell.rotation.z = 0.5;
    this.group.add(bell);
    this.staticTargets.push(bell);
    this.addCollider(d.cx + 7, d.cz - 4, 1.2, 1.2, 1.6);
  }

  /** THE SNUFFED ROWS — the parade of dead lamps, still standing at
   *  attention two hundred years after last light. One never gave up. */
  private buildSnuffRows(d: DistrictDef): void {
    const rng = mulberry32(616002);
    for (let i = 0; i < 14; i++) {
      const a = rng() * Math.PI * 2, r = 5 + rng() * d.radius * 0.85;
      const x = d.cx + Math.cos(a) * r, z = d.cz + Math.sin(a) * r;
      if (!this.clearOfAssets(x, z, 2)) continue;
      this.mileLamp(x, z, false, rng() < 0.3 ? (rng() - 0.5) * 1.6 : (rng() - 0.5) * 0.3);
    }
    // lamp forty-one's cousin: one stubborn flicker mid-field
    this.mileLamp(d.cx + 3, d.cz - 5, true, 0.08);
    // drifts of swept glass between the posts
    for (let i = 0; i < 10; i++) {
      const a = rng() * Math.PI * 2, r = rng() * d.radius * 0.8;
      const x = d.cx + Math.cos(a) * r, z = d.cz + Math.sin(a) * r;
      if (!this.clearOfAssets(x, z, 1.2)) continue;
      const h = 0.7 + rng() * 1.1;
      const heap = this.glassShard(h, 0x5a4acf, rng);
      heap.position.set(x, terrainHeight(x, z) + h * 0.3, z);
      heap.rotation.x = 1.1 + rng() * 0.6;
      this.group.add(heap);
    }
  }

  /** WICK'S BOTHY — one warm window on a dark mile: a stone hut, a yard of
   *  salvaged lamps (all lit, all fussy), and string-lights between posts. */
  private buildWickBothy(d: DistrictDef): void {
    const y = terrainHeight(d.cx, d.cz);
    const stoneMat = toonMat({ color: 0x3a3260, map: rockTexture('#332b56') });
    // the hut itself, off the arena centre so the yard stays walkable
    const hx = d.cx - 7, hz = d.cz + 5;
    const hy = terrainHeight(hx, hz);
    const hut = new THREE.Mesh(new THREE.CylinderGeometry(3.0, 3.4, 3.0, 8), stoneMat);
    hut.position.set(hx, hy + 1.5, hz);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.8, 2.0, 8), toonMat({ color: 0x241c40 }));
    roof.position.set(hx, hy + 4.0, hz);
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.4, 0.5), stoneMat);
    chimney.position.set(hx + 1.6, hy + 4.4, hz);
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.1), glowMat(0xffd88a, 0.95));
    win.position.set(hx + 2.6, hy + 1.7, hz + 1.4);
    win.lookAt(d.cx + 6, hy + 1.7, d.cz - 6);
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.9, 0.14), toonMat({ color: 0x4a3e7a }));
    door.position.set(hx + 2.9, hy + 0.95, hz - 0.6);
    door.lookAt(d.cx + 8, hy + 0.95, d.cz - 4);
    this.group.add(hut, roof, chimney, win, door);
    this.staticTargets.push(hut);
    this.addCollider(hx, hz, 3.5, 3.5, 4.2);
    // the forty (abridged): a ring of mismatched salvaged lamps, all burning
    const rng = mulberry32(616003);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.3;
      const lx = d.cx + Math.cos(a) * (10 + rng() * 3);
      const lz = d.cz + Math.sin(a) * (10 + rng() * 3);
      if (!this.clearOfAssets(lx, lz, 1.4)) continue;
      this.mileLamp(lx, lz, true, (rng() - 0.5) * 0.16);
    }
    // string-lights: beads slung between two posts across the yard
    const p1 = new THREE.Vector3(d.cx - 4, 0, d.cz - 6);
    const p2 = new THREE.Vector3(d.cx + 7, 0, d.cz + 2);
    p1.y = terrainHeight(p1.x, p1.z) + 3.6;
    p2.y = terrainHeight(p2.x, p2.z) + 3.6;
    for (const p of [p1, p2]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 3.8, 6), stoneMat);
      post.position.set(p.x, p.y - 1.9, p.z);
      this.group.add(post);
      this.addCollider(p.x, p.z, 0.25, 0.25, 3.8);
    }
    for (let i = 1; i < 8; i++) {
      const t = i / 8;
      const bead = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 6), glowMat(i % 2 ? 0xffd88a : 0x9a6aff, 0.9));
      bead.position.lerpVectors(p1, p2, t);
      bead.position.y -= Math.sin(t * Math.PI) * 0.7; // the sag
      bead.name = 'blinker';
      this.group.add(bead);
    }
    // crates of lamp heads awaiting repair
    for (let i = 0; i < 3; i++) {
      const cx = d.cx + 4 + i * 1.4, cz = d.cz + 6 - i * 0.8;
      const crate = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.9, 1.1), toonMat({ color: 0x4a3e7a, map: swatch('#42366a', 60) }));
      crate.position.set(cx, terrainHeight(cx, cz) + 0.45, cz);
      crate.rotation.y = i * 0.5;
      this.group.add(crate);
      this.staticTargets.push(crate);
      this.addCollider(cx, cz, 0.8, 0.8, 1.0);
    }
    void y;
  }

  /** THE ECHO ORGAN — ranks of hollow glass pipes the wind plays. The
   *  mouths glow when the draft moves through them. */
  private buildEchoOrgan(d: DistrictDef): void {
    const rng = mulberry32(616004);
    for (let c = 0; c < 9; c++) {
      const a = rng() * Math.PI * 2, r = 6 + rng() * d.radius * 0.8;
      const cx = d.cx + Math.cos(a) * r, cz = d.cz + Math.sin(a) * r;
      if (!this.clearOfAssets(cx, cz, 3)) continue;
      const cluster = new THREE.Group();
      const n = 3 + Math.floor(rng() * 3);
      let tallest = 0;
      for (let k = 0; k < n; k++) {
        const h = 3.5 + rng() * 8.5;
        tallest = Math.max(tallest, h);
        const px = (rng() - 0.5) * 2.6, pz = (rng() - 0.5) * 2.6;
        const pipe = new THREE.Mesh(
          new THREE.CylinderGeometry(0.42, 0.5, h, 7, 1, true),
          new THREE.MeshToonMaterial({ color: k % 2 ? 0x6a5adf : 0x54d4ff, transparent: true, opacity: 0.5, side: THREE.DoubleSide }),
        );
        pipe.position.set(px, h * 0.5, pz);
        cluster.add(pipe);
        const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.06, 6, 14), glowMat(0x7af0ff, 0.85));
        mouth.rotation.x = Math.PI / 2;
        mouth.position.set(px, h, pz);
        mouth.name = 'blinker';
        cluster.add(mouth);
      }
      cluster.position.set(cx, terrainHeight(cx, cz), cz);
      this.group.add(cluster);
      this.staticTargets.push(cluster);
      this.addCollider(cx, cz, 1.7, 1.7, tallest);
    }
  }

  /** LAMPFALL SPIRE — the sister lighthouse, toppled the night it went out.
   *  The court around the base is the Unkeeper's arena; the tower lies
   *  across the rim like a felled tree, lamp room dark where it rolled. */
  private buildLampfall(d: DistrictDef): void {
    const stoneMat = toonMat({ color: 0x2e2652, map: rockTexture('#282048') });
    const bandMat = toonMat({ color: 0x6a5a3a, map: swatch('#5a4c30', 60) }); // tarnished gold
    // the stump: four metres of tower still standing, rim cracked
    const bx = d.cx - 16, bz = d.cz - 6;
    const by = terrainHeight(bx, bz);
    const stump = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.3, 4.5, 10), stoneMat);
    stump.position.set(bx, by + 2.25, bz);
    this.group.add(stump);
    this.staticTargets.push(stump);
    this.addCollider(bx, bz, 2.4, 2.4, 5);
    // the fallen shaft, laid outward from the stump toward the rim
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.9, 14, 10), stoneMat);
    const dir = new THREE.Vector3(-0.55, 0, -0.83);
    const mid = new THREE.Vector3(bx, 0, bz).addScaledVector(dir, 9.5);
    mid.y = terrainHeight(mid.x, mid.z) + 1.4;
    shaft.position.copy(mid);
    shaft.rotation.z = Math.PI / 2 - 0.12;
    shaft.rotation.y = Math.atan2(dir.x, dir.z) + Math.PI / 2;
    this.group.add(shaft);
    this.staticTargets.push(shaft);
    for (const t of [0.35, 0.65, 0.95]) {
      const cpos = new THREE.Vector3(bx, 0, bz).addScaledVector(dir, 4 + t * 11);
      this.addCollider(cpos.x, cpos.z, 1.8, 1.8, 3);
    }
    for (const t of [0.3, 0.6, 0.9]) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(1.45 + (1 - t) * 0.4, 1.5 + (1 - t) * 0.4, 0.45, 10), bandMat);
      const bpos = new THREE.Vector3(bx, 0, bz).addScaledVector(dir, 2.5 + t * 14);
      bpos.y = terrainHeight(bpos.x, bpos.z) + 1.4;
      band.position.copy(bpos);
      band.rotation.copy(shaft.rotation);
      this.group.add(band);
    }
    // the lamp room, rolled clear of the wreck: dark glass, dead beacon
    const lx = bx + dir.x * 19, lz = bz + dir.z * 19;
    const ly = terrainHeight(lx, lz);
    const lampRoom = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 2.2, 8), bandMat);
    lampRoom.position.set(lx, ly + 1.1, lz);
    lampRoom.rotation.z = 0.6;
    const deadBeacon = new THREE.Mesh(new THREE.SphereGeometry(1.0, 12, 12), new THREE.MeshToonMaterial({ color: 0x120d20, transparent: true, opacity: 0.85 }));
    deadBeacon.position.set(lx, ly + 1.3, lz);
    this.group.add(lampRoom, deadBeacon);
    this.staticTargets.push(lampRoom);
    this.addCollider(lx, lz, 2.0, 2.0, 2.6);
    // his rounds: a ring of dead lamps around the court, every one attended
    const rng = mulberry32(616005);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.2;
      const x = d.cx + Math.cos(a) * (d.radius - 6), z = d.cz + Math.sin(a) * (d.radius - 6);
      if (!this.clearOfAssets(x, z, 2)) continue;
      this.mileLamp(x, z, false, (rng() - 0.5) * 0.2);
    }
    // spilt glass where the tower shattered
    for (let i = 0; i < 8; i++) {
      const x = mid.x + (rng() - 0.5) * 14, z = mid.z + (rng() - 0.5) * 14;
      if (!this.clearOfAssets(x, z, 1.2)) continue;
      const h = 0.8 + rng() * 1.6;
      const shardp = this.glassShard(h, 0x6a5adf, rng);
      shardp.position.set(x, terrainHeight(x, z) + h * 0.35, z);
      this.group.add(shardp);
    }
  }

  // -------------------------------------------------------------- VOLTHOLM

  /** Conductor rod: SKYFALL shelter. A guyed mast with a charged tip and a
   *  ground ring showing the shelter radius — hug it when the sirens sing. */
  private buildRod(poi: WorldPoi): void {
    const y = terrainHeight(poi.x, poi.z);
    const iron = toonMat({ color: 0x32383e, map: swatch('#2c3238', 60) });
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.4, 12, 6), iron);
    mast.position.set(poi.x, y + 6, poi.z);
    this.group.add(mast);
    this.staticTargets.push(mast);
    this.addCollider(poi.x, poi.z, 0.5, 0.5, 12);
    // tripod feet
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 3.2, 5), iron);
      leg.position.set(poi.x + Math.cos(a) * 1.1, y + 1.4, poi.z + Math.sin(a) * 1.1);
      leg.rotation.z = Math.cos(a) * 0.5;
      leg.rotation.x = -Math.sin(a) * 0.5;
      this.group.add(leg);
    }
    // coil rings up the mast + the charged tip
    const brass = toonMat({ color: 0x9a8a3c });
    for (const h of [7.5, 9.2, 10.9]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.07, 6, 12), brass);
      ring.position.set(poi.x, y + h, poi.z);
      ring.rotation.x = Math.PI / 2;
      this.group.add(ring);
    }
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 8), glowMat(0xc8d24a, 0.95));
    tip.position.set(poi.x, y + 12.3, poi.z);
    tip.name = 'blinker';
    this.group.add(tip);
    // the shelter ring: a faint circle on the dirt saying "safe-ish here"
    const ringGeo = new THREE.RingGeometry(9.4, 10, 36);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xc8d24a, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false });
    const shelter = new THREE.Mesh(ringGeo, ringMat);
    shelter.rotation.x = -Math.PI / 2;
    shelter.position.set(poi.x, y + 0.15, poi.z);
    this.group.add(shelter);
  }

  /** THE JARWORKS — Voltholm's company town: rack after rack of bottled
   *  lightning, a civic siren horn, and the paperwork to prove it's legal. */
  private buildJarworks(d: DistrictDef): void {
    const rng = mulberry32(717001);
    const iron = toonMat({ color: 0x3a4046, map: swatch('#343a40', 60) });
    // jar racks: shelving with rows of glowing capacitor jars
    for (let rIdx = 0; rIdx < 5; rIdx++) {
      const a = rng() * Math.PI * 2, r = 8 + rng() * (d.radius * 0.6);
      const x = d.cx + Math.cos(a) * r, z = d.cz + Math.sin(a) * r;
      if (!this.clearOfAssets(x, z, 3)) continue;
      const y = terrainHeight(x, z);
      const rack = new THREE.Group();
      const frame = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.6, 1.0), iron);
      frame.position.y = 1.3;
      rack.add(frame);
      for (let s = 0; s < 2; s++) {
        for (let j = 0; j < 4; j++) {
          const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.6, 7), glowMat(rng() < 0.7 ? 0xc8d24a : 0x9adcff, 0.8));
          jar.position.set(-1.2 + j * 0.8, 0.75 + s * 1.1, 0.56);
          if (rng() < 0.5) jar.name = 'blinker';
          rack.add(jar);
        }
      }
      rack.position.set(x, y, z);
      rack.rotation.y = rng() * Math.PI * 2;
      this.group.add(rack);
      this.staticTargets.push(rack);
      this.addCollider(x, z, 1.9, 1.9, 2.8);
    }
    // the SKYFALL civic horn: a pole with two bell speakers
    const hx = d.cx + 6, hz = d.cz - 10;
    const hy = terrainHeight(hx, hz);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 6.5, 6), iron);
    pole.position.set(hx, hy + 3.25, hz);
    this.group.add(pole);
    this.addCollider(hx, hz, 0.4, 0.4, 6.5);
    for (const s of [-1, 1]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.1, 8, 1, true), toonMat({ color: 0x8a2e2e }));
      horn.position.set(hx + s * 0.7, hy + 6.1, hz);
      horn.rotation.z = s * (Math.PI / 2 + 0.3);
      this.group.add(horn);
    }
    // stacked cable drums + crates for yard clutter
    for (let i = 0; i < 6; i++) {
      const a = rng() * Math.PI * 2, r = 6 + rng() * (d.radius * 0.7);
      const x = d.cx + Math.cos(a) * r, z = d.cz + Math.sin(a) * r;
      if (!this.clearOfAssets(x, z, 1.6)) continue;
      const y = terrainHeight(x, z);
      if (rng() < 0.5) {
        const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.7, 10), toonMat({ color: 0x6a5a3a, map: swatch('#5a4c30', 50) }));
        drum.position.set(x, y + 0.45, z);
        drum.rotation.x = Math.PI / 2;
        drum.rotation.z = rng() * Math.PI;
        this.group.add(drum);
        this.staticTargets.push(drum);
        this.addCollider(x, z, 0.9, 0.9, 1.0);
      } else {
        const crate = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.0, 1.2), toonMat({ color: 0x4a5560, map: swatch('#424c56', 60) }));
        crate.position.set(x, y + 0.5, z);
        crate.rotation.y = rng() * Math.PI;
        this.group.add(crate);
        this.staticTargets.push(crate);
        this.addCollider(x, z, 0.85, 0.85, 1.1);
      }
    }
  }

  /** THE GALE FLATS — wind-scoured slate. Everything leans the way the
   *  weather went: slabs, windsocks, and the bones of less careful crews. */
  private buildGaleFlats(d: DistrictDef): void {
    const rng = mulberry32(717002);
    // leaning slabs, all bowed the same direction (the wind's direction)
    for (let i = 0; i < 12; i++) {
      const a = rng() * Math.PI * 2, r = 6 + rng() * (d.radius * 0.85);
      const x = d.cx + Math.cos(a) * r, z = d.cz + Math.sin(a) * r;
      if (!this.clearOfAssets(x, z, 2.4)) continue;
      const y = terrainHeight(x, z);
      const h = 1.8 + rng() * 3.4;
      const slab = new THREE.Mesh(new THREE.BoxGeometry(0.7 + rng() * 1.2, h, 2.0 + rng() * 2.2), toonMat({ color: 0x55605c, map: rockTexture('#4c5854') }));
      slab.position.set(x, y + h * 0.42, z);
      slab.rotation.z = -0.28 - rng() * 0.22; // the lean: the wind always wins
      slab.rotation.y = rng() * 0.6 - 0.3;
      this.group.add(slab);
      this.staticTargets.push(slab);
      this.addCollider(x, z, 1.2, 1.2, h);
    }
    // windsock poles: full horizontal — this is not a gentle breeze
    for (let i = 0; i < 4; i++) {
      const a = rng() * Math.PI * 2, r = 8 + rng() * (d.radius * 0.7);
      const x = d.cx + Math.cos(a) * r, z = d.cz + Math.sin(a) * r;
      if (!this.clearOfAssets(x, z, 1.4)) continue;
      const y = terrainHeight(x, z);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 4.2, 6), toonMat({ color: 0x3a4046 }));
      pole.position.set(x, y + 2.1, z);
      this.group.add(pole);
      this.addCollider(x, z, 0.3, 0.3, 4.2);
      const sock = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.6, 7, 1, true), toonMat({ color: 0xc86a2e }));
      sock.position.set(x, y + 4.0, z);
      sock.rotation.z = Math.PI / 2 + 0.08; // flying straight out
      sock.name = 'windsock';
      this.group.add(sock);
    }
    // wrecked harvest kites: frames snapped into the slate
    for (let i = 0; i < 3; i++) {
      const a = rng() * Math.PI * 2, r = 10 + rng() * (d.radius * 0.6);
      const x = d.cx + Math.cos(a) * r, z = d.cz + Math.sin(a) * r;
      if (!this.clearOfAssets(x, z, 2)) continue;
      const y = terrainHeight(x, z);
      const frame = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.09, 6, 12, Math.PI * 1.4), toonMat({ color: 0x6a4a2e }));
      frame.position.set(x, y + 0.8, z);
      frame.rotation.set(rng() * 1.2, rng() * Math.PI, 0.9);
      this.group.add(frame);
      this.staticTargets.push(frame);
    }
  }

  /** CONDUCTOR ROW — the monks' avenue: pylon shrines strung with sagging
   *  cable, votive jars at every base. Grounded, in every sense but one. */
  private buildConductorRow(d: DistrictDef): void {
    const rng = mulberry32(717003);
    const iron = toonMat({ color: 0x32383e, map: swatch('#2c3238', 60) });
    // shrine pylons: mini-rods with a hooded lamp head, in a rough row
    const posts: THREE.Vector3[] = [];
    for (let i = 0; i < 7; i++) {
      const t = i / 6;
      const x = d.cx - d.radius * 0.7 + t * d.radius * 1.4 + (rng() - 0.5) * 8;
      const z = d.cz + Math.sin(t * Math.PI * 2) * d.radius * 0.35 + (rng() - 0.5) * 8;
      if (!this.clearOfAssets(x, z, 2)) continue;
      const y = terrainHeight(x, z);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.3, 5.4, 6), iron);
      post.position.set(x, y + 2.7, z);
      this.group.add(post);
      this.staticTargets.push(post);
      this.addCollider(x, z, 0.45, 0.45, 5.4);
      const hood = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.7, 7), iron);
      hood.position.set(x, y + 5.6, z);
      this.group.add(hood);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.24, 7, 7), glowMat(0xc8d24a, 0.9));
      lamp.position.set(x, y + 5.25, z);
      if (rng() < 0.4) lamp.name = 'blinker';
      this.group.add(lamp);
      posts.push(new THREE.Vector3(x, y + 5.1, z));
      // votive jars at the base, humming their little prayers
      for (let j = 0; j < 2 + Math.floor(rng() * 3); j++) {
        const ja = rng() * Math.PI * 2;
        const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.44, 6), glowMat(0x9adcff, 0.7));
        jar.position.set(x + Math.cos(ja) * 0.9, y + 0.22, z + Math.sin(ja) * 0.9);
        this.group.add(jar);
      }
    }
    // sagging cables between consecutive pylons
    for (let i = 0; i + 1 < posts.length; i++) {
      const p1 = posts[i], p2 = posts[i + 1];
      if (p1.distanceTo(p2) > 40) continue;
      for (let b = 1; b < 7; b++) {
        const t = b / 7;
        const bead = new THREE.Mesh(new THREE.SphereGeometry(0.07, 5, 5), toonMat({ color: 0x22262a }));
        bead.position.lerpVectors(p1, p2, t);
        bead.position.y -= Math.sin(t * Math.PI) * 1.2;
        this.group.add(bead);
      }
    }
  }

  /** THE CAPACITORIUM — the Abbot's chapel: a ring of giant charged stacks
   *  around a dais. The architecture hums. The congregation is voltage. */
  private buildCapacitorium(d: DistrictDef): void {
    const rng = mulberry32(717004);
    const dark = toonMat({ color: 0x2a3036, map: rockTexture('#242a30') });
    const brass = toonMat({ color: 0x9a8a3c, map: swatch('#8a7a34', 60) });
    // the stacks: fat capacitor towers ringing the arena
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.15;
      const x = d.cx + Math.cos(a) * (d.radius - 5.5), z = d.cz + Math.sin(a) * (d.radius - 5.5);
      const y = terrainHeight(x, z);
      const h = 6.5 + rng() * 3;
      const tower = new THREE.Group();
      for (let s = 0; s < 4; s++) {
        const seg = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.25, h / 4 - 0.12, 10), s % 2 ? brass : dark);
        seg.position.y = (s + 0.5) * (h / 4);
        tower.add(seg);
      }
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), glowMat(0xc8d24a, 0.9));
      tip.position.y = h + 0.4;
      if (i % 2 === 0) tip.name = 'blinker';
      tower.add(tip);
      tower.position.set(x, y, z);
      this.group.add(tower);
      this.staticTargets.push(tower);
      this.addCollider(x, z, 1.5, 1.5, h);
    }
    // the dais: three shallow steps to nowhere in particular
    const dy = terrainHeight(d.cx, d.cz);
    for (let s = 0; s < 3; s++) {
      const step = new THREE.Mesh(new THREE.CylinderGeometry(5.5 - s * 1.4, 5.9 - s * 1.4, 0.5, 12), dark);
      step.position.set(d.cx, dy + 0.25 + s * 0.5, d.cz);
      this.group.add(step);
    }
    // pews for the faithful: rows of grounded slate benches
    for (let i = 0; i < 6; i++) {
      const a = rng() * Math.PI * 2, r = 9 + rng() * (d.radius * 0.5);
      const x = d.cx + Math.cos(a) * r, z = d.cz + Math.sin(a) * r;
      if (!this.clearOfAssets(x, z, 2)) continue;
      const y = terrainHeight(x, z);
      const pew = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.5, 0.7), dark);
      pew.position.set(x, y + 0.25, z);
      pew.rotation.y = Math.atan2(d.cx - x, d.cz - z);
      this.group.add(pew);
      this.staticTargets.push(pew);
      this.addCollider(x, z, 1.2, 0.6, 0.8);
    }
  }

  /** THE EYEWALL — the storm's heart. A crater rim of storm-bent monoliths
   *  and the mooring field Gale Prime tore loose from: anchor blocks with
   *  snapped chain still swinging. */
  private buildEyewall(d: DistrictDef): void {
    const rng = mulberry32(717005);
    const slate = toonMat({ color: 0x4a5560, map: rockTexture('#424c56') });
    // rim monoliths, storm-bent inward like a closing hand
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.1;
      const x = d.cx + Math.cos(a) * (d.radius - 4), z = d.cz + Math.sin(a) * (d.radius - 4);
      // on the Jar Run the finish straight cuts through this ring — the
      // monoliths on the racing line politely never grew there
      if (this.trackDist(x, z) < 12) continue;
      const y = terrainHeight(x, z);
      const h = 4.5 + rng() * 4;
      const mono = new THREE.Mesh(new THREE.BoxGeometry(1.2 + rng() * 0.8, h, 1.0 + rng() * 0.6), slate);
      mono.position.set(x, y + h * 0.42, z);
      // every one leans toward the centre — the eye pulls
      mono.lookAt(d.cx, y + h * 2.2, d.cz);
      this.group.add(mono);
      this.staticTargets.push(mono);
      this.addCollider(x, z, 1.2, 1.2, h);
    }
    // the mooring field: anchor blocks with snapped chain stubs
    for (let i = 0; i < 6; i++) {
      const a = rng() * Math.PI * 2, r = 6 + rng() * (d.radius * 0.55);
      const x = d.cx + Math.cos(a) * r, z = d.cz + Math.sin(a) * r;
      if (!this.clearOfAssets(x, z, 2)) continue;
      const y = terrainHeight(x, z);
      const block = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.1, 1.6), toonMat({ color: 0x32383e, map: swatch('#2c3238', 60) }));
      block.position.set(x, y + 0.55, z);
      block.rotation.y = rng() * Math.PI;
      this.group.add(block);
      this.staticTargets.push(block);
      this.addCollider(x, z, 1.0, 1.0, 1.2);
      // the chain that lost the argument: a few links arcing skyward
      for (let l = 0; l < 3; l++) {
        const link = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.06, 5, 8), toonMat({ color: 0x22262a }));
        link.position.set(x + 0.2 * l, y + 1.3 + l * 0.38, z + 0.1 * l);
        link.rotation.set(rng() * 1.2, rng() * 1.2, 0);
        this.group.add(link);
      }
    }
    // dead centre: the mooring Gale Prime kept, a lone ring bolted to a slab
    // — except when the centre IS the finish line (the Jar Run parks it off
    // to the shoulder instead of ending every race with a wall)
    const slabP = this.offTrack({ x: d.cx, z: d.cz }, 13);
    const cy = terrainHeight(slabP.x, slabP.z);
    const slabC = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.0, 0.7, 10), slate);
    slabC.position.set(slabP.x, cy + 0.35, slabP.z);
    this.group.add(slabC);
    const ringC = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.14, 8, 14), glowMat(0x9adcff, 0.8));
    ringC.position.set(slabP.x, cy + 1.15, slabP.z);
    ringC.rotation.x = 0.4;
    ringC.name = 'blinker';
    this.group.add(ringC);
  }

  // ----------------------------------------------------------- THE BECALMED

  /** THE STILLING GATE — Bet's weather station: twenty years of instruments
   *  reading zero, a dead-vertical windsock, and one warm window. */
  private buildStillgate(d: DistrictDef): void {
    const iron = toonMat({ color: 0x3a4440, map: swatch('#343e3a', 60) });
    // the station hut: squat, instrument-crowned, lamp in the window
    const hx = d.cx - 8, hz = d.cz - 4;
    const hy = terrainHeight(hx, hz);
    const hut = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 4), toonMat({ color: 0x4a5450, map: rockTexture('#424c48') }));
    hut.position.set(hx, hy + 1.5, hz);
    // a stone foundation skirt seats the box INTO the ground
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(5.6, 1.0, 4.6), toonMat({ color: 0x38423e, map: rockTexture('#323c38') }));
    skirt.position.set(hx, hy + 0.25, hz);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.3, 4.8), iron);
    roof.position.set(hx, hy + 3.15, hz);
    const eave = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.16, 1.3), iron);
    eave.position.set(hx, hy + 3.0, hz + 2.7);
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 0.1), glowMat(0xffd88a, 0.95));
    win.position.set(hx + 1.2, hy + 1.7, hz + 2.02);
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.9, 0.12), toonMat({ color: 0x2c3834 }));
    door.position.set(hx - 1.1, hy + 0.95, hz + 2.02);
    const porch = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), glowMat(0xffd88a, 0.95));
    porch.position.set(hx - 1.1, hy + 2.25, hz + 2.2);
    this.group.add(hut, skirt, roof, eave, win, door, porch);
    this.staticTargets.push(hut);
    this.addCollider(hx, hz, 2.8, 2.3, 3.4);
    // instrument masts: cup anemometers that have not turned in twenty years
    const rng = mulberry32(818001);
    for (let i = 0; i < 4; i++) {
      const a = rng() * Math.PI * 2, r = 6 + rng() * (d.radius * 0.6);
      const x = d.cx + Math.cos(a) * r, z = d.cz + Math.sin(a) * r;
      if (!this.clearOfAssets(x, z, 1.4)) continue;
      const y = terrainHeight(x, z);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 4.6, 6), iron);
      mast.position.set(x, y + 2.3, z);
      this.group.add(mast);
      this.addCollider(x, z, 0.3, 0.3, 4.6);
      for (let c = 0; c < 3; c++) {
        const ca = (c / 3) * Math.PI * 2;
        const cup = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 6), toonMat({ color: 0x8a2e2e }));
        cup.position.set(x + Math.cos(ca) * 0.5, y + 4.5, z + Math.sin(ca) * 0.5);
        this.group.add(cup);
      }
    }
    // the famous windsock: hanging straight down, like a flag at a funeral
    const px = d.cx + 7, pz = d.cz + 6;
    const py = terrainHeight(px, pz);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 4.4, 6), iron);
    pole.position.set(px, py + 2.2, pz);
    const sock = new THREE.Mesh(new THREE.ConeGeometry(0.32, 1.5, 7, 1, true), toonMat({ color: 0xc86a2e }));
    sock.position.set(px + 0.4, py + 3.4, pz);
    sock.rotation.z = Math.PI; // dead vertical: the joke IS the dressing
    this.group.add(pole, sock);
    this.addCollider(px, pz, 0.3, 0.3, 4.4);
  }

  /** THE HANG FIELDS — harvest kites frozen mid-flight, cables taut to their
   *  anchors, twenty years after the wind that held them up went missing. */
  private buildHangFields(d: DistrictDef): void {
    const rng = mulberry32(818002);
    for (let i = 0; i < 8; i++) {
      const a = rng() * Math.PI * 2, r = 6 + rng() * (d.radius * 0.8);
      const x = d.cx + Math.cos(a) * r, z = d.cz + Math.sin(a) * r;
      if (!this.clearOfAssets(x, z, 2)) continue;
      const y = terrainHeight(x, z);
      // ground anchor
      const anchor = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.8, 1.1), toonMat({ color: 0x32383e, map: swatch('#2c3238', 60) }));
      anchor.position.set(x, y + 0.4, z);
      this.group.add(anchor);
      this.staticTargets.push(anchor);
      this.addCollider(x, z, 0.8, 0.8, 0.9);
      // the kite: a real BOX KITE — open canvas cells on crossed spars,
      // nose pulled toward a wind that stopped twenty years ago
      const kh = 9 + rng() * 6;
      const kx = x + 2 + rng() * 3, kz = z + (rng() - 0.5) * 4;
      const kite = new THREE.Group();
      const canvas = toonMat({ color: 0xd8c8a8, map: swatch('#c8b898', 50) });
      const accent = toonMat({ color: 0xc86a2e });
      const sparMat = toonMat({ color: 0x4a3e2e });
      // two open canvas cells (thin-walled boxes, hollow look via BackSide pair)
      const cells: [number, THREE.Material][] = [[0, canvas], [1.35, accent]];
      for (const [cy, mat] of cells) {
        for (const sd of [-1, 1]) {
          const wallX = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.7, 1.5), mat);
          wallX.position.set(sd * 0.65, cy, 0);
          kite.add(wallX);
          const wallZ = new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.7, 0.04), mat);
          wallZ.position.set(0, cy, sd * 0.73);
          kite.add(wallZ);
        }
      }
      // four corner spars tying the cells together
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const spar = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.2, 4), sparMat);
        spar.position.set(sx * 0.62, 0.68, sz * 0.7);
        kite.add(spar);
      }
      // bridle + tail pennants trailing below
      for (let t = 0; t < 3; t++) {
        const pennant = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.4, 3), t % 2 ? accent : canvas);
        pennant.position.set(0, -0.8 - t * 0.55, 0.2 + t * 0.12);
        pennant.rotation.x = Math.PI + 0.25;
        kite.add(pennant);
      }
      kite.position.set(kx, y + kh, kz);
      kite.rotation.y = Math.atan2(kx - x, kz - z) + Math.PI / 2;
      kite.rotation.z = 0.32; // nose up into the ghost of the wind
      this.group.add(kite);
      this.staticTargets.push(kite);
      // the cable: one continuous taut line from anchor drum to bridle
      const from = new THREE.Vector3(x, y + 0.7, z);
      const to = new THREE.Vector3(kx, y + kh - 0.9, kz);
      const len = from.distanceTo(to);
      const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, len, 4), toonMat({ color: 0x22262a }));
      cable.position.copy(from).lerp(to, 0.5);
      cable.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
      this.group.add(cable);
    }
  }

  /** THE BARROW LINE — the crews that lay down standing up: harvest rigs
   *  parked in ranks, each with a cold lantern and a cairn of jars. */
  private buildBarrowLine(d: DistrictDef): void {
    const rng = mulberry32(818003);
    const iron = toonMat({ color: 0x3a4440, map: swatch('#343e3a', 60) });
    for (let i = 0; i < 10; i++) {
      const t = i / 9;
      const x = d.cx - d.radius * 0.7 + t * d.radius * 1.4 + (rng() - 0.5) * 10;
      const z = d.cz + Math.sin(t * Math.PI * 1.6) * d.radius * 0.4 + (rng() - 0.5) * 10;
      if (!this.clearOfAssets(x, z, 2)) continue;
      const y = terrainHeight(x, z);
      // the rig: a person-shaped harvest frame, standing at rest
      const frame = new THREE.Group();
      const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 2.4, 6), iron);
      spine.position.y = 1.2;
      const shoulders = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.14, 0.14), iron);
      shoulders.position.y = 2.1;
      const hood = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.6, 7), iron);
      hood.position.y = 2.6;
      frame.add(spine, shoulders, hood);
      frame.position.set(x, y, z);
      frame.rotation.y = rng() * Math.PI * 2;
      frame.rotation.z = (rng() - 0.5) * 0.12; // the lean of a long sleep
      this.group.add(frame);
      this.staticTargets.push(frame);
      this.addCollider(x, z, 0.5, 0.5, 2.8);
      // cold lantern at the feet + a cairn of empty jars
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.36, 0.3), new THREE.MeshToonMaterial({ color: 0x24302c, transparent: true, opacity: 0.9 }));
      lamp.position.set(x + 0.7, y + 0.2, z + 0.3);
      this.group.add(lamp);
      for (let j = 0; j < 2 + Math.floor(rng() * 3); j++) {
        const ja = rng() * Math.PI * 2;
        const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.4, 6), new THREE.MeshToonMaterial({ color: 0x6a7a76, transparent: true, opacity: 0.6 }));
        jar.position.set(x + Math.cos(ja) * 1.1, y + 0.2, z + Math.sin(ja) * 1.1);
        this.group.add(jar);
      }
    }
  }

  /** THE HELD BREATH's hollow — a smooth bowl ringed by monoliths bent
   *  INWARD, debris hanging mid-air around the centre where the missing
   *  wind sits coiled. Nothing here has landed in twenty years. */
  private buildBreathHall(d: DistrictDef): void {
    const rng = mulberry32(818004);
    const slate = toonMat({ color: 0x48524e, map: rockTexture('#424c48') });
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.2;
      const x = d.cx + Math.cos(a) * (d.radius - 4), z = d.cz + Math.sin(a) * (d.radius - 4);
      const y = terrainHeight(x, z);
      const h = 5 + rng() * 3.5;
      const mono = new THREE.Mesh(new THREE.BoxGeometry(1.3, h, 1.0), slate);
      mono.position.set(x, y + h * 0.42, z);
      mono.lookAt(d.cx, y + h * 2.6, d.cz); // bowed toward the breath
      this.group.add(mono);
      this.staticTargets.push(mono);
      this.addCollider(x, z, 1.1, 1.1, h);
    }
    // suspended debris: rocks and jars orbiting nothing, at every height
    for (let i = 0; i < 16; i++) {
      const a = rng() * Math.PI * 2, r = 5 + rng() * (d.radius * 0.6);
      const x = d.cx + Math.cos(a) * r, z = d.cz + Math.sin(a) * r;
      const y = terrainHeight(x, z) + 1.5 + rng() * 7;
      const s = 0.25 + rng() * 0.6;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), slate);
      rock.position.set(x, y, z);
      rock.rotation.set(rng() * 3, rng() * 3, rng() * 3);
      this.group.add(rock);
    }
    // the centre: a swirl-worn dais SEATED into the bowl — wide buried base,
    // low profile, a skirt of tumbled stones sealing the seam with the dirt
    const cy = terrainHeight(d.cx, d.cz);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 6.4, 1.2, 14), slate);
    base.position.set(d.cx, cy - 0.25, d.cz);
    const step = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 4.4, 0.5, 14), slate);
    step.position.set(d.cx, cy + 0.55, d.cz);
    this.group.add(base, step);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.3;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5 + (i % 3) * 0.22, 0), slate);
      const rx = d.cx + Math.cos(a) * 6.0, rz = d.cz + Math.sin(a) * 6.0;
      rock.position.set(rx, terrainHeight(rx, rz) + 0.25, rz);
      rock.rotation.set(i, i * 0.7, i * 0.4);
      this.group.add(rock);
    }
  }

  // -------------------------------------------------------------- THE AUGER

  /** Hazard-striped bollard with a working amber beacon — the Combine's
   *  idea of a warm welcome, repeated all the way down the thread. */
  private boreBollard(x: number, z: number): void {
    const y = terrainHeight(x, z);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 1.5, 6),
      toonMat({ color: 0xd8a020, map: swatch('#c08c14', 60) }));
    post.position.set(x, y + 0.75, z);
    this.group.add(post);
    this.staticTargets.push(post);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.13, 6, 6), glowMat(0xffb43c, 0.95));
    beacon.position.set(x, y + 1.62, z);
    beacon.name = 'blinker';
    this.group.add(beacon);
  }

  /** BORE SITE ONE — GATE: the pit head. Winch tower, spoil heaps, the
   *  company sign nobody took down, and the first depth marker. */
  private buildBoreGate(d: DistrictDef): void {
    const rng = mulberry32(919001);
    const iron = toonMat({ color: 0x4a4440, map: swatch('#423c38', 60) });
    // the winch tower: an A-frame straddling the thread's first step
    const ty = terrainHeight(d.cx - 8, d.cz);
    for (const sd of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.5, 11, 0.5), iron);
      leg.position.set(d.cx - 8 + sd * 3.2, ty + 5.5, d.cz + sd * 1.2);
      leg.rotation.z = sd * 0.18;
      this.group.add(leg);
      this.staticTargets.push(leg);
      this.addCollider(d.cx - 8 + sd * 3.2, d.cz + sd * 1.2, 0.6, 0.6, 11);
    }
    const cross = new THREE.Mesh(new THREE.BoxGeometry(7.5, 0.5, 0.5), iron);
    cross.position.set(d.cx - 8, ty + 10.6, d.cz);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.16, 6, 14), iron);
    wheel.position.set(d.cx - 8, ty + 9.4, d.cz);
    wheel.name = 'ft_ring'; // spins lazily, like it never got the memo
    const hook = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 4.5, 4), toonMat({ color: 0x22262a }));
    hook.position.set(d.cx - 8, ty + 7, d.cz);
    this.group.add(cross, wheel, hook);
    // braces, a cable drum, and skids: the A-frame reads as a MACHINE that
    // was parked, not sticks that grew there
    for (const sd of [-1, 1]) {
      const brace = new THREE.Mesh(new THREE.BoxGeometry(0.3, 6.4, 0.3), iron);
      brace.position.set(d.cx - 8 + sd * 1.7, ty + 3.4, d.cz - sd * 0.4);
      brace.rotation.z = -sd * 0.42;
      this.group.add(brace);
      const skid = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.4, 4.4), iron);
      skid.position.set(d.cx - 8 + sd * 3.2, ty + 0.2, d.cz);
      this.group.add(skid);
    }
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 2.2, 10), toonMat({ color: 0x6a5a3c, map: swatch('#5e5034', 60) }));
    drum.rotation.z = Math.PI / 2;
    drum.position.set(d.cx - 8, ty + 1.1, d.cz);
    this.group.add(drum);
    this.staticTargets.push(drum);
    this.addCollider(d.cx - 8, d.cz, 1.4, 1.2, 2);
    // spoil heaps: cones of what came out of the hole — sun-dried tailings,
    // parked on the pad's rim so they never swallow the vendors
    for (let i = 0; i < 4; i++) {
      const a = rng() * Math.PI * 2, r = 14 + rng() * 7;
      const x = d.cx + Math.cos(a) * r, z = d.cz + Math.sin(a) * r;
      if (!this.clearOfAssets(x, z, 3) || !this.flatEnough(x, z, 2.2, 1.2)) continue;
      const hh = 1.6 + rng() * 1.8;
      const heap = new THREE.Mesh(new THREE.ConeGeometry(hh * 1.4, hh, 8), toonMat({ color: 0xb89a74, map: rockTexture('#8a7050') }));
      heap.position.set(x, terrainHeight(x, z) + hh * 0.45, z);
      this.group.add(heap);
      this.staticTargets.push(heap);
      this.addCollider(x, z, hh, hh, hh);
    }
    // the company sign, corporate-cheerful about an 11-year-old disaster
    const sy = terrainHeight(d.cx + 4, d.cz + 14);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 2.2),
      new THREE.MeshBasicMaterial({ map: posterTexture({ lines: ['HELIX BORE SITE ONE', 'DAYS SINCE INCIDENT: 0', '(COUNTER BROKEN)'], style: 'warning', bg: '#e8e0cc', fg: '#1a1a1a', accent: '#d8a020' }, 6.5 / 2.2), side: THREE.DoubleSide }));
    board.position.set(d.cx + 4, sy + 2.6, d.cz + 14);
    // squared up to greet arrivals walking in from the gate pad — the old
    // yaw showed them the sign edge-on, a striped sliver in mid-air
    board.rotation.y = Math.PI - 0.16;
    const postL = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 3.2, 6), iron);
    postL.position.set(d.cx + 0.95, sy + 1.6, d.cz + 13.5); // under the rotated board ends
    const postR = postL.clone();
    postR.position.set(d.cx + 7.05, sy + 1.6, d.cz + 14.5);
    this.group.add(board, postL, postR);
    this.addCollider(d.cx + 4, d.cz + 14, 3.4, 0.5, 3);
    this.boreBollard(d.cx - 2, d.cz - 12);
    this.boreBollard(d.cx + 10, d.cz + 4);
  }

  /** THE THREAD — the spiral road itself: parked haulers, core-sample
   *  racks, depth markers, and bollards walking you down the turn. */
  private buildThreadway(d: DistrictDef): void {
    const rng = mulberry32(919000 + Math.floor(d.cx));
    const iron = toonMat({ color: 0x4a4440, map: swatch('#423c38', 60) });
    // a dead hauler parked mid-turn, forever — it hunts for level ground
    // like a real driver would have
    let hx = d.cx, hz = d.cz;
    let parked = false;
    for (let t = 0; t < 8 && !parked; t++) {
      hx = d.cx + (rng() - 0.5) * 12;
      hz = d.cz + (rng() - 0.5) * 12;
      parked = this.clearOfAssets(hx, hz, 4) && this.flatEnough(hx, hz, 2.6, 0.9);
    }
    if (parked) {
      // the chassis rests ON its wheels: use the highest wheel contact
      const hy = Math.max(
        terrainHeight(hx - 1.6, hz - 1.2), terrainHeight(hx - 1.6, hz + 1.2),
        terrainHeight(hx + 1.6, hz - 1.2), terrainHeight(hx + 1.6, hz + 1.2));
      const bed = new THREE.Mesh(new THREE.BoxGeometry(4.6, 1.4, 2.2), toonMat({ color: 0xe8e4da, map: swatch('#d8d4ca', 60) }));
      bed.position.set(hx, hy + 1.1, hz);
      const cab = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.8, 2.0), iron);
      cab.position.set(hx + 2.6, hy + 1.3, hz);
      this.group.add(bed, cab);
      this.staticTargets.push(bed, cab);
      this.addCollider(hx, hz, 3.6, 1.4, 2.4);
      for (const [wx, wz] of [[-1.6, -1.2], [-1.6, 1.2], [1.6, -1.2], [1.6, 1.2]] as [number, number][]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.4, 10), toonMat({ color: 0x22262a }));
        wheel.position.set(hx + wx, hy + 0.55, hz + wz);
        wheel.rotation.x = Math.PI / 2;
        this.group.add(wheel);
      }
    }
    // core sample racks: tubes of striped stone in cradles
    for (let i = 0; i < 3; i++) {
      const a = rng() * Math.PI * 2, r = 6 + rng() * (d.radius * 0.5);
      const x = d.cx + Math.cos(a) * r, z = d.cz + Math.sin(a) * r;
      if (!this.clearOfAssets(x, z, 2) || !this.flatEnough(x, z, 1.6, 0.8)) continue;
      const y = terrainHeight(x, z);
      const cradle = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 1.0), iron);
      cradle.position.set(x, y + 0.25, z);
      cradle.rotation.y = rng() * Math.PI;
      this.group.add(cradle);
      this.staticTargets.push(cradle);
      this.addCollider(x, z, 1.3, 0.8, 0.9);
      for (let c = 0; c < 3; c++) {
        const core = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 2.2, 6),
          toonMat({ color: c === 1 ? 0x6a5a8a : 0x5c4a34, map: swatch(c === 1 ? '#5a4a7a' : '#4e3e2c', 50) }));
        core.position.set(x, y + 0.62 + c * 0.06, z);
        core.rotation.z = Math.PI / 2;
        core.rotation.y = cradle.rotation.y + (rng() - 0.5) * 0.1;
        this.group.add(core);
      }
    }
    // depth marker: a big stenciled number board facing up-thread
    const my = terrainHeight(d.cx, d.cz + 8);
    const marker = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.4),
      new THREE.MeshBasicMaterial({ map: posterTexture({ lines: d.id === 'threadway1' ? ['TURN 1', '-40m'] : ['TURN 2', '-80m'], style: 'warning', bg: '#d8a020', fg: '#1a1a1a', accent: '#1a1a1a' }, 2.2 / 1.4), side: THREE.DoubleSide }));
    marker.position.set(d.cx, my + 1.8, d.cz + 8);
    marker.rotation.y = rng() * Math.PI * 2;
    this.group.add(marker);
    // the board stands on posts, not on air
    for (const sd of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 2.4, 5), iron);
      post.position.set(
        d.cx + Math.cos(marker.rotation.y) * sd * 1.0,
        my + 1.2,
        d.cz + 8 - Math.sin(marker.rotation.y) * sd * 1.0);
      this.group.add(post);
    }
    this.addCollider(d.cx, d.cz + 8, 1.2, 0.5, 2.6);
    for (let i = 0; i < 3; i++) {
      const a = rng() * Math.PI * 2, r = 8 + rng() * (d.radius * 0.6);
      this.boreBollard(d.cx + Math.cos(a) * r, d.cz + Math.sin(a) * r);
    }
  }

  /** THE DRILL FLOOR — the bottom of the spiral: the auger itself, mid-bite,
   *  crystal growth climbing its flutes from whatever it broke into. */
  private buildCoreworks(d: DistrictDef): void {
    const rng = mulberry32(919009);
    const iron = toonMat({ color: 0x4a4440, map: swatch('#423c38', 60) });
    const cy = terrainHeight(d.cx, d.cz);
    // the drill: a fat fluted screw standing in its own hole
    const drill = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.8, 13, 10), toonMat({ color: 0x8a7458, map: swatch('#7a6448', 70) }));
    shaft.position.y = 6.5;
    drill.add(shaft);
    for (let i = 0; i < 5; i++) { // the flutes: a descending helix of blades
      const blade = new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.28, 6, 18, Math.PI * 1.5), iron);
      blade.position.y = 1.6 + i * 2.3;
      blade.rotation.x = Math.PI / 2;
      blade.rotation.z = i * 1.2;
      drill.add(blade);
    }
    // the crystals answering back, climbing the flutes
    for (let i = 0; i < 6; i++) {
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.5 + rng() * 0.7, 0),
        new THREE.MeshToonMaterial({ color: 0x54a8c8, transparent: true, opacity: 0.85 }));
      const a = rng() * Math.PI * 2;
      crystal.position.set(Math.cos(a) * (1.6 + rng()), 0.8 + rng() * 5, Math.sin(a) * (1.6 + rng()));
      crystal.rotation.set(rng() * 3, rng() * 3, 0);
      drill.add(crystal);
      const glow = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), glowMat(0x54d4ff, 0.7));
      glow.position.copy(crystal.position);
      glow.name = 'blinker';
      drill.add(glow);
    }
    drill.position.set(d.cx, cy, d.cz);
    this.group.add(drill);
    this.staticTargets.push(drill);
    this.addCollider(d.cx, d.cz, 2.6, 2.6, 13);
    // the gantry ring around the drill: pale service steel that READS
    // against the pit, with the two collapsed spans lying where they fell
    const steel = toonMat({ color: 0xb8b0a4, map: swatch('#a89f92', 60) });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const x = d.cx + Math.cos(a) * 8, z = d.cz + Math.sin(a) * 8;
      const y = terrainHeight(x, z);
      if (i === 2 || i === 5) {
        // this bay came DOWN: the walkway span lies tilted in the dirt
        const fallen = new THREE.Mesh(new THREE.BoxGeometry(8, 0.28, 1.1), steel);
        fallen.position.set(d.cx + Math.cos(a + 0.3) * 9.5, terrainHeight(d.cx + Math.cos(a + 0.3) * 9.5, d.cz + Math.sin(a + 0.3) * 9.5) + 0.5, d.cz + Math.sin(a + 0.3) * 9.5);
        fallen.rotation.set(0.16, -(a + 0.3) + Math.PI / 2, 0.3);
        this.group.add(fallen);
        this.staticTargets.push(fallen);
        continue;
      }
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.55, 4.5, 0.55), steel);
      strut.position.set(x, y + 2.25, z);
      const brace = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3.4, 0.16), steel);
      brace.position.set(x * 0.98 + d.cx * 0.02, y + 2.1, z * 0.98 + d.cz * 0.02);
      brace.rotation.z = 0.4;
      this.group.add(strut, brace);
      this.staticTargets.push(strut);
      this.addCollider(x, z, 0.6, 0.6, 4.5);
      if (i !== 1 && i !== 4) { // spans skip the collapsed bays' far posts
        const span = new THREE.Mesh(new THREE.BoxGeometry(8, 0.25, 1.1), steel);
        span.position.set(d.cx + Math.cos(a + Math.PI / 6) * 8, y + 4.4, d.cz + Math.sin(a + Math.PI / 6) * 8);
        span.rotation.y = -(a + Math.PI / 6) + Math.PI / 2;
        this.group.add(span);
      }
    }
    // abandoned kit: crates, a toppled light rig still burning
    for (let i = 0; i < 5; i++) {
      const a = rng() * Math.PI * 2, r = 11 + rng() * (d.radius * 0.5);
      const x = d.cx + Math.cos(a) * r, z = d.cz + Math.sin(a) * r;
      if (!this.clearOfAssets(x, z, 1.6)) continue;
      const y = terrainHeight(x, z);
      const crate = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.0, 1.2), toonMat({ color: 0xe8e4da, map: swatch('#d8d4ca', 60) }));
      crate.position.set(x, y + 0.5, z);
      crate.rotation.y = rng() * Math.PI;
      this.group.add(crate);
      this.staticTargets.push(crate);
      this.addCollider(x, z, 0.85, 0.85, 1.1);
    }
    const lx = d.cx + 13, lz = d.cz - 6;
    const ly = terrainHeight(lx, lz);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 5, 6), iron);
    mast.position.set(lx, ly + 1.8, lz);
    mast.rotation.z = 1.1; // toppled, propped on a crate that left
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), glowMat(0xffe8b0, 0.95));
    lamp.position.set(lx - 2.2, ly + 3.1, lz);
    this.group.add(mast, lamp);
  }

  // ------------------------------------------------------------ THE TERRACES

  /** A carved stone lantern-idol: squat pedestal, hollow head, warm ember. */
  /** Garden lantern: stone plinth, wooden post, a glowing paper head under
   *  a wide cap — it reads LANTERN from across the terrace, not chimney. */
  private terraceLantern(x: number, z: number, lit = true): void {
    const y = terrainHeight(x, z);
    const stone = toonMat({ color: 0x9a947a, map: rockTexture('#8a8468') });
    const wood = toonMat({ color: 0x6a5030, map: swatch('#5e4628', 50) });
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 0.3, 6), stone);
    plinth.position.set(x, y + 0.15, z);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.085, 1.3, 5), wood);
    post.position.set(x, y + 0.95, z);
    // the paper head: a warm glowing box held in four dark ribs
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.5, 0.44),
      lit ? glowMat(0xffd88a, 0.9) : toonMat({ color: 0xe8e0cc }));
    head.position.set(x, y + 1.85, z);
    if (lit) head.name = 'blinker';
    for (const [rx, rz] of [[-0.23, -0.23], [-0.23, 0.23], [0.23, -0.23], [0.23, 0.23]] as const) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.54, 0.05), wood);
      rib.position.set(x + rx, y + 1.85, z + rz);
      this.group.add(rib);
    }
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.52, 0.32, 4), wood);
    cap.position.set(x, y + 2.24, z);
    cap.rotation.y = Math.PI / 4;
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.06, 5, 5), stone);
    finial.position.set(x, y + 2.44, z);
    this.group.add(plinth, post, head, cap, finial);
    this.staticTargets.push(post);
    this.addCollider(x, z, 0.35, 0.35, 2.3);
  }

  /** THE PADDY GATE — Juno's field camp at the foot of the stairs: research
   *  tent, seedling trays, and the first flooded paddy behind a low wall. */
  private buildPaddyGate(d: DistrictDef): void {
    const rng = mulberry32(929001);
    const canvasMat = toonMat({ color: 0x3a8a5a, map: swatch('#328050', 60) });
    // the tent: an open A-frame with a workbench under it
    const tx = d.cx - 11, tz = d.cz + 4; // NW of the paddy so the canvas never shades the water
    const ty = terrainHeight(tx, tz);
    const polesMat = toonMat({ color: 0x8a6a4a, map: swatch('#7a5c3e', 50) });
    for (const sd of [-1, 1]) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.12, 3.2), canvasMat);
      panel.position.set(tx, ty + 2.5, tz + sd * 1.1);
      panel.rotation.x = sd * 0.72;
      this.group.add(panel);
      // the tent stands on POLES, not on faith
      for (const sx of [-1, 1]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.9, 5), polesMat);
        pole.position.set(tx + sx * 2.1, ty + 0.95, tz + sd * 2.1);
        this.group.add(pole);
      }
    }
    const ridge = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 4.8, 5), polesMat);
    ridge.rotation.z = Math.PI / 2;
    ridge.position.set(tx, ty + 3.05, tz);
    this.group.add(ridge);
    const bench = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.9, 0.9), toonMat({ color: 0x8a6a4a, map: swatch('#7a5c3e', 50) }));
    bench.position.set(tx, ty + 0.45, tz);
    this.group.add(bench);
    this.staticTargets.push(bench);
    this.addCollider(tx, tz, 2.4, 1.6, 2.6);
    // seedling trays in rows: little green dots in white flats
    for (let r = 0; r < 3; r++) {
      const flat = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.14, 0.6), toonMat({ color: 0xe8e4da }));
      flat.position.set(d.cx + 5, terrainHeight(d.cx + 5, d.cz + 4 + r) + 0.3, d.cz + 4 + r * 1.0);
      this.group.add(flat);
      for (let i = 0; i < 5; i++) {
        const sprout = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 4), toonMat({ color: 0x6adc4a }));
        sprout.position.set(d.cx + 4.2 + i * 0.4, flat.position.y + 0.18, d.cz + 4 + r * 1.0);
        this.group.add(sprout);
      }
    }
    // the first paddy: a shallow flooded square behind a low stone lip,
    // set east of the walkway so arrivals don't wade through it
    this.water(d.cx - 16, d.cz - 10, 6.5, { level: terrainHeight(d.cx - 16, d.cz - 10) + 0.18 });
    for (let i = 0; i < 4; i++) this.terraceLantern(d.cx - 14 + i * 9, d.cz + 10, true);
  }

  /** A TERRACE — one step of the garden: retaining wall along the downhill
   *  lip, a flooded paddy with planted rows, and the waterfall it spills. */
  private buildTerrace(d: DistrictDef): void {
    const rng = mulberry32(929100 + Math.floor(d.cz));
    const stone = toonMat({ map: rockTexture('#8a8468') });
    const capStone = toonMat({ color: 0xa8a288 });
    // the fall SPANS the actual step and FACES downhill (+z): sheet and
    // splash pool on the lower terrace, shelf buried in the step
    const lipZ = d.cz + d.radius * 0.78;
    const fallX = d.cx + (rng() - 0.5) * 6;
    const hTop = terrainHeight(fallX, lipZ - 3);
    const baseZ = lipZ + 9;
    const hBase = terrainHeight(fallX, baseZ);
    this.waterfall(fallX, baseZ, 0, Math.max(4, hTop - hBase + 1.2), 4);
    // retaining wall: stone courses seated INTO the step — each segment is
    // sized to the drop it actually holds, and flat ground gets no wall
    for (let i = -3; i <= 3; i++) {
      const wx = d.cx + i * 5.4;
      if (Math.abs(wx - fallX) < 4.6) continue; // the fall owns its slot
      const hUp = terrainHeight(wx, lipZ - 5);
      const hDn = terrainHeight(wx, lipZ + 7);
      const drop = hUp - hDn;
      if (drop < 1.2) continue;
      const wh = Math.min(drop + 0.5, 4.4);
      const seg = new THREE.Mesh(new THREE.BoxGeometry(5.2, wh, 1.6), stone);
      seg.position.set(wx, hDn + wh / 2 - 0.25, lipZ + 1.5);
      seg.rotation.y = i * 0.05;
      seg.rotation.x = -0.09; // leans back into the hill it holds
      this.group.add(seg);
      this.staticTargets.push(seg);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.3, 1.9), capStone);
      cap.position.set(wx, hDn + wh - 0.15, lipZ + 1.4);
      cap.rotation.y = i * 0.05;
      this.group.add(cap);
    }
    // the paddy: flooded pool with planted rows, kept ON the flat plateau
    const px = d.cx + (rng() - 0.5) * 6, pz = d.cz - 2;
    const level = terrainHeight(px, pz) + 0.2;
    this.water(px, pz, 7.5, { level });
    for (let row = 0; row < 4; row++) {
      for (let i = 0; i < 7; i++) {
        const sx = px - 6 + i * 2.0 + (rng() - 0.5) * 0.4;
        const sz = pz - 4.5 + row * 3.0 + (rng() - 0.5) * 0.4;
        if (Math.hypot(sx - px, sz - pz) > 6.6) continue;
        const shoot = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.7 + rng() * 0.3, 4), toonMat({ color: 0x4a9a3a }));
        shoot.position.set(sx, level + 0.3, sz);
        this.group.add(shoot);
      }
    }
    // lanterns mark the climb through this step
    for (let i = 0; i < 3; i++) {
      const a = rng() * Math.PI * 2, r = 10 + rng() * (d.radius * 0.5);
      const x = d.cx + Math.cos(a) * r, z = d.cz + Math.sin(a) * r;
      if (!this.clearOfAssets(x, z, 1.4) || !this.flatEnough(x, z, 1.2, 0.9)) continue;
      this.terraceLantern(x, z, rng() < 0.7);
    }
  }

  /** THE GARDEN CROWN — the summit: a ring of carved idol heads facing the
   *  altar bloom at the centre, prayer-lines strung between them. */
  private buildGardenCrown(d: DistrictDef): void {
    const rng = mulberry32(929009);
    const stone = toonMat({ color: 0x8a8468, map: rockTexture('#7a7458') });
    const heads: THREE.Vector3[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.26;
      const x = d.cx + Math.cos(a) * (d.radius - 14), z = d.cz + Math.sin(a) * (d.radius - 14);
      const y = terrainHeight(x, z);
      const g = new THREE.Group();
      const brow = new THREE.Mesh(new THREE.BoxGeometry(2.2, 3.4, 1.8), stone);
      brow.position.y = 1.7;
      const nose = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.3, 0.5), stone);
      nose.position.set(0, 1.5, -1.0);
      const moss = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.5, 1.9), toonMat({ color: 0x3a7a3a, map: swatch('#2e6a30', 40) }));
      moss.position.y = 3.5;
      g.add(brow, nose, moss);
      for (const sd of [-1, 1]) { // heavy-lidded carved eyes, faintly lit
        const eye = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, 0.1), glowMat(0x9adc4a, 0.7));
        eye.position.set(sd * 0.55, 2.2, -0.92);
        g.add(eye);
      }
      g.position.set(x, y, z);
      g.lookAt(d.cx, y, d.cz); // every head watches the altar
      this.group.add(g);
      this.staticTargets.push(g);
      this.addCollider(x, z, 1.4, 1.2, 3.8);
      heads.push(new THREE.Vector3(x, y + 3.8, z));
    }
    // prayer-lines: petals strung head to head around the ring
    for (let i = 0; i < heads.length; i++) {
      const p1 = heads[i], p2 = heads[(i + 1) % heads.length];
      for (let b = 1; b < 6; b++) {
        const t = b / 6;
        const bead = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.24, 3),
          toonMat({ color: b % 2 ? 0xd8b028 : 0xff5a86 }));
        bead.position.lerpVectors(p1, p2, t);
        bead.position.y -= Math.sin(t * Math.PI) * 0.8;
        bead.rotation.x = Math.PI;
        this.group.add(bead);
      }
    }
    // the altar bloom: a giant flower open at the centre of the crown
    const cy = terrainHeight(d.cx, d.cz);
    const dais = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.8, 0.6, 10), stone);
    dais.position.set(d.cx, cy + 0.3, d.cz);
    this.group.add(dais);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const petal = new THREE.Mesh(new THREE.ConeGeometry(0.7, 2.6, 5), toonMat({ color: i % 2 ? 0xff5a86 : 0xd83a68 }));
      petal.position.set(d.cx + Math.cos(a) * 1.5, cy + 1.4, d.cz + Math.sin(a) * 1.5);
      petal.rotation.set(Math.sin(a) * 0.85, 0, -Math.cos(a) * 0.85);
      this.group.add(petal);
      this.staticTargets.push(petal);
    }
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.65, 10, 10), glowMat(0xffd23c, 0.95));
    core.position.set(d.cx, cy + 1.4, d.cz);
    core.name = 'blinker';
    this.group.add(core);
    this.addCollider(d.cx, d.cz, 2.2, 2.2, 2.6);
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
    this.registerNpcRig(q, head, clipboard); // the fidget is an angry clipboard tap
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
    const collider: AABB = { minX: poi.x - 6.8, maxX: poi.x + 6.8, minZ: poi.z - 1, maxZ: poi.z + 1, bottom: y - 1, top: y + 6 };
    this.colliders.push(collider);
    this.gate = { group: g, collider, open: false, openT: 0, id: poi.data ?? 'gate' };
  }

  private buildSign(poi: WorldPoi): void {
    const y = terrainHeight(poi.x, poi.z);
    const woodMat = toonMat({ color: 0x8a6a42, map: swatch('#7a5a36', 80) });
    const a = poi.rot ?? 0;
    // two posts at the board's ENDS — a center post reads as a censor bar
    const ex = Math.cos(a) * 1.62, ez = -Math.sin(a) * 1.62;
    for (const side of [-1, 1]) {
      const px = poi.x + side * ex, pz = poi.z + side * ez;
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.5, 0.16), woodMat);
      post.position.set(px, terrainHeight(px, pz) + 1.25, pz);
      this.group.add(post);
      this.staticTargets.push(post);
    }
    const board = World.textSign(3.4, 0.8, { lines: [poi.data ?? '???'], style: 'graffiti', bg: '#4a3a26', fg: '#f2e4c4', accent: '#241a10' }, { twoSided: true });
    board.position.set(poi.x, y + 2.1, poi.z);
    board.rotation.y = a;
    board.rotation.z = 0.03;
    this.group.add(board);
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
      const spots = WORLD.districts.filter((dd) => dd.dress === 'boneyard' || dd.dress === 'throne' || dd.dress === 'icebox' || dd.dress === 'fathom' || dd.dress === 'hullgrave' || dd.dress === 'brinepans');
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
        // center is INSIDE the box: exit through the NEAREST face — always
        // dumping to +x teleported bodies through thin walls
        const exits = [
          { d: pos.x - c.minX, x: c.minX - radius, z: pos.z },
          { d: c.maxX - pos.x, x: c.maxX + radius, z: pos.z },
          { d: pos.z - c.minZ, x: pos.x, z: c.minZ - radius },
          { d: c.maxZ - pos.z, x: pos.x, z: c.maxZ - radius },
        ];
        exits.sort((a, b) => a.d - b.d);
        pos.x = exits[0].x;
        pos.z = exits[0].z;
      }
    }
  }

  /** Sphere-vs-collider test for projectiles: returns outward push normal. */
  collideSphere(pos: THREE.Vector3, radius: number): THREE.Vector3 | null {
    for (const c of this.colliders) {
      // arcs clear low props: no collision when the sphere flies above the top
      if (pos.y - radius > c.top) continue;
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

  /** Ray vs collider boxes: whatever blocks feet blocks bullets. Guarantees
   *  hitscan, enemy sightlines, and cover checks agree with movement even for
   *  props whose visual mesh is thinner than its collision. */
  private raycastColliders(ray: THREE.Raycaster, maxDist: number): StaticHit | null {
    const o = ray.ray.origin, d = ray.ray.direction;
    let best: StaticHit | null = null;
    let bestT = maxDist;
    for (const c of this.colliders) {
      let tmin = 0.02, tmax = bestT;
      let nAxis: 'x' | 'y' | 'z' = 'x';
      let nSign = 1;
      let ok = true;
      const slabs: [number, number, number, number, 'x' | 'y' | 'z'][] = [
        [o.x, d.x, c.minX, c.maxX, 'x'],
        [o.y, d.y, c.bottom, c.top, 'y'],
        [o.z, d.z, c.minZ, c.maxZ, 'z'],
      ];
      for (const [op, dp, lo, hi, axis] of slabs) {
        if (Math.abs(dp) < 1e-8) {
          if (op < lo || op > hi) { ok = false; break; }
          continue;
        }
        let t1 = (lo - op) / dp, t2 = (hi - op) / dp;
        let sign = -1;
        if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; sign = 1; }
        if (t1 > tmin) { tmin = t1; nAxis = axis; nSign = sign; }
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) { ok = false; break; }
      }
      if (!ok || tmin >= bestT || tmin <= 0.02) continue;
      bestT = tmin;
      const normal = new THREE.Vector3(
        nAxis === 'x' ? nSign : 0,
        nAxis === 'y' ? nSign : 0,
        nAxis === 'z' ? nSign : 0,
      );
      best = { point: o.clone().addScaledVector(d, tmin), distance: tmin, normal };
    }
    return best;
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
    // collider boxes: catches props whose visuals are thinner than their
    // collision (and anything not registered as a raycast mesh)
    const boxHit = this.raycastColliders(ray, best?.distance ?? 220);
    if (boxHit && (!best || boxHit.distance < best.distance)) best = boxHit;
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
    for (const s of this.scrollTex) s.tex.offset.y += s.vy * dt;
    for (const b of this.barrelFlames) {
      if (b.distanceTo(playerPos) < 60 && Math.random() < 20 * dt) fx.fireColumn(b);
    }
    for (const v of this.ventMotes) {
      if (v.distanceTo(playerPos) < 80 && Math.random() < 26 * dt) {
        fx.emit(v.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2.6, Math.random() * 1.5, (Math.random() - 0.5) * 2.6)),
          new THREE.Vector3(0, 9 + Math.random() * 6, 0), 0x7af0ff, 0.09, 0.9, -2);
      }
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
    // NPC idle life: breathing bob, gentle sway, head-tracking, fidgets
    for (const r of this.npcRigs) {
      r.phase += dt;
      r.group.position.y = r.baseY + Math.sin(r.phase * 1.7) * 0.022;
      r.group.rotation.z = Math.sin(r.phase * 0.9) * 0.012;
      if (r.head) {
        const dx = playerPos.x - r.group.position.x;
        const dz = playerPos.z - r.group.position.z;
        const near = Math.hypot(dx, dz) < 9;
        let want = 0;
        if (near) {
          let rel = Math.atan2(dx, dz) - r.group.rotation.y;
          while (rel > Math.PI) rel -= Math.PI * 2;
          while (rel < -Math.PI) rel += Math.PI * 2;
          want = Math.max(-0.75, Math.min(0.75, rel));
        }
        r.head.rotation.y += (want - r.head.rotation.y) * Math.min(1, dt * 5);
        // idle glance when nobody's around
        if (!near) r.head.rotation.y += Math.sin(r.phase * 0.5) * 0.002;
      }
      // fidget: a little arm/prop raise every few seconds
      r.fidgetT -= dt;
      if (r.fidgetT <= 0 && r.fidgetK < 0) { r.fidgetK = 0; }
      if (r.fidgetK >= 0 && r.armR) {
        r.fidgetK += dt / 0.9;
        const env = Math.sin(Math.min(1, r.fidgetK) * Math.PI);
        r.armR.rotation.x = (r.armR.userData.baseRx ?? (r.armR.userData.baseRx = r.armR.rotation.x)) - env * 0.9;
        if (r.fidgetK >= 1) { r.fidgetK = -1; r.fidgetT = 5 + Math.random() * 8; }
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
      else if (o.name === 'npc_orb') o.position.y = 1.35 + Math.sin(this.blinkT * 1.8) * 0.08;
      else if (o.name === 'windsock') o.rotation.y = Math.sin(this.blinkT * 0.7) * 0.5;
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
    } else if (WORLD.biome.ambientParticle === 'spore') {
      // glowing spores drift UP off the cave floor, slow and luminous
      if (Math.random() < 26 * dt) {
        const a = Math.random() * Math.PI * 2;
        const r = 3 + Math.random() * 18;
        const p = playerPos.clone().add(new THREE.Vector3(Math.cos(a) * r, 0.3 + Math.random() * 2, Math.sin(a) * r));
        fx.emit(p, new THREE.Vector3(0.12, 0.45 + Math.random() * 0.3, 0.08), Math.random() > 0.5 ? 0x2fd8c8 : 0x7a6ae8, 0.055, 6, -0.01);
      }
    } else if (WORLD.biome.ambientParticle === 'rain') {
      // sideways storm rain, fast and thin
      if (Math.random() < 90 * dt) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * 22;
        const p = playerPos.clone().add(new THREE.Vector3(Math.cos(a) * r, 7 + Math.random() * 6, Math.sin(a) * r));
        fx.emit(p, new THREE.Vector3(2.2, -16, 0.8), 0x9ab8c8, 0.045, 0.8, 0);
      }
    } else if (Math.random() < 6 * dt) {
      const a = Math.random() * Math.PI * 2;
      const r = 4 + Math.random() * 14;
      const p = playerPos.clone().add(new THREE.Vector3(Math.cos(a) * r, 0.5 + Math.random() * 3, Math.sin(a) * r));
      fx.emit(p, new THREE.Vector3(0.4, 0.15, 0.15), 0xd8c8a8, 0.05, 2.5, -0.02);
    }
    // gale channels made visible: streaks racing along the wind, whatever
    // else the sky is doing (storm rain on Voltholm, dead air in the Becalmed)
    if (WORLD.gales && Math.random() < 40 * dt) {
      const p = playerPos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 44, 0.4 + Math.random() * 2.4, (Math.random() - 0.5) * 44));
      const gp = galeAt(p.x, p.z);
      if (gp) fx.emit(p, new THREE.Vector3(gp.x * 1.6, 0.2, gp.z * 1.6), 0xaad8c8, 0.05, 0.7, 0);
    }
    // aurora shimmer
    if (WORLD.biome.aurora) {
      this.group.traverse((o) => {
        if (o.name === 'aurora') o.position.x += Math.sin(this.blinkT * 0.3 + o.position.z) * dt * 2;
      });
    }
  }
}
