'use client';

import { useRouter } from 'next/navigation';

/** Inline error card with a retry affordance (§11) — never crash the route. */
export function ErrorCard({ title = 'Something went wrong', message }: { title?: string; message?: string }) {
  const router = useRouter();
  return (
    <div className="card" style={{ padding: '28px 22px', textAlign: 'center' }}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>{title}</div>
      {message ? <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>{message}</div> : null}
      <button className="chip" onClick={() => router.refresh()}>
        Retry
      </button>
    </div>
  );
}
