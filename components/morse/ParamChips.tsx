'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export interface ChipOption {
  /** The URL value; '' is the unfiltered default (the param is removed). */
  value: string;
  label: string;
}

/**
 * One row of filter chips over a URL param, for the Morse archive's lists. Selecting one sets `?<param>=` and drops the
 * list's cursor (a cursor is only valid for its own filters), so the server re-renders the first page of the new
 * listing — no client-side data fetching, like TxFilterChips. Several rows share one `.chips` bar via `groups`.
 */
export function ParamChips({ groups }: { groups: { param: string; active: string; options: ChipOption[] }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  function select(param: string, value: string, active: string) {
    if (value === active) return;
    const params = new URLSearchParams(sp.toString());
    params.delete('cursor');
    if (value) params.set(param, value);
    else params.delete(param);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <div className="chips">
      {groups.map((g, i) => (
        <span key={g.param} style={{ display: 'contents' }}>
          {i > 0 ? <span className="sep" aria-hidden="true" /> : null}
          {g.options.map((o) => (
            <button
              key={o.value || 'all'}
              className={`chip${o.value === g.active ? ' active' : ''}`}
              onClick={() => select(g.param, o.value, g.active)}
              aria-pressed={o.value === g.active}
            >
              {o.label}
            </button>
          ))}
        </span>
      ))}
    </div>
  );
}
