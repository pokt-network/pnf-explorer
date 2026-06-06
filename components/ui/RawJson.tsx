// Raw JSON panel with a provenance header (§8.6.1). Plain pretty-print in the `.raw` style.
export function RawJson({ title, source, data }: { title: string; source?: React.ReactNode; data: unknown }) {
  return (
    <div className="card flush-top">
      <div className="rawhead">
        <span className="lbl">{title}</span>
        {source ? <span className="src">{source}</span> : null}
      </div>
      <pre className="raw">{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
}
