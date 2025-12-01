import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { waitForTx, shortHash } from "./lib/tx-utils";

/**
 * Enter the artwork by sending ETH from test accounts to the extension
 *
 * Usage:
 *   npx hardhat run scripts/sepolia-enter.ts --network sepolia
 *   COUNT=10 npx hardhat run scripts/sepolia-enter.ts --network sepolia
 *   COUNT=10 AMOUNT=0.002 npx hardhat run scripts/sepolia-enter.ts --network sepolia
 *
 * Environment variables:
 *   COUNT    Number of accounts to enter from (default: 5)
 *   AMOUNT   ETH amount per entry (default: 0.001)
 */

const ACCOUNTS_FILE = path.join(__dirname, "..", "test-accounts.json");
const DEPLOYMENT_FILE = path.join(__dirname, "..", `deployment-${network.name}.json`);

// Extension ABI (minimal)
const EXTENSION_ABI = [
  "function enter() external payable",
  "function balanceOf(address) view returns (uint256)",
  "function activeParticipants() view returns (uint256)",
  "function totalBalance() view returns (uint256)",
];

interface TestAccount {
  index: number;
  address: string;
  privateKey: string;
}

interface TestAccountsFile {
  accounts: TestAccount[];
}

interface DeploymentInfo {
  extension: string;
  tokenId: string;
}

function parseArgs(): { count: number; amount: string } {
  const count = process.env.COUNT ? parseInt(process.env.COUNT, 10) : 5;
  const amount = process.env.AMOUNT || "0.001";
  return { count, amount };
}

async function main() {
  const { count, amount } = parseArgs();
  const enterAmount = ethers.parseEther(amount);

  console.log("Sepolia Enter Script\n");
  console.log("=".repeat(50));
  console.log(`Entering from ${count} accounts`);
  console.log(`Amount per entry: ${amount} ETH`);

  // Load test accounts
  if (!fs.existsSync(ACCOUNTS_FILE)) {
    console.error("\nERROR: test-accounts.json not found!");
    console.error("Run 'npm run generate:accounts' first.");
    process.exit(1);
  }

  // Load deployment info
  if (!fs.existsSync(DEPLOYMENT_FILE)) {
    console.error("\nERROR: sepolia-deployment.json not found!");
    console.error("Run 'npm run deploy:sepolia' first.");
    process.exit(1);
  }

  const accountsData: TestAccountsFile = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, "utf-8"));
  const deployment: DeploymentInfo = JSON.parse(fs.readFileSync(DEPLOYMENT_FILE, "utf-8"));

  console.log(`\nExtension: ${deployment.extension}`);
  console.log(`Available accounts: ${accountsData.accounts.length}`);

  if (count > accountsData.accounts.length) {
    console.error(`\nERROR: Requested ${count} accounts but only ${accountsData.accounts.length} available`);
    process.exit(1);
  }

  // Get initial state
  const extension = new ethers.Contract(deployment.extension, EXTENSION_ABI, ethers.provider);
  const initialParticipants = await extension.activeParticipants();
  const initialBalance = await extension.totalBalance();

  console.log(`\nInitial state:`);
  console.log(`  Active participants: ${initialParticipants}`);
  console.log(`  Total balance: ${ethers.formatEther(initialBalance)} ETH`);

  // Enter from accounts
  console.log("\n" + "=".repeat(50));
  console.log("Entering...\n");

  let successful = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < count; i++) {
    const account = accountsData.accounts[i];
    const wallet = new ethers.Wallet(account.privateKey, ethers.provider);
    const extensionWithSigner = new ethers.Contract(deployment.extension, EXTENSION_ABI, wallet);

    console.log(`[${account.index}] ${account.address}`);

    // Check if already entered
    const existingBalance = await extension.balanceOf(account.address);
    if (existingBalance > 0) {
      console.log(`    Skipped - already has ${ethers.formatEther(existingBalance)} ETH entered`);
      skipped++;
      continue;
    }

    // Check wallet balance
    const walletBalance = await ethers.provider.getBalance(account.address);
    if (walletBalance < enterAmount) {
      console.log(`    Failed - insufficient balance (${ethers.formatEther(walletBalance)} ETH)`);
      failed++;
      continue;
    }

    try {
      const tx = await extensionWithSigner.enter({ value: enterAmount });
      console.log(`    Sending... (${shortHash(tx.hash)})`);
      await waitForTx(tx, 60000);
      console.log(`    ✓ Entered with ${amount} ETH`);
      successful++;
    } catch (error: any) {
      console.log(`    ✗ Failed - ${error.message.slice(0, 50)}`);
      failed++;
    }
  }

  // Get final state
  const finalParticipants = await extension.activeParticipants();
  const finalBalance = await extension.totalBalance();

  console.log("\n" + "=".repeat(50));
  console.log("Enter Complete!");
  console.log("=".repeat(50));
  console.log(`\nResults:`);
  console.log(`  Successful: ${successful}`);
  console.log(`  Skipped:    ${skipped}`);
  console.log(`  Failed:     ${failed}`);

  console.log(`\nFinal state:`);
  console.log(`  Active participants: ${finalParticipants} (was ${initialParticipants})`);
  console.log(`  Total balance: ${ethers.formatEther(finalBalance)} ETH (was ${ethers.formatEther(initialBalance)})`);

  console.log("\nNext steps:");
  console.log("  - Run: npm run sepolia:status");
  console.log("  - Run: COUNT=N npm run sepolia:leave");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
