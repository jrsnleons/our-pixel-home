// The guided tour on the first visit home: a pixel arrow points at one thing at a time with a
// line about it. It runs once per person (the flag lives on the profile, so a new phone doesn't
// repeat it) and can be replayed from Me → Settings.

import { useEffect, useState } from 'preact/hooks';
import { sfx } from '../../audio/audio';
import type { HomeScene } from '../../engine/scene';
import { partner } from '../../state/store';

interface Step {
  /** A `data-tour` name in the HUD or bottom bar, or 'partner' for the character in the room. */
  target: string;
  title: string;
  text: () => string;
}

const STEPS: Step[] = [
  {
    target: 'partner', title: 'Your partner',
    text: () => partner.value
      ? `This is ${partner.value.name}. Tap them to send a heart, hug, wave or sit together.`
      : 'Tap the floor to walk around. Once your partner moves in, tap them to hug, wave or sit together.',
  },
  { target: 'coins', title: 'Coins and quests', text: () => 'You both earn coins into one wallet. The star shows starter quests, the first things to do together.' },
  { target: 'decorate', title: 'Decorate', text: () => 'Place, turn and move furniture around your room.' },
  { target: 'notes', title: 'Notes', text: () => 'Shared notebooks, prayer requests, and your own quiet time with the Lord.' },
  { target: 'door', title: 'The front door', text: () => 'Tap it to head out to Maple Street: your first real bed is at Maple Furnishings, clothes are at The Boutique, and the café and other jobs are down the road.' },
];

interface Box { x: number; y: number; w: number; h: number }

export function Tour({ scene, onDone }: { scene: HomeScene; onDone: () => void }) {
  const [i, setI] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const step = STEPS[i];

  // Follow the target: the partner walks, and the layout can shift on rotation or resize.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const stage = document.querySelector('.stage')?.getBoundingClientRect();
      let b: Box | null = null;
      if (stage) {
        if (step.target === 'partner') {
          const who = partner.value ? scene.partner : scene.me;
          const p = scene.project(who.head());
          b = { x: p.x - stage.left - 26, y: p.y - stage.top - 10, w: 52, h: 76 };
        } else if (step.target === 'door') {
          const p = scene.project(scene.me.pos.clone().set(-3.4, 1.3, 1.5));
          b = { x: p.x - stage.left - 34, y: p.y - stage.top - 52, w: 68, h: 104 };
        } else {
          const r = document.querySelector(`[data-tour="${step.target}"]`)?.getBoundingClientRect();
          if (r) b = { x: r.left - stage.left - 4, y: r.top - stage.top - 4, w: r.width + 8, h: r.height + 8 };
        }
      }
      setBox((old) => (old && b && Math.abs(old.x - b.x) < 1 && Math.abs(old.y - b.y) < 1 ? old : b));
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [i]);

  const next = () => { sfx('tap'); if (i + 1 < STEPS.length) setI(i + 1); else { sfx('win'); onDone(); } };
  const skip = () => { sfx('close'); onDone(); };
  // The card sits on the far side of the screen from what it points at.
  const stageH = document.querySelector('.stage')?.clientHeight ?? 800;
  const below = !box || box.y + box.h / 2 < stageH / 2;
  return (
    <div class="tour" role="dialog" aria-label="Quick tour">
      {box && <div class="tour-ring" style={{ left: `${box.x}px`, top: `${box.y}px`, width: `${box.w}px`, height: `${box.h}px` }} />}
      {box && (
        <div class={`tour-arrow ${below ? 'up' : 'down'}`} style={{ left: `${box.x + box.w / 2 - 12}px`, top: below ? `${box.y + box.h + 6}px` : `${box.y - 30}px` }}>
          <PixelArrow />
        </div>
      )}
      <div class="tour-card pbox" style={below ? { bottom: 'calc(var(--safe-b) + 96px)' } : { top: 'calc(var(--safe-t) + 70px)' }}>
        <div class="row" style={{ alignItems: 'baseline' }}>
          <b class="grow" style={{ fontWeight: 'normal' }}>{step.title}</b>
          <span class="tiny muted">{i + 1} / {STEPS.length}</span>
        </div>
        <p class="small" style={{ margin: 0 }}>{step.text()}</p>
        <div class="row">
          <button class="btn ghost small" onClick={skip}>Skip tour</button>
          <div class="grow" />
          <button class="btn small" onClick={next}>{i + 1 < STEPS.length ? 'Next' : 'Got it'}</button>
        </div>
      </div>
    </div>
  );
}

/** A chunky 12x14 pixel arrow pointing up, drawn at 2x; CSS flips it to point down. */
function PixelArrow() {
  const rows = [
    '.....oo.....',
    '....oyyo....',
    '...oyyyyo...',
    '..oyyyyyyo..',
    '.oyyyyyyyyo.',
    'oooyyyyyyooo',
    '..oyyyyyyo..',
    '..oyyyyyyo..',
    '..oyyyyyyo..',
    '..oyyyyyyo..',
    '..oyyyyyyo..',
    '..oyyyyyyo..',
    '..oyyyyyyo..',
    '..oooooooo..',
  ];
  return (
    <svg width="24" height="28" viewBox="0 0 12 14" shape-rendering="crispEdges" aria-hidden="true">
      {rows.flatMap((r, y) => [...r].map((ch, x) => ch === '.' ? null : <rect x={x} y={y} width={1} height={1} fill={ch === 'o' ? 'var(--outline)' : x < 5 ? '#FFF2B0' : '#FFD27A'} />))}
    </svg>
  );
}
