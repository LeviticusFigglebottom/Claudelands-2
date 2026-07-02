// Small math helpers used everywhere.

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const clamp01 = (v: number) => clamp(v, 0, 1);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Frame-rate independent exponential approach. */
export const damp = (a: number, b: number, lambda: number, dt: number) =>
  lerp(a, b, 1 - Math.exp(-lambda * dt));

export const randSpread = (mag: number) => (Math.random() * 2 - 1) * mag;

export function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 10_000) return (n / 1000).toFixed(1) + 'k';
  return Math.round(n).toLocaleString('en-US');
}

export function fmtPct(mult: number): string {
  const p = Math.round((mult - 1) * 100);
  return (p >= 0 ? '+' : '') + p + '%';
}
