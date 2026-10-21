// The pixel loading screen: a little house with a heart hopping on its roof and a stepping
// progress bar. Shown by withLoading() whenever building or compiling would otherwise freeze
// the picture. Everything moves with transform animations, which the browser runs off the main
// thread, so it keeps moving even while the game is busy building.

import { loading } from '../../state/store';

const HOUSE = [
  '.....dd.....',
  '....drrd....',
  '...drrrrd...',
  '..drrrrrrd..',
  '.drrrrrrrrd.',
  'dddddddddddd',
  '.dwwwwwwwwd.',
  '.dwyywwbbwd.',
  '.dwyywwbbwd.',
  '.dwwwwwbbwd.',
  '.dddddddddd.',
];

function House() {
  const pal: Record<string, string> = { r: 'var(--accent)', w: '#F6E7CF', y: '#FFD27A', b: '#8A5A3A', d: 'var(--outline)' };
  return (
    <svg class="load-house" viewBox="0 0 12 11" shape-rendering="crispEdges" aria-hidden="true">
      {HOUSE.flatMap((row, y) => [...row].map((c, x) => (c === '.' ? null : <rect x={x} y={y} width="1" height="1" fill={pal[c]} />)))}
    </svg>
  );
}

export function LoadingScreen() {
  const label = loading.value;
  if (label == null) return null;
  return (
    <div class="loading" role="status" aria-live="polite">
      <div class="load-card pbox">
        <div class="load-art">
          <svg class="load-heart" viewBox="0 0 7 6" shape-rendering="crispEdges" aria-hidden="true">
            {['.hh.hh.', 'hhhhhhh', 'hhhhhhh', '.hhhhh.', '..hhh..', '...h...'].flatMap((row, y) => [...row].map((c, x) => (c === 'h' ? <rect x={x} y={y} width="1" height="1" fill="#E8506A" /> : null)))}
          </svg>
          <House />
        </div>
        <span>{label}</span>
        <div class="load-bar" aria-hidden="true"><i /></div>
      </div>
    </div>
  );
}
