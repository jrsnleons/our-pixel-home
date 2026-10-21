// Inbox Zero, a desk job. Emails pile into the inbox; read the stamp on the open one and file it
// in the matching folder before the pile overflows. Work mail has a briefcase, family mail a
// heart, prize mail is spam. From level 4 bills get their own folder, and from level 6 some
// mail only looks like it's from work or the bank: a red hook on the stamp means it's phishing,
// and phishing goes in spam. Together, each of you clears your own inbox for a shared combo.

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { sfx } from '../../audio/audio';
import { difficulty } from '../../data/economy';
import type { CafeEvent } from '../../net/types';
import { backend, partner } from '../../state/store';
import { deskBackdrop } from './Bugs';
import { SHIFT_SECONDS, sendShift, ShiftHud, useShiftEvents, type ShiftProps } from './common';

const W = 96, H = 124;
const SCR = { x: 6, y: 6, w: 84, h: 92 };
const PILE_MAX = 7;

type Folder = 'work' | 'family' | 'bills' | 'spam';
interface Mail { id: number; kind: Folder; looks: Folder; phish: boolean; at: number; lines: number[] }

const P = (g: CanvasRenderingContext2D, c: string, x: number, y: number, w = 1, h = 1) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); };

/** 12x12 stamps: o outline, then each icon's own colors. */
const STAMPS: Record<Folder, { map: string[]; pal: Record<string, string>; name: string; bg: string }> = {
  work: {
    name: 'Work', bg: '#DCE6F2', pal: { o: '#2E2A2A', b: '#8A5A36', l: '#B07A48', y: '#F2C230' },
    map: ['............', '....oooo....', '....o..o....', '.oooooooooo.', '.olllllllllo', '.obbbbbbbbbo', '.ooooyyooooo', '.obbbyybbbbo', '.obbbbbbbbbo', '.obbbbbbbbbo', '.oooooooooo.', '............'],
  },
  family: {
    name: 'Family', bg: '#F8E0E6', pal: { o: '#6A1A2A', m: '#E5566F', l: '#F7A0B0' },
    map: ['............', '..ooo..ooo..', '.ollmoommmo.', 'olmmmmmmmmmo', 'olmmmmmmmmmo', 'ommmmmmmmmmo', '.ommmmmmmmo.', '..ommmmmmo..', '...ommmmo...', '....ommo....', '.....oo.....', '............'],
  },
  bills: {
    name: 'Bills', bg: '#F2ECCF', pal: { o: '#6A4A10', m: '#F2C230', l: '#FFE27A', d: '#C8961E' },
    map: ['............', '....oooo....', '..oommmmoo..', '.ommlllmmmo.', '.omlmddmmmo.', 'omlmdmmmmmmo', 'ommmddmmmmmo', 'ommmmmdmmmmo', '.ommmddmmmo.', '.oommmmmmoo.', '...oooooo...', '............'],
  },
  spam: {
    name: 'Spam', bg: '#E4E0EA', pal: { o: '#2E2A2A', r: '#E8414A', l: '#FF8A8A', y: '#F2C230', w: '#FFFFFF' },
    map: ['....y..y....', '.....yy.....', '.oooooooooo.', '.orrryyrrro.', '.oooooooooo.', '..orrryyro..', '..olrryyro..', '..orrryyro..', '..orrryyro..', '..orrryyro..', '..oooooooo..', '............'],
  },
};

function drawStamp(g: CanvasRenderingContext2D, x: number, y: number, k: Folder, s = 1) {
  const st = STAMPS[k];
  st.map.forEach((row, j) => [...row].forEach((ch, i) => { const c = st.pal[ch]; if (c) { g.fillStyle = c; g.fillRect(x + i * s, y + j * s, s, s); } }));
}

const stampUrls = new Map<string, string>();
function stampUrl(k: Folder): string {
  let u = stampUrls.get(k);
  if (!u) {
    const c = document.createElement('canvas'); c.width = 12; c.height = 12;
    drawStamp(c.getContext('2d')!, 0, 0, k);
    u = c.toDataURL(); stampUrls.set(k, u);
  }
  return u;
}

export function inboxThumb(): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  g.drawImage(deskBackdrop(), 0, 0);
  P(g, '#F2EEE4', SCR.x, SCR.y, SCR.w, SCR.h);
  (['work', 'family', 'bills', 'spam'] as Folder[]).forEach((k, i) => drawStamp(g, 14 + (i % 2) * 40, 18 + Math.floor(i / 2) * 36, k, 2));
  return c;
}

export function InboxShift({ id, role, level, resume, onEnd, onTick }: ShiftProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const hard = difficulty(level);
  const together = role !== 'solo';
  const isBot = backend.mode === 'preview';
  const folders: Folder[] = hard >= 0.3 ? ['work', 'family', 'bills', 'spam'] : ['work', 'family', 'spam'];
  const phishing = hard >= 0.55;
  const st = useRef({
    pile: [] as Mail[], n: 1, t: resume?.t ?? 0, nextMail: 0.3, served: resume?.served ?? 0, missed: resume?.missed ?? 0,
    streak: 0, flash: 0, flashOk: true, them: { streak: 0 }, combo: 0, bot: 1.5, ended: false,
  });
  const [, force] = useState(0);
  const rerender = () => force((x) => x + 1);
  const name = partner.value?.name ?? 'Partner';
  const icons = useMemo(() => Object.fromEntries(folders.map((f) => [f, stampUrl(f)])), [folders.length]);

  const send = () => { if (together) sendShift(id, { k: 'desk', streak: st.current.streak, served: st.current.served }); };
  useShiftEvents(id, (ev: CafeEvent) => { if (ev.k === 'desk') { st.current.them.streak = ev.streak; rerender(); } });

  const finish = () => {
    const s = st.current;
    if (s.ended) return;
    s.ended = true;
    onEnd(s.served, s.missed);
  };

  const newMail = (): Mail => {
    const s = st.current;
    const kind = folders[Math.floor(Math.random() * folders.length)];
    // Phishing borrows the look of work or bank mail.
    const phish = phishing && kind === 'spam' && Math.random() < 0.5 + 0.3 * hard;
    const looks: Folder = phish ? (folders.includes('bills') && Math.random() < 0.5 ? 'bills' : 'work') : kind;
    const lines = Array.from({ length: 4 }, () => 20 + Math.floor(Math.random() * 44));
    return { id: s.n++, kind, looks, phish, at: s.t, lines };
  };

  useEffect(() => {
    let raf = 0, last = performance.now();
    const loop = (now: number) => {
      const dt = Math.max(0, Math.min(0.1, (now - last) / 1000)); last = now;
      const s = st.current;
      s.t += dt;
      s.nextMail -= dt;
      if (s.nextMail <= 0 && s.t < SHIFT_SECONDS - 2) {
        s.pile.push(newMail());
        s.nextMail = Math.max(0.75, 2.3 - 1.2 * hard - s.t / 80) * (0.7 + Math.random() * 0.6);
        // A full inbox bounces the oldest mail.
        if (s.pile.length > PILE_MAX) { s.pile.shift(); s.missed++; s.streak = 0; s.flash = s.t; s.flashOk = false; sfx('error'); send(); }
      }
      if (together && isBot) {
        s.bot -= dt;
        if (s.bot <= 0) { s.bot = 1 + Math.random() * 1.5; s.them.streak = Math.random() < 0.88 ? s.them.streak + 1 : 0; }
      }
      const combo = together ? Math.min(s.streak, s.them.streak) : 0;
      if (combo > s.combo && combo >= 3 && combo % 3 === 0) sfx('heart');
      s.combo = combo;
      if (s.t >= SHIFT_SECONDS) { finish(); return; }
      onTick?.({ t: s.t, served: s.served, missed: s.missed });
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const tick = setInterval(rerender, 200);
    return () => { cancelAnimationFrame(raf); clearInterval(tick); };
  }, []);

  const draw = () => {
    const c = canvas.current;
    if (!c) return;
    const g = c.getContext('2d')!;
    const s = st.current;
    g.imageSmoothingEnabled = false;
    g.drawImage(deskBackdrop(), 0, 0);
    // Mail app: a title bar, the pile down the left, the open email on the right.
    P(g, '#F2EEE4', SCR.x, SCR.y, SCR.w, SCR.h);
    P(g, '#4A7AD8', SCR.x, SCR.y, SCR.w, 7); P(g, '#8AB2F2', SCR.x, SCR.y, SCR.w, 1);
    for (let i = 0; i < 3; i++) P(g, '#F2EEE4', SCR.x + 3 + i * 3, SCR.y + 3, 2, 1);
    const full = s.pile.length / PILE_MAX;
    P(g, '#24283B', SCR.x + 50, SCR.y + 2, 30, 3);
    P(g, full > 0.7 ? '#E8414A' : full > 0.45 ? '#F2C230' : '#6AD07A', SCR.x + 51, SCR.y + 3, Math.round(28 * full), 1);
    P(g, '#E2DCCF', SCR.x, SCR.y + 7, 22, SCR.h - 7);
    s.pile.slice(0, 9).forEach((m, i) => {
      const y = SCR.y + 9 + i * 9;
      P(g, i === 0 ? '#FFFFFF' : '#F6F2EA', SCR.x + 1, y, 20, 8);
      P(g, i === 0 ? '#4A7AD8' : '#C8C0B0', SCR.x + 1, y, 1, 8);
      P(g, '#8A8478', SCR.x + 4, y + 2, 12, 1); P(g, '#B8B0A0', SCR.x + 4, y + 5, 8 + (m.lines[0] % 6), 1);
    });
    const top = s.pile[0];
    if (top) {
      const x = SCR.x + 25, y = SCR.y + 11;
      P(g, '#FFFFFF', x, y, 56, 62); P(g, '#C8C0B0', x, y + 62, 56, 1);
      P(g, STAMPS[top.looks].bg, x + 2, y + 2, 28, 28);
      drawStamp(g, x + 4, y + 4, top.looks, 2);
      if (top.phish) {
        // The tell: a red fish hook in the stamp's corner.
        P(g, '#E8414A', x + 25, y + 3, 2, 6); P(g, '#E8414A', x + 22, y + 8, 4, 2); P(g, '#E8414A', x + 21, y + 6, 2, 2);
      }
      P(g, '#3A3430', x + 33, y + 4, 18, 2); P(g, '#8A8478', x + 33, y + 9, 14, 1);
      top.lines.forEach((w, i) => P(g, top.phish && i === 1 ? '#E8414A' : '#B8B0A0', x + 3, y + 36 + i * 6, Math.min(50, w), 2));
    } else {
      P(g, '#8A8478', SCR.x + 38, SCR.y + 40, 30, 2);
      P(g, '#6AD07A', SCR.x + 48, SCR.y + 46, 10, 6); P(g, '#FFFFFF', SCR.x + 50, SCR.y + 48, 6, 1);
    }
    if (s.t - s.flash < 0.25 && s.flash > 0) { g.fillStyle = s.flashOk ? 'rgba(106,208,122,.25)' : 'rgba(232,65,74,.3)'; g.fillRect(SCR.x, SCR.y, SCR.w, SCR.h); }
    if (s.combo >= 3) { const tw = Math.floor(s.t * 6) % 2; P(g, '#FFE27A', 10 + tw, 104, 1, 1); P(g, '#FFE27A', W - 12 - tw, 106, 1, 1); }
  };

  const file = (f: Folder) => {
    const s = st.current;
    const m = s.pile[0];
    if (!m || s.ended) return;
    s.pile.shift();
    s.flash = s.t;
    if (m.kind === f) { s.served++; s.streak++; s.flashOk = true; sfx('coin'); }
    else { s.missed++; s.streak = 0; s.flashOk = false; sfx('error'); }
    send();
    rerender();
  };

  useEffect(() => {
    const keys = (e: KeyboardEvent) => { const i = Number(e.key) - 1; if (i >= 0 && i < folders.length) file(folders[i]); };
    window.addEventListener('keydown', keys);
    return () => window.removeEventListener('keydown', keys);
  }, []);

  const s = st.current;
  const left = Math.max(0, Math.ceil(SHIFT_SECONDS - s.t));
  return (
    <div class="col">
      <ShiftHud label={role === 'solo' ? 'Solo' : role === 'host' ? 'You: top pile' : 'You: bottom pile'} served={s.served} missed={s.missed} left={left}>
        {s.combo >= 3 && <span class="chip combo">Combo ×{s.combo}</span>}
      </ShiftHud>
      <div class="cafe pbox street" style={{ aspectRatio: `${W}/${H}` }}>
        <canvas ref={canvas} width={W} height={H} />
      </div>
      <div class="drinks" style={{ gridTemplateColumns: `repeat(${folders.length}, 1fr)` }}>
        {folders.map((f) => (
          <button class="btn soft" onPointerDown={(e) => { e.preventDefault(); file(f); }}>
            <img src={icons[f]} alt="" />{STAMPS[f].name}
          </button>
        ))}
      </div>
      <p class="tiny muted center" style={{ margin: 0 }}>
        File the open email in the folder that matches its stamp. Don’t let the inbox overflow.
        {phishing ? ' A red hook on the stamp means phishing: that goes in Spam.' : ''}
        {together ? ` Keep your streak going with ${name} for a shared combo.` : ''}
      </p>
    </div>
  );
}
