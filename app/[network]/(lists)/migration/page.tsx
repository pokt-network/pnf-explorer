import type { Metadata } from 'next';
import { NetLink as Link } from '@/components/shell/NetLink';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Tic } from '@/components/ui/Icons';
import { DOT } from '@/components/ui/SummaryCard';
import { Pager } from '@/components/ui/Pager';
import { Hash } from '@/components/ui/Hash';
import { EmptyState } from '@/components/ui/states';
import { MorseSearch } from '@/components/migration/MorseSearch';
import { getMorseClaimableAccounts, getMorseClaimSummary, type MorseClaimableAccountRow } from '@/lib/data/migration';
import type { NetworkId } from '@/lib/networks';
import { formatNumber, formatPokt, formatPoktCompact, toBigInt } from '@/lib/format';

export const metadata: Metadata = {
  title: 'Morse Migration',
  description: 'Morse accounts claimable on Pocket Network Shannon, and how much of them has been claimed.',
};

const PAGE_SIZE = 25;

/** claimed / total as a percentage, rounded to 2 decimals like poktscan's — but never 100% before it is all claimed. */
function percent(claimed: bigint, total: bigint): number | null {
  if (total <= BigInt(0)) return null;
  const hundredths = Number((claimed * BigInt(20000) + total) / (total * BigInt(2)));
  return (claimed < total ? Math.min(hundredths, 9999) : hundredths) / 100;
}

/** A summary card for one claimed-of-total figure: claimed amount, its total, and a fill bar. */
function ClaimCard({ label, dot, claimed, total }: { label: string; dot: string; claimed: bigint; total: bigint }) {
  const pct = percent(claimed, total);
  return (
    <div className="card sum" title={`${formatPokt(claimed)} of ${formatPokt(total)} POKT claimed`}>
      <div className="lbl">
        <span className="dot" style={{ background: dot }} />
        {label}
      </div>
      <div className="val">
        {formatPoktCompact(claimed)}
        <span className="u">POKT</span>
      </div>
      <div className="sub">of {formatPoktCompact(total)} POKT</div>
      <div className="meter">
        <span className="track">
          <i style={{ width: `${pct ?? 0}%`, background: dot }} />
        </span>
        {pct == null ? '—' : `${pct.toFixed(2)}%`}
      </div>
    </div>
  );
}

const isZero = (upokt: string) => toBigInt(upokt) === BigInt(0);

/**
 * Where the claim landed, opened at the role the claim created: an application stake made the destination an
 * application, a supplier stake a supplier (the chain records the supplier's operator as the destination).
 */
function destinationHref(dest: string, a: MorseClaimableAccountRow): string {
  if (toBigInt(a.applicationStakeAmount) > BigInt(0)) return `/account/${dest}?as=application`;
  if (toBigInt(a.supplierStakeAmount) > BigInt(0)) return `/account/${dest}?as=supplier`;
  return `/account/${dest}`;
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
  const page = Math.max(1, Number(pageParam) || 1);
  const offset = (page - 1) * PAGE_SIZE;
  const address = (Array.isArray(addressParam) ? addressParam[0] : addressParam)?.trim() || undefined;

  const [list, summary] = await Promise.all([
    getMorseClaimableAccounts(network, PAGE_SIZE, offset, address),
    getMorseClaimSummary(network),
  ]);
  const { nodes, totalCount } = list;
  const from = totalCount === 0 ? 0 : offset + 1;
  const to = Math.min(offset + PAGE_SIZE, totalCount);

  const { claimed: c, unclaimed: u } = summary;
  const liquid = toBigInt(c.unstakedBalanceUpokt);
  const supplier = toBigInt(c.supplierStakeUpokt);
  const app = toBigInt(c.applicationStakeUpokt);
  const liquidTotal = liquid + toBigInt(u.unstakedBalanceUpokt);
  const supplierTotal = supplier + toBigInt(u.supplierStakeUpokt);
  const appTotal = app + toBigInt(u.applicationStakeUpokt);
  const claimedAccounts = toBigInt(c.accounts);

  return (
    <>
      <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Morse Migration' }]} />
      <div className="listhead">
        <Tic entity="account" iconSize={20} />
        <h1>Morse Migration</h1>
        <span className="cnt">
          Showing {formatNumber(from)}–{formatNumber(to)} of {formatNumber(totalCount)}
          {address ? ' matching' : ` · ${formatNumber(claimedAccounts)} claimed`}
        </span>
      </div>

      <div className="sumrow">
        <ClaimCard label="Total Claimed" dot={DOT.blue} claimed={liquid + supplier + app} total={liquidTotal + supplierTotal + appTotal} />
        <ClaimCard label="Claimed Liquid Balance" dot={DOT.mint} claimed={liquid} total={liquidTotal} />
        <ClaimCard label="Claimed Supplier Stake" dot={DOT.coral} claimed={supplier} total={supplierTotal} />
        <ClaimCard label="Claimed App Stake" dot={DOT.gold} claimed={app} total={appTotal} />
      </div>

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
                  <td className={`num mono${isZero(a.unstakedBalanceAmount) ? ' dim' : ''}`}>{formatPokt(a.unstakedBalanceAmount)} POKT</td>
                  <td className={`num mono${isZero(a.supplierStakeAmount) ? ' dim' : ''}`}>{formatPokt(a.supplierStakeAmount)} POKT</td>
                  <td className={`num mono${isZero(a.applicationStakeAmount) ? ' dim' : ''}`}>{formatPokt(a.applicationStakeAmount)} POKT</td>
                  <td>
                    {a.shannonDestAddress ? (
                      <Hash value={a.shannonDestAddress} href={destinationHref(a.shannonDestAddress, a)} head={10} tail={6} />
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
          <EmptyState>{address ? `No Morse claimable account matches ${address}.` : 'No Morse claimable accounts on this network.'}</EmptyState>
        ) : (
          <Pager page={page} pageSize={PAGE_SIZE} totalCount={totalCount} />
        )}
      </div>
    </>
  );
}
