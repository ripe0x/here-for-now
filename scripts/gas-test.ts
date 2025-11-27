import { ethers } from "hardhat";

/**
 * Test gas usage for generateSVG at various depositor counts
 * Run with: npx hardhat run scripts/gas-test.ts
 */
async function main() {
  console.log("Testing gas usage for generateSVG...\n");

  const Renderer = await ethers.getContractFactory("HereForNowRenderer");
  const renderer = await Renderer.deploy();
  await renderer.waitForDeployment();

  const testCounts = [0, 10, 50, 100, 200, 300, 400, 500, 598, 700, 800, 1000, 1500, 2000];

  console.log("Depositors | Lines | Gas Used    | SVG Size | Status");
  console.log("-----------|-------|-------------|----------|--------");

  for (const count of testCounts) {
    try {
      // Estimate gas for the call
      const gasEstimate = await renderer.generateSVG.estimateGas(count);

      // Actually call it to get the SVG size
      const svg = await renderer.generateSVG(count);
      const svgSize = Buffer.from(svg).length;

      console.log(
        `${count.toString().padStart(10)} | ${(count + 2).toString().padStart(5)} | ${gasEstimate.toString().padStart(11)} | ${(svgSize / 1024).toFixed(1).padStart(6)}KB | OK`
      );
    } catch (error: any) {
      console.log(
        `${count.toString().padStart(10)} | ${(count + 2).toString().padStart(5)} | ${"FAILED".padStart(11)} | ${"N/A".padStart(8)} | ${error.message?.slice(0, 30) || "Error"}`
      );

      // If we failed, try to find the exact limit with binary search
      if (count > 100) {
        console.log("\n  Binary searching for exact limit...");
        const limit = await findLimit(renderer, testCounts[testCounts.indexOf(count) - 1], count);
        console.log(`  Maximum safe depositors: ~${limit}\n`);
        break;
      }
    }
  }
}

async function findLimit(renderer: any, low: number, high: number): Promise<number> {
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    try {
      await renderer.generateSVG.estimateGas(mid);
      low = mid;
    } catch {
      high = mid;
    }
  }
  return low;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
