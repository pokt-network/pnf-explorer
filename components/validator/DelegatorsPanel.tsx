import { Hash } from '@/components/ui/Hash';
import { LcdSourceStrip } from '@/components/ui/LcdSourceStrip';
import { EmptyState } from '@/components/ui/states';
import { getDelegators } from '@/lib/data/validators';
import { formatNumber, formatPokt } from '@/lib/format';

/**
 * Delegators tab — always-LCD content (§2). Read live from the Sauron staking endpoint;
 * the gold provenance strip makes that explicit. `shares` is a decimal string; `amount` is
 * upokt. The validator's own signer is tagged "(self)".
 */
export async function DelegatorsPanel({ valoper, signerId }: { valoper: string; signerId: string }) {
  const delegators = await getDelegators(valoper);

  return (
    <div className="card flush-top">
      <LcdSourceStrip>Delegations are read live via the Sauron LCD staking endpoint.</LcdSourceStrip>
      {delegators.length === 0 ? (
        <EmptyState>No delegators for this validator.</EmptyState>
      ) : (
        <div className="tbl-scroll">
          <table className="tbl">
            <thead>
              <tr>
                <th>Delegator</th>
                <th className="num">Shares</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {delegators.map((d) => (
                <tr key={d.delegatorAddress}>
                  <td>
                    <Hash value={d.delegatorAddress} href={`/account/${d.delegatorAddress}`} />
                    {d.delegatorAddress === signerId ? <span className="dim"> (self)</span> : null}
                  </td>
                  <td className="num mono">{formatNumber(String(d.shares).split('.')[0])}</td>
                  <td className="num mono">{formatPokt(d.amount)} POKT</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
