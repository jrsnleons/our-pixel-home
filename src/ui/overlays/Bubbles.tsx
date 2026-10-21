// Speech-bubble menus that pop over furniture, your partner, or yourself.

import { useEffect, useRef, useState } from 'preact/hooks';
import { sfx, startMusic, stopMusic } from '../../audio/audio';
import type { Placement } from '../../core/grid';
import { ITEM_BY_KEY } from '../../data/catalog';
import type { Hold, HoldMode } from '../../engine/area';
import type { HomeScene, ScreenPoint } from '../../engine/scene';
import type { GameKind } from '../../net/types';
import { act, ago, backend, partner, partnerOnline, toast } from '../../state/store';
import { Icon } from '../kit';
import type { NotesTab } from '../panels/Notes';
import type { ItemSheetKind } from '../panels/Small';

function place(at: ScreenPoint) {
  // Keep bubbles on screen: clamp to the stage, flip below when too close to the top.
  const stage = document.querySelector('.stage')!.getBoundingClientRect();
  const x = Math.max(stage.left + 90, Math.min(stage.right - 90, at.x)) - stage.left;
  const y = Math.max(stage.top + 130, at.y) - stage.top;
  return { left: `${x}px`, top: `${y}px` };
}

/**
 * A bubble belongs to someone or something, so it rides along: walking people, a panning or
 * zooming camera and a changing view all move it, instead of leaving it hanging where it opened.
 */
function useFollow(at: ScreenPoint) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!at.track) return;
    let raf = 0;
    let last = '';
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const p = at.track!();
      const node = el.current;
      if (!p || !node || !document.querySelector('.stage')) return;
      const pos = place(p);
      const k = pos.left + pos.top;
      if (k === last) return;
      last = k;
      node.style.left = pos.left;
      node.style.top = pos.top;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [at]);
  return el;
}

interface Act { label: string; icon?: string; run: () => void; primary?: boolean }

export function FurnitureBubble(props: {
  p: Placement; at: ScreenPoint; scene: HomeScene; music: boolean;
  onClose: () => void; onTogether: (id: string) => void; onGame: (k: GameKind) => void; onNotes: (tab: NotesTab) => void; onSheet: (k: ItemSheetKind) => void; onMe: () => void; onMusic: (on: boolean) => void;
}) {
  const { p, scene } = props;
  const def = ITEM_BY_KEY[p.item]!;
  const [step, setStep] = useState<'main' | 'games'>('main');
  const acts: Act[] = [];
  const use = (a: 'sit' | 'sleep') => async () => {
    props.onClose();
    const ok = await scene.useFurniture(p, a);
    if (!ok) toast('Can’t reach that spot right now.', 'error');
  };

  if (def.category === 'lighting') {
    const on = scene.isLampOn(p.id);
    acts.push({ label: on ? 'Turn off' : 'Turn on', icon: on ? 'moon' : 'sun', primary: true, run: () => { scene.toggleLamp(p.id); sfx('tap'); backend.send({ t: 'lamp', id: p.id, on: !on }); props.onClose(); } });
  }
  // Beds and sofas wide enough for two: lie down or sit down together in one tap.
  const roomForTwo = (def.size?.[0] ?? 1) >= 2 && !!partner.value && p.surface === 'floor';
  if (roomForTwo && def.category === 'bed') acts.push({ label: 'Sleep together', icon: 'heart', primary: true, run: () => { props.onClose(); props.onTogether('nap_together'); } });
  else if (roomForTwo && def.category === 'seating') acts.push({ label: 'Sit together', icon: 'heart', primary: true, run: () => { props.onClose(); props.onTogether('sit_together'); } });
  for (const a of def.actions ?? []) {
    switch (a) {
      case 'sit': acts.push({ label: 'Sit', run: use('sit') }); break;
      case 'sleep': acts.push({ label: 'Sleep', run: use('sleep') }); break;
      case 'play': acts.push({ label: 'Play', icon: 'play', primary: true, run: () => setStep('games') }); break;
      case 'draw': acts.push({ label: 'Draw & Guess', icon: 'pencil', primary: true, run: () => props.onGame('draw') }); break;
      case 'music': acts.push({ label: props.music ? 'Stop music' : 'Play music', icon: 'music', primary: true, run: () => {
        const on = !props.music;
        if (on) startMusic(0); else stopMusic();
        backend.send({ t: 'music', on, track: 0 });
        props.onMusic(on); props.onClose();
      } }); break;
      case 'quiet': acts.push({ label: 'Quiet time', icon: 'bible', primary: true, run: () => props.onNotes('quiet') }); break;
      case 'read': acts.push({ label: 'Open the Bible', icon: 'bible', run: () => props.onNotes('quiet') }); break;
      case 'write': acts.push({ label: 'Write', icon: 'pencil', run: () => props.onNotes('notebooks') }); break;
      case 'water': acts.push({ label: 'Water', icon: 'water', primary: true, run: async () => {
        props.onClose();
        const n = await act('water', { pid: p.id });
        if (n) { sfx('pop'); scene.fx.spawn('drop', scene.me.head(), { count: 4, spread: 0.4, rise: -0.8 }); toast(Number(n) === 2 || Number(n) === 5 ? 'It grew! 🌱' : 'Watered. Come back tomorrow.'); }
      } }); break;
      case 'wardrobe': acts.push({ label: 'Change clothes', icon: 'me', run: props.onMe }); break;
      case 'photo': acts.push({ label: 'Photo', icon: 'camera', primary: true, run: () => props.onSheet('photo') }); break;
      case 'calendar': acts.push({ label: 'Next visit', icon: 'heart', primary: true, run: () => props.onSheet('calendar') }); break;
      case 'look':
        if (p.item === 'wall_corkboard') acts.push({ label: 'Read notes', icon: 'notes', run: () => props.onNotes('notebooks') });
        else if (p.item === 'wall_scripture') acts.push({ label: 'Read verse', icon: 'bible', run: () => props.onSheet('verse') });
        else if (p.item === 'wall_clock') acts.push({ label: 'Look', run: () => props.onSheet('clock') });
        else if (p.item === 'globe') acts.push({ label: 'Spin', run: () => props.onSheet('globe') });
        else acts.push({ label: 'Look', run: () => { props.onClose(); void scene.useFurniture(p, 'look'); } });
        break;
      case 'feed': acts.push({ label: 'Feed fish', run: () => { props.onClose(); scene.fx.spawn('crumb', scene.me.head(), { count: 6 }); toast('The fish say thank you.'); } }); break;
    }
  }

  const follow = useFollow(props.at);
  return (
    <div class="bubble" ref={follow} style={place(props.at)} onClick={(e) => e.stopPropagation()}>
      <span class="title">{def.name}</span>
      {step === 'main' ? (
        acts.length ? acts.map((a) => (
          <button class={`btn ${a.primary ? '' : 'soft'}`} onClick={a.run}>{a.icon && <Icon name={a.icon} size="s" />}{a.label}</button>
        )) : <span class="small" style={{ padding: '6px' }}>{def.blurb}</span>
      ) : (
        <>
          {!partnerOnline.value && <span class="small" style={{ padding: '6px', maxWidth: '200px' }}>{partner.value ? `${partner.value.name} is asleep. Games are for when you’re both here.` : 'Games need your partner.'}</span>}
          {partnerOnline.value && <>
            <button class="btn" onClick={() => props.onGame('connect4')}>Connect 4</button>
            <button class="btn" onClick={() => props.onGame('tictactoe')}>Tic-Tac-Toe</button>
          </>}
          <button class="btn soft" onClick={() => setStep('main')}><Icon name="back" size="s" /></button>
        </>
      )}
    </div>
  );
}

export function PartnerBubble(props: {
  at: ScreenPoint; online: boolean; lastSeen: string | null; name: string; onHeart: () => void; onWheel: () => void; onClose: () => void;
  /** Out in town or a shop (not home): hold hands instead of the Together wheel. */
  inArea?: boolean; holding?: boolean; onHold?: (mode: HoldMode, leader: Hold['leader']) => void; onLetGo?: () => void;
}) {
  const follow = useFollow(props.at);
  const [step, setStep] = useState<'main' | 'hold'>('main');
  return (
    <div class="bubble" ref={follow} style={place(props.at)} onClick={(e) => e.stopPropagation()}>
      <span class="title">{props.online ? props.name : `${props.name} · asleep, online ${ago(props.lastSeen)}`}</span>
      {step === 'main' ? (
        <>
          <button class="btn" onClick={props.onHeart}><Icon name="heart" size="s" />Heart</button>
          {!props.inArea && <button class="btn soft" onClick={props.onWheel}><Icon name="sparkle" size="s" />Together…</button>}
          {props.inArea && props.holding && <button class="btn soft" onClick={props.onLetGo}>Let go</button>}
          {props.inArea && !props.holding && <button class="btn soft" onClick={() => setStep('hold')}><Icon name="sparkle" size="s" />Hold hands…</button>}
        </>
      ) : (
        <>
          <button class="btn" onClick={() => props.onHold?.('side', 'either')}>Side by side</button>
          <button class="btn soft" onClick={() => props.onHold?.('follow', 'me')}>I’ll lead</button>
          <button class="btn soft" onClick={() => props.onHold?.('follow', 'partner')}>I’ll follow</button>
          <button class="btn soft" onClick={() => setStep('main')}><Icon name="back" size="s" /></button>
        </>
      )}
    </div>
  );
}

/** A townsperson or shopkeeper says something. */
export function SayBubble({ at, name, line, onClose }: { at: ScreenPoint; name: string; line: string; onClose: () => void }) {
  const follow = useFollow(at);
  return (
    <div class="bubble" ref={follow} style={{ ...place(at), flexDirection: 'column', maxWidth: '72%', width: 'max-content' }} onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <span class="title">{name}</span>
      <span class="small">{line}</span>
    </div>
  );
}

export function MeBubble({ at, scene, onClose }: { at: ScreenPoint; scene: HomeScene; onClose: () => void }) {
  const follow = useFollow(at);
  const emote = (frames: string[], fps: number, secs: number, fx?: 'heart' | 'pray' | 'note' | 'sparkle') => () => {
    onClose();
    scene.me.play({ frames, fps });
    if (fx) scene.spawn(fx, 'me', 2);
    setTimeout(() => scene.me.play(null), secs * 1000);
  };
  return (
    <div class="bubble" ref={follow} style={place(at)} onClick={(e) => e.stopPropagation()}>
      <span class="title">You</span>
      <button class="btn soft" onClick={emote(['wave1', 'wave2'], 4, 1.6)}>Wave</button>
      <button class="btn soft" onClick={emote(['cheer', 'idle'], 3, 1.6, 'sparkle')}>Cheer</button>
      <button class="btn soft" onClick={emote(['pray'], 1, 4, 'pray')}>Pray</button>
      <button class="btn soft" onClick={emote(['dance1', 'dance2'], 3, 3, 'note')}>Dance</button>
    </div>
  );
}
