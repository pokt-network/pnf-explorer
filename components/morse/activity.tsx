import { NetLink as Link } from '@/components/shell/NetLink';
import { Hash } from '@/components/ui/Hash';
import { EmptyState } from '@/components/ui/states';
import { RawJson } from '@/components/ui/RawJson';
import { selectTab } from '@/components/ui/tabSelect';
import type { TabDef } from '@/components/ui/Tabs';
import { CursorPager } from '@/components/morse/CursorPager';
import { MorseTransferTable, MorseTxTable } from '@/components/morse/MorseTxTable';
import { getMorseBlocks, getMorseTransfers, getMorseTxs, getMorseSearch } from '@/lib/morse/api';
import { formatTook, parseCursor, utcShort } from '@/lib/morse/format';
import { formatNumber } from '@/lib/format';
import { absoluteUtc } from '@/lib/time';
import type { MorseEntity } from '@/lib/morse/types';

// The tabs an address's detail page shares (account, node, app): its transactions, its transfers, the blocks a node
// produced, and the record as served. Each list pages by its own cursor param, so paging one tab never moves another.
// Transfers and Produced Blocks are deferred (rendered only once their tab is opened): each would be one more archive
// request on every view, and few visitors open them.

const LIMIT = 25;

export type ActivityParams = { tab?: string; txs?: string; transfers?: string; blocks?: string };

export async function activityTabs(
  address: string,
  sp: ActivityParams,
  opts: { producer?: boolean; raw: { title: string; source: string; data: unknown }; extra?: TabDef[] },
): Promise<TabDef[]> {
  const keys = [
    { key: 'txs', label: 'Transactions' },
    { key: 'transfers', label: 'Transfers' },
    ...(opts.producer ? [{ key: 'blocks', label: 'Produced Blocks' }] : []),
    ...(opts.extra ?? []),
    { key: 'raw', label: 'Raw' },
  ];
  const active = selectTab(keys, sp.tab);

  const txCursor = parseCursor(sp.txs);
  const txs = await getMorseTxs({ limit: LIMIT, address, cursor: txCursor });
  const tabs: TabDef[] = [
    {
      key: 'txs',
      label: 'Transactions',
      panel: (
        <div className="card flush-top">
          <MorseTxTable txs={txs.items} columns={['type', 'block', 'time', 'from', 'to', 'amount', 'result']} empty="No transactions for this address." />
          {txCursor || txs.next_cursor ? <CursorPager cursor={txCursor} nextCursor={txs.next_cursor} pageSize={LIMIT} param="txs" /> : null}
        </div>
      ),
    },
    { key: 'transfers', label: 'Transfers', panel: active === 'transfers' ? await transfersPanel(address, parseCursor(sp.transfers)) : null },
  ];
  if (opts.producer) {
    tabs.push({ key: 'blocks', label: 'Produced Blocks', panel: active === 'blocks' ? await blocksPanel(address, parseCursor(sp.blocks)) : null });
  }
  tabs.push(...(opts.extra ?? []));
  tabs.push({ key: 'raw', label: 'Raw', panel: <RawJson title={opts.raw.title} source={opts.raw.source} data={opts.raw.data} /> });
  return tabs;
}

async function transfersPanel(address: string, cursor: string | undefined) {
  const page = await getMorseTransfers({ limit: LIMIT, address, cursor });
  return (
    <div className="card flush-top">
      <MorseTransferTable transfers={page.items} empty="No transfers for this address." />
      {cursor || page.next_cursor ? <CursorPager cursor={cursor} nextCursor={page.next_cursor} pageSize={LIMIT} param="transfers" /> : null}
    </div>
  );
}

async function blocksPanel(producer: string, cursor: string | undefined) {
  const page = await getMorseBlocks({ limit: LIMIT, producer, cursor });
  if (page.items.length === 0) {
    return (
      <div className="card flush-top">
        <EmptyState>This node produced no blocks.</EmptyState>
      </div>
    );
  }
  return (
    <div className="card flush-top">
      <div className="tbl-scroll">
        <table className="tbl">
          <thead>
            <tr>
              <th>Height</th>
              <th>Time (UTC)</th>
              <th className="num">Txns</th>
              <th className="num">Took</th>
            </tr>
          </thead>
          <tbody>
            {page.items.map((b) => (
              <tr key={b.height}>
                <td>
                  <Link href={`/morse/block/${b.height}`}>{formatNumber(b.height)}</Link>
                </td>
                <td className="dim" title={absoluteUtc(b.time)}>
                  {utcShort(b.time)}
                </td>
                <td className="num">{formatNumber(b.total_txs ?? 0)}</td>
                <td className="num">{formatTook(b.took)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {cursor || page.next_cursor ? <CursorPager cursor={cursor} nextCursor={page.next_cursor} pageSize={LIMIT} param="blocks" /> : null}
    </div>
  );
}

const ROLE_LABEL: Record<'account' | 'node' | 'app', string> = { account: 'Account', node: 'Node', app: 'Application' };

/**
 * The other records the same address has in the archive (an address can be a node and an app, and every node is an
 * account), as links. The archive's search names them; its account hit is left out when a node or app shares the
 * address, so the account link is always offered from a node or app page.
 */
export async function OtherRoles({ address, self }: { address: string; self: 'account' | 'node' | 'app' }) {
  let entities: MorseEntity[] = [];
  try {
    entities = (await getMorseSearch(address)).filter((h) => h.address === address).map((h) => h.entity);
  } catch {
    return null;
  }
  const roles = (['node', 'app', 'account'] as const).filter((r) => r !== self && (entities.includes(r) || (r === 'account' && self !== 'account')));
  if (roles.length === 0) return null;
  return (
    <div className="line">
      <div className="k">Also</div>
      <div className="v pillrow">
        {roles.map((r) => (
          <Link key={r} className="pill-soft" href={`/morse/${r}/${address}`}>
            {ROLE_LABEL[r]} →
          </Link>
        ))}
      </div>
    </div>
  );
}

/** A full address line with a copy button and a link, for the kv cards. */
export function AddressLine({ k, value, to = 'account' }: { k: string; value?: string; to?: 'account' | 'node' | 'app' }) {
  return (
    <div className="line">
      <div className="k">{k}</div>
      <div className="v">{value ? <Hash value={value} href={`/morse/${to}/${value}`} full copy /> : <span className="dim">—</span>}</div>
    </div>
  );
}
