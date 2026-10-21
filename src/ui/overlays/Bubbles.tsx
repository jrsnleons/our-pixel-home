// Speech-bubble menus that pop over furniture, your partner, or yourself.

import { useState } from 'preact/hooks';
import { sfx, startMusic, stopMusic } from '../../audio/audio';
import type { Placement } from '../../core/grid';
import { ITEM_BY_KEY } from '../../data/catalog';
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

interface Act { label: string; icon?: string; run: () => void; primary?: boolean }

export function FurnitureBubble(props: {
  p: Placement; at: ScreenPoint; scene: HomeScene; music: boolean;
  onClose: () => void; onGame: (k: GameKind) => void; onNotes: (tab: NotesTab) => void; onSheet: (k: ItemSheetKind) => void; onMe: () => void; onMusic: (on: boolean) => void;
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

  return (
    <div class="bubble" style={place(props.at)} onClick={(e) => e.stopPropagation()}>
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

export function PartnerBubble(props: { at: ScreenPoint; online: boolean; lastSeen: string | null; name: string; onHeart: () => void; onWheel: () => void; onClose: () => void }) {
  return (
    <div class="bubble" style={place(props.at)} onClick={(e) => e.stopPropagation()}>
      <span class="title">{props.online ? props.name : `${props.name} · asleep, online ${ago(props.lastSeen)}`}</span>
      <button class="btn" onClick={props.onHeart}><Icon name="heart" size="s" />Heart</button>
      <button class="btn soft" onClick={props.onWheel}><Icon name="sparkle" size="s" />Together…</button>
    </div>
  );
}

/** A townsperson or shopkeeper says something. */
export function SayBubble({ at, name, line, onClose }: { at: ScreenPoint; name: string; line: string; onClose: () => void }) {
  return (
    <div class="bubble" style={{ ...place(at), flexDirection: 'column', maxWidth: '72%', width: 'max-content' }} onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <span class="title">{name}</span>
      <span class="small">{line}</span>
    </div>
  );
}

export function MeBubble({ at, scene, onClose }: { at: ScreenPoint; scene: HomeScene; onClose: () => void }) {
  const emote = (frames: string[], fps: number, secs: number, fx?: 'heart' | 'pray' | 'note' | 'sparkle') => () => {
    onClose();
    scene.me.play({ frames, fps });
    if (fx) scene.spawn(fx, 'me', 2);
    setTimeout(() => scene.me.play(null), secs * 1000);
  };
  return (
    <div class="bubble" style={place(at)} onClick={(e) => e.stopPropagation()}>
      <span class="title">You</span>
      <button class="btn soft" onClick={emote(['wave1', 'wave2'], 4, 1.6)}>Wave</button>
      <button class="btn soft" onClick={emote(['cheer', 'idle'], 3, 1.6, 'sparkle')}>Cheer</button>
      <button class="btn soft" onClick={emote(['pray'], 1, 4, 'pray')}>Pray</button>
      <button class="btn soft" onClick={emote(['dance1', 'dance2'], 3, 3, 'note')}>Dance</button>
    </div>
  );
}
