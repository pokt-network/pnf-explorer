import { TxTable } from '@/components/tx/TxTable';
import { TransferTable } from '@/components/tx/TransferTable';
import { Pager } from '@/components/ui/Pager';
import { EmptyState } from '@/components/ui/states';
import { getAddressTransactions, getTransfers } from '@/lib/data/address';
import type { NetworkId } from '@/lib/networks';

const TAB_LIMIT = 25;

function InlineError({ what }: { what: string }) {
  return <EmptyState>Couldn’t load {what} right now.</EmptyState>;
}

/** Transactions tab (signed by `address`) — shared by account + validator detail pages. Paged via `?txs=`. */
export async function AddressTransactionsPanel({ network, address, page }: { network: NetworkId; address: string; page: number }) {
  let data: Awaited<ReturnType<typeof getAddressTransactions>> | null = null;
  try {
    data = await getAddressTransactions(network, address, TAB_LIMIT, (page - 1) * TAB_LIMIT);
  } catch {
    return (
      <div className="card flush-top">
        <InlineError what="transactions" />
      </div>
    );
  }
  return (
    <div className="card flush-top">
      <TxTable txs={data.nodes} columns={['type', 'block', 'age', 'fee', 'result']} empty="No transactions for this address." />
      {data.totalCount > TAB_LIMIT ? <Pager page={page} pageSize={TAB_LIMIT} totalCount={data.totalCount} param="txs" /> : null}
    </div>
  );
}

/** Transfers tab (native MsgSend in/out) — indexer-served (not LCD), so no provenance strip. Paged via `?transfers=`. */
export async function AddressTransfersPanel({ network, address, page }: { network: NetworkId; address: string; page: number }) {
  let data: Awaited<ReturnType<typeof getTransfers>> | null = null;
  try {
    data = await getTransfers(network, address, TAB_LIMIT, (page - 1) * TAB_LIMIT);
  } catch {
    return (
      <div className="card flush-top">
        <InlineError what="transfers" />
      </div>
    );
  }
  return (
    <div className="card flush-top">
      <TransferTable transfers={data.nodes} address={address} />
      {data.totalCount > TAB_LIMIT ? <Pager page={page} pageSize={TAB_LIMIT} totalCount={data.totalCount} param="transfers" /> : null}
    </div>
  );
}

/** Count badges for the tab headers (so they show totals without fetching twice in the page). */
export async function addressTabCounts(network: NetworkId, address: string) {
  const [txs, transfers] = await Promise.all([
    getAddressTransactions(network, address, 1, 0).catch(() => null),
    getTransfers(network, address, 1, 0).catch(() => null),
  ]);
  return { txCount: txs?.totalCount ?? null, transferCount: transfers?.totalCount ?? null };
}
