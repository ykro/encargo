import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Do not generate AGENTS.md / CLAUDE.md into the store (repo rule: no CLAUDE.md).
  agentRules: false,
  devIndicators: false,
  // /.well-known/ucp is served by a route handler under /api (dot-folders are not routable).
  async rewrites() {
    return [{ source: "/.well-known/ucp", destination: "/api/well-known-ucp" }];
  },
};

export default nextConfig;
