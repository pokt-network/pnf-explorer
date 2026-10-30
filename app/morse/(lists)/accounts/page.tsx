import type { Metadata } from 'next';
import { NetLink as Link } from '@/components/shell/NetLink';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Tic } from '@/components/ui/Icons';
import { Hash } from '@/components/ui/Hash';
import { EmptyState } from '@/components/ui/states';
import { CursorPager } from '@/components/morse/CursorPager';
import { getMorseAccounts, getMorseFinalBlock } from '@/lib/morse/api';
import { parseCursor, utcShort } from '@/lib/morse/format';
import { formatNumber, formatPokt, formatPoktExact } from '@/lib/format';
import { absoluteUtc } from '@/lib/time';

export const metadata: Metadata = {
  title: 'Morse Accounts',
  description: 'Accounts and balances of the archived Morse chain of Pocket Network.',
};

const PAGE_SIZE = 25;

export default async function MorseAccountsPage({ searchParams }: { searchParams: Promise<{ cursor?: string }> }) {
  const cursor = parseCursor((await searchParams).cursor);
  const [page, final] = await Promise.all([getMorseAccounts({ limit: PAGE_SIZE, cursor }), getMorseFinalBlock()]);

  return (
    <>
      <Breadcrumb items={[{ label: 'Morse', href: '/morse' }, { label: 'Accounts' }]} />
      <div className="listhead">
        <Tic entity="account" iconSize={20} />
        <h1>Accounts</h1>
        <span className="cnt">
          {final?.total_accounts != null ? `${formatNumber(final.total_accounts)} accounts at the final block · ` : ''}most recently updated first
        </span>
      </div>

      <div className="archive-note">
        <div className="ft">
          Balances are as Morse left them at its halt. To see whether an account’s balance and stakes were claimed on Shannon,
          open it, or search the <Link href="/migration">Morse Migration</Link>.
        </div>
      </div>

      <div className="card">
        {page.items.length === 0 ? (
          <EmptyState>No accounts found.</EmptyState>
        ) : (
          <div className="tbl-scroll">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Address</th>
                  <th className="num">Balance (POKT)</th>
                  <th className="num">Last Height</th>
                  <th>Last Change (UTC)</th>
                </tr>
              </thead>
              <tbody>
                {page.items.map((a) => (
                  <tr key={a.address}>
                    <td>
                      <Hash value={a.address} href={`/morse/account/${a.address}`} head={10} tail={6} />
                    </td>
                    <td className="num mono" title={a.amount ? `${formatPoktExact(a.amount)} POKT` : undefined}>
                      {a.amount ? formatPokt(a.amount) : '—'}
                    </td>
                    <td className="num">{a.height ? <Link href={`/morse/block/${a.height}`}>{formatNumber(a.height)}</Link> : '—'}</td>
                    <td className="dim" title={absoluteUtc(a.block_time)}>
                      {utcShort(a.block_time)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <CursorPager cursor={cursor} nextCursor={page.next_cursor} pageSize={PAGE_SIZE} />
      </div>
    </>
  );
}
