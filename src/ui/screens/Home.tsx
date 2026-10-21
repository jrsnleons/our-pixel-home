// The home screen: the 3D room, the HUD, the bottom bar, and everything that pops over it.

import { useSignalEffect } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import { sfx, startMusic, stopMusic, musicPlaying, setMusicVolume } from '../../audio/audio';
import { ITEM_BY_KEY, ITEMS } from '../../data/catalog';
import { prewarmThumbs } from '../thumbs';
import { INTERACTION_BY_ID } from '../../data/interactions';
import { isJob, JOBS, type JobKey } from '../../data/jobs';
import { THEMES } from '../../data/themes';
import type { Placement } from '../../core/grid';
import { layoutOf } from '../../core/layout';
import { HomeScene, type ScreenPoint, type SettleState } from '../../engine/scene';
import type { LocalBackend } from '../../net/local';
import type { GameKind, LiveMsg } from '../../net/types';
import { loadLast, saveLast } from '../../state/resume';
import { act, backend, coins, couple, day, markFeedSeen, partner, partnerLastSeen, partnerOnline, prefs, sheet, snap, toast, tourReplay, unseen, type Sheet } from '../../state/store';
import { Coin, Icon } from '../kit';
import { FurnitureBubble, MeBubble, PartnerBubble } from '../overlays/Bubbles';
import { Tour } from '../overlays/Tour';
import { InstallNudge } from '../overlays/Install';
import { InteractionWheel } from '../overlays/Wheel';
import { Decorate } from '../panels/Decorate';
import { Notes, type NotesTab } from '../panels/Notes';
import { Me } from '../panels/Me';
import { Store } from '../panels/Store';
import { savedShift, Work } from '../panels/Work';
import { deliverShiftMsg } from '../jobs/common';
import { OutfitGift, Wardrobe } from '../panels/Wardrobe';
import { GameSheet } from '../games/GameSheet';
import { Celebrate, Feed, ItemSheet, Quests, SinceDate, todaysMilestone, type ItemSheetKind } from '../panels/Small';

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
  const [invite, setInvite] = useState<{ kind: GameKind | 'shift'; ref?: string; job?: JobKey } | null>(null);
  const [notesTab, setNotesTab] = useState<NotesTab>('notebooks');
  const [itemSheet, setItemSheet] = useState<{ kind: ItemSheetKind; p: Placement } | null>(null);
  const [music, setMusic] = useState(musicPlaying());
  const [feedOpen, setFeedOpen] = useState(false);
  const [sinceLater, setSinceLater] = useState(false);
  const [celebrate, setCelebrate] = useState<{ label: string; day: string } | null>(null);
  const [tourDoneHere, setTourDoneHere] = useState(() => { try { return localStorage.getItem('oph.tour') === '1'; } catch { return false; } });

  // Where each of us is sitting or lying, if anywhere, for saving and for a partner who joins.
  const mySettled = useRef<SettleState | null>(null);
  const partnerSettled = useRef<SettleState | null>(null);

  // ---------- create the scene ----------
  useEffect(() => {
    const s0 = snap.value!;
    const last = loadLast(s0.couple!.id);
    const canvas = document.createElement('canvas');
    host.current!.appendChild(canvas);
    const T = THEMES[prefs.value.theme];
    const st = s0.couple!.style;
    const sc = new HomeScene(canvas, prefs.value.theme, { wallpaper: st.wallpaper, wallTint: st.wallTint || T.wall.tint, floor: st.floor, floorTint: st.floorTint, curtains: s0.unlocks.includes('up_curtains') }, { me: s0.me.look, partner: s0.partner?.look ?? s0.me.look }, {
      tapFurniture: (p, at) => { sfx('tap'); setBubble({ kind: 'furniture', p, at }); },
      tapPartner: (at) => { if (!snap.value?.partner) return; sfx('tap'); setBubble({ kind: 'partner', at }); },
      tapMe: (at) => { sfx('tap'); setBubble({ kind: 'me', at }); },
      tapEmpty: () => { setBubble(null); },
      walked: (from, path) => { mySettled.current = null; backend.send({ t: 'walk', from, path }); },
      settled: (state) => { mySettled.current = state; backend.send({ t: 'settle', state }); },
      decorTap: (p) => decorTapRef.current?.(p),
      placingChanged: (s) => placingRef.current?.(s),
    }, layoutOf(s0.couple!.home));
    sceneRef = sc;
    sc.sync(s0.placements);
    sc.partner.group.visible = !!s0.partner;
    // Back where we were when the app was last open (or the middle of the room the first time).
    sc.placeActors(last?.me.tile ?? { x: 3, y: 4 }, last?.partner?.tile ?? { x: 4, y: 4 });
    if (last?.me.settle && sc.restoreSettle('me', last.me.settle)) mySettled.current = last.me.settle;
    if (last?.partner?.settle && sc.restoreSettle('partner', last.partner.settle)) partnerSettled.current = last.partner.settle;
    backend.send({ t: 'settle', state: sc.mySettleState(mySettled.current) });
    sc.setPartnerOnline(partnerOnline.value);
    const fit = () => { const r = host.current!.getBoundingClientRect(); sc.resize(r.width, r.height); };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(host.current!);
    sc.start();
    setScene(sc);
    // Reopen what was open: a solo shift in progress first, otherwise the last sheet.
    if (savedShift()) sheet.value = 'work';
    else if (last?.sheet && last.sheet !== 'decorate') sheet.value = last.sheet;
    if (last?.notesTab) setNotesTab(last.notesTab as NotesTab);
    // Music needs a tap before the phone lets it play.
    if (last?.music) {
      const resumeMusic = () => { if (!musicPlaying()) { startMusic(0); setMusic(true); } };
      window.addEventListener('pointerdown', resumeMusic, { once: true });
    }
    return () => { ro.disconnect(); sc.destroy(); canvas.remove(); sceneRef = null; };
  }, []);

  // Save where we are whenever the app is hidden or closed, and every few seconds besides.
  useEffect(() => {
    if (!scene) return;
    const persist = () => saveLast({
      couple: snap.value!.couple!.id,
      me: { tile: scene.me.tile, settle: mySettled.current },
      partner: snap.value?.partner ? { tile: scene.partner.tile, settle: partnerSettled.current } : undefined,
      sheet: sheet.value, notesTab: notesTabRef.current, music: musicPlaying(),
    });
    const hidden = () => { if (document.visibilityState === 'hidden') persist(); };
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('pagehide', persist);
    const t = setInterval(persist, 4000);
    return () => { document.removeEventListener('visibilitychange', hidden); window.removeEventListener('pagehide', persist); clearInterval(t); persist(); };
  }, [scene]);
  const notesTabRef = useRef(notesTab);
  notesTabRef.current = notesTab;

  const decorTapRef = useRef<((p: Placement | null) => void) | null>(null);
  const placingRef = useRef<((s: ReturnType<HomeScene['placingState']>) => void) | null>(null);

  // ---------- keep the scene in sync with data ----------
  useSignalEffect(() => {
    const s = snap.value;
    if (!scene || !s?.couple) return;
    scene.setLayout(layoutOf(s.couple.home));
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
    if (!on) partnerSettled.current = null;
    // Tell a partner who just came in where I am, so their phone doesn't show me by the door.
    if (on) backend.send({ t: 'settle', state: scene.mySettleState(mySettled.current) });
    if (on && (backend as LocalBackend).syncPartnerTile) (backend as LocalBackend).syncPartnerTile(scene.partner.tile);
  });

  // Live messages from the partner's phone.
  useEffect(() => {
    if (!scene) return;
    liveHandler = (m: LiveMsg) => {
      const pName = partner.value?.name ?? 'Your partner';
      switch (m.t) {
        case 'walk': partnerSettled.current = null; scene.remoteWalk(m.from, m.path); break;
        case 'settle': partnerSettled.current = m.state && m.state.pose !== 'stand' ? m.state : null; scene.remoteSettle(m.state); break;
        case 'interact': {
          scene.playInteraction(m.play, false);
          const d = INTERACTION_BY_ID[m.play.id];
          if (d) toast(`${pName} ${d.away}`, 'love');
          break;
        }
        case 'heart': scene.spawn('heart', 'partner', 3); sfx('heart'); toast(`${pName} is thinking of you`, 'love'); break;
        case 'lamp': if (scene.isLampOn(m.id) !== m.on) scene.toggleLamp(m.id); break;
        case 'music': if (m.on) { startMusic(m.track); setMusic(true); } else { stopMusic(); setMusic(false); } break;
        case 'invite': setInvite({ kind: (m.what === 'shift' ? 'shift' : m.kind ?? 'connect4') as GameKind | 'shift', ref: m.ref, job: isJob(m.job) ? m.job : 'cafe' }); sfx('bell'); break;
        case 'stroke': case 'clear': strokeHandler?.(m); break;
        case 'cafe': deliverShiftMsg(m); break;
        case 'decor': break;
      }
    };
    return () => { liveHandler = null; };
  }, [scene]);

  // Draw the box and Store pictures while the phone is idle, so those sheets open instantly.
  useEffect(() => {
    const t = setTimeout(() => {
      const s = snap.value;
      if (!s) return;
      const owned = s.inventory.map((r) => r.item);
      const shop = ITEMS.filter((i) => i.kind === 'floor-item' || i.kind === 'wall-item').map((i) => i.key);
      prewarmThumbs([...new Set([...owned, ...shop])], prefs.value.theme);
    }, 2500);
    return () => clearTimeout(t);
  }, []);

  // Daily visit reward, together-time ticks.
  useEffect(() => {
    const t0 = setTimeout(() => { void act('claim_daily', { partnerOnline: partnerOnline.value }).then((r) => { const lines = (r as { lines?: string[] } | undefined)?.lines; if (lines?.length) sfx('coin'); }); }, 1800);
    const t1 = setInterval(() => { if (partnerOnline.value && document.visibilityState === 'visible') void act('together_tick', {}); }, 60_000);
    return () => { clearTimeout(t0); clearInterval(t1); };
  }, []);

  // Monthsary, hundredth day or anniversary: a celebration once per day.
  useEffect(() => {
    const t = setTimeout(() => {
      const ms = todaysMilestone();
      if (!ms) return;
      setCelebrate(ms);
      sfx('win');
      sceneRef?.spawn('heart', 'me', 4);
      if (snap.value?.partner) sceneRef?.spawn('heart', 'partner', 4);
    }, 2600);
    return () => clearTimeout(t);
  }, []);

  // "While you were away" once per load.
  useEffect(() => {
    const t = setTimeout(() => { if (unseen.value.length) setFeedOpen(true); }, 900);
    return () => clearTimeout(t);
  }, []);

  const { fired: godFired, ...godHold } = useGodHold();
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
  // First visit: the together-since step (once you're paired), then the tour. Nothing else open.
  const askSince = !!s.couple?.b && !s.couple.since && !sinceLater && !sheet.value;
  const showTour = !!scene && !sheet.value && !askSince && !celebrate && !feedOpen && !game
    && (tourReplay.value || (!s.me.tourDone && !tourDoneHere));
  const finishTour = () => {
    tourReplay.value = false;
    setTourDoneHere(true);
    try { localStorage.setItem('oph.tour', '1'); } catch { /* ignore */ }
    if (!s.me.tourDone && s.couple) void act('set_profile', { tourDone: true }, { quiet: true });
  };
  const questsLeft = s.quests.filter((q) => q.done && !q.claimed).length;
  const pOnline = partnerOnline.value;

  return (
    <div class="stage-inner" style={{ position: 'absolute', inset: 0 }}>
      <div class="scene" ref={host} />

      {sheet.value !== 'decorate' && (
        <div class="hud">
          <button class="pill" {...godHold} onClick={() => { if (!godFired()) open('me'); }} aria-label="Days together">
            <Icon name="heart" size="s" />
            <span><b>Day {day.value}</b><span class="sub">together</span></span>
          </button>
          <button class="pill" onClick={() => open('store')} aria-label="Coins" data-tour="coins">
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
          onMe={() => { setBubble(null); sheet.value = 'wardrobe'; }}
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
          <span class="small center">{partner.value?.name} wants to {invite.kind === 'shift' ? `work a ${JOBS[invite.job ?? 'cafe'].name.toLowerCase()} shift together` : invite.kind === 'draw' ? 'play Draw & Guess' : `play ${invite.kind === 'connect4' ? 'Connect 4' : 'Tic-Tac-Toe'}`}</span>
          <div class="row">
            <button class="btn ghost grow" onClick={() => setInvite(null)}>Later</button>
            <button class="btn grow" onClick={() => {
              const inv = invite; setInvite(null);
              if (inv.kind === 'shift') { workJoin = inv.ref ? { id: inv.ref, job: inv.job ?? 'cafe' } : null; sheet.value = 'work'; }
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
      {sheet.value === 'wardrobe' && <Wardrobe onClose={() => open(null)} />}
      {snap.value?.me.gift && !sheet.value && !game && !showTour && <OutfitGift />}
      {sheet.value === 'quests' && <Quests onClose={() => open(null)} />}
      {feedOpen && <Feed onClose={() => { markFeedSeen(); setFeedOpen(false); }} />}
      {game && <GameSheet gameId={game.id} kind={game.kind} onClose={() => setGame(null)} />}
      {itemSheet && <ItemSheet kind={itemSheet.kind} p={itemSheet.p} onClose={() => setItemSheet(null)} />}
      {askSince && <SinceDate onDone={() => setSinceLater(true)} />}
      {celebrate && <Celebrate label={celebrate.label} day={celebrate.day} onClose={() => setCelebrate(null)} />}
      {showTour && scene && <Tour scene={scene} onDone={finishTour} />}
      {!showTour && !sheet.value && !game && !askSince && !feedOpen && (s.me.tourDone || tourDoneHere) && <InstallNudge />}

      {sheet.value !== 'decorate' && (
        <nav class="bottombar">
          {([['store', 'store', 'Store'], ['work', 'work', 'Work'], ['decorate', 'decorate', 'Decorate'], ['notes', 'notes', 'Notes'], ['me', 'me', 'Me']] as const).map(([k, icon, label]) => (
            <button class="navbtn" aria-pressed={sheet.value === k} onClick={() => open(k)} data-tour={k}>
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

// Live message hooks for sheets that need them (drawing; jobs use src/ui/jobs/common.tsx).
let liveHandler: ((m: LiveMsg) => void) | null = null;
export function deliverLive(m: LiveMsg) { liveHandler?.(m); }
let strokeHandler: ((m: LiveMsg) => void) | null = null;
export function onStrokes(fn: ((m: LiveMsg) => void) | null) { strokeHandler = fn; }
let workJoin: { id: string; job: JobKey } | null = null;
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

/**
 * Test mode, hidden: hold the "Day N together" chip for three seconds and enter the code. The
 * server only accepts its own secret code, so the button does nothing for anyone without it.
 */
function useGodHold() {
  const timer = useRef(0);
  const fired = useRef(false);
  const cancel = () => { window.clearTimeout(timer.current); };
  const unlock = async () => {
    fired.current = true;
    sfx('pop');
    const code = window.prompt('Test mode code');
    if (!code) return;
    const r = (await act('god_mode', { code })) as { coins: number } | undefined;
    if (r) { sfx('win'); toast(`Test mode on: +${r.coins.toLocaleString()} coins, every outfit and every job.`, 'love'); }
  };
  return {
    onPointerDown: () => { fired.current = false; cancel(); timer.current = window.setTimeout(unlock, 3000); },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onContextMenu: (e: Event) => e.preventDefault(),
    /** True once after a hold opened the prompt, so that press doesn't also open the panel. */
    fired: () => { const f = fired.current; fired.current = false; return f; },
  };
}
