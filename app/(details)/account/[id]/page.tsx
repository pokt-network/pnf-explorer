import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Tic } from '@/components/ui/Icons';
import { Hash } from '@/components/ui/Hash';
import { CopyButton } from '@/components/ui/CopyButton';
import { Tabs } from '@/components/ui/Tabs';
import { RawJson } from '@/components/ui/RawJson';
import { IndexerBanner } from '@/components/ui/IndexerBanner';
import { StakeStatusPill } from '@/components/ui/StatusPill';
import { AddressTransactionsPanel, AddressTransfersPanel, addressTabCounts } from '@/components/address/AddressPanels';
import { getUseRpcData } from '@/lib/metadata';
import { getAccount, getAddressRoles } from '@/lib/data/accounts';
import type { StakeRole } from '@/lib/data/accounts';
import { formatNumber, formatPokt, formatUpokt, truncate } from '@/lib/format';
import { relativeTime, absoluteUtc } from '@/lib/time';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const short = id.length > 7 ? `${id.slice(0, 7)}…` : id;
  return { title: `Account ${short}` };
}

const STAKED = 'Staked';

/** First staked actor role → label for the header typetag (e.g. "Supplier Owner"). */
function primaryRoleLabel(roles: { supplier: StakeRole | null; application: StakeRole | null; gateway: StakeRole | null }): string | null {
  if (roles.supplier?.stakeStatus === STAKED) return 'Supplier';
  if (roles.application?.stakeStatus === STAKED) return 'Application';
  if (roles.gateway?.stakeStatus === STAKED) return 'Gateway';
  return null;
}

function RoleLine({ label, role }: { label: string; role: StakeRole | null }) {
  const staked = role?.stakeStatus === STAKED || role?.stakeStatus === 'Unstaking';
  return (
    <div className="line">
      <div className="k">{label}</div>
      <div className="v">
        {staked && role ? (
          <>
            <StakeStatusPill status={role.stakeStatus} />{' '}
            <span className="dim">· {formatPokt(role.stakeAmount)} POKT</span>
          </>
        ) : (
          <span className="muted">Not staked</span>
        )}
      </div>
    </div>
  );
}

export default async function AccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fallback = await getUseRpcData();

  const [account, roles, counts] = await Promise.all([getAccount(id), getAddressRoles(id), addressTabCounts(id)]);

  const balance = account?.balances?.nodes?.find((b) => b.denom === 'upokt') ?? account?.balances?.nodes?.[0] ?? null;
  const hasBalance = balance != null && Number(balance.amount) > 0;
  const anyRole =
    roles.supplier != null || roles.application != null || roles.gateway != null || (roles.account?.balances?.nodes?.length ?? 0) > 0;

  // Missing entity: no account record AND no roles AND no balance.
  if (account == null && !anyRole && !hasBalance) notFound();

  const roleLabel = primaryRoleLabel(roles);

  const rawData = account ?? { id, balances: { nodes: [] } };

  const tabs = [
    {
      key: 'txs',
      label: 'Transactions',
      badge: counts.txCount ?? undefined,
      panel: <AddressTransactionsPanel address={id} />,
    },
    {
      key: 'xfer',
      label: 'Transfers',
      badge: counts.transferCount ?? undefined,
      panel: <AddressTransfersPanel address={id} />,
    },
    {
      key: 'raw',
      label: 'Raw',
      panel: (
        <RawJson
          title="Raw Account"
          source={
            <>
              indexer · falls back to <b>Cosmos LCD</b> when behind
            </>
          }
          data={rawData}
        />
      ),
    },
  ];

  return (
    <>
      <Breadcrumb
        items={[{ label: 'Home', href: '/' }, { label: 'Accounts', href: '/accounts' }, { label: truncate(id, 7, 5) }]}
      />

      {fallback.useRpc ? <IndexerBanner lag={fallback.lag} /> : null}

      <div className="pagetitle">
        <Tic entity="account" />
        <div>
          <h1>
            Account
            {roleLabel ? <span className="typetag tt-acct" style={{ marginLeft: 10 }}>{roleLabel}</span> : null}
          </h1>
          <div className="hash">
            <Hash value={id} full copy />
          </div>
        </div>
      </div>

      <div className="toprow">
        <div className="card balance">
          <div className="lbl">Balance</div>
          <div className="big">
            {formatPokt(balance?.amount ?? '0')}
            <span className="u">POKT</span>
          </div>
          <div className="upokt">{formatUpokt(balance?.amount ?? '0')} upokt</div>
          {balance?.lastUpdatedBlock ? (
            <div className="upd" title={absoluteUtc(balance.lastUpdatedBlock.timestamp)}>
              Last updated at block <Link href={`/block/${balance.lastUpdatedBlock.height}`}>{formatNumber(balance.lastUpdatedBlock.height)}</Link>
              {' · '}
              {relativeTime(balance.lastUpdatedBlock.timestamp)}
            </div>
          ) : null}
        </div>

        <div className="card kv" style={{ paddingTop: 0 }}>
          <div className="ttl">Network Roles</div>
          <RoleLine label="Supplier" role={roles.supplier} />
          <RoleLine label="Application" role={roles.application} />
          <RoleLine label="Gateway" role={roles.gateway} />
          <div className="line">
            <div className="k">Validator</div>
            <div className="v">
              <span className="muted">No</span>
            </div>
          </div>
        </div>
      </div>

      <Tabs tabs={tabs} />
    </>
  );
}
