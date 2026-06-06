import type { Metadata } from 'next';
import { Rubik } from 'next/font/google';
import './globals.css';
import { ThemeScript } from '@/components/shell/ThemeScript';
import { Atmosphere } from '@/components/shell/Atmosphere';
import { AppBar } from '@/components/shell/AppBar';
import { Footer } from '@/components/shell/Footer';

const rubik = Rubik({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-rubik',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'Pocket Explorer', template: '%s · Pocket Explorer' },
  description:
    'Read-only block explorer for Pocket Network — look up blocks, transactions, accounts, and validators.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // data-theme is set pre-paint by ThemeScript; suppress the resulting hydration diff.
  return (
    <html lang="en" suppressHydrationWarning className={rubik.variable}>
      <head>
        <ThemeScript />
      </head>
      <body>
        <Atmosphere />
        <div className="shell">
          <AppBar />
          <main>{children}</main>
          <Footer />
        </div>
      </body>
    </html>
  );
}
