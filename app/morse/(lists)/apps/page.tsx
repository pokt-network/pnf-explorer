import type { Metadata } from 'next';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Tic } from '@/components/ui/Icons';
import { Hash } from '@/components/ui/Hash';
import { SummaryCard, DOT } from '@/components/ui/SummaryCard';
import { EmptyState } from '@/components/ui/states';
import { CursorPager } from '@/components/morse/CursorPager';
import { ParamChips } from '@/components/morse/ParamChips';
import { ChainList, MorseStakePills } from '@/components/morse/pills';
import { morseChainLabel } from '@/lib/morse/chains';
import { getMorseApps, getMorseFinalBlock } from '@/lib/morse/api';
import { MORSE_STATUS_OPTIONS, parseCursor, parseMorseChain, parseMorseStatus, utcShort } from '@/lib/morse/format';
import { formatNumber, formatPokt, formatPoktCompact, formatPoktExact } from '@/lib/format';
import { absoluteUtc } from '@/lib/time';

export const metadata: Metadata = {
  title: 'Morse Applications',
  description: 'Applications of the archived Morse chain of Pocket Network, latest state change first, filterable by stake status and relay chain.',
};

const PAGE_SIZE = 25;

export default async function MorseAppsPage({ searchParams }: { searchParams: Promise<{ cursor?: string; status?: string; chain?: string }> }) {
  const sp = await searchParams;
  const cursor = parseCursor(sp.cursor);
  const status = parseMorseStatus(sp.status);
  const chain = parseMorseChain(sp.chain);
  const [page, final] = await Promise.all([getMorseApps({ limit: PAGE_SIZE, cursor, status, chain }), getMorseFinalBlock()]);

  const groups = [{ param: 'status', active: status ?? '', options: MORSE_STATUS_OPTIONS }];
  if (chain) groups.push({ param: 'chain', active: chain, options: [{ value: '', label: 'Any chain' }, { value: chain, label: morseChainLabel(chain) }] });

  return (
    <>
      <Breadcrumb items={[{ label: 'Morse', href: '/morse' }, { label: 'Applications' }]} />
      <div className="listhead">
        <Tic entity="application" iconSize={20} />
        <h1>Applications</h1>
        <span className="cnt">{final?.total_apps != null ? `${formatNumber(final.total_apps)} apps at the final block` : null}</span>
      </div>

      <div className="sumrow c3">
        <SummaryCard label="Staked" dot={DOT.mint} value={formatNumber(final?.apps_staked ?? 0)} sub={`${formatPoktCompact(final?.apps_staked_tokens)} POKT`} />
        <SummaryCard label="Unstaking" dot={DOT.gold} value={formatNumber(final?.apps_unstaking ?? 0)} sub={`${formatPoktCompact(final?.apps_unstaking_tokens)} POKT`} />
        <SummaryCard label="Total Apps" dot={DOT.lavender} value={formatNumber(final?.total_apps ?? 0)} sub="At the final block" />
      </div>

      <ParamChips groups={groups} />

      <div className="card">
        {page.items.length === 0 ? (
          <EmptyState>No applications match these filters.</EmptyState>
        ) : (
          <div className="tbl-scroll">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Address</th>
                  <th>Status</th>
                  <th className="num">Staked</th>
                  <th className="num">Max Relays</th>
                  <th>Chains</th>
                  <th>Last Change (UTC)</th>
                </tr>
              </thead>
              <tbody>
                {page.items.map((a) => (
                  <tr key={a.address}>
                    <td>
                      <Hash value={a.address} href={`/morse/app/${a.address}`} />
                    </td>
                    <td>
                      <MorseStakePills status={a.status} sm />
                    </td>
                    <td className="num mono" title={a.tokens ? `${formatPoktExact(a.tokens)} POKT` : undefined}>
                      {a.tokens ? formatPokt(a.tokens, 0) : '—'}
                    </td>
                    <td className="num">{a.max_relays != null ? formatNumber(a.max_relays) : '—'}</td>
                    <td>
                      <ChainList chains={a.chains} to="apps" max={3} />
                    </td>
                    <td className="dim" title={absoluteUtc(a.block_time)}>
                      {utcShort(a.block_time)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <CursorPager cursor={cursor} nextCursor={page.next_cursor} pageSize={PAGE_SIZE} />
      </div>
    </>
  );
}
