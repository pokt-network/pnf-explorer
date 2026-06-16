import { notFound } from 'next/navigation';
import { AppBar } from '@/components/shell/AppBar';
import { Footer } from '@/components/shell/Footer';
import { NetworkProvider } from '@/lib/network-context';
import { NETWORK_IDS, isNetwork } from '@/lib/networks';

// Pre-render both network shells; inner pages resolve their own dynamic params.
export function generateStaticParams() {
  return NETWORK_IDS.map((network) => ({ network }));
}

export default async function NetworkLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ network: string }>;
}) {
  const { network } = await params;
  // proxy.ts guarantees a valid segment, but guard defensively against direct/odd requests.
  if (!isNetwork(network)) notFound();

  return (
    <NetworkProvider network={network}>
      <div className="shell">
        <AppBar />
        <main>{children}</main>
        <Footer />
      </div>
    </NetworkProvider>
  );
}
