import { ImageResponse } from 'next/og';
import { BRAND_BLUE, BRAND_DARK, markDataUri } from '@/lib/brand';

// Social share card (1200×630) — PNF mark tile + wordmark on the dark app background.
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Pocket Network Explorer — Shannon block explorer';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 80,
          background: `radial-gradient(1200px 600px at 80% -10%, rgba(2,90,242,0.22), ${BRAND_DARK} 60%)`,
          color: '#fff',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          <div
            style={{
              width: 108,
              height: 108,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: BRAND_BLUE,
              borderRadius: 26,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={markDataUri('#ffffff')} width={70} height={70} alt="" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 30, fontWeight: 600, color: '#9aa4ad', letterSpacing: 1 }}>
              POCKET NETWORK
            </div>
            <div style={{ fontSize: 30, fontWeight: 500, color: BRAND_BLUE }}>Shannon</div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ fontSize: 92, fontWeight: 700, lineHeight: 1 }}>Block Explorer</div>
          <div style={{ fontSize: 38, color: '#c4ccd2', fontWeight: 400 }}>
            Look up blocks, transactions, accounts, and validators.
          </div>
        </div>

        <div style={{ display: 'flex', fontSize: 34, fontWeight: 600, color: BRAND_BLUE }}>
          explorer.pocket.network
        </div>
      </div>
    ),
    { ...size },
  );
}
