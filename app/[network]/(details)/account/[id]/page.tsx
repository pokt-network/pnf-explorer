import type { Metadata } from 'next';
import { NetLink as Link } from '@/components/shell/NetLink';
import { notFound } from 'next/navigation';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Tic } from '@/components/ui/Icons';
import { Hash } from '@/components/ui/Hash';
import { Tabs } from '@/components/ui/Tabs';
import type { TabDef } from '@/components/ui/Tabs';
import { RawJson } from '@/components/ui/RawJson';
import { IndexerBanner } from '@/components/ui/IndexerBanner';
import { RolesSummary } from '@/components/account/RolesSummary';
import { SupplierServicesPanel } from '@/components/account/SupplierServicesPanel';
import { SupplierTrafficPanel } from '@/components/account/SupplierTrafficPanel';
import { OperatorsPanel } from '@/components/account/OperatorsPanel';
import { DelegationsPanel } from '@/components/account/DelegationsPanel';
import { RevSharePanel } from '@/components/account/RevSharePanel';
import { AddressTransactionsPanel, AddressTransfersPanel, addressTabCounts } from '@/components/address/AddressPanels';
import { getUseRpcData } from '@/lib/metadata';
import { getAccountProfile } from '@/lib/data/accounts';
import type { AccountProfile } from '@/lib/data/accounts';
import type { NetworkId } from '@/lib/networks';
import { formatNumber, formatPokt, formatUpokt, truncate } from '@/lib/format';
import { parsePage } from '@/lib/paging';
import { relativeTime, absoluteUtc } from '@/lib/time';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const short = id.length > 7 ? `${id.slice(0, 7)}…` : id;
  return { title: `Account ${short}` };
}

/** Active-role chips for the header. Each maps to an existing typetag tint. */
function roleChips(profile: AccountProfile): { label: string; cls: string }[] {
  const chips: { label: string; cls: string }[] = [];
  if (profile.supplier) chips.push({ label: 'Operator', cls: 'tt-acct' });
  if (profile.owner) chips.push({ label: 'Owner', cls: 'tt-acct' });
  if (profile.validator) chips.push({ label: 'Validator', cls: 'tt-val' });
  if (profile.application) chips.push({ label: 'Application', cls: 'tt-acct' });
  if (profile.gateway) chips.push({ label: 'Gateway', cls: 'tt-acct' });
  if (profile.ownedServices.length > 0) chips.push({ label: 'Service Owner', cls: 'tt-svc' });
  if (profile.revShareRecipientConfigs > 0) chips.push({ label: 'Rev-share', cls: 'tt-svc' });
  return chips;
}

export default async function AccountDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ network: NetworkId; id: string }>;
  searchParams: Promise<{ ops?: string; gateways?: string; apps?: string; revshare?: string; txs?: string; transfers?: string }>;
}) {
  const { network, id } = await params;
  const sp = await searchParams;
  const fallback = await getUseRpcData(network);

  const [profile, counts] = await Promise.all([getAccountProfile(network, id), addressTabCounts(network, id)]);

  const balance = profile.account?.balances?.nodes?.find((b) => b.denom === 'upokt') ?? profile.account?.balances?.nodes?.[0] ?? null;
  const hasBalance = balance != null && Number(balance.amount) > 0;
  const chips = roleChips(profile);
  const anyRole = chips.length > 0;

  // Missing entity: no account record AND no roles AND no balance.
  if (profile.account == null && !anyRole && !hasBalance) notFound();

  const currentHeight = fallback.metadata?.targetHeight ?? null;
  const rawData = profile.account ?? { id, balances: { nodes: [] } };

  // Role-gated tabs come first (the reason you opened this account), then the universal ones.
  const tabs: TabDef[] = [];
  if (profile.supplier) {
    tabs.push({
      key: 'svc',
      label: 'Services',
      badge: profile.supplier.serviceConfigs.totalCount || undefined,
      panel: <SupplierServicesPanel supplier={profile.supplier} />,
    });
    tabs.push({
      key: 'traffic',
      label: 'Traffic',
      panel: <SupplierTrafficPanel network={network} supplier={profile.supplier} currentHeight={currentHeight} />,
    });
  }
  if (profile.owner) {
    tabs.push({
      key: 'ops',
      label: 'Operators',
      badge: profile.owner.operatorCount || undefined,
      panel: <OperatorsPanel network={network} address={id} page={parsePage(sp.ops)} />,
    });
  }
  if (profile.application) {
    tabs.push({
      key: 'appgw',
      label: 'Delegated Gateways',
      badge: profile.application.delegatedGatewayCount || undefined,
      panel: <DelegationsPanel network={network} address={id} direction="app-gateways" page={parsePage(sp.gateways)} />,
    });
  }
  if (profile.gateway) {
    tabs.push({
      key: 'gwapp',
      label: 'Delegating Apps',
      badge: profile.gateway.delegatingAppCount || undefined,
      panel: <DelegationsPanel network={network} address={id} direction="gateway-apps" page={parsePage(sp.apps)} />,
    });
  }
  if (profile.revShareRecipientConfigs > 0) {
    tabs.push({
      key: 'rs',
      label: 'Rev-share',
      badge: profile.revShareRecipientConfigs,
      panel: <RevSharePanel network={network} address={id} page={parsePage(sp.revshare)} />,
    });
  }
  tabs.push(
    { key: 'txs', label: 'Transactions', badge: counts.txCount ?? undefined, panel: <AddressTransactionsPanel network={network} address={id} page={parsePage(sp.txs)} /> },
    { key: 'xfer', label: 'Transfers', badge: counts.transferCount ?? undefined, panel: <AddressTransfersPanel network={network} address={id} page={parsePage(sp.transfers)} /> },
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
  );

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
            {chips.map((c) => (
              <span key={c.label} className={`typetag ${c.cls}`} style={{ marginLeft: 10 }}>
                {c.label}
              </span>
            ))}
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

        <RolesSummary profile={profile} address={id} currentHeight={currentHeight} />
      </div>

      <Tabs tabs={tabs} />
    </>
  );
}
