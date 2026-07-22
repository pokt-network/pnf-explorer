import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NetLink as Link } from '@/components/shell/NetLink';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Tic } from '@/components/ui/Icons';
import { Hash } from '@/components/ui/Hash';
import { Tabs } from '@/components/ui/Tabs';
import { RawJson } from '@/components/ui/RawJson';
import { IndexerBanner } from '@/components/ui/IndexerBanner';
import { StakeStatusPill } from '@/components/ui/StatusPill';
import { AddressTransactionsPanel, AddressTransfersPanel, addressTabCounts } from '@/components/address/AddressPanels';
import { UptimeGrid } from '@/components/validator/UptimeGrid';
import { DelegatorsPanel } from '@/components/validator/DelegatorsPanel';
import { getUseRpcData } from '@/lib/metadata';
import { getValidator, getValidatorUptime, getDelegators, getValidatorBondedTokens, getValidatorUnbonding } from '@/lib/data/validators';
import type { NetworkId } from '@/lib/networks';
import { formatPokt, formatPoktCompact, formatUpokt, formatNumber, truncate } from '@/lib/format';
import { parsePage } from '@/lib/paging';
import { absoluteUtc } from '@/lib/time';
import { formatCommission, validatorMoniker } from '@/lib/validator';

export async function generateMetadata({ params }: { params: Promise<{ network: NetworkId; id: string }> }): Promise<Metadata> {
  const { network, id } = await params;
  const validator = await getValidator(network, id).catch(() => null);
  const moniker = validator ? validatorMoniker(validator.description) : null;
  return { title: moniker ? `Validator ${moniker}` : `Validator ${truncate(id, 10, 6)}` };
}

export default async function ValidatorDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ network: NetworkId; id: string }>;
  searchParams: Promise<{ txs?: string; transfers?: string }>;
}) {
  const { network, id } = await params;
  const sp = await searchParams;
  const fallback = await getUseRpcData(network);
  const validator = await getValidator(network, id);
  if (!validator) notFound();

  const moniker = validatorMoniker(validator.description);
  const headTitle = moniker ?? truncate(validator.id, 10, 6);
  // The operator account is the pokt1-prefixed address, NOT signerId (which is the valoper).
  const operator = validator.signerPoktPrefixId ?? validator.signerId;

  // Signer balance (upokt) lives on signerPoktPrefix (signer.balances is empty).
  const signerBalances = validator.signerPoktPrefix?.balances?.nodes ?? [];
  const signerBalance = signerBalances.find((b) => b.denom === 'upokt') ?? signerBalances[0] ?? null;

  // Parallelize the tab data that the page needs to seed badges + the always-LCD/uptime panels.
  // Unbonding is Cosmos-side (LCD) and only relevant while the validator is Unstaking.
  const [counts, uptime, delegators, bondedTokens, unbonding] = await Promise.all([
    addressTabCounts(network, operator),
    getValidatorUptime(network, validator.id),
    getDelegators(network, validator.id),
    getValidatorBondedTokens(network, validator.id),
    validator.stakeStatus === 'Unstaking' ? getValidatorUnbonding(network, validator.id) : Promise.resolve(null),
  ]);

  // Voting power is the total bonded `tokens` (self-stake + delegations) — the security weight —
  // NOT the indexer's `stakeAmount`, which is the operator self-stake only. LCD is the only source
  // for the total; fall back to the self-stake if the LCD is unavailable.
  const selfStakeUpokt = validator.stakeAmount ?? '0';
  const votingPowerUpokt = bondedTokens ?? selfStakeUpokt;

  const delegatorPanel = <DelegatorsPanel network={network} valoper={validator.id} signerId={operator} />;
  const uptimePanel = <UptimeGrid uptime={uptime} />;

  const tabs = [
    { key: 'del', label: 'Delegators', badge: delegators.length || undefined, panel: delegatorPanel },
    { key: 'up', label: 'Uptime', panel: uptimePanel },
    { key: 'txs', label: 'Transactions', badge: counts.txCount ?? undefined, panel: <AddressTransactionsPanel network={network} address={operator} page={parsePage(sp.txs)} /> },
    { key: 'xfer', label: 'Transfers', badge: counts.transferCount ?? undefined, panel: <AddressTransfersPanel network={network} address={operator} page={parsePage(sp.transfers)} /> },
    {
      key: 'raw',
      label: 'Raw',
      panel: (
        <RawJson
          title="Raw Validator"
          source={
            <>
              indexer · falls back to <b>Cosmos LCD</b> when behind
            </>
          }
          data={validator}
        />
      ),
    },
  ];

  return (
    <>
      <Breadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Validators', href: '/validators' },
          { label: truncate(validator.id, 10, 6) },
        ]}
      />

      {fallback.useRpc ? <IndexerBanner lag={fallback.lag} /> : null}

      <div className="pagetitle">
        <Tic entity="validator" />
        <div>
          <h1>
            {headTitle}
            <span className="typetag tt-val" style={{ marginLeft: 10 }}>
              Validator
            </span>{' '}
            <StakeStatusPill status={validator.stakeStatus} />
          </h1>
          <div className="hash">
            <Hash value={validator.id} full copy />
          </div>
        </div>
      </div>

      <div className="toprow">
        <div className="card balance">
          <div className="lbl">Voting Power (Bonded)</div>
          <div className="big">
            {formatPoktCompact(votingPowerUpokt)}
            <span className="u"> POKT</span>
          </div>
          <div className="upokt">{formatUpokt(votingPowerUpokt)} upokt</div>
          <div className="upd">Self-stake {formatPokt(selfStakeUpokt)} POKT</div>
          <div className="upd">
            Signer balance{' '}
            {signerBalance && Number(signerBalance.amount) > 0 ? `${formatPokt(signerBalance.amount)} POKT` : '—'}
          </div>
        </div>

        <div className="card kv" style={{ paddingTop: 0 }}>
          <div className="ttl">Validator Info</div>
          <div className="line">
            <div className="k">Status</div>
            <div className="v">
              <StakeStatusPill status={validator.stakeStatus} />
            </div>
          </div>
          <div className="line">
            <div className="k">Commission</div>
            <div className="v">{formatCommission(validator.commission)}</div>
          </div>
          <div className="line">
            <div className="k">Min Self-Delegation</div>
            {/* min_self_delegation is a base-unit (upokt) math.Int — the on-chain protocol
                minimum, typically 1–100 upokt. Rendering it as POKT shows a misleading 0.00. */}
            <div className="v">{formatUpokt(validator.minSelfDelegation ?? '0')} upokt</div>
          </div>
          <div className="line">
            <div className="k">Signer</div>
            <div className="v">
              <Hash value={operator} href={`/account/${operator}`} />
            </div>
          </div>
          {unbonding ? (
            <div className="line">
              <div className="k">Unbonding</div>
              <div className="v">
                Completes at block <Link href={`/block/${unbonding.height}`}>{formatNumber(unbonding.height)}</Link>
                {unbonding.time ? <span className="dim"> · {absoluteUtc(unbonding.time)}</span> : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <Tabs tabs={tabs} />
    </>
  );
}
