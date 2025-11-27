import { ethers } from "hardhat";

/**
 * Deploy HereForNow contracts to a local network
 * Uses a mock Manifold core for testing
 *
 * Run with: npx hardhat run scripts/deploy-local.ts --network localhost
 * (Make sure to run `npx hardhat node` first)
 */
async function main() {
  console.log("Deploying HereForNow to local network...\n");

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH\n");

  // Deploy mock core first
  console.log("1. Deploying MockERC721CreatorCore...");
  const MockCore = await ethers.getContractFactory("MockERC721CreatorCore");
  const mockCore = await MockCore.deploy();
  await mockCore.waitForDeployment();
  console.log("   MockCore deployed to:", await mockCore.getAddress());

  // Deploy renderer
  console.log("\n2. Deploying HereForNowRenderer...");
  const Renderer = await ethers.getContractFactory("HereForNowRenderer");
  const renderer = await Renderer.deploy();
  await renderer.waitForDeployment();
  console.log("   Renderer deployed to:", await renderer.getAddress());

  // Deploy extension
  console.log("\n3. Deploying HereForNowExtension...");
  const Extension = await ethers.getContractFactory("HereForNowExtension");
  const extension = await Extension.deploy();
  await extension.waitForDeployment();
  console.log("   Extension deployed to:", await extension.getAddress());

  // Register extension on core
  console.log("\n4. Registering extension on core...");
  await mockCore.registerExtension(await extension.getAddress(), "");
  console.log("   Extension registered");

  // Set renderer on extension
  console.log("\n5. Setting renderer on extension...");
  await extension.setRenderer(await renderer.getAddress());
  console.log("   Renderer set");

  // Initialize extension (mints token)
  console.log("\n6. Initializing extension (minting token)...");
  await extension.initialize(await mockCore.getAddress());
  const tokenId = await extension.tokenId();
  console.log("   Token ID:", tokenId.toString());

  // Verify setup
  console.log("\n7. Verifying setup...");
  const owner = await mockCore.ownerOf(tokenId);
  console.log("   Token owner:", owner);

  console.log("\n========================================");
  console.log("Deployment complete!");
  console.log("========================================\n");
  console.log("Addresses:");
  console.log("  MockCore:  ", await mockCore.getAddress());
  console.log("  Renderer:  ", await renderer.getAddress());
  console.log("  Extension: ", await extension.getAddress());
  console.log("  Token ID:  ", tokenId.toString());

  return {
    mockCore: await mockCore.getAddress(),
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
