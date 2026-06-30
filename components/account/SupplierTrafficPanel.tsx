import { NetLink as Link } from '@/components/shell/NetLink';
import { Hash } from '@/components/ui/Hash';
import { EmptyState } from '@/components/ui/states';
import { getSupplierRouting } from '@/lib/data/suppliers';
import type { SupplierRole } from '@/lib/data/accounts';
import type { NetworkId } from '@/lib/networks';
import { formatNumber } from '@/lib/format';
import { agoFromBlocks } from '@/lib/time';
import { HOME_GATEWAYS } from '@/lib/config';

/**
 * Supplier Traffic tab — the "configured vs. actually-served" view. Lists every configured service
 * and, for each, whether it's receiving settled-claim traffic and which gateway(s) route it
 * (reconstructed from claims→app→delegation; the signing gateway isn't on-chain, so this is the
 * authorized-routing inference). Idle services (staked, zero claims) render as a first-class state.
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

  // Active services first (by relay volume), then idle (alphabetical).
  const rows = configured
    .map((serviceId) => ({ serviceId, traffic: routing.byService[serviceId] ?? null }))
    .sort((a, b) => (b.traffic?.relays ?? -1) - (a.traffic?.relays ?? -1) || a.serviceId.localeCompare(b.serviceId));

  const homeMatches = routing.gateways.filter((g) => HOME_GATEWAYS.includes(g)).length;
  const summary =
    routing.activeCount === 0
      ? `Staked but idle — 0 of ${configured.length} services have settled claims.`
      : `${routing.activeCount} of ${configured.length} services receiving traffic · routed via ${routing.gateways.length} gateway${routing.gateways.length === 1 ? '' : 's'}` +
        (HOME_GATEWAYS.length && homeMatches ? ` · ${homeMatches} via your gateway` : '');

  return (
    <div className="card flush-top">
      <div className="kv" style={{ paddingTop: 0 }}>
        <div className="line">
          <div className="k">Traffic</div>
          <div className="v">{summary}</div>
        </div>
      </div>
      <div className="tbl-scroll">
        <table className="tbl">
          <thead>
            <tr>
              <th>Service</th>
              <th>Status</th>
              <th className="num">Relays</th>
              <th>Last settled</th>
              <th>Routed via</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ serviceId, traffic }) => {
              const agoBlocks = traffic && currentHeight != null ? currentHeight - traffic.lastBlock : null;
              return (
                <tr key={serviceId}>
                  <td>
                    <Link href={`/service/${serviceId}`} className="mono">{serviceId}</Link>
                  </td>
                  <td>
                    {traffic ? (
                      <span className="statuspill sm s-ok">Active</span>
                    ) : (
                      <span className="muted">Idle</span>
                    )}
                  </td>
                  <td className="num mono">{traffic ? formatNumber(traffic.relays) : <span className="dim">—</span>}</td>
                  <td>
                    {traffic ? (
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
