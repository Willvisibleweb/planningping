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

export default nextConfig;
