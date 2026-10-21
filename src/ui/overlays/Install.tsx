// "Add to home screen": the real install dialog where the browser has one, and the Share-menu
// steps on iPhone, where it doesn't. Shown once on the home screen and always in Settings.

import { useState } from 'preact/hooks';
import { sfx } from '../../audio/audio';
import { canPrompt, installable, isIos, promptInstall, standalone } from '../../state/pwa';
import { toast } from '../../state/store';
import { Icon, Sheet } from '../kit';

/** The share glyph Safari uses, so the steps match what's on screen. */
function ShareGlyph() {
  return (
    <svg viewBox="0 0 12 14" width="14" height="16" style={{ verticalAlign: '-3px', shapeRendering: 'crispEdges' }} aria-hidden="true">
      <path fill="currentColor" d="M5 0h2v1h1v1h1v1H7v6H5V3H3V2h1V1h1zM1 5h3v1H2v6h8V6H8V5h3v8H1z" />
    </svg>
  );
}

export function IosSteps({ onClose }: { onClose: () => void }) {
  return (
    <Sheet title="Add to your home screen" onClose={onClose}>
      <div class="col">
        <p class="small" style={{ margin: 0 }}>Our Pixel Home works best from your home screen: full screen, quicker to open, and your room is right where you left it.</p>
        <ol class="small install-steps">
          <li>Open this page in <b>Safari</b>.</li>
          <li>Tap the <b>Share</b> button <ShareGlyph /> at the bottom of the screen.</li>
          <li>Scroll down and tap <b>Add to Home Screen</b>.</li>
          <li>Tap <b>Add</b>, then open Our Pixel Home from its new icon.</li>
        </ol>
        <button class="btn block" onClick={onClose}>Got it</button>
      </div>
    </Sheet>
  );
}

export async function install(showSteps: () => void) {
  sfx('tap');
  if (canPrompt.value) { if (await promptInstall()) toast('Installed! Open it from your home screen.', 'love'); return; }
  if (isIos) showSteps();
}

/** A row for Settings. */
export function InstallRow() {
  const [steps, setSteps] = useState(false);
  if (standalone.value) return <p class="tiny muted" style={{ margin: 0 }}><Icon name="check" size="s" /> Running from your home screen.</p>;
  if (!installable()) return null;
  return (
    <>
      <div class="row" style={{ alignItems: 'flex-start' }}>
        <div class="grow"><div>Add to home screen</div><div class="tiny muted">Full screen, opens in a tap, and works like an app.</div></div>
        <button class="btn small" onClick={() => void install(() => setSteps(true))}><Icon name="plus" size="s" />Add</button>
      </div>
      {steps && <IosSteps onClose={() => setSteps(false)} />}
    </>
  );
}

const SEEN = 'oph.installAsked';

/** A one-time nudge on the home screen, from the second visit on. */
export function InstallNudge() {
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(SEEN) === '1'; } catch { return true; } });
  const [steps, setSteps] = useState(false);
  if ((hidden && !steps) || !installable()) return null;
  const dismiss = () => { setHidden(true); try { localStorage.setItem(SEEN, '1'); } catch { /* private mode */ } };
  return (
    <>
      {!hidden && (
        <div class="install-nudge pbox">
          <Icon name="sparkle" size="s" />
          <span class="small grow">Add Our Pixel Home to your home screen to play like an app.</span>
          <button class="btn small" onClick={() => { dismiss(); void install(() => setSteps(true)); }}>Add</button>
          <button class="btn ghost small icon" aria-label="Not now" onClick={() => { sfx('close'); dismiss(); }}><Icon name="close" size="s" /></button>
        </div>
      )}
      {steps && <IosSteps onClose={() => setSteps(false)} />}
    </>
  );
}
