// The home screen: the 3D room, the HUD, the bottom bar, and everything that pops over it.

import { useSignalEffect } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import { sfx, startMusic, stopMusic, musicPlaying, setMusicVolume } from '../../audio/audio';
import { ITEM_BY_KEY } from '../../data/catalog';
import { INTERACTION_BY_ID } from '../../data/interactions';
import { THEMES } from '../../data/themes';
import type { Placement } from '../../core/grid';
import { HomeScene, type ScreenPoint } from '../../engine/scene';
import type { LocalBackend } from '../../net/local';
import type { GameKind, LiveMsg } from '../../net/types';
import { act, backend, coins, couple, day, markFeedSeen, partner, partnerLastSeen, partnerOnline, prefs, sheet, snap, toast, unseen, type Sheet } from '../../state/store';
import { Coin, Icon } from '../kit';
import { FurnitureBubble, MeBubble, PartnerBubble } from '../overlays/Bubbles';
import { InteractionWheel } from '../overlays/Wheel';
import { Decorate } from '../panels/Decorate';
import { Notes, type NotesTab } from '../panels/Notes';
import { Me } from '../panels/Me';
import { Store } from '../panels/Store';
import { Work } from '../panels/Work';
import { GameSheet } from '../games/GameSheet';
import { Feed, ItemSheet, Quests, SinceDate, type ItemSheetKind } from '../panels/Small';

export let sceneRef: HomeScene | null = null;

type Bubble =
  | { kind: 'furniture'; p: Placement; at: ScreenPoint }
  | { kind: 'partner'; at: ScreenPoint }
  | { kind: 'me'; at: ScreenPoint }
  | null;

export function Home() {
  const host = useRef<HTMLDivElement>(null);
  const [scene, setScene] = useState<HomeScene | null>(null);
  const [bubble, setBubble] = useState<Bubble>(null);
  const [wheel, setWheel] = useState(false);
  const [game, setGame] = useState<{ id: string | null; kind: GameKind } | null>(null);
  const [invite, setInvite] = useState<{ kind: GameKind | 'shift'; ref?: string } | null>(null);
  const [notesTab, setNotesTab] = useState<NotesTab>('notebooks');
  const [itemSheet, setItemSheet] = useState<{ kind: ItemSheetKind; p: Placement } | null>(null);
  const [music, setMusic] = useState(musicPlaying());
  const [feedOpen, setFeedOpen] = useState(false);

  // ---------- create the scene ----------
  useEffect(() => {
    const s0 = snap.value!;
    const canvas = document.createElement('canvas');
    host.current!.appendChild(canvas);
    const T = THEMES[prefs.value.theme];
    const st = s0.couple!.style;
    const sc = new HomeScene(canvas, prefs.value.theme, { wallpaper: st.wallpaper, wallTint: st.wallTint || T.wall.tint, floor: st.floor, floorTint: st.floorTint, curtains: s0.unlocks.includes('up_curtains') }, { me: s0.me.look, partner: s0.partner?.look ?? s0.me.look }, {
      tapFurniture: (p, at) => { sfx('tap'); setBubble({ kind: 'furniture', p, at }); },
      tapPartner: (at) => { if (!snap.value?.partner) return; sfx('tap'); setBubble({ kind: 'partner', at }); },
      tapMe: (at) => { sfx('tap'); setBubble({ kind: 'me', at }); },
      tapEmpty: () => { setBubble(null); },
      walked: (from, path) => backend.send({ t: 'walk', from, path }),
      settled: (state) => backend.send({ t: 'settle', state }),
      decorTap: (p) => decorTapRef.current?.(p),
      placingChanged: (s) => placingRef.current?.(s),
    });
    sceneRef = sc;
    sc.sync(s0.placements);
    sc.partner.group.visible = !!s0.partner;
    sc.placeActors({ x: 3, y: 4 }, { x: 4, y: 4 });
    sc.setPartnerOnline(partnerOnline.value);
    const fit = () => { const r = host.current!.getBoundingClientRect(); sc.resize(r.width, r.height); };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(host.current!);
    sc.start();
    setScene(sc);
    return () => { ro.disconnect(); sc.destroy(); canvas.remove(); sceneRef = null; };
  }, []);

  const decorTapRef = useRef<((p: Placement | null) => void) | null>(null);
  const placingRef = useRef<((s: ReturnType<HomeScene['placingState']>) => void) | null>(null);

  // ---------- keep the scene in sync with data ----------
  useSignalEffect(() => {
    const s = snap.value;
    if (!scene || !s?.couple) return;
    scene.sync(s.placements);
    scene.partner.group.visible = !!s.partner;
    const T = THEMES[prefs.value.theme];
    const st = s.couple.style;
    scene.setStyle({ wallpaper: st.wallpaper, wallTint: st.wallTint || T.wall.tint, floor: st.floor, floorTint: st.floorTint, curtains: s.unlocks.includes('up_curtains') });
    scene.setLooks(s.me.look, s.partner?.look ?? s.me.look);
  });

  useSignalEffect(() => { scene?.setTheme(prefs.value.theme); });
  useSignalEffect(() => {
    if (!scene) return;
    scene.r.effectsWanted = prefs.value.effects;
    scene.r.batterySaver = prefs.value.battery;
    setMusicVolume(prefs.value.music);
  });

  // Wall decor context: partner clock, visit countdown, corkboard notes.
  useSignalEffect(() => {
    const s = snap.value;
    if (!scene || !s) return;
    const offset = s.partner ? tzOffsetMinutes(s.partner.tz) - tzOffsetMinutes(s.me.tz) : 0;
    const next = s.couple?.nextVisit;
    const daysToVisit = next ? Math.ceil((Date.parse(next + 'T00:00:00') - Date.now()) / 86_400_000) : null;
    const notes = [
      ...s.prayers.filter((p) => !p.answeredAt).slice(-2).map((p) => ({ text: p.text, kind: 'prayer' as const, at: p.createdAt })),
      ...s.pages.slice(-3).map((p) => ({ text: p.title || p.body, kind: 'note' as const, at: p.createdAt })),
    ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 4).map(({ text, kind }) => ({ text, kind }));
    scene.setWallContext({ partnerOffsetMin: offset, myLabel: s.me.city ?? 'ME', partnerLabel: s.partner?.city ?? s.partner?.name ?? '', daysToVisit, visitDate: next ?? null, notes });
  });

  // Photos in frames.
  useSignalEffect(() => {
    const s = snap.value;
    if (!scene || !s) return;
    for (const p of s.placements) {
      const path = (p.data as { photo?: string } | null)?.photo;
      if (!path) continue;
      void backend.photoUrl(path).then((url) => {
        if (!url) return;
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => sceneRef?.setPhoto(p.id, img);
        img.src = url;
      });
    }
  });

  // Presence: an offline partner sleeps; coming online wakes them.
  useSignalEffect(() => {
    const on = partnerOnline.value;
    if (!scene) return;
    scene.setPartnerOnline(on, { wake: true });
    if (on && (backend as LocalBackend).syncPartnerTile) (backend as LocalBackend).syncPartnerTile(scene.partner.tile);
  });

  // Live messages from the partner's phone.
  useEffect(() => {
    if (!scene) return;
    liveHandler = (m: LiveMsg) => {
      const pName = partner.value?.name ?? 'Your partner';
      switch (m.t) {
        case 'walk': scene.remoteWalk(m.from, m.path); break;
        case 'settle': scene.remoteSettle(m.state); break;
        case 'interact': {
          scene.playInteraction(m.play, false);
          const d = INTERACTION_BY_ID[m.play.id];
          if (d) toast(`${pName} ${d.away}`, 'love');
          break;
        }
        case 'heart': scene.spawn('heart', 'partner', 3); sfx('heart'); toast(`${pName} is thinking of you`, 'love'); break;
        case 'lamp': if (scene.isLampOn(m.id) !== m.on) scene.toggleLamp(m.id); break;
        case 'music': if (m.on) { startMusic(m.track); setMusic(true); } else { stopMusic(); setMusic(false); } break;
        case 'invite': setInvite({ kind: (m.what === 'shift' ? 'shift' : m.kind ?? 'connect4') as GameKind | 'shift', ref: m.ref }); sfx('bell'); break;
        case 'stroke': case 'clear': strokeHandler?.(m); break;
        case 'cafe': cafeHandler?.(m); break;
        case 'decor': break;
      }
    };
    return () => { liveHandler = null; };
  }, [scene]);

  // Daily visit reward, together-time ticks.
  useEffect(() => {
    const t0 = setTimeout(() => { void act('claim_daily', { partnerOnline: partnerOnline.value }).then((r) => { const lines = (r as { lines?: string[] } | undefined)?.lines; if (lines?.length) sfx('coin'); }); }, 1800);
    const t1 = setInterval(() => { if (partnerOnline.value && document.visibilityState === 'visible') void act('together_tick', {}); }, 60_000);
    return () => { clearTimeout(t0); clearInterval(t1); };
  }, []);

  // "While you were away" once per load.
  useEffect(() => {
    const t = setTimeout(() => { if (unseen.value.length) setFeedOpen(true); }, 900);
    return () => clearTimeout(t);
  }, []);

  const open = (s: Sheet) => { setBubble(null); sfx(s ? 'open' : 'close'); sheet.value = sheet.value === s ? null : s; };

  const startGame = async (kind: GameKind, p?: Placement) => {
    setBubble(null);
    if (!partner.value) { toast('Games need your partner. Send them your code first.', 'error'); return; }
    if (!partnerOnline.value) { toast(`${partner.value.name} is asleep. Games are for when you’re both here.`, 'error'); return; }
    if (p && scene) await scene.bothUse(p, kind === 'draw' ? 'draw' : 'play', true);
    const id = (await act('game_start', { kind })) as string | undefined;
    if (!id) return;
    backend.send({ t: 'invite', what: kind === 'draw' ? 'draw' : 'play', kind, ref: id });
    setGame({ id, kind });
  };

  const s = snap.value!;
  const unseenCount = unseen.value.length;
  const questsLeft = s.quests.filter((q) => q.done && !q.claimed).length;
  const pOnline = partnerOnline.value;

  return (
    <div class="stage-inner" style={{ position: 'absolute', inset: 0 }}>
      <div class="scene" ref={host} />

      {sheet.value !== 'decorate' && (
        <div class="hud">
          <button class="pill" onClick={() => open('me')} aria-label="Days together">
            <Icon name="heart" size="s" />
            <span><b>Day {day.value}</b><span class="sub">together</span></span>
          </button>
          <button class="pill" onClick={() => open('store')} aria-label="Coins">
            <Coin n={coins.value.toLocaleString()} />
          </button>
          <div class="grow" />
          {s.quests.some((q) => !q.claimed) && (
            <button class="pill" onClick={() => open('quests')} aria-label="Starter quests" style={{ position: 'relative' }}>
              <Icon name="star" size="s" />{questsLeft > 0 && <span class="badge">{questsLeft}</span>}
            </button>
          )}
          <button class="pill" onClick={() => setFeedOpen(true)} aria-label="Partner" style={{ position: 'relative' }}>
            <span class={`dot ${pOnline ? 'on' : ''}`} />
            <span style={{ maxWidth: '78px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{partner.value?.name ?? 'Invite'}</span>
            {unseenCount > 0 && <span class="badge">{unseenCount}</span>}
          </button>
        </div>
      )}

      {bubble?.kind === 'furniture' && scene && (
        <FurnitureBubble p={bubble.p} at={bubble.at} scene={scene} music={music}
          onClose={() => setBubble(null)}
          onGame={(k) => void startGame(k, bubble.p)}
          onNotes={(tab) => { setBubble(null); setNotesTab(tab); sheet.value = 'notes'; }}
          onSheet={(kind) => { setBubble(null); setItemSheet({ kind, p: bubble.p }); }}
          onMe={() => { setBubble(null); sheet.value = 'me'; }}
          onMusic={(on) => { setMusic(on); }}
        />
      )}
      {bubble?.kind === 'partner' && scene && (
        <PartnerBubble at={bubble.at} online={pOnline} lastSeen={partnerLastSeen.value} name={partner.value?.name ?? ''}
          onHeart={async () => {
            setBubble(null);
            scene.spawn('heart', 'partner', 3); sfx('heart');
            backend.send({ t: 'heart' });
            await act('heart', {});
          }}
          onWheel={() => { setBubble(null); setWheel(true); }}
          onClose={() => setBubble(null)}
        />
      )}
      {bubble?.kind === 'me' && scene && <MeBubble at={bubble.at} scene={scene} onClose={() => setBubble(null)} />}

      {wheel && scene && (
        <InteractionWheel onClose={() => setWheel(false)} onPick={async (id) => {
          setWheel(false);
          const play = await scene.startInteraction(id);
          if (!play) { toast('Couldn’t do that here. Try somewhere with more room.', 'error'); return; }
          backend.send({ t: 'interact', play });
          sfx('heart');
          await act('interaction', { id }, { quiet: true });
        }} />
      )}

      {invite && (
        <div class="bubble" style={{ left: '50%', top: '30%', transform: 'translate(-50%, 0)', flexDirection: 'column', alignItems: 'stretch', maxWidth: '86%' }}>
          <span class="small center">{partner.value?.name} wants to {invite.kind === 'shift' ? 'work a café shift together' : invite.kind === 'draw' ? 'play Draw & Guess' : `play ${invite.kind === 'connect4' ? 'Connect 4' : 'Tic-Tac-Toe'}`}</span>
          <div class="row">
            <button class="btn ghost grow" onClick={() => setInvite(null)}>Later</button>
            <button class="btn grow" onClick={() => {
              const inv = invite; setInvite(null);
              if (inv.kind === 'shift') { workJoin = inv.ref ?? null; sheet.value = 'work'; }
              else setGame({ id: inv.ref ?? null, kind: inv.kind });
            }}>Join</button>
          </div>
        </div>
      )}

      {sheet.value === 'store' && <Store onClose={() => open(null)} />}
      {sheet.value === 'work' && <Work onClose={() => open(null)} joinShift={takeWorkJoin()} />}
      {sheet.value === 'decorate' && scene && <Decorate scene={scene} onClose={() => open(null)} bind={(d, p) => { decorTapRef.current = d; placingRef.current = p; }} />}
      {sheet.value === 'notes' && <Notes onClose={() => open(null)} tab={notesTab} setTab={setNotesTab} />}
      {sheet.value === 'me' && <Me onClose={() => open(null)} />}
      {sheet.value === 'quests' && <Quests onClose={() => open(null)} />}
      {feedOpen && <Feed onClose={() => { markFeedSeen(); setFeedOpen(false); }} />}
      {game && <GameSheet gameId={game.id} kind={game.kind} onClose={() => setGame(null)} />}
      {itemSheet && <ItemSheet kind={itemSheet.kind} p={itemSheet.p} onClose={() => setItemSheet(null)} />}
      {s.couple?.b && !s.couple.since && !sheet.value && <SinceDate />}

      {sheet.value !== 'decorate' && (
        <nav class="bottombar">
          {([['store', 'store', 'Store'], ['work', 'work', 'Work'], ['decorate', 'decorate', 'Decorate'], ['notes', 'notes', 'Notes'], ['me', 'me', 'Me']] as const).map(([k, icon, label]) => (
            <button class="navbtn" aria-pressed={sheet.value === k} onClick={() => open(k)}>
              <Icon name={icon} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      )}
      {couple.value && !couple.value.b && sheet.value == null && (
        <div class="toasts" style={{ top: 'auto', bottom: 'calc(var(--safe-b) + 84px)' }}>
          <div class="toast" style={{ pointerEvents: 'auto' }}>Code for your partner: <b style={{ userSelect: 'text' }}>{couple.value.inviteCode}</b></div>
        </div>
      )}
    </div>
  );
}

// Live message hooks for sheets that need them (drawing, café).
let liveHandler: ((m: LiveMsg) => void) | null = null;
export function deliverLive(m: LiveMsg) { liveHandler?.(m); }
let strokeHandler: ((m: LiveMsg) => void) | null = null;
export function onStrokes(fn: ((m: LiveMsg) => void) | null) { strokeHandler = fn; }
let cafeHandler: ((m: LiveMsg) => void) | null = null;
export function onCafe(fn: ((m: LiveMsg) => void) | null) { cafeHandler = fn; }
let workJoin: string | null = null;
function takeWorkJoin() { const j = workJoin; workJoin = null; return j; }

/** Minutes ahead of UTC for a time zone right now. */
export function tzOffsetMinutes(tz: string): number {
  try {
    const d = new Date();
    const local = new Date(d.toLocaleString('en-US', { timeZone: tz }));
    const utc = new Date(d.toLocaleString('en-US', { timeZone: 'UTC' }));
    return Math.round((local.getTime() - utc.getTime()) / 60000);
  } catch { return 0; }
}

export function itemDef(p: Placement) { return ITEM_BY_KEY[p.item]!; }
