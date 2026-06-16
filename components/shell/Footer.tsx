import { NetLink as Link } from '@/components/shell/NetLink';

// Source attribution + nav. Analytics/Discord are external (the analytics app is the
// separate surface per §0/§1); Params is in-app.
export function Footer() {
  return (
    <footer>
      <div className="lf">
        Pocket Network Explorer · data from{' '}
        <span style={{ color: 'var(--text-secondary)' }}>data.pocket.network</span>
      </div>
      <div className="rt">
        <Link href="/params">Params</Link>
        <a href="https://docs.pocket.network" target="_blank" rel="noopener noreferrer">
          Docs
        </a>
        <a href="https://poktscan.pocket.network/" target="_blank" rel="noopener noreferrer">
          Analytics ↗
        </a>
        <a href="https://discord.gg/pocket-network" target="_blank" rel="noopener noreferrer">
          Discord ↗
        </a>
      </div>
    </footer>
  );
}
