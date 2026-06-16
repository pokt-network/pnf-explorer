import { NetLink as Link } from '@/components/shell/NetLink';
import { Hash } from '@/components/ui/Hash';
import { EmptyState } from '@/components/ui/states';
import { sumUpokt } from '@/lib/tx';
import { formatPokt, formatNumber } from '@/lib/format';
import type { Transfer } from '@/lib/data/address';

/** Native transfers (MsgSend) relative to a subject address: IN/OUT direction + signed amount. */
export function TransferTable({ transfers, address, empty = 'No transfers for this address.' }: { transfers: Transfer[]; address: string; empty?: string }) {
  if (transfers.length === 0) return <EmptyState>{empty}</EmptyState>;
  return (
    <div className="tbl-scroll">
      <table className="tbl">
        <thead>
          <tr>
            <th>Tx Hash</th>
            <th></th>
            <th>Counterparty</th>
            <th>Block</th>
            <th className="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {transfers.map((t) => {
            const out = t.senderId === address;
            const counterparty = out ? t.recipientId : t.senderId;
            const pokt = formatPokt(sumUpokt(t.amounts));
            return (
              <tr key={t.id}>
                <td>
                  <Hash value={t.transaction.id} href={`/tx/${t.transaction.id}`} />
                </td>
                <td>
                  <span className={`dirtag ${out ? 'dir-out' : 'dir-in'}`}>{out ? 'OUT' : 'IN'}</span>
                </td>
                <td>
                  <Hash value={counterparty} href={`/account/${counterparty}`} />
                </td>
                <td>
                  {t.block ? <Link href={`/block/${t.block.height}`}>{formatNumber(t.block.height)}</Link> : <span className="dim">—</span>}
                </td>
                <td className={`num mono ${out ? 'out' : 'in'}`}>
                  {out ? '−' : '+'}
                  {pokt} POKT
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
