import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { NETWORK_IDS, DEFAULT_NETWORK, networkPrefix } from '@/lib/networks';

// Network routing (§ network-switcher). Routes live under `app/[network]/`. The DEFAULT network
// (mainnet) is prefix-less in the browser; every other network keeps its `/<id>` prefix.
//
//   /block/1        → rewritten internally to /main/block/1   (browser URL stays /block/1)
//   /beta/block/1   → passed through to             /beta/block/1
//   /main/block/1   → redirected to                 /block/1  (canonicalise the default away)
//
// Rewrite (not redirect) for the default keeps the clean URL while the [network] segment still
// receives `network=main`, so per-network ISR cache keys stay distinct without a dynamic read.

// Non-default networks that keep a visible URL prefix.
const PREFIXED = NETWORK_IDS.filter((id) => networkPrefix(id) !== '');

// Root-level routes that must NOT be network-prefixed (metadata + static-file conventions).
const RESERVED = new Set(['/icon', '/apple-icon', '/opengraph-image']);
const ASSET_FILE = /\.[a-z0-9]+$/i; // anything ending in a file extension (.svg, .ico, .webmanifest…)

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Leave Next internals, API routes, metadata routes, and static files alone.
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    RESERVED.has(pathname) ||
    ASSET_FILE.test(pathname)
  ) {
    return;
  }

  // Canonicalise: a direct hit on the internal default segment redirects to the clean URL.
  const defaultSeg = `/${DEFAULT_NETWORK}`;
  if (pathname === defaultSeg || pathname.startsWith(`${defaultSeg}/`)) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.slice(defaultSeg.length) || '/';
    return NextResponse.redirect(url);
  }

  // A visible non-default network prefix (e.g. /beta) is already in the right shape — pass through.
  for (const id of PREFIXED) {
    if (pathname === `/${id}` || pathname.startsWith(`/${id}/`)) return;
  }

  // Everything else is default-network content: rewrite onto the internal default segment.
  const url = request.nextUrl.clone();
  url.pathname = `${defaultSeg}${pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  // Run on everything except Next internals and the favicon; finer exclusions handled above.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
