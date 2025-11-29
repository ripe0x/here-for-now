"use client";

import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  rainbowWallet,
  walletConnectWallet,
  metaMaskWallet,
  coinbaseWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { createConfig, http } from "wagmi";
import { mainnet, sepolia } from "wagmi/chains";

// Fallback to public RPCs if env vars not set
const MAINNET_RPC = process.env.NEXT_PUBLIC_MAINNET_RPC_URL || "https://eth.llamarpc.com";
const SEPOLIA_RPC = process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL || "https://rpc.sepolia.org";

const connectors = connectorsForWallets(
  [
    {
      groupName: "Popular",
      wallets: [metaMaskWallet, rainbowWallet, coinbaseWallet, walletConnectWallet],
    },
  ],
  {
    appName: "Here, For Now",
    projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "demo",
  }
);

export const config = createConfig({
  connectors,
  chains: [mainnet, sepolia],
  transports: {
    [mainnet.id]: http(MAINNET_RPC),
    [sepolia.id]: http(SEPOLIA_RPC),
  },
  ssr: true,
});
