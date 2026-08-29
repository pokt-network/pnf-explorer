import { Suspense } from 'react';
import { NetLink as Link } from '@/components/shell/NetLink';
import { Hash } from '@/components/ui/Hash';
import { Tabs } from '@/components/ui/Tabs';
import type { TabDef } from '@/components/ui/Tabs';
import { Pager } from '@/components/ui/Pager';
import { EmptyState, Skeleton } from '@/components/ui/states';
import { RoleSplit, SummaryCard, DOT } from './RoleStats';
import { getRevShareConfigs } from '@/lib/data/accounts';
import { getRevShareIncome } from '@/lib/data/roles';
import type { NetworkId } from '@/lib/networks';
import { formatNumber, formatPokt } from '@/lib/format';
import { parsePage } from '@/lib/paging';

const LIMIT = 25;

/** Settlement op-reason enum → a label a human can read. Unknown reasons fall through verbatim. */
const REASON: Record<string, string> = {
  TLM_RELAY_BURN_EQUALS_MINT_SUPPLIER_SHAREHOLDER_RD: 'Supplier shareholder reward',
  TLM_RELAY_BURN_EQUALS_MINT_SOURCE_OWNER_RD: 'Source owner reward',
  TLM_RELAY_BURN_EQUALS_MINT_DAO_REWARD_DISTRIBUTION: 'DAO reward',
  TLM_GLOBAL_MINT_SUPPLIER_SHAREHOLDER_REWARD_DISTRIBUTION: 'Global mint — shareholder',
  TLM_GLOBAL_MINT_DAO_REWARD_DISTRIBUTION: 'Global mint — DAO',
  TLM_GLOBAL_MINT_REIMBURSEMENT_REQUEST_ESCROW_DAO_TRANSFER: 'Reimbursement escrow',
  UNSPECIFIED: 'Unspecified',
};

/**
 * Rev-share income — the REVERSE lookup: which suppliers pay this address, and what it has actually
 * received from them. Deliberately named "income" so it can never be confused with a supplier's own
 * rev-share split (that lives on the Supplier role's Services tab); conflating the two is exactly
 * what made the operator report read the 1% and miss the 99%.
 */
/** Placeholder occupying the Received line's height so the table below it does not jump on arrival. */
function ReceivedSkeleton() {
  return (
    <div className="kv" style={{ paddingTop: 0 }}>
      <div className="line">
        <div className="k">Received</div>
        <div className="v">
          <Skeleton width={210} height={16} />
        </div>
      </div>
    </div>
  );
}

/**
 * Lifetime rev-share income. Streamed separately from the configs table because it is the one
 * genuinely expensive read on this page — see getRevShareIncome for the measurements.
 */
async function ReceivedLine({ network, address }: { network: NetworkId; address: string }) {
  const income = await getRevShareIncome(network, address).catch(() => null);
  if (!income) return null;
  return (
    <div className="kv" style={{ paddingTop: 0 }}>
      <div className="line">
        <div className="k">Received</div>
        <div className="v">
          <b>{formatPokt(income.totalUpokt)} POKT</b>{' '}
          <span className="dim">
            lifetime, from every paying supplier · {formatNumber(income.transfers)} settlement transfers
          </span>
          {income.byReason.length > 0 ? (
            <div className="muted" style={{ marginTop: 4 }}>
              {income.byReason.map((r, i) => (
                <span key={r.reason}>
                  {i > 0 ? ' · ' : ''}
                  {REASON[r.reason] ?? r.reason}: {formatPokt(r.amountUpokt)}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

async function IncomePanel({ network, address, page }: { network: NetworkId; address: string; page: number }) {
  let configs: Awaited<ReturnType<typeof getRevShareConfigs>>;
  try {
    configs = await getRevShareConfigs(network, address, LIMIT, (page - 1) * LIMIT);
  } catch {
    return (
      <div className="card flush-top">
        <EmptyState>Couldn’t load rev-share income right now.</EmptyState>
      </div>
    );
  }
  if (configs.nodes.length === 0 && page === 1) {
    return (
      <div className="card flush-top">
        <EmptyState>This address is not on any supplier’s rev-share config.</EmptyState>
      </div>
    );
  }

  return (
    <div className="card flush-top">
      {/* The lifetime figure is ~5s of indexer aggregate against the configs table's ~0.6s. Behind
          its own boundary it streams in after the table has already painted, instead of holding the
          whole panel hostage to the slowest number on it. */}
      <Suspense fallback={<ReceivedSkeleton />}>
        <ReceivedLine network={network} address={address} />
      </Suspense>
      <div className="tbl-scroll">
        <table className="tbl">
          <thead>
            <tr>
              <th>Supplier</th>
              <th>Service</th>
              <th className="num">This address’s share</th>
              <th>Full split</th>
            </tr>
          </thead>
          <tbody>
            {configs.nodes.map((c, i) => {
              const mine = c.revShare.find((r) => r.address === address);
              return (
                <tr key={`${c.supplierId}-${c.serviceId}-${i}`}>
                  <td>
                    <Hash value={c.supplierId} href={`/account/${c.supplierId}?as=supplier`} />
                  </td>
                  <td>
                    <Link href={`/service/${c.serviceId}`} className="mono">
                      {c.serviceId}
                    </Link>
                  </td>
                  <td className="num mono">{mine ? `${mine.revSharePercentage}%` : '—'}</td>
                  <td>
                    {c.revShare.map((r) => (
                      <div key={r.address} style={{ fontSize: 12, marginBottom: 2 }}>
                        <b>{r.revSharePercentage}%</b> <Hash value={r.address} href={`/account/${r.address}`} />
                        {r.address === address ? <span className="dim"> (this address)</span> : null}
                      </div>
                    ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {configs.totalCount > LIMIT ? <Pager page={page} pageSize={LIMIT} totalCount={configs.totalCount} param="revshare" /> : null}
    </div>
  );
}

export function RevShareRoleView({
  network,
  address,
  configCount,
  revsharePage,
}: {
  network: NetworkId;
  address: string;
  configCount: number;
  revsharePage: string | undefined;
}) {
  const tabs: TabDef[] = [
    { key: 'income', label: 'Income', badge: configCount || undefined, panel: <IncomePanel network={network} address={address} page={parsePage(revsharePage)} /> },
  ];

  return (
    <>
      <RoleSplit>
        <SummaryCard label="Paying Configs" dot={DOT.mint} value={formatNumber(configCount)} />
        <div className="kv" style={{ paddingTop: 0 }}>
          <div className="ttl">Rev-share Recipient</div>
          <div className="line">
            <div className="k">Earns from</div>
            <div className="v">
              <b>{formatNumber(configCount)}</b> supplier service config{configCount === 1 ? '' : 's'}
              <div className="muted" style={{ marginTop: 4 }}>
                This is income <i>into</i> this address. A supplier’s own outgoing split lives on that supplier’s Services and
                Earnings tabs.
              </div>
            </div>
          </div>
        </div>
      </RoleSplit>

      <Tabs tabs={tabs} />
    </>
  );
}
