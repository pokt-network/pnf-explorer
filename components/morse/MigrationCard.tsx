import { NetLink as Link } from '@/components/shell/NetLink';
import { Hash } from '@/components/ui/Hash';
import { getMorseClaim } from '@/lib/data/migration';
import { formatNumber, formatPokt, formatPoktExact, isZero, toBigInt } from '@/lib/format';

// Where a Morse address went on Shannon: its row in mainnet's Morse claimable accounts (the same data as /migration).
// Shown on the archive's account, node and app pages. Links point at the mainnet explorer (prefix-less paths).

function Pokt({ upokt }: { upokt: string }) {
  return <span title={`${formatPoktExact(upokt)} POKT`}>{formatPokt(upokt)} POKT</span>;
}

export async function MigrationCard({ address }: { address: string }) {
  let claim: Awaited<ReturnType<typeof getMorseClaim>>;
  try {
    claim = await getMorseClaim('main', address);
  } catch (e) {
    console.error(`Morse claim lookup failed for ${address}: ${(e as Error).message}`);
    return (
      <div className="card kv migcard">
        <div className="ttl">Shannon Migration</div>
        <div className="line">
          <div className="v dim">The migration status couldn’t be read from the mainnet indexer right now.</div>
        </div>
      </div>
    );
  }

  if (!claim) {
    return (
      <div className="card kv migcard">
        <div className="ttl">Shannon Migration</div>
        <div className="line">
          <div className="v dim">This address had nothing to claim on Shannon.</div>
        </div>
      </div>
    );
  }

  const total = (
    toBigInt(claim.unstakedBalanceAmount) +
    toBigInt(claim.supplierStakeAmount) +
    toBigInt(claim.applicationStakeAmount)
  ).toString();
  const claimed = claim.claimedAtId != null;

  return (
    <div className="card kv migcard">
      <div className="ttl">Shannon Migration</div>
      <div className="line">
        <div className="k">Status</div>
        <div className="v">
          <span className={`statuspill sm ${claimed ? 's-ok' : 's-unstk'}`}>{claimed ? 'Claimed' : 'Unclaimed'}</span>{' '}
          <Link className="dim" href={`/migration?address=${claim.id}`}>
            View in Morse Migration →
          </Link>
        </div>
      </div>
      <div className="line">
        <div className="k">Claimable</div>
        <div className="v">
          <Pokt upokt={total} />
          <span className="muted">
            {' '}
            · liquid <Pokt upokt={claim.unstakedBalanceAmount} />
            {!isZero(claim.supplierStakeAmount) ? (
              <>
                {' '}
                · supplier stake <Pokt upokt={claim.supplierStakeAmount} />
              </>
            ) : null}
            {!isZero(claim.applicationStakeAmount) ? (
              <>
                {' '}
                · app stake <Pokt upokt={claim.applicationStakeAmount} />
              </>
            ) : null}
          </span>
        </div>
      </div>
      {claimed ? (
        <>
          <div className="line">
            <div className="k">Shannon Destination</div>
            <div className="v">
              {claim.shannonDestAddress ? <Hash value={claim.shannonDestAddress} href={`/account/${claim.shannonDestAddress}`} full copy /> : <span className="dim">—</span>}
            </div>
          </div>
          <div className="line">
            <div className="k">Claimed At</div>
            <div className="v">
              <Link href={`/block/${claim.claimedAtId}`}>Shannon block #{formatNumber(claim.claimedAtId)}</Link>
              {claim.transactionId ? (
                <>
                  {' '}
                  · <Hash value={claim.transactionId} href={`/tx/${claim.transactionId}`} />
                </>
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
