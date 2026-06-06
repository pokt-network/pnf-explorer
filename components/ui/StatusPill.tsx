// Status pills (§8.5). Tx result from `code` (0 = success). Stake status from the indexer
// enum Staked/Unstaking/Unstaked — same enum for ALL actors incl. validators (DATA-CONTRACT §1).

export function TxResultPill({ code, full = false }: { code: number | string | null | undefined; full?: boolean }) {
  const ok = Number(code) === 0;
  return <span className={`statuspill ${ok ? 's-ok' : 's-fail'}`}>{ok ? (full ? '✓ Success' : 'OK') : full ? 'Failed' : 'Fail'}</span>;
}

const STAKE: Record<string, { cls: string; label: string }> = {
  Staked: { cls: 's-ok', label: 'Staked' },
  Unstaking: { cls: 's-unstk', label: 'Unstaking' },
  Unstaked: { cls: 's-fail', label: 'Unstaked' },
};

export function StakeStatusPill({ status, sm = false }: { status: string | null | undefined; sm?: boolean }) {
  const meta = status ? STAKE[status] : undefined;
  if (!meta) return <span className="muted">{status ?? 'Not staked'}</span>;
  return <span className={`statuspill${sm ? ' sm' : ''} ${meta.cls}`}>{meta.label}</span>;
}
