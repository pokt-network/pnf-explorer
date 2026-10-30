import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { NetLink as Link } from '@/components/shell/NetLink';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Tic } from '@/components/ui/Icons';
import { Hash } from '@/components/ui/Hash';
import { Tabs } from '@/components/ui/Tabs';
import { KvSkeleton } from '@/components/ui/states';
import { ChainList, MorseStakePills } from '@/components/morse/pills';
import { MigrationCard } from '@/components/morse/MigrationCard';
import { OtherRoles, activityTabs, type ActivityParams } from '@/components/morse/activity';
import { getMorseApp, morseAddress } from '@/lib/morse/api';
import { formatNumber, formatPokt, formatPoktExact } from '@/lib/format';
import { absoluteUtc } from '@/lib/time';
import type { MorseAppMigration } from '@/lib/morse/types';

export async function generateMetadata({ params }: { params: Promise<{ address: string }> }): Promise<Metadata> {
  const { address } = await params;
  return {
    title: `Morse App ${address.slice(0, 10)}…`,
    description: `Application ${address} on the archived Morse chain of Pocket Network — stake, chains, and transactions.`,
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

/** The other app of a stake migration (Morse's app-stake transfer), with where and how much. */
function Migration({ m }: { m: MorseAppMigration }) {
  return (
    <>
      {m.address ? <Hash value={m.address} href={`/morse/app/${m.address}`} full /> : '—'}
      <span className="muted">
        {m.height ? (
          <>
            {' '}
            · at <Link href={`/morse/block/${m.height}`}>block {formatNumber(m.height)}</Link>
          </>
        ) : null}
        {m.tokens ? (
          <>
            {' '}
            · <Pokt upokt={m.tokens} />
          </>
        ) : null}
      </span>
    </>
  );
}

export default async function MorseAppPage({ params, searchParams }: { params: Promise<{ address: string }>; searchParams: Promise<ActivityParams> }) {
  const address = morseAddress((await params).address);
  if (!address) notFound();
  const app = await getMorseApp(address);
  if (!app) notFound();
  const tabs = await activityTabs(address, await searchParams, { raw: { title: 'Application', source: 'morse-api /v1/apps/{address}', data: app } });

  return (
    <>
      <Breadcrumb items={[{ label: 'Morse', href: '/morse' }, { label: 'Applications', href: '/morse/apps' }, { label: `${address.slice(0, 10)}…` }]} />

      <div className="pagetitle">
        <Tic entity="application" />
        <div>
          <h1>
            Application <MorseStakePills status={app.status} />
          </h1>
          <div className="hash">
            <Hash value={address} full copy />
          </div>
        </div>
      </div>

      <div className="card kv">
        <Line k="Stake">
          <Pokt upokt={app.tokens} />
        </Line>
        <Line k="Balance">
          <Pokt upokt={app.balance} />
        </Line>
        <Line k="Max Relays">{app.max_relays != null ? formatNumber(app.max_relays) : '—'}</Line>
        <Line k="Chains">
          <ChainList chains={app.chains} to="apps" />
        </Line>
        {app.public_key ? (
          <Line k="Public Key">
            <span className="mono">{app.public_key}</span>
          </Line>
        ) : null}
        {app.migrated_from ? (
          <Line k="Migrated From">
            <Migration m={app.migrated_from} />
          </Line>
        ) : null}
        {app.migrated_to ? (
          <Line k="Migrated To">
            <Migration m={app.migrated_to} />
          </Line>
        ) : null}
        {app.unstaking_time ? <Line k="Unstaking Completes">{absoluteUtc(app.unstaking_time)}</Line> : null}
        {app.height ? (
          <Line k="State As Of">
            <Link href={`/morse/block/${app.height}`}>Block {formatNumber(app.height)}</Link>
            {app.block_time ? <span className="muted"> · {absoluteUtc(app.block_time)}</span> : null}
          </Line>
        ) : null}
        <OtherRoles address={address} self="app" />
      </div>

      <Suspense fallback={<KvSkeleton rows={3} />}>
        <MigrationCard address={address} />
      </Suspense>

      <Tabs tabs={tabs} />
    </>
  );
}
