import { ethers } from "hardhat";

/**
 * Clear stuck pending transactions by replacing them with self-sends at higher gas
 *
 * Run with: npx hardhat run scripts/clear-pending-txs.ts --network sepolia
 */

async function main() {
  const [signer] = await ethers.getSigners();
  console.log("Address:", signer.address);

  const confirmedNonce = await ethers.provider.getTransactionCount(signer.address, "latest");
  const pendingNonce = await ethers.provider.getTransactionCount(signer.address, "pending");
  const pendingCount = pendingNonce - confirmedNonce;

  console.log("Confirmed nonce:", confirmedNonce);
  console.log("Pending nonce:", pendingNonce);
  console.log("Stuck transactions:", pendingCount);

  if (pendingCount === 0) {
    console.log("\nNo stuck transactions. All clear!");
    return;
  }

  console.log(`\nClearing ${pendingCount} stuck transactions...`);

  // Get current gas prices and multiply by 20x to ensure replacement
  const feeData = await ethers.provider.getFeeData();
  const maxFeePerGas = feeData.maxFeePerGas! * 20n;
  const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas! * 20n;

  console.log("Using gas prices:");
  console.log("  maxFeePerGas:", ethers.formatUnits(maxFeePerGas, "gwei"), "gwei");
  console.log("  maxPriorityFeePerGas:", ethers.formatUnits(maxPriorityFeePerGas, "gwei"), "gwei");

  for (let nonce = confirmedNonce; nonce < pendingNonce; nonce++) {
    console.log(`\nReplacing nonce ${nonce}...`);
    try {
      const tx = await signer.sendTransaction({
        to: signer.address,
        value: 0,
        nonce: nonce,
        maxFeePerGas,
        maxPriorityFeePerGas,
      });
      console.log(`  Tx sent: ${tx.hash}`);

      // Wait with timeout
      const receipt = await Promise.race([
        tx.wait(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 30000))
      ]);
      console.log(`  Confirmed!`);
    } catch (error: any) {
      if (error.message === "timeout") {
        console.log(`  Timeout waiting - tx may still confirm`);
      } else if (error.message?.includes("nonce has already been used")) {
        console.log(`  Already confirmed`);
      } else {
        console.log(`  Error: ${error.message?.slice(0, 60)}`);
      }
    }
  }

  // Check final state
  const finalConfirmed = await ethers.provider.getTransactionCount(signer.address, "latest");
  const finalPending = await ethers.provider.getTransactionCount(signer.address, "pending");
  console.log("\n--- Final State ---");
  console.log("Confirmed nonce:", finalConfirmed);
  console.log("Pending nonce:", finalPending);
  console.log("Remaining stuck:", finalPending - finalConfirmed);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
