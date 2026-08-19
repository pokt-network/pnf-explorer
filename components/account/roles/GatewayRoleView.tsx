import { NetLink as Link } from '@/components/shell/NetLink';
import { Tabs } from '@/components/ui/Tabs';
import type { TabDef } from '@/components/ui/Tabs';
import { RawJson } from '@/components/ui/RawJson';
import { LcdSourceStrip } from '@/components/ui/LcdSourceStrip';
import { EmptyState } from '@/components/ui/states';
import { StakeStatusPill } from '@/components/ui/StatusPill';
import { DelegationsPanel } from '@/components/account/DelegationsPanel';
import { RoleStats, SummaryCard, DOT, UnbondBanner } from './RoleStats';
import { getGatewayTraffic, getActorRaw } from '@/lib/data/roles';
import type { GatewayRoleView as GatewayView } from '@/lib/data/roles';
import type { NetworkId } from '@/lib/networks';
import { formatNumber, formatPokt, formatPoktCompact, formatCompact } from '@/lib/format';
import { agoFromBlocks } from '@/lib/time';
import { parsePage } from '@/lib/paging';

/**
 * Traffic tab — what actually flows through this gateway, per service. A gateway signs relays but is
 * never recorded on a claim, proof or relay, so this is reconstructed from the settled claims of the
 * apps that delegate to it: authorized-routing inference, not cryptographic attribution. Same basis
 * as the supplier Traffic tab, in the opposite direction.
 */
async function TrafficPanel({ network, view, currentHeight }: { network: NetworkId; view: GatewayView; currentHeight: number | null }) {
  if (view.appIds.length === 0) {
    return (
      <div className="card flush-top">
        <EmptyState>No applications delegate to this gateway, so no traffic can be attributed to it.</EmptyState>
      </div>
    );
  }

  let t: Awaited<ReturnType<typeof getGatewayTraffic>>;
  try {
    t = await getGatewayTraffic(network, view.appIds);
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
        <EmptyState>The applications delegating to this gateway have no settled claims yet.</EmptyState>
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
            <span className="dim">
              · {formatPokt(t.totals.claimedUpokt)} POKT claimed · across {formatNumber(view.appIds.length)} delegating app
              {view.appIds.length === 1 ? '' : 's'}
            </span>
            <div className="muted" style={{ marginTop: 4 }}>
              Inferred: the signing gateway is not recorded on-chain, so this is the traffic of the apps authorized to route through
              this gateway.
              {view.truncated
                ? ` Covers the first ${formatNumber(view.appIds.length)} of ${formatNumber(view.appCount)} delegating apps.`
                : ''}
            </div>
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
              const agoBlocks = currentHeight != null ? currentHeight - s.lastBlock : null;
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
        <SummaryCard label="Delegations" dot={DOT.mint} value={formatCompact(view.delegationMsgs)} />
        <SummaryCard label="Undelegations" dot={DOT.coral} value={formatCompact(view.undelegationMsgs)} />
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
