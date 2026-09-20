import { ImageResponse } from 'next/og';
import { BRAND_BLUE, markDataUri } from '@/lib/brand';

// Apple touch icon (180×180) — the same Pocket mark as the SVG favicon (brand-blue glyph), on a
// white tile so the home-screen icon reads the same as the favicon. iOS applies its own corner
// mask and can't render a transparent/SVG touch icon, so this stays an opaque raster PNG.
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#ffffff',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={markDataUri(BRAND_BLUE)} width={116} height={116} alt="" />
      </div>
    ),
    { ...size },
  );
}
