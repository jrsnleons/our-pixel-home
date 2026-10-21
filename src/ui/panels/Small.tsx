// Smaller sheets: starter quests, the "while you were away" feed, the together-since step,
// milestone celebrations, and the per-item sheets (photo frame, calendar, clock, verse art, globe).

import { TREAT_BY_KEY } from '../../data/treats';
import { PIECE_BY_KEY } from '../../data/clothes';
import { useState } from 'preact/hooks';
import { sfx } from '../../audio/audio';
import type { Placement } from '../../core/grid';
import { parseRef } from '../../data/bible';
import { daysTogether, milestone, QUESTS, sinceFromDays } from '../../data/economy';
import { INTERACTION_BY_ID } from '../../data/interactions';
import { isJob, JOBS } from '../../data/jobs';
import type { Passage } from '../../net/backend';
import { dayIn } from '../../net/rules';
import type { FeedEvent } from '../../net/types';
import { act, ago, backend, couple, itemName, me, partner, snap, toast } from '../../state/store';
import { AvatarPreview } from '../AvatarEditor';
import { Coin, Field, Icon, Sheet } from '../kit';
import { tzOffsetMinutes } from '../screens/Home';

export function Quests({ onClose }: { onClose: () => void }) {
  const s = snap.value!;
  return (
    <Sheet title="First week together" onClose={onClose}>
      <p class="small muted" style={{ marginTop: 0 }}>A few things to do together. Each one pays into your shared wallet, and finishing them all unlocks the piggyback ride.</p>
      <div class="list">
        {QUESTS.map((q) => {
          const st = s.quests.find((x) => x.key === q.key);
          return (
            <div class="item white" style={{ alignItems: 'center' }}>
              {st?.claimed || st?.done ? <Icon name={st.claimed ? 'check' : 'star'} size="s" /> : <span class="todo-box" aria-label="Not done yet" />}
              <div class="grow"><div>{q.label}</div><div class="tiny muted">{q.hint}</div></div>
              {st?.claimed ? <span class="tiny muted">Done</span> : st?.done
                ? <button class="btn small" onClick={async () => { const ok = await act('quest_claim', { key: q.key }); if (ok) sfx('coin'); }}>Claim <Coin n={q.coins} /></button>
                : <span class="chip"><Coin n={q.coins} /></span>}
            </div>
          );
        })}
      </div>
    </Sheet>
  );
}

export function describe(e: FeedEvent): string {
  const p = e.payload as Record<string, string | number | boolean | null>;
  switch (e.kind) {
    case 'heart': return 'sent you a heart';
    case 'interaction': return INTERACTION_BY_ID[String(p.id)]?.away ?? 'did something sweet';
    case 'nudge': return p.kind === 'verse' ? `sent you a verse: ${p.ref ?? ''}${p.text ? ` “${p.text}”` : ''}` : `encouraged you: “${p.text}”`;
    case 'buy': return p.color != null && PIECE_BY_KEY[String(p.item)] ? `bought a ${PIECE_BY_KEY[String(p.item)].colorNames[Number(p.color)]?.toLowerCase() ?? ''} ${itemName(String(p.item))}` : `bought ${itemName(String(p.item))}`;
    case 'outfit': return 'picked an outfit for you';
    case 'note': return `wrote a page${p.title ? `: ${p.title}` : ''}`;
    case 'prayer': return `added a prayer request: “${p.text}”`;
    case 'prayed': return `prayed for “${p.text}”`;
    case 'answered': return `marked a prayer answered: “${p.text}”`;
    case 'devotion': return p.shared ? `did quiet time (${p.passage})` : 'did quiet time';
    case 'game': return `finished a game${p.winner === e.actor ? ' and won' : ''}`;
    case 'shift': return `worked ${p.together ? 'a shift together' : 'a shift'} at ${JOBS[isJob(p.job) ? p.job : 'cafe'].place} (+${p.pay})`;
    case 'quest': return 'finished a starter quest';
    case 'decor': return p.moved ? `moved you into the ${p.moved}` : 'redecorated';
    case 'treat': return `bought you ${(TREAT_BY_KEY[String(p.treat)]?.name ?? 'a treat').toLowerCase()} from the bakery cart`;
    case 'joined': return 'moved in';
    case 'milestone': return `celebrated ${p.label} with you`;
    default: return 'was here';
  }
}

export function Feed({ onClose }: { onClose: () => void }) {
  const s = snap.value!;
  const pid = s.partner?.id;
  const events = s.events.filter((e) => e.actor === pid).slice(-30).reverse();
  const name = partner.value?.name ?? 'Your partner';
  return (
    <Sheet title={pid ? `News from ${name}` : 'Invite your partner'} onClose={onClose}>
      {!pid && (
        <div class="col">
          <p class="small" style={{ marginTop: 0 }}>Send this code to your partner so they can move in.</p>
          <div class="code pbox">{couple.value?.inviteCode}</div>
        </div>
      )}
      {pid && events.length === 0 && <div class="empty">Nothing yet. Say hi with a heart.</div>}
      <div class="list">
        {events.map((e) => (
          <div class="item white">
            <Icon name={e.kind === 'heart' || e.kind === 'interaction' ? 'heart' : e.kind === 'prayer' || e.kind === 'prayed' ? 'pray' : e.kind === 'devotion' || e.kind === 'nudge' ? 'bible' : 'sparkle'} size="s" />
            <div class="grow"><p style={{ margin: 0 }}>{name} {describe(e)}</p><span class="who">{ago(e.createdAt)}</span></div>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

/** The setup step after pairing: how long you've been together, as a number of days or a date. */
export function SinceDate({ onDone }: { onDone: () => void }) {
  const today = dayIn(me.value?.tz ?? 'UTC', new Date());
  const [mode, setMode] = useState<'days' | 'date'>('days');
  const [days, setDays] = useState('');
  const [d, setD] = useState('');
  const n = Math.floor(Number(days));
  const since = mode === 'days' ? (n >= 1 && n <= 40000 ? sinceFromDays(n, today) : '') : d && d <= today ? d : '';
  const count = since ? daysTogether(since, new Date(today + 'T12:00:00')) : null;
  return (
    <Sheet title="How long have you been together?" onClose={onDone}>
      <div class="col">
        <p class="small" style={{ marginTop: 0 }}>Your counter at the top starts from here, and you’ll both get a little celebration on monthsaries, every hundredth day and anniversaries.</p>
        <div class="row" style={{ gap: '8px' }}>
          <button class="tab" aria-selected={mode === 'days'} onClick={() => { sfx('tap'); setMode('days'); }}>Number of days</button>
          <button class="tab" aria-selected={mode === 'date'} onClick={() => { sfx('tap'); setMode('date'); }}>The date we started</button>
        </div>
        {mode === 'days'
          ? <Field label="Days together"><input class="input" type="number" inputMode="numeric" min={1} max={40000} value={days} onInput={(e) => setDays(e.currentTarget.value)} placeholder="412" /></Field>
          : <Field label="We started on"><input class="input" type="date" value={d} max={today} onChange={(e) => setD(e.currentTarget.value)} /></Field>}
        <div class="code pbox" style={{ fontSize: '1.4em' }}>{count ? `Day ${count.toLocaleString()} together` : 'Day ? together'}</div>
        <button class="btn" disabled={!since} onClick={async () => { const ok = await act('set_couple', { since }); if (ok) { sfx('win'); onDone(); } }}>That’s us</button>
        <button class="btn ghost small" onClick={onDone}>Later (you can set it in Me → Us)</button>
      </div>
    </Sheet>
  );
}

/** Today's monthsary, hundredth day or anniversary, shown once per day on each phone. */
export function todaysMilestone(): { label: string; day: string } | null {
  const s = snap.value;
  if (!s?.couple?.b) return null;
  const day = dayIn(s.me.tz, new Date());
  const ms = milestone(s.couple.since, day);
  if (!ms) return null;
  try { if (localStorage.getItem('oph.celebrated') === day) return null; } catch { /* show it */ }
  return { label: ms.label, day };
}

export function Celebrate({ label, day, onClose }: { label: string; day: string; onClose: () => void }) {
  const close = () => { try { localStorage.setItem('oph.celebrated', day); } catch { /* ignore */ } onClose(); };
  const s = snap.value!;
  return (
    <div class="celebrate" onClick={close}>
      <div class="pbox col center" style={{ padding: '18px 16px', maxWidth: '320px' }}>
        <div class="pair-art" style={{ marginBottom: '4px' }}>
          <AvatarPreview look={s.me.look} scale={2} />
          <span class="pair-heart on"><Icon name="heart" size="l" /></span>
          {s.partner && <AvatarPreview look={s.partner.look} scale={2} />}
        </div>
        <h2 style={{ fontWeight: 'normal', margin: 0 }}>{label}!</h2>
        <p class="small" style={{ margin: 0 }}>Thank God for every one of these days. There’s a coin gift in your wallet to celebrate.</p>
        <button class="btn block" onClick={close}>Yay</button>
      </div>
    </div>
  );
}

export type ItemSheetKind = 'photo' | 'calendar' | 'clock' | 'verse' | 'globe';

export function ItemSheet({ kind, p, onClose }: { kind: ItemSheetKind; p: Placement; onClose: () => void }) {
  if (kind === 'photo') return <PhotoSheet p={p} onClose={onClose} />;
  if (kind === 'calendar') return <CalendarSheet onClose={onClose} />;
  if (kind === 'clock') return <ClockSheet onClose={onClose} />;
  if (kind === 'verse') return <VerseSheet p={p} onClose={onClose} />;
  return <GlobeSheet onClose={onClose} />;
}

/** Downscale a photo before upload so frames load fast and storage stays small. */
async function shrink(file: File, max = 1280): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob((b) => res(b!), 'image/jpeg', 0.86));
}

function PhotoSheet({ p, onClose }: { p: Placement; onClose: () => void }) {
  const cur = snap.value!.placements.find((x) => x.id === p.id) ?? p;
  const data = (cur.data ?? {}) as { photo?: string; pixelate?: boolean; caption?: string; takenAt?: string };
  const [url, setUrl] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [caption, setCaption] = useState(data.caption ?? '');
  if (data.photo && !url) void backend.photoUrl(data.photo).then(setUrl);
  const pick = async (e: Event) => {
    const f = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!f) return;
    setBusy(true);
    try {
      const blob = await shrink(f);
      const path = await backend.uploadPhoto(blob);
      await act('placement_data', { pid: p.id, patch: { photo: path, takenAt: new Date(f.lastModified || Date.now()).toISOString().slice(0, 10) } });
      setUrl(await backend.photoUrl(path));
      sfx('pop');
    } catch { toast('Couldn’t upload that photo.', 'error'); }
    setBusy(false);
  };
  return (
    <Sheet title={itemName(p.item)} onClose={onClose}>
      <div class="col">
        {url ? <img src={url} alt={caption || 'Your photo'} style={{ width: '100%', imageRendering: data.pixelate ? 'pixelated' : 'auto' }} class="pbox" /> : <div class="empty pbox soft">No photo yet</div>}
        {data.takenAt && <span class="tiny muted">{new Date(data.takenAt).toLocaleDateString(undefined, { dateStyle: 'long' })}</span>}
        <label class="btn soft block" style={{ cursor: 'pointer' }}><Icon name="camera" size="s" />{busy ? 'Uploading…' : url ? 'Change photo' : 'Choose a photo'}<input type="file" accept="image/*" hidden onChange={pick} disabled={busy} /></label>
        <label class="row" style={{ cursor: 'pointer' }}>
          <span class="grow">Pixelate in the room</span>
          <button class={`btn small ${data.pixelate ? 'good' : 'soft'}`} onClick={() => act('placement_data', { pid: p.id, patch: { pixelate: !data.pixelate } })}>{data.pixelate ? 'On' : 'Off'}</button>
        </label>
        <Field label="Caption"><input class="input" value={caption} maxLength={80} onInput={(e) => setCaption(e.currentTarget.value)} onBlur={() => caption !== (data.caption ?? '') && act('placement_data', { pid: p.id, patch: { caption } })} placeholder="Our first date" /></Field>
        <p class="tiny muted">Photos are private to the two of you.</p>
      </div>
    </Sheet>
  );
}

function CalendarSheet({ onClose }: { onClose: () => void }) {
  const c = couple.value!;
  const days = c.nextVisit ? Math.ceil((Date.parse(c.nextVisit + 'T00:00:00') - Date.now()) / 86_400_000) : null;
  return (
    <Sheet title="Next visit" onClose={onClose}>
      <div class="col">
        <div class="code pbox">{days == null ? '?' : days <= 0 ? 'Today!' : `${days} day${days === 1 ? '' : 's'}`}</div>
        <Field label="When do you see each other next?"><input class="input" type="date" value={c.nextVisit ?? ''} min={new Date().toISOString().slice(0, 10)} onChange={(e) => act('set_couple', { nextVisit: e.currentTarget.value || null })} /></Field>
      </div>
    </Sheet>
  );
}

function ClockSheet({ onClose }: { onClose: () => void }) {
  const s = snap.value!;
  const fmt = (tz: string) => new Date().toLocaleTimeString(undefined, { timeZone: tz, hour: 'numeric', minute: '2-digit' });
  const diff = s.partner ? (tzOffsetMinutes(s.partner.tz) - tzOffsetMinutes(s.me.tz)) / 60 : 0;
  return (
    <Sheet title="Your time and theirs" onClose={onClose}>
      <div class="row" style={{ justifyContent: 'space-around', textAlign: 'center' }}>
        <div><div class="code pbox">{fmt(s.me.tz)}</div><div class="small">{s.me.city ?? 'You'}</div></div>
        {s.partner && <div><div class="code pbox">{fmt(s.partner.tz)}</div><div class="small">{s.partner.city ?? s.partner.name}</div></div>}
      </div>
      {s.partner && <p class="center small muted">{diff === 0 ? 'Same time zone.' : `${s.partner.name} is ${Math.abs(diff)} hour${Math.abs(diff) === 1 ? '' : 's'} ${diff > 0 ? 'ahead' : 'behind'}.`}</p>}
    </Sheet>
  );
}

function VerseSheet({ p, onClose }: { p: Placement; onClose: () => void }) {
  const cur = snap.value!.placements.find((x) => x.id === p.id) ?? p;
  const v = (cur.data as { verse?: { ref: string; text: string } } | null)?.verse ?? null;
  const [ref, setRef] = useState(v?.ref ?? '');
  const [passage, setPassage] = useState<Passage | null>(null);
  const [err, setErr] = useState('');
  const show = async (r: string) => {
    const pr = parseRef(r);
    if (!pr) { setErr('Try “1 Corinthians 13:4” or “Psalm 46:10”.'); return; }
    setErr('');
    try { setPassage(await backend.passage(pr.book, pr.chapter, pr.from ?? 1, pr.to ?? pr.from ?? 3)); } catch (e) { setErr(e instanceof Error ? e.message : 'Couldn’t load that.'); }
  };
  if (v && !passage && !err) void show(v.ref);
  return (
    <Sheet title="Scripture art" onClose={onClose}>
      <div class="col">
        {passage && (
          <div class="pbox soft" style={{ padding: '10px 12px' }}>
            <div class="verse">{passage.verses.map((x) => <span><sup>{x.n}</sup>{x.text} </span>)}</div>
            <div class="small" style={{ marginTop: '6px' }}>{passage.ref} (ESV)</div>
            <p class="copyright">{passage.copyright}</p>
          </div>
        )}
        {err && <span class="tiny" style={{ color: 'var(--bad)' }}>{err}</span>}
        <Field label="Verse on the wall">
          <div class="row"><input class="input grow" value={ref} onInput={(e) => setRef(e.currentTarget.value)} placeholder="Psalm 46:10" /><button class="btn soft" onClick={() => show(ref)}>Show</button></div>
        </Field>
        <button class="btn" disabled={!parseRef(ref)} onClick={async () => { const ok = await act('placement_data', { pid: p.id, patch: { verse: { ref: ref.trim(), text: '' } } }); if (ok) { sfx('pop'); toast('Your verse is up.'); } }}>Hang this verse</button>
      </div>
    </Sheet>
  );
}

const CITIES: Record<string, [number, number]> = {
  manila: [14.6, 121.0], cebu: [10.3, 123.9], davao: [7.1, 125.6], london: [51.5, -0.13], 'new york': [40.7, -74], 'los angeles': [34.05, -118.24], toronto: [43.65, -79.38], sydney: [-33.87, 151.2], melbourne: [-37.8, 144.96],
  singapore: [1.35, 103.82], tokyo: [35.68, 139.69], seoul: [37.57, 126.98], dubai: [25.2, 55.27], 'hong kong': [22.32, 114.17], vancouver: [49.28, -123.12], chicago: [41.88, -87.63], 'san francisco': [37.77, -122.42],
  berlin: [52.52, 13.4], paris: [48.86, 2.35], madrid: [40.42, -3.7], rome: [41.9, 12.5], auckland: [-36.85, 174.76], jakarta: [-6.2, 106.85], 'kuala lumpur': [3.14, 101.69], bangkok: [13.76, 100.5], riyadh: [24.71, 46.68], doha: [25.29, 51.53],
};

function GlobeSheet({ onClose }: { onClose: () => void }) {
  const a = me.value?.city?.toLowerCase().trim() ?? '';
  const b = partner.value?.city?.toLowerCase().trim() ?? '';
  const pa = CITIES[a], pb = CITIES[b];
  let km: number | null = null;
  if (pa && pb) {
    const R = 6371, rad = Math.PI / 180;
    const dLat = (pb[0] - pa[0]) * rad, dLon = (pb[1] - pa[1]) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(pa[0] * rad) * Math.cos(pb[0] * rad) * Math.sin(dLon / 2) ** 2;
    km = Math.round(2 * R * Math.asin(Math.sqrt(h)));
  }
  return (
    <Sheet title="The globe" onClose={onClose}>
      {km != null ? (
        <div class="col center">
          <div class="code pbox">{km.toLocaleString()} km</div>
          <p class="small">between {me.value?.city} and {partner.value?.city}. Close in every way that counts.</p>
        </div>
      ) : (
        <p class="small">Add both of your cities in Me → Us and the globe will show the distance between you.</p>
      )}
    </Sheet>
  );
}
