// Latin letters only: the game is in English, and the full sets (Japanese, Cyrillic) would add
// over a megabyte of fonts for an installed app to download and keep.
import '@fontsource/pixelify-sans/latin-400.css';
import '@fontsource/pixelify-sans/latin-ext-400.css';
import '@fontsource/tiny5/latin-400.css';
import '@fontsource/tiny5/latin-ext-400.css';
import '@fontsource/jersey-10/latin-400.css';
import '@fontsource/jersey-10/latin-ext-400.css';
import '@fontsource/dotgothic16/latin-400.css';
import '@fontsource/dotgothic16/latin-ext-400.css';
import '@fontsource/vt323/latin-400.css';
import '@fontsource/vt323/latin-ext-400.css';
import './styles/app.css';
import { render } from 'preact';
import { listenForInstall, registerServiceWorker } from './state/pwa';
import { setBackend } from './state/store';
import { App } from './ui/App';

async function boot() {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (url && key) {
    const { SupabaseBackend } = await import('./net/supabase');
    setBackend(new SupabaseBackend(url, key));
  } else {
    const { LocalBackend } = await import('./net/local');
    setBackend(new LocalBackend());
  }
  const root = document.getElementById('app')!;
  root.textContent = ''; // the placeholder icon from index.html
  render(<App />, root);
  listenForInstall();
  // iOS Safari ignores user-scalable=no; a pinch is the room's zoom, never the page's.
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  if ('serviceWorker' in navigator && import.meta.env.PROD) void registerServiceWorker();
}

void boot();
