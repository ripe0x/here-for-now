"use client";

import { useState, useEffect } from "react";
import { useWriteContract, useWaitForTransactionReceipt, useAccount } from "wagmi";
import { parseEther, Address } from "viem";
import { EXTENSION_ABI } from "@/lib/contracts";

interface DepositWithdrawProps {
  extensionAddress: Address;
  hasDeposit: boolean;
  isConnected: boolean;
  onSuccess?: () => void;
}

export function DepositWithdraw({
  extensionAddress,
  hasDeposit,
  isConnected,
  onSuccess,
}: DepositWithdrawProps) {
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

  const handleDeposit = () => {
    if (!chain) return;
    writeContract({
      address: extensionAddress,
      abi: EXTENSION_ABI,
      functionName: "deposit",
      value: parseEther(amount),
      chainId: chain.id,
    });
  };

  const handleWithdraw = () => {
    if (!chain) return;
    writeContract({
      address: extensionAddress,
      abi: EXTENSION_ABI,
      functionName: "withdraw",
      chainId: chain.id,
    });
  };

  if (!isConnected) {
    return (
      <p className="text-white/50 text-sm text-center">
        Connect wallet to deposit or withdraw
      </p>
    );
  }

  const isLoading = isPending || isConfirming;

  return (
    <div className="space-y-4">
      {/* Amount input (only for deposit) */}
      {!hasDeposit && (
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            step="0.01"
            min="0.001"
            className="flex-1 bg-transparent border border-white/30 px-4 py-3 text-sm focus:border-white outline-none"
            placeholder="0.01"
          />
          <span className="text-white/50 text-sm">ETH</span>
        </div>
      )}

      {/* Action button */}
      <button
        onClick={hasDeposit ? handleWithdraw : handleDeposit}
        disabled={isLoading}
        className={`
          w-full py-4 text-sm font-medium transition-colors
          ${isLoading
            ? "bg-white/10 text-white/50 cursor-wait"
            : hasDeposit
              ? "bg-transparent border border-white hover:bg-white hover:text-black"
              : "bg-white text-black hover:bg-white/90"
          }
        `}
      >
        {isLoading
          ? isConfirming
            ? "Confirming..."
            : "Pending..."
          : hasDeposit
            ? "Withdraw"
            : "Deposit"
        }
      </button>

      {/* Status messages */}
      {isSuccess && (
        <p className="text-green-400 text-sm text-center">
          Transaction confirmed!
        </p>
      )}
      {/* Error message */}
      {error && (
        <p className="text-red-400 text-sm text-center">
          {error.message.includes("User rejected")
            ? "Transaction cancelled"
            : error.message.slice(0, 100)}
        </p>
      )}
    </div>
  );
}
