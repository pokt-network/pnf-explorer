import { AppBar } from '@/components/shell/AppBar';
import { Footer } from '@/components/shell/Footer';

// The Morse archive: the halted Morse chain's frozen data, read from the Morse archive API (lib/morse). Its own route
// tree beside app/[network]/ — proxy.ts lets /morse through untouched. No NetworkProvider: in-app links here carry
// their full /morse path, and the context's default (mainnet, prefix-less) leaves them as they are while links to the
// live chain (/migration, /account/pokt1…) land on mainnet.
export default function MorseLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell">
      <AppBar archive />
      <main>{children}</main>
      <Footer archive />
    </div>
  );
}
