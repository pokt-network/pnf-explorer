import type { Metadata } from 'next';
import { Rubik } from 'next/font/google';
import './globals.css';
import { ThemeScript } from '@/components/shell/ThemeScript';
import { Atmosphere } from '@/components/shell/Atmosphere';

const rubik = Rubik({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-rubik',
  display: 'swap',
});

const SITE_URL = 'https://explorer.pocket.network';
const DESCRIPTION =
  'Read-only block explorer for Pocket Network — look up blocks, transactions, accounts, and validators.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'Pocket Explorer', template: '%s · Pocket Explorer' },
  description: DESCRIPTION,
  applicationName: 'Pocket Explorer',
  // icons + opengraph-image are auto-detected from app/{icon,apple-icon,opengraph-image}.tsx.
  openGraph: {
    type: 'website',
    siteName: 'Pocket Explorer',
    title: 'Pocket Network Explorer',
    description: DESCRIPTION,
    url: SITE_URL,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Pocket Network Explorer',
    description: DESCRIPTION,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // data-theme is set pre-paint by ThemeScript; suppress the resulting hydration diff.
  // The app shell (AppBar/Footer) lives in `app/[network]/layout.tsx` so it can read the active
  // network; everything network-agnostic (html, fonts, theme, ambient atmosphere) stays here.
  return (
    <html lang="en" suppressHydrationWarning className={rubik.variable}>
      <head>
        <ThemeScript />
      </head>
      <body>
        <Atmosphere />
        {children}
      </body>
    </html>
  );
}
