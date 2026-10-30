import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NetLink as Link } from '@/components/shell/NetLink';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Tic } from '@/components/ui/Icons';
import { Hash } from '@/components/ui/Hash';
import { Tabs, type TabDef } from '@/components/ui/Tabs';
import { RawJson } from '@/components/ui/RawJson';
import { ChainList, MorseTxResult, MorseTxType } from '@/components/morse/pills';
import { getMorseTx, morseHash } from '@/lib/morse/api';
import { formatNumber, formatPokt, formatPoktExact, isZero } from '@/lib/format';
import { absoluteUtc } from '@/lib/time';
import type { MorseTx } from '@/lib/morse/types';

export async function generateMetadata({ params }: { params: Promise<{ hash: string }> }): Promise<Metadata> {
  const { hash } = await params;
  return {
    title: `Morse Tx ${hash.slice(0, 10)}…`,
    description: `Transaction ${hash.slice(0, 16)}… on the archived Morse chain of Pocket Network.`,
  };
}

function Line({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="line">
      <div className="k">{k}</div>
      <div className="v">{children}</div>
    </div>
  );
}

function Pokt({ upokt }: { upokt: string | null | undefined }) {
  if (upokt == null) return <span className="dim">—</span>;
  return (
    <span title={`${formatPoktExact(upokt)} POKT`}>
      {formatPokt(upokt)} POKT
    </span>
  );
}

const Addr = ({ value, to = 'account' }: { value?: string; to?: 'account' | 'node' | 'app' }) =>
  value ? <Hash value={value} href={`/morse/${to}/${value}`} full copy /> : <span className="dim">—</span>;

/** "Raw" values a change_param tx carries are JSON-encoded strings ("\"0\""): show them decoded when they are. */
function paramValue(v: string | undefined): string {
  if (!v) return '—';
  try {
    const decoded: unknown = JSON.parse(v);
    return typeof decoded === 'string' ? decoded : JSON.stringify(decoded);
  } catch {
    return v;
  }
}

/** The fields only this tx's type carries, or null when it carries none worth a section. */
function typeDetails(tx: MorseTx): React.ReactNode {
  switch (tx.type) {
    case 'claim':
    case 'proof': {
      const r = tx.reward_split;
      return (
        <div className="card kv flush-top">
          <Line k="Relay Chain">{tx.chain ? <ChainList chains={[tx.chain]} /> : '—'}</Line>
          <Line k="Session Height">{tx.session_height ? <Link href={`/morse/block/${tx.session_height}`}>{formatNumber(tx.session_height)}</Link> : '—'}</Line>
          <Line k={tx.type === 'claim' ? 'Relays Claimed' : 'Relays Proven'}>{formatNumber(tx.total_proof ?? 0)}</Line>
          {tx.type === 'claim' && tx.expiration_height ? <Line k="Expiration Height">{formatNumber(tx.expiration_height)}</Line> : null}
          {tx.claim_tx_hash ? (
            <Line k="Claim Tx">
              <Hash value={tx.claim_tx_hash} href={`/morse/tx/${tx.claim_tx_hash}`} full />
            </Line>
          ) : null}
          <Line k="App Public Key">{tx.app_public_key ? <span className="mono">{tx.app_public_key}</span> : '—'}</Line>
          {r ? (
            <>
              <div className="ttl">Reward Split</div>
              <Line k="Node Reward">
                <Pokt upokt={r.total_reward} />
              </Line>
              <Line k="Total Minted">
                <Pokt upokt={r.total} />
              </Line>
              <Line k="To DAO">
                <Pokt upokt={r.dao} />
              </Line>
              <Line k="To Proposer">
                <Pokt upokt={r.proposer} />
              </Line>
              <Line k="To Operator">
                <Pokt upokt={r.operator} />
              </Line>
              <Line k="To Custodian">
                <Pokt upokt={r.custodian} />
                {r.custodian_address ? (
                  <span className="muted">
                    {' '}
                    · <Hash value={r.custodian_address} href={`/morse/account/${r.custodian_address}`} />
                  </span>
                ) : null}
              </Line>
              {r.delegators?.length ? (
                <Line k="To Delegators">
                  <Pokt upokt={r.total_delegator_rewards} />
                  {r.delegators.map((d, i) => (
                    <div key={`${d.address}-${i}`} className="muted">
                      {d.address ? <Hash value={d.address} href={`/morse/account/${d.address}`} /> : '—'} · {d.share ?? 0}% · <Pokt upokt={d.amount} />
                    </div>
                  ))}
                </Line>
              ) : null}
              <Line k="Fees">
                <Pokt upokt={r.total_fees} /> <span className="muted">· returned <Pokt upokt={r.returned_fees} /></span>
              </Line>
              {r.computed_units != null ? <Line k="Computed Units">{formatNumber(Math.round(r.computed_units))}</Line> : null}
              {r.service_multiplier != null ? <Line k="Service Multiplier">{r.service_multiplier.toFixed(4)}</Line> : null}
              {r.chain_rttm != null ? (
                <Line k="Chain RTTM">
                  {formatNumber(r.chain_rttm)} ms{r.chain_rttm_source ? <span className="muted"> · {r.chain_rttm_source}</span> : null}
                </Line>
              ) : null}
            </>
          ) : null}
        </div>
      );
    }
    case 'stake_validator': {
      const s = tx.stake;
      if (!s) return null;
      return (
        <div className="card kv flush-top">
          <Line k="Node">
            <Addr value={s.address} to="node" />
          </Line>
          <Line k="Output Address">
            <Addr value={s.output_address} />
          </Line>
          <Line k="Stake">
            <Pokt upokt={s.tokens} />
          </Line>
          <Line k="Service URL">{s.service_url || '—'}</Line>
          <Line k="Chains">
            <ChainList chains={s.chains} />
          </Line>
          {s.reward_delegators?.length ? (
            <Line k="Reward Delegators">
              {s.reward_delegators.map((d, i) => (
                <div key={`${d.address}-${i}`}>
                  {d.address ? <Hash value={d.address} href={`/morse/account/${d.address}`} /> : '—'} <span className="muted">· {d.share ?? 0}%</span>
                </div>
              ))}
            </Line>
          ) : null}
        </div>
      );
    }
    case 'app_stake': {
      const a = tx.app_stake;
      if (!a) return null;
      return (
        <div className="card kv flush-top">
          <Line k="Application">
            <Addr value={tx.from_address} to="app" />
          </Line>
          <Line k="Stake">
            <Pokt upokt={a.tokens} />
          </Line>
          <Line k="Chains">
            <ChainList chains={a.chains} to="apps" />
          </Line>
          {a.migrated_to ? (
            <Line k="Migrated To">
              <Addr value={a.migrated_to} to="app" />
            </Line>
          ) : null}
        </div>
      );
    }
    case 'change_param':
      return (
        <div className="card kv flush-top">
          <Line k="Parameter">
            <span className="mono">{tx.change_param_key || '—'}</span>
          </Line>
          <Line k="Previous Value">
            <span className="mono">{paramValue(tx.change_param_prev_value)}</span>
          </Line>
          <Line k="New Value">
            <span className="mono">{paramValue(tx.change_param_value)}</span>
          </Line>
        </div>
      );
    case 'upgrade': {
      const u = tx.upgrade;
      if (!u) return null;
      return (
        <div className="card kv flush-top">
          <Line k="Version">{u.version || '—'}</Line>
          <Line k="Upgrade Height">{u.height ? <Link href={`/morse/block/${u.height}`}>{formatNumber(u.height)}</Link> : '—'}</Line>
          <Line k="Features">{u.features?.length ? u.features.map((f) => <div key={f} className="mono">{f}</div>) : '—'}</Line>
        </div>
      );
    }
    case 'dao_tranfer':
      return (
        <div className="card kv flush-top">
          <Line k="Action">{tx.action || '—'}</Line>
          <Line k="Recipient">
            <Addr value={tx.to_address} />
          </Line>
          <Line k="Amount">
            <Pokt upokt={tx.amount} />
          </Line>
        </div>
      );
    default:
      return null;
  }
}

export default async function MorseTxPage({ params }: { params: Promise<{ hash: string }> }) {
  const hash = morseHash((await params).hash);
  if (!hash) notFound();
  const tx = await getMorseTx(hash);
  if (!tx) notFound();

  const details = typeDetails(tx);
  const tabs: TabDef[] = [];
  if (details) tabs.push({ key: 'details', label: 'Details', panel: details });
  tabs.push({ key: 'raw', label: 'Raw', panel: <RawJson title="Transaction" source="morse-api /v1/txs/{hash}" data={tx} /> });

  return (
    <>
      <Breadcrumb items={[{ label: 'Morse', href: '/morse' }, { label: 'Transactions', href: '/morse/txs' }, { label: `${hash.slice(0, 10)}…` }]} />

      <div className="pagetitle">
        <Tic entity="tx" />
        <div>
          <h1>
            Transaction <MorseTxType type={tx.type} />
          </h1>
          <div className="hash">
            <Hash value={tx.hash} full copy />
          </div>
        </div>
      </div>

      <div className="card kv">
        <Line k="Status">
          <MorseTxResult pending={tx.pending} code={tx.result_code} full />
          {!tx.pending && tx.result_code ? <span className="muted"> · code {tx.result_code}</span> : null}
        </Line>
        <Line k="Block">
          {tx.pending || !tx.height ? (
            <span className="dim">Never included — seen in the mempool when Morse halted</span>
          ) : (
            <>
              <Link href={`/morse/block/${tx.height}`}>{formatNumber(tx.height)}</Link>
              {tx.index != null ? <span className="muted"> · index {formatNumber(tx.index)}</span> : null}
            </>
          )}
        </Line>
        <Line k="Timestamp">{absoluteUtc(tx.block_time)}</Line>
        <Line k="From">
          <Addr value={tx.from_address} />
        </Line>
        {tx.to_address ? (
          <Line k="To">
            <Addr value={tx.to_address} />
          </Line>
        ) : null}
        {tx.amount && !isZero(tx.amount) ? (
          <Line k="Amount">
            <Pokt upokt={tx.amount} />
          </Line>
        ) : null}
        <Line k="Fee">
          <Pokt upokt={tx.total_fee} />
        </Line>
        {tx.memo ? (
          <Line k="Memo">
            <span style={{ whiteSpace: 'pre-wrap' }}>{tx.memo}</span>
          </Line>
        ) : null}
      </div>

      <Tabs tabs={tabs} />
    </>
  );
}
