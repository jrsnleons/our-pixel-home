// The home screen: the 3D room, the HUD, the bottom bar, and everything that pops over it.

import { useSignalEffect } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import { sfx, startMusic, stopMusic, musicPlaying, setMusicVolume } from '../../audio/audio';
import { ITEM_BY_KEY, ITEMS } from '../../data/catalog';
import { cachedThumb, prewarmThumbs, requestThumb } from '../thumbs';
import { INTERACTION_BY_ID } from '../../data/interactions';
import { isJob, JOBS, jobLock, type JobKey } from '../../data/jobs';
import { INTERIOR_DOOR, INTERIORS, PLACE_BY_ID, TOWN_SPAWN, type Place } from '../../data/town';
import { THEMES } from '../../data/themes';
import type { Placement, Tile } from '../../core/grid';
import { layoutOf } from '../../core/layout';
import type { AreaEvents, AreaScene, Hold, Hotspot } from '../../engine/area';
import { WEATHER_KINDS, WEATHER_LABEL, type WeatherKind } from '../../data/weather';
import type { InteriorScene } from '../../engine/interior';
import { HomeScene, type ScreenPoint, type SettleState } from '../../engine/scene';
import type { TownScene } from '../../engine/town';
import type { LocalBackend } from '../../net/local';
import type { GameKind, LiveMsg } from '../../net/types';
import { loadLast, saveLast } from '../../state/resume';
import { area, areaName, inside, insideOf, partnerArea, shopCtx, type AreaId } from '../../state/area';
import { act, backend, coins, couple, day, markFeedSeen, painted, partner, partnerLastSeen, partnerOnline, prefs, sceneCovers, setPrefs, sheet, snap, toast, tourReplay, unseen, withLoading, type Sheet } from '../../state/store';
import { Coin, Icon } from '../kit';
import { FurnitureBubble, MeBubble, PartnerBubble, SayBubble } from '../overlays/Bubbles';
import { Tour } from '../overlays/Tour';
import { InstallNudge } from '../overlays/Install';
import { InteractionWheel } from '../overlays/Wheel';
import { Decorate } from '../panels/Decorate';
import { Notes, type NotesTab } from '../panels/Notes';
import { Me } from '../panels/Me';
import { Bakery } from '../panels/Bakery';
import { Realty } from '../panels/Realty';
import { TownMap } from '../panels/TownMap';
import { Shop } from '../panels/Shop';
import { boutiqueEntries, furnitureEntries } from '../shopstock';
import { savedShift } from '../../state/shift';
import { lazy } from '../lazy';
import type { Work as WorkPanel } from '../panels/Work';
import { deliverShiftMsg } from '../jobs/common';
import { OutfitGift, Wardrobe } from '../panels/Wardrobe';
import { GameSheet } from '../games/GameSheet';
import { Celebrate, Feed, ItemSheet, Quests, SinceDate, todaysMilestone, type ItemSheetKind } from '../panels/Small';

export let sceneRef: HomeScene | null = null;

const WEATHER_ICON: Record<WeatherKind, string> = { clear: 'sun', rain: 'water', snow: 'sparkle', mist: 'moon' };

/** The job games load when a workplace is first opened. */
const Work = lazy<Parameters<typeof WorkPanel>[0]>(() => import('../panels/Work').then((m) => m.Work));

/** The town and the buildings' code, loaded the first time it's needed (it isn't, to open the home). */
let places: Promise<{ TownScene: typeof TownScene; InteriorScene: typeof InteriorScene }> | null = null;
function loadPlaces() {
  places ??= Promise.all([import('../../engine/town'), import('../../engine/interior')]).then(([t, i]) => ({ TownScene: t.TownScene, InteriorScene: i.InteriorScene }));
  places.catch(() => { places = null; });
  return places;
}

type Bubble =
  | { kind: 'furniture'; p: Placement; at: ScreenPoint }
  | { kind: 'partner'; at: ScreenPoint }
  | { kind: 'me'; at: ScreenPoint }
  | null;

export function Home() {
  const host = useRef<HTMLDivElement>(null);
  const [scene, setScene] = useState<HomeScene | null>(null);
  const [bubble, setBubble] = useState<Bubble>(null);
  const [whole, setWhole] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [district, setDistrict] = useState<{ name: string; blurb: string; k: number } | null>(null);
  useEffect(() => {
    if (!district) return;
    const t = setTimeout(() => setDistrict(null), 2900);
    return () => clearTimeout(t);
  }, [district?.k]);
  const [wheel, setWheel] = useState(false);
  const [game, setGame] = useState<{ id: string | null; kind: GameKind } | null>(null);
  const [invite, setInvite] = useState<{ kind: GameKind | 'shift'; ref?: string; job?: JobKey } | null>(null);
  const [notesTab, setNotesTab] = useState<NotesTab>('notebooks');
  const [itemSheet, setItemSheet] = useState<{ kind: ItemSheetKind; p: Placement } | null>(null);
  const [music, setMusic] = useState(musicPlaying());
  const [feedOpen, setFeedOpen] = useState(false);
  const [sinceLater, setSinceLater] = useState(false);
  const [celebrate, setCelebrate] = useState<{ label: string; day: string } | null>(null);
  const [talk, setTalk] = useState<{ name: string; line: string; at: ScreenPoint } | null>(null);
  const [holding, setHolding] = useState<Hold | null>(null);
  const [lobby, setLobby] = useState<{ place: Place; job?: JobKey } | null>(null);
  const [fade, setFade] = useState(false);
  const [tourDoneHere, setTourDoneHere] = useState(() => { try { return localStorage.getItem('oph.tour') === '1'; } catch { return false; } });

  // Where each of us is sitting or lying, if anywhere, for saving and for a partner who joins.
  const mySettled = useRef<SettleState | null>(null);
  const partnerSettled = useRef<SettleState | null>(null);

  // ---------- create the scene ----------
  // Building the room takes a moment on a phone, so it happens behind the loading screen, and
  // the room's shaders are compiled and its first frames drawn before the screen lifts.
  useEffect(() => {
    let built: { sc: HomeScene; ro: ResizeObserver; canvas: HTMLCanvasElement } | null = null;
    let gone = false;
    void withLoading('Coming home…', async () => {
      if (gone) return;
      const s0 = snap.value!;
      const last = loadLast(s0.couple!.id);
      const canvas = document.createElement('canvas');
      host.current!.appendChild(canvas);
      const T = THEMES[prefs.value.theme];
      const st = s0.couple!.style;
      const sc = new HomeScene(canvas, prefs.value.theme, { wallpaper: st.wallpaper, wallTint: st.wallTint || T.wall.tint, floor: st.floor, floorTint: st.floorTint, rooms: st.rooms, curtains: s0.unlocks.includes('up_curtains') }, { me: s0.me.look, partner: s0.partner?.look ?? s0.me.look }, {
        tapFurniture: (p, at) => { sfx('tap'); setBubble({ kind: 'furniture', p, at }); },
        tapPartner: (at) => { if (!snap.value?.partner) return; sfx('tap'); setBubble({ kind: 'partner', at }); },
        tapMe: (at) => { sfx('tap'); setBubble({ kind: 'me', at }); },
        tapEmpty: () => { setBubble(null); },
        tapDoor: () => goRef.current?.('town', 'home'),
        walked: (from, path) => { mySettled.current = null; backend.send({ t: 'walk', from, path }); },
        settled: (state) => { mySettled.current = state; backend.send({ t: 'settle', state }); },
        decorTap: (p) => decorTapRef.current?.(p),
        placingChanged: (s) => placingRef.current?.(s),
      }, layoutOf(s0.couple!.home));
      sceneRef = sc;
      if (import.meta.env.DEV) (window as unknown as { __oph: unknown }).__oph = { sc, act, areas: () => areas.current, go: (to: AreaId, from?: string) => goRef.current?.(to, from) };
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
      built = { sc, ro, canvas };
      sc.start();
      setScene(sc);
      // Reopen what was open: a solo shift in progress first, otherwise the last sheet.
      if (savedShift()) sheet.value = 'work';
      else if (last?.sheet && last.sheet !== 'decorate' && last.sheet !== 'shop' && last.sheet !== 'work' && last.sheet !== 'realty' && last.sheet !== 'bakery') sheet.value = last.sheet;
      if (last?.notesTab) setNotesTab(last.notesTab as NotesTab);
      // Music needs a tap before the phone lets it play.
      if (last?.music) {
        const resumeMusic = () => { if (!musicPlaying()) { startMusic(0); setMusic(true); } };
        window.addEventListener('pointerdown', resumeMusic, { once: true });
      }
      await sc.r.compile(sc.r.scene, sc.r.scene).catch(() => {});
      await painted();
    });
    return () => {
      gone = true;
      if (built) { built.ro.disconnect(); built.sc.destroy(); built.canvas.remove(); }
      sceneRef = null;
    };
  }, []);

  // ---------- walking between home, the street and the buildings ----------
  const areas = useRef<{ town: TownScene | null; ins: Map<string, InteriorScene>; active: AreaScene | null; busy: boolean }>({ town: null, ins: new Map(), active: null, busy: false });
  const goRef = useRef<((to: AreaId, from?: string) => void) | null>(null);
  const uiRef = useRef<{ hotspot: (h: Hotspot) => void; npc: (id: string, at: ScreenPoint) => void; partner: (at: ScreenPoint) => void }>({ hotspot: () => {}, npc: () => {}, partner: () => {} });
  const areaEvents: AreaEvents = {
    hotspot: (h) => uiRef.current.hotspot(h),
    tapNpc: (id, at) => uiRef.current.npc(id, at),
    tapPartner: (at) => uiRef.current.partner(at),
    walked: (from, path, follow) => backend.send({ t: 'walk', from, path, ...(follow ? { hold: 1 as const } : {}) }),
    settled: (state) => backend.send({ t: 'settle', state }),
    hold: (h, send) => {
      setHolding(h);
      if (send) backend.send({ t: 'hold', mode: h?.mode ?? null, leader: h ? (h.leader === 'me' ? 'sender' : h.leader === 'partner' ? 'receiver' : 'either') : undefined });
    },
    tapEmpty: () => { setTalk(null); setBubble(null); },
    district: (d) => setDistrict({ ...d, k: Date.now() }),
  };
  const looksNow = () => { const st = snap.value!; return { me: st.me.look, partner: st.partner?.look ?? st.me.look }; };
  const lockedPlaces = () => new Set(Object.values(PLACE_BY_ID).filter((p) => p.jobs && p.jobs.every((j) => jobLock(snap.value?.me, j))).map((p) => p.id));
  const getTown = async () => {
    const a = areas.current;
    if (!a.town) { const { TownScene } = await loadPlaces(); a.town = new TownScene(sceneRef!.r, prefs.value.theme, looksNow(), areaEvents); a.town.setLocked(lockedPlaces()); a.town.setTownView(prefs.value.townView); a.town.setWeatherPref(prefs.value.weather); }
    return a.town;
  };
  const getInside = async (id: string) => {
    const a = areas.current;
    let i = a.ins.get(id);
    if (!i) { const { InteriorScene } = await loadPlaces(); i = new InteriorScene(sceneRef!.r, prefs.value.theme, INTERIORS[id], looksNow(), areaEvents); a.ins.set(id, i); }
    return i;
  };
  const here = (): AreaScene | null => areas.current.active;

  /** Put this week's stock on the display row of the shop I'm in (or standing in front of, for the first look). */
  const stockShop = (placeId: string | null) => {
    const st = snap.value;
    if (!st || (placeId !== 'maple' && placeId !== 'boutique')) return;
    const sc = areas.current.ins.get(placeId);
    if (!sc) return;
    const now = new Date();
    sc.setStock(placeId === 'maple'
      ? furnitureEntries(now, { unlocks: st.unlocks, inventory: st.inventory, placements: st.placements })
      : boutiqueEntries(now, st.unlocks, { me: st.me.look, partner: st.partner?.look ?? null }));
  };

  /** Show my partner in whatever place I'm in, if they are in it too (and online). */
  const showPartner = (at?: Tile) => {
    const s = snap.value;
    const together = !!s?.partner && partnerOnline.value && partnerArea.value === area.value;
    if (area.value === 'home') {
      if (sceneRef) sceneRef.partner.group.visible = !!s?.partner && (partnerArea.value === 'home' || !partnerOnline.value);
    } else here()?.setPartnerHere(together, at ?? undefined);
  };

  goRef.current = (to, from) => {
    const sc = sceneRef;
    const a = areas.current;
    if (!sc || a.busy || to === area.value) return;
    a.busy = true;
    setBubble(null); setTalk(null); setWheel(false); setMapOpen(false); setDistrict(null);
    setFade(true);
    setTimeout(async () => {
      const prev = a.active;
      if (area.value === 'home') sc.pause(); else prev?.pause();
      let at: Tile;
      // A place visited for the first time is built, its shaders compiled and its first frames
      // drawn behind the loading screen, so the fade never opens on a frozen picture.
      const arrive = async (fresh: boolean, label: string, enter: () => Promise<AreaScene>) => {
        if (!fresh) { (await enter()).start(); return; }
        await withLoading(label, async () => {
          const sceneHere = await enter();
          sceneHere.start();
          await sc.r.compile(sceneHere.scene, sceneHere.scene).catch(() => {});
          await painted();
        });
      };
      try {
        if (to === 'home') {
          a.active = null;
          sc.resume();
          at = sc.layout.door;
          sc.me.stand();
          sc.me.place(at);
        } else if (to === 'town') {
          at = from && PLACE_BY_ID[from] ? PLACE_BY_ID[from].door : TOWN_SPAWN;
          await arrive(!a.town, 'Walking into town…', async () => {
            const t = await getTown();
            t.setLocked(lockedPlaces());
            t.placeMe(at);
            a.active = t;
            return t;
          });
        } else {
          const id = insideOf(to)!;
          at = INTERIOR_DOOR;
          await arrive(!a.ins.has(id), `Stepping into ${PLACE_BY_ID[id]?.name ?? 'the shop'}…`, async () => {
            const i = await getInside(id);
            stockShop(id);
            i.placeMe(at);
            a.active = i;
            return i;
          });
        }
        area.value = to;
        backend.send({ t: 'area', area: to, at });
        showPartner(at);
      } catch {
        // Usually the town's code couldn't be fetched (offline on a first visit): stay where we were.
        a.active?.pause();
        a.active = prev;
        if (area.value === 'home') sc.resume(); else prev?.start();
        toast('Couldn’t get there. Check your connection and try again.', 'error');
      } finally {
        setFade(false);
        a.busy = false;
      }
    }, 240);
  };

  uiRef.current = {
    hotspot: (h) => {
      sfx('tap');
      const id = insideOf(area.value);
      if (h.kind === 'exit') { goRef.current?.('town', id ?? undefined); return; }
      if (h.kind === 'item') { shopCtx.value = { shop: 'maple', focus: h.id.slice(5) }; sheet.value = 'shop'; return; }
      // Counters, desks and pews only exist inside; outside, every hotspot is a front door.
      if (h.kind === 'shop' && id) { shopCtx.value = { shop: id === 'boutique' ? 'boutique' : 'maple' }; sheet.value = 'shop'; return; }
      if (h.kind === 'realty' && id) { sheet.value = 'realty'; return; }
      if (h.kind === 'quiet' && id) { setNotesTab(h.id === 'chapel-pew' ? 'prayer' : 'quiet'); sheet.value = 'notes'; return; }
      if (h.kind === 'work' && id) { const sp = id ? INTERIORS[id]?.spots.find((q) => q.id === h.id) : null; if (id && sp) { setLobby({ place: PLACE_BY_ID[id], job: sp.job }); sheet.value = 'work'; } return; }
      const p = PLACE_BY_ID[h.id];
      if (!p) return;
      if (p.kind === 'home') { goRef.current?.('home'); return; }
      if (p.id === 'bakery') { sheet.value = 'bakery'; return; }
      if (p.id === 'park') {
        const together = !!snap.value?.partner && partnerArea.value === 'town';
        here()?.fx.spawn('heart', here()!.me.head(), { count: together ? 4 : 2, spread: 0.5 });
        toast(together ? `You and ${snap.value!.partner!.name} sit in the gazebo and watch the ducks for a while.` : `A quiet seat in the gazebo by the pond.${snap.value?.partner ? ` ${snap.value.partner.name} would like it here.` : ''}`, 'love');
        return;
      }
      if (INTERIORS[p.id]) {
        const open = !p.jobs || p.jobs.some((j) => !jobLock(snap.value?.me, j));
        if (!open) {
          const lock = jobLock(snap.value?.me, p.jobs![0])!;
          toast(`${p.name} is hiring after ${lock.left} more ${JOBS[lock.after].name.toLowerCase()} ${lock.left === 1 ? 'shift' : 'shifts'}.`, 'info');
          return;
        }
        goRef.current?.(inside(p.id), 'town');
        return;
      }
      if (p.kind === 'residence') { toast(`${p.note}. Maybe one day they’ll have you over.`, 'info'); return; }
      toast(`${p.name}: ${p.kind === 'soon' ? 'opening soon' : 'not open yet'}.`, 'info');
    },
    npc: (id, at) => {
      sfx('tap');
      if (id.startsWith('piece:')) { shopCtx.value = { shop: 'boutique', focus: id.slice(6) }; sheet.value = 'shop'; return; }
      const info = (here() as TownScene | InteriorScene | null)?.npcInfo(id);
      if (info) setTalk({ ...info, at });
    },
    partner: (at) => { if (!snap.value?.partner) return; sfx('tap'); setBubble({ kind: 'partner', at }); },
  };

  // The shelves follow the calendar (new stock every Monday) and what you own (next steps, outfits on the mannequins).
  useSignalEffect(() => {
    const a = area.value;
    void snap.value;
    stockShop(insideOf(a));
  });
  useEffect(() => {
    const t = setInterval(() => stockShop(insideOf(area.value)), 5 * 60_000);
    return () => clearInterval(t);
  }, []);

  // Rooms and streets are built for one theme and one set of looks; rebuild them when those change.
  useSignalEffect(() => {
    const th = prefs.value.theme;
    const looks = snap.value ? looksNow() : null;
    const a = areas.current;
    if (a.town) a.town.setLocked(lockedPlaces());
    if (!looks) return;
    for (const sc of [a.town, ...a.ins.values()]) sc?.setLooks(looks.me, looks.partner);
    if (area.value === 'home' && (a.town?.themeKey !== th || [...a.ins.values()].some((i) => i.themeKey !== th))) {
      a.town?.destroy(); a.town = null;
      for (const i of a.ins.values()) i.destroy();
      a.ins.clear();
    }
  });

  // The town's camera and weather follow the settings; "auto" weather is re-read now and then as the sky changes.
  const [, repaint] = useState(0);
  useSignalEffect(() => {
    const t = areas.current.town;
    const v = prefs.value.townView, w = prefs.value.weather;
    if (!t) return;
    t.setTownView(v);
    t.setWeatherPref(w);
  });
  useEffect(() => {
    const t = setInterval(() => repaint((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);
  const townWeather: WeatherKind = areas.current.town?.weatherShown ?? 'clear';

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
    const showPartnerHere = area.value === 'home' ? !!s.partner && (partnerArea.value === 'home' || !partnerOnline.value) : null;
    const T = THEMES[prefs.value.theme];
    const apply = () => {
      scene.sync(s.placements);
      if (showPartnerHere != null) scene.partner.group.visible = showPartnerHere;
      const st = s.couple!.style;
      scene.setStyle({ wallpaper: st.wallpaper, wallTint: st.wallTint || T.wall.tint, floor: st.floor, floorTint: st.floorTint, curtains: s.unlocks.includes('up_curtains') });
      scene.setLooks(s.me.look, s.partner?.look ?? s.me.look);
    };
    // A new home is a whole new room to build: do it behind the loading screen.
    const L = layoutOf(s.couple.home);
    if (L !== scene.layout) void withLoading('Moving in…', () => { scene.setLayout(L); apply(); return scene.warm(s.placements.map((p) => p.item), true); });
    else apply();
  });

  useSignalEffect(() => {
    const th = prefs.value.theme;
    if (scene && scene.themeKey !== th) void withLoading('Repainting…', () => { scene.setTheme(th); return scene.warm(snap.value?.placements.map((p) => p.item) ?? [], true); });
  });
  useSignalEffect(() => { if (scene) scene.r.covered = sceneCovers.value > 0; });
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

  // Photos in frames. Each photo is fetched once; every other update leaves the frames alone.
  const photos = useRef(new Map<string, string>());
  useSignalEffect(() => {
    const s = snap.value;
    if (!scene || !s) return;
    for (const p of s.placements) {
      const path = (p.data as { photo?: string } | null)?.photo;
      if (!path || photos.current.get(p.id) === path) continue;
      photos.current.set(p.id, path);
      void backend.photoUrl(path).then((url) => {
        if (!url) { photos.current.delete(p.id); return; }
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.decoding = 'async';
        img.onload = () => sceneRef?.setPhoto(p.id, img);
        img.onerror = () => photos.current.delete(p.id);
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
    if (on && area.value !== 'home') backend.send({ t: 'area', area: area.value, at: here()?.me.tile ?? INTERIOR_DOOR });
    if (!on) partnerArea.value = 'home';
    showPartner();
    if (on && (backend as LocalBackend).syncPartnerTile) (backend as LocalBackend).syncPartnerTile(scene.partner.tile);
  });

  // Live messages from the partner's phone.
  useEffect(() => {
    if (!scene) return;
    liveHandler = (m: LiveMsg) => {
      const pName = partner.value?.name ?? 'Your partner';
      switch (m.t) {
        case 'walk':
          if (partnerArea.value !== area.value) break;
          if (area.value === 'home') { partnerSettled.current = null; scene.remoteWalk(m.from, m.path); } else here()?.remoteWalk(m.from, m.path, !!m.hold);
          break;
        case 'area': partnerArea.value = m.area; showPartner(m.at); break;
        case 'settle': if (area.value !== 'home') { if (partnerArea.value === area.value) here()?.remoteSettle(m.state); break; } partnerSettled.current = m.state && m.state.pose !== 'stand' ? m.state : null; scene.remoteSettle(m.state); break;
        case 'hold': {
          if (area.value === 'home' || partnerArea.value !== area.value) break;
          here()?.setHold(m.mode ? { mode: m.mode, leader: m.leader === 'sender' ? 'partner' : m.leader === 'receiver' ? 'me' : 'either' } : null, false);
          if (m.mode) { sfx('heart'); toast(`${pName} took your hand`, 'love'); }
          break;
        }
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

  // Draw the box and shop pictures while the phone is idle, so those sheets open instantly.
  useEffect(() => {
    const t = setTimeout(() => {
      const s = snap.value;
      if (!s) return;
      const owned = s.inventory.map((r) => r.item);
      const shop = ITEMS.filter((i) => i.kind === 'floor-item' || i.kind === 'wall-item').map((i) => i.key);
      prewarmThumbs([...new Set([...owned, ...shop])], prefs.value.theme);
      // And have every piece built and its shaders compiled before anyone picks one up, and
      // the town's code fetched before anyone steps outside.
      void sceneRef?.warm([...s.placements.map((p) => p.item), ...owned, ...shop]);
      void loadPlaces();
      Work.preload();
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

  // Decorate wants every piece in the box ready to pick up, pictures and all. Usually the idle
  // warm-up has done that already; if not, it finishes behind the loading screen first.
  const openDecorate = async () => {
    const st = snap.value;
    if (!scene || !st || sheet.value === 'decorate') { open('decorate'); return; }
    const theme = prefs.value.theme;
    const boxed = st.inventory.map((r) => r.item);
    const keys = [...boxed, ...st.placements.map((p) => p.item)];
    const pics = boxed.filter((k) => cachedThumb(k, theme) == null);
    if (!scene.isWarm(keys) || pics.length) {
      setBubble(null);
      await withLoading('Unpacking the box…', () => Promise.all([scene.warm(keys, true), ...pics.map((k) => requestThumb(k, theme))]));
    }
    open('decorate');
  };

  /** Play a together-animation: arrange us (at the bed or sofa I tapped, if any), show it, tell my partner. */
  const doInteraction = async (id: string, at?: Placement) => {
    if (!scene) return;
    const play = await scene.startInteraction(id, at);
    if (!play) { toast('Couldn’t do that here. Try somewhere with more room.', 'error'); return; }
    backend.send({ t: 'interact', play });
    sfx('heart');
    await act('interaction', { id }, { quiet: true });
  };

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
          <div class="pill" aria-label="Coins" data-tour="coins">
            <Coin n={coins.value.toLocaleString()} />
          </div>
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

      {area.value === 'home' && sheet.value !== 'decorate' && scene && scene.layout.rooms.length > 1 && (
        <button class="pill wholebtn" aria-pressed={whole} onClick={() => { sfx('tap'); scene.setOverview(!whole); setWhole(!whole); }}>
          <Icon name="box" size="s" /><span>{whole ? 'Follow us' : 'Whole home'}</span>
        </button>
      )}

      {area.value === 'town' && sheet.value == null && !mapOpen && (
        <button class="pill mapbtn" onClick={() => { sfx('tap'); setTalk(null); setMapOpen(true); }}>
          <Icon name="map" size="s" /><span>Map</span>
        </button>
      )}
      {area.value === 'town' && sheet.value == null && !mapOpen && (
        <>
          <button class="pill townbtn" style={{ top: 'calc(var(--safe-t) + 152px)' }} aria-label="Camera view"
            onClick={() => { sfx('tap'); setPrefs({ townView: prefs.value.townView === 'top' ? 'front' : 'top' }); }}>
            <Icon name="camera" size="s" /><span>{prefs.value.townView === 'top' ? 'Top view' : 'Front view'}</span>
          </button>
          <button class="pill townbtn" style={{ top: 'calc(var(--safe-t) + 196px)' }} aria-label="Weather"
            onClick={() => { sfx('tap'); const order = ['auto', ...WEATHER_KINDS] as const; setPrefs({ weather: order[(order.indexOf(prefs.value.weather) + 1) % order.length] }); }}>
            <Icon name={WEATHER_ICON[prefs.value.weather === 'auto' ? townWeather : prefs.value.weather]} size="s" />
            <span>{prefs.value.weather === 'auto' ? `Auto · ${WEATHER_LABEL[townWeather]}` : WEATHER_LABEL[prefs.value.weather]}</span>
          </button>
        </>
      )}
      {holding && area.value !== 'home' && sheet.value == null && (
        <div class="holdchip pill"><Icon name="heart" size="s" /><span>Holding hands</span><button class="btn small soft" onClick={() => here()?.letGo()}>Let go</button></div>
      )}
      {district && area.value === 'town' && !mapOpen && (
        <div class="district-banner" key={district.k}><b>{district.name}</b><span>{district.blurb}</span></div>
      )}
      {mapOpen && areas.current.town && (
        <TownMap me={areas.current.town.me.tile} partnerAt={areas.current.town.partnerHere ? areas.current.town.partner.tile : null} partnerName={partner.value?.name}
          onClose={() => setMapOpen(false)}
          onGo={(id) => { setMapOpen(false); sfx('tap'); areas.current.town?.travel(id); }} />
      )}

      {bubble?.kind === 'furniture' && scene && (
        <FurnitureBubble p={bubble.p} at={bubble.at} scene={scene} music={music}
          onClose={() => setBubble(null)}
          onTogether={(id) => void doInteraction(id, bubble.p)}
          onGame={(k) => void startGame(k, bubble.p)}
          onNotes={(tab) => { setBubble(null); setNotesTab(tab); sheet.value = 'notes'; }}
          onSheet={(kind) => { setBubble(null); setItemSheet({ kind, p: bubble.p }); }}
          onMe={() => { setBubble(null); sheet.value = 'wardrobe'; }}
          onMusic={(on) => { setMusic(on); }}
        />
      )}
      {bubble?.kind === 'partner' && scene && (
        <PartnerBubble at={bubble.at} online={pOnline} lastSeen={partnerLastSeen.value} name={partner.value?.name ?? ''}
          inArea={area.value !== 'home'} holding={!!holding}
          onHeart={async () => {
            setBubble(null);
            if (area.value === 'home') scene.spawn('heart', 'partner', 3);
            else here()?.fx.spawn('heart', here()!.partner.head(), { count: 3, spread: 0.4 });
            sfx('heart');
            backend.send({ t: 'heart' });
            await act('heart', {});
          }}
          onWheel={() => { setBubble(null); setWheel(true); }}
          onHold={(mode, leader) => { setBubble(null); sfx('heart'); here()?.setHold({ mode, leader }); }}
          onLetGo={() => { setBubble(null); here()?.letGo(); }}
          onClose={() => setBubble(null)}
        />
      )}
      {talk && <SayBubble at={talk.at} name={talk.name} line={talk.line} onClose={() => setTalk(null)} />}
      {bubble?.kind === 'me' && scene && <MeBubble at={bubble.at} scene={scene} onClose={() => setBubble(null)} />}

      {wheel && scene && (
        <InteractionWheel onClose={() => setWheel(false)} onPick={(id) => { setWheel(false); void doInteraction(id); }} />
      )}

      {invite && (
        <div class="bubble" style={{ left: '50%', top: '30%', transform: 'translate(-50%, 0)', flexDirection: 'column', alignItems: 'stretch', maxWidth: '86%' }}>
          <span class="small center">{partner.value?.name} wants to {invite.kind === 'shift' ? `work a ${JOBS[invite.job ?? 'cafe'].name.toLowerCase()} shift together` : invite.kind === 'draw' ? 'play Draw & Guess' : `play ${invite.kind === 'connect4' ? 'Connect 4' : 'Tic-Tac-Toe'}`}</span>
          <div class="row">
            <button class="btn ghost grow" onClick={() => setInvite(null)}>Later</button>
            <button class="btn grow" onClick={() => {
              const inv = invite; setInvite(null);
              if (inv.kind === 'shift') { workJoin = inv.ref ? { id: inv.ref, job: inv.job ?? 'cafe' } : null; setLobby(null); sheet.value = 'work'; }
              else setGame({ id: inv.ref ?? null, kind: inv.kind });
            }}>Join</button>
          </div>
        </div>
      )}

      {sheet.value === 'shop' && <Shop onClose={() => open(null)} />}
      {sheet.value === 'bakery' && <Bakery onClose={() => open(null)} />}
      {sheet.value === 'realty' && <Realty onClose={() => open(null)} />}
      {sheet.value === 'work' && <Work onClose={() => { open(null); setLobby(null); }} joinShift={takeWorkJoin()} title={lobby ? lobby.place.name : 'Work'} jobs={lobby ? lobby.place.jobs ?? null : null} first={lobby?.job} />}
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

      {(area.value !== 'home' || (partnerOnline.value && partnerArea.value !== 'home')) && <AreaTag go={(to) => goRef.current?.(to, 'town')} />}
      <div class={`areafade ${fade ? 'on' : ''}`} />
      {sheet.value !== 'decorate' && area.value === 'home' && (
        <nav class="bottombar">
          {([['decorate', 'decorate', 'Decorate'], ['notes', 'notes', 'Notes'], ['me', 'me', 'Me']] as const).map(([k, icon, label]) => (
            <button class="navbtn" aria-pressed={sheet.value === k} onClick={() => (k === 'decorate' ? void openDecorate() : open(k))} data-tour={k}>
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

/** Which place you're in, and where your partner is when it isn't here. */
function AreaTag({ go }: { go?: (to: AreaId) => void }) {
  const mine = area.value, theirs = partnerArea.value;
  const away = !!partner.value && partnerOnline.value && theirs !== mine;
  return (
    <div class="areatag">
      <div class="pill row" style={{ gap: '8px' }}>
        <b>{areaName(mine)}</b>
        {away && go && <><span class="sub" style={{ display: 'inline' }}>{partner.value!.name} is at {areaName(theirs)}</span><button class="btn small" onClick={() => go(theirs)}>Join</button></>}
      </div>
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
