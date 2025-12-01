"use client";

import { useState } from "react";
import { useAccount, useReadContract, useDisconnect } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { formatEther } from "viem";
import { Artwork } from "@/components/Artwork";
import { EnterLeave } from "@/components/EnterLeave";
import { TxHistory } from "@/components/TxHistory";
import { AuctionCountdown } from "@/components/AuctionCountdown";
import {
  CONTRACTS,
  TOKEN_ID,
  MANIFOLD_ABI,
  EXTENSION_ABI,
  ETHERSCAN_URL,
} from "@/lib/contracts";

export default function Home() {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const [txRefreshTrigger, setTxRefreshTrigger] = useState(0);

  // Fetch token URI from Manifold core
  const {
    data: tokenURI,
    error: tokenURIError,
    isLoading: tokenURILoading,
    refetch: refetchTokenURI,
  } = useReadContract({
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
  const { data: activeParticipants, refetch: refetchParticipants } =
    useReadContract({
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
    setTxRefreshTrigger((prev) => prev + 1);
  };

  // Parse metadata from tokenURI
  const metadata = tokenURI ? parseTokenURI(tokenURI) : null;
  const hasEntered = userBalance && userBalance > 0n;

  return (
    <main className="min-h-screen flex flex-col lg:flex-row">
      {/* Artwork */}
      <div className="w-full lg:w-2/3 flex items-center justify-center p-3 md:p-6 lg:border-r border-b lg:border-b-0 border-white/10 lg:sticky lg:top-0 lg:h-screen">
        <Artwork
          imageData={metadata?.image}
          isLoading={tokenURILoading}
          error={tokenURIError?.message}
        />
      </div>

      {/* Details & Actions */}
      <div className="w-full lg:w-1/3 flex flex-col p-3 md:p-10">
        {/* Header */}
        <div className="flex justify-between items-start mb-2 md:mb-2">
          <div>
            <h1 className="text-lg md:text-xl font-medium">
              {metadata?.name || "Loading..."}
            </h1>
            <p className="text-white/50 text-[12px] mt-1">
              by{" "}
              <a
                href="https://ripe.wtf"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline text-neutral-100"
              >
                ripe
              </a>{" "}
              on Ethereum
            </p>
          </div>
          <ConnectButton.Custom>
            {({ account, chain, openConnectModal, mounted }) => {
              const connected = mounted && account && chain;
              return (
                <button
                  onClick={connected ? () => disconnect() : openConnectModal}
                  className="px-3 py-1.5 border border-white/30 hover:border-white text-[12px] transition-colors"
                >
                  {connected ? `${account.displayName}` : "Connect"}
                </button>
              );
            }}
          </ConnectButton.Custom>
        </div>

        <div className="pb-3 md:pb-2 mt-2">
          <AuctionCountdown />
        </div>

        <hr className="border-white/10 mb-5 md:mb-5" />

        {/* Description */}
        {metadata?.description && (
          <p className="text-white/70 text-xs leading-relaxed mb-3 whitespace-pre-line">
            {metadata.description}
          </p>
        )}
        <a
          href="https://x.com/ripe0x/status/1995532515403333762"
          target="_blank"
          rel="noopener noreferrer"
          className="text-white text-xs underline mb-5 md:mb-5 inline-block"
        >
          Read the explainer
        </a>

        {/* Stats */}
        <div className="space-y-2 mb-5 md:mb-10">
          <div className="flex justify-between text-[12px]">
            <span className="text-white/50">Currently here</span>
            <span>{activeParticipants?.toString() || "0"}</span>
          </div>
          <div className="flex justify-between text-[12px]">
            <span className="text-white/50">Total ETH Held</span>
            <span>{totalBalance ? formatEther(totalBalance) : "0"} ETH</span>
          </div>
          {hasEntered && (
            <div className="flex justify-between text-[12px] pt-3 border-t border-white/10">
              <span className="text-white/50">Your Balance</span>
              <span>{formatEther(userBalance!)} ETH</span>
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

        {/* Activity */}
        <div className="mt-5 md:mt-6 pt-4 border-t border-white/10">
          <h2 className="text-[12px] text-white/50 mb-3">Activity</h2>
          <TxHistory refreshTrigger={txRefreshTrigger} />
        </div>

        {/* Contract Links */}
        <div className="mt-5 md:mt-6 pt-4 border-t border-white/10 flex flex-wrap gap-x-3 gap-y-1.5 text-[10px] text-white/40">
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

function parseTokenURI(
  uri: string
): { name?: string; description?: string; image?: string } | null {
  try {
    if (uri.startsWith("data:application/json;base64,")) {
      const base64 = uri.slice(29);
      // Handle both browser and edge runtime
      const json =
        typeof window !== "undefined"
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
