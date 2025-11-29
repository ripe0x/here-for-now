import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { waitForTx, shortHash } from "./lib/tx-utils";

/**
 * Distribute Sepolia ETH to test accounts
 *
 * Uses SEPOLIA_PRIVATE_KEY to send ETH to accounts in test-accounts.json
 * Total budget: 0.1 ETH across 20 accounts = 0.005 ETH each
 *
 * Prerequisites:
 * - test-accounts.json exists (run generate-test-accounts.ts first)
 * - SEPOLIA_PRIVATE_KEY set in .env with sufficient Sepolia ETH
 * - SEPOLIA_RPC_URL set in .env
 *
 * Run with: npx hardhat run scripts/distribute-sepolia-eth.ts --network sepolia
 */

const ACCOUNTS_FILE = path.join(__dirname, "..", "test-accounts.json");
const TOTAL_BUDGET = ethers.parseEther("0.1");
const NUM_ACCOUNTS = 20;
const ETH_PER_ACCOUNT = TOTAL_BUDGET / BigInt(NUM_ACCOUNTS); // 0.005 ETH
const MIN_BALANCE_THRESHOLD = ethers.parseEther("0.003"); // Skip if already has this much

interface TestAccount {
  index: number;
  address: string;
  privateKey: string;
}

interface TestAccountsFile {
  mnemonic: string;
  accounts: TestAccount[];
}

async function main() {
  console.log("Sepolia ETH Distribution\n");
  console.log("=".repeat(50));

  // Load test accounts
  if (!fs.existsSync(ACCOUNTS_FILE)) {
    console.error("ERROR: test-accounts.json not found!");
    console.error("Run 'npm run generate:accounts' first.");
    process.exit(1);
  }

  const accountsData: TestAccountsFile = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, "utf-8"));
  const accounts = accountsData.accounts;
  console.log(`Loaded ${accounts.length} test accounts`);

  // Get the funder wallet from SEPOLIA_PRIVATE_KEY
  const sepoliaPrivateKey = process.env.SEPOLIA_PRIVATE_KEY;
  if (!sepoliaPrivateKey) {
    console.error("ERROR: SEPOLIA_PRIVATE_KEY not set in .env");
    process.exit(1);
  }

  const funder = new ethers.Wallet(sepoliaPrivateKey, ethers.provider);
  console.log(`\nFunder address: ${funder.address}`);

  const funderBalance = await ethers.provider.getBalance(funder.address);
  console.log(`Funder balance: ${ethers.formatEther(funderBalance)} ETH`);

  if (funderBalance < TOTAL_BUDGET) {
    console.error(`\nERROR: Insufficient balance!`);
    console.error(`Need at least ${ethers.formatEther(TOTAL_BUDGET)} ETH`);
    console.error(`Have ${ethers.formatEther(funderBalance)} ETH`);
    process.exit(1);
  }

  console.log(`\nDistribution plan:`);
  console.log(`  Total budget: ${ethers.formatEther(TOTAL_BUDGET)} ETH`);
  console.log(`  Per account:  ${ethers.formatEther(ETH_PER_ACCOUNT)} ETH`);
  console.log(`  Skip if >=:   ${ethers.formatEther(MIN_BALANCE_THRESHOLD)} ETH`);

  // Distribute ETH
  console.log("\n" + "=".repeat(50));
  console.log("Distributing...\n");

  let distributed = 0;
  let skipped = 0;
  let totalSent = BigInt(0);

  for (const account of accounts) {
    const balance = await ethers.provider.getBalance(account.address);

    if (balance >= MIN_BALANCE_THRESHOLD) {
      console.log(`[${account.index}] ${account.address}`);
      console.log(`    Skipped - already has ${ethers.formatEther(balance)} ETH`);
      skipped++;
      continue;
    }

    console.log(`[${account.index}] ${account.address}`);
    console.log(`    Current: ${ethers.formatEther(balance)} ETH`);

    try {
      const tx = await funder.sendTransaction({
        to: account.address,
        value: ETH_PER_ACCOUNT,
      });
      console.log(`    Sending... (${shortHash(tx.hash)})`);
      await waitForTx(tx, 60000);
      console.log(`    ✓ Sent ${ethers.formatEther(ETH_PER_ACCOUNT)} ETH`);
      distributed++;
      totalSent += ETH_PER_ACCOUNT;
    } catch (error: any) {
      console.log(`    ✗ ERROR: ${error.message}`);
    }
  }

  // Summary
  console.log("\n" + "=".repeat(50));
  console.log("Distribution Complete!");
  console.log("=".repeat(50));
  console.log(`\nAccounts funded: ${distributed}`);
  console.log(`Accounts skipped: ${skipped}`);
  console.log(`Total ETH sent: ${ethers.formatEther(totalSent)}`);

  const newFunderBalance = await ethers.provider.getBalance(funder.address);
  console.log(`\nFunder remaining: ${ethers.formatEther(newFunderBalance)} ETH`);

  console.log("\nNext steps:");
  console.log("  1. Run: npm run deploy:sepolia");
  console.log("     (Deploy contracts to Sepolia)");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
