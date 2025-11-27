import { ethers } from "hardhat";

/**
 * Deploy HereForNow contracts to mainnet
 * Uses the actual Manifold creator contract at 0x09CA1D7D0419d444AdFbb2c47FF0b2F29f29D3B2
 *
 * Prerequisites:
 * - Set MAINNET_RPC_URL in .env
 * - Set PRIVATE_KEY in .env (must be owner/admin of Manifold contract)
 * - Run with: npx hardhat run scripts/deploy-mainnet.ts --network mainnet
 *
 * IMPORTANT: The deployer must be the owner/admin of the Manifold contract
 * to register the extension.
 */

const MANIFOLD_CORE = "0x09CA1D7D0419d444AdFbb2c47FF0b2F29f29D3B2";

// Minimal ABI for the Manifold creator core
const MANIFOLD_ABI = [
  "function owner() view returns (address)",
  "function registerExtension(address extension, string calldata baseURI) external",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function isAdmin(address account) view returns (bool)",
];

async function main() {
  console.log("Deploying HereForNow to mainnet...\n");
  console.log("Manifold Core:", MANIFOLD_CORE);

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH\n");

  // Get the Manifold core contract
  const manifoldCore = new ethers.Contract(MANIFOLD_CORE, MANIFOLD_ABI, ethers.provider);

  // Verify deployer is owner/admin
  const ownerAddress = await manifoldCore.owner();
  const isAdmin = await manifoldCore.isAdmin(deployer.address);

  console.log("Manifold owner:", ownerAddress);
  console.log("Deployer is owner:", ownerAddress === deployer.address);
  console.log("Deployer is admin:", isAdmin);

  if (ownerAddress !== deployer.address && !isAdmin) {
    console.error("\nERROR: Deployer is not owner or admin of Manifold contract!");
    console.error("The deployer must be able to call registerExtension.");
    process.exit(1);
  }

  // Deploy renderer
  console.log("\n1. Deploying HereForNowRenderer...");
  const Renderer = await ethers.getContractFactory("HereForNowRenderer");
  const renderer = await Renderer.deploy();
  await renderer.waitForDeployment();
  console.log("   Renderer deployed to:", await renderer.getAddress());
  console.log("   Tx hash:", renderer.deploymentTransaction()?.hash);

  // Deploy extension
  console.log("\n2. Deploying HereForNowExtension...");
  const Extension = await ethers.getContractFactory("HereForNowExtension");
  const extension = await Extension.deploy();
  await extension.waitForDeployment();
  console.log("   Extension deployed to:", await extension.getAddress());
  console.log("   Tx hash:", extension.deploymentTransaction()?.hash);

  // Register extension on core
  console.log("\n3. Registering extension on Manifold core...");
  const manifoldWithSigner = new ethers.Contract(MANIFOLD_CORE, MANIFOLD_ABI, deployer);
  const registerTx = await manifoldWithSigner.registerExtension(await extension.getAddress(), "");
  console.log("   Tx hash:", registerTx.hash);
  await registerTx.wait();
  console.log("   Extension registered");

  // Set renderer on extension
  console.log("\n4. Setting renderer on extension...");
  const setRendererTx = await extension.setRenderer(await renderer.getAddress());
  console.log("   Tx hash:", setRendererTx.hash);
  await setRendererTx.wait();
  console.log("   Renderer set");

  // Initialize extension (mints token)
  console.log("\n5. Initializing extension (minting token)...");
  const initTx = await extension.initialize(MANIFOLD_CORE);
  console.log("   Tx hash:", initTx.hash);
  await initTx.wait();
  const tokenId = await extension.tokenId();
  console.log("   Token ID:", tokenId.toString());

  // Verify the token URI works
  console.log("\n6. Verifying token URI...");
  const uri = await manifoldCore.tokenURI(tokenId);
  console.log("   Token URI prefix:", uri.substring(0, 50) + "...");

  console.log("\n========================================");
  console.log("Mainnet deployment complete!");
  console.log("========================================\n");
  console.log("Addresses:");
  console.log("  Manifold Core: ", MANIFOLD_CORE);
  console.log("  Renderer:      ", await renderer.getAddress());
  console.log("  Extension:     ", await extension.getAddress());
  console.log("  Token ID:      ", tokenId.toString());

  console.log("\nVerify contracts on Etherscan:");
  console.log(`  npx hardhat verify --network mainnet ${await renderer.getAddress()}`);
  console.log(`  npx hardhat verify --network mainnet ${await extension.getAddress()}`);

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
