// An item's picture that never blocks the screen: a shimmering placeholder until the
// thumbnail queue (thumbs.ts) has drawn it.

import { useEffect, useState } from 'preact/hooks';
import type { ThemeKey } from '../data/themes';
import { cachedThumb, requestThumb } from './thumbs';

export function ItemThumb({ item, theme, data, alt = '', fallback }: { item: string; theme: ThemeKey; data?: Record<string, unknown> | null; alt?: string; fallback?: preact.ComponentChildren }) {
  const [url, setUrl] = useState<string | undefined>(() => cachedThumb(item, theme, data));
  useEffect(() => {
    let live = true;
    const hit = cachedThumb(item, theme, data);
    setUrl(hit);
    if (hit == null) void requestThumb(item, theme, data).then((u) => { if (live) setUrl(u); });
    return () => { live = false; };
  }, [item, theme, JSON.stringify(data ?? null)]);
  if (url == null) return <span class="shimmer" aria-hidden="true" />;
  if (!url) return <>{fallback ?? null}</>;
  return <img class="thumb-in" src={url} alt={alt} />;
}
