import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  outputFileTracingIncludes: {
    "/api/**": ["./drizzle/*.sql"],
  },
};
export default nextConfig;
