import { NetLink as Link } from '@/components/shell/NetLink';
import { Hash } from '@/components/ui/Hash';
import { EmptyState } from '@/components/ui/states';
import { getSupplierRouting } from '@/lib/data/suppliers';
import type { SupplierRole } from '@/lib/data/accounts';
import type { NetworkId } from '@/lib/networks';
import { formatNumber, formatPokt } from '@/lib/format';
import { absoluteUtc, agoFromBlocks } from '@/lib/time';
import { HOME_GATEWAYS } from '@/lib/config';
import { NOT_COVERED_HINT } from '@/lib/data/window';
import { coveredEmpty } from '@/components/ui/SinceNote';

/**
 * Supplier Traffic tab — the "configured vs. actually-served" view. Lists every configured service
 * and, for each, whether it's receiving settled-claim traffic and which gateway(s) route it
 * (reconstructed from claims→app→delegation; the signing gateway isn't on-chain, so this is the
 * authorized-routing inference). Idle services (staked, zero claims) render as a first-class state.
 * Relays, claimed, settled and overserviced come from the settlement catalog (the same figures as the owner fleet
 * table); status, last settled and routing from its per-application rows (getSupplierRouting).
 */
export async function SupplierTrafficPanel({
  network,
  supplier,
  currentHeight,
}: {
  network: NetworkId;
  supplier: SupplierRole;
  currentHeight: number | null;
}) {
  const configured = supplier.serviceConfigs.nodes.map((c) => c.serviceId);
  if (configured.length === 0) {
    return <div className="card flush-top"><EmptyState>No service configs for this supplier.</EmptyState></div>;
  }

  let routing: Awaited<ReturnType<typeof getSupplierRouting>>;
  try {
    routing = await getSupplierRouting(network, supplier.id);
  } catch {
    return <div className="card flush-top"><EmptyState>Couldn’t load traffic right now.</EmptyState></div>;
  }

  if (routing.coverage.notCovered) {
    return <div className="card flush-top"><EmptyState>{NOT_COVERED_HINT}</EmptyState></div>;
  }
  // Past the catalog's end a service without settlements is not covered yet, rather than idle.
  const lagging = routing.coverage.dataUntil != null;

  // Active services first (by the relays shown), then idle (alphabetical).
  const rows = configured
    .map((serviceId) => {
      // One settlement-catalog read gives relays, amounts, last height and routing per service.
      const traffic = routing.byService[serviceId] ?? null;
      return { serviceId, traffic, earned: traffic, relays: traffic?.relays ?? null };
    })
    .sort((a, b) => (b.relays ?? -1) - (a.relays ?? -1) || a.serviceId.localeCompare(b.serviceId));
  // Only the configured services count as receiving traffic: settled claims on a service no longer in the config
  // would otherwise push the count past the number configured.
  const activeCount = rows.filter((r) => r.traffic).length;

  // Gateways of the configured services only, like the service count.
  const gateways = [...new Set(rows.flatMap((r) => r.traffic?.gateways ?? []))];
  const homeMatches = gateways.filter((g) => HOME_GATEWAYS.includes(g)).length;
  const gaps = routing.coverage.gaps.map((g) => `${absoluteUtc(g.from)} – ${absoluteUtc(g.to)}`).join(', ');
  const summary =
    activeCount === 0
      ? lagging
        ? coveredEmpty(routing.coverage, `0 of ${configured.length} services have settled claims`)
        : `Staked but idle — 0 of ${configured.length} services have settled claims.`
      : `${activeCount} of ${configured.length} services receiving traffic · routed via ${gateways.length} gateway${gateways.length === 1 ? '' : 's'}` +
        (HOME_GATEWAYS.length && homeMatches ? ` · ${homeMatches} via your gateway` : '');

  return (
    <div className="card flush-top">
      <div className="kv" style={{ paddingTop: 0 }}>
        <div className="line">
          <div className="k">Traffic</div>
          <div className="v">
            {summary}
            {lagging ? (
              <div className="muted" style={{ marginTop: 4 }}>
                Settlements indexed until {absoluteUtc(routing.coverage.dataUntil!)}; newer ones are not covered yet.
              </div>
            ) : null}
            {routing.coverage.dataSince != null ? (
              <div className="muted" style={{ marginTop: 4 }}>
                Relays and amounts: settlements since {absoluteUtc(routing.coverage.dataSince)}
                {gaps ? ` · not indexed: ${gaps}` : ''}
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <div className="tbl-scroll">
        <table className="tbl">
          <thead>
            <tr>
              <th>Service</th>
              <th>Status</th>
              <th className="num">Relays</th>
              <th className="num">Claimed</th>
              <th className="num">Settled</th>
              <th className="num">Overserviced</th>
              <th>Last settled</th>
              <th>Routed via</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ serviceId, traffic, earned: e, relays }) => {
              const agoBlocks = traffic && traffic.lastBlock != null && currentHeight != null ? currentHeight - traffic.lastBlock : null;
              return (
                <tr key={serviceId}>
                  <td>
                    <Link href={`/service/${serviceId}`} className="mono">{serviceId}</Link>
                  </td>
                  <td>
                    {traffic ? (
                      <span className="statuspill sm s-ok">Active</span>
                    ) : lagging ? (
                      <span className="dim" title={NOT_COVERED_HINT}>—</span>
                    ) : (
                      <span className="muted">Idle</span>
                    )}
                  </td>
                  <td className="num mono">{relays != null ? formatNumber(relays) : <span className="dim">—</span>}</td>
                  <td className="num mono">{e ? `${formatPokt(e.claimedUpokt)} POKT` : <span className="dim">—</span>}</td>
                  <td className="num mono">{e ? `${formatPokt(e.settledUpokt)} POKT` : <span className="dim">—</span>}</td>
                  <td className="num mono">
                    {e && e.overservicedUpokt !== '0' ? <span className="out">{formatPokt(e.overservicedUpokt)} POKT</span> : <span className="dim">—</span>}
                  </td>
                  <td>
                    {traffic && traffic.lastBlock != null ? (
                      <>
                        <Link href={`/block/${traffic.lastBlock}`}>{formatNumber(traffic.lastBlock)}</Link>
                        {agoBlocks != null ? <span className="dim"> · {agoFromBlocks(agoBlocks)}</span> : null}
                      </>
                    ) : (
                      <span className="dim">—</span>
                    )}
                  </td>
                  <td>
                    {traffic && traffic.gateways.length > 0 ? (
                      traffic.gateways.map((gw) => {
                        const isHome = HOME_GATEWAYS.includes(gw);
                        return (
                          <div key={gw} style={{ fontSize: 12, marginBottom: 2 }}>
                            <Hash value={gw} href={`/account/${gw}`} />
                            {isHome ? <span className="statuspill sm s-ok" style={{ marginLeft: 6 }}>✓ your gateway</span> : null}
                          </div>
                        );
                      })
                    ) : (
                      <span className="dim">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
