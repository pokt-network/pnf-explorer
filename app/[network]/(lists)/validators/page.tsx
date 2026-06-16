import type { Metadata } from 'next';
import { NetLink as Link } from '@/components/shell/NetLink';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Tic } from '@/components/ui/Icons';
import { Pager } from '@/components/ui/Pager';
import { StakeStatusPill } from '@/components/ui/StatusPill';
import { EmptyState } from '@/components/ui/states';
import { getValidatorList, getBondedTokensMap } from '@/lib/data/validators';
import type { NetworkId } from '@/lib/networks';
import { formatNumber, formatPokt, truncate } from '@/lib/format';
import { formatCommission, validatorMoniker } from '@/lib/validator';
import { sumUpokt } from '@/lib/tx';

export const metadata: Metadata = { title: 'Validators' };

// ~35 validators total — fetch enough to compute an honest network share in one page.
const FETCH_LIMIT = 100;
const PAGE_SIZE = 25;

export default async function ValidatorsPage({
  params,
  searchParams,
}: {
  params: Promise<{ network: NetworkId }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { network } = await params;
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const [{ nodes, totalCount }, bondedTokens] = await Promise.all([
    getValidatorList(network, FETCH_LIMIT, 0),
    getBondedTokensMap(network),
  ]);

  // Voting power is total bonded `tokens` (self-stake + delegations) from the LCD — the security
  // weight — NOT the indexer's `stakeAmount` (operator self-stake only). Fall back per-row to
  // stakeAmount when the LCD map is empty/missing a validator.
  const votingPowerOf = (v: (typeof nodes)[number]) =>
    bondedTokens.get(v.id) ?? v.stakeAmount ?? '0';

  // Honest share denominator: sum of bonded voting power (upokt) across the validator set.
  const totalStake = sumUpokt(nodes.map((v) => ({ denom: v.stakeDenom ?? 'upokt', amount: votingPowerOf(v) })));
  const totalStakeNum = Number(totalStake);

  // Rank by voting power (bonded tokens) descending so the "#" column is meaningful. BigInt
  // compare keeps large upokt amounts exact. All validators are fetched before paging, so the
  // rank is stable across pages.
  const toUpoktInt = (v: string) => BigInt(String(v).split('.')[0] || '0');
  const ranked = [...nodes].sort((a, b) => {
    const d = toUpoktInt(votingPowerOf(b)) - toUpoktInt(votingPowerOf(a));
    return d > 0n ? 1 : d < 0n ? -1 : 0;
  });

  const offset = (page - 1) * PAGE_SIZE;
  const pageRows = ranked.slice(offset, offset + PAGE_SIZE);
  const from = totalCount === 0 ? 0 : offset + 1;
  const to = Math.min(offset + PAGE_SIZE, ranked.length);

  return (
    <>
      <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Validators' }]} />
      <div className="listhead">
        <Tic entity="validator" iconSize={20} />
        <h1>Validators</h1>
        <span className="cnt">
          Showing {formatNumber(from)}–{formatNumber(to)} of {formatNumber(totalCount)}
        </span>
      </div>

      <div className="card">
        <div className="tbl-scroll">
          <table className="tbl">
            <thead>
              <tr>
                <th className="rank">#</th>
                <th>Validator</th>
                <th>Status</th>
                <th className="num">Voting Power</th>
                <th className="num">Share</th>
                <th className="num">Commission</th>
                <th className="num">Self-Deleg.</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((v, i) => {
                const rank = offset + i + 1;
                const moniker = validatorMoniker(v.description) ?? truncate(v.id, 10, 6);
                const votingPower = votingPowerOf(v);
                const stakeNum = Number(sumUpokt([{ denom: v.stakeDenom ?? 'upokt', amount: votingPower }]));
                const sharePct = totalStakeNum > 0 ? (stakeNum / totalStakeNum) * 100 : 0;
                return (
                  <tr key={v.id}>
                    <td className="rank">{rank}</td>
                    <td>
                      <Link href={`/validator/${v.id}`}>{moniker}</Link>
                      <br />
                      <span className="mono dim" style={{ fontSize: 11 }}>
                        {truncate(v.id, 14, 4)}
                      </span>
                    </td>
                    <td>
                      <StakeStatusPill status={v.stakeStatus} sm />
                    </td>
                    <td className="num mono">{formatPokt(votingPower)} POKT</td>
                    <td className="num dim">
                      {sharePct.toFixed(1)}%
                      <span className="bar-mini">
                        <i style={{ width: `${Math.min(100, sharePct)}%` }} />
                      </span>
                    </td>
                    <td className="num">{formatCommission(v.commission)}</td>
                    {/* Operator self-delegation = the validator's own stake (stakeAmount), NOT
                        minSelfDelegation (the tiny ~1 upokt protocol-minimum threshold). */}
                    <td className="num mono">{formatPokt(v.stakeAmount ?? '0')} POKT</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {pageRows.length === 0 ? (
          <EmptyState>No validators found.</EmptyState>
        ) : (
          <Pager page={page} pageSize={PAGE_SIZE} totalCount={totalCount} />
        )}
      </div>
    </>
  );
}
