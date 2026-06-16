import { NetLink as Link } from '@/components/shell/NetLink';
import { Hash } from '@/components/ui/Hash';
import { TxIcon } from '@/components/ui/Icons';
import { getTransactionsList } from '@/lib/data/transactions';
import type { NetworkId } from '@/lib/networks';
import { primaryMessage, formatFees, sumUpokt } from '@/lib/tx';
import { formatPokt } from '@/lib/format';
import { relativeTime, absoluteUtc } from '@/lib/time';
import type { BlockTx } from '@/lib/data/blocks';

// For transfers (MsgSend) the moved amount is more meaningful than the fee.
function amountLabel(tx: BlockTx): { value: string; unit: string } {
  const sent = sumUpokt(tx.amountSentByDenom);
  if (sent > BigInt(0)) return { value: formatPokt(sent, 2), unit: 'POKT' };
  return { value: formatFees(tx.fees, 4), unit: 'POKT' };
}

// Latest 10 transactions panel (home). Reuses the verified transactionsList fetch.
export async function RecentTxs({ network }: { network: NetworkId }) {
  const { nodes } = await getTransactionsList(network, 10, 0, 'all');
  return (
    <div className="card panel">
      <div className="head">
        <h2>
          <span className="hicon" style={{ background: 'rgba(255,197,71,.14)' }}>
            <TxIcon size={14} stroke="var(--gold)" />
          </span>
          Latest Transactions
        </h2>
        <Link className="viewall" href="/txs">
          View all →
        </Link>
      </div>
      {nodes.map((tx) => {
        const msg = primaryMessage(tx.amountOfMessages);
        const ok = Number(tx.code) === 0;
        const amt = amountLabel(tx);
        return (
          <div className="row" key={tx.id}>
            <div className="ic" style={{ color: ok ? 'var(--blue-soft)' : 'var(--coral)', background: ok ? 'rgba(2,90,242,.1)' : 'rgba(255,90,95,.1)' }}>
              Tx
            </div>
            <div className="mid">
              <div className="top">
                <Link href={`/tx/${tx.id}`} className="mono" style={{ fontSize: 13 }}>
                  <Hash value={tx.id} />
                </Link>
                <span className="age" title={tx.block ? absoluteUtc(tx.block.timestamp) : undefined}>
                  {tx.block ? relativeTime(tx.block.timestamp) : 'pending'}
                </span>
              </div>
              <div className="btm">
                {msg ? <span className="txtype">{msg.label}{msg.count > 1 ? ` +${msg.count - 1}` : ''}</span> : null}
                {tx.signerAddress ? (
                  <span className="mono">
                    signer <Hash value={tx.signerAddress} href={`/account/${tx.signerAddress}`} />
                  </span>
                ) : null}
              </div>
            </div>
            <div className="end">
              <div className="amt">
                {amt.value}
                <span className="u">{amt.unit}</span>
              </div>
              <div className={`tag ${ok ? 'tag-ok' : 'tag-fail'}`}>{ok ? 'Success' : 'Failed'}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
