"use client";

import { useAccount, useReadContract } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { formatEther } from "viem";
import { Artwork } from "@/components/Artwork";
import { EnterLeave } from "@/components/EnterLeave";
import {
  CONTRACTS,
  TOKEN_ID,
  MANIFOLD_ABI,
  EXTENSION_ABI,
  ETHERSCAN_URL,
} from "@/lib/contracts";

export default function Home() {
  const { address, isConnected } = useAccount();

  // Fetch token URI from Manifold core
  const { data: tokenURI, error: tokenURIError, isLoading: tokenURILoading, refetch: refetchTokenURI } = useReadContract({
    address: CONTRACTS.manifoldCore,
    abi: MANIFOLD_ABI,
    functionName: "tokenURI",
    args: [TOKEN_ID],
  });

  // Fetch user balance from extension
  const { data: userBalance, refetch: refetchUserBalance } = useReadContract({
    address: CONTRACTS.extension,
    abi: EXTENSION_ABI,
    functionName: "balanceOf",
    args: [address!],
    query: { enabled: !!address },
  });

  // Fetch stats
  const { data: activeParticipants, refetch: refetchParticipants } = useReadContract({
    address: CONTRACTS.extension,
    abi: EXTENSION_ABI,
    functionName: "activeParticipants",
  });

  const { data: totalBalance, refetch: refetchTotalBalance } = useReadContract({
    address: CONTRACTS.extension,
    abi: EXTENSION_ABI,
    functionName: "totalBalance",
  });

  // Refetch all data after successful transaction
  const handleTransactionSuccess = () => {
    refetchTokenURI();
    refetchUserBalance();
    refetchParticipants();
    refetchTotalBalance();
  };

  // Parse metadata from tokenURI
  const metadata = tokenURI ? parseTokenURI(tokenURI) : null;
  const hasEntered = userBalance && userBalance > 0n;

  return (
    <main className="min-h-screen flex flex-col lg:flex-row">
      {/* Artwork */}
      <div className="w-full lg:w-2/3 flex items-center justify-center p-4 md:p-8 lg:border-r border-b lg:border-b-0 border-white/10">
        <Artwork
          imageData={metadata?.image}
          isLoading={tokenURILoading}
          error={tokenURIError?.message}
        />
      </div>

      {/* Details & Actions */}
      <div className="w-full lg:w-1/3 flex flex-col p-4 md:p-8 pb-8 md:pb-8">
        {/* Header */}
        <div className="flex justify-between items-start mb-6 md:mb-12">
          <div>
            <h1 className="text-xl md:text-2xl font-medium">{metadata?.name || "Loading..."}</h1>
            <p className="text-white/50 text-sm mt-1">
              by{" "}
              <a
                href="https://ripe.wtf"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
              >
                ripe
              </a>
            </p>
          </div>
          <ConnectButton.Custom>
            {({ account, chain, openConnectModal, openAccountModal, mounted }) => {
              const connected = mounted && account && chain;
              return (
                <button
                  onClick={connected ? openAccountModal : openConnectModal}
                  className="px-4 py-2 border border-white/30 hover:border-white text-sm transition-colors"
                >
                  {connected ? `${account.displayName}` : "Connect"}
                </button>
              );
            }}
          </ConnectButton.Custom>
        </div>

        {/* Description */}
        {metadata?.description && (
          <p className="text-white/70 text-sm leading-relaxed mb-6 md:mb-12">
            {metadata.description}
          </p>
        )}

        {/* Stats */}
        <div className="space-y-4 mb-6 md:mb-12">
          <div className="flex justify-between text-sm">
            <span className="text-white/50">Present</span>
            <span>{activeParticipants?.toString() || "0"}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-white/50">Total ETH Held</span>
            <span>{totalBalance ? formatEther(totalBalance) : "0"} ETH</span>
          </div>
          {isConnected && (
            <div className="flex justify-between text-sm pt-4 border-t border-white/10">
              <span className="text-white/50">Your Balance</span>
              <span>{userBalance ? formatEther(userBalance) : "0"} ETH</span>
            </div>
          )}
        </div>

        {/* Spacer - only on desktop to push actions to bottom */}
        <div className="hidden lg:block flex-1" />

        {/* Actions */}
        <EnterLeave
          extensionAddress={CONTRACTS.extension}
          hasEntered={!!hasEntered}
          isConnected={isConnected}
          onSuccess={handleTransactionSuccess}
        />

        {/* Contract Links */}
        <div className="mt-6 md:mt-8 pt-6 border-t border-white/10 flex flex-wrap gap-x-4 gap-y-2 text-xs text-white/40">
          <a
            href={`${ETHERSCAN_URL}/nft/${CONTRACTS.manifoldCore}/${TOKEN_ID}`}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white/70 transition-colors"
          >
            Token
          </a>
          <a
            href={`${ETHERSCAN_URL}/address/${CONTRACTS.extension}`}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white/70 transition-colors"
          >
            Extension
          </a>
          <a
            href={`${ETHERSCAN_URL}/address/${CONTRACTS.renderer}`}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white/70 transition-colors"
          >
            Renderer
          </a>
        </div>
      </div>
    </main>
  );
}

function parseTokenURI(uri: string): { name?: string; description?: string; image?: string } | null {
  try {
    if (uri.startsWith("data:application/json;base64,")) {
      const base64 = uri.slice(29);
      // Handle both browser and edge runtime
      const json = typeof window !== "undefined"
        ? atob(base64)
        : Buffer.from(base64, "base64").toString("utf-8");
      return JSON.parse(json);
    }
    return null;
  } catch (e) {
    console.error("Failed to parse tokenURI:", e);
    return null;
  }
}
