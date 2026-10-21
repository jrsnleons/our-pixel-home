// Panels that most visits never open are loaded the first time they are, keeping the app's
// start-up download small.

import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';

export function lazy<P extends object>(load: () => Promise<(props: P) => JSX.Element | null>) {
  let C: ((props: P) => JSX.Element | null) | null = null;
  let loading: Promise<void> | null = null;
  const fetch = () => (loading ??= load().then((c) => { C = c; }, (e) => { loading = null; throw e; }));
  function Lazy(props: P) {
    const [, ready] = useState(0);
    useEffect(() => {
      if (C) return;
      let live = true;
      fetch().then(() => { if (live) ready(1); }, (e) => console.error(e));
      return () => { live = false; };
    }, []);
    return C ? <C {...props} /> : null;
  }
  /** Start downloading now, ahead of need. */
  Lazy.preload = () => { void fetch().catch(() => {}); };
  return Lazy;
}
