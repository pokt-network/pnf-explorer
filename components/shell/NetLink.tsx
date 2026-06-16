'use client';

import Link from 'next/link';
import type { ComponentProps } from 'react';
import { useNetwork } from '@/lib/network-context';
import { netHref } from '@/lib/networks';

type LinkProps = ComponentProps<typeof Link>;

/**
 * Drop-in replacement for `next/link` that prefixes string hrefs with the active network
 * (`/beta/...` on betanet, unchanged on mainnet). Use for every IN-APP link. External/absolute
 * URLs (http...) and hrefs already carrying a network prefix are passed through untouched.
 *
 * It's a Client Component so it can read the network from context, but it renders inside Server
 * Components fine — the computed href is present in the SSR HTML (context is set during SSR).
 */
export function NetLink({ href, ...rest }: LinkProps) {
  const network = useNetwork();
  const next = typeof href === 'string' && href.startsWith('/') ? netHref(network, href) : href;
  return <Link href={next} {...rest} />;
}
