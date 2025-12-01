"use client";

import { useState, useEffect } from "react";
import { useWriteContract, useWaitForTransactionReceipt, useAccount } from "wagmi";
import { parseEther, Address } from "viem";
import { EXTENSION_ABI } from "@/lib/contracts";

interface EnterLeaveProps {
  extensionAddress: Address;
  hasEntered: boolean;
  isConnected: boolean;
  onSuccess?: () => void;
}

export function EnterLeave({
  extensionAddress,
  hasEntered,
  isConnected,
  onSuccess,
}: EnterLeaveProps) {
  const [amount, setAmount] = useState("0.01");
  const { chain } = useAccount();

  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  // Trigger refetch when transaction succeeds
  useEffect(() => {
    if (isSuccess && onSuccess) {
      onSuccess();
      // Reset after a short delay to allow for another transaction
      const timeout = setTimeout(() => reset(), 3000);
      return () => clearTimeout(timeout);
    }
  }, [isSuccess, onSuccess, reset]);

  const handleEnter = () => {
    if (!chain) return;
    writeContract({
      address: extensionAddress,
      abi: EXTENSION_ABI,
      functionName: "enter",
      value: parseEther(amount),
      chainId: chain.id,
    });
  };

  const handleLeave = () => {
    if (!chain) return;
    writeContract({
      address: extensionAddress,
      abi: EXTENSION_ABI,
      functionName: "leave",
      chainId: chain.id,
    });
  };

  if (!isConnected) {
    return (
      <p className="text-white/50 text-xs text-center">
        Connect wallet to enter or leave
      </p>
    );
  }

  const isLoading = isPending || isConfirming;

  return (
    <div className="space-y-3">
      {/* Amount input (only for enter) */}
      {!hasEntered && (
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            step="0.01"
            min="0.001"
            className="flex-1 bg-transparent border border-white/30 px-3 py-2.5 text-xs focus:border-white outline-none"
            placeholder="0.01"
          />
          <span className="text-white/50 text-xs">ETH</span>
        </div>
      )}

      {/* Action button */}
      <button
        onClick={hasEntered ? handleLeave : handleEnter}
        disabled={isLoading}
        className={`
          w-full py-3 text-xs font-medium transition-colors
          ${isLoading
            ? "bg-white/10 text-white/50 cursor-wait"
            : hasEntered
              ? "bg-transparent border border-white hover:bg-white hover:text-black"
              : "bg-white text-black hover:bg-white/90"
          }
        `}
      >
        {isLoading
          ? isConfirming
            ? "Confirming..."
            : "Pending..."
          : hasEntered
            ? "Leave"
            : "Enter"
        }
      </button>

      {/* Status messages */}
      {isSuccess && (
        <p className="text-green-400 text-xs text-center">
          Transaction confirmed!
        </p>
      )}
      {/* Error message */}
      {error && (
        <p className="text-red-400 text-xs text-center">
          {error.message.includes("User rejected")
            ? "Transaction cancelled"
            : error.message.slice(0, 100)}
        </p>
      )}
    </div>
  );
}
