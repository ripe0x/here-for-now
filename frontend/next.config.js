const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: process.env.WALLET_CONNECT_PROJECT_ID,
    NEXT_PUBLIC_MAINNET_RPC_URL: process.env.MAINNET_RPC_URL,
    NEXT_PUBLIC_SEPOLIA_RPC_URL: process.env.SEPOLIA_RPC_URL,
  },
  webpack: (config) => {
    config.resolve.fallback = { fs: false, net: false, tls: false };
    config.externals.push("pino-pretty", "encoding");
    return config;
  },
};

module.exports = nextConfig;
