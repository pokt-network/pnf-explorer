import { NetLink as Link } from '@/components/shell/NetLink';
import { Tabs } from '@/components/ui/Tabs';
import type { TabDef } from '@/components/ui/Tabs';
import { RawJson } from '@/components/ui/RawJson';
import { RolesSummary } from '@/components/account/RolesSummary';
import { AddressTransactionsPanel, AddressTransfersPanel, addressTabCounts } from '@/components/address/AddressPanels';
import type { AccountProfile } from '@/lib/data/accounts';
import type { NetworkId } from '@/lib/networks';
import { formatNumber, formatPokt, formatUpokt } from '@/lib/format';
import { relativeTime, absoluteUtc } from '@/lib/time';
import { parsePage } from '@/lib/paging';
import { getBlockTimes } from '@/lib/data/blocks';

/**
 * The wallet actor — liquid balance and the address's own transaction history. Everything staked
 * lives under the other roles; this view deliberately stops at what the account module knows.
 */
export async function AccountRoleView({
  network,
  address,
  profile,
  currentHeight,
  txsPage,
  transfersPage,
}: {
  network: NetworkId;
  address: string;
  profile: AccountProfile;
  currentHeight: number | null;
  txsPage: string | undefined;
  transfersPage: string | undefined;
}) {
  const balance = profile.account?.balances?.nodes?.find((b) => b.denom === 'upokt') ?? profile.account?.balances?.nodes?.[0] ?? null;
  // The balance's block time is read here, the one view that shows it; a failed read only drops the age.
  const updatedHeight = balance?.lastUpdatedBlock?.height ?? null;
  const [counts, updatedAt] = await Promise.all([
    addressTabCounts(network, address),
    updatedHeight ? getBlockTimes(network, [updatedHeight]).then((t) => t.get(updatedHeight) ?? null).catch(() => null) : null,
  ]);
  const rawData = profile.account ?? { id: address, balances: { nodes: [] } };

  const tabs: TabDef[] = [
    {
      key: 'txs',
      label: 'Transactions',
      badge: counts.txCount ?? undefined,
      panel: <AddressTransactionsPanel network={network} address={address} page={parsePage(txsPage)} />,
    },
    {
      key: 'xfer',
      label: 'Transfers',
      badge: counts.transferCount ?? undefined,
      panel: <AddressTransfersPanel network={network} address={address} page={parsePage(transfersPage)} />,
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
      <div className="card rolebox splitbox">
        <div className="card balance">
          <div className="lbl">Balance</div>
          <div className="big">
            {formatPokt(balance?.amount ?? '0')}
            <span className="u">POKT</span>
          </div>
          <div className="upokt">{formatUpokt(balance?.amount ?? '0')} upokt</div>
          {balance?.lastUpdatedBlock ? (
            <div className="upd" title={updatedAt ? absoluteUtc(updatedAt) : undefined}>
              Last updated at block{' '}
              <Link href={`/block/${balance.lastUpdatedBlock.height}`}>{formatNumber(balance.lastUpdatedBlock.height)}</Link>
              {updatedAt ? (
                <>
                  {' · '}
                  {relativeTime(updatedAt)}
                </>
              ) : null}
            </div>
          ) : null}
        </div>

        <RolesSummary network={network} profile={profile} address={address} currentHeight={currentHeight} />
      </div>

      <Tabs tabs={tabs} />
    </>
  );
}
