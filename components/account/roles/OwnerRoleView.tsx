import { NetLink as Link } from '@/components/shell/NetLink';
import { Hash } from '@/components/ui/Hash';
import { Tabs } from '@/components/ui/Tabs';
import type { TabDef } from '@/components/ui/Tabs';
import { EmptyState } from '@/components/ui/states';
import { OperatorsPanel } from '@/components/account/OperatorsPanel';
import { RoleStats, SummaryCard, DOT } from './RoleStats';
import { getFleetEarnings } from '@/lib/data/roles';
import type { OwnerRole } from '@/lib/data/accounts';
import type { NetworkId } from '@/lib/networks';
import { formatNumber, formatPokt, formatPoktCompact, formatCompact } from '@/lib/format';
import { agoFromBlocks } from '@/lib/time';
import { parsePage } from '@/lib/paging';

/**
 * Fleet earnings — the rollup a professional node-runner actually wants: what the whole fleet
 * earned, per operator and per service, without opening 65 operator pages.
 *
 * Sourced through the fleet's supplier ids, NOT `supplierOwnerId` on the claim events — that field
 * is newer and present on only ~25% of rows, which silently under-reports by ~20×.
 */
async function FleetEarningsPanel({ network, ownerId, currentHeight }: { network: NetworkId; ownerId: string; currentHeight: number | null }) {
  let f: Awaited<ReturnType<typeof getFleetEarnings>>;
  try {
    f = await getFleetEarnings(network, ownerId);
  } catch {
    return (
      <div className="card flush-top">
        <EmptyState>Couldn’t load fleet earnings right now.</EmptyState>
      </div>
    );
  }
  if (f.totals.claims === 0) {
    return (
      <div className="card flush-top">
        <EmptyState>No settled claims across this owner’s operators yet.</EmptyState>
      </div>
    );
  }

  return (
    <>
      <div className="card flush-top">
        <div className="kv" style={{ paddingTop: 0 }}>
          <div className="line">
            <div className="k">Fleet</div>
            <div className="v">
              <b>{formatNumber(f.totals.relays)}</b> relays <span className="dim">· {formatPokt(f.totals.settledUpokt)} POKT settled</span>
              {f.truncated ? (
                <div className="muted" style={{ marginTop: 4 }}>
                  Covers the {formatNumber(f.covered)} largest-staked operators of {formatNumber(f.fleetSize)} — the indexer caps a
                  filtered set at {formatNumber(f.covered)}.
                </div>
              ) : null}
            </div>
          </div>
        </div>
        <div className="tbl-scroll">
          <table className="tbl">
            <thead>
              <tr>
                <th>Operator</th>
                <th className="num">Relays</th>
                <th className="num">Claimed</th>
                <th className="num">Settled</th>
                <th>Last settled</th>
              </tr>
            </thead>
            <tbody>
              {f.bySupplier.map((s) => {
                const agoBlocks = currentHeight != null ? currentHeight - s.lastBlock : null;
                return (
                  <tr key={s.serviceId}>
                    <td>
                      <Hash value={s.serviceId} href={`/account/${s.serviceId}?as=supplier`} />
                    </td>
                    <td className="num mono">{formatNumber(s.relays)}</td>
                    <td className="num mono">{formatPokt(s.claimedUpokt)}</td>
                    <td className="num mono">{formatPokt(s.settledUpokt)}</td>
                    <td>
                      <Link href={`/block/${s.lastBlock}`}>{formatNumber(s.lastBlock)}</Link>
                      {agoBlocks != null ? <span className="dim"> · {agoFromBlocks(agoBlocks)}</span> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="kv" style={{ paddingTop: 0 }}>
          <div className="ttl">By service</div>
        </div>
        <div className="tbl-scroll">
          <table className="tbl">
            <thead>
              <tr>
                <th>Service</th>
                <th className="num">Relays</th>
                <th className="num">Claimed</th>
                <th className="num">Settled</th>
              </tr>
            </thead>
            <tbody>
              {f.byService.map((s) => (
                <tr key={s.serviceId}>
                  <td>
                    <Link href={`/service/${s.serviceId}`} className="mono">
                      {s.serviceId}
                    </Link>
                  </td>
                  <td className="num mono">{formatNumber(s.relays)}</td>
                  <td className="num mono">{formatPokt(s.claimedUpokt)}</td>
                  <td className="num mono">{formatPokt(s.settledUpokt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

/** The owner actor: a wallet that is the `ownerId` of ≥1 supplier, whether or not it stakes itself. */
export function OwnerRoleView({
  network,
  address,
  owner,
  currentHeight,
  opsPage,
}: {
  network: NetworkId;
  address: string;
  owner: OwnerRole;
  currentHeight: number | null;
  opsPage: string | undefined;
}) {
  const tabs: TabDef[] = [
    {
      key: 'ops',
      label: 'Operators',
      badge: owner.operatorCount || undefined,
      panel: <OperatorsPanel network={network} address={address} page={parsePage(opsPage)} />,
    },
    { key: 'earn', label: 'Fleet Earnings', panel: <FleetEarningsPanel network={network} ownerId={address} currentHeight={currentHeight} /> },
  ];

  const avg = owner.operatorCount > 0 ? Number(owner.totalStakeUpokt) / owner.operatorCount : 0;

  return (
    <>
      <RoleStats>
        <SummaryCard label="Operators" dot={DOT.coral} value={formatNumber(owner.operatorCount)} />
        <SummaryCard label="Fleet Stake" dot={DOT.blue} value={formatPoktCompact(owner.totalStakeUpokt)} unit="POKT" />
        <SummaryCard label="Avg per Operator" dot={DOT.mint} value={formatCompact(avg / 1e6)} unit="POKT" />
        <SummaryCard label="Role" dot={DOT.gold} value="Owner" />
      </RoleStats>

      <div className="card kv" style={{ paddingTop: 0 }}>
        <div className="ttl">Supplier Owner</div>
        <div className="line">
          <div className="k">Owns</div>
          <div className="v">
            <b>{formatNumber(owner.operatorCount)}</b> supplier operator{owner.operatorCount === 1 ? '' : 's'}{' '}
            <span className="dim">· {formatPokt(owner.totalStakeUpokt)} POKT staked in total</span>
            <div className="muted" style={{ marginTop: 4 }}>
              The owner account holds the stake and receives rev-share; each operator runs its own endpoints under its own address.
            </div>
          </div>
        </div>
      </div>

      <Tabs tabs={tabs} />
    </>
  );
}
