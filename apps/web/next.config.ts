import type { NextConfig } from 'next';

const config: NextConfig = {
  // Container images build with NEXT_OUTPUT=standalone; local `next start` uses the regular output.
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  poweredByHeader: false,
};

export default config;
