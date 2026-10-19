// Vercel function: GET /api/passage?book=43&chapter=3 → that ESV chapter from bolls.life.
// Only validated book/chapter numbers are forwarded, and responses are never cached on the
// CDN, so the app never stores or bulk-copies the ESV text.

export const config = { runtime: 'edge' };

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const book = Number(url.searchParams.get('book'));
  const chapter = Number(url.searchParams.get('chapter'));
  if (!Number.isInteger(book) || book < 1 || book > 66 || !Number.isInteger(chapter) || chapter < 1 || chapter > 150) {
    return new Response(JSON.stringify({ error: 'bad reference' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }
  const upstream = await fetch(`https://bolls.life/get-text/ESV/${book}/${chapter}/`, { headers: { accept: 'application/json' } });
  if (!upstream.ok) return new Response(JSON.stringify({ error: 'upstream' }), { status: 502, headers: { 'content-type': 'application/json' } });
  return new Response(await upstream.text(), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'private, max-age=600' },
  });
}
