import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Do not generate AGENTS.md / CLAUDE.md (repo rule: no CLAUDE.md).
  agentRules: false,
  devIndicators: false,
};

export default nextConfig;
