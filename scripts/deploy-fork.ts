import { ethers, network } from "hardhat";

/**
 * Deploy HereForNow contracts to a mainnet fork
 * Uses the actual Manifold creator contract at 0x09CA1D7D0419d444AdFbb2c47FF0b2F29f29D3B2
 *
 * Prerequisites:
 * - Set MAINNET_RPC_URL in .env
 * - Run with: npx hardhat run scripts/deploy-fork.ts
 *
 * This script impersonates the owner of the Manifold contract to register the extension.
 */

const MANIFOLD_CORE = "0x09CA1D7D0419d444AdFbb2c47FF0b2F29f29D3B2";

// Minimal ABI for the Manifold creator core
const MANIFOLD_ABI = [
  "function owner() view returns (address)",
  "function registerExtension(address extension, string calldata baseURI) external",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function isAdmin(address account) view returns (bool)",
  "function totalSupply() view returns (uint256)",
];

async function main() {
  console.log("Deploying HereForNow to mainnet fork...\n");
  console.log("Manifold Core:", MANIFOLD_CORE);

  // Get the Manifold core contract
  const manifoldCore = new ethers.Contract(MANIFOLD_CORE, MANIFOLD_ABI, ethers.provider);

  // Get the owner of the Manifold contract
  const ownerAddress = await manifoldCore.owner();
  console.log("Manifold owner:", ownerAddress);

  // Check current token supply
  let currentSupply;
  try {
    currentSupply = await manifoldCore.totalSupply();
    console.log("Current token supply:", currentSupply.toString());
  } catch {
    console.log("Could not get total supply, assuming 1");
    currentSupply = 1n;
  }

  // Impersonate the owner
  await network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [ownerAddress],
  });

  // Fund the impersonated account for gas
  const [deployer] = await ethers.getSigners();
  await deployer.sendTransaction({
    to: ownerAddress,
    value: ethers.parseEther("1"),
  });

  const ownerSigner = await ethers.getSigner(ownerAddress);
  console.log("\nImpersonating owner for deployment...\n");

  // Deploy renderer
  console.log("1. Deploying HereForNowRenderer...");
  const Renderer = await ethers.getContractFactory("HereForNowRenderer", deployer);
  const renderer = await Renderer.deploy();
  await renderer.waitForDeployment();
  console.log("   Renderer deployed to:", await renderer.getAddress());

  // Deploy extension
  console.log("\n2. Deploying HereForNowExtension...");
  const Extension = await ethers.getContractFactory("HereForNowExtension", deployer);
  const extension = await Extension.deploy();
  await extension.waitForDeployment();
  console.log("   Extension deployed to:", await extension.getAddress());

  // Register extension on core (requires owner)
  console.log("\n3. Registering extension on Manifold core...");
  const manifoldWithOwner = new ethers.Contract(MANIFOLD_CORE, MANIFOLD_ABI, ownerSigner);
  const registerTx = await manifoldWithOwner.registerExtension(await extension.getAddress(), "");
  await registerTx.wait();
  console.log("   Extension registered");

  // Set renderer on extension
  console.log("\n4. Setting renderer on extension...");
  await extension.setRenderer(await renderer.getAddress());
  console.log("   Renderer set");

  // Initialize extension (mints token)
  console.log("\n5. Initializing extension (minting token ID 2)...");
  await extension.initialize(MANIFOLD_CORE);
  const tokenId = await extension.tokenId();
  console.log("   Token ID:", tokenId.toString());

  if (tokenId !== 2n) {
    console.log("   WARNING: Expected token ID 2, got", tokenId.toString());
    console.log("   This may be because other tokens exist on the contract.");
  }

  // Verify the token URI works
  console.log("\n6. Verifying token URI...");
  try {
    const uri = await manifoldCore.tokenURI(tokenId);
    console.log("   Token URI prefix:", uri.substring(0, 50) + "...");
    console.log("   Token URI works!");
  } catch (e) {
    console.log("   Error getting token URI:", e);
  }

  // Stop impersonating
  await network.provider.request({
    method: "hardhat_stopImpersonatingAccount",
    params: [ownerAddress],
  });

  console.log("\n========================================");
  console.log("Fork deployment complete!");
  console.log("========================================\n");
  console.log("Addresses:");
  console.log("  Manifold Core: ", MANIFOLD_CORE);
  console.log("  Renderer:      ", await renderer.getAddress());
  console.log("  Extension:     ", await extension.getAddress());
  console.log("  Token ID:      ", tokenId.toString());

  return {
    manifoldCore: MANIFOLD_CORE,
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
