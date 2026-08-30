import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // output: "standalone" removed — incompatible with Vercel's build runner
  reactStrictMode: true,
};

export default nextConfig;
