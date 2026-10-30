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
import { getMorseFinalBlock, getMorseNodes } from '@/lib/morse/api';
import { MORSE_STATUS_OPTIONS, parseCursor, parseMorseChain, parseMorseStatus } from '@/lib/morse/format';
import { formatNumber, formatPokt, formatPoktCompact, formatPoktExact } from '@/lib/format';

export const metadata: Metadata = {
  title: 'Morse Nodes',
  description: 'Nodes (servicers and validators) of the archived Morse chain of Pocket Network, filterable by stake status, jailing, and relay chain.',
};

const PAGE_SIZE = 25;

export default async function MorseNodesPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string; status?: string; jailed?: string; chain?: string }>;
}) {
  const sp = await searchParams;
  const cursor = parseCursor(sp.cursor);
  const status = parseMorseStatus(sp.status);
  const jailed = sp.jailed === 'true' ? true : sp.jailed === 'false' ? false : undefined;
  const chain = parseMorseChain(sp.chain);
  const [page, final] = await Promise.all([getMorseNodes({ limit: PAGE_SIZE, cursor, status, jailed, chain }), getMorseFinalBlock()]);

  const groups = [
    { param: 'status', active: status ?? '', options: MORSE_STATUS_OPTIONS },
    {
      param: 'jailed',
      active: jailed == null ? '' : String(jailed),
      options: [
        { value: '', label: 'Any' },
        { value: 'true', label: 'Jailed' },
        { value: 'false', label: 'Not jailed' },
      ],
    },
  ];
  if (chain) groups.push({ param: 'chain', active: chain, options: [{ value: '', label: 'Any chain' }, { value: chain, label: morseChainLabel(chain) }] });

  return (
    <>
      <Breadcrumb items={[{ label: 'Morse', href: '/morse' }, { label: 'Nodes' }]} />
      <div className="listhead">
        <Tic entity="supplier" iconSize={20} />
        <h1>Nodes</h1>
        <span className="cnt">{final?.total_nodes != null ? `${formatNumber(final.total_nodes)} nodes at the final block` : null}</span>
      </div>

      <div className="sumrow">
        <SummaryCard
          label="Staked"
          dot={DOT.mint}
          value={formatNumber(final?.nodes_unjailed_staked ?? 0)}
          sub={`${formatPoktCompact(final?.nodes_unjailed_staked_tokens)} POKT`}
        />
        <SummaryCard
          label="Unstaking"
          dot={DOT.gold}
          value={formatNumber(final?.nodes_unjailed_unstaking ?? 0)}
          sub={`${formatPoktCompact(final?.nodes_unjailed_unstaking_tokens)} POKT`}
        />
        <SummaryCard
          label="Jailed & Staked"
          dot={DOT.coral}
          value={formatNumber(final?.nodes_jailed_staked ?? 0)}
          sub={`${formatPoktCompact(final?.nodes_jailed_staked_tokens)} POKT`}
        />
        <SummaryCard label="Relay Chains" dot={DOT.lavender} value={formatNumber(final?.supported_block_chains?.length ?? 0)} sub="Supported at the final block" />
      </div>

      <ParamChips groups={groups} />

      <div className="card">
        {page.items.length === 0 ? (
          <EmptyState>No nodes match these filters.</EmptyState>
        ) : (
          <div className="tbl-scroll">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Address</th>
                  <th>Status</th>
                  <th className="num">Staked</th>
                  <th>Chains</th>
                  <th>Service Domain</th>
                  <th>Version</th>
                </tr>
              </thead>
              <tbody>
                {page.items.map((n) => (
                  <tr key={n.address}>
                    <td>
                      <Hash value={n.address} href={`/morse/node/${n.address}`} />
                    </td>
                    <td>
                      <MorseStakePills status={n.status} jailed={n.jailed} validator={n.validator} sm />
                    </td>
                    <td className="num mono" title={n.tokens ? `${formatPoktExact(n.tokens)} POKT` : undefined}>
                      {n.tokens ? formatPokt(n.tokens, 0) : '—'}
                    </td>
                    <td>
                      <ChainList chains={n.chains} max={3} />
                    </td>
                    <td className="dim">{n.service_domain || '—'}</td>
                    <td className="dim">{n.version || '—'}</td>
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
