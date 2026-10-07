import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Do not generate AGENTS.md / CLAUDE.md (repo rule: no CLAUDE.md).
  agentRules: false,
  devIndicators: false,
  // The projector view moved to /presentador; old links keep working.
  async redirects() {
    return [{ source: "/presenter", destination: "/presentador", permanent: true }];
  },
};

export default nextConfig;
