'use client';

// Error boundary for the Morse archive (§11): the archive API busy, rate limited or unreachable never crashes the route.
export default function MorseError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="card" style={{ padding: '32px 22px', textAlign: 'center', marginTop: 24 }}>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Couldn’t load from the Morse archive</div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>{error.message}</div>
      <button className="chip" onClick={reset}>
        Retry
      </button>
    </div>
  );
}
