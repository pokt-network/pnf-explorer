import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // /_next/image is off: the app has no images that need resizing, and with no
  // `images` config the optimizer fetches any of the app's own routes by URL.
  images: { unoptimized: true },
  /* config options here */
};

export default nextConfig;
