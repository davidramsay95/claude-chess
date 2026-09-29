import type { NextConfig } from "next";

const basePath = process.env.NEXT_BASE_PATH ?? "";

// Static export so the game can be served from Cloudflare static assets under /play/<slug>.
const nextConfig: NextConfig = {
  output: "export",
  basePath,
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
};

export default nextConfig;
