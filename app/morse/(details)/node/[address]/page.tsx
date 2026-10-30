import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { NetLink as Link } from '@/components/shell/NetLink';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Tic } from '@/components/ui/Icons';
import { Hash } from '@/components/ui/Hash';
import { Tabs, type TabDef } from '@/components/ui/Tabs';
import { KvSkeleton } from '@/components/ui/states';
import { ChainList, MorseStakePills } from '@/components/morse/pills';
import { MigrationCard } from '@/components/morse/MigrationCard';
import { AddressLine, OtherRoles, activityTabs, type ActivityParams } from '@/components/morse/activity';
import { getMorseNode, morseAddress } from '@/lib/morse/api';
import { formatNumber, formatPokt, formatPoktExact } from '@/lib/format';
import { absoluteUtc } from '@/lib/time';

export async function generateMetadata({ params }: { params: Promise<{ address: string }> }): Promise<Metadata> {
  const { address } = await params;
  return {
    title: `Morse Node ${address.slice(0, 10)}…`,
    description: `Node ${address} on the archived Morse chain of Pocket Network — stake, chains, rewards, and transactions.`,
  };
}

function Line({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="line">
      <div className="k">{k}</div>
      <div className="v">{children}</div>
    </div>
  );
}

const Pokt = ({ upokt }: { upokt?: string | null }) =>
  upokt != null ? <span title={`${formatPoktExact(upokt)} POKT`}>{formatPokt(upokt)} POKT</span> : <span className="dim">—</span>;

export default async function MorseNodePage({ params, searchParams }: { params: Promise<{ address: string }>; searchParams: Promise<ActivityParams> }) {
  const address = morseAddress((await params).address);
  if (!address) notFound();
  const node = await getMorseNode(address);
  if (!node) notFound();
  const sp = await searchParams;

  const extra: TabDef[] = [];
  if (node.chains_history?.length) {
    extra.push({
      key: 'chains',
      label: 'Relays by Chain',
      panel: (
        <div className="card flush-top">
          <div className="tbl-scroll">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Chain</th>
                  <th className="num">Relays Served</th>
                </tr>
              </thead>
              <tbody>
                {node.chains_history.map((c) => (
                  <tr key={c.chain}>
                    <td>
                      <ChainList chains={c.chain ? [c.chain] : []} />
                    </td>
                    <td className="num">{formatNumber(c.relays ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ),
    });
  }
  if (node.reward_delegators?.length) {
    extra.push({
      key: 'delegators',
      label: 'Reward Delegators',
      panel: (
        <div className="card flush-top">
          <div className="tbl-scroll">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Address</th>
                  <th className="num">Share</th>
                </tr>
              </thead>
              <tbody>
                {node.reward_delegators.map((d, i) => (
                  <tr key={`${d.address}-${i}`}>
                    <td>{d.address ? <Hash value={d.address} href={`/morse/account/${d.address}`} head={10} tail={6} /> : '—'}</td>
                    <td className="num">{d.share ?? 0}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ),
    });
  }
  const tabs = await activityTabs(address, sp, { producer: true, extra, raw: { title: 'Node', source: 'morse-api /v1/nodes/{address}', data: node } });

  return (
    <>
      <Breadcrumb items={[{ label: 'Morse', href: '/morse' }, { label: 'Nodes', href: '/morse/nodes' }, { label: `${address.slice(0, 10)}…` }]} />

      <div className="pagetitle">
        <Tic entity="supplier" />
        <div>
          <h1>
            Node <MorseStakePills status={node.status} jailed={node.jailed} validator={node.validator} />
          </h1>
          <div className="hash">
            <Hash value={address} full copy />
          </div>
        </div>
      </div>

      <div className="card kv">
        <Line k="Stake">
          <Pokt upokt={node.tokens} />
        </Line>
        <Line k="Balance">
          <Pokt upokt={node.balance} />
        </Line>
        <AddressLine k="Output Address" value={node.output_address} />
        {!node.custodial && node.output_address ? (
          <Line k="Output Balance">
            <Pokt upokt={node.output_balance} />
            <span className="muted"> · non-custodial: rewards and unstaked tokens go to the output address</span>
          </Line>
        ) : null}
        <Line k="Service URL">{node.service_url || '—'}</Line>
        <Line k="Chains">
          <ChainList chains={node.chains} />
        </Line>
        {node.version ? <Line k="Version">{node.version}</Line> : null}
        {node.public_key ? (
          <Line k="Public Key">
            <span className="mono">{node.public_key}</span>
          </Line>
        ) : null}
        {node.start_height ? (
          <Line k="Staked Since">
            <Link href={`/morse/block/${node.start_height}`}>Block {formatNumber(node.start_height)}</Link>
          </Line>
        ) : null}
        {node.unstaking_time ? <Line k="Unstaking Completes">{absoluteUtc(node.unstaking_time)}</Line> : null}
        {node.jailed ? (
          <Line k="Jailed">
            {node.jailed_until ? `until ${absoluteUtc(node.jailed_until)}` : 'yes'}
            <span className="muted">
              {' '}
              · jailed blocks {formatNumber(node.jailed_blocks_counter ?? 0)} · missed signing {formatNumber(node.missed_signing_blocks_counter ?? 0)}
            </span>
          </Line>
        ) : null}
        {node.height ? (
          <Line k="State As Of">
            <Link href={`/morse/block/${node.height}`}>Block {formatNumber(node.height)}</Link>
            {node.block_time ? <span className="muted"> · {absoluteUtc(node.block_time)}</span> : null}
          </Line>
        ) : null}
        <OtherRoles address={address} self="node" />
      </div>

      <Suspense fallback={<KvSkeleton rows={3} />}>
        <MigrationCard address={address} />
      </Suspense>

      <Tabs tabs={tabs} />
    </>
  );
}
