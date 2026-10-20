// Top level: picks the screen for where you are (sign in, make avatar, pair, home) and wires
// the backend's realtime events into the store.

import { useSignalEffect } from '@preact/signals';
import { useEffect, useState } from 'preact/hooks';
import { setSfx } from '../audio/audio';
import { backend, coupleId, markFeedSeen, merge, partnerLastSeen, partnerOnline, phase, prefs, route, snap, suggestedName, toasts } from '../state/store';
import { Icon } from './kit';
import { Home, deliverLive } from './screens/Home';
import { Boot, MakeProfile, Pair, SignIn } from './screens/Onboarding';
import { applyTheme } from './theme';

export function App() {
  const [entered, setEntered] = useState(false);

  useSignalEffect(() => { applyTheme(prefs.value.theme); });
  useEffect(() => { setSfx(prefs.value.sfx); }, []);

  // Work out where to start.
  useEffect(() => {
    route().catch((e) => { console.error(e); phase.value = 'signin'; });
  }, []);

  // Realtime once there's a couple.
  useSignalEffect(() => {
    const cid = coupleId.value;
    if (!cid) return;
    const off = backend.subscribe({
      patch: (p) => merge(p),
      live: (m) => deliverLive(m),
      presence: (on, at) => { partnerOnline.value = on; if (at) partnerLastSeen.value = at; },
    });
    return off;
  });

  const p = phase.value;
  return (
    <div class="stage">
      {p === 'boot' || !entered ? <Boot onEnter={() => setEntered(true)} />
        : p === 'signin' ? <SignIn />
        : p === 'profile' ? <MakeProfile suggested={suggestedName.value} />
        : p === 'pair' ? <Pair onDone={() => { markFeedSeen(); phase.value = 'home'; }} />
        : p === 'archived' ? <Archived />
        : snap.value?.couple ? <Home /> : null}
      <div class="toasts" aria-live="polite">
        {toasts.value.map((t) => <div class={`toast ${t.kind}`}>{t.kind === 'coins' ? <Icon name="coin" size="s" /> : t.kind === 'love' ? <Icon name="heart" size="s" /> : null}{t.text}</div>)}
      </div>
      <div class="rotate-notice"><div><Icon name="rotate" size="l" /><p>Turn your phone upright.<br />Our Pixel Home is made for portrait.</p></div></div>
    </div>
  );
}

function Archived() {
  return (
    <div class="screen boot" style={{ cursor: 'default' }}>
      <div class="pbox col" style={{ padding: '18px', maxWidth: '340px' }}>
        <h2 style={{ fontWeight: 'normal', margin: 0 }}>This home is archived</h2>
        <p class="small" style={{ margin: 0 }}>You can bring it back for free within 30 days of archiving it.</p>
        <button class="btn" onClick={async () => { const { act } = await import('../state/store'); const ok = await act('restore', {}); if (ok) location.reload(); }}>Restore our home</button>
        <button class="btn ghost small" onClick={async () => { await backend.signOut(); location.reload(); }}>Sign out</button>
      </div>
    </div>
  );
}
