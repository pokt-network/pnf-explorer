import { NetLink as Link } from '@/components/shell/NetLink';
import { StakeStatusPill, TxResultPill } from '@/components/ui/StatusPill';
import { morseChainName } from '@/lib/morse/chains';
import { morseStakeLabel, morseTxTypeLabel } from '@/lib/morse/format';

// Pills and small cells shared by the Morse archive's pages.

/** A tx's result. A pending tx was seen in the mempool and never reached a block before the halt. */
export function MorseTxResult({ pending, code, full = false }: { pending?: boolean; code?: number; full?: boolean }) {
  if (pending) {
    return (
      <span className="statuspill s-unstk" title="Seen in the mempool; never included in a block before Morse halted">
        Pending
      </span>
    );
  }
  return <TxResultPill code={code} full={full} />;
}

export function MorseTxType({ type }: { type: string }) {
  return (
    <span className="pill-soft" title={type}>
      {morseTxTypeLabel(type)}
    </span>
  );
}

/** A node's or app's standing: its stake status, plus Jailed and Validator when they apply. */
export function MorseStakePills({ status, jailed, validator, sm = false }: { status: number; jailed?: boolean; validator?: boolean; sm?: boolean }) {
  const cls = `statuspill${sm ? ' sm' : ''}`;
  return (
    <span className="pillrow">
      <StakeStatusPill status={morseStakeLabel(status)} sm={sm} />
      {jailed ? <span className={`${cls} s-jailed`}>Jailed</span> : null}
      {validator ? (
        <span className={`${cls} s-validator`} title="In the Morse validator set">
          Validator
        </span>
      ) : null}
    </span>
  );
}

/**
 * Relay chains, each by name with its 4-hex id beside it (e.g. "Ethereum F00C"), linking to the nodes or apps staked for
 * it. Names come from the vendored chains map (lib/morse/chains.ts); an id it doesn't name shows bare.
 */
export function ChainList({ chains, to = 'nodes', max }: { chains: string[] | null | undefined; to?: 'nodes' | 'apps'; max?: number }) {
  if (!chains?.length) return <span className="dim">—</span>;
  const shown = max ? chains.slice(0, max) : chains;
  return (
    <span className="chainlist">
      {shown.map((c) => {
        const name = morseChainName(c);
        return (
          <Link key={c} className="pill-soft" href={`/morse/${to}?chain=${c}`} title={`${to === 'nodes' ? 'Nodes' : 'Apps'} staked for ${name ?? c}`}>
            {name ?? <span className="mono">{c}</span>}
            {name ? <span className="cid">{c}</span> : null}
          </Link>
        );
      })}
      {max && chains.length > max ? (
        <span className="dim" title={chains.slice(max).map((c) => morseChainName(c) ?? c).join(', ')}>
          +{chains.length - max}
        </span>
      ) : null}
    </span>
  );
}
