import { NetLink as Link } from '@/components/shell/NetLink';

// Source attribution + nav. Analytics/Discord are external (the analytics app is the
// separate surface per §0/§1); Params is in-app. The Morse archive credits its own source.
export function Footer({ archive = false }: { archive?: boolean }) {
  return (
    <footer>
      <div className="lf">
        {archive ? 'Morse Archive' : 'Pocket Network Explorer'} · data from{' '}
        <span style={{ color: 'var(--text-secondary)' }}>{archive ? 'morse-api.pocket.network' : 'data.pocket.network'}</span>
      </div>
      <div className="rt">
        {archive ? <Link href="/migration">Migration</Link> : <Link href="/params">Params</Link>}
        <a href="https://docs.pocket.network" target="_blank" rel="noopener noreferrer">
          Docs
        </a>
        <a href="https://analytics.pocket.network/" target="_blank" rel="noopener noreferrer">
          Analytics ↗
        </a>
        <a href="https://discord.gg/pocket-network" target="_blank" rel="noopener noreferrer">
          Discord ↗
        </a>
      </div>
    </footer>
  );
}
