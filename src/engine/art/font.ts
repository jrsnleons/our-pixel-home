// A 3x5 pixel font for text painted into the world (clock faces, the calendar, scripture art).

import { px, type Ctx } from './pixel';

const GLYPHS: Record<string, string> = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
  F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
  K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010',
  P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010',
  Z: '111001010100111',
  '0': '111101101101111', '1': '010110010010111', '2': '110001010100111', '3': '110001010001110', '4': '101101111001001',
  '5': '111100110001110', '6': '011100111101111', '7': '111001010010010', '8': '111101111101111', '9': '111101111001110',
  ':': '000010000010000', '.': '000000000000010', ',': '000000000010100', '-': '000000111000000', "'": '010010000000000',
  '!': '010010010000010', '?': '110001010000010', '/': '001001010100100', '+': '000010111010000', ' ': '000000000000000',
  '&': '010101010101011', '♥': '000101111111010',
};

export function textWidth(s: string, scale = 1): number {
  return s.length ? (s.length * 4 - 1) * scale : 0;
}

export function drawText(g: Ctx, s: string, x: number, y: number, color: string, scale = 1) {
  let cx = x;
  for (const ch of s.toUpperCase()) {
    const glyph = GLYPHS[ch] ?? GLYPHS['?'];
    for (let i = 0; i < 15; i++) if (glyph[i] === '1') px(g, color, cx + (i % 3) * scale, y + Math.floor(i / 3) * scale, scale, scale);
    cx += 4 * scale;
  }
}

/** Word-wrap into lines that fit `maxW` pixels. */
export function wrap(s: string, maxW: number): string[] {
  const words = s.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (textWidth(next) <= maxW) cur = next;
    else { if (cur) lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}
