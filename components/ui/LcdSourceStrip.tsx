import { InfoIcon } from './Icons';

/**
 * Gold provenance strip attached to the top of an always-LCD data panel (§8.6.1): tx
 * Messages/Events and validator Delegators. Shares the card's top corners (no own radius);
 * render it as the first child of a `.card.flush-top`.
 */
export function LcdSourceStrip({ children }: { children?: React.ReactNode }) {
  return (
    <div className="fallback">
      <InfoIcon size={17} stroke="var(--gold)" />
      <div className="ft">
        <b>Sourced from the Cosmos LCD</b>
        <p>
          {children ??
            'This content is not served by the GraphQL indexer — it is read live from the chain via the Sauron LCD endpoint.'}
        </p>
      </div>
    </div>
  );
}
