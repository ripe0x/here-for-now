import { ethers, network } from "hardhat";

// Renderer metadata configuration
const RENDERER_CONFIG = {
  name: "Here, For Now",
  description: "Here, For Now is a shared intimate space held by a single collector.\\n\\nAnyone can enter the space through a small onchain act of presence, adding themselves to the moment and shaping the image for as long as they choose to remain.\\n\\nThe work reflects the brief overlaps of the people who were here at the same time.",
  author: "ripe0x.eth",
  urls: ["https://hfn.ripe.wtf", "https://superrare.com/curation/exhibitions/intimate-systems"],
};

// Manifold core on mainnet (localhost is a fork)
const MAINNET_MANIFOLD_CORE = process.env.MAINNET_MANIFOLD_CORE || "0x09CA1D7D0419d444AdFbb2c47FF0b2F29f29D3B2";

// Minimal ABI for the Manifold creator core
const MANIFOLD_ABI = [
  "function owner() view returns (address)",
  "function registerExtension(address extension, string calldata baseURI) external",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function ownerOf(uint256 tokenId) view returns (address)",
];

/**
 * Deploy HereForNow contracts to a local forked mainnet
 * Uses the real Manifold core contract via impersonation
 *
 * Run with: npx hardhat run scripts/deploy-local.ts --network localhost
 * (Make sure to run `npx hardhat node` first - it forks mainnet)
 */
async function main() {
  console.log("Deploying HereForNow to local forked network...\n");

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH\n");

  // Connect to the real Manifold core contract on the fork
  console.log("1. Connecting to Manifold core:", MAINNET_MANIFOLD_CORE);
  const manifoldCore = new ethers.Contract(MAINNET_MANIFOLD_CORE, MANIFOLD_ABI, ethers.provider);

  // Verify the contract exists on the fork
  const code = await ethers.provider.getCode(MAINNET_MANIFOLD_CORE);
  if (code === "0x") {
    throw new Error("Manifold contract not found - ensure you're running on a mainnet fork");
  }

  // Get and impersonate the owner
  const ownerAddress = await manifoldCore.owner();
  console.log("   Manifold owner:", ownerAddress);

  await network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [ownerAddress],
  });

  // Fund the owner for gas
  await deployer.sendTransaction({
    to: ownerAddress,
    value: ethers.parseEther("1"),
  });

  const owner = await ethers.getSigner(ownerAddress);

  // Deploy renderer
  console.log("\n2. Deploying HereForNowRenderer...");
  const Renderer = await ethers.getContractFactory("HereForNowRenderer");
  const renderer = await Renderer.deploy(
    RENDERER_CONFIG.name,
    RENDERER_CONFIG.description,
    RENDERER_CONFIG.author,
    RENDERER_CONFIG.urls
  );
  await renderer.waitForDeployment();
  console.log("   Renderer deployed to:", await renderer.getAddress());

  // Deploy extension
  console.log("\n3. Deploying HereForNowExtension...");
  const Extension = await ethers.getContractFactory("HereForNowExtension");
  const extension = await Extension.deploy();
  await extension.waitForDeployment();
  console.log("   Extension deployed to:", await extension.getAddress());

  // Register extension on core (requires impersonated owner)
  console.log("\n4. Registering extension on Manifold core...");
  const manifoldWithOwner = manifoldCore.connect(owner);
  await manifoldWithOwner.registerExtension(await extension.getAddress(), "");
  console.log("   Extension registered");

  // Set renderer on extension
  console.log("\n5. Setting renderer on extension...");
  await extension.setRenderer(await renderer.getAddress());
  console.log("   Renderer set");

  // Initialize extension (mints token)
  console.log("\n6. Initializing extension (minting token)...");
  await extension.initialize(MAINNET_MANIFOLD_CORE);
  const tokenId = await extension.tokenId();
  console.log("   Token ID:", tokenId.toString());

  // Verify setup
  console.log("\n7. Verifying setup...");
  const tokenOwner = await manifoldCore.ownerOf(tokenId);
  console.log("   Token owner:", tokenOwner);

  // Stop impersonating
  await network.provider.request({
    method: "hardhat_stopImpersonatingAccount",
    params: [ownerAddress],
  });

  console.log("\n========================================");
  console.log("Deployment complete!");
  console.log("========================================\n");
  console.log("Addresses:");
  console.log("  Manifold Core:", MAINNET_MANIFOLD_CORE);
  console.log("  Renderer:     ", await renderer.getAddress());
  console.log("  Extension:    ", await extension.getAddress());
  console.log("  Token ID:     ", tokenId.toString());

  return {
    manifoldCore: MAINNET_MANIFOLD_CORE,
    renderer: await renderer.getAddress(),
    extension: await extension.getAddress(),
    tokenId: tokenId.toString(),
  };
}

main()
  .then((addresses) => {
    console.log("\nExport these addresses for use:");
    console.log(JSON.stringify(addresses, null, 2));
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
