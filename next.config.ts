import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // output: "standalone" removed — incompatible with Vercel's build runner
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
