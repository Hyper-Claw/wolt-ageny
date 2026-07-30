/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // Token images are user-supplied URLs; allow any host and fall back gracefully.
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  webpack: (config) => {
    // We only use the `injected` connector. The wagmi/connectors barrel also
    // pulls in Coinbase's baseAccount connector, whose optional x402 deps are
    // not installed. Stub them so the barrel resolves.
    config.resolve.alias = {
      ...config.resolve.alias,
      "@base-org/account": false,
      "@coinbase/cdp-sdk": false,
      // Optional deps of the metaMask / walletConnect connectors (unused here).
      "pino-pretty": false,
      "@react-native-async-storage/async-storage": false,
    };
    return config;
  },
};

export default nextConfig;
