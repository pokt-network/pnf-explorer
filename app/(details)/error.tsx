'use client';

// Route-level error boundary for all detail pages (§11).
export default function DetailError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="card" style={{ padding: '32px 22px', textAlign: 'center', marginTop: 24 }}>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Couldn’t load this page</div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>{error.message}</div>
      <button className="chip" onClick={reset}>
        Retry
      </button>
    </div>
  );
}
