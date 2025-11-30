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
} from "@/lib/contracts";

import { sepolia } from "wagmi/chains";

// Default to Sepolia for viewing artwork without wallet
const DEFAULT_CHAIN_ID = sepolia.id;

export default function Home() {
  const { address, isConnected, chain } = useAccount();
  // Use connected chain if available, otherwise default to Sepolia
  const chainId = chain?.id ?? DEFAULT_CHAIN_ID;
  const contracts = CONTRACTS[chainId];

  // Fetch token URI from Manifold core
  const { data: tokenURI, error: tokenURIError, isLoading: tokenURILoading, refetch: refetchTokenURI } = useReadContract({
    address: contracts?.manifoldCore,
    abi: MANIFOLD_ABI,
    functionName: "tokenURI",
    args: [TOKEN_ID],
    chainId,
    query: { enabled: !!contracts },
  });

  // Fetch user balance from extension
  const { data: userBalance, refetch: refetchUserBalance } = useReadContract({
    address: contracts?.extension,
    abi: EXTENSION_ABI,
    functionName: "balanceOf",
    args: [address!],
    chainId,
    query: { enabled: !!contracts && !!address },
  });

  // Fetch stats
  const { data: activeParticipants, refetch: refetchParticipants } = useReadContract({
    address: contracts?.extension,
    abi: EXTENSION_ABI,
    functionName: "getActiveParticipants",
    chainId,
    query: { enabled: !!contracts },
  });

  const { data: totalBalance, refetch: refetchTotalBalance } = useReadContract({
    address: contracts?.extension,
    abi: EXTENSION_ABI,
    functionName: "getTotalBalance",
    chainId,
    query: { enabled: !!contracts },
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
              {chain?.name || "Sepolia"}
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
        {contracts && contracts.extension !== "0x0000000000000000000000000000000000000000" ? (
          <EnterLeave
            extensionAddress={contracts.extension}
            hasEntered={!!hasEntered}
            isConnected={isConnected}
            onSuccess={handleTransactionSuccess}
          />
        ) : isConnected && chain?.id === 1 ? (
          <p className="text-white/50 text-sm text-center">
            Not yet deployed on Mainnet.<br />
            Switch to Sepolia to interact.
          </p>
        ) : (
          <p className="text-white/50 text-sm text-center">
            Connect to Sepolia to enter or leave
          </p>
        )}
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
