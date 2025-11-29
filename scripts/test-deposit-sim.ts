import { ethers } from "hardhat";

async function main() {
  const userAddress = "0xCB43078C32423F5348Cab5885911C3B5faE217F9";
  const extensionAddress = "0xfbFBEfA9403c226E8aa2bFE9555FaE2b3E505F10";
  const depositAmount = ethers.parseEther("0.01");

  console.log("Testing deposit simulation...");
  console.log("From:", userAddress);
  console.log("To:", extensionAddress);
  console.log("Value:", ethers.formatEther(depositAmount), "ETH");

  try {
    const gasEstimate = await ethers.provider.estimateGas({
      to: extensionAddress,
      from: userAddress,
      data: "0xd0e30db0", // deposit() selector
      value: depositAmount,
    });
    console.log("\n✓ Simulation SUCCESS");
    console.log("Gas estimate:", gasEstimate.toString());
  } catch (e: any) {
    console.log("\n✗ Simulation FAILED");
    console.log("Error:", e.message);
    if (e.info?.error?.message) {
      console.log("Revert reason:", e.info.error.message);
    }
  }
}

main().catch(console.error);
