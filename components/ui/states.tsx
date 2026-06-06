// Quiet, layout-matching states (§11). Loading = skeletons (not spinners); empty = centered
// message; error/not-found live in their own files (ErrorCard is client, NotFound is a page).

export function Skeleton({ width = '100%', height = 13, style }: { width?: number | string; height?: number | string; style?: React.CSSProperties }) {
  return <span className="skel" style={{ width, height, ...style }} aria-hidden="true" />;
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>;
}

/** N skeleton table rows matching a column count, for list/tab loading. */
export function TableSkeleton({ rows = 8, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <table className="tbl">
      <tbody>
        {Array.from({ length: rows }).map((_, r) => (
          <tr key={r}>
            {Array.from({ length: cols }).map((_, c) => (
              <td key={c}>
                <Skeleton width={c === 0 ? '60%' : `${40 + ((r + c) % 4) * 12}%`} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Skeleton KV lines for detail-page headers. */
export function KvSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="card kv">
      {Array.from({ length: rows }).map((_, i) => (
        <div className="line" key={i}>
          <div className="k">
            <Skeleton width={110} />
          </div>
          <div className="v">
            <Skeleton width={`${50 + (i % 3) * 15}%`} />
          </div>
        </div>
      ))}
    </div>
  );
}
