import { gqlFetch } from '@/lib/graphql';
import { HOME_SUMMARY } from '@/lib/queries/home';
import { sumUpokt } from '@/lib/tx';
import type { SupplyNode } from '@/lib/data/blocks';

export interface HomeSummary {
  supplyUpokt: string | null;
  relays24h: string | null;
  cu24h: string | null;
  stakedActors: number | null;
  latestHeight: string | null;
}

/**
 * Network summary cards (§6 home): supply + 24h relays/CU + staked-actor count. ISR 15s.
 * NOTE: relays24h/cu24h are the ESTIMATED (relay-mining difficulty-scaled) totals — the query
 * aliases totalEstimatedRelays/totalEstimatedComputedUnits onto these keys so the figures match the
 * ecosystem-standard throughput shown by PoktScan (on-chain "claimed" totals are ~2.5x lower).
 */
export async function getHomeSummary(): Promise<HomeSummary> {
  const end = new Date();
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  const data = await gqlFetch<{
    lastBlock: {
      nodes: {
        height: string;
        stakedApps: number;
        stakedGateways: number;
        stakedSuppliers: number;
        supplies?: { nodes: SupplyNode[] };
      }[];
    };
    window: { aggregates: { sum: { totalRelays: string | null; totalComputedUnits: string | null } } };
  }>(HOME_SUMMARY, { last24HourDate: start.toISOString(), currentDate: end.toISOString() }, { revalidate: 15 });

  const lb = data.lastBlock.nodes[0];
  const supply = lb?.supplies?.nodes?.length ? sumUpokt(lb.supplies.nodes.map((n) => n.supply)).toString() : null;
  const stakedActors = lb ? Number(lb.stakedSuppliers) + Number(lb.stakedApps) + Number(lb.stakedGateways) : null;

  return {
    supplyUpokt: supply,
    relays24h: data.window.aggregates?.sum?.totalRelays ?? null,
    cu24h: data.window.aggregates?.sum?.totalComputedUnits ?? null,
    stakedActors,
    latestHeight: lb?.height ?? null,
  };
}
