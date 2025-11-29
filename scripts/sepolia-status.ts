import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Display status of the Sepolia deployment
 *
 * Shows:
 * - Deployed contract addresses
 * - Active depositors count
 * - Total balance
 * - Which test accounts have deposited
 *
 * Run with: npx hardhat run scripts/sepolia-status.ts --network sepolia
 */

const ACCOUNTS_FILE = path.join(__dirname, "..", "test-accounts.json");
const DEPLOYMENT_FILE = path.join(__dirname, "..", `deployment-${network.name}.json`);

// Extension ABI
const EXTENSION_ABI = [
  "function core() view returns (address)",
  "function tokenId() view returns (uint256)",
  "function renderer() view returns (address)",
  "function balanceOf(address) view returns (uint256)",
  "function getActiveDepositors() view returns (uint256)",
  "function getTotalBalance() view returns (uint256)",
];

// Manifold ABI
const MANIFOLD_ABI = [
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function ownerOf(uint256 tokenId) view returns (address)",
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
  network: string;
  manifoldCore: string;
  renderer: string;
  extension: string;
  tokenId: string;
  deployedAt: string;
  deployer: string;
}

async function main() {
  console.log("Sepolia Deployment Status\n");
  console.log("=".repeat(60));

  // Check for deployment file
  if (!fs.existsSync(DEPLOYMENT_FILE)) {
    console.error("\nERROR: sepolia-deployment.json not found!");
    console.error("Run 'npm run deploy:sepolia' first.");
    process.exit(1);
  }

  const deployment: DeploymentInfo = JSON.parse(fs.readFileSync(DEPLOYMENT_FILE, "utf-8"));

  console.log("\n📋 DEPLOYMENT INFO");
  console.log("-".repeat(60));
  console.log(`Network:      ${deployment.network}`);
  console.log(`Deployed at:  ${deployment.deployedAt}`);
  console.log(`Deployer:     ${deployment.deployer}`);

  console.log("\n📍 CONTRACT ADDRESSES");
  console.log("-".repeat(60));
  console.log(`Manifold Core: ${deployment.manifoldCore}`);
  console.log(`Extension:     ${deployment.extension}`);
  console.log(`Renderer:      ${deployment.renderer}`);
  console.log(`Token ID:      ${deployment.tokenId}`);

  // Get extension contract
  const extension = new ethers.Contract(deployment.extension, EXTENSION_ABI, ethers.provider);
  const manifold = new ethers.Contract(deployment.manifoldCore, MANIFOLD_ABI, ethers.provider);

  // Get current state
  const activeDepositors = await extension.getActiveDepositors();
  const totalBalance = await extension.getTotalBalance();
  const tokenOwner = await manifold.ownerOf(deployment.tokenId);

  console.log("\n📊 CURRENT STATE");
  console.log("-".repeat(60));
  console.log(`Active depositors: ${activeDepositors}`);
  console.log(`Total balance:     ${ethers.formatEther(totalBalance)} ETH`);
  console.log(`Token owner:       ${tokenOwner}`);

  // Check test accounts
  if (fs.existsSync(ACCOUNTS_FILE)) {
    const accountsData: TestAccountsFile = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, "utf-8"));

    console.log("\n👥 TEST ACCOUNTS");
    console.log("-".repeat(60));

    let depositedCount = 0;
    const depositors: { index: number; address: string; balance: string }[] = [];

    for (const account of accountsData.accounts) {
      const balance = await extension.balanceOf(account.address);
      const walletBalance = await ethers.provider.getBalance(account.address);

      if (balance > 0) {
        depositedCount++;
        depositors.push({
          index: account.index,
          address: account.address,
          balance: ethers.formatEther(balance),
        });
      }

      // Only show detailed status for first 5 accounts unless they have deposits
      if (account.index < 5 || balance > 0) {
        const status = balance > 0 ? "✓ DEPOSITED" : "○ Not deposited";
        console.log(
          `[${account.index.toString().padStart(2)}] ${account.address.slice(0, 10)}... ` +
            `| Wallet: ${ethers.formatEther(walletBalance).padStart(8)} ETH ` +
            `| ${status}${balance > 0 ? ` (${ethers.formatEther(balance)} ETH)` : ""}`
        );
      }
    }

    if (accountsData.accounts.length > 5) {
      const remaining = accountsData.accounts.length - 5;
      const remainingDeposited = depositors.filter((d) => d.index >= 5).length;
      if (remainingDeposited === 0) {
        console.log(`... and ${remaining} more accounts (none deposited)`);
      }
    }

    console.log(`\nTotal: ${depositedCount}/${accountsData.accounts.length} accounts have deposited`);
  } else {
    console.log("\n⚠️  test-accounts.json not found");
    console.log("   Run 'npm run generate:accounts' to create test accounts");
  }

  // Show token URI preview
  console.log("\n🖼️  TOKEN URI");
  console.log("-".repeat(60));
  try {
    const uri = await manifold.tokenURI(deployment.tokenId);
    if (uri.startsWith("data:application/json;base64,")) {
      const json = Buffer.from(uri.slice(29), "base64").toString();
      const metadata = JSON.parse(json);
      console.log(`Name:        ${metadata.name}`);
      console.log(`Description: ${metadata.description?.slice(0, 60)}...`);
      if (metadata.attributes) {
        console.log("Attributes:");
        for (const attr of metadata.attributes) {
          console.log(`  - ${attr.trait_type}: ${attr.value}`);
        }
      }
    } else {
      console.log(`URI: ${uri.slice(0, 80)}...`);
    }
  } catch (error: any) {
    console.log(`Error fetching token URI: ${error.message}`);
  }

  console.log("\n" + "=".repeat(60));
  console.log("View on Etherscan:");
  console.log(`  https://sepolia.etherscan.io/address/${deployment.extension}`);
  console.log(`  https://sepolia.etherscan.io/token/${deployment.manifoldCore}?a=${deployment.tokenId}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
