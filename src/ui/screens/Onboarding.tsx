// First-run screens: tap to enter, three intro cards, sign in, make your avatar, pair with your partner.

import { useEffect, useState } from 'preact/hooks';
import { unlockAudio, sfx } from '../../audio/audio';
import { ownedClothes } from '../../data/clothes';
import { DEFAULT_LOOK, HAIR_ORDER, type AvatarLook } from '../../engine/art/avatar';
import { ActionError } from '../../net/backend';
import { backend, phase, route, snap, toast } from '../../state/store';
import { AvatarEditor, AvatarPreview } from '../AvatarEditor';
import { BootArt } from '../BootArt';
import { Field, Icon } from '../kit';

/** The title screen. The first time it waits for a tap; after that it's only the loading screen. */
export function Boot({ onEnter, ready }: { onEnter: () => void; ready?: boolean }) {
  return (
    <div class="screen boot" onClick={() => { if (ready) return; unlockAudio(); sfx('open'); onEnter(); }}>
      <BootArt />
      <div class="title-logo">Our Pixel<br />Home</div>
      <p class="blink" style={{ color: '#fff', textShadow: '2px 2px 0 var(--outline)' }}>{ready ? 'Coming home…' : 'Tap to come in'}</p>
    </div>
  );
}

const INTRO = [
  { title: 'A little home for the two of you', text: 'The same cozy room on both of your phones, wherever you are. See each other, send hearts and hang out.', art: 'pair' },
  { title: 'Play, work and decorate together', text: 'Games at the table, café shifts for coins, and furniture from the Store to make the place yours.', art: 'play' },
  { title: 'Keep each other close to God', text: 'Share prayer requests, keep your own quiet time with the Lord, and cheer each other on.', art: 'pray' },
] as const;

const GUY: AvatarLook = { ...DEFAULT_LOOK, hair: 'short', hairColor: 1, skin: 2, wear: { top: 'hoodie:0', bottom: 'joggers:0', shoes: 'sneakers:0' } };
const GIRL: AvatarLook = { ...DEFAULT_LOOK, body: 'girl', hair: 'long', hairColor: 3, skin: 1, wear: { top: 'sundress:0', shoes: 'maryjanes:1', hat: 'bow:1' }, blush: true };

/** Three swipeable cards for someone new, shown once before signing in. */
export function Intro({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const [x0, setX0] = useState<number | null>(null);
  const card = INTRO[i];
  const go = (n: number) => { if (n >= INTRO.length) { sfx('pop'); onDone(); return; } if (n < 0) return; sfx('tap'); setI(n); };
  return (
    <div class="screen boot" style={{ cursor: 'default' }}
      onTouchStart={(e) => setX0(e.touches[0].clientX)}
      onTouchEnd={(e) => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; setX0(null); if (Math.abs(dx) > 40) go(i + (dx < 0 ? 1 : -1)); }}>
      <BootArt />
      <div class="pbox col intro-card" key={i}>
        <div class="intro-art">
          {card.art === 'pair' && (
            <div class="pair-art" style={{ margin: 0 }}>
              <AvatarPreview look={GUY} scale={2} />
              <span class="pair-heart on"><Icon name="heart" size="l" /></span>
              <AvatarPreview look={GIRL} scale={2} />
            </div>
          )}
          {card.art === 'play' && <div class="row intro-icons">{['play', 'work', 'store', 'decorate'].map((n) => <Icon name={n} size="l" />)}</div>}
          {card.art === 'pray' && <div class="row intro-icons">{['pray', 'bible', 'heart'].map((n) => <Icon name={n} size="l" />)}</div>}
        </div>
        <h2 class="center" style={{ fontWeight: 'normal', margin: 0 }}>{card.title}</h2>
        <p class="center small" style={{ margin: 0 }}>{card.text}</p>
        <div class="dots" aria-label={`Card ${i + 1} of ${INTRO.length}`}>{INTRO.map((_, j) => <i class={j === i ? 'on' : ''} />)}</div>
        <div class="row">
          <button class="btn ghost small" onClick={() => { sfx('close'); onDone(); }}>Skip</button>
          <div class="grow" />
          <button class="btn" onClick={() => go(i + 1)}>{i + 1 < INTRO.length ? 'Next' : 'Let’s go'}</button>
        </div>
      </div>
    </div>
  );
}

export function SignIn() {
  const [busy, setBusy] = useState(false);
  const [create, setCreate] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const online = backend.mode === 'online';
  const go = async (e: Event) => {
    e.preventDefault();
    setBusy(true);
    try {
      await backend.signIn(email, password, create);
      sfx('pop');
      await route();
    } catch (err) {
      toast(err instanceof ActionError ? err.message : 'Couldn’t reach the server. Check your connection.', 'error');
      setBusy(false);
    }
  };
  return (
    <div class="screen boot" style={{ cursor: 'default' }}>
      <BootArt />
      <div class="title-logo">Our Pixel<br />Home</div>
      <div class="pbox col" style={{ padding: '18px', width: '100%', maxWidth: '340px' }}>
        <p class="center" style={{ margin: 0 }}>A little home for the two of you, wherever you are.</p>
        {online ? (
          <form class="col" style={{ gap: '10px' }} onSubmit={go}>
            <Field label="Email"><input id="signin-email" class="input" type="email" inputMode="email" autocomplete="email" value={email} onInput={(e) => setEmail(e.currentTarget.value)} required /></Field>
            <Field label={create ? 'Make a password (8+ characters)' : 'Password'}>
              <input id="signin-password" class="input" type="password" minLength={8} autocomplete={create ? 'new-password' : 'current-password'} value={password} onInput={(e) => setPassword(e.currentTarget.value)} required />
            </Field>
            <button class="btn block" type="submit" disabled={busy}>{create ? 'Make my account' : 'Sign in'}</button>
            <button class="btn ghost small block" type="button" disabled={busy} onClick={() => setCreate(!create)}>
              {create ? 'I already have an account' : 'New here? Make an account'}
            </button>
          </form>
        ) : (
          <>
            <button class="btn block" onClick={() => { phase.value = 'profile'; }}>Try the preview</button>
            <p class="tiny muted center" style={{ margin: 0 }}>Preview mode: everything stays on this phone and a pretend partner named Sam keeps you company. Add the Supabase keys to play together for real.</p>
          </>
        )}
      </div>
    </div>
  );
}

export function MakeProfile({ suggested }: { suggested?: string | null }) {
  const [name, setName] = useState(suggested?.split(' ')[0] ?? '');
  const [look, setLook] = useState<AvatarLook>({ ...DEFAULT_LOOK, hair: HAIR_ORDER.guy[Math.floor(Math.random() * 4)], hairColor: Math.floor(Math.random() * 5), skin: Math.floor(Math.random() * 6) });
  const [busy, setBusy] = useState(false);
  const owned = ownedClothes([]);
  const go = async () => {
    if (!name.trim()) { toast('What should your partner call you?', 'error'); return; }
    setBusy(true);
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const me = await backend.createProfile(name, look, tz);
      snap.value = { me, partner: null, couple: null, placements: [], inventory: [], unlocks: [], notebooks: [], pages: [], prayers: [], devotions: [], events: [], quests: [], games: [], today: {} };
      sfx('pop');
      phase.value = 'pair';
    } catch (e) {
      toast(e instanceof ActionError ? e.message : 'Couldn’t save. Try again.', 'error');
      setBusy(false);
    }
  };
  return (
    <div class="screen" style={{ background: 'var(--bg)' }}>
      <h1 style={{ fontWeight: 'normal', margin: '0 0 6px' }}>Make your little you</h1>
      <p class="muted small" style={{ marginTop: 0 }}>Later, a clothes rack or mirror in your room lets you change.</p>
      <Field label="Your name"><input class="input" value={name} maxLength={24} onInput={(e) => setName(e.currentTarget.value)} placeholder="Name" autocomplete="given-name" /></Field>
      <div style={{ height: '14px' }} />
      <AvatarEditor look={look} onChange={setLook} owned={owned} />
      <div style={{ height: '16px' }} />
      <button class="btn block" disabled={busy} onClick={go}>That’s me</button>
    </div>
  );
}

export function Pair({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<'choose' | 'join'>('choose');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const couple = snap.value?.couple;
  const create = async () => {
    setBusy(true);
    try { snap.value = await backend.createCouple(); sfx('open'); } catch (e) { toast(e instanceof ActionError ? e.message : 'Couldn’t make a home. Try again.', 'error'); }
    setBusy(false);
  };
  const join = async () => {
    setBusy(true);
    try { snap.value = await backend.joinCouple(code); sfx('win'); onDone(); } catch (e) { toast(e instanceof ActionError ? e.message : 'That code didn’t work.', 'error'); setBusy(false); }
  };
  const meP = snap.value?.me;
  const them = snap.value?.partner;
  // When your partner types the code in, celebrate for a beat and walk in together.
  const joined = !!couple?.b;
  useEffect(() => {
    if (!joined || mode === 'join') return;
    sfx('win');
    const t = setTimeout(onDone, 1800);
    return () => clearTimeout(t);
  }, [joined]);
  const pairArt = meP && (
    <div class="pair-art">
      <AvatarPreview look={meP.look} scale={2} />
      <span class={`pair-heart ${joined ? 'on' : ''}`}><Icon name="heart" size="l" /></span>
      {them ? <AvatarPreview look={them.look} scale={2} /> : <div class="avatar-stage pbox soft ghost-partner"><Icon name="me" size="l" /></div>}
    </div>
  );
  if (couple && joined) {
    return (
      <div class="screen" style={{ background: 'var(--bg)', justifyContent: 'center' }}>
        {pairArt}
        <h2 class="center" style={{ fontWeight: 'normal' }}>{them?.name ?? 'Your partner'} moved in!</h2>
      </div>
    );
  }
  if (couple && !couple.b) {
    const share = async () => {
      const text = `Come live in our pixel home with me 🏠 Code: ${couple.inviteCode}\n${location.origin}`;
      try { if (navigator.share) await navigator.share({ text }); else { await navigator.clipboard.writeText(text); toast('Copied. Send it to your partner.'); } } catch { /* cancelled */ }
    };
    return (
      <div class="screen" style={{ background: 'var(--bg)', justifyContent: 'center' }}>
        {pairArt}
        <div class="pbox col" style={{ padding: '18px' }}>
          <h2 style={{ fontWeight: 'normal', margin: 0 }}>Your home is ready</h2>
          <p class="small" style={{ margin: 0 }}>Send this code to your partner. When they type it in, you’ll share this home.</p>
          <div class="code pbox">{couple.inviteCode}</div>
          <button class="btn block" onClick={share}><Icon name="send" size="s" /> Send the code</button>
          <p class="tiny muted center blink" style={{ margin: 0 }}>Waiting for them to join…</p>
          <button class="btn ghost block small" onClick={onDone}>Look around while I wait</button>
        </div>
      </div>
    );
  }
  return (
    <div class="screen" style={{ background: 'var(--bg)', justifyContent: 'center' }}>
      {pairArt}
      <div class="pbox col" style={{ padding: '18px' }}>
        <h2 style={{ fontWeight: 'normal', margin: 0 }}>Pair up</h2>
        {mode === 'choose' ? (
          <>
            <p class="small" style={{ margin: 0 }}>One of you makes the home and sends a code. The other joins with it.</p>
            <button class="btn block" disabled={busy} onClick={create}>Make our home</button>
            <button class="btn soft block" onClick={() => setMode('join')}>I have a code</button>
          </>
        ) : (
          <>
            <Field label="Code from your partner"><input class="input" value={code} onInput={(e) => setCode(e.currentTarget.value.toUpperCase())} placeholder="ABCD-1234" autocapitalize="characters" /></Field>
            <button class="btn block" disabled={busy || code.trim().length < 4} onClick={join}>Join their home</button>
            <button class="btn ghost block small" onClick={() => setMode('choose')}>Back</button>
          </>
        )}
      </div>
    </div>
  );
}
