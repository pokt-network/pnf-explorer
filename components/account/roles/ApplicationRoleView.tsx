import { NetLink as Link } from '@/components/shell/NetLink';
import { Hash } from '@/components/ui/Hash';
import { Tabs } from '@/components/ui/Tabs';
import type { TabDef } from '@/components/ui/Tabs';
import { RawJson } from '@/components/ui/RawJson';
import { LcdSourceStrip } from '@/components/ui/LcdSourceStrip';
import { EmptyState } from '@/components/ui/states';
import { StakeStatusPill } from '@/components/ui/StatusPill';
import { DelegationsPanel } from '@/components/account/DelegationsPanel';
import { RoleStats, SummaryCard, DOT, UnbondBanner } from './RoleStats';
import { getActorRaw } from '@/lib/data/roles';
import type { ApplicationRoleView as AppView } from '@/lib/data/roles';
import type { NetworkId } from '@/lib/networks';
import { formatNumber, formatPokt, formatPoktCompact, formatCompact } from '@/lib/format';
import { agoFromBlocks } from '@/lib/time';
import { parsePage } from '@/lib/paging';

/**
 * Usage tab. On an application, claim amounts are SPEND — stake burned to pay the suppliers that
 * served it — not income. Labelled explicitly so it can't be read as earnings.
 */
function UsagePanel({ view, currentHeight }: { view: AppView; currentHeight: number | null }) {
  const configured = new Set(view.services);
  if (view.byService.length === 0) {
    return (
      <div className="card flush-top">
        <EmptyState>This application has no settled claims yet — nothing has been served for it.</EmptyState>
      </div>
    );
  }
  return (
    <div className="card flush-top">
      <div className="kv" style={{ paddingTop: 0 }}>
        <div className="line">
          <div className="k">Spend</div>
          <div className="v">
            <b>{formatPokt(view.totals.claimedUpokt)} POKT</b>{' '}
            <span className="dim">claimed against this app’s stake over {formatNumber(view.totals.relays)} relays</span>
            <div className="muted" style={{ marginTop: 4 }}>
              Amounts on an application are what it paid suppliers, not what it earned.
            </div>
          </div>
        </div>
      </div>
      <div className="tbl-scroll">
        <table className="tbl">
          <thead>
            <tr>
              <th>Service</th>
              <th>Staked for</th>
              <th className="num">Relays</th>
              <th className="num">Claimed</th>
              <th>Last settled</th>
            </tr>
          </thead>
          <tbody>
            {view.byService.map((s) => {
              const agoBlocks = currentHeight != null ? currentHeight - s.lastBlock : null;
              return (
                <tr key={s.serviceId}>
                  <td>
                    <Link href={`/service/${s.serviceId}`} className="mono">
                      {s.serviceId}
                    </Link>
                  </td>
                  <td>{configured.has(s.serviceId) ? <span className="statuspill sm s-ok">Yes</span> : <span className="muted">no longer</span>}</td>
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

/** Services the app is currently staked for. */
function ServicesPanel({ view }: { view: AppView }) {
  if (view.services.length === 0) {
    return (
      <div className="card flush-top">
        <EmptyState>This application is not staked for any service.</EmptyState>
      </div>
    );
  }
  const settled = new Map(view.byService.map((s) => [s.serviceId, s]));
  return (
    <div className="card flush-top">
      <div className="tbl-scroll">
        <table className="tbl">
          <thead>
            <tr>
              <th>Service</th>
              <th className="num">Relays served</th>
              <th className="num">Spent</th>
            </tr>
          </thead>
          <tbody>
            {view.services.map((id) => {
              const s = settled.get(id);
              return (
                <tr key={id}>
                  <td>
                    <Link href={`/service/${id}`} className="mono">
                      {id}
                    </Link>
                  </td>
                  <td className="num mono">{s ? formatNumber(s.relays) : <span className="dim">—</span>}</td>
                  <td className="num mono">{s ? formatPokt(s.claimedUpokt) : <span className="dim">—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Raw tab — the application module's record, incl. LCD-only pending undelegations and transfer. */
async function RawPanel({ network, id }: { network: NetworkId; id: string }) {
  const raw = await getActorRaw(network, 'application', id);
  if (raw == null) {
    return (
      <div className="card flush-top">
        <EmptyState>The LCD has no application record for this address right now.</EmptyState>
      </div>
    );
  }
  return (
    <div className="card flush-top">
      <LcdSourceStrip>
        The application module’s own record, read live from the chain — including fields the indexer doesn’t carry:
        <code> pending_undelegations</code>, <code>per_session_spend_limit</code> and <code>service_config_history</code>.
      </LcdSourceStrip>
      <RawJson title="Raw Application" source={<>Cosmos LCD · application module</>} data={raw} />
    </div>
  );
}

/** The application actor: what it stakes, who routes for it, and what it has spent. */
export function ApplicationRoleView({
  network,
  view,
  currentHeight,
  gatewaysPage,
}: {
  network: NetworkId;
  view: AppView;
  currentHeight: number | null;
  gatewaysPage: string | undefined;
}) {
  const tabs: TabDef[] = [
    { key: 'svc', label: 'Services', badge: view.services.length || undefined, panel: <ServicesPanel view={view} /> },
    {
      key: 'gw',
      label: 'Delegated Gateways',
      badge: view.gatewayCount || undefined,
      panel: <DelegationsPanel network={network} address={view.id} direction="app-gateways" page={parsePage(gatewaysPage)} />,
    },
    { key: 'usage', label: 'Usage', panel: <UsagePanel view={view} currentHeight={currentHeight} /> },
    { key: 'raw', label: 'Raw', panel: <RawPanel network={network} id={view.id} /> },
  ];

  return (
    <>
      <RoleStats>
        <SummaryCard label="Stake" dot={DOT.gold} value={formatPokt(view.stakeAmount)} unit="POKT" />
        <SummaryCard label="Relays Served" dot={DOT.blue} value={formatCompact(view.totals.relays)} />
        <SummaryCard label="Spent" dot={DOT.coral} value={formatPoktCompact(view.totals.claimedUpokt)} unit="POKT" />
        <SummaryCard label="Gateways" dot={DOT.lavender} value={formatNumber(view.gatewayCount)} />
      </RoleStats>

      {view.stakeStatus === 'Unstaking' ? (
        <UnbondBanner endHeight={view.unstakingEndHeight} currentHeight={currentHeight} reason={view.unstakingReason} />
      ) : null}

      <div className="card kv" style={{ paddingTop: 0 }}>
        <div className="ttl">Application</div>
        <div className="line">
          <div className="k">Status</div>
          <div className="v">
            <StakeStatusPill status={view.stakeStatus} sm />
          </div>
        </div>
        <div className="line">
          <div className="k">Staked for</div>
          <div className="v">
            {view.services.length === 0 ? (
              <span className="dim">No services</span>
            ) : (
              view.services.map((s, i) => (
                <span key={s}>
                  {i > 0 ? ', ' : ''}
                  <Link href={`/service/${s}`} className="mono">
                    {s}
                  </Link>
                </span>
              ))
            )}
          </div>
        </div>
        {view.transferringToId ? (
          <div className="line">
            <div className="k">Stake transfer</div>
            <div className="v">
              Transferring to <Hash value={view.transferringToId} href={`/account/${view.transferringToId}?as=application`} />
              {view.transferEndHeight ? (
                <span className="dim">
                  {' '}
                  · completes at block <Link href={`/block/${view.transferEndHeight}`}>{formatNumber(view.transferEndHeight)}</Link>
                </span>
              ) : null}
              <div className="muted" style={{ marginTop: 4 }}>
                Application stake transfer is a distinct lifecycle from unstaking.
              </div>
            </div>
          </div>
        ) : null}
        {view.overservicedCount > 0 ? (
          <div className="line">
            <div className="k">Overserviced</div>
            <div className="v">
              {formatNumber(view.overservicedCount)} <span className="dim">event(s) — suppliers served beyond what this app could pay</span>
            </div>
          </div>
        ) : null}
      </div>

      <Tabs tabs={tabs} />
    </>
  );
}
