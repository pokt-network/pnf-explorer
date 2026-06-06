import { GlobalSearch } from '@/components/shell/GlobalSearch';

// Branded 404 (§11): not a Next default error. Offers search to recover.
export default function NotFound() {
  return (
    <section className="hero" style={{ paddingTop: 40 }}>
      <h1>
        Not found on the <span className="accent">network</span>
      </h1>
      <p>
        That height, hash, or address didn’t resolve to a block, transaction, account, or validator. Check the value and
        try again.
      </p>
      <GlobalSearch variant="hero" />
    </section>
  );
}
