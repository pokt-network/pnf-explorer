'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/** Build a page list with ellipses: 1 … p-1 p p+1 … N (always first/last, neighbors of current). */
function pageList(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | '…')[] = [1];
  const lo = Math.max(2, current - 1);
  const hi = Math.min(total - 1, current + 1);
  if (lo > 2) out.push('…');
  for (let p = lo; p <= hi; p++) out.push(p);
  if (hi < total - 1) out.push('…');
  out.push(total);
  return out;
}

/**
 * URL-driven pager (`?page=`). Page 1 is the clean ISR-cached URL; subsequent pages add the
 * query param and the server re-renders at the new offset (§7). All lists use first/offset.
 */
export function Pager({ page, pageSize, totalCount }: { page: number; pageSize: number; totalCount: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  function go(p: number) {
    if (p < 1 || p > totalPages || p === page) return;
    const params = new URLSearchParams(sp.toString());
    if (p <= 1) params.delete('page');
    else params.set('page', String(p));
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: true });
  }

  return (
    <div className="pager">
      <span>{pageSize} per page</span>
      <div className="pg">
        <button onClick={() => go(page - 1)} disabled={page <= 1} aria-label="Previous page">
          ‹
        </button>
        {pageList(page, totalPages).map((p, i) =>
          p === '…' ? (
            <button key={`e${i}`} disabled>
              …
            </button>
          ) : (
            <button key={p} className={p === page ? 'active' : ''} aria-current={p === page ? 'page' : undefined} onClick={() => go(p)}>
              {p.toLocaleString()}
            </button>
          ),
        )}
        <button onClick={() => go(page + 1)} disabled={page >= totalPages} aria-label="Next page">
          ›
        </button>
      </div>
    </div>
  );
}
