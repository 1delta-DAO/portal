/**
 * Cloudflare Pages Function: a missing asset is a 404, never a cached page.
 *
 * Without this, a request for `/assets/<hash>.js` that the deployment does not
 * (yet) contain falls through to the single-page-app fallback and comes back as
 * `index.html` with status 200 — and, because the request PATH matches the
 * `/assets/*` rule in `_headers`, with `Cache-Control: immutable, max-age=1y`.
 * A browser that asked for a chunk in the moment before it was published then
 * holds an HTML page in place of that script for a year: every import of it
 * fails, every reload reuses it, and clearing cookies changes nothing. That was
 * the "Failed to fetch dynamically imported module" after every deploy.
 *
 * `_headers` cannot condition on the response, and `_redirects` cannot exempt a
 * path from the fallback, so this is the only place the distinction can be
 * made: let real assets through untouched, and turn a fallback into an honest,
 * uncacheable 404 — which the client-side recovery in `src/utils/lazyChunk.ts`
 * treats as "not published yet" and retries.
 *
 * Cost: one Function invocation per asset request that reaches Cloudflare.
 * Assets are immutable and cached by the browser, so that is roughly once per
 * file per new visitor.
 */
export async function onRequest(context) {
  const response = await context.next()
  const type = response.headers.get('content-type') || ''
  if (response.ok && !/text\/html/i.test(type)) {
    // Real, hashed asset. Restate the long-lived cache policy here rather
    // than trusting it to `_headers`: the docs are equivocal about whether
    // those rules reach a response that passed through a Function, and losing
    // `immutable` on every asset would cost far more than this bug did.
    const headers = new Headers(response.headers)
    headers.set('cache-control', 'public, max-age=31536000, immutable')
    return new Response(response.body, { status: response.status, headers })
  }

  return new Response('Not found', {
    status: 404,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      // Explicit, so no rule elsewhere can make this cacheable.
      'cache-control': 'no-store',
    },
  })
}
