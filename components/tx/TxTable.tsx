import { NetLink as Link } from '@/components/shell/NetLink';
import { Hash } from '@/components/ui/Hash';
import { TxResultPill } from '@/components/ui/StatusPill';
import { EmptyState } from '@/components/ui/states';
import { formatFees, primaryMessage } from '@/lib/tx';
import { formatNumber } from '@/lib/format';
import { relativeTime, absoluteUtc } from '@/lib/time';
import type { BlockTx } from '@/lib/data/blocks';

export type TxColumn = 'type' | 'block' | 'age' | 'signer' | 'fee' | 'result';

const HEADERS: Record<TxColumn, { label: string; num?: boolean }> = {
  type: { label: 'Type' },
  block: { label: 'Block' },
  age: { label: 'Age' },
  signer: { label: 'Signer' },
  fee: { label: 'Fee', num: true },
  result: { label: 'Result', num: true },
};

function TypePill({ tx }: { tx: BlockTx }) {
  const msg = primaryMessage(tx.amountOfMessages);
  if (!msg) return <span className="dim">—</span>;
  return (
    <span className="pill-soft" title={msg.full}>
      {msg.label}
      {msg.count > 1 ? ` +${msg.count - 1}` : ''}
    </span>
  );
}

/** Shared transaction table. `columns` selects which columns appear after the always-present Tx Hash. */
export function TxTable({ txs, columns, empty = 'No transactions.' }: { txs: BlockTx[]; columns: TxColumn[]; empty?: string }) {
  if (txs.length === 0) return <EmptyState>{empty}</EmptyState>;
  return (
    <div className="tbl-scroll">
      <table className="tbl">
        <thead>
          <tr>
            <th>Tx Hash</th>
            {columns.map((c) => (
              <th key={c} className={HEADERS[c].num ? 'num' : undefined}>
                {HEADERS[c].label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {txs.map((tx) => (
            <tr key={tx.id}>
              <td>
                <Hash value={tx.id} href={`/tx/${tx.id}`} />
              </td>
              {columns.map((c) => {
                switch (c) {
                  case 'type':
                    return (
                      <td key={c}>
                        <TypePill tx={tx} />
                      </td>
                    );
                  case 'block':
                    // A tip tx can be indexed before its block row → no timestamp yet (transient); the height is its own.
                    return (
                      <td key={c}>
                        <Link href={`/block/${tx.block.height}`}>{formatNumber(tx.block.height)}</Link>
                      </td>
                    );
                  case 'age':
                    return (
                      <td key={c} className="dim" title={tx.block.timestamp ? absoluteUtc(tx.block.timestamp) : undefined}>
                        {tx.block.timestamp ? relativeTime(tx.block.timestamp) : 'pending'}
                      </td>
                    );
                  case 'signer':
                    return (
                      <td key={c}>
                        {tx.signerAddress ? <Hash value={tx.signerAddress} href={`/account/${tx.signerAddress}`} /> : <span className="dim">—</span>}
                      </td>
                    );
                  case 'fee':
                    return (
                      <td key={c} className="num mono">
                        {formatFees(tx.fees)}
                      </td>
                    );
                  case 'result':
                    return (
                      <td key={c} className="num">
                        <TxResultPill code={tx.code} />
                      </td>
                    );
                  default:
                    return null;
                }
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
