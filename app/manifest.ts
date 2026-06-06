import type { MetadataRoute } from 'next';
import { BRAND_BLUE, BRAND_DARK } from '@/lib/brand';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Pocket Network Explorer',
    short_name: 'Pocket Explorer',
    description: 'Read-only block explorer for Pocket Network (Shannon).',
    start_url: '/',
    display: 'standalone',
    background_color: BRAND_DARK,
    theme_color: BRAND_BLUE,
    icons: [
      { src: '/icon', sizes: '64x64', type: 'image/png' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
  };
}
