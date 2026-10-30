import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { NetLink as Link } from '@/components/shell/NetLink';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Tic } from '@/components/ui/Icons';
import { Hash } from '@/components/ui/Hash';
import { Tabs } from '@/components/ui/Tabs';
import { KvSkeleton } from '@/components/ui/states';
import { MigrationCard } from '@/components/morse/MigrationCard';
import { OtherRoles, activityTabs, type ActivityParams } from '@/components/morse/activity';
import { getMorseAccount, getMorseSearch, morseAddress, morseHitHref } from '@/lib/morse/api';
import { formatNumber, formatPokt, formatPoktExact } from '@/lib/format';
import { absoluteUtc } from '@/lib/time';

export async function generateMetadata({ params }: { params: Promise<{ address: string }> }): Promise<Metadata> {
  const { address } = await params;
  return {
    title: `Morse Account ${address.slice(0, 10)}…`,
    description: `Account ${address} on the archived Morse chain of Pocket Network — balance, transactions, transfers, and its Shannon migration.`,
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

export default async function MorseAccountPage({ params, searchParams }: { params: Promise<{ address: string }>; searchParams: Promise<ActivityParams> }) {
  const address = morseAddress((await params).address);
  if (!address) notFound();
  const account = await getMorseAccount(address);
  if (!account) {
    // No account record, but a node or app may hold the address (tx tables link every address here).
    const href = (await getMorseSearch(address)).filter((h) => h.address === address).map(morseHitHref).find(Boolean);
    if (href) redirect(href);
    notFound();
  }
  const tabs = await activityTabs(address, await searchParams, { raw: { title: 'Account', source: 'morse-api /v1/accounts/{address}', data: account } });

  return (
    <>
      <Breadcrumb items={[{ label: 'Morse', href: '/morse' }, { label: 'Accounts', href: '/morse/accounts' }, { label: `${address.slice(0, 10)}…` }]} />

      <div className="pagetitle">
        <Tic entity="account" />
        <div>
          <h1>Account</h1>
          <div className="hash">
            <Hash value={address} full copy />
          </div>
        </div>
      </div>

      <div className="card kv">
        <Line k="Balance">
          {account.amount != null ? (
            <span title={`${formatPoktExact(account.amount)} POKT`}>{formatPokt(account.amount)} POKT</span>
          ) : (
            <span className="dim">—</span>
          )}
        </Line>
        {account.public_key ? (
          <Line k="Public Key">
            <span className="mono">{account.public_key}</span>
          </Line>
        ) : null}
        {account.height ? (
          <Line k="Last Change">
            <Link href={`/morse/block/${account.height}`}>Block {formatNumber(account.height)}</Link>
            {account.block_time ? <span className="muted"> · {absoluteUtc(account.block_time)}</span> : null}
          </Line>
        ) : null}
        <OtherRoles address={address} self="account" />
      </div>

      <Suspense fallback={<KvSkeleton rows={3} />}>
        <MigrationCard address={address} />
      </Suspense>

      <Tabs tabs={tabs} />
    </>
  );
}
