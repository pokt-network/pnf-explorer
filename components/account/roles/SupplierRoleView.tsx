import { NetLink as Link } from '@/components/shell/NetLink';
import { Hash } from '@/components/ui/Hash';
import { Tabs } from '@/components/ui/Tabs';
import type { TabDef } from '@/components/ui/Tabs';
import { RawJson } from '@/components/ui/RawJson';
import { LcdSourceStrip } from '@/components/ui/LcdSourceStrip';
import { Pager } from '@/components/ui/Pager';
import { EmptyState } from '@/components/ui/states';
import { StakeStatusPill } from '@/components/ui/StatusPill';
import { SupplierTrafficPanel } from '@/components/account/SupplierTrafficPanel';
import { RoleStats, SummaryCard, DOT, UnbondBanner } from './RoleStats';
import { getSupplierPayouts, getSupplierHistory, getActorRaw } from '@/lib/data/roles';
import type { SupplierRoleView as SupplierView, SupplierServiceRow } from '@/lib/data/roles';
import type { SupplierRole } from '@/lib/data/accounts';
import type { NetworkId } from '@/lib/networks';
import { formatNumber, formatPokt, formatPoktCompact, formatCompact, toBigInt } from '@/lib/format';
import { agoFromBlocks } from '@/lib/time';
import { rpcTypeLabel } from '@/lib/service';
import { parsePage } from '@/lib/paging';

const EARN_LIMIT = 25;
const HISTORY_LIMIT = 25;

/** Annotate a rev-share address with its role relative to this supplier. */
function shareTag(address: string, operatorId: string, ownerId: string): string | null {
  if (address === ownerId) return 'owner';
  if (address === operatorId) return 'operator';
  return null;
}

/**
 * Services tab — the single table the operator report asked for: what the supplier is staked for,
 * where it serves it from, how the revenue is split, and what that service has actually earned.
 * Previously this needed three pages and a mental join.
 */
function ServicesPanel({ view, currentHeight }: { view: SupplierView; currentHeight: number | null }) {
  if (view.services.length === 0 && view.formerServices.length === 0) {
    return (
      <div className="card flush-top">
        <EmptyState>No service configs for this supplier.</EmptyState>
      </div>
    );
  }

  const row = (s: SupplierServiceRow) => {
    const st = s.settlement;
    const agoBlocks = st && currentHeight != null ? currentHeight - st.lastBlock : null;
    return (
      <tr key={s.serviceId}>
        <td>
          <Link href={`/service/${s.serviceId}`} className="mono">
            {s.serviceId}
          </Link>
        </td>
        <td>
          {s.endpoints.length === 0 ? (
            <span className="dim">—</span>
          ) : (
            s.endpoints.map((e, i) => (
              <div key={i} className="mono" style={{ fontSize: 12, wordBreak: 'break-all' }}>
                {e.url}
              </div>
            ))
          )}
        </td>
        <td>{s.endpoints.length === 0 ? <span className="dim">—</span> : [...new Set(s.endpoints.map((e) => rpcTypeLabel(e.rpcType)))].join(', ')}</td>
        <td>
          {s.revShare.length === 0 ? (
            <span className="dim">—</span>
          ) : (
            s.revShare.map((r) => {
              const tag = shareTag(r.address, view.operatorId, view.ownerId);
              return (
                <div key={r.address} style={{ fontSize: 12, marginBottom: 2 }}>
                  <b>{r.revSharePercentage}%</b> <Hash value={r.address} href={`/account/${r.address}`} />
                  {tag ? <span className="dim"> ({tag})</span> : null}
                </div>
              );
            })
          )}
        </td>
        <td className="num mono">{st ? formatNumber(st.relays) : <span className="dim">—</span>}</td>
        <td className="num mono">{st ? formatPokt(st.settledUpokt) : <span className="dim">—</span>}</td>
        <td>
          {st ? (
            <>
              <Link href={`/block/${st.lastBlock}`}>{formatNumber(st.lastBlock)}</Link>
              {agoBlocks != null ? <span className="dim"> · {agoFromBlocks(agoBlocks)}</span> : null}
            </>
          ) : (
            <span className="muted">idle</span>
          )}
        </td>
      </tr>
    );
  };

  return (
    <>
      <div className="card flush-top">
        <div className="tbl-scroll">
          <table className="tbl">
            <thead>
              <tr>
                <th>Service</th>
                <th>Endpoint</th>
                <th>RPC</th>
                <th>Rev-share split</th>
                <th className="num">Relays</th>
                <th className="num">Earned</th>
                <th>Last settled</th>
              </tr>
            </thead>
            <tbody>{view.services.map(row)}</tbody>
          </table>
        </div>
      </div>

      {view.formerServices.length > 0 ? (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="kv" style={{ paddingTop: 0 }}>
            <div className="ttl">Previously served</div>
            <div className="line">
              <div className="k">Not in the current config</div>
              <div className="v">
                <span className="muted">
                  This supplier has settled claims on {formatNumber(view.formerServices.length)} service
                  {view.formerServices.length === 1 ? '' : 's'} it is no longer staked for. Earnings below are historical.
                </span>
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
                  <th className="num">Earned</th>
                  <th>Last settled</th>
                </tr>
              </thead>
              <tbody>
                {view.formerServices.map((f) => (
                  <tr key={f.serviceId}>
                    <td>
                      <Link href={`/service/${f.serviceId}`} className="mono">
                        {f.serviceId}
                      </Link>
                    </td>
                    <td className="num mono">{formatNumber(f.relays)}</td>
                    <td className="num mono">{formatPokt(f.claimedUpokt)}</td>
                    <td className="num mono">{formatPokt(f.settledUpokt)}</td>
                    <td>
                      <Link href={`/block/${f.lastBlock}`}>{formatNumber(f.lastBlock)}</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </>
  );
}

/**
 * Earnings tab — the realised payout ledger. Every address this supplier's settlements have actually
 * paid, not the configured percentages. The two diverge whenever the rev-share config has changed,
 * and only this view can show an address that used to be a shareholder.
 */
async function EarningsPanel({ network, view, page }: { network: NetworkId; view: SupplierView; page: number }) {
  let payouts: Awaited<ReturnType<typeof getSupplierPayouts>>;
  try {
    payouts = await getSupplierPayouts(network, view.id);
  } catch {
    return (
      <div className="card flush-top">
        <EmptyState>Couldn’t load earnings right now.</EmptyState>
      </div>
    );
  }
  if (payouts.rows.length === 0) {
    return (
      <div className="card flush-top">
        <EmptyState>This supplier has never been paid out — no settled claims yet.</EmptyState>
      </div>
    );
  }

  // Current-config percentages, keyed by address (an address can sit on several services at
  // different rates, so collect the distinct set).
  const configured = new Map<string, Set<string>>();
  for (const s of view.services) {
    for (const r of s.revShare) {
      let pcts = configured.get(r.address);
      if (!pcts) configured.set(r.address, (pcts = new Set()));
      pcts.add(r.revSharePercentage);
    }
  }

  const total = toBigInt(payouts.totalUpokt);
  const slice = payouts.rows.slice((page - 1) * EARN_LIMIT, page * EARN_LIMIT);

  return (
    <div className="card flush-top">
      <div className="kv" style={{ paddingTop: 0 }}>
        <div className="line">
          <div className="k">Paid out</div>
          <div className="v">
            <b>{formatPokt(payouts.totalUpokt)} POKT</b>{' '}
            <span className="dim">
              across {formatNumber(payouts.rows.length)} recipient{payouts.rows.length === 1 ? '' : 's'} ·{' '}
              {formatNumber(payouts.totalTransfers)} settlement transfers
            </span>
            <div className="muted" style={{ marginTop: 4 }}>
              Realised amounts from settled claims. Addresses not on the current rev-share config were paid under an earlier one.
            </div>
          </div>
        </div>
      </div>
      <div className="tbl-scroll">
        <table className="tbl">
          <thead>
            <tr>
              <th>Recipient</th>
              <th>Current config</th>
              <th className="num">Received</th>
              <th className="num">Share</th>
              <th className="num">Transfers</th>
            </tr>
          </thead>
          <tbody>
            {slice.map((r) => {
              const pcts = configured.get(r.address);
              const tag = shareTag(r.address, view.operatorId, view.ownerId);
              const share = total > BigInt(0) ? (Number((toBigInt(r.amountUpokt) * BigInt(10000)) / total) / 100).toFixed(2) : '0.00';
              return (
                <tr key={r.address}>
                  <td>
                    <Hash value={r.address} href={`/account/${r.address}`} />
                    {tag ? <span className="dim"> ({tag})</span> : null}
                  </td>
                  <td>
                    {pcts ? (
                      <span className="pill-soft">{[...pcts].join('% / ')}%</span>
                    ) : (
                      <span className="muted">not on current config</span>
                    )}
                  </td>
                  <td className="num mono">{formatPokt(r.amountUpokt)}</td>
                  <td className="num mono">{share}%</td>
                  <td className="num mono">{formatNumber(r.transfers)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {payouts.rows.length > EARN_LIMIT ? (
        <Pager page={page} pageSize={EARN_LIMIT} totalCount={payouts.rows.length} param="earn" />
      ) : null}
    </div>
  );
}

/** History tab — stake edits, unstake messages and slashes for the supplier actor. */
async function HistoryPanel({ network, id }: { network: NetworkId; id: string }) {
  let h: Awaited<ReturnType<typeof getSupplierHistory>>;
  try {
    h = await getSupplierHistory(network, id, HISTORY_LIMIT);
  } catch {
    return (
      <div className="card flush-top">
        <EmptyState>Couldn’t load supplier history right now.</EmptyState>
      </div>
    );
  }
  if (!h) {
    return (
      <div className="card flush-top">
        <EmptyState>No supplier history.</EmptyState>
      </div>
    );
  }

  return (
    <>
      <div className="card flush-top">
        <div className="kv" style={{ paddingTop: 0 }}>
          <div className="ttl">Stake changes · {formatNumber(h.stakeMsgs.totalCount)}</div>
        </div>
        <div className="tbl-scroll">
          <table className="tbl">
            <thead>
              <tr>
                <th>Block</th>
                <th className="num">Stake after</th>
                <th>Transaction</th>
              </tr>
            </thead>
            <tbody>
              {h.stakeMsgs.nodes.length === 0 ? (
                <tr>
                  <td colSpan={3}>
                    <span className="muted">No stake messages.</span>
                  </td>
                </tr>
              ) : (
                h.stakeMsgs.nodes.map((m) => (
                  <tr key={m.id}>
                    <td>{m.blockId ? <Link href={`/block/${m.blockId}`}>{formatNumber(m.blockId)}</Link> : <span className="dim">—</span>}</td>
                    <td className="num mono">{formatPokt(m.stakeAmount)}</td>
                    <td>{m.transactionId ? <Hash value={m.transactionId} href={`/tx/${m.transactionId}`} /> : <span className="dim">—</span>}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {h.unstakeMsgs.totalCount > 0 ? (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="kv" style={{ paddingTop: 0 }}>
            <div className="ttl">Unstake messages · {formatNumber(h.unstakeMsgs.totalCount)}</div>
          </div>
          <div className="tbl-scroll">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Block</th>
                  <th>Transaction</th>
                </tr>
              </thead>
              <tbody>
                {h.unstakeMsgs.nodes.map((m) => (
                  <tr key={m.id}>
                    <td>{m.blockId ? <Link href={`/block/${m.blockId}`}>{formatNumber(m.blockId)}</Link> : <span className="dim">—</span>}</td>
                    <td>{m.transactionId ? <Hash value={m.transactionId} href={`/tx/${m.transactionId}`} /> : <span className="dim">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="card" style={{ marginTop: 16 }}>
        <div className="kv" style={{ paddingTop: 0 }}>
          <div className="ttl">Slashes · {formatNumber(h.slashes.totalCount)}</div>
        </div>
        <div className="tbl-scroll">
          <table className="tbl">
            <thead>
              <tr>
                <th>Block</th>
                <th>Service</th>
                <th className="num">Penalty</th>
                <th className="num">Stake before</th>
                <th className="num">Stake after</th>
              </tr>
            </thead>
            <tbody>
              {h.slashes.nodes.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <span className="muted">Never slashed.</span>
                  </td>
                </tr>
              ) : (
                h.slashes.nodes.map((s) => (
                  <tr key={s.id}>
                    <td>{s.blockId ? <Link href={`/block/${s.blockId}`}>{formatNumber(s.blockId)}</Link> : <span className="dim">—</span>}</td>
                    <td>
                      {s.serviceId ? (
                        <Link href={`/service/${s.serviceId}`} className="mono">
                          {s.serviceId}
                        </Link>
                      ) : (
                        <span className="dim">—</span>
                      )}
                    </td>
                    <td className="num mono">{formatPokt(s.proofMissingPenalty, 6)}</td>
                    <td className="num mono">{formatPokt(s.previousStakeAmount)}</td>
                    <td className="num mono">{formatPokt(s.afterStakeAmount)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

/** Raw tab — the chain's own supplier record, not the wallet's balances. */
async function RawPanel({ network, id }: { network: NetworkId; id: string }) {
  const raw = await getActorRaw(network, 'supplier', id);
  if (raw == null) {
    return (
      <div className="card flush-top">
        <EmptyState>The LCD has no supplier record for this address right now.</EmptyState>
      </div>
    );
  }
  return (
    <div className="card flush-top">
      <LcdSourceStrip>
        The supplier module’s own record for this operator, read live from the chain — endpoints, service configs and rev-share
        exactly as the protocol stores them.
      </LcdSourceStrip>
      <RawJson title="Raw Supplier" source={<>Cosmos LCD · supplier module</>} data={raw} />
    </div>
  );
}

/**
 * The supplier actor view. Independent of the wallet that shares its address: its own stake, its own
 * services, its own earnings, its own raw record.
 */
export function SupplierRoleView({
  network,
  view,
  legacy,
  currentHeight,
  earnPage,
}: {
  network: NetworkId;
  view: SupplierView;
  /** Shape the existing Traffic panel already consumes. */
  legacy: SupplierRole;
  currentHeight: number | null;
  earnPage: string | undefined;
}) {
  const tabs: TabDef[] = [
    { key: 'svc', label: 'Services', badge: view.services.length || undefined, panel: <ServicesPanel view={view} currentHeight={currentHeight} /> },
    { key: 'traffic', label: 'Traffic', panel: <SupplierTrafficPanel network={network} supplier={legacy} currentHeight={currentHeight} /> },
    { key: 'earn', label: 'Earnings', panel: <EarningsPanel network={network} view={view} page={parsePage(earnPage)} /> },
    { key: 'hist', label: 'History', badge: view.slashCount || undefined, panel: <HistoryPanel network={network} id={view.id} /> },
    { key: 'raw', label: 'Raw', panel: <RawPanel network={network} id={view.id} /> },
  ];

  return (
    <>
      <RoleStats>
        <SummaryCard label="Stake" dot={DOT.coral} value={formatPokt(view.stakeAmount)} unit="POKT" />
        <SummaryCard label="Lifetime Relays" dot={DOT.blue} value={formatCompact(view.totals.relays)} />
        <SummaryCard label="Earned" dot={DOT.mint} value={formatPoktCompact(view.totals.settledUpokt)} unit="POKT" />
        <SummaryCard label="Settled Claims" dot={DOT.gold} value={formatCompact(view.totals.claims)} />
      </RoleStats>

      {view.stakeStatus === 'Unstaking' ? (
        <UnbondBanner endHeight={view.unstakingEndHeight} currentHeight={currentHeight} reason={view.unstakingReason} />
      ) : null}

      <div className="card kv" style={{ paddingTop: 0 }}>
        <div className="ttl">Supplier</div>
        <div className="line">
          <div className="k">Status</div>
          <div className="v">
            <StakeStatusPill status={view.stakeStatus} sm />
          </div>
        </div>
        <div className="line">
          <div className="k">Owner</div>
          <div className="v">
            {view.ownerId === view.operatorId ? (
              <span className="dim">Self-owned</span>
            ) : (
              <>
                <Hash value={view.ownerId} href={`/account/${view.ownerId}?as=owner`} />
                <span className="dim"> · rewards route to the owner’s rev-share, not the operator</span>
              </>
            )}
          </div>
        </div>
        <div className="line">
          <div className="k">Operator</div>
          <div className="v">
            <Hash value={view.operatorId} />
          </div>
        </div>
        <div className="line">
          <div className="k">Slashes</div>
          <div className="v">
            {view.slashCount === 0 ? (
              <span className="dim">Never slashed</span>
            ) : (
              <>
                {formatNumber(view.slashCount)} <span className="dim">· {formatPokt(view.slashPenaltyUpokt, 6)} POKT penalty total</span>
              </>
            )}
          </div>
        </div>
      </div>

      <Tabs tabs={tabs} />
    </>
  );
}
