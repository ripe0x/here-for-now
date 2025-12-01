"use client";

import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  rainbowWallet,
  walletConnectWallet,
  metaMaskWallet,
  coinbaseWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { createConfig, http } from "wagmi";
import { mainnet } from "wagmi/chains";

const MAINNET_RPC = process.env.NEXT_PUBLIC_MAINNET_RPC_URL || "https://eth.llamarpc.com";

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
  chains: [mainnet],
  transports: {
    [mainnet.id]: http(MAINNET_RPC),
  },
  ssr: true,
});
