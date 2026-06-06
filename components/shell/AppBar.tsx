import Link from 'next/link';
import { GlobalSearch } from './GlobalSearch';
import { ThemeToggle } from './ThemeToggle';
import { LiveBadge } from './LiveBadge';
import { NavMenu } from './NavMenu';

// Fixed app bar present on every route: brand → mini global search → live badge + theme toggle.
// Official PNF logo: white wordmark on dark, black on light (toggled by CSS via data-theme).
export function AppBar() {
  return (
    <header className="bar">
      <Link className="brand" href="/" aria-label="Pocket Explorer — home">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="brand-logo brand-logo-dark" src="/pocket-logo-white.svg" alt="Pocket" width={102} height={26} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="brand-logo brand-logo-light" src="/pocket-logo-black.svg" alt="Pocket" width={102} height={26} />
        <span className="sub">Explorer</span>
      </Link>
      <GlobalSearch variant="mini" />
      <div className="bar-right">
        <LiveBadge />
        <ThemeToggle />
        <NavMenu />
      </div>
    </header>
  );
}
