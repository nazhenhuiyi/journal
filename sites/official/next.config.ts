import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    ignoreIssue: [
      {
        path: "**/sites/official/next.config.ts",
        title: "Encountered unexpected file in NFT list",
      },
    ],
  },
};

export default nextConfig;
