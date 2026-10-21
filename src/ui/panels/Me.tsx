// Me: your look, the two of you (dates, cities), and settings (theme, effects, sound).

import { useState } from 'preact/hooks';
import { updateNow, updateReady } from '../../state/pwa';
import { InstallRow } from '../overlays/Install';
import { setSfx, sfx } from '../../audio/audio';
import { ESV_NOTICE } from '../../data/bible';
import { THEME_ORDER, THEMES } from '../../data/themes';
import { act, backend, couple, me, partner, partnerOnline, prefs, setPrefs, sheet, snap, toast, tourReplay } from '../../state/store';
import { hasWardrobe } from '../../net/rules';
import { EditorStage } from '../AvatarEditor';
import { Field, Icon, Sheet, Tabs } from '../kit';
import { sceneRef } from '../screens/Home';

type Tab = 'look' | 'us' | 'settings';

export function Me({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('look');
  return (
    <Sheet title={me.value?.name ?? 'Me'} onClose={onClose} size="tall">
      <Tabs value={tab} onChange={(t) => { sfx('tap'); setTab(t); }} options={[{ key: 'look' as Tab, label: 'Look' }, { key: 'us' as Tab, label: 'Us' }, { key: 'settings' as Tab, label: 'Settings' }]} />
      {tab === 'look' && <MyLook />}
      {tab === 'us' && <Us />}
      {tab === 'settings' && <Settings />}
    </Sheet>
  );
}

/** Your look, and where to change it: clothes are changed at a rack, mirror or wardrobe in the room. */
function MyLook() {
  const s = snap.value!;
  const has = hasWardrobe(s);
  return (
    <div class="col">
      <EditorStage look={s.me.look} />
      {has ? (
        <p class="small center" style={{ margin: 0 }}>To change your clothes, hair or face, tap your clothes rack, mirror or wardrobe in the room.</p>
      ) : (
        <>
          <p class="small center" style={{ margin: 0 }}>To change your clothes, hair or face, you’ll need somewhere to get changed. A clothes rack is sold at Maple Furnishings on Maple Street, out your front door.</p>
        </>
      )}
      <p class="small center muted" style={{ margin: 0 }}>New clothes arrive at The Boutique every Monday.</p>
    </div>
  );
}

function Us() {
  const s = snap.value!;
  const c = couple.value!;
  const [name, setName] = useState(s.me.name);
  const [city, setCity] = useState(s.me.city ?? '');
  return (
    <div class="col">
      <Field label="Your name"><input class="input" value={name} maxLength={24} onInput={(e) => setName(e.currentTarget.value)} /></Field>
      <Field label="Your city (for the clock and globe)"><input class="input" value={city} maxLength={30} onInput={(e) => setCity(e.currentTarget.value)} placeholder="Manila" /></Field>
      <button class="btn soft" disabled={name === s.me.name && city === (s.me.city ?? '')} onClick={() => act('set_profile', { name, city: city.trim() || null, tz: Intl.DateTimeFormat().resolvedOptions().timeZone })}>Save</button>
      <div class="hr" />
      <Field label="Together since"><input class="input" type="date" value={c.since ?? ''} max={new Date().toISOString().slice(0, 10)} onChange={(e) => act('set_couple', { since: e.currentTarget.value || null })} /></Field>
      <Field label="Next time you see each other"><input class="input" type="date" value={c.nextVisit ?? ''} min={new Date().toISOString().slice(0, 10)} onChange={(e) => act('set_couple', { nextVisit: e.currentTarget.value || null })} /></Field>
      <div class="hr" />
      {partner.value ? (
        <div class="item white">
          <span class={`dot ${partnerOnline.value ? 'on' : ''}`} style={{ marginTop: '6px' }} />
          <div class="grow">
            <div>{partner.value.name}</div>
            <div class="tiny muted">{partner.value.city ? `${partner.value.city} · ` : ''}{new Date().toLocaleTimeString(undefined, { timeZone: partner.value.tz, hour: 'numeric', minute: '2-digit' })} their time</div>
          </div>
        </div>
      ) : (
        <div class="item white col" style={{ alignItems: 'stretch' }}>
          <span class="small">Your partner joins with this code:</span>
          <div class="code pbox">{c.inviteCode}</div>
        </div>
      )}
      <details>
        <summary class="small muted" style={{ cursor: 'pointer' }}>Leave this home</summary>
        <p class="small">This archives the home for both of you. You can bring it back for free within 30 days.</p>
        <button class="btn bad small" onClick={async () => { if (confirm('Archive your home? You can restore it within 30 days.')) { const ok = await act('unpair', {}); if (ok) location.reload(); } }}>Archive our home</button>
      </details>
    </div>
  );
}

function Settings() {
  const p = prefs.value;
  return (
    <div class="col">
      <span class="small muted">Theme</span>
      <div class="grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
        {THEME_ORDER.map((k) => {
          const T = THEMES[k];
          return (
            <button class="card" aria-selected={p.theme === k} onClick={() => { sfx('tap'); setPrefs({ theme: k }); }} style={{ alignItems: 'stretch', fontFamily: T.font }}>
              <div style={{ display: 'flex', height: '34px' }}>
                {[T.ui.bg, T.wall.tint, T.ui.accent, T.blanket, T.mood.backdrop].map((c) => <i style={{ flex: 1, background: c }} />)}
              </div>
              <span style={{ fontSize: `${T.fontScale}em` }}>{T.name}</span>
              <span class="tiny" style={{ opacity: 0.75, fontFamily: 'var(--read-font), system-ui', lineHeight: 1.2 }}>{T.blurb}</span>
            </button>
          );
        })}
      </div>
      <div class="hr" />
      <InstallRow />
      {updateReady.value && <button class="btn soft small" onClick={updateNow}><Icon name="sparkle" size="s" />A new version is ready · Update now</button>}
      <Toggle label="HD-2D effects" hint="Glow, depth blur and color. Turn off on older phones." on={p.effects} set={(v) => setPrefs({ effects: v })} />
      <Toggle label="Battery saver" hint="Runs the room at 30 frames a second." on={p.battery} set={(v) => setPrefs({ battery: v })} />
      <Toggle label="Easy-read text" hint="Notes, prayers and Bible passages in your phone’s normal font." on={p.easyRead} set={(v) => setPrefs({ easyRead: v })} />
      <Toggle label="Sound effects" on={p.sfx} set={(v) => { setPrefs({ sfx: v }); setSfx(v); }} />
      <label class="field"><span>Music volume</span><input type="range" min={0} max={1} step={0.05} value={p.music} onInput={(e) => setPrefs({ music: Number(e.currentTarget.value) })} /></label>
      <button class="btn soft small" onClick={() => { sceneRef?.r.resetQuality(); toast('Graphics reset to the best your phone can do.'); }}>Reset graphics quality</button>
      <button class="btn soft small" onClick={() => { sfx('tap'); sheet.value = null; tourReplay.value = true; }}>Show the quick tour again</button>
      {backend.mode === 'preview' && backend.setPartnerOnline && (
        <Toggle label="Preview: Sam is online" hint="Turn off to see Sam asleep." on={partnerOnline.value} set={(v) => backend.setPartnerOnline!(v)} />
      )}
      <div class="hr" />
      <button class="btn ghost small" onClick={async () => { if (confirm(backend.mode === 'preview' ? 'Reset the preview? Everything here will be cleared.' : 'Sign out?')) { await backend.signOut(); location.reload(); } }}>{backend.mode === 'preview' ? 'Reset preview' : 'Sign out'}</button>
      <p class="copyright">{ESV_NOTICE}</p>
      <p class="tiny muted">Our Pixel Home · made for the two of you <Icon name="heart" size="s" /></p>
    </div>
  );
}

function Toggle({ label, hint, on, set }: { label: string; hint?: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <label class="row" style={{ cursor: 'pointer', alignItems: 'flex-start' }}>
      <div class="grow"><div>{label}</div>{hint && <div class="tiny muted">{hint}</div>}</div>
      <button class={`btn small ${on ? 'good' : 'soft'}`} style={{ minWidth: '58px' }} onClick={(e) => { e.preventDefault(); sfx('tap'); set(!on); }} aria-pressed={on}>{on ? 'On' : 'Off'}</button>
    </label>
  );
}
