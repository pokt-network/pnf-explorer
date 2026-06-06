import Link from 'next/link';
import { truncate } from '@/lib/format';
import { CopyButton } from './CopyButton';

/**
 * Monospace hash/address: truncated display (full value preserved for copy), optional link,
 * optional copy button. Card-level hover only — no underline-on-hover inside cards (§8.5).
 */
export function Hash({
  value,
  href,
  head = 6,
  tail = 4,
  copy = false,
  full = false,
  className = '',
}: {
  value: string;
  href?: string;
  head?: number;
  tail?: number;
  copy?: boolean;
  full?: boolean;
  className?: string;
}) {
  const text = full ? value : truncate(value, head, tail);
  const cls = `mono ${className}`.trim();
  return (
    <>
      {href ? (
        <Link href={href} className={cls}>
          {text}
        </Link>
      ) : (
        <span className={cls}>{text}</span>
      )}
      {copy ? (
        <>
          {' '}
          <CopyButton value={value} />
        </>
      ) : null}
    </>
  );
}
