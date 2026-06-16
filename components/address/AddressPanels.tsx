import { TxTable } from '@/components/tx/TxTable';
import { TransferTable } from '@/components/tx/TransferTable';
import { EmptyState } from '@/components/ui/states';
import { getAddressTransactions, getTransfers } from '@/lib/data/address';
import type { NetworkId } from '@/lib/networks';
import { formatNumber } from '@/lib/format';

const TAB_LIMIT = 25;

function MoreFooter({ shown, total, noun }: { shown: number; total: number; noun: string }) {
  if (total <= shown) return null;
  return (
    <div className="pager">
      <span>
        Showing first {shown} of {formatNumber(total)} {noun}
      </span>
    </div>
  );
}

function InlineError({ what }: { what: string }) {
  return <EmptyState>Couldn’t load {what} right now.</EmptyState>;
}

/** Transactions tab (signed by `address`) — shared by account + validator detail pages. */
export async function AddressTransactionsPanel({ network, address }: { network: NetworkId; address: string }) {
  let data: Awaited<ReturnType<typeof getAddressTransactions>> | null = null;
  try {
    data = await getAddressTransactions(network, address, TAB_LIMIT, 0);
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
      <MoreFooter shown={TAB_LIMIT} total={data.totalCount} noun="transactions" />
    </div>
  );
}

/** Transfers tab (native MsgSend in/out) — indexer-served (not LCD), so no provenance strip. */
export async function AddressTransfersPanel({ network, address }: { network: NetworkId; address: string }) {
  let data: Awaited<ReturnType<typeof getTransfers>> | null = null;
  try {
    data = await getTransfers(network, address, TAB_LIMIT, 0);
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
      <MoreFooter shown={TAB_LIMIT} total={data.totalCount} noun="transfers" />
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
