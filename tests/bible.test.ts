import { describe, expect, it } from 'vitest';
import { formatRef, parseRef } from '../src/data/bible';

describe('bible references', () => {
  it('parses common forms', () => {
    expect(parseRef('John 3:16')).toEqual({ book: 43, chapter: 3, from: 16, to: 16 });
    expect(parseRef('jn 3:16-18')).toEqual({ book: 43, chapter: 3, from: 16, to: 18 });
    expect(parseRef('Psalm 23')).toEqual({ book: 19, chapter: 23, from: undefined, to: undefined });
    expect(parseRef('1 Cor 13:4-7')?.book).toBe(46);
    expect(parseRef('I John 4:8')?.book).toBe(62);
    expect(parseRef('rev 22')?.book).toBe(66);
  });
  it('rejects nonsense and out-of-range chapters', () => {
    expect(parseRef('Hello 3')).toBeNull();
    expect(parseRef('Jude 2')).toBeNull();
    expect(parseRef('Psalm 23:5-2')).toBeNull();
  });
  it('formats back', () => {
    expect(formatRef({ book: 19, chapter: 46, from: 10, to: 10 })).toBe('Psalm 46:10');
  });
});
