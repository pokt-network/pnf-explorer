import { NetLink as Link } from '@/components/shell/NetLink';
import { ArchiveSearch } from '@/components/morse/ArchiveSearch';
import { HaltedBadge } from '@/components/morse/HaltedBadge';
import { GlobalSearch } from './GlobalSearch';
import { ThemeToggle } from './ThemeToggle';
import { LiveBadge } from './LiveBadge';
import { NetworkSwitcher } from './NetworkSwitcher';
import { NavMenu, type NavSection } from './NavMenu';

// The Morse archive's menu: its own lists, then the way back to the live chain and the migration that left Morse.
const ARCHIVE_SECTIONS: NavSection[] = [
  {
    heading: 'Morse Chain',
    links: [
      { href: '/morse/blocks', label: 'Blocks' },
      { href: '/morse/txs', label: 'Transactions' },
      { href: '/morse/accounts', label: 'Accounts' },
    ],
  },
  {
    heading: 'Morse Actors',
    links: [
      { href: '/morse/nodes', label: 'Nodes' },
      { href: '/morse/apps', label: 'Applications' },
    ],
  },
  {
    heading: 'Shannon',
    links: [
      { href: '/migration', label: 'Morse Migration' },
      { href: '/', label: 'Mainnet Explorer' },
    ],
  },
];

// Fixed app bar present on every route: brand → mini global search → live badge + network
// switcher + theme toggle. Official PNF logo: white wordmark on dark, black on light (CSS via
// data-theme). `archive` is the Morse archive's bar: its search, a halted badge and its menu.
export function AppBar({ archive = false }: { archive?: boolean }) {
  return (
    <header className="bar">
      <Link className="brand" href={archive ? '/morse' : '/'} aria-label={archive ? 'Morse Archive — home' : 'Pocket Explorer — home'}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="brand-logo brand-logo-dark" src="/pocket-logo-white.svg" alt="Pocket" width={102} height={26} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="brand-logo brand-logo-light" src="/pocket-logo-black.svg" alt="Pocket" width={102} height={26} />
        <span className="sub">{archive ? 'Morse Archive' : 'Explorer'}</span>
      </Link>
      {archive ? <ArchiveSearch variant="mini" /> : <GlobalSearch variant="mini" />}
      <div className="bar-right">
        {archive ? <HaltedBadge /> : <LiveBadge />}
        <NetworkSwitcher archive={archive} />
        <ThemeToggle />
        <NavMenu sections={archive ? ARCHIVE_SECTIONS : undefined} />
      </div>
    </header>
  );
}
