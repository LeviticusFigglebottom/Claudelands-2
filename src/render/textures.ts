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

/** Cracked dry-earth ground. */
export function groundTexture(base = '#a3703f'): THREE.CanvasTexture {
  const [c, ctx] = canvas(512, 512);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 512, 512);
  grunge(ctx, 512, 512, '#c99a5e', 90, 10, 70, 0.10);
  grunge(ctx, 512, 512, '#6b4326', 120, 8, 60, 0.12);
  // crack polylines
  ctx.strokeStyle = 'rgba(30,18,10,0.55)';
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
// Signage / graffiti / posters — original world flavor, drawn at runtime.

export interface PosterSpec {
  bg: string; fg: string; accent?: string;
  lines: string[];          // text lines, drawn stencil-style
  style: 'propaganda' | 'graffiti' | 'warning' | 'ad';
}

export function posterTexture(spec: PosterSpec): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 320);
  ctx.fillStyle = spec.bg;
  ctx.fillRect(0, 0, 256, 320);

  if (spec.style === 'propaganda') {
    // sunburst
    ctx.fillStyle = spec.accent ?? 'rgba(255,255,255,0.15)';
    for (let i = 0; i < 12; i++) {
      ctx.beginPath();
      ctx.moveTo(128, 130);
      const a0 = (i / 12) * Math.PI * 2, a1 = a0 + 0.14;
      ctx.lineTo(128 + Math.cos(a0) * 300, 130 + Math.sin(a0) * 300);
      ctx.lineTo(128 + Math.cos(a1) * 300, 130 + Math.sin(a1) * 300);
      ctx.fill();
    }
    ctx.strokeStyle = spec.fg; ctx.lineWidth = 8;
    ctx.strokeRect(8, 8, 240, 304);
  } else if (spec.style === 'warning') {
    ctx.fillStyle = spec.accent ?? '#111';
    for (let i = -4; i < 10; i++) {
      ctx.save(); ctx.translate(i * 42, 0); ctx.rotate(Math.PI / 4);
      ctx.fillRect(0, -160, 18, 640);
      ctx.restore();
    }
    ctx.fillStyle = spec.bg;
    ctx.fillRect(20, 60, 216, 200);
    ctx.strokeStyle = spec.fg; ctx.lineWidth = 6; ctx.strokeRect(20, 60, 216, 200);
  } else if (spec.style === 'ad') {
    ctx.fillStyle = spec.accent ?? '#ffd23c';
    ctx.beginPath(); ctx.arc(128, 110, 80, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = spec.fg; ctx.lineWidth = 5; ctx.strokeRect(6, 6, 244, 308);
  }

  // Text
  ctx.textAlign = 'center';
  ctx.fillStyle = spec.fg;
  const n = spec.lines.length;
  spec.lines.forEach((line, i) => {
    const size = Math.min(44, 300 / Math.max(3, line.length * 0.62));
    ctx.font = `900 ${size}px Impact, 'Arial Black', sans-serif`;
    const y = 160 + (i - (n - 1) / 2) * (size + 14);
    if (spec.style === 'graffiti') {
      ctx.save();
      ctx.translate(128, y);
      ctx.rotate((Math.random() - 0.5) * 0.16);
      ctx.strokeStyle = spec.accent ?? '#000';
      ctx.lineWidth = 6;
      ctx.strokeText(line, 0, 0);
      ctx.fillText(line, 0, 0);
      ctx.restore();
    } else {
      ctx.fillText(line, 128, y);
    }
  });

  // wear & tear
  grunge(ctx, 256, 320, 'rgba(40,25,12,1)', 30, 4, 26, 0.16);
  inkSpeckle(ctx, 256, 320, 90, 0.4);
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
