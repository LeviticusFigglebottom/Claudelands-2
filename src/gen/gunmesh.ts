// Procedural gun assembly: turns a WeaponInstance's parts + manufacturer
// visual language into a THREE.Group. Silhouette rules per maker, per-part
// geometry keyed by PartLook, rarity accents, element glow bits. The goal:
// you can read maker + parts at a glance, and two rolls of the same gun type
// look different.
//
// Convention: gun local space points -Z forward (muzzle at -Z), grip below
// origin. Viewmodel and pickups both use this builder.

import * as THREE from 'three';
import type { WeaponInstance, WeaponPartDef } from '../game/types';
import { makerById, type ManufacturerDef } from '../data/manufacturers';
import { rarityById } from '../data/rarity';
import { modifierById } from '../data/modifiers';
import { ELEMENTS } from '../data/elements';
import { toonMat, glowMat } from '../render/toon';
import { gunTexture } from '../render/textures';
import { mulberry32 } from '../util/rng';

interface Palette {
  primary: THREE.MeshToonMaterial;
  secondary: THREE.MeshToonMaterial;
  accent: THREE.MeshToonMaterial;
  dark: THREE.MeshToonMaterial;
}

const paletteCache = new Map<string, Palette>();
function paletteFor(maker: ManufacturerDef): Palette {
  let p = paletteCache.get(maker.id);
  if (!p) {
    const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
    // the maker's visual language is baked INTO the albedo — rivet plate,
    // brushed alloy, welded salvage, etched brass, wood grain, toy plastic
    const style = maker.silhouette as 'brick' | 'sleek' | 'cobbled' | 'coiled' | 'classic' | 'toy';
    p = {
      primary: toonMat({ color: 0xffffff, map: gunTexture(hex(maker.palette.primary), style) }),
      secondary: toonMat({ color: 0xffffff, map: gunTexture(hex(maker.palette.secondary), style === 'classic' ? 'classic' : style) }),
      accent: toonMat({ color: maker.palette.accent }),
      dark: toonMat({ color: 0x2a2626, map: gunTexture('#2a2626', 'sleek') }),
    };
    paletteCache.set(maker.id, p);
  }
  return p;
}

function box(w: number, h: number, d: number, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.castShadow = true;
  return m;
}
function tube(r: number, len: number, mat: THREE.Material, sides = 10): THREE.Mesh {
  const g = new THREE.CylinderGeometry(r, r, len, sides);
  g.rotateX(Math.PI / 2);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  return m;
}

/** Type silhouette baseline: overall length/height of the receiver. */
const TYPE_DIMS: Record<string, { len: number; h: number; barrelLen: number; barrelR: number }> = {
  pistol: { len: 0.28, h: 0.15, barrelLen: 0.22, barrelR: 0.028 },
  smg: { len: 0.38, h: 0.17, barrelLen: 0.26, barrelR: 0.03 },
  shotgun: { len: 0.46, h: 0.18, barrelLen: 0.42, barrelR: 0.05 },
  ar: { len: 0.5, h: 0.18, barrelLen: 0.4, barrelR: 0.034 },
  sniper: { len: 0.55, h: 0.17, barrelLen: 0.62, barrelR: 0.03 },
  launcher: { len: 0.55, h: 0.24, barrelLen: 0.5, barrelR: 0.09 },
};

export function buildGunMesh(w: WeaponInstance): THREE.Group {
  const g = new THREE.Group();
  const maker = makerById(w.maker);
  const pal = paletteFor(maker);
  const rng = mulberry32(w.seed ^ 0x5eed);
  const dims = TYPE_DIMS[w.type];
  const rarity = rarityById(w.rarity);

  const bodyLook = w.parts.body.look;
  const fat = bodyLook.fat ?? 1;

  // ------------------------------------------------------------ receiver
  const bh = dims.h * fat;
  const bw = bh * 0.55;
  const receiver = box(bw, bh, dims.len, pal.primary);
  g.add(receiver);

  // maker-silhouette dressing on the receiver
  switch (maker.silhouette) {
    case 'brick': { // VULKRAM: rivets + top plate
      const plate = box(bw * 1.15, bh * 0.3, dims.len * 0.9, pal.secondary);
      plate.position.y = bh * 0.55;
      g.add(plate);
      for (let i = 0; i < 4; i++) {
        const rivet = tube(0.012, bw * 1.2, pal.dark, 6);
        rivet.rotation.set(0, 0, Math.PI / 2);
        rivet.position.set(0, (rng() - 0.3) * bh * 0.8, (i / 4 - 0.4) * dims.len);
        g.add(rivet);
      }
      break;
    }
    case 'sleek': { // LUMEN: smooth side panels + glowing strip
      const panel = box(bw * 1.2, bh * 0.55, dims.len * 0.8, pal.secondary);
      panel.position.y = bh * 0.05;
      g.add(panel);
      const strip = box(bw * 1.25, 0.012, dims.len * 0.7, glowMat(maker.palette.accent, 0.9));
      strip.position.y = -bh * 0.18;
      strip.layers.set(0); // keep ink lines on the gun; glow still blooms
      g.add(strip);
      break;
    }
    case 'cobbled': { // RATWORKS: random welded junk + strapping
      for (let i = 0; i < 5; i++) {
        const junk = box(bw * (0.4 + rng() * 0.7), bh * (0.2 + rng() * 0.5), dims.len * (0.12 + rng() * 0.2), rng() > 0.5 ? pal.secondary : pal.dark);
        junk.position.set((rng() - 0.5) * bw * 0.9, (rng() - 0.4) * bh * 0.9, (rng() - 0.5) * dims.len * 0.9);
        junk.rotation.z = (rng() - 0.5) * 0.5;
        g.add(junk);
      }
      const strap = box(bw * 1.3, bh * 0.16, 0.03, pal.accent);
      strap.position.z = dims.len * 0.18;
      g.add(strap);
      break;
    }
    case 'coiled': { // AETHERIC: rune ring + glow phial
      const ring = new THREE.Mesh(new THREE.TorusGeometry(bh * 0.62, 0.016, 8, 14), pal.accent);
      ring.rotation.y = Math.PI / 2;
      ring.position.z = -dims.len * 0.18;
      g.add(ring);
      const phial = tube(0.02, dims.len * 0.5, glowMat(ELEMENTS[w.element].color, 0.95), 8);
      phial.position.y = bh * 0.42;
      g.add(phial);
      break;
    }
    case 'classic': { // CORDWOOD: wooden furniture + brass band
      const wood = box(bw * 1.05, bh * 0.5, dims.len * 0.95, pal.secondary);
      wood.position.y = -bh * 0.3;
      g.add(wood);
      const band = tube(bh * 0.5, 0.03, pal.accent, 12);
      band.rotation.x = 0;
      band.position.z = -dims.len * 0.3;
      g.add(band);
      break;
    }
    case 'toy': { // BRISKCO: rounded shell + big label stripe
      const shell = new THREE.Mesh(new THREE.CapsuleGeometry(bh * 0.5, dims.len * 0.65, 4, 10), pal.secondary);
      shell.rotation.x = Math.PI / 2;
      g.add(shell);
      const stripe = box(bw * 1.3, bh * 0.22, dims.len * 0.5, pal.accent);
      stripe.position.z = -dims.len * 0.05;
      g.add(stripe);
      break;
    }
  }

  // ------------------------------------------------------------ barrel
  const brl = w.parts.barrel;
  const blen = dims.barrelLen * (brl.look.len ?? 1);
  const brad = dims.barrelR * (brl.look.fat ?? 1);
  const bz = -dims.len / 2 - blen / 2;
  switch (brl.look.shape) {
    case 'cluster': {
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const t = tube(brad * 0.55, blen, pal.dark, 8);
        t.position.set(Math.cos(a) * brad * 0.6, Math.sin(a) * brad * 0.6, bz);
        g.add(t);
      }
      break;
    }
    case 'brick': {
      const t = box(brad * 2.4, brad * 2.4, blen, pal.secondary);
      t.position.z = bz;
      g.add(t);
      const muzzle = tube(brad * 0.8, 0.05, pal.dark, 8);
      muzzle.position.z = bz - blen / 2;
      g.add(muzzle);
      break;
    }
    case 'hex':
    case 'rail': {
      const t = tube(brad, blen, pal.secondary, 6);
      t.position.z = bz;
      g.add(t);
      if (brl.look.shape === 'rail') {
        const fin = box(0.012, brad * 3, blen * 0.85, pal.accent);
        fin.position.set(0, brad * 1.2, bz);
        g.add(fin);
      }
      break;
    }
    case 'vented': {
      const t = tube(brad, blen, pal.dark, 10);
      t.position.z = bz;
      g.add(t);
      for (let i = 0; i < 3; i++) {
        const vent = tube(brad * 1.25, blen * 0.09, pal.secondary, 10);
        vent.position.z = bz - blen * 0.3 + i * blen * 0.3;
        g.add(vent);
      }
      break;
    }
    case 'coil': {
      const t = tube(brad * 0.8, blen, pal.dark, 8);
      t.position.z = bz;
      g.add(t);
      for (let i = 0; i < 4; i++) {
        const ringM = new THREE.Mesh(new THREE.TorusGeometry(brad * 1.5, 0.01, 6, 12), glowMat(ELEMENTS[w.element].color, 0.9));
        ringM.position.z = bz - blen * 0.35 + i * blen * 0.24;
        g.add(ringM);
      }
      break;
    }
    case 'bell': { // blunderbuss flare: the muzzle opens like a trumpet
      const t = tube(brad * 0.8, blen * 0.75, pal.dark, 10);
      t.position.z = bz + blen * 0.12;
      g.add(t);
      const bellGeo = new THREE.CylinderGeometry(brad * 1.9, brad * 0.85, blen * 0.35, 12, 1, true);
      bellGeo.rotateX(-Math.PI / 2);
      const bell = new THREE.Mesh(bellGeo, pal.secondary);
      bell.position.z = bz - blen * 0.38;
      bell.castShadow = true;
      g.add(bell);
      const lip = new THREE.Mesh(new THREE.TorusGeometry(brad * 1.9, 0.012, 6, 14), pal.accent);
      lip.position.z = bz - blen * 0.55;
      g.add(lip);
      break;
    }
    case 'suppressor': { // fat smooth can over the front half, whisper-dark
      const t = tube(brad * 0.7, blen * 0.55, pal.dark, 10);
      t.position.z = bz + blen * 0.22;
      g.add(t);
      const can = tube(brad * 1.35, blen * 0.55, pal.dark, 12);
      can.position.z = bz - blen * 0.22;
      g.add(can);
      for (const zf of [-0.05, -0.4]) {
        const groove = new THREE.Mesh(new THREE.TorusGeometry(brad * 1.36, 0.006, 5, 14), pal.accent);
        groove.position.z = bz + blen * zf;
        g.add(groove);
      }
      break;
    }
    case 'split': { // two thin bores riding side by side
      for (const side of [-1, 1]) {
        const t = tube(brad * 0.62, blen, pal.dark, 8);
        t.position.set(side * brad * 0.75, 0, bz);
        g.add(t);
      }
      const yoke = box(brad * 3, brad * 1.1, 0.04, pal.secondary);
      yoke.position.z = bz - blen * 0.4;
      g.add(yoke);
      break;
    }
    default: { // 'tube'
      const t = tube(brad, blen, pal.dark, 10);
      t.position.z = bz;
      g.add(t);
    }
  }

  // ------------------------------------------------------------ grip (below rear)
  const grip = box(bw * 0.7, bh * 1.1, bh * 0.45, w.parts.grip.look.shape === 'classic' ? pal.secondary : pal.dark);
  grip.position.set(0, -bh * 0.95, dims.len * 0.32);
  grip.rotation.x = -0.28;
  g.add(grip);

  // ------------------------------------------------------------ stock (rear)
  const stk = w.parts.stock;
  const slen = (stk.look.len ?? 1) * dims.len * 0.55;
  if (stk.look.shape !== 'none' && slen > 0.01) {
    let stock: THREE.Mesh;
    if (stk.look.shape === 'wire') {
      stock = box(bw * 0.25, bh * 0.5, slen, pal.dark);
      const bar = box(bw * 0.25, bh * 0.12, slen, pal.dark);
      bar.position.set(0, -bh * 0.4, dims.len / 2 + slen / 2);
      g.add(bar);
    } else if (stk.look.shape === 'classic') {
      stock = box(bw * 0.8, bh * 0.85, slen, pal.secondary);
      stock.rotation.x = 0.08;
    } else {
      stock = box(bw * (stk.look.fat ?? 1) * 0.7, bh * 0.7, slen, stk.look.shape === 'brick' ? pal.secondary : pal.primary);
    }
    stock.position.set(0, -bh * 0.1, dims.len / 2 + slen / 2);
    g.add(stock);
  }

  // ------------------------------------------------------------ sight (top)
  const sgt = w.parts.sight;
  const sightZ = -dims.len * 0.1;
  switch (sgt.look.shape) {
    case 'scope':
    case 'bigscope': {
      const big = sgt.look.shape === 'bigscope';
      const sc = tube(big ? 0.035 : 0.024, big ? 0.2 : 0.13, pal.dark, 10);
      sc.position.set(0, bh * 0.75, sightZ);
      g.add(sc);
      const lens = tube(big ? 0.03 : 0.02, 0.01, glowMat(0x9ef2ea, 0.9), 10);
      lens.position.set(0, bh * 0.75, sightZ - (big ? 0.1 : 0.065));
      g.add(lens);
      break;
    }
    case 'ring': {
      const ringM = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.007, 6, 12), pal.accent);
      ringM.position.set(0, bh * 0.75, sightZ);
      g.add(ringM);
      break;
    }
    case 'orb': {
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), glowMat(ELEMENTS[w.element].color !== ELEMENTS.kinetic.color ? ELEMENTS[w.element].color : 0xc06bff, 0.95));
      orb.position.set(0, bh * 0.8, sightZ);
      g.add(orb);
      break;
    }
    case 'nail': {
      const nail = box(0.008, 0.05, 0.008, pal.accent);
      nail.position.set(0.004, bh * 0.68, sightZ);
      nail.rotation.z = 0.3;
      g.add(nail);
      break;
    }
    case 'holo': { // a floating glass pane in a thin frame
      const frame = box(0.05, 0.05, 0.008, pal.dark);
      frame.position.set(0, bh * 0.78, sightZ);
      g.add(frame);
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(0.038, 0.038),
        new THREE.MeshBasicMaterial({ color: 0x7af0d0, transparent: true, opacity: 0.45, side: THREE.DoubleSide }));
      pane.position.set(0, bh * 0.78, sightZ - 0.001);
      g.add(pane);
      const stem = box(0.012, bh * 0.28, 0.012, pal.dark);
      stem.position.set(0, bh * 0.6, sightZ);
      g.add(stem);
      break;
    }
    default: { // 'post'
      const post = box(0.01, 0.035, 0.01, pal.dark);
      post.position.set(0, bh * 0.65, -dims.len * 0.35);
      g.add(post);
      const rear = box(0.03, 0.02, 0.01, pal.dark);
      rear.position.set(0, bh * 0.62, dims.len * 0.3);
      g.add(rear);
    }
  }

  // ------------------------------------------------------------ magazine (below front-of-grip)
  // removable mags are NAMED so the reload animation can pull the real part
  // out of the well and seat the fresh one (phials hum, tubes take shells)
  const mag = w.parts.mag;
  const magZ = dims.len * 0.05;
  switch (mag.look.shape) {
    case 'drum': {
      const d = tube(bh * 0.55 * (mag.look.fat ?? 1), bw * 0.8, pal.dark, 12);
      d.rotation.set(0, 0, Math.PI / 2);
      d.rotation.y = Math.PI / 2;
      d.position.set(0, -bh * 0.85, magZ);
      d.name = 'magpart';
      g.add(d);
      break;
    }
    case 'canister': {
      const c = tube(bh * 0.4, bh * 0.9, pal.dark, 8);
      c.rotation.x = Math.PI / 2 - 0.2;
      c.position.set(0, -bh * 0.9, magZ);
      c.name = 'magpart';
      g.add(c);
      break;
    }
    case 'phial': {
      const c = tube(bh * 0.22, bh * 0.9, glowMat(ELEMENTS[w.element].color, 0.85), 8);
      c.rotation.x = Math.PI / 2 - 0.2;
      c.position.set(0, -bh * 0.8, magZ);
      g.add(c);
      break;
    }
    case 'tube': {
      const c = tube(bh * 0.2, dims.len * 0.8, pal.accent, 8);
      c.position.set(0, -bh * 0.62, -dims.len * 0.1);
      g.add(c);
      break;
    }
    default: { // 'box' | 'slim'
      const m = box(bw * 0.55, bh * (mag.look.shape === 'slim' ? 0.7 : 1.0), bh * 0.5, pal.dark);
      m.position.set(0, -bh * 0.8, magZ);
      m.rotation.x = 0.12;
      m.name = 'magpart';
      g.add(m);
    }
  }

  // ------------------------------------------------------------ accessory
  const acc = w.parts.accessory as WeaponPartDef | undefined;
  if (acc) {
    switch (acc.look.shape) {
      case 'blade': {
        const blade = box(0.01, 0.045, blen * 0.7, pal.dark);
        blade.position.set(0, -brad * 1.8, bz + blen * 0.1);
        blade.rotation.x = 0.06;
        g.add(blade);
        break;
      }
      case 'laser': {
        const las = tube(0.012, 0.08, pal.secondary, 8);
        las.position.set(bw * 0.7, 0, -dims.len * 0.3);
        g.add(las);
        const dot = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 6), glowMat(0xff3030, 1));
        dot.position.set(bw * 0.7, 0, -dims.len * 0.3 - 0.045);
        g.add(dot);
        break;
      }
      case 'brake': {
        const br = box(brad * 3, brad * 3, 0.06, pal.secondary);
        br.position.z = bz - blen / 2 - 0.02;
        g.add(br);
        break;
      }
      case 'bipod': { // folded legs under the barrel
        for (const side of [-1, 1]) {
          const leg = box(0.01, 0.09, 0.012, pal.dark);
          leg.position.set(side * 0.02, -brad * 2 - 0.03, bz + blen * 0.28);
          leg.rotation.z = side * 0.45;
          g.add(leg);
        }
        break;
      }
      case 'fore': { // vertical foregrip mid-barrel
        const fg = box(0.028, 0.075, 0.035, pal.secondary);
        fg.position.set(0, -brad * 1.6 - 0.03, bz + blen * 0.3);
        fg.rotation.x = 0.15;
        g.add(fg);
        break;
      }
      case 'charm': { // somebody's lucky lantern, swinging under the muzzle
        const string = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.05, 4), pal.dark);
        string.position.set(0, -brad * 1.4, bz);
        g.add(string);
        const lantern = box(0.024, 0.032, 0.024, pal.accent);
        lantern.position.set(0, -brad * 1.4 - 0.045, bz);
        g.add(lantern);
        const glow = new THREE.Mesh(new THREE.SphereGeometry(0.009, 6, 6), glowMat(0xffd88a, 0.95));
        glow.position.copy(lantern.position);
        g.add(glow);
        break;
      }
      default: {
        const knob = box(0.03, 0.03, 0.05, pal.accent);
        knob.position.set(0, bh * 0.2, dims.len * 0.42);
        g.add(knob);
      }
    }
  }

  // ------------------------------------------------------------ rarity flair
  if (rarity.tier >= 3) {
    const trim = box(bw * 1.05, 0.012, dims.len * 1.02, glowMat(rarity.color, 0.85));
    trim.position.y = bh * 0.52;
    g.add(trim);
  }
  // chaos modifier: its own underline, in its own color — reads at a glance
  const mod = modifierById(w.modifier);
  if (mod) {
    const trim = box(bw * 1.12, 0.014, dims.len * 1.05, glowMat(mod.color, 0.9));
    trim.position.y = -bh * 0.55;
    g.add(trim);
    const muzzleRing = new THREE.Mesh(new THREE.TorusGeometry(dims.barrelR * 1.7, 0.008, 6, 14), glowMat(mod.color, 0.9));
    muzzleRing.position.z = -dims.len / 2 - dims.barrelLen * (w.parts.barrel.look.len ?? 1) * 0.98;
    g.add(muzzleRing);
  }

  g.traverse((o) => { o.castShadow = true; });
  return g;
}
