import { NetLink as Link } from '@/components/shell/NetLink';
import { MORSE_FINAL_HEIGHT } from '@/lib/morse/api';
import { formatNumber } from '@/lib/format';

// The archive's stand-in for the live badge: Morse has no head to poll, so this states where the chain halted, in the
// same muted grey as its switcher dot, and links to that final block.
export function HaltedBadge() {
  const title = 'Morse halted at this height; Pocket Network now runs on Shannon';
  return (
    <Link className="livebadge" href={`/morse/block/${MORSE_FINAL_HEIGHT}`} title={title} aria-label={`${title}, #${formatNumber(MORSE_FINAL_HEIGHT)}`}>
      <span className="dot" style={{ background: 'var(--text-secondary)' }} />
      <span className="lbl">Halted</span>
      <span className="h">#{formatNumber(MORSE_FINAL_HEIGHT)}</span>
    </Link>
  );
}
