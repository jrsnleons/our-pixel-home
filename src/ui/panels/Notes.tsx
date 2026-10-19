// Notes: shared notebooks, prayer requests, and each person's own quiet time.

import { useState } from 'preact/hooks';
import { sfx } from '../../audio/audio';
import { NUDGE_VERSES, parseRef } from '../../data/bible';
import type { Passage } from '../../net/backend';
import { dayIn, prevDay } from '../../net/rules';
import type { Devotion, Notebook, Page, Prayer } from '../../net/types';
import { act, ago, backend, me, partner, snap, toast } from '../../state/store';
import { Field, Icon, Sheet, Tabs } from '../kit';

export type NotesTab = 'notebooks' | 'prayer' | 'quiet';

export function Notes({ onClose, tab, setTab }: { onClose: () => void; tab: NotesTab; setTab: (t: NotesTab) => void }) {
  const s = snap.value!;
  const openPrayers = s.prayers.filter((p) => !p.answeredAt).length;
  return (
    <Sheet title="Notes" onClose={onClose} size="tall">
      <Tabs value={tab} onChange={(t) => { sfx('page'); setTab(t); }} options={[
        { key: 'notebooks', label: 'Notebooks' },
        { key: 'prayer', label: 'Prayer', badge: openPrayers || undefined },
        { key: 'quiet', label: 'Quiet time' },
      ]} />
      {tab === 'notebooks' && <Notebooks />}
      {tab === 'prayer' && <Prayers />}
      {tab === 'quiet' && <QuietTime />}
    </Sheet>
  );
}

const nameOf = (id: string) => (id === me.value?.id ? 'You' : partner.value?.id === id ? partner.value.name : 'Someone');
const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

// ---------- notebooks ----------

const COLORS = ['#E8A0A8', '#A8C8E8', '#B8D8A0', '#F2D08A', '#C8B0E0', '#F0B890'];

function Notebooks() {
  const s = snap.value!;
  const [open, setOpen] = useState<Notebook | null>(null);
  const [making, setMaking] = useState(false);
  const [title, setTitle] = useState('');
  if (open) return <NotebookView nb={open} onBack={() => setOpen(null)} />;
  return (
    <div class="col">
      <div class="grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
        {s.notebooks.map((nb) => {
          const n = s.pages.filter((p) => p.notebookId === nb.id).length;
          return (
            <button class="card" style={{ alignItems: 'stretch', padding: 0 }} onClick={() => { sfx('page'); setOpen(nb); }}>
              <NotebookCover color={nb.color} pages={n} />
              <div style={{ padding: '6px 8px 8px', textAlign: 'left' }}>
                <div>{nb.title}</div>
                <div class="tiny muted">{n === 0 ? 'Empty' : `${n} page${n === 1 ? '' : 's'}`}</div>
              </div>
            </button>
          );
        })}
      </div>
      {making ? (
        <div class="item white col" style={{ alignItems: 'stretch' }}>
          <Field label="Notebook name"><input class="input" value={title} maxLength={40} onInput={(e) => setTitle(e.currentTarget.value)} placeholder="Things to do together" /></Field>
          <div class="row">
            <button class="btn ghost grow" onClick={() => setMaking(false)}>Cancel</button>
            <button class="btn grow" disabled={!title.trim()} onClick={async () => { const ok = await act('notebook_create', { title, color: COLORS[s.notebooks.length % COLORS.length] }); if (ok) { setMaking(false); setTitle(''); } }}>Make it</button>
          </div>
        </div>
      ) : (
        <button class="btn soft block" onClick={() => setMaking(true)}><Icon name="plus" size="s" />New notebook</button>
      )}
    </div>
  );
}

function NotebookView({ nb, onBack }: { nb: Notebook; onBack: () => void }) {
  const s = snap.value!;
  const pages = s.pages.filter((p) => p.notebookId === nb.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const [edit, setEdit] = useState<Page | 'new' | null>(null);
  const [read, setRead] = useState<Page | null>(null);
  if (edit) return <PageEditor nb={nb} page={edit === 'new' ? null : edit} onDone={() => setEdit(null)} />;
  if (read) {
    const p = s.pages.find((x) => x.id === read.id) ?? read;
    return (
      <div class="col">
        <button class="btn ghost small" style={{ alignSelf: 'flex-start' }} onClick={() => setRead(null)}><Icon name="back" size="s" />{nb.title}</button>
        <div class="item white col" style={{ alignItems: 'stretch', gap: '6px' }}>
          {p.title && <strong style={{ fontWeight: 'normal', fontSize: '1.15em' }}>{p.title}</strong>}
          <span class="who">{nameOf(p.author)} · {when(p.createdAt)}</span>
          <p>{p.body}</p>
        </div>
        {p.author === me.value?.id && (
          <div class="row">
            <button class="btn soft grow" onClick={() => { setRead(null); setEdit(p); }}><Icon name="pencil" size="s" />Edit</button>
            <button class="btn ghost grow" onClick={async () => { if (confirm('Delete this page?')) { await act('page_delete', { pageId: p.id }); setRead(null); } }}>Delete</button>
          </div>
        )}
      </div>
    );
  }
  return (
    <div class="col">
      <div class="row">
        <button class="btn ghost small" onClick={onBack}><Icon name="back" size="s" /></button>
        <h3 class="grow" style={{ margin: 0, fontWeight: 'normal' }}>{nb.title}</h3>
        <button class="btn small" onClick={() => setEdit('new')}><Icon name="pencil" size="s" />Write</button>
      </div>
      {pages.length === 0 && <div class="empty">No pages yet. Write the first one.</div>}
      <div class="list">
        {pages.map((p) => (
          <button class="item" style={{ textAlign: 'left', border: 0, cursor: 'pointer', color: 'inherit', width: '100%', flexDirection: 'column', alignItems: 'stretch', gap: '2px' }} onClick={() => { sfx('page'); setRead(p); }}>
            <span>{p.title || p.body.split('\n')[0].slice(0, 40)}</span>
            <span class="who">{nameOf(p.author)} · {when(p.createdAt)}</span>
            <p style={{ maxHeight: '2.8em', overflow: 'hidden' }}>{p.body}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function PageEditor({ nb, page, onDone }: { nb: Notebook; page: Page | null; onDone: () => void }) {
  const [title, setTitle] = useState(page?.title ?? '');
  const [body, setBody] = useState(page?.body ?? '');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const ok = page ? await act('page_edit', { pageId: page.id, title, body }) : await act('page_write', { notebookId: nb.id, title, body });
    setBusy(false);
    if (ok) { sfx('page'); onDone(); }
  };
  return (
    <div class="col">
      <span class="small muted">{nb.title}</span>
      <input class="input" value={title} maxLength={60} onInput={(e) => setTitle(e.currentTarget.value)} placeholder="Title (optional)" />
      <textarea class="input" rows={10} value={body} maxLength={4000} onInput={(e) => setBody(e.currentTarget.value)} placeholder="Write something for both of you…" />
      <span class="tiny muted">{page ? '' : 'Pages of a couple of sentences or more earn coins (3 a day).'}</span>
      <div class="row">
        <button class="btn ghost grow" onClick={onDone}>Cancel</button>
        <button class="btn grow" disabled={busy || body.trim().length < 3} onClick={save}>{page ? 'Save' : 'Add page'}</button>
      </div>
    </div>
  );
}

// ---------- prayer ----------

function Prayers() {
  const s = snap.value!;
  const [text, setText] = useState('');
  const [showAnswered, setShowAnswered] = useState(false);
  const open = s.prayers.filter((p) => !p.answeredAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const answered = s.prayers.filter((p) => p.answeredAt).sort((a, b) => b.answeredAt!.localeCompare(a.answeredAt!));
  return (
    <div class="col">
      <div class="item white col" style={{ alignItems: 'stretch', gap: '8px' }}>
        <textarea class="input" rows={2} value={text} maxLength={500} onInput={(e) => setText(e.currentTarget.value)} placeholder="What can your partner pray for?" />
        <button class="btn" disabled={!text.trim()} onClick={async () => { const ok = await act('prayer_add', { text }); if (ok) { setText(''); sfx('bell'); } }}><Icon name="pray" size="s" />Add request</button>
      </div>
      {open.length === 0 && <div class="empty">No open requests. Add one, big or small.</div>}
      <div class="list">{open.map((p) => <PrayerCard p={p} />)}</div>
      {answered.length > 0 && (
        <>
          <button class="btn ghost small" onClick={() => setShowAnswered(!showAnswered)}>{showAnswered ? 'Hide' : 'Show'} answered ({answered.length})</button>
          {showAnswered && <div class="list">{answered.map((p) => <PrayerCard p={p} />)}</div>}
        </>
      )}
    </div>
  );
}

function PrayerCard({ p }: { p: Prayer }) {
  const mine = p.author === me.value?.id;
  const [answering, setAnswering] = useState(false);
  const [note, setNote] = useState('');
  const myPrayers = p.prayedBy.filter((x) => x.by === me.value?.id).length;
  const theirPrayers = p.prayedBy.length - myPrayers;
  return (
    <div class={`item ${p.answeredAt ? '' : 'white'}`} style={{ flexDirection: 'column', alignItems: 'stretch', gap: '6px' }}>
      <span class="who">{mine ? 'Your request' : `${nameOf(p.author)}’s request`} · {when(p.createdAt)}</span>
      <p style={{ margin: 0 }}>{p.text}</p>
      {p.answeredAt ? (
        <span class="chip" style={{ alignSelf: 'flex-start' }}><Icon name="sparkle" size="s" />Answered {when(p.answeredAt)}{p.answerNote ? `: ${p.answerNote}` : ''}</span>
      ) : (
        <>
          <span class="tiny muted">{[myPrayers ? `You prayed ${myPrayers}×` : '', theirPrayers ? `${mine ? (partner.value?.name ?? 'They') : 'They'} prayed ${theirPrayers}×` : ''].filter(Boolean).join(' · ') || 'Not prayed for yet'}</span>
          {answering ? (
            <div class="col" style={{ gap: '6px' }}>
              <input class="input" value={note} onInput={(e) => setNote(e.currentTarget.value)} placeholder="How was it answered? (optional)" maxLength={300} />
              <div class="row">
                <button class="btn ghost grow" onClick={() => setAnswering(false)}>Cancel</button>
                <button class="btn good grow" onClick={async () => { const ok = await act('prayer_answer', { id: p.id, note }); if (ok) sfx('win'); }}>Praise God</button>
              </div>
            </div>
          ) : (
            <div class="row">
              {/* Your own requests are for your partner to pray over; you mark them answered. */}
              {!mine && <button class="btn grow small" onClick={async () => { const ok = await act('prayer_pray', { id: p.id }); if (ok) { sfx('bell'); toast(`${nameOf(p.author)} will see you prayed.`, 'love'); } }}><Icon name="pray" size="s" />I prayed</button>}
              {mine && <button class="btn soft grow small" onClick={() => setAnswering(true)}>It was answered</button>}
              {mine && <button class="btn ghost small" onClick={async () => { if (confirm('Remove this request?')) await act('prayer_delete', { id: p.id }); }} aria-label="Remove"><Icon name="close" size="s" /></button>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------- quiet time ----------

function QuietTime() {
  const s = snap.value!;
  const myId = s.me.id;
  const today = dayIn(s.me.tz, new Date());
  const mine = s.devotions.filter((d) => d.author === myId);
  const doneToday = mine.find((d) => d.day === today);
  const theirShared = s.devotions.filter((d) => d.author !== myId && d.shared).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
  const days: { d: string; on: boolean }[] = [];
  let d = today;
  for (let i = 0; i < 7; i++) { days.unshift({ d, on: mine.some((x) => x.day === d) }); d = prevDay(d); }
  const nudges = s.events.filter((e) => e.kind === 'nudge' && e.actor !== myId).slice(-3).reverse();
  const streak = doneToday || mine.some((x) => x.day === prevDay(today)) ? s.me.devotionStreak : 0;
  return (
    <div class="col">
      <div class="item white" style={{ alignItems: 'center' }}>
        <div class="grow col" style={{ gap: '4px' }}>
          <span>Your streak: <b style={{ fontWeight: 'normal', color: 'var(--accent)' }}>{streak} day{streak === 1 ? '' : 's'}</b></span>
          <div class="streak">{days.map((x) => <i class={x.on ? 'on' : ''} title={x.d} />)}</div>
        </div>
        {partner.value && <span class="tiny muted center" style={{ maxWidth: '96px' }}>{partner.value.name}: {partner.value.devotionStreak}-day streak</span>}
      </div>
      {nudges.map((n) => (
        <div class="item" style={{ background: '#FFF2F4' }}>
          <Icon name={n.payload.kind === 'verse' ? 'bible' : 'heart'} size="s" />
          <div class="grow"><span class="who">{nameOf(n.actor)} · {ago(n.createdAt)}</span><p>{String(n.payload.text)}{n.payload.ref ? ` (${String(n.payload.ref)})` : ''}</p></div>
        </div>
      ))}
      {doneToday ? (
        <div class="item col" style={{ alignItems: 'stretch' }}>
          <span><Icon name="check" size="s" /> Done for today: {doneToday.passage}</span>
          {doneToday.reflection && <p>{doneToday.reflection}</p>}
          <span class="tiny muted">{doneToday.shared ? `Shared with ${partner.value?.name ?? 'your partner'}` : 'Kept private'}. See you tomorrow.</span>
        </div>
      ) : <CheckIn />}
      {partner.value && <Encourage />}
      {theirShared.length > 0 && (
        <>
          <span class="small muted">{partner.value?.name} shared</span>
          <div class="list">{theirShared.map((dv) => <SharedDevotion d={dv} />)}</div>
        </>
      )}
      <p class="tiny muted">Quiet time is your own time with the Lord. Your partner sees your streak, and your notes only if you share them.</p>
    </div>
  );
}

function SharedDevotion({ d }: { d: Devotion }) {
  return (
    <div class="item">
      <Icon name="bible" size="s" />
      <div class="grow"><span class="who">{when(d.createdAt)} · {d.passage}</span>{d.reflection && <p>{d.reflection}</p>}</div>
    </div>
  );
}

function CheckIn() {
  const [ref, setRef] = useState('');
  const [passage, setPassage] = useState<Passage | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [reflection, setReflection] = useState('');
  const [shared, setShared] = useState(false);
  const look = async () => {
    const r = parseRef(ref);
    if (!r) { setErr('Try something like “John 3:16” or “Psalm 23”.'); return; }
    setErr(''); setLoading(true);
    try { setPassage(await backend.passage(r.book, r.chapter, r.from, r.to)); } catch (e) { setErr(e instanceof Error ? e.message : 'Couldn’t load that.'); setPassage(null); }
    setLoading(false);
  };
  const submit = async () => {
    const r = parseRef(ref);
    const label = passage?.ref ?? (r ? ref.trim() : ref.trim());
    const res = await act('devotion', { passage: label, reflection, shared });
    if (res) { sfx('win'); toast('Quiet time logged. Well done.', 'love'); }
  };
  return (
    <div class="item white col" style={{ alignItems: 'stretch', gap: '8px' }}>
      <span>Today’s quiet time</span>
      <div class="row">
        <input class="input grow" value={ref} onInput={(e) => setRef(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === 'Enter') void look(); }} placeholder="What did you read? e.g. Psalm 23" />
        <button class="btn soft" disabled={!ref.trim() || loading} onClick={look}>{loading ? '…' : 'Open'}</button>
      </div>
      {err && <span class="tiny" style={{ color: 'var(--bad)' }}>{err}</span>}
      {passage && (
        <div class="pbox soft" style={{ padding: '10px 12px', maxHeight: '240px', overflowY: 'auto' }}>
          <div class="small" style={{ marginBottom: '4px' }}>{passage.ref} (ESV)</div>
          <div class="verse">{passage.verses.map((v) => <span><sup>{v.n}</sup>{v.text} </span>)}</div>
          <p class="copyright">{passage.copyright}</p>
        </div>
      )}
      <textarea class="input" rows={3} value={reflection} maxLength={2000} onInput={(e) => setReflection(e.currentTarget.value)} placeholder="A thought, a prayer, what stood out (optional)" />
      <label class="row small" style={{ cursor: 'pointer' }}>
        <input type="checkbox" checked={shared} onChange={(e) => setShared(e.currentTarget.checked)} />
        Share this with {partner.value?.name ?? 'my partner'}
      </label>
      <button class="btn" disabled={!ref.trim()} onClick={submit}><Icon name="check" size="s" />Check in</button>
    </div>
  );
}

function Encourage() {
  const [mode, setMode] = useState<'none' | 'word' | 'verse'>('none');
  const [text, setText] = useState('');
  const [ref, setRef] = useState(NUDGE_VERSES[0]);
  const name = partner.value!.name;
  const send = async (kind: 'encourage' | 'verse') => {
    const ok = await act('nudge', kind === 'verse' ? { kind, text: text || `A verse for you today`, ref } : { kind, text });
    if (ok) { sfx('heart'); toast(`Sent to ${name}.`, 'love'); setMode('none'); setText(''); }
  };
  if (mode === 'none') return (
    <div class="row">
      <button class="btn soft grow small" onClick={() => setMode('word')}><Icon name="heart" size="s" />Encourage {name}</button>
      <button class="btn soft grow small" onClick={() => setMode('verse')}><Icon name="bible" size="s" />Send a verse</button>
    </div>
  );
  return (
    <div class="item white col" style={{ alignItems: 'stretch', gap: '8px' }}>
      {mode === 'word' ? (
        <>
          <div class="row wrap" style={{ gap: '6px' }}>
            {['Proud of you for showing up 💛', 'Praying for your time with Him today', 'Let’s both do quiet time tonight?'].map((t) => <button class="tab" onClick={() => setText(t)}>{t}</button>)}
          </div>
          <textarea class="input" rows={2} value={text} maxLength={280} onInput={(e) => setText(e.currentTarget.value)} placeholder="A few kind words" />
        </>
      ) : (
        <>
          <select class="input" value={ref} onChange={(e) => setRef(e.currentTarget.value)}>{NUDGE_VERSES.map((v) => <option value={v}>{v}</option>)}</select>
          <input class="input" value={text} maxLength={280} onInput={(e) => setText(e.currentTarget.value)} placeholder="Add a note (optional)" />
        </>
      )}
      <div class="row">
        <button class="btn ghost grow" onClick={() => setMode('none')}>Cancel</button>
        <button class="btn grow" disabled={mode === 'word' && !text.trim()} onClick={() => send(mode === 'verse' ? 'verse' : 'encourage')}><Icon name="send" size="s" />Send</button>
      </div>
    </div>
  );
}

/** A little pixel notebook: cloth spine, page edges, a label and an elastic band. */
function NotebookCover({ color, pages }: { color: string; pages: number }) {
  return (
    <svg viewBox="0 0 60 26" class="nb-cover" shape-rendering="crispEdges" aria-hidden="true" preserveAspectRatio="xMidYMid meet">
      <rect x="0" y="0" width="60" height="26" fill="color-mix(in srgb, var(--soft) 80%, #fff)" />
      <rect x="17" y="3" width="28" height="21" fill="var(--outline)" />
      <rect x="18" y="4" width="27" height="19" fill="#F6EEDC" />
      {pages > 0 && <rect x="44" y="5" width="1" height="17" fill="#D9CDB4" />}
      <rect x="17" y="3" width="26" height="20" fill="var(--outline)" />
      <rect x="18" y="4" width="24" height="18" fill={color} />
      <rect x="18" y="4" width="4" height="18" fill="rgba(0,0,0,.22)" />
      <rect x="22" y="4" width="1" height="18" fill="rgba(255,255,255,.18)" />
      <rect x="18" y="4" width="24" height="1" fill="rgba(255,255,255,.25)" />
      <rect x="25" y="8" width="13" height="6" fill="var(--outline)" />
      <rect x="26" y="9" width="11" height="4" fill="#FFF8EA" />
      <rect x="27" y="10" width="7" height="1" fill="#C9B9A0" />
      <rect x="38" y="4" width="2" height="18" fill="rgba(0,0,0,.35)" />
    </svg>
  );
}
