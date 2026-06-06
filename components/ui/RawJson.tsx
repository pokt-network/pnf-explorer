import { JsonView } from './JsonView';
import { CopyButton } from './CopyButton';

// Raw JSON panel (§8.6.1): provenance header + interactive JSON viewer (syntax highlighting,
// collapsible nodes default-open, per-node copy) + a copy-the-whole-blob button in the header.
export function RawJson({ title, source, data }: { title: string; source?: React.ReactNode; data: unknown }) {
  return (
    <div className="card flush-top">
      <div className="rawhead">
        <span className="lbl">{title}</span>
        <span className="rawhead-right">
          {source ? <span className="src">{source}</span> : null}
          <CopyButton value={JSON.stringify(data, null, 2)} label="Copy JSON" />
        </span>
      </div>
      <JsonView data={data} />
    </div>
  );
}
