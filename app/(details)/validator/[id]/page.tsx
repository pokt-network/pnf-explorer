import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
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
import { getValidator, getValidatorUptime, getDelegators, getValidatorBondedTokens } from '@/lib/data/validators';
import { formatPokt, formatPoktCompact, formatUpokt, truncate } from '@/lib/format';
import { formatCommission, validatorMoniker } from '@/lib/validator';
import { sumUpokt } from '@/lib/tx';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const validator = await getValidator(id).catch(() => null);
  const moniker = validator ? validatorMoniker(validator.description) : null;
  return { title: moniker ? `Validator ${moniker}` : `Validator ${truncate(id, 10, 6)}` };
}

export default async function ValidatorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fallback = await getUseRpcData();
  const validator = await getValidator(id);
  if (!validator) notFound();

  const moniker = validatorMoniker(validator.description);
  const headTitle = moniker ?? truncate(validator.id, 10, 6);
  // The operator account is the pokt1-prefixed address, NOT signerId (which is the valoper).
  const operator = validator.signerPoktPrefixId ?? validator.signerId;

  // Signer balance (upokt) lives on signerPoktPrefix (signer.balances is empty).
  const signerBalances = validator.signerPoktPrefix?.balances?.nodes ?? [];
  const signerBalance = signerBalances.find((b) => b.denom === 'upokt') ?? signerBalances[0] ?? null;

  // Parallelize the tab data that the page needs to seed badges + the always-LCD/uptime panels.
  const [counts, uptime, delegators, bondedTokens] = await Promise.all([
    addressTabCounts(operator),
    getValidatorUptime(validator.id),
    getDelegators(validator.id),
    getValidatorBondedTokens(validator.id),
  ]);

  // Voting power is the total bonded `tokens` (self-stake + delegations) — the security weight —
  // NOT the indexer's `stakeAmount`, which is the operator self-stake only. LCD is the only source
  // for the total; fall back to the self-stake if the LCD is unavailable.
  const selfStakeUpokt = validator.stakeAmount ?? '0';
  const votingPowerUpokt = bondedTokens ?? selfStakeUpokt;

  const delegatorPanel = <DelegatorsPanel valoper={validator.id} signerId={operator} />;
  const uptimePanel = <UptimeGrid uptime={uptime} />;

  const tabs = [
    { key: 'del', label: 'Delegators', badge: delegators.length || undefined, panel: delegatorPanel },
    { key: 'up', label: 'Uptime', panel: uptimePanel },
    { key: 'txs', label: 'Transactions', badge: counts.txCount ?? undefined, panel: <AddressTransactionsPanel address={operator} /> },
    { key: 'xfer', label: 'Transfers', badge: counts.transferCount ?? undefined, panel: <AddressTransfersPanel address={operator} /> },
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
        </div>
      </div>

      <Tabs tabs={tabs} />
    </>
  );
}
