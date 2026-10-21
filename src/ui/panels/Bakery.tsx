// The bakery cart on Maple Street: a few coins for something sweet. With a partner, the treat
// shows up in their feed as something you bought them.

import { useState } from 'preact/hooks';
import { sfx } from '../../audio/audio';
import { TREATS } from '../../data/treats';
import { act, coins, partner, toast } from '../../state/store';
import { Coin, Sheet } from '../kit';

export function Bakery({ onClose }: { onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const them = partner.value?.name;
  const buy = async (key: string, name: string) => {
    if (busy) return;
    setBusy(true);
    sfx('tap');
    const ok = await act('treat', { treat: key });
    setBusy(false);
    if (ok) { sfx('coin'); toast(them ? `${name} for you, and ${them} will hear about it.` : `${name}. Still warm.`, 'love'); }
    else sfx('error');
  };
  return (
    <Sheet title="Bakery cart" onClose={onClose} head={<span class="chip"><Coin n={coins.value.toLocaleString()} /></span>}>
      <p class="tiny muted" style={{ margin: '0 0 8px' }}>{them ? `Buy something sweet. ${them} gets a note that you thought of them.` : 'Something sweet for the walk home.'}</p>
      <div class="col" style={{ gap: '8px' }}>
        {TREATS.map((t) => (
          <div class="card" style={{ textAlign: 'left', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
            <div class="col" style={{ gap: '2px', flex: 1 }}>
              <strong>{t.name}</strong>
              <span class="tiny muted">{t.blurb}</span>
            </div>
            <button class="btn small" disabled={busy || coins.value < t.price} onClick={() => void buy(t.key, t.name)}><Coin n={t.price} /></button>
          </div>
        ))}
      </div>
    </Sheet>
  );
}
