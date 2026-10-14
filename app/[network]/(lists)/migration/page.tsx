import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { NetLink as Link } from '@/components/shell/NetLink';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Tic } from '@/components/ui/Icons';
import { SummaryCard, DOT } from '@/components/ui/SummaryCard';
import { Pager } from '@/components/ui/Pager';
import { Hash } from '@/components/ui/Hash';
import { EmptyState } from '@/components/ui/states';
import { ErrorCard } from '@/components/ui/ErrorCard';
import { MorseSearch } from '@/components/migration/MorseSearch';
import { getMorseClaimableAccounts, getMorseClaimSummary, type MorseClaimSummary } from '@/lib/data/migration';
import { netHref, type NetworkId } from '@/lib/networks';
import { formatNumber, formatPokt, formatPoktCompact, formatPoktExact, isZero, toBigInt } from '@/lib/format';
import { parsePage } from '@/lib/paging';

export const metadata: Metadata = {
  title: 'Morse Migration',
  description: 'Morse accounts claimable on Pocket Network Shannon, and how much of them has been claimed.',
};

const PAGE_SIZE = 25;

/**
 * claimed / total as a percentage, rounded to 2 decimals like poktscan's — but never 0% once something is claimed nor
 * 100% before it is all claimed.
 */
function percent(claimed: bigint, total: bigint): number | null {
  if (total <= BigInt(0)) return null;
  const hundredths = Number((claimed * BigInt(20000) + total) / (total * BigInt(2)));
  if (claimed > BigInt(0) && hundredths === 0) return 0.01;
  return (claimed < total ? Math.min(hundredths, 9999) : hundredths) / 100;
}

/** A summary card for one claimed-of-total figure: claimed amount, its total, and a fill bar. */
function ClaimCard({ label, dot, claimed, total }: { label: string; dot: string; claimed: bigint; total: bigint }) {
  const pct = percent(claimed, total);
  return (
    <SummaryCard
      label={label}
      dot={dot}
      value={formatPoktCompact(claimed)}
      unit="POKT"
      sub={`of ${formatPoktCompact(total)} POKT`}
      title={`${formatPoktExact(claimed)} of ${formatPoktExact(total)} POKT claimed`}
    >
      <div className="meter">
        <span className="bar-mini">
          <i style={{ width: `${pct ?? 0}%`, background: dot }} />
        </span>
        {pct == null ? '—' : `${pct.toFixed(2)}%`}
      </div>
    </SummaryCard>
  );
}

function ClaimCards({ summary }: { summary: MorseClaimSummary }) {
  const { claimed: c, unclaimed: u } = summary;
  const liquid = toBigInt(c.unstakedBalanceUpokt);
  const supplier = toBigInt(c.supplierStakeUpokt);
  const app = toBigInt(c.applicationStakeUpokt);
  const liquidTotal = liquid + toBigInt(u.unstakedBalanceUpokt);
  const supplierTotal = supplier + toBigInt(u.supplierStakeUpokt);
  const appTotal = app + toBigInt(u.applicationStakeUpokt);
  return (
    <div className="sumrow">
      <ClaimCard label="Total Claimed" dot={DOT.blue} claimed={liquid + supplier + app} total={liquidTotal + supplierTotal + appTotal} />
      <ClaimCard label="Claimed Liquid Balance" dot={DOT.mint} claimed={liquid} total={liquidTotal} />
      <ClaimCard label="Claimed Supplier Stake" dot={DOT.coral} claimed={supplier} total={supplierTotal} />
      <ClaimCard label="Claimed App Stake" dot={DOT.gold} claimed={app} total={appTotal} />
    </div>
  );
}

export default async function MigrationPage({
  params,
  searchParams,
}: {
  params: Promise<{ network: NetworkId }>;
  searchParams: Promise<{ page?: string; address?: string | string[] }>;
}) {
  const { network } = await params;
  const { page: pageParam, address: addressParam } = await searchParams;
  const address = (Array.isArray(addressParam) ? addressParam[0] : addressParam)?.trim() || undefined;

  // The totals are independent of the list: a failed summary costs the cards, never the table (the error is logged).
  const summaryRead = getMorseClaimSummary(network).catch((e: unknown) => {
    console.error(`[migration] getMorseClaimSummary failed on ${network}:`, e);
    return null;
  });
  const page = parsePage(pageParam, PAGE_SIZE);
  // A page past the end redirects to the last one.
  const toLastPage = (total: number) => {
    const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (page <= lastPage) return;
    const qs = new URLSearchParams();
    if (address) qs.set('address', address);
    if (lastPage > 1) qs.set('page', String(lastPage));
    const search = qs.toString();
    redirect(netHref(network, search ? `/migration?${search}` : '/migration'));
  };
  // Unfiltered, the summary's account count (cached 30 s, and already in flight) is the list's totalCount: check the
  // page against it before asking for a large offset. A search's set is small, so its own totalCount does.
  if (!address && page > 1) {
    const cached = await summaryRead;
    if (cached) toLastPage(cached.totalAccounts);
  }
  const offset = (page - 1) * PAGE_SIZE;
  const { nodes, totalCount } = await getMorseClaimableAccounts(network, PAGE_SIZE, offset, address);
  toLastPage(totalCount);
  const summary = await summaryRead;
  const from = nodes.length === 0 ? 0 : offset + 1;
  const to = offset + nodes.length;

  return (
    <>
      <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Morse Migration' }]} />
      <div className="listhead">
        <Tic entity="account" iconSize={20} />
        <h1>Morse Migration</h1>
        <span className="cnt">
          Showing {formatNumber(from)}–{formatNumber(to)} of {formatNumber(totalCount)}
          {address ? ' matching' : summary ? ` · ${formatNumber(summary.claimedAccounts)} claimed` : null}
        </span>
      </div>

      {summary ? (
        <ClaimCards summary={summary} />
      ) : (
        <div style={{ marginBottom: 18 }}>
          <ErrorCard title="Claim totals unavailable" message="The indexer did not answer for the migration totals; the accounts below are unaffected." />
        </div>
      )}

      <MorseSearch key={address ?? ''} active={address} />

      <div className="card">
        <div className="tbl-scroll">
          <table className="tbl">
            <thead>
              <tr>
                <th>Morse Address</th>
                <th className="num">Liquid Balance</th>
                <th className="num">Supplier Stake</th>
                <th className="num">App Stake</th>
                <th>Destination</th>
                <th>Claimed At</th>
                <th>Transaction</th>
              </tr>
            </thead>
            <tbody>
              {nodes.map((a) => (
                <tr key={a.id}>
                  <td>
                    <Hash value={a.id} head={8} tail={6} copy />
                  </td>
                  <td className={`num mono${isZero(a.unstakedBalanceAmount) ? ' dim' : ''}`} title={`${formatPoktExact(a.unstakedBalanceAmount)} POKT`}>
                    {formatPokt(a.unstakedBalanceAmount)} POKT
                  </td>
                  <td className={`num mono${isZero(a.supplierStakeAmount) ? ' dim' : ''}`} title={`${formatPoktExact(a.supplierStakeAmount)} POKT`}>
                    {formatPokt(a.supplierStakeAmount)} POKT
                  </td>
                  <td className={`num mono${isZero(a.applicationStakeAmount) ? ' dim' : ''}`} title={`${formatPoktExact(a.applicationStakeAmount)} POKT`}>
                    {formatPokt(a.applicationStakeAmount)} POKT
                  </td>
                  <td>
                    {a.shannonDestAddress ? (
                      <Hash value={a.shannonDestAddress} href={`/account/${a.shannonDestAddress}`} head={10} tail={6} />
                    ) : (
                      <span className="dim">—</span>
                    )}
                  </td>
                  <td className="dim">
                    {a.claimedAtId ? <Link href={`/block/${a.claimedAtId}`}>#{formatNumber(a.claimedAtId)}</Link> : '—'}
                  </td>
                  <td>{a.transactionId ? <Hash value={a.transactionId} href={`/tx/${a.transactionId}`} /> : <span className="dim">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {nodes.length === 0 ? (
          <EmptyState>
            {address ? `No Morse claimable account matches ${address}.` : 'No Morse claimable accounts on this network.'}
          </EmptyState>
        ) : (
          <Pager page={page} pageSize={PAGE_SIZE} totalCount={totalCount} />
        )}
      </div>
    </>
  );
}
