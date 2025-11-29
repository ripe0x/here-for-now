import { ethers } from "hardhat";
import { TransactionResponse, TransactionReceipt } from "ethers";

/**
 * Wait for a transaction with timeout and polling fallback
 * Works around ethers.js v6 + Alchemy RPC issues where tx.wait() can hang
 */
export async function waitForTx(
  tx: TransactionResponse,
  timeoutMs: number = 120000
): Promise<TransactionReceipt> {
  const hash = tx.hash;

  // Try tx.wait() with timeout first
  const waitPromise = tx.wait(1, timeoutMs);
  const timeoutPromise = new Promise<null>((_, reject) =>
    setTimeout(() => reject(new Error("tx.wait() timeout")), timeoutMs + 1000)
  );

  try {
    const receipt = await Promise.race([waitPromise, timeoutPromise]);
    if (receipt) return receipt;
  } catch {
    // Fall through to polling
  }

  // Fallback: poll getTransactionReceipt
  const pollInterval = 2000;
  const maxAttempts = Math.ceil(timeoutMs / pollInterval);

  for (let i = 0; i < maxAttempts; i++) {
    const receipt = await ethers.provider.getTransactionReceipt(hash);
    if (receipt) return receipt;
    await new Promise((r) => setTimeout(r, pollInterval));
  }

  throw new Error(`Transaction not confirmed after ${timeoutMs}ms: ${hash}`);
}

/**
 * Format a transaction hash for display
 */
export function shortHash(hash: string): string {
  return `${hash.slice(0, 10)}...`;
}
