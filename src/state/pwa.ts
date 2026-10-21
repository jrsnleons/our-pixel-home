// Installing the app to the home screen, and taking updates without interrupting play.
//
// Android and desktop Chrome fire `beforeinstallprompt`, which we hold on to so an "Add to home
// screen" button can show the real install dialog. iPhone Safari has no such event, so there
// we explain the Share → Add to Home Screen steps instead. Updates download in the background
// and are applied the next time the app is hidden, so a new version never reloads mid-game.

import { signal } from '@preact/signals';

interface InstallEvent extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
export const isIos = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1);

/** Running from the home screen (or as an installed desktop app). */
export const standalone = signal(
  typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true),
);

let deferred: InstallEvent | null = null;
/** A one-tap install is available (Android, desktop Chrome and Edge). */
export const canPrompt = signal(false);

/** Whether to offer installing at all: not already installed, and either one-tap or iPhone steps. */
export function installable(): boolean {
  return !standalone.value && (canPrompt.value || isIos);
}

export function listenForInstall() {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as InstallEvent; canPrompt.value = true; });
  window.addEventListener('appinstalled', () => { deferred = null; canPrompt.value = false; standalone.value = true; });
  window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', (e) => { standalone.value = e.matches; });
}

/** Show the browser's install dialog. Returns false where there isn't one (iPhone). */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const d = deferred;
  deferred = null; canPrompt.value = false;
  await d.prompt();
  const { outcome } = await d.userChoice;
  return outcome === 'accepted';
}

/** A new version is downloaded and waiting. */
export const updateReady = signal(false);
let applyUpdate: ((reload?: boolean) => Promise<void>) | null = null;

export async function registerServiceWorker() {
  const { registerSW } = await import('virtual:pwa-register');
  applyUpdate = registerSW({
    immediate: true,
    onNeedRefresh() { updateReady.value = true; },
    onRegisteredSW(_url, reg) {
      // Look for a new version every half hour while the app stays open.
      if (reg) setInterval(() => { void reg.update(); }, 30 * 60_000);
    },
  });
  // Apply a waiting update while nobody is looking; the app restores where you were on reload.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && updateReady.value) void applyUpdate?.(true);
  });
}

export function updateNow() { void applyUpdate?.(true); }
