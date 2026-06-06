// Summary stat card above list tables (§8.5): uppercase label with a colored dot, large
// tabular value with optional unit suffix. Use 3–4 per list from the *Summary queries.

export function SummaryCard({
  label,
  dot,
  value,
  unit,
}: {
  label: string;
  dot: string;
  value: React.ReactNode;
  unit?: string;
}) {
  return (
    <div className="card sum">
      <div className="lbl">
        <span className="dot" style={{ background: dot }} />
        {label}
      </div>
      <div className="val">
        {value}
        {unit ? <span className="u">{unit}</span> : null}
      </div>
    </div>
  );
}

export const DOT = {
  blue: 'var(--blue)',
  gold: 'var(--gold)',
  mint: 'var(--mint)',
  coral: 'var(--coral)',
  lavender: 'var(--lavender)',
} as const;
