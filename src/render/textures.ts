// Procedural canvas textures — the "hand-inked" material language.
// Nothing photoreal: every surface gets painterly grime, ink speckle, and
// scuffed edges baked into the albedo so the toon ramp has texture to band.

import * as THREE from 'three';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')!];
}

function tex(c: HTMLCanvasElement, repeat = 1): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Splatter painterly noise blotches over the current canvas. */
function grunge(ctx: CanvasRenderingContext2D, w: number, h: number, color: string, count: number, minR: number, maxR: number, alpha: number): void {
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    ctx.globalAlpha = alpha * (0.3 + Math.random() * 0.7);
    const r = minR + Math.random() * (maxR - minR);
    ctx.beginPath();
    ctx.ellipse(Math.random() * w, Math.random() * h, r, r * (0.4 + Math.random() * 0.6), Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** Short ink strokes — the hand-drawn speckle that sells the comic look. */
function inkSpeckle(ctx: CanvasRenderingContext2D, w: number, h: number, count: number, alpha = 0.5): void {
  ctx.strokeStyle = 'rgba(10,8,12,' + alpha + ')';
  for (let i = 0; i < count; i++) {
    ctx.lineWidth = 0.5 + Math.random() * 1.6;
    const x = Math.random() * w, y = Math.random() * h;
    const a = Math.random() * Math.PI, l = 2 + Math.random() * 9;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }
}

/** Base painterly surface: color + tonal blotches + ink speckle. */
export function grimeTexture(base: string, opts: { light?: string; dark?: string; speckle?: number; repeat?: number } = {}): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  grunge(ctx, 256, 256, opts.light ?? 'rgba(255,255,255,1)', 40, 6, 40, 0.06);
  grunge(ctx, 256, 256, opts.dark ?? 'rgba(0,0,0,1)', 50, 4, 34, 0.09);
  inkSpeckle(ctx, 256, 256, opts.speckle ?? 120, 0.35);
  return tex(c, opts.repeat ?? 1);
}

/** Corrugated scrap metal with rust streaks — bandit architecture staple. */
export function corrugatedTexture(base = '#8a7f6d', rust = '#8a4a26', repeat = 2): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  // vertical ridges
  for (let x = 0; x < 256; x += 16) {
    const g = ctx.createLinearGradient(x, 0, x + 16, 0);
    g.addColorStop(0, 'rgba(0,0,0,0.30)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.14)');
    g.addColorStop(1, 'rgba(0,0,0,0.30)');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, 16, 256);
  }
  // rust drips
  ctx.fillStyle = rust;
  for (let i = 0; i < 26; i++) {
    ctx.globalAlpha = 0.15 + Math.random() * 0.4;
    const x = Math.random() * 256, y = Math.random() * 120, w = 3 + Math.random() * 10, hgt = 30 + Math.random() * 130;
    ctx.fillRect(x, y, w, hgt);
    ctx.beginPath(); ctx.ellipse(x + w / 2, y, w, w * 0.8, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  inkSpeckle(ctx, 256, 256, 160, 0.3);
  return tex(c, repeat);
}

/** Cracked ground — biome palette drives desert dirt or packed snow. */
export function groundTexture(base = '#a3703f', light = '#c99a5e', dark = '#6b4326', crack = 'rgba(30,18,10,0.55)'): THREE.CanvasTexture {
  const [c, ctx] = canvas(512, 512);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 512, 512);
  grunge(ctx, 512, 512, light, 90, 10, 70, 0.10);
  grunge(ctx, 512, 512, dark, 120, 8, 60, 0.12);
  // crack polylines
  ctx.strokeStyle = crack;
  for (let i = 0; i < 40; i++) {
    ctx.lineWidth = 1 + Math.random() * 2.2;
    let x = Math.random() * 512, y = Math.random() * 512;
    ctx.beginPath(); ctx.moveTo(x, y);
    const segs = 3 + Math.floor(Math.random() * 5);
    for (let s = 0; s < segs; s++) {
      x += (Math.random() - 0.5) * 90; y += (Math.random() - 0.5) * 90;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  inkSpeckle(ctx, 512, 512, 300, 0.25);
  return tex(c, 10);
}

/** Rock face with chiseled ink strata. */
export function rockTexture(base = '#7d6a58'): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 20 + Math.random() * 26) {
    ctx.strokeStyle = 'rgba(25,18,14,0.4)';
    ctx.lineWidth = 2 + Math.random() * 3;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= 256; x += 32) ctx.lineTo(x, y + (Math.random() - 0.5) * 14);
    ctx.stroke();
  }
  grunge(ctx, 256, 256, '#9c8a74', 40, 8, 46, 0.10);
  grunge(ctx, 256, 256, '#4a3a2c', 50, 8, 40, 0.12);
  inkSpeckle(ctx, 256, 256, 140, 0.3);
  return tex(c, 3);
}

// ---------------------------------------------------------------------------
// Flat-color painterly swatches for props/guns (cached by key)
const swatchCache = new Map<string, THREE.CanvasTexture>();
export function swatch(base: string, speckle = 60): THREE.CanvasTexture {
  const key = base + ':' + speckle;
  let t = swatchCache.get(key);
  if (!t) { t = grimeTexture(base, { speckle }); swatchCache.set(key, t); }
  return t;
}

// ---------------------------------------------------------------------------
// Water: pool surface (sparkle flecks) and falling-water streaks. The fall
// texture is designed to scroll vertically.

/** Gun-metal albedo per manufacturer visual language. Style keys match the
 *  maker silhouettes so a VULKRAM reads riveted plate and a BRISKCO reads
 *  injection-molded toy, before you even see the shape. */
export function gunTexture(base: string, style: 'brick' | 'sleek' | 'cobbled' | 'coiled' | 'classic' | 'toy'): THREE.CanvasTexture {
  const [c, ctx] = canvas(128, 128);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 128, 128);
  switch (style) {
    case 'brick': { // riveted plate: panel seams + rivet heads + scuffs
      ctx.strokeStyle = 'rgba(10,8,12,0.5)';
      ctx.lineWidth = 2;
      for (const y of [32, 64, 96]) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(128, y); ctx.stroke(); }
      for (const x of [42, 86]) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 128); ctx.stroke(); }
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      for (let i = 0; i < 24; i++) { ctx.beginPath(); ctx.arc(6 + (i % 6) * 22, 10 + Math.floor(i / 6) * 32, 2.2, 0, Math.PI * 2); ctx.fill(); }
      grunge(ctx, 128, 128, 'rgba(20,16,12,0.5)', 10, 3, 9, 0.3);
      break;
    }
    case 'sleek': { // brushed lines + a soft sheen band
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.lineWidth = 1;
      for (let y = 3; y < 128; y += 5) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(128, y); ctx.stroke(); }
      const grad = ctx.createLinearGradient(0, 0, 0, 128);
      grad.addColorStop(0.35, 'rgba(255,255,255,0)');
      grad.addColorStop(0.5, 'rgba(255,255,255,0.18)');
      grad.addColorStop(0.65, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 128, 128);
      break;
    }
    case 'cobbled': { // mismatched salvage: patch rects, weld seams, rust
      for (let i = 0; i < 7; i++) {
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = i % 2 ? 'rgba(90,70,50,1)' : 'rgba(60,66,74,1)';
        ctx.fillRect(Math.random() * 100, Math.random() * 100, 20 + Math.random() * 40, 16 + Math.random() * 30);
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(16,12,10,0.7)';
      ctx.lineWidth = 2.5;
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        let x = Math.random() * 128, y = Math.random() * 128;
        ctx.moveTo(x, y);
        for (let k = 0; k < 4; k++) { x += (Math.random() - 0.5) * 40; y += (Math.random() - 0.5) * 40; ctx.lineTo(x, y); }
        ctx.stroke();
      }
      grunge(ctx, 128, 128, 'rgba(138,74,38,0.8)', 12, 3, 10, 0.35);
      inkSpeckle(ctx, 128, 128, 40, 0.4);
      break;
    }
    case 'coiled': { // arcane brass: etched rings + glyph ticks
      ctx.strokeStyle = 'rgba(255,235,190,0.28)';
      ctx.lineWidth = 1.4;
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.arc(Math.random() * 128, Math.random() * 128, 8 + Math.random() * 20, 0, Math.PI * 2);
        ctx.stroke();
      }
      for (let i = 0; i < 26; i++) {
        const x = Math.random() * 128, y = Math.random() * 128;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (Math.random() - 0.5) * 8, y + (Math.random() - 0.5) * 8); ctx.stroke();
      }
      grunge(ctx, 128, 128, 'rgba(20,10,30,0.6)', 8, 4, 12, 0.25);
      break;
    }
    case 'classic': { // long wavy wood grain
      ctx.strokeStyle = 'rgba(30,18,8,0.4)';
      for (let y = 2; y < 128; y += 7) {
        ctx.lineWidth = 1 + Math.random() * 1.6;
        ctx.beginPath();
        ctx.moveTo(0, y);
        for (let x = 0; x <= 128; x += 16) ctx.lineTo(x, y + Math.sin(x * 0.08 + y) * 2.5);
        ctx.stroke();
      }
      grunge(ctx, 128, 128, 'rgba(255,220,160,0.5)', 6, 4, 14, 0.2);
      break;
    }
    case 'toy': { // clean plastic: diagonal stripe + sticker dots + seam
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath();
      ctx.moveTo(0, 90); ctx.lineTo(128, 30); ctx.lineTo(128, 52); ctx.lineTo(0, 112); ctx.fill();
      ctx.strokeStyle = 'rgba(10,8,12,0.35)';
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(0, 64); ctx.lineTo(128, 64); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(Math.random() * 128, Math.random() * 128, 3, 0, Math.PI * 2); ctx.fill(); }
      break;
    }
  }
  // universal wear pass: bright scratch highlights up top where hands and
  // holsters rub, oily grime pooling along the bottom — every maker's gun
  // reads carried, not printed
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 7; i++) {
    const x = Math.random() * 120, y = Math.random() * 30;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 6 + Math.random() * 16, y + (Math.random() - 0.5) * 4); ctx.stroke();
  }
  const grimeGrad = ctx.createLinearGradient(0, 88, 0, 128);
  grimeGrad.addColorStop(0, 'rgba(12,10,8,0)');
  grimeGrad.addColorStop(1, 'rgba(12,10,8,0.28)');
  ctx.fillStyle = grimeGrad;
  ctx.fillRect(0, 88, 128, 40);
  inkSpeckle(ctx, 128, 128, 16, 0.3);
  return tex(c);
}

export function waterTexture(base = '#2f86b8', light = '#bfe8ff'): THREE.CanvasTexture {
  const [c, ctx] = canvas(128, 128);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = light;
  ctx.lineWidth = 2;
  for (let i = 0; i < 26; i++) {
    const y = Math.random() * 128;
    const x = Math.random() * 128;
    ctx.globalAlpha = 0.2 + Math.random() * 0.35;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + 8, y - 2, x + 14 + Math.random() * 10, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const t = tex(c, 4);
  return t;
}

export function fallTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(64, 128);
  ctx.fillStyle = 'rgba(160, 216, 240, 0.85)';
  ctx.fillRect(0, 0, 64, 128);
  for (let i = 0; i < 18; i++) {
    const x = Math.random() * 64;
    ctx.strokeStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.7)' : 'rgba(90,150,190,0.5)';
    ctx.lineWidth = 1.5 + Math.random() * 2.5;
    ctx.beginPath();
    ctx.moveTo(x, -8);
    ctx.lineTo(x + (Math.random() - 0.5) * 6, 136);
    ctx.stroke();
  }
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ---------------------------------------------------------------------------
// Signage / graffiti / posters — original world flavor, drawn at runtime.

export interface PosterSpec {
  bg: string; fg: string; accent?: string;
  lines: string[];          // text lines, drawn stencil-style
  style: 'propaganda' | 'graffiti' | 'warning' | 'ad';
}

/**
 * `aspect` is the width/height of the plane this texture will cover — the
 * canvas matches it so text is never squashed or stretched. Text is measured
 * and fitted per line, then the block is centered in the sign's text area.
 */
export function posterTexture(spec: PosterSpec, aspect = 0.8): THREE.CanvasTexture {
  const W = Math.max(96, Math.min(1024, Math.round(288 * Math.sqrt(aspect))));
  const H = Math.max(96, Math.min(1024, Math.round(288 / Math.sqrt(aspect))));
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = spec.bg;
  ctx.fillRect(0, 0, W, H);

  // text area (centered block); the warning style shrinks it to its inner box
  let padX = W * 0.08;
  let cy = H * 0.5;
  let blockH = H * 0.74;

  if (spec.style === 'propaganda') {
    // sunburst
    ctx.fillStyle = spec.accent ?? 'rgba(255,255,255,0.15)';
    const r = Math.max(W, H) * 1.3;
    for (let i = 0; i < 12; i++) {
      ctx.beginPath();
      ctx.moveTo(W / 2, H * 0.42);
      const a0 = (i / 12) * Math.PI * 2, a1 = a0 + 0.14;
      ctx.lineTo(W / 2 + Math.cos(a0) * r, H * 0.42 + Math.sin(a0) * r);
      ctx.lineTo(W / 2 + Math.cos(a1) * r, H * 0.42 + Math.sin(a1) * r);
      ctx.fill();
    }
    ctx.strokeStyle = spec.fg; ctx.lineWidth = Math.max(4, H * 0.025);
    ctx.strokeRect(H * 0.025, H * 0.025, W - H * 0.05, H - H * 0.05);
    padX = W * 0.09;
  } else if (spec.style === 'warning') {
    ctx.fillStyle = spec.accent ?? '#111';
    const stripe = Math.max(14, H * 0.06);
    for (let x = -H; x < W + H; x += stripe * 2.4) {
      ctx.save(); ctx.translate(x, 0); ctx.rotate(Math.PI / 4);
      ctx.fillRect(0, -H, stripe, (W + H) * 2);
      ctx.restore();
    }
    const bx = W * 0.08, by = H * 0.19, bw = W * 0.84, bh = H * 0.62;
    ctx.fillStyle = spec.bg;
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = spec.fg; ctx.lineWidth = Math.max(3, H * 0.02);
    ctx.strokeRect(bx, by, bw, bh);
    padX = W * 0.13;
    cy = by + bh / 2;
    blockH = bh * 0.86;
  } else if (spec.style === 'ad') {
    ctx.fillStyle = spec.accent ?? '#ffd23c';
    ctx.beginPath(); ctx.arc(W / 2, H * 0.36, Math.min(W, H) * 0.31, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = spec.fg; ctx.lineWidth = Math.max(3, H * 0.018);
    ctx.strokeRect(H * 0.02, H * 0.02, W - H * 0.04, H - H * 0.04);
    cy = H * 0.54;
  }

  // Text — measured per line, fitted to the area, centered as a block
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lines = spec.lines;
  const n = lines.length;
  const maxW = W - padX * 2;
  const gap = Math.max(4, blockH * 0.04);
  const sizes = lines.map((line) => {
    let s = Math.min((blockH - gap * (n - 1)) / n, H * 0.32);
    ctx.font = `900 ${s}px Impact, 'Arial Black', sans-serif`;
    const w = ctx.measureText(line).width;
    if (w > maxW) s = Math.max(9, s * (maxW / w));
    return s;
  });
  const total = sizes.reduce((a, b) => a + b, 0) + gap * (n - 1);
  let yCursor = cy - total / 2;
  lines.forEach((line, i) => {
    const s = sizes[i];
    ctx.font = `900 ${s}px Impact, 'Arial Black', sans-serif`;
    const ly = yCursor + s / 2;
    ctx.fillStyle = spec.fg;
    if (spec.style === 'graffiti') {
      ctx.save();
      ctx.translate(W / 2, ly);
      ctx.rotate((Math.random() - 0.5) * 0.12);
      ctx.strokeStyle = spec.accent ?? '#000';
      ctx.lineWidth = Math.max(3, s * 0.14);
      ctx.strokeText(line, 0, 0);
      ctx.fillText(line, 0, 0);
      ctx.restore();
    } else {
      ctx.fillText(line, W / 2, ly);
    }
    yCursor += s + gap;
  });

  // wear & tear
  grunge(ctx, W, H, 'rgba(40,25,12,1)', 30, 4, 26, 0.14);
  inkSpeckle(ctx, W, H, 90, 0.35);
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// ---------------------------------------------------------------------------
// Sprites for particles (rendered once, shared)

let softDot: THREE.CanvasTexture | null = null;
export function softDotTexture(): THREE.CanvasTexture {
  if (softDot) return softDot;
  const [c, ctx] = canvas(64, 64);
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  softDot = tex(c);
  return softDot;
}

let starTex: THREE.CanvasTexture | null = null;
export function starTexture(): THREE.CanvasTexture {
  if (starTex) return starTex;
  const [c, ctx] = canvas(64, 64);
  ctx.translate(32, 32);
  ctx.fillStyle = 'rgba(255,255,255,1)';
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const r = i % 2 === 0 ? 30 : 9;
    const a = (i / 8) * Math.PI * 2;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath(); ctx.fill();
  starTex = tex(c);
  return starTex;
}

/** Vertical gradient used by loot-beam cylinders (bright base, fades up). */
let beamTex: THREE.CanvasTexture | null = null;
export function beamTexture(): THREE.CanvasTexture {
  if (beamTex) return beamTex;
  const [c, ctx] = canvas(16, 128);
  const g = ctx.createLinearGradient(0, 128, 0, 0);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 16, 128);
  beamTex = tex(c);
  beamTex.wrapS = THREE.RepeatWrapping;
  beamTex.wrapT = THREE.ClampToEdgeWrapping;
  return beamTex;
}

/** Flat painted cloud blob with soft alpha — graphic-novel sky filler. */
let cloudTex: THREE.CanvasTexture | null = null;
export function cloudTexture(): THREE.CanvasTexture {
  if (cloudTex) return cloudTex;
  const [c, ctx] = canvas(256, 96);
  ctx.fillStyle = 'rgba(255,255,255,1)';
  // overlapping puffs, flat-topped like painted panels
  const puffs = [
    [60, 62, 38], [110, 52, 46], [165, 58, 40], [205, 66, 26], [90, 70, 30], [140, 70, 34],
  ];
  for (const [x, y, r] of puffs) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillRect(45, 62, 175, 30); // flatten the base
  cloudTex = tex(c);
  cloudTex.wrapS = cloudTex.wrapT = THREE.ClampToEdgeWrapping;
  return cloudTex;
}

/** Toon gradient map: N hard bands for MeshToonMaterial. */
export function toonRamp(steps = 3): THREE.DataTexture {
  const data = new Uint8Array(steps * 4);
  for (let i = 0; i < steps; i++) {
    // keep shadows readable, not black — ink & hatching supply the darkness
    const v = Math.round(80 + (175 * i) / (steps - 1));
    data[i * 4] = v; data[i * 4 + 1] = v; data[i * 4 + 2] = v; data[i * 4 + 3] = 255;
  }
  const t = new THREE.DataTexture(data, steps, 1, THREE.RGBAFormat);
  t.needsUpdate = true;
  t.minFilter = t.magFilter = THREE.NearestFilter;
  return t;
}
