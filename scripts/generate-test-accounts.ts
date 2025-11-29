import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";

/**
 * Generate test accounts for Sepolia testing
 *
 * Creates 20 accounts from a single mnemonic and saves to test-accounts.json
 * If the file already exists, it will use the existing mnemonic.
 *
 * Run with: npx hardhat run scripts/generate-test-accounts.ts
 */

const NUM_ACCOUNTS = 20;
const OUTPUT_FILE = path.join(__dirname, "..", "test-accounts.json");

interface TestAccount {
  index: number;
  address: string;
  privateKey: string;
}

interface TestAccountsFile {
  mnemonic: string;
  accounts: TestAccount[];
  generatedAt: string;
}

function generateAccounts(mnemonic: string, count: number): TestAccount[] {
  const accounts: TestAccount[] = [];

  for (let i = 0; i < count; i++) {
    const hdPath = `m/44'/60'/0'/0/${i}`;
    const wallet = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, hdPath);
    accounts.push({
      index: i,
      address: wallet.address,
      privateKey: wallet.privateKey,
    });
  }

  return accounts;
}

async function main() {
  console.log("Test Account Generator\n");
  console.log("=".repeat(50));

  let mnemonic: string;
  let isExisting = false;

  // Check if file already exists
  if (fs.existsSync(OUTPUT_FILE)) {
    console.log("\nFound existing test-accounts.json");
    const existing: TestAccountsFile = JSON.parse(fs.readFileSync(OUTPUT_FILE, "utf-8"));
    mnemonic = existing.mnemonic;
    isExisting = true;
    console.log("Using existing mnemonic to regenerate accounts...");
  } else {
    console.log("\nGenerating new random mnemonic...");
    const wallet = ethers.Wallet.createRandom();
    mnemonic = wallet.mnemonic!.phrase;
    console.log("New mnemonic created (will be saved to test-accounts.json)");
  }

  // Generate accounts
  console.log(`\nGenerating ${NUM_ACCOUNTS} accounts...`);
  const accounts = generateAccounts(mnemonic, NUM_ACCOUNTS);

  // Create output object
  const output: TestAccountsFile = {
    mnemonic,
    accounts,
    generatedAt: new Date().toISOString(),
  };

  // Save to file
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  console.log(`\nSaved to: ${OUTPUT_FILE}`);

  // Display accounts
  console.log("\n" + "=".repeat(50));
  console.log("Generated Accounts:");
  console.log("=".repeat(50));

  for (const account of accounts) {
    console.log(`\n[${account.index}] ${account.address}`);
  }

  console.log("\n" + "=".repeat(50));
  console.log(`Total: ${accounts.length} accounts`);

  if (!isExisting) {
    console.log("\n⚠️  IMPORTANT: test-accounts.json contains private keys!");
    console.log("   This file is gitignored and should never be committed.");
    console.log("   Keep a backup if you need to restore these accounts.");
  }

  console.log("\nNext steps:");
  console.log("  1. Run: npm run sepolia:distribute");
  console.log("     (Distributes Sepolia ETH to these accounts)");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
