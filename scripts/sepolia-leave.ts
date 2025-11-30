import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { waitForTx, shortHash } from "./lib/tx-utils";

/**
 * Leave the artwork and reclaim ETH for test accounts
 *
 * Usage:
 *   npx hardhat run scripts/sepolia-leave.ts --network sepolia
 *   COUNT=3 npx hardhat run scripts/sepolia-leave.ts --network sepolia
 *
 * Environment variables:
 *   COUNT    Number of accounts to leave from (default: all with balances)
 */

const ACCOUNTS_FILE = path.join(__dirname, "..", "test-accounts.json");
const DEPLOYMENT_FILE = path.join(__dirname, "..", `deployment-${network.name}.json`);

// Extension ABI (minimal)
const EXTENSION_ABI = [
  "function leave() external",
  "function balanceOf(address) view returns (uint256)",
  "function getActiveParticipants() view returns (uint256)",
  "function getTotalBalance() view returns (uint256)",
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
}

function parseArgs(): { count: number | null } {
  const count = process.env.COUNT ? parseInt(process.env.COUNT, 10) : null;
  return { count };
}

async function main() {
  const { count } = parseArgs();

  console.log("Sepolia Leave Script\n");
  console.log("=".repeat(50));

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

  console.log(`Extension: ${deployment.extension}`);

  // Get extension contract
  const extension = new ethers.Contract(deployment.extension, EXTENSION_ABI, ethers.provider);

  // Get initial state
  const initialParticipants = await extension.getActiveParticipants();
  const initialBalance = await extension.getTotalBalance();

  console.log(`\nInitial state:`);
  console.log(`  Active participants: ${initialParticipants}`);
  console.log(`  Total balance: ${ethers.formatEther(initialBalance)} ETH`);

  // Find accounts with balances
  console.log("\nScanning for accounts with balances...");
  const accountsWithBalance: { account: TestAccount; balance: bigint }[] = [];

  for (const account of accountsData.accounts) {
    const balance = await extension.balanceOf(account.address);
    if (balance > 0) {
      accountsWithBalance.push({ account, balance });
    }
  }

  console.log(`Found ${accountsWithBalance.length} accounts with balances`);

  if (accountsWithBalance.length === 0) {
    console.log("\nNo accounts have balances. Nothing to leave.");
    process.exit(0);
  }

  // Determine how many to leave
  const leaveCount = count !== null
    ? Math.min(count, accountsWithBalance.length)
    : accountsWithBalance.length;

  console.log(`Leaving from ${leaveCount} accounts`);

  // Leave from accounts
  console.log("\n" + "=".repeat(50));
  console.log("Leaving...\n");

  let successful = 0;
  let failed = 0;

  for (let i = 0; i < leaveCount; i++) {
    const { account, balance } = accountsWithBalance[i];
    const wallet = new ethers.Wallet(account.privateKey, ethers.provider);
    const extensionWithSigner = new ethers.Contract(deployment.extension, EXTENSION_ABI, wallet);

    console.log(`[${account.index}] ${account.address}`);
    console.log(`    Balance: ${ethers.formatEther(balance)} ETH`);

    try {
      const tx = await extensionWithSigner.leave();
      console.log(`    Sending... (${shortHash(tx.hash)})`);
      await waitForTx(tx, 60000);
      console.log(`    ✓ Left`);
      successful++;
    } catch (error: any) {
      console.log(`    ✗ Failed - ${error.message.slice(0, 50)}`);
      failed++;
    }
  }

  // Get final state
  const finalParticipants = await extension.getActiveParticipants();
  const finalBalance = await extension.getTotalBalance();

  console.log("\n" + "=".repeat(50));
  console.log("Leave Complete!");
  console.log("=".repeat(50));
  console.log(`\nResults:`);
  console.log(`  Successful: ${successful}`);
  console.log(`  Failed:     ${failed}`);

  console.log(`\nFinal state:`);
  console.log(`  Active participants: ${finalParticipants} (was ${initialParticipants})`);
  console.log(`  Total balance: ${ethers.formatEther(finalBalance)} ETH (was ${ethers.formatEther(initialBalance)})`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
