import { ArchiveSearch } from '@/components/morse/ArchiveSearch';

// Branded 404 for the archive (§11), with its search to recover.
export default function MorseNotFound() {
  return (
    <section className="hero" style={{ paddingTop: 40 }}>
      <h1>
        Not found in the <span className="accent">Morse archive</span>
      </h1>
      <p>That height, hash, or address didn’t resolve to a Morse block, transaction, node, app, or account.</p>
      <ArchiveSearch variant="hero" />
    </section>
  );
}
