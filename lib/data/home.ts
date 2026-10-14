import { gqlFetch } from '@/lib/graphql';
import type { NetworkId } from '@/lib/networks';
import { HOME_SUMMARY } from '@/lib/queries/home';
import { sumUpokt } from '@/lib/tx';
import { getBlockSupplies } from '@/lib/data/blocks';
import { unwrapRange } from '@/lib/data/range';

export interface HomeSummary {
  /** Economic total supply in upokt (minted + claimable-but-unminted). Number is fine for display. */
  supplyUpokt: number | null;
  relays24h: string | null;
  cu24h: string | null;
  stakedActors: number | null;
  latestHeight: string | null;
}

/**
 * Network summary cards (§6 home): supply + 24h relays/CU + staked-actor count. ISR 15s.
 * NOTE: relays24h/cu24h are the ESTIMATED (relay-mining difficulty-scaled) totals — the block
 * statistics' estimated_relays/estimated_compute_units — so the figures match the
 * ecosystem-standard throughput shown by PoktScan (on-chain "claimed" totals are ~2.5x lower).
 */
export async function getHomeSummary(network: NetworkId): Promise<HomeSummary> {
  const end = new Date();
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  // getTotalSupplyByDay returns one row per UTC day; span ~2 days so a row always exists and
  // take the latest. (The function may not have computed today's row early in the UTC day.)
  const supplyStart = new Date(end.getTime() - 48 * 60 * 60 * 1000);
  const data = await gqlFetch<{
    supply: { day: string; total_supply: number | null }[] | null;
    lastBlock: {
      nodes: {
        height: string;
        stakedApps: number;
        stakedGateways: number;
        stakedSuppliers: number;
      }[];
    };
    window: unknown;
  }>(
    network,
    HOME_SUMMARY,
    {
      last24HourDate: start.toISOString(),
      currentDate: end.toISOString(),
      supplyStartDate: supplyStart.toISOString(),
      supplyEndDate: end.toISOString(),
    },
    { revalidate: 15 },
  );

  const lb = data.lastBlock.nodes[0];

  // Economic total supply (minted + claimable-but-unminted Morse claims). Fall back to the
  // already-minted on-chain supply (the last block's supply rows) if getTotalSupplyByDay is unavailable.
  const supplyRows = data.supply ?? [];
  const latestSupply = supplyRows.length ? supplyRows[supplyRows.length - 1]?.total_supply : null;
  const lbSupplies = latestSupply == null && lb ? await getBlockSupplies(network, lb.height).catch(() => []) : [];
  const fallback = lbSupplies.length ? Number(sumUpokt(lbSupplies.map((n) => n.supply))) : null;
  const supplyUpokt = latestSupply != null ? Number(latestSupply) : fallback;
  const window = unwrapRange<{ estimated_relays: string | null; estimated_compute_units: string | null }[]>(data.window).data?.[0];

  const stakedActors = lb ? Number(lb.stakedSuppliers) + Number(lb.stakedApps) + Number(lb.stakedGateways) : null;

  return {
    supplyUpokt,
    relays24h: window?.estimated_relays ?? null,
    cu24h: window?.estimated_compute_units ?? null,
    stakedActors,
    latestHeight: lb?.height ?? null,
  };
}
