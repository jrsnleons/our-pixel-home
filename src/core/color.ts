// Color helpers for pixel art. Ramps hue-shift the way hand-made pixel palettes do:
// shadows drift toward cool violet, highlights toward warm yellow, so shading never looks
// like a flat black/white overlay.

export type RGB = [number, number, number];

export function hexToRgb(hex: string): RGB {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export function rgbToHex([r, g, b]: RGB): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return '#' + ((1 << 24) | (c(r) << 16) | (c(g) << 8) | c(b)).toString(16).slice(1).toUpperCase();
}

export function mix(a: string, b: string, t: number): string {
  const pa = hexToRgb(a), pb = hexToRgb(b);
  return rgbToHex([pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t, pa[2] + (pb[2] - pa[2]) * t]);
}

export function rgbToHsl([r, g, b]: RGB): RGB {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

export function hslToRgb([h, s, l]: RGB): RGB {
  h = ((h % 360) + 360) % 360 / 360;
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}

/** Move hue toward a target hue by at most `amount` degrees. */
function hueToward(h: number, target: number, amount: number): number {
  let d = ((target - h + 540) % 360) - 180;
  if (Math.abs(d) < amount) return target;
  return h + Math.sign(d) * amount;
}

/**
 * Shift a color darker (k < 0) or lighter (k > 0) with pixel-art hue shifting.
 * k is roughly the lightness delta (-1..1).
 */
export function shade(hex: string, k: number): string {
  const [h, s, l] = rgbToHsl(hexToRgb(hex));
  if (k < 0) {
    const nh = hueToward(h, 250, Math.abs(k) * 40);
    return rgbToHex(hslToRgb([nh, Math.min(1, s * (1 + Math.abs(k) * 0.25)), Math.max(0, l + k)]));
  }
  const nh = hueToward(h, 50, k * 30);
  return rgbToHex(hslToRgb([nh, s * (1 - k * 0.15), Math.min(1, l + k)]));
}

/** A 5-step ramp: [deepest shadow, shadow, base, light, highlight]. */
export function ramp(base: string): [string, string, string, string, string] {
  return [shade(base, -0.24), shade(base, -0.12), base, shade(base, 0.08), shade(base, 0.17)];
}

export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
