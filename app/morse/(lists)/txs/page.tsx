import type { Metadata } from 'next';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Tic } from '@/components/ui/Icons';
import { CursorPager } from '@/components/morse/CursorPager';
import { MorseTxTable } from '@/components/morse/MorseTxTable';
import { ParamChips } from '@/components/morse/ParamChips';
import { getMorseTxs } from '@/lib/morse/api';
import { morseTxTypeLabel, parseCursor } from '@/lib/morse/format';
import { MORSE_TX_TYPES, type MorseTxType } from '@/lib/morse/types';

export const metadata: Metadata = {
  title: 'Morse Transactions',
  description: 'Transactions of the archived Morse chain of Pocket Network, newest first, filterable by type.',
};

const PAGE_SIZE = 25;

const isTxType = (v: string | undefined): v is MorseTxType => (MORSE_TX_TYPES as readonly string[]).includes(v ?? '');

export default async function MorseTxsPage({ searchParams }: { searchParams: Promise<{ cursor?: string; type?: string }> }) {
  const sp = await searchParams;
  const cursor = parseCursor(sp.cursor);
  const type = isTxType(sp.type) ? sp.type : undefined;
  const page = await getMorseTxs({ limit: PAGE_SIZE, cursor, type });

  return (
    <>
      <Breadcrumb items={[{ label: 'Morse', href: '/morse' }, { label: 'Transactions' }]} />
      <div className="listhead">
        <Tic entity="tx" iconSize={20} />
        <h1>Transactions</h1>
        <span className="cnt">{type ? `${morseTxTypeLabel(type)} · ` : ''}newest first · pending (never included) txs first</span>
      </div>

      <ParamChips
        groups={[
          {
            param: 'type',
            active: type ?? '',
            options: [{ value: '', label: 'All' }, ...MORSE_TX_TYPES.map((t) => ({ value: t, label: morseTxTypeLabel(t) }))],
          },
        ]}
      />

      <div className="card">
        <MorseTxTable txs={page.items} columns={['type', 'block', 'time', 'from', 'to', 'amount', 'fee', 'result']} empty="No transactions match this filter." />
        <CursorPager cursor={cursor} nextCursor={page.next_cursor} pageSize={PAGE_SIZE} />
      </div>
    </>
  );
}
