import { NetLink as Link } from '@/components/shell/NetLink';
import { Hash } from '@/components/ui/Hash';
import { EmptyState } from '@/components/ui/states';
import { MorseTxResult, MorseTxType } from '@/components/morse/pills';
import { formatNumber, formatPokt, formatPoktExact, isZero } from '@/lib/format';
import { absoluteUtc } from '@/lib/time';
import { utcShort } from '@/lib/morse/format';
import type { MorseTransfer, MorseTx } from '@/lib/morse/types';

export type MorseTxColumn = 'type' | 'block' | 'time' | 'from' | 'to' | 'amount' | 'fee' | 'result';

const HEADERS: Record<MorseTxColumn, { label: string; num?: boolean }> = {
  type: { label: 'Type' },
  block: { label: 'Block' },
  time: { label: 'Time (UTC)' },
  from: { label: 'From' },
  to: { label: 'To' },
  amount: { label: 'Amount', num: true },
  fee: { label: 'Fee', num: true },
  result: { label: 'Result', num: true },
};

/** A Morse address cell. Addresses open as accounts: the account page links the node or app behind one. */
function Addr({ value }: { value?: string }) {
  if (!value) return <span className="dim">—</span>;
  return <Hash value={value} href={`/morse/account/${value}`} />;
}

/** A height cell, or "Pending" for a tx that never reached a block (height 0). */
function BlockCell({ height, pending }: { height?: number; pending?: boolean }) {
  if (pending || !height) return <span className="dim">Pending</span>;
  return <Link href={`/morse/block/${height}`}>{formatNumber(height)}</Link>;
}

function Amount({ upokt }: { upokt?: string | null }) {
  if (upokt == null || isZero(upokt)) return <span className="dim">—</span>;
  return <span title={`${formatPoktExact(upokt)} POKT`}>{formatPokt(upokt)}</span>;
}

/** The Morse archive's transaction table: `columns` after the always-present Tx Hash. */
export function MorseTxTable({ txs, columns, empty = 'No transactions.' }: { txs: MorseTx[]; columns: MorseTxColumn[]; empty?: string }) {
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
            <tr key={tx.hash}>
              <td>
                <Hash value={tx.hash} href={`/morse/tx/${tx.hash}`} />
              </td>
              {columns.map((c) => {
                switch (c) {
                  case 'type':
                    return (
                      <td key={c}>
                        <MorseTxType type={tx.type} />
                      </td>
                    );
                  case 'block':
                    return (
                      <td key={c}>
                        <BlockCell height={tx.height} pending={tx.pending} />
                      </td>
                    );
                  case 'time':
                    return (
                      <td key={c} className="dim" title={absoluteUtc(tx.block_time)}>
                        {utcShort(tx.block_time)}
                      </td>
                    );
                  case 'from':
                    return (
                      <td key={c}>
                        <Addr value={tx.from_address} />
                      </td>
                    );
                  case 'to':
                    return (
                      <td key={c}>
                        <Addr value={tx.to_address} />
                      </td>
                    );
                  case 'amount':
                    return (
                      <td key={c} className="num mono">
                        <Amount upokt={tx.amount} />
                      </td>
                    );
                  case 'fee':
                    return (
                      <td key={c} className="num mono">
                        <Amount upokt={tx.total_fee} />
                      </td>
                    );
                  case 'result':
                    return (
                      <td key={c} className="num">
                        <MorseTxResult pending={tx.pending} code={tx.result_code} />
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

/** Value moved in or out of one address, from its own side (`flow`). */
export function MorseTransferTable({ transfers, empty = 'No transfers.' }: { transfers: MorseTransfer[]; empty?: string }) {
  if (transfers.length === 0) return <EmptyState>{empty}</EmptyState>;
  return (
    <div className="tbl-scroll">
      <table className="tbl">
        <thead>
          <tr>
            <th>Tx Hash</th>
            <th>Block</th>
            <th>Time (UTC)</th>
            <th>Direction</th>
            <th>Counterparty</th>
            <th className="num">Amount</th>
            <th className="num">Result</th>
          </tr>
        </thead>
        <tbody>
          {transfers.map((t) => (
            <tr key={`${t.tx_hash}-${t.flow}`}>
              <td>
                <Hash value={t.tx_hash} href={`/morse/tx/${t.tx_hash}`} />
              </td>
              <td>
                <BlockCell height={t.height} pending={t.pending} />
              </td>
              <td className="dim" title={absoluteUtc(t.block_time)}>
                {utcShort(t.block_time)}
              </td>
              <td>
                <span className={`statuspill sm ${t.flow === 'in' ? 's-ok' : 's-unstk'}`}>{t.flow === 'in' ? 'In' : 'Out'}</span>
              </td>
              <td>
                <Addr value={t.flow === 'in' ? t.from_address : t.to_address} />
              </td>
              <td className="num mono">
                <Amount upokt={t.amount} />
              </td>
              <td className="num">
                <MorseTxResult pending={t.pending} code={t.tx_result_code} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
