'use client';

// Root error boundary (§11) — covers home, /params, and any route without its own boundary.
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="card" style={{ padding: '32px 22px', textAlign: 'center', marginTop: 24 }}>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Something went wrong</div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>{error.message}</div>
      <button className="chip" onClick={reset}>
        Retry
      </button>
    </div>
  );
}
