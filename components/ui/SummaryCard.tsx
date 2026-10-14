// Summary stat card above list tables (§8.5): uppercase label with a colored dot, large
// tabular value with optional unit suffix. Use 3–4 per list from the *Summary queries. Optional `sub` line under the
// value, `children` below it (e.g. a meter) and a `title` tooltip.

export function SummaryCard({
  label,
  dot,
  value,
  unit,
  sub,
  title,
  children,
  className,
}: {
  label: string;
  dot: string;
  value: React.ReactNode;
  unit?: string;
  sub?: React.ReactNode;
  title?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`card sum${className ? ` ${className}` : ''}`} title={title}>
      <div className="lbl">
        <span className="dot" style={{ background: dot }} />
        {label}
      </div>
      <div className="val">
        {value}
        {unit ? <span className="u">{unit}</span> : null}
      </div>
      {sub ? <div className="sub">{sub}</div> : null}
      {children}
    </div>
  );
}

export const DOT = {
  blue: 'var(--blue)',
  blueSoft: 'var(--blue-soft)',
  gold: 'var(--gold)',
  mint: 'var(--mint)',
  coral: 'var(--coral)',
  lavender: 'var(--lavender)',
} as const;
