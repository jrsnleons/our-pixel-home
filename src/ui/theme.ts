// Applies a theme's UI palette and font as CSS variables on the document.
import { THEMES, type ThemeKey } from '../data/themes';

export function applyTheme(k: ThemeKey) {
  const T = THEMES[k];
  const s = document.documentElement.style;
  const u = T.ui;
  s.setProperty('--bg', u.bg); s.setProperty('--panel', u.panel); s.setProperty('--ink', u.ink);
  s.setProperty('--accent', u.accent); s.setProperty('--accent-ink', u.accentInk); s.setProperty('--soft', u.soft);
  s.setProperty('--muted', u.muted); s.setProperty('--good', u.good); s.setProperty('--bad', u.bad);
  s.setProperty('--outline', T.outline); s.setProperty('--font', T.font); s.setProperty('--fs', String(T.fontScale));
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', T.mood.backdrop);
}
