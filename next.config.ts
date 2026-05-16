import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      // GTFS-ZIPs werden 50–200 MB gross — lassen wir grosszügig zu.
      bodySizeLimit: "500mb",
    },
  },
};

export default nextConfig;
