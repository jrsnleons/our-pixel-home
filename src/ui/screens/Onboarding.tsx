// First-run screens: tap to enter, sign in, make your avatar, pair with your partner.

import { useEffect, useState } from 'preact/hooks';
import { unlockAudio, sfx } from '../../audio/audio';
import { DEFAULT_LOOK, type AvatarLook } from '../../engine/art/avatar';
import { ActionError } from '../../net/backend';
import { backend, phase, route, snap, toast } from '../../state/store';
import { AvatarEditor, AvatarPreview } from '../AvatarEditor';
import { BootArt } from '../BootArt';
import { Field, Icon } from '../kit';

export function Boot({ onEnter }: { onEnter: () => void }) {
  return (
    <div class="screen boot" onClick={() => { unlockAudio(); sfx('open'); onEnter(); }}>
      <BootArt />
      <div class="title-logo">Our Pixel<br />Home</div>
      <p class="blink" style={{ color: '#fff', textShadow: '2px 2px 0 var(--outline)' }}>Tap to come in</p>
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
  const [look, setLook] = useState<AvatarLook>({ ...DEFAULT_LOOK, hair: (['short', 'bob', 'long', 'curly'] as const)[Math.floor(Math.random() * 4)], hairColor: Math.floor(Math.random() * 5), skin: Math.floor(Math.random() * 6) });
  const [busy, setBusy] = useState(false);
  const owned = new Set(['fit_tee', 'fit_hoodie', 'acc_none', 'acc_glasses']);
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
      <p class="muted small" style={{ marginTop: 0 }}>You can change all of this later in Me.</p>
      <Field label="Your name"><input class="input" value={name} maxLength={24} onInput={(e) => setName(e.currentTarget.value)} placeholder="Name" autocomplete="given-name" /></Field>
      <div style={{ height: '14px' }} />
      <AvatarEditor look={look} onChange={setLook} owned={owned} onlyOwned />
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
      <AvatarPreview look={meP.look} scale={4} />
      <span class={`pair-heart ${joined ? 'on' : ''}`}><Icon name="heart" size="l" /></span>
      {them ? <AvatarPreview look={them.look} scale={4} /> : <div class="avatar-stage pbox soft ghost-partner"><Icon name="me" size="l" /></div>}
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
