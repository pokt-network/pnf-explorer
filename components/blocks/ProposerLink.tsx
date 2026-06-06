import Link from 'next/link';
import { getConsensusValidatorMap } from '@/lib/data/validators';
import { truncate } from '@/lib/format';

/**
 * Renders a block proposer. `proposerAddress` is a Tendermint consensus address (a validator's
 * ed25519Id), so it links to the matching validator — NOT to /account (which would 404). Falls
 * back to plain hex if no validator matches (e.g. a since-removed validator).
 */
export async function ProposerLink({ address, full = false }: { address: string; full?: boolean }) {
  const map = await getConsensusValidatorMap();
  const v = map.get(address.toUpperCase());
  if (v) {
    return (
      <Link href={`/validator/${v.id}`} title={address}>
        {v.moniker ?? truncate(v.id, 12, 6)}
      </Link>
    );
  }
  return (
    <span className="mono dim" title="Tendermint consensus address — no matching validator">
      {full ? address : truncate(address, 8, 6)}
    </span>
  );
}
