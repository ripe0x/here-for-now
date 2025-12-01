import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Visualization script for HereForNow artwork
 *
 * This script:
 * 1. Uses a mainnet fork with the real Manifold creator contract
 * 2. Simulates various entry patterns
 * 3. Generates SVGs for different states
 * 4. Writes them to ./outputs/state-*.svg
 * 5. Creates an HTML preview page
 *
 * Run with: npx hardhat run scripts/visualize.ts --network hardhat
 * (Requires MAINNET_RPC_URL in .env for forking)
 */

const MAINNET_MANIFOLD_CORE = process.env.MAINNET_MANIFOLD_CORE || "";

// Renderer metadata configuration
const RENDERER_CONFIG = {
  name: "Here, For Now",
  description: "Here, For Now is a shared intimate space held by a single collector.\\n\\nAnyone can enter the space through a small onchain act of presence, adding themselves to the moment and shaping the image for as long as they choose to remain.\\n\\nThe work reflects the brief overlaps of the people who were here at the same time.",
  author: "ripe0x.eth",
  urls: ["https://hfn.ripe.wtf"],
};

const OUTPUT_DIR = path.join(__dirname, "..", "outputs");

interface State {
  name: string;
  participants: number;
  totalBalance: string;
  svg: string;
}

async function main() {
  console.log("Generating HereForNow visualizations...\n");

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  if (!MAINNET_MANIFOLD_CORE) {
    throw new Error("MAINNET_MANIFOLD_CORE not set in .env");
  }

  const signers = await ethers.getSigners();
  const deployer = signers[0];

  // Connect to the real Manifold core contract on the fork
  console.log("Connecting to Manifold core:", MAINNET_MANIFOLD_CORE);
  const manifoldCore = await ethers.getContractAt(
    ["function owner() view returns (address)", "function registerExtension(address,string)", "function tokenURI(uint256) view returns (string)"],
    MAINNET_MANIFOLD_CORE
  );

  // Get the owner of the Manifold core and impersonate them
  const ownerAddress = await manifoldCore.owner();
  console.log("Manifold core owner:", ownerAddress);

  await network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [ownerAddress],
  });

  // Fund the owner account for gas
  await deployer.sendTransaction({
    to: ownerAddress,
    value: ethers.parseEther("10"),
  });

  const owner = await ethers.getSigner(ownerAddress);

  // Deploy renderer and extension
  console.log("Deploying contracts...");

  const Renderer = await ethers.getContractFactory("HereForNowRenderer");
  const renderer = await Renderer.deploy(
    RENDERER_CONFIG.name,
    RENDERER_CONFIG.description,
    RENDERER_CONFIG.author,
    RENDERER_CONFIG.urls
  );

  const Extension = await ethers.getContractFactory("HereForNowExtension");
  const extension = await Extension.deploy();

  // Register extension using impersonated owner
  await manifoldCore.connect(owner).registerExtension(await extension.getAddress(), "");
  await extension.setRenderer(await renderer.getAddress());
  await extension.initialize(MAINNET_MANIFOLD_CORE);

  console.log("Contracts deployed.\n");

  const states: State[] = [];

  // Helper to generate a state
  async function captureState(name: string, filename: string) {
    const participants = await extension.activeParticipants();
    const svg = await renderer.generateSVG(participants);
    const totalBalance = await extension.totalBalance();
    states.push({
      name,
      participants: Number(participants),
      totalBalance: ethers.formatEther(totalBalance),
      svg,
    });
    fs.writeFileSync(path.join(OUTPUT_DIR, filename), svg);
    console.log(`  Written to ${filename}`);
  }

  // Helper to add N new participants using generated wallets
  async function addParticipants(count: number, enterAmount: string) {
    const amount = ethers.parseEther(enterAmount);
    for (let i = 0; i < count; i++) {
      // Generate a random wallet
      const wallet = ethers.Wallet.createRandom().connect(ethers.provider);

      // Fund the wallet from deployer
      await deployer.sendTransaction({
        to: wallet.address,
        value: amount + ethers.parseEther("0.01"), // Extra for gas
      });

      // Enter from wallet
      await extension.connect(wallet).enter({ value: amount });
    }
  }

  // State 0: No participants
  console.log("Generating state 0: No participants...");
  await captureState("0 participants", "state-0.svg");

  // State 1: 1 participant
  console.log("Generating state 1: 1 participant...");
  await extension.connect(signers[1]).enter({ value: ethers.parseEther("1") });
  await captureState("1 participant", "state-1.svg");

  // State 3: 3 participants
  console.log("Generating state 3: 3 participants...");
  await extension.connect(signers[2]).enter({ value: ethers.parseEther("0.5") });
  await extension.connect(signers[3]).enter({ value: ethers.parseEther("2") });
  await captureState("3 participants", "state-3.svg");

  // State 5: 5 participants
  console.log("Generating state 5: 5 participants...");
  await extension.connect(signers[4]).enter({ value: ethers.parseEther("0.1") });
  await extension.connect(signers[5]).enter({ value: ethers.parseEther("0.25") });
  await captureState("5 participants", "state-5.svg");

  // State 10: 10 participants
  console.log("Generating state 10: 10 participants...");
  for (let i = 6; i <= 10; i++) {
    await extension.connect(signers[i]).enter({ value: ethers.parseEther("0.05") });
  }
  await captureState("10 participants", "state-10.svg");

  // State 20: 20 participants
  console.log("Generating state 20: 20 participants...");
  for (let i = 11; i <= 19; i++) {
    await extension.connect(signers[i]).enter({ value: ethers.parseEther("0.01") });
  }
  await extension.connect(deployer).enter({ value: ethers.parseEther("0.01") });
  await captureState("20 participants", "state-20.svg");

  // State 50: 50 participants
  console.log("Generating state 50: 50 participants...");
  await addParticipants(30, "0.01");
  await captureState("50 participants", "state-50.svg");

  // State 100: 100 participants
  console.log("Generating state 100: 100 participants...");
  await addParticipants(50, "0.01");
  await captureState("100 participants", "state-100.svg");

  // State 200: 200 participants
  console.log("Generating state 200: 200 participants...");
  await addParticipants(100, "0.01");
  await captureState("200 participants", "state-200.svg");

  // State 300: 300 participants
  console.log("Generating state 300: 300 participants...");
  await addParticipants(100, "0.01");
  await captureState("300 participants", "state-300.svg");

  // State 400: 400 participants
  console.log("Generating state 400: 400 participants...");
  await addParticipants(100, "0.01");
  await captureState("400 participants", "state-400.svg");

  // State 500: 500 participants
  console.log("Generating state 500: 500 participants...");
  await addParticipants(100, "0.01");
  await captureState("500 participants", "state-500.svg");

  // State 598: 598 participants (solid block with quadratic + 2px lines)
  console.log("Generating state 598: 598 participants (solid block)...");
  await addParticipants(98, "0.01");
  await captureState("598 participants (solid)", "state-598.svg");

  // Generate HTML preview
  console.log("\nGenerating HTML preview...");
  const html = generateHTMLPreview(states);
  fs.writeFileSync(path.join(OUTPUT_DIR, "preview.html"), html);
  console.log("  Written to preview.html");

  // Also get and save the full token URI for one state
  console.log("\nSaving sample token URI...");
  const tokenId = await extension.tokenId();
  const tokenURI = await manifoldCore.tokenURI(tokenId);
  fs.writeFileSync(path.join(OUTPUT_DIR, "sample-token-uri.txt"), tokenURI);
  console.log("  Written to sample-token-uri.txt");

  console.log("\n========================================");
  console.log("Visualization complete!");
  console.log("========================================");
  console.log(`\nOpen ${path.join(OUTPUT_DIR, "preview.html")} in a browser to view all states.`);

  return states;
}

function generateHTMLPreview(states: State[]): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Here, For Now - State Preview</title>
  <style>
    * {
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      background-color: #1a1a1a;
      color: #ffffff;
      margin: 0;
      padding: 40px;
    }
    h1 {
      text-align: center;
      font-weight: 300;
      font-size: 2.5rem;
      margin-bottom: 10px;
    }
    .subtitle {
      text-align: center;
      color: #888;
      font-size: 1rem;
      margin-bottom: 40px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 30px;
      max-width: 1800px;
      margin: 0 auto;
    }
    .state {
      background: #0a0a0a;
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid #333;
    }
    .state img {
      width: 100%;
      height: auto;
      display: block;
    }
    .state-info {
      padding: 20px;
      border-top: 1px solid #333;
    }
    .state-name {
      font-size: 1.1rem;
      font-weight: 500;
      margin-bottom: 8px;
    }
    .state-details {
      color: #888;
      font-size: 0.9rem;
    }
    .description {
      max-width: 800px;
      margin: 0 auto 50px auto;
      text-align: center;
      color: #aaa;
      line-height: 1.6;
      font-size: 0.95rem;
    }
  </style>
</head>
<body>
  <h1>Here, For Now</h1>
  <p class="subtitle">State Visualization</p>
  <p class="description">
    Here, For Now is a shared intimate space held by a single collector.<br><br>
    Anyone can enter the space through a small onchain act of presence, adding themselves to the moment and shaping the image for as long as they choose to remain.<br><br>
    The work reflects the brief overlaps of the people who were here at the same time.
  </p>
  <div class="grid">
    ${states
      .map(
        (state) => `
      <div class="state">
        <img src="data:image/svg+xml;base64,${Buffer.from(state.svg).toString('base64')}" alt="${state.name}" />
        <div class="state-info">
          <div class="state-name">${state.name}</div>
          <div class="state-details">
            ${state.participants} active participants<br>
            ${state.totalBalance} ETH held
          </div>
        </div>
      </div>
    `
      )
      .join("")}
  </div>
</body>
</html>`;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
