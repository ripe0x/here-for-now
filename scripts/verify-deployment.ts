import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Verify deployment on any network
 * Reads from deployment-{network}.json
 *
 * Usage:
 *   npx hardhat run scripts/verify-deployment.ts --network sepolia
 *   npx hardhat run scripts/verify-deployment.ts --network mainnet
 *   npx hardhat run scripts/verify-deployment.ts --network hardhat
 */

interface DeploymentInfo {
  manifoldCore: string;
  extension: string;
  tokenId: string;
}

function loadDeployment(): DeploymentInfo {
  const file = path.join(__dirname, "..", `deployment-${network.name}.json`);
  if (!fs.existsSync(file)) {
    throw new Error(`Deployment file not found: ${file}\nRun deploy script first.`);
  }
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

async function main() {
  const deployment = loadDeployment();
  const { manifoldCore, extension, tokenId } = deployment;

  const core = new ethers.Contract(manifoldCore, [
    "function tokenURI(uint256) view returns (string)",
    "function ownerOf(uint256) view returns (address)",
    "function getExtensions() view returns (address[])",
  ], ethers.provider);

  console.log(`Verifying ${network.name} deployment...\n`);
  console.log("Manifold Core:", manifoldCore);
  console.log("Extension:", extension);
  console.log("Token ID:", tokenId);
  console.log("");

  // Check token owner
  try {
    const owner = await core.ownerOf(tokenId);
    console.log("✓ Token", tokenId, "exists, owner:", owner);
  } catch (e: any) {
    console.log("✗ Token does not exist:", e.message);
  }

  // Check extensions
  try {
    const extensions = await core.getExtensions();
    const registered = extensions.map((e: string) => e.toLowerCase()).includes(extension.toLowerCase());
    console.log("✓ Extension registered:", registered);
    console.log("  All extensions:", extensions);
  } catch (e: any) {
    console.log("✗ Could not get extensions:", e.message);
  }

  // Check token URI
  try {
    const uri = await core.tokenURI(tokenId);
    console.log("✓ Token URI works, length:", uri.length, "chars");

    // Decode and show metadata
    if (uri.startsWith("data:application/json;base64,")) {
      const json = JSON.parse(Buffer.from(uri.slice(29), "base64").toString());
      console.log("  Name:", json.name);
      console.log("  Attributes:", json.attributes?.map((a: any) => `${a.trait_type}: ${a.value}`).join(", "));
    }
  } catch (e: any) {
    console.log("✗ Token URI failed:", e.message);
  }
}

main().catch(console.error);
