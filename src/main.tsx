import '@fontsource/pixelify-sans/400.css';
import '@fontsource/tiny5/400.css';
import '@fontsource/jersey-10/400.css';
import '@fontsource/dotgothic16/400.css';
import '@fontsource/vt323/400.css';
import './styles/app.css';
import { render } from 'preact';
import { LocalBackend } from './net/local';
import { setBackend } from './state/store';
import { App } from './ui/App';

async function boot() {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (url && key) {
    const { SupabaseBackend } = await import('./net/supabase');
    setBackend(new SupabaseBackend(url, key));
  } else {
    setBackend(new LocalBackend());
  }
  render(<App />, document.getElementById('app')!);
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    const { registerSW } = await import('virtual:pwa-register');
    registerSW({ immediate: true });
  }
}

void boot();
