import { NextResponse, type NextRequest } from 'next/server';
import { resolveSuggestions } from '@/lib/data/search';
import { isNetwork } from '@/lib/networks';

// The global search's lookahead: GET /api/search?network=main&q=<query> → the views the query resolves to
// (lib/data/search.ts). A server route rather than browser GraphQL because an address's roles include its staking
// delegations, which only the server-side LCD knows, and because it reuses the account page's own role logic.
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const network = sp.get('network');
  const q = sp.get('q') ?? '';
  if (!isNetwork(network) || q.length > 128) return NextResponse.json({ error: 'invalid query' }, { status: 400 });
  try {
    return NextResponse.json(await resolveSuggestions(network, q), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error(`Search lookahead failed for ${JSON.stringify(q)}: ${(e as Error).message}`);
    return NextResponse.json({ error: 'lookup failed' }, { status: 502 });
  }
}
