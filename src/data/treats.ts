// What the bakery cart on Maple Street sells. A few coins for something sweet to share.

export interface Treat { key: string; name: string; price: number; blurb: string }

export const TREATS: Treat[] = [
  { key: 'cookie', name: 'Chocolate chip cookie', price: 15, blurb: 'Still a little warm.' },
  { key: 'cocoa', name: 'Hot cocoa', price: 25, blurb: 'With a tiny marshmallow heart.' },
  { key: 'roll', name: 'Cinnamon roll', price: 30, blurb: 'Big enough to split.' },
];

export const TREAT_BY_KEY: Record<string, Treat> = Object.fromEntries(TREATS.map((t) => [t.key, t]));
