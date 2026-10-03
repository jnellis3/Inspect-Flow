import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  serverExternalPackages: ["openai"],
  outputFileTracingIncludes: {
    "/api/**": ["./drizzle/*.sql", "./lib/inspection/*.py"],
  },
};
export default nextConfig;
