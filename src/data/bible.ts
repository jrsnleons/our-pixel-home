// Books of the Bible in canonical order (bolls.life numbers them 1-66), with chapter counts,
// and a forgiving reference parser: "jn 3:16", "Psalm 23", "1 Cor 13:4-7".

export const BOOKS: [name: string, chapters: number, aliases: string[]][] = [
  ['Genesis', 50, ['gen', 'gn']], ['Exodus', 40, ['ex', 'exo']], ['Leviticus', 27, ['lev', 'lv']], ['Numbers', 36, ['num', 'nm']], ['Deuteronomy', 34, ['deut', 'dt']],
  ['Joshua', 24, ['josh', 'jos']], ['Judges', 21, ['judg', 'jdg']], ['Ruth', 4, ['ru', 'rth']], ['1 Samuel', 31, ['1 sam', '1sa', '1 sa']], ['2 Samuel', 24, ['2 sam', '2sa', '2 sa']],
  ['1 Kings', 22, ['1 kgs', '1ki', '1 ki']], ['2 Kings', 25, ['2 kgs', '2ki', '2 ki']], ['1 Chronicles', 29, ['1 chr', '1ch']], ['2 Chronicles', 36, ['2 chr', '2ch']], ['Ezra', 10, ['ezr']],
  ['Nehemiah', 13, ['neh']], ['Esther', 10, ['est', 'esth']], ['Job', 42, ['jb']], ['Psalms', 150, ['psalm', 'ps', 'psa', 'pss']], ['Proverbs', 31, ['prov', 'pr', 'prv']],
  ['Ecclesiastes', 12, ['eccl', 'ecc', 'qoh']], ['Song of Solomon', 8, ['song', 'sos', 'song of songs', 'sg']], ['Isaiah', 66, ['isa', 'is']], ['Jeremiah', 52, ['jer', 'je']], ['Lamentations', 5, ['lam', 'la']],
  ['Ezekiel', 48, ['ezek', 'eze']], ['Daniel', 12, ['dan', 'dn']], ['Hosea', 14, ['hos']], ['Joel', 3, ['jl']], ['Amos', 9, ['am']],
  ['Obadiah', 1, ['obad', 'ob']], ['Jonah', 4, ['jon']], ['Micah', 7, ['mic']], ['Nahum', 3, ['nah']], ['Habakkuk', 3, ['hab']],
  ['Zephaniah', 3, ['zeph', 'zep']], ['Haggai', 2, ['hag']], ['Zechariah', 14, ['zech', 'zec']], ['Malachi', 4, ['mal']],
  ['Matthew', 28, ['matt', 'mt']], ['Mark', 16, ['mk', 'mrk']], ['Luke', 24, ['lk', 'luk']], ['John', 21, ['jn', 'jhn']], ['Acts', 28, ['ac']],
  ['Romans', 16, ['rom', 'ro']], ['1 Corinthians', 16, ['1 cor', '1co']], ['2 Corinthians', 13, ['2 cor', '2co']], ['Galatians', 6, ['gal']], ['Ephesians', 6, ['eph']],
  ['Philippians', 4, ['phil', 'php']], ['Colossians', 4, ['col']], ['1 Thessalonians', 5, ['1 thess', '1th']], ['2 Thessalonians', 3, ['2 thess', '2th']], ['1 Timothy', 6, ['1 tim', '1ti']],
  ['2 Timothy', 4, ['2 tim', '2ti']], ['Titus', 3, ['tit']], ['Philemon', 1, ['philem', 'phm']], ['Hebrews', 13, ['heb']], ['James', 5, ['jas', 'jm']],
  ['1 Peter', 5, ['1 pet', '1pe']], ['2 Peter', 3, ['2 pet', '2pe']], ['1 John', 5, ['1 jn', '1jn']], ['2 John', 1, ['2 jn', '2jn']], ['3 John', 1, ['3 jn', '3jn']],
  ['Jude', 1, ['jud']], ['Revelation', 22, ['rev', 're', 'revelations']],
];

export interface Ref { book: number; chapter: number; from?: number; to?: number }

const norm = (s: string) => s.toLowerCase().replace(/\./g, '').replace(/^(i{1,3})\s/, (m) => `${m.trim().length} `).replace(/\s+/g, ' ').trim();

export function findBook(s: string): number | null {
  const q = norm(s);
  if (!q) return null;
  for (let i = 0; i < BOOKS.length; i++) {
    const [name, , aliases] = BOOKS[i];
    if (norm(name) === q || aliases.includes(q) || aliases.includes(q.replace(/^(\d) /, '$1'))) return i + 1;
  }
  for (let i = 0; i < BOOKS.length; i++) if (norm(BOOKS[i][0]).startsWith(q) && q.length >= 2) return i + 1;
  return null;
}

export function parseRef(input: string): Ref | null {
  const m = input.trim().match(/^(.+?)\s*(\d+)(?::(\d+)(?:\s*[-–]\s*(\d+))?)?$/);
  if (!m) return null;
  const book = findBook(m[1]);
  if (!book) return null;
  const chapter = Number(m[2]);
  if (chapter < 1 || chapter > BOOKS[book - 1][1]) return null;
  const from = m[3] ? Number(m[3]) : undefined;
  const to = m[4] ? Number(m[4]) : from;
  if (from && to && to < from) return null;
  return { book, chapter, from, to };
}

export function formatRef(r: Ref): string {
  const full = BOOKS[r.book - 1][0];
  const name = full === 'Psalms' && r.from ? 'Psalm' : full;
  if (!r.from) return `${name} ${r.chapter}`;
  return r.to && r.to !== r.from ? `${name} ${r.chapter}:${r.from}-${r.to}` : `${name} ${r.chapter}:${r.from}`;
}

export const ESV_NOTICE = 'Scripture quotations are from the ESV® Bible (The Holy Bible, English Standard Version®), © 2001 by Crossway, a publishing ministry of Good News Publishers. Used by permission. All rights reserved.';

/** A few short verses for encouragement nudges, by reference only (the text is looked up). */
export const NUDGE_VERSES = ['Psalm 46:10', 'Isaiah 41:10', 'Lamentations 3:22-23', 'Philippians 4:6-7', 'Joshua 1:9', 'Psalm 119:105', 'Matthew 11:28', 'Romans 8:28', 'Proverbs 3:5-6', '1 Corinthians 13:4-7', 'Zephaniah 3:17', 'Psalm 5:3'];
