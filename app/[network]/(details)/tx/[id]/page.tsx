import type { Metadata } from 'next';
import { NetLink as Link } from '@/components/shell/NetLink';
import { notFound } from 'next/navigation';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Tic } from '@/components/ui/Icons';
import { Hash } from '@/components/ui/Hash';
import { CopyButton } from '@/components/ui/CopyButton';
import { Tabs } from '@/components/ui/Tabs';
import { RawJson } from '@/components/ui/RawJson';
import { LcdSourceStrip } from '@/components/ui/LcdSourceStrip';
import { TxResultPill } from '@/components/ui/StatusPill';
import { EmptyState } from '@/components/ui/states';
import { IndexerBanner } from '@/components/ui/IndexerBanner';
import { getUseRpcData } from '@/lib/metadata';
import { getTransaction, getTxFromLcd } from '@/lib/data/transactions';
import type { LcdTxMessage, LcdEvent } from '@/lib/data/transactions';
import type { NetworkId } from '@/lib/networks';
import { formatNumber, formatPokt, formatUpokt, truncate } from '@/lib/format';
import { relativeTime, absoluteUtc } from '@/lib/time';
import { sumUpokt, shortMsgType } from '@/lib/tx';

const HEX64 = /^[0-9a-fA-F]{64}$/;
const POKT_ADDR = /^pokt1[0-9a-z]{20,90}$/;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `Tx ${truncate(id, 6, 4)}` };
}

// ---- Messages tab (ALWAYS-LCD) ----
/** Flatten a message object into dotted key → string-value pairs, dropping @type. */
function flattenMessage(msg: LcdTxMessage): { key: string; value: string }[] {
  const out: { key: string; value: string }[] = [];
  const walk = (obj: unknown, prefix: string) => {
    if (obj == null) {
      out.push({ key: prefix, value: '—' });
      return;
    }
    if (Array.isArray(obj)) {
      if (obj.length === 0) {
        out.push({ key: prefix, value: '[]' });
      } else {
        out.push({ key: prefix, value: JSON.stringify(obj) });
      }
      return;
    }
    if (typeof obj === 'object') {
      for (const [k, v] of Object.entries(obj)) {
        walk(v, prefix ? `${prefix}.${k}` : k);
      }
      return;
    }
    out.push({ key: prefix, value: String(obj) });
  };
  for (const [k, v] of Object.entries(msg)) {
    if (k === '@type') continue;
    walk(v, k);
  }
  return out;
}

// Values longer than this are collapsed to a head…tail preview + copy button + char count,
// so multi-KB blobs (e.g. MsgSubmitProof.proof) don't flood the panel. 64-char hashes/ids
// (session_id, block hash) stay under the threshold and render in full.
const LONG_VALUE = 96;

function MessageValue({ value }: { value: string }) {
  if (POKT_ADDR.test(value)) {
    return <Link href={`/account/${value}`}>{truncate(value, 10, 6)}</Link>;
  }
  if (value.length > LONG_VALUE) {
    return (
      <span className="longval">
        {truncate(value, 24, 10)}
        <CopyButton value={value} />
        <span className="dim len">{formatNumber(value.length)} chars</span>
      </span>
    );
  }
  return <>{value}</>;
}

function MessagesPanel({ messages }: { messages: LcdTxMessage[] }) {
  return (
    <div className="card flush-top">
      <LcdSourceStrip>
        Messages, Events &amp; Raw are not served by the GraphQL indexer — they are read live from the chain via the Sauron LCD endpoint.
      </LcdSourceStrip>
      {messages.length === 0 ? (
        <EmptyState>This transaction has no messages.</EmptyState>
      ) : (
        messages.map((m, i) => {
          const full = m['@type'] ?? '';
          const rows = flattenMessage(m);
          return (
            <div className="msg" key={i}>
              <div className="mh">
                <span className="idx">{i}</span>
                <span className="type">{shortMsgType(full)}</span>
                <span className="full">{full}</span>
              </div>
              <div className="mb">
                {rows.map((r, j) => (
                  <div key={j} style={{ display: 'contents' }}>
                    <div className="mk">{r.key}</div>
                    <div className="mv">
                      <MessageValue value={r.value} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

// ---- Events tab (ALWAYS-LCD) ----
function EventsPanel({ events }: { events: LcdEvent[] }) {
  return (
    <div className="card flush-top">
      <LcdSourceStrip>
        Messages, Events &amp; Raw are not served by the GraphQL indexer — they are read live from the chain via the Sauron LCD endpoint.
      </LcdSourceStrip>
      {events.length === 0 ? (
        <EmptyState>This transaction emitted no events.</EmptyState>
      ) : (
        <div className="tbl-scroll">
          <table className="tbl">
            <thead>
              <tr>
                <th>#</th>
                <th>Type</th>
                <th>Attributes</th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev, i) => (
                <tr key={i}>
                  <td className="mono">{i}</td>
                  <td>
                    <span className="pill-soft">{ev.type}</span>
                  </td>
                  <td className="mono evt-attrs">
                    {(ev.attributes ?? []).map((a) => `${a.key}=${a.value}`).join(' · ') || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function IndexingState() {
  return (
    <div className="card flush-top">
      <LcdSourceStrip>
        Messages, Events &amp; Raw are read live from the Sauron LCD endpoint.
      </LcdSourceStrip>
      <EmptyState>This transaction isn’t available from the LCD yet — it may still be indexing. Try again shortly.</EmptyState>
    </div>
  );
}

export default async function TxDetailPage({ params }: { params: Promise<{ network: NetworkId; id: string }> }) {
  const { network, id } = await params;
  const fallback = await getUseRpcData(network);
  const target = fallback.metadata?.targetHeight ?? null;

  const hashCanonical = HEX64.test(id) ? id.toUpperCase() : id;

  // Indexer header + always-LCD body, in parallel.
  const [tx, lcd] = await Promise.all([getTransaction(network, id, target), getTxFromLcd(network, hashCanonical)]);

  // Nothing to render: indexer has no tx and the LCD couldn't supply a header (404 or down).
  // (Both LCD and RPC tx-indexing are currently disabled on this Sauron node, so in practice
  // the indexer `transaction(id)` is the source of truth for existence.)
  if (!tx && lcd.state !== 'ok') notFound();

  // Derive the header. Prefer indexer; fall back to LCD values when the indexer lags.
  const code = tx ? tx.code : lcd.state === 'ok' ? lcd.data.tx_response.code : 0;
  const ok = Number(code) === 0;
  const height = tx?.block?.height ?? (lcd.state === 'ok' ? lcd.data.tx_response.height : null);
  const timestamp = tx?.block?.timestamp ?? null;
  const signer = tx?.signerAddress ?? null;
  const gasUsed = tx?.gasUsed ?? (lcd.state === 'ok' ? lcd.data.tx_response.gas_used : null);
  const gasWanted = tx?.gasWanted ?? (lcd.state === 'ok' ? lcd.data.tx_response.gas_wanted : null);
  const memo = tx?.memo ?? (lcd.state === 'ok' ? lcd.data.tx.body.memo ?? '' : '');
  const isMultisig = tx?.isMultisig ?? false;
  const codespace = tx?.codespace ?? (lcd.state === 'ok' ? lcd.data.tx_response.codespace ?? '' : '');

  const feeUpokt = tx ? sumUpokt(tx.fees) : BigInt(0);

  // Message summary for the header (from LCD when available, else indexer amountSentByDenom is N/A).
  const lcdMessages = lcd.state === 'ok' ? lcd.data.tx.body.messages : [];
  const lcdEvents = lcd.state === 'ok' ? lcd.data.tx_response.events ?? [] : [];
  const msgCount = lcdMessages.length;
  const msgTypes = Array.from(new Set(lcdMessages.map((m) => shortMsgType(m['@type'])))).join(', ');

  const messagesPanel = lcd.state === 'ok' ? <MessagesPanel messages={lcdMessages} /> : <IndexingState />;
  const eventsPanel = lcd.state === 'ok' ? <EventsPanel events={lcdEvents} /> : <IndexingState />;
  const rawPanel =
    lcd.state === 'ok' ? (
      <RawJson
        title="Raw Transaction"
        source={
          <>
            source: <b>Cosmos LCD</b> /cosmos/tx/v1beta1/txs/{'{hash}'}
          </>
        }
        data={lcd.data}
      />
    ) : (
      <IndexingState />
    );

  return (
    <>
      <Breadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Transactions', href: '/txs' },
          { label: truncate(hashCanonical, 6, 4) },
        ]}
      />

      {fallback.useRpc ? <IndexerBanner lag={fallback.lag} /> : null}

      <div className="pagetitle">
        <Tic entity="tx" />
        <div>
          <h1>Transaction</h1>
          <div className="hash">
            <Hash value={hashCanonical} full copy />
          </div>
        </div>
        <span className={`statuspill ${ok ? 's-ok' : 's-fail'}`} style={{ marginLeft: 'auto' }}>
          {ok ? '✓ Success' : 'Failed'}
        </span>
      </div>

      <div className="card kv">
        <div className="line">
          <div className="k">Tx Hash</div>
          <div className="v">
            <span className="mono">{hashCanonical}</span> <CopyButton value={hashCanonical} />
          </div>
        </div>
        <div className="line">
          <div className="k">Status</div>
          <div className="v">
            <TxResultPill code={code} full /> <span className="dim">· code {String(code)}</span>
            {!ok && codespace ? <span className="dim"> · {codespace}</span> : null}
          </div>
        </div>
        <div className="line">
          <div className="k">Block</div>
          <div className="v">
            {height != null ? <Link href={`/block/${height}`}>{formatNumber(height)}</Link> : <span className="muted">—</span>}
            {timestamp ? (
              <span className="dim">
                {' '}
                · {relativeTime(timestamp)} ({absoluteUtc(timestamp)})
              </span>
            ) : null}
          </div>
        </div>
        <div className="line">
          <div className="k">Signer</div>
          <div className="v">
            {signer ? <Hash value={signer} href={`/account/${signer}`} full /> : <span className="muted">—</span>}
          </div>
        </div>
        <div className="line">
          <div className="k">Messages</div>
          <div className="v">
            {lcd.state === 'ok' ? (
              <>
                {formatNumber(msgCount)} {msgCount === 1 ? 'message' : 'messages'}
                {msgTypes ? <span className="dim"> · {msgTypes}</span> : null}
              </>
            ) : (
              <span className="muted">Available once the LCD indexes this tx</span>
            )}
          </div>
        </div>
        <div className="line">
          <div className="k">Fee</div>
          <div className="v">
            {formatPokt(feeUpokt, 6)} POKT <span className="dim">({formatUpokt(feeUpokt)} upokt)</span>
          </div>
        </div>
        <div className="line">
          <div className="k">Gas (used / wanted)</div>
          <div className="v">
            {gasUsed != null ? formatNumber(gasUsed) : '—'} / {gasWanted != null ? formatNumber(gasWanted) : '—'}
          </div>
        </div>
        <div className="line">
          <div className="k">Memo</div>
          <div className="v">{memo ? <span className="mono">{memo}</span> : <span className="muted">—</span>}</div>
        </div>
        <div className="line">
          <div className="k">Multisig</div>
          <div className="v">
            <span className="muted">{isMultisig ? 'Yes' : 'No'}</span>
          </div>
        </div>
      </div>

      <Tabs
        tabs={[
          { key: 'messages', label: 'Messages', badge: lcd.state === 'ok' ? msgCount : undefined, panel: messagesPanel },
          { key: 'events', label: 'Events', badge: lcd.state === 'ok' ? lcdEvents.length : undefined, panel: eventsPanel },
          { key: 'raw', label: 'Raw', panel: rawPanel },
        ]}
      />
    </>
  );
}
