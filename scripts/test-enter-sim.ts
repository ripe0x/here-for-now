import { ethers } from "hardhat";

async function main() {
  const userAddress = "0xCB43078C32423F5348Cab5885911C3B5faE217F9";
  const extensionAddress = "0xfbFBEfA9403c226E8aa2bFE9555FaE2b3E505F10";
  const enterAmount = ethers.parseEther("0.01");

  console.log("Testing enter simulation...");
  console.log("From:", userAddress);
  console.log("To:", extensionAddress);
  console.log("Value:", ethers.formatEther(enterAmount), "ETH");

  try {
    const gasEstimate = await ethers.provider.estimateGas({
      to: extensionAddress,
      from: userAddress,
      data: "0xe97dcb62", // enter() selector
      value: enterAmount,
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
