import { NetLink as Link } from '@/components/shell/NetLink';
import { Tabs } from '@/components/ui/Tabs';
import type { TabDef } from '@/components/ui/Tabs';
import { RawJson } from '@/components/ui/RawJson';
import { LcdSourceStrip } from '@/components/ui/LcdSourceStrip';
import { EmptyState, Skeleton } from '@/components/ui/states';
import { StakeStatusPill } from '@/components/ui/StatusPill';
import { DelegationsPanel } from '@/components/account/DelegationsPanel';
import { RoleStats, SummaryCard, DOT, UnbondBanner } from './RoleStats';
import { Suspense } from 'react';
import { getGatewayTraffic, getGatewayDelegationCounts, getActorRaw } from '@/lib/data/roles';
import type { GatewayRoleView as GatewayView } from '@/lib/data/roles';
import type { NetworkId } from '@/lib/networks';
import { formatNumber, formatPokt, formatPoktCompact, formatCompact } from '@/lib/format';
import { agoFromBlocks } from '@/lib/time';
import { SinceNote } from '@/components/ui/SinceNote';
import { NOT_COVERED_HINT } from '@/lib/data/window';
import { parsePage } from '@/lib/paging';

/**
 * Traffic tab — what actually flows through this gateway, per service. A gateway signs relays but is
 * never recorded on a claim, proof or relay, so this is reconstructed from the settled claims of the
 * apps delegated to it at each settlement: authorized-routing inference, not cryptographic attribution.
 * Same basis as the supplier Traffic tab, in the opposite direction.
 */
async function TrafficPanel({ network, view, currentHeight }: { network: NetworkId; view: GatewayView; currentHeight: number | null }) {
  let t: Awaited<ReturnType<typeof getGatewayTraffic>>;
  try {
    t = await getGatewayTraffic(network, view.id);
  } catch {
    return (
      <div className="card flush-top">
        <EmptyState>Couldn’t load gateway traffic right now.</EmptyState>
      </div>
    );
  }
  if (t.totals.claims === 0) {
    return (
      <div className="card flush-top">
        <EmptyState>{t.notCovered ? NOT_COVERED_HINT : 'No settled claims from applications delegated to this gateway yet.'}</EmptyState>
      </div>
    );
  }

  return (
    <div className="card flush-top">
      <div className="kv" style={{ paddingTop: 0 }}>
        <div className="line">
          <div className="k">Routed traffic</div>
          <div className="v">
            <b>{formatNumber(t.totals.relays)}</b> relays{' '}
            <span className="dim">· {formatPokt(t.totals.claimedUpokt)} POKT claimed</span>
            <div className="muted" style={{ marginTop: 4 }}>
              Inferred: the signing gateway is not recorded on-chain, so this is the traffic of the apps authorized to route through
              this gateway, each settlement counted for the apps delegated to it at that block.
            </div>
            <SinceNote c={t} />
          </div>
        </div>
      </div>
      <div className="tbl-scroll">
        <table className="tbl">
          <thead>
            <tr>
              <th>Service</th>
              <th className="num">Relays</th>
              <th className="num">Claimed</th>
              <th>Last settled</th>
            </tr>
          </thead>
          <tbody>
            {t.byService.map((s) => {
              const agoBlocks = currentHeight != null && s.lastBlock > 0 ? currentHeight - s.lastBlock : null;
              return (
                <tr key={s.serviceId}>
                  <td>
                    <Link href={`/service/${s.serviceId}`} className="mono">
                      {s.serviceId}
                    </Link>
                  </td>
                  <td className="num mono">{formatNumber(s.relays)}</td>
                  <td className="num mono">{formatPokt(s.claimedUpokt)}</td>
                  <td>
                    {s.lastBlock > 0 ? <Link href={`/block/${s.lastBlock}`}>{formatNumber(s.lastBlock)}</Link> : <span className="dim">—</span>}
                    {agoBlocks != null ? <span className="dim"> · {agoFromBlocks(agoBlocks)}</span> : null}
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

/** The delegation and undelegation counts: a walk over the gateway's lifecycle, streamed so the page does not wait for it. */
async function DelegationCards({ network, id }: { network: NetworkId; id: string }) {
  const c = await getGatewayDelegationCounts(network, id);
  // A failed read shows a dash, never 0; a walk stopped at its cap says "+".
  const show = (n: number | undefined) => (c == null || n == null ? '—' : `${formatCompact(n)}${c.capped ? '+' : ''}`);
  return (
    <>
      <SummaryCard label="Delegations" dot={DOT.mint} value={show(c?.delegate)} />
      <SummaryCard label="Undelegations" dot={DOT.coral} value={show(c?.undelegate)} />
    </>
  );
}

async function RawPanel({ network, id }: { network: NetworkId; id: string }) {
  const raw = await getActorRaw(network, 'gateway', id);
  if (raw == null) {
    return (
      <div className="card flush-top">
        <EmptyState>The LCD has no gateway record for this address right now.</EmptyState>
      </div>
    );
  }
  return (
    <div className="card flush-top">
      <LcdSourceStrip>The gateway module’s own record, read live from the chain.</LcdSourceStrip>
      <RawJson title="Raw Gateway" source={<>Cosmos LCD · gateway module</>} data={raw} />
    </div>
  );
}

/** The gateway actor: its stake, who delegates to it, and what it routes. */
export function GatewayRoleView({
  network,
  view,
  currentHeight,
  appsPage,
}: {
  network: NetworkId;
  view: GatewayView;
  currentHeight: number | null;
  appsPage: string | undefined;
}) {
  const tabs: TabDef[] = [
    {
      key: 'apps',
      label: 'Delegating Apps',
      badge: view.appCount || undefined,
      panel: <DelegationsPanel network={network} address={view.id} direction="gateway-apps" page={parsePage(appsPage)} />,
    },
    { key: 'traffic', label: 'Traffic', panel: <TrafficPanel network={network} view={view} currentHeight={currentHeight} /> },
    { key: 'raw', label: 'Raw', panel: <RawPanel network={network} id={view.id} /> },
  ];

  return (
    <>
      <RoleStats>
        <SummaryCard label="Stake" dot={DOT.lavender} value={formatPokt(view.stakeAmount)} unit="POKT" />
        <SummaryCard label="Delegating Apps" dot={DOT.blue} value={formatNumber(view.appCount)} />
        <Suspense
          fallback={
            <>
              <SummaryCard label="Delegations" dot={DOT.mint} value={<Skeleton width={48} height={20} />} />
              <SummaryCard label="Undelegations" dot={DOT.coral} value={<Skeleton width={48} height={20} />} />
            </>
          }
        >
          <DelegationCards network={network} id={view.id} />
        </Suspense>
      </RoleStats>

      {view.stakeStatus === 'Unstaking' ? <UnbondBanner endHeight={view.unstakingEndHeight} currentHeight={currentHeight} /> : null}

      <div className="card kv" style={{ paddingTop: 0 }}>
        <div className="ttl">Gateway</div>
        <div className="line">
          <div className="k">Status</div>
          <div className="v">
            <StakeStatusPill status={view.stakeStatus} sm />{' '}
            <span className="dim">· {formatPoktCompact(view.stakeAmount)} POKT staked</span>
          </div>
        </div>
        <div className="line">
          <div className="k">Role</div>
          <div className="v">
            <span className="muted">
              A gateway signs relays on behalf of the applications that delegate to it. It holds no service config of its own —
              its footprint is the set of apps it may route for.
            </span>
          </div>
        </div>
      </div>

      <Tabs tabs={tabs} />
    </>
  );
}
