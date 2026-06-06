// Ambient background: starfield + glow + two counter-rotating orbital rings.
// Fixed, z-index:0, pointer-events:none — content sits in `.shell` above it (§8.4).
// On [data-theme=light] the starfield fades (--star-opacity:0) and glow drops; the
// dark dot-grid is a body:before. Animations disabled under prefers-reduced-motion.
export function Atmosphere() {
  return (
    <>
      <div className="atmosphere">
        <div className="stars" />
      </div>
      <div className="glow" />
      <div className="ring r1" />
      <div className="ring r2" />
    </>
  );
}
