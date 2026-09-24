import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 's0.geograph.org.uk',
        pathname: '/geophotos/04/09/88/4098820_0abc3aa7.jpg',
        search: '',
      },
      {
        protocol: 'https',
        hostname: 'www.stonewater.org',
        pathname: '/media/y1mnbou2/berry-croft-east-sussex.jpg',
        search: '',
      },
      {
        protocol: 'https',
        hostname: 'images.skyscrapercenter.com',
        pathname: '/building/CentralSaintGiles_Con-TO_%28CC__BY%29Damo1977220121-080142.jpg',
        search: '',
      },
      {
        protocol: 'https',
        hostname: 'assets.publishing.service.gov.uk',
        pathname: '/media/5bbb54b2ed915d238f9cc2ee/s960_a66.jpg',
        search: '',
      },
    ],
    qualities: [75],
  },
};

// Source maps are only uploaded when SENTRY_AUTH_TOKEN is present, so a build
// without Sentry configured behaves exactly as it did before — which is what
// lets this be committed ahead of the account existing. Without uploaded maps
// a stack trace points at minified code, so set the token when you set the DSN.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Build logs are noisy enough; Sentry only speaks up when something failed.
  silent: true,
  telemetry: false,
});
