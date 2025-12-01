import { ethers, network, run } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";

/**
 * Unified deploy script for HereForNow contracts
 *
 * Works on: hardhat (local/fork), sepolia, mainnet
 *
 * Features:
 * - Interactive confirmation before each transaction
 * - Resumable if interrupted (saves progress)
 * - Checks for pending transactions before starting
 *
 * Usage:
 *   npx hardhat run scripts/deploy.ts --network hardhat
 *   npx hardhat run scripts/deploy.ts --network sepolia
 *   npx hardhat run scripts/deploy.ts --network mainnet
 */

// Network-specific Manifold core addresses
const MANIFOLD_CORES: Record<string, string> = {
  mainnet: process.env.MAINNET_MANIFOLD_CORE || "0x09CA1D7D0419d444AdFbb2c47FF0b2F29f29D3B2",
  sepolia: process.env.SEPOLIA_MANIFOLD_CORE || "0xA11D7EbB2404bb8CE247eaE15eF02312cC294cEc",
  hardhat: process.env.MAINNET_MANIFOLD_CORE || "0x09CA1D7D0419d444AdFbb2c47FF0b2F29f29D3B2", // Fork uses mainnet
  localhost: process.env.MAINNET_MANIFOLD_CORE || "0x09CA1D7D0419d444AdFbb2c47FF0b2F29f29D3B2",
};

const MANIFOLD_ABI = [
  "function owner() view returns (address)",
  "function registerExtension(address extension, string calldata baseURI) external",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function isAdmin(address account) view returns (bool)",
];

// Renderer metadata configuration
const RENDERER_CONFIG = {
  name: "Here, For Now",
  description: "Here, For Now is a shared intimate space held by a single collector.\\n\\nAnyone can enter the space through a small onchain act of presence, adding themselves to the moment and shaping the image for as long as they choose to remain.\\n\\nThe work reflects the brief overlaps of the people who were here at the same time.",
  author: "ripe0x.eth",
  urls: ["https://hfn.ripe.wtf", "https://superrare.com/curation/exhibitions/intimate-systems"],
};

interface DeployProgress {
  network: string;
  step: number;
  rendererAddress?: string;
  rendererTxHash?: string;
  extensionAddress?: string;
  extensionTxHash?: string;
  registerTxHash?: string;
  setRendererTxHash?: string;
  initializeTxHash?: string;
}

function getProgressFile(): string {
  return path.join(__dirname, "..", `deploy-progress-${network.name}.json`);
}

function getDeploymentFile(): string {
  return path.join(__dirname, "..", `deployment-${network.name}.json`);
}

function loadProgress(): DeployProgress {
  const file = getProgressFile();
  if (fs.existsSync(file)) {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  }
  return { network: network.name, step: 0 };
}

function saveProgress(progress: DeployProgress) {
  fs.writeFileSync(getProgressFile(), JSON.stringify(progress, null, 2));
}

function clearProgress() {
  const file = getProgressFile();
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
  }
}

// Format gas estimate for display
async function formatGasEstimate(gasEstimate: bigint): Promise<string> {
  const feeData = await ethers.provider.getFeeData();
  const gasPrice = feeData.gasPrice || 0n;
  const estimatedCost = gasEstimate * gasPrice;
  const gasPriceGwei = Number(gasPrice) / 1e9;
  return `   Gas estimate: ${gasEstimate.toLocaleString()} units @ ${gasPriceGwei.toFixed(2)} gwei = ${ethers.formatEther(estimatedCost)} ETH`;
}

// Interactive confirmation
async function confirm(message: string): Promise<boolean> {
  // Auto-confirm for hardhat/localhost (local testing)
  if (network.name === "hardhat" || network.name === "localhost") {
    console.log(`${message} [auto-confirmed for local network]`);
    return true;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} (y/n): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
    });
  });
}

// Wait for transaction with polling
async function waitForTx(hash: string, label: string): Promise<any> {
  console.log(`   Tx: ${hash}`);
  console.log(`   https://${network.name === "mainnet" ? "" : network.name + "."}etherscan.io/tx/${hash}`);

  // Check if already confirmed
  let receipt = await ethers.provider.getTransactionReceipt(hash);
  if (receipt) {
    console.log(`   ✓ Already confirmed in block ${receipt.blockNumber}`);
    return receipt;
  }

  // Poll for confirmation
  process.stdout.write("   Waiting for confirmation");
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    receipt = await ethers.provider.getTransactionReceipt(hash);
    if (receipt) {
      console.log(`\n   ✓ Confirmed in block ${receipt.blockNumber}`);
      return receipt;
    }
    process.stdout.write(".");
  }
  throw new Error(
    `Timeout waiting for ${label}.\nTx: ${hash}\nCheck explorer and rerun script to resume.`
  );
}

// Deploy contract using raw ethers to bypass hardhat-ethers bug with empty 'to' field
// The bug is in hardhat-ethers' checkTx() which parses pending tx responses
async function deployContract(
  factory: any,
  constructorArgs: any[],
  deployer: any
): Promise<{ txHash: string; contractAddress: string }> {
  // Get the deployment transaction data
  const deployTx = await factory.getDeployTransaction(...constructorArgs);

  // Get current fee data
  const feeData = await ethers.provider.getFeeData();
  const nonce = await ethers.provider.getTransactionCount(deployer.address, "pending");

  // Build the raw transaction
  const rawTx = {
    data: deployTx.data,
    nonce,
    gasLimit: await ethers.provider.estimateGas({ ...deployTx, from: deployer.address }),
    maxFeePerGas: feeData.maxFeePerGas,
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
    type: 2,
    chainId: (await ethers.provider.getNetwork()).chainId,
  };

  // Sign and send using raw ethers (bypass hardhat-ethers wrapper)
  const { ethers: rawEthers } = await import("ethers");
  const privateKey = network.config.accounts && Array.isArray(network.config.accounts)
    ? network.config.accounts[0] as string
    : process.env.PRIVATE_KEY!;
  const rpcUrl = (network.config as any).url;
  const rawProvider = new rawEthers.JsonRpcProvider(rpcUrl);
  const rawWallet = new rawEthers.Wallet(privateKey, rawProvider);

  const signedTx = await rawWallet.signTransaction(rawTx);
  const txResponse = await rawProvider.broadcastTransaction(signedTx);
  const txHash = txResponse.hash;

  console.log(`   Tx sent: ${txHash}`);

  // Wait for receipt using raw provider (also bypasses the bug)
  const receipt = await waitForTxRaw(rawProvider, txHash, "contract deployment");

  if (!receipt.contractAddress) {
    throw new Error("Contract deployment failed - no contract address in receipt");
  }

  return { txHash, contractAddress: receipt.contractAddress };
}

// Wait for transaction using raw ethers provider
async function waitForTxRaw(provider: any, hash: string, label: string): Promise<any> {
  console.log(`   https://${network.name === "mainnet" ? "" : network.name + "."}etherscan.io/tx/${hash}`);

  // Poll for confirmation
  process.stdout.write("   Waiting for confirmation");
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const receipt = await provider.getTransactionReceipt(hash);
    if (receipt) {
      console.log(`\n   ✓ Confirmed in block ${receipt.blockNumber}`);
      return receipt;
    }
    process.stdout.write(".");
  }
  throw new Error(
    `Timeout waiting for ${label}.\nTx: ${hash}\nCheck explorer and rerun script to resume.`
  );
}

async function main() {
  const networkName = network.name;
  const manifoldCore = MANIFOLD_CORES[networkName];

  if (!manifoldCore) {
    console.error(`Unknown network: ${networkName}`);
    console.error(`Supported: ${Object.keys(MANIFOLD_CORES).join(", ")}`);
    process.exit(1);
  }

  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║              HereForNow Deployment Script                  ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  console.log(`\nNetwork:       ${networkName}`);
  console.log(`Manifold Core: ${manifoldCore}`);

  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Deployer:      ${deployer.address}`);
  console.log(`Balance:       ${ethers.formatEther(balance)} ETH`);

  // Check for pending transactions (skip for local networks)
  if (networkName !== "hardhat" && networkName !== "localhost") {
    const confirmedNonce = await ethers.provider.getTransactionCount(deployer.address, "latest");
    const pendingNonce = await ethers.provider.getTransactionCount(deployer.address, "pending");
    if (pendingNonce > confirmedNonce) {
      console.error(`\n⚠️  ERROR: ${pendingNonce - confirmedNonce} pending transactions detected!`);
      console.error(`   Run: npx hardhat run scripts/clear-pending-txs.ts --network ${networkName}`);
      process.exit(1);
    }
  }

  // Verify Manifold ownership
  const manifold = new ethers.Contract(manifoldCore, MANIFOLD_ABI, ethers.provider);

  let ownerAddress: string;
  let isAdmin: boolean;

  try {
    ownerAddress = await manifold.owner();
    isAdmin = await manifold.isAdmin(deployer.address);
  } catch (e) {
    console.error(`\n⚠️  ERROR: Cannot read Manifold contract at ${manifoldCore}`);
    console.error(`   Make sure the address is correct for ${networkName}`);
    process.exit(1);
  }

  console.log(`\nManifold owner: ${ownerAddress}`);
  console.log(`Deployer is owner: ${ownerAddress === deployer.address}`);
  console.log(`Deployer is admin: ${isAdmin}`);

  if (ownerAddress !== deployer.address && !isAdmin) {
    console.error("\n⚠️  ERROR: Deployer is not owner or admin of Manifold contract!");
    process.exit(1);
  }

  // Load progress
  let progress = loadProgress();
  if (progress.step > 0 && progress.network === networkName) {
    console.log(`\n📋 Found saved progress at step ${progress.step}`);
    if (!(await confirm("Resume from saved progress?"))) {
      progress = { network: networkName, step: 0 };
      clearProgress();
    }
  } else {
    progress = { network: networkName, step: 0 };
  }

  let renderer: any;
  let extension: any;

  // ═══════════════════════════════════════════════════════════════════
  // STEP 1: Deploy Renderer
  // ═══════════════════════════════════════════════════════════════════
  if (progress.step < 1) {
    console.log("\n────────────────────────────────────────────────────────────");
    console.log("STEP 1: Deploy HereForNowRenderer");
    console.log("────────────────────────────────────────────────────────────");

    const Renderer = await ethers.getContractFactory("HereForNowRenderer");
    const constructorArgs = [
      RENDERER_CONFIG.name,
      RENDERER_CONFIG.description,
      RENDERER_CONFIG.author,
      RENDERER_CONFIG.urls
    ];
    const deployTx = await Renderer.getDeployTransaction(...constructorArgs);
    const gasEstimate = await ethers.provider.estimateGas(deployTx);
    console.log(await formatGasEstimate(gasEstimate));

    if (!(await confirm("Deploy HereForNowRenderer?"))) {
      console.log("Aborted by user.");
      process.exit(0);
    }

    const result = await deployContract(Renderer, constructorArgs, deployer);
    progress.rendererTxHash = result.txHash;
    progress.rendererAddress = result.contractAddress;
    progress.step = 2; // Skip to step 2 since deployContract already waits for confirmation
    saveProgress(progress);
    console.log(`   Renderer: ${progress.rendererAddress}`);
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEP 2: Deploy Extension
  // ═══════════════════════════════════════════════════════════════════
  if (progress.step === 2) {
    console.log("\n────────────────────────────────────────────────────────────");
    console.log("STEP 2: Deploy HereForNowExtension");
    console.log("────────────────────────────────────────────────────────────");

    const Extension = await ethers.getContractFactory("HereForNowExtension");
    const deployTx = await Extension.getDeployTransaction();
    const gasEstimate = await ethers.provider.estimateGas(deployTx);
    console.log(await formatGasEstimate(gasEstimate));

    if (!(await confirm("Deploy HereForNowExtension?"))) {
      console.log("Aborted. Rerun to resume.");
      process.exit(0);
    }

    const result = await deployContract(Extension, [], deployer);
    progress.extensionTxHash = result.txHash;
    progress.extensionAddress = result.contractAddress;
    progress.step = 4; // Skip to step 4 since deployContract already waits for confirmation
    saveProgress(progress);
    console.log(`   Extension: ${progress.extensionAddress}`);
  }

  // Reconnect to contracts if resuming
  if (!renderer) {
    const Renderer = await ethers.getContractFactory("HereForNowRenderer");
    renderer = Renderer.attach(progress.rendererAddress!);
  }
  if (!extension) {
    const Extension = await ethers.getContractFactory("HereForNowExtension");
    extension = Extension.attach(progress.extensionAddress!);
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEP 3: Register Extension on Manifold
  // ═══════════════════════════════════════════════════════════════════
  if (progress.step === 4) {
    console.log("\n────────────────────────────────────────────────────────────");
    console.log("STEP 3: Register extension on Manifold core");
    console.log("────────────────────────────────────────────────────────────");
    console.log(`   Extension: ${progress.extensionAddress}`);
    console.log(`   Manifold:  ${manifoldCore}`);

    const manifoldWithSigner = new ethers.Contract(manifoldCore, MANIFOLD_ABI, deployer);
    const gasEstimate = await manifoldWithSigner.registerExtension.estimateGas(progress.extensionAddress!, "");
    console.log(await formatGasEstimate(gasEstimate));

    if (!(await confirm("Register extension?"))) {
      console.log("Aborted. Rerun to resume.");
      process.exit(0);
    }
    const registerTx = await manifoldWithSigner.registerExtension(progress.extensionAddress!, "");
    progress.registerTxHash = registerTx.hash;
    progress.step = 5;
    saveProgress(progress);
  }

  if (progress.step === 5) {
    await waitForTx(progress.registerTxHash!, "register extension");
    console.log("   ✓ Extension registered");
    progress.step = 6;
    saveProgress(progress);
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEP 4: Set Renderer on Extension
  // ═══════════════════════════════════════════════════════════════════
  if (progress.step === 6) {
    console.log("\n────────────────────────────────────────────────────────────");
    console.log("STEP 4: Set renderer on extension");
    console.log("────────────────────────────────────────────────────────────");
    console.log(`   Renderer:  ${progress.rendererAddress}`);
    console.log(`   Extension: ${progress.extensionAddress}`);

    const gasEstimate = await extension.setRenderer.estimateGas(progress.rendererAddress!);
    console.log(await formatGasEstimate(gasEstimate));

    if (!(await confirm("Set renderer?"))) {
      console.log("Aborted. Rerun to resume.");
      process.exit(0);
    }

    const setRendererTx = await extension.setRenderer(progress.rendererAddress!);
    progress.setRendererTxHash = setRendererTx.hash;
    progress.step = 7;
    saveProgress(progress);
  }

  if (progress.step === 7) {
    await waitForTx(progress.setRendererTxHash!, "set renderer");
    console.log("   ✓ Renderer set");
    progress.step = 8;
    saveProgress(progress);
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEP 5: Initialize Extension (Mint Token)
  // ═══════════════════════════════════════════════════════════════════
  if (progress.step === 8) {
    console.log("\n────────────────────────────────────────────────────────────");
    console.log("STEP 5: Initialize extension (mint token)");
    console.log("────────────────────────────────────────────────────────────");
    console.log(`   This will mint a new token on the Manifold contract.`);

    const gasEstimate = await extension.initialize.estimateGas(manifoldCore);
    console.log(await formatGasEstimate(gasEstimate));

    if (!(await confirm("Initialize and mint?"))) {
      console.log("Aborted. Rerun to resume.");
      process.exit(0);
    }

    const initTx = await extension.initialize(manifoldCore);
    progress.initializeTxHash = initTx.hash;
    progress.step = 9;
    saveProgress(progress);
  }

  if (progress.step === 9) {
    await waitForTx(progress.initializeTxHash!, "initialize");
    console.log("   ✓ Initialized");
    progress.step = 10;
    saveProgress(progress);
  }

  // ═══════════════════════════════════════════════════════════════════
  // COMPLETE
  // ═══════════════════════════════════════════════════════════════════
  const tokenId = await extension.tokenId();

  // Verify token URI
  let tokenUriPrefix = "";
  try {
    const uri = await manifold.tokenURI(tokenId);
    tokenUriPrefix = uri.substring(0, 50) + "...";
  } catch (e) {
    tokenUriPrefix = "(unable to fetch)";
  }

  // Save deployment info
  const deploymentInfo = {
    network: networkName,
    manifoldCore,
    renderer: progress.rendererAddress,
    extension: progress.extensionAddress,
    tokenId: tokenId.toString(),
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
  };

  fs.writeFileSync(getDeploymentFile(), JSON.stringify(deploymentInfo, null, 2));
  clearProgress();

  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║                  DEPLOYMENT COMPLETE                       ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  console.log(`\nNetwork:       ${networkName}`);
  console.log(`Manifold Core: ${manifoldCore}`);
  console.log(`Renderer:      ${progress.rendererAddress}`);
  console.log(`Extension:     ${progress.extensionAddress}`);
  console.log(`Token ID:      ${tokenId}`);
  console.log(`Token URI:     ${tokenUriPrefix}`);
  console.log(`\nSaved to:      ${getDeploymentFile()}`);

  // Verify contracts on Etherscan (skip for local networks)
  if (networkName !== "hardhat" && networkName !== "localhost") {
    console.log("\n7. Verifying contracts on Etherscan...");

    // Wait a bit for Etherscan to index the contracts
    console.log("   Waiting 30s for Etherscan to index...");
    await new Promise(resolve => setTimeout(resolve, 30000));

    // Verify Extension (no constructor args)
    try {
      console.log("   Verifying Extension...");
      await run("verify:verify", {
        address: progress.extensionAddress,
        constructorArguments: [],
      });
      console.log("   ✓ Extension verified");
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("Already Verified")) {
        console.log("   ✓ Extension already verified");
      } else {
        console.log("   ⚠ Extension verification failed:", msg);
      }
    }

    // Verify Renderer (with constructor args)
    try {
      console.log("   Verifying Renderer...");
      await run("verify:verify", {
        address: progress.rendererAddress,
        constructorArguments: [
          RENDERER_CONFIG.name,
          RENDERER_CONFIG.description,
          RENDERER_CONFIG.author,
          RENDERER_CONFIG.urls,
        ],
      });
      console.log("   ✓ Renderer verified");
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("Already Verified")) {
        console.log("   ✓ Renderer already verified");
      } else {
        console.log("   ⚠ Renderer verification failed:", msg);
      }
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n⚠️  Error:", error.message || error);
    console.log("\nProgress saved. Rerun script to resume.");
    process.exit(1);
  });
