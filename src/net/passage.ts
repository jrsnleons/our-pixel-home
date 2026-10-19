// Looks up one chapter of the ESV through our /api/passage proxy (bolls.life behind it) and
// returns only the verses asked for. Nothing is stored: each lookup is fetched fresh.

import { BOOKS, ESV_NOTICE, formatRef } from '../data/bible';
import type { Passage } from './backend';

interface BollsVerse { pk: number; verse: number; text: string }

export function cleanVerse(html: string): string {
  return html
    .replace(/<sup[^>]*>.*?<\/sup>/gi, '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export async function fetchPassage(book: number, chapter: number, from?: number, to?: number): Promise<Passage> {
  if (!(book >= 1 && book <= 66) || !(chapter >= 1 && chapter <= BOOKS[book - 1][1])) throw new Error('That chapter doesn’t exist.');
  const res = await fetch(`/api/passage?book=${book}&chapter=${chapter}`);
  if (!res.ok) throw new Error('Couldn’t reach the Bible text right now. Check your connection and try again.');
  const data = (await res.json()) as BollsVerse[];
  const verses = data
    .filter((v) => (from == null || v.verse >= from) && (to == null || v.verse <= to))
    .map((v) => ({ n: v.verse, text: cleanVerse(v.text) }));
  if (!verses.length) throw new Error('Those verses aren’t in that chapter.');
  return { ref: formatRef({ book, chapter, from, to }), verses, copyright: ESV_NOTICE };
}
