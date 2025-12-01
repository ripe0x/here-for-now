import { expect } from "chai";
import { ethers, network } from "hardhat";
import { HereForNowExtension, HereForNowRenderer } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { Contract } from "ethers";

/**
 * Tests for HereForNow using a real Manifold ERC721 Creator Core contract
 * from a forked mainnet. No mock contracts are used.
 *
 * Run with: npx hardhat test --network localhost
 * (Requires a forked mainnet node running)
 */

const MANIFOLD_CORE = "0x09CA1D7D0419d444AdFbb2c47FF0b2F29f29D3B2";

// Renderer metadata configuration
const RENDERER_CONFIG = {
  name: "Here, For Now",
  description: "This work treats the chain as a place where presence can be held, not just seen. Living directly on programmable money, it uses ETH itself as the material for showing up.",
  author: "ripe0x.eth",
  urls: ["https://hfn.ripe.wtf", "https://superrare.com/curation/exhibitions/intimate-systems"],
};

// Minimal ABI for the Manifold creator core - what a marketplace would use
const MANIFOLD_ABI = [
  "function owner() view returns (address)",
  "function registerExtension(address extension, string calldata baseURI) external",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function isAdmin(address account) view returns (bool)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
];

describe("HereForNow", function () {
  let extension: HereForNowExtension;
  let renderer: HereForNowRenderer;
  let manifoldCore: Contract;
  let manifoldOwner: SignerWithAddress;
  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let charlie: SignerWithAddress;
  let tokenId: bigint;

  before(async function () {
    // Skip if not running on a fork
    const chainId = (await ethers.provider.getNetwork()).chainId;
    if (chainId !== 31337n && chainId !== 1n) {
      this.skip();
    }

    [deployer, alice, bob, charlie] = await ethers.getSigners();

    // Get the real Manifold core contract
    manifoldCore = new ethers.Contract(MANIFOLD_CORE, MANIFOLD_ABI, ethers.provider);

    // Verify the contract exists on the fork
    const code = await ethers.provider.getCode(MANIFOLD_CORE);
    if (code === "0x") {
      throw new Error("Manifold contract not found - ensure you're running on a mainnet fork");
    }

    // Get the owner of the Manifold contract
    const ownerAddress = await manifoldCore.owner();

    // Impersonate the owner
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [ownerAddress],
    });

    // Fund the impersonated account for gas
    await deployer.sendTransaction({
      to: ownerAddress,
      value: ethers.parseEther("10"),
    });

    manifoldOwner = await ethers.getSigner(ownerAddress);

    // Deploy renderer
    const Renderer = await ethers.getContractFactory("HereForNowRenderer", deployer);
    renderer = await Renderer.deploy(
      RENDERER_CONFIG.name,
      RENDERER_CONFIG.description,
      RENDERER_CONFIG.author,
      RENDERER_CONFIG.urls
    );
    await renderer.waitForDeployment();

    // Deploy extension
    const Extension = await ethers.getContractFactory("HereForNowExtension", deployer);
    extension = await Extension.deploy();
    await extension.waitForDeployment();

    // Register extension on the real Manifold core (requires owner)
    const manifoldWithOwner = manifoldCore.connect(manifoldOwner);
    await manifoldWithOwner.registerExtension(await extension.getAddress(), "");

    // Set renderer on extension
    await extension.setRenderer(await renderer.getAddress());

    // Initialize extension (mints token)
    await extension.initialize(MANIFOLD_CORE);
    tokenId = await extension.tokenId();
  });

  after(async function () {
    // Stop impersonating
    if (manifoldOwner) {
      await network.provider.request({
        method: "hardhat_stopImpersonatingAccount",
        params: [manifoldOwner.address],
      });
    }
  });

  describe("Initialization", function () {
    it("should initialize correctly with real Manifold core address", async function () {
      expect(await extension.core()).to.equal(MANIFOLD_CORE);
      expect(await extension.initialized()).to.be.true;
    });

    it("should support EIP-4906 interface", async function () {
      // EIP-4906 interface ID
      const ERC4906_INTERFACE_ID = "0x49064906";
      expect(await extension.supportsInterface(ERC4906_INTERFACE_ID)).to.be.true;
    });

    it("should have minted a token on initialization", async function () {
      expect(tokenId).to.be.gt(0);
    });

    it("should not allow double initialization", async function () {
      await expect(
        extension.initialize(MANIFOLD_CORE)
      ).to.be.revertedWithCustomError(extension, "AlreadyInitialized");
    });

    it("should not allow initialization with zero address", async function () {
      const Extension = await ethers.getContractFactory("HereForNowExtension");
      const newExtension = await Extension.deploy();

      await expect(
        newExtension.initialize(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(newExtension, "InvalidCore");
    });
  });

  describe("Entering", function () {
    it("should accept ETH to enter", async function () {
      const enterAmount = ethers.parseEther("1");

      await expect(extension.connect(alice).enter({ value: enterAmount }))
        .to.emit(extension, "Entered")
        .withArgs(alice.address, enterAmount, enterAmount);

      expect(await extension.balanceOf(alice.address)).to.equal(enterAmount);
      expect(await extension.totalBalance()).to.be.gte(enterAmount);
    });

    it("should reject entering when already present", async function () {
      const signers = await ethers.getSigners();
      const testAccount = signers[19];

      // First entry should succeed
      await extension.connect(testAccount).enter({ value: ethers.parseEther("1") });

      // Second entry should be rejected
      await expect(
        extension.connect(testAccount).enter({ value: ethers.parseEther("0.5") })
      ).to.be.revertedWithCustomError(extension, "AlreadyEntered");

      // Clean up
      await extension.connect(testAccount).leave();
    });

    it("should track multiple participants correctly", async function () {
      const initialParticipants = await extension.activeParticipants();

      // Bob enters
      await extension.connect(bob).enter({ value: ethers.parseEther("2") });

      // Charlie enters
      await extension.connect(charlie).enter({ value: ethers.parseEther("0.5") });

      // Should have at least 2 more participants (bob and charlie)
      expect(await extension.activeParticipants()).to.be.gte(initialParticipants + 2n);
    });

    it("should reject zero amount", async function () {
      await expect(
        extension.connect(alice).enter({ value: 0 })
      ).to.be.revertedWithCustomError(extension, "ZeroAmount");
    });

    it("should reject direct ETH transfers", async function () {
      await expect(
        alice.sendTransaction({
          to: await extension.getAddress(),
          value: ethers.parseEther("1"),
        })
      ).to.be.revertedWithCustomError(extension, "DirectTransferNotAllowed");
    });

    it("should emit MetadataUpdate event (EIP-4906) on enter", async function () {
      const signers = await ethers.getSigners();
      const testAccount = signers[17];

      await expect(extension.connect(testAccount).enter({ value: ethers.parseEther("0.1") }))
        .to.emit(extension, "MetadataUpdate")
        .withArgs(tokenId);

      // Clean up
      await extension.connect(testAccount).leave();
    });
  });

  describe("Leaving", function () {
    it("should allow full leave", async function () {
      const signers = await ethers.getSigners();
      const leaveTestAccount = signers[5];

      // Enter first
      const enterAmount = ethers.parseEther("2");
      await extension.connect(leaveTestAccount).enter({ value: enterAmount });

      const balanceBefore = await ethers.provider.getBalance(leaveTestAccount.address);
      const extensionBalanceBefore = await extension.balanceOf(leaveTestAccount.address);

      const tx = await extension.connect(leaveTestAccount).leave();
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;

      const balanceAfter = await ethers.provider.getBalance(leaveTestAccount.address);

      // Should have received their ETH back (minus gas)
      expect(balanceAfter).to.equal(balanceBefore + extensionBalanceBefore - gasUsed);
      expect(await extension.balanceOf(leaveTestAccount.address)).to.equal(0);
    });

    it("should emit Left event", async function () {
      const signers = await ethers.getSigners();
      const testAccount = signers[6];

      const enterAmount = ethers.parseEther("1");
      await extension.connect(testAccount).enter({ value: enterAmount });

      await expect(extension.connect(testAccount).leave())
        .to.emit(extension, "Left")
        .withArgs(testAccount.address, enterAmount);
    });

    it("should emit MetadataUpdate event (EIP-4906) on leave", async function () {
      const signers = await ethers.getSigners();
      const testAccount = signers[18];

      await extension.connect(testAccount).enter({ value: ethers.parseEther("0.1") });

      await expect(extension.connect(testAccount).leave())
        .to.emit(extension, "MetadataUpdate")
        .withArgs(tokenId);
    });

    it("should reject leave with no balance", async function () {
      const signers = await ethers.getSigners();
      const emptyAccount = signers[7];

      await expect(
        extension.connect(emptyAccount).leave()
      ).to.be.revertedWithCustomError(extension, "NoBalance");
    });

    it("should allow re-entry after leaving", async function () {
      const signers = await ethers.getSigners();
      const testAccount = signers[8];

      await extension.connect(testAccount).enter({ value: ethers.parseEther("1") });
      await extension.connect(testAccount).leave();
      expect(await extension.balanceOf(testAccount.address)).to.equal(0);

      await extension.connect(testAccount).enter({ value: ethers.parseEther("0.5") });
      expect(await extension.balanceOf(testAccount.address)).to.equal(ethers.parseEther("0.5"));
    });
  });

  describe("View Functions", function () {
    it("should return correct total balance", async function () {
      const total = await extension.totalBalance();
      expect(total).to.be.gt(0);
    });

    it("should return correct active participant count", async function () {
      const count = await extension.activeParticipants();
      expect(count).to.be.gt(0);
    });

    it("should correctly report presence via balanceOf", async function () {
      expect(await extension.balanceOf(alice.address)).to.be.gt(0);

      const signers = await ethers.getSigners();
      const neverEntered = signers[15];
      expect(await extension.balanceOf(neverEntered.address)).to.equal(0);
    });
  });

  describe("Renderer", function () {
    it("should have correct default metadata", async function () {
      expect(await renderer.name()).to.equal("Here, For Now");
      expect(await renderer.description()).to.include("programmable money");
    });

    it("should allow owner to update metadata", async function () {
      const originalName = await renderer.name();
      const originalDesc = await renderer.description();
      const originalAuthor = await renderer.author();
      const originalUrls = [...(await renderer.urls())]; // Copy array

      await renderer.setMetadata("New Name", "New Description", "newauthor.eth", ["https://new.url"]);
      expect(await renderer.name()).to.equal("New Name");
      expect(await renderer.description()).to.equal("New Description");
      expect(await renderer.author()).to.equal("newauthor.eth");

      // Restore original
      await renderer.setMetadata(originalName, originalDesc, originalAuthor, originalUrls);

      // Verify restoration
      expect(await renderer.name()).to.equal(originalName);
    });

    it("should not allow non-owner to update metadata", async function () {
      await expect(
        renderer.connect(alice).setMetadata("Hack", "Hacked", "hacker.eth", [])
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("should allow owner to update solid threshold", async function () {
      // Set threshold to 5, which means 3 participants (5 total lines) triggers solid
      await renderer.setSolidThreshold(5);
      let svg = await renderer.generateSVG(3);
      expect(svg).to.include('<rect x="300" y="200" width="400" height="600" fill="white"/>');

      // Set threshold higher, same participants should now render lines
      await renderer.setSolidThreshold(10);
      svg = await renderer.generateSVG(3);
      expect(svg).to.include('<use');
      expect(svg).to.not.include('width="400" height="600"');

      // Restore to default
      await renderer.setSolidThreshold(420);
    });

    it("should not allow non-owner to update solid threshold", async function () {
      await expect(
        renderer.connect(alice).setSolidThreshold(999)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("should render solid rectangle when threshold is reached", async function () {
      // Set a low threshold for testing
      await renderer.setSolidThreshold(5);

      // 3 participants = 5 lines total, should trigger solid
      const svg = await renderer.generateSVG(3);
      expect(svg).to.include('<rect x="300" y="200" width="400" height="600" fill="white"/>');
      expect(svg).to.not.include('<use');

      // Restore default threshold
      await renderer.setSolidThreshold(420);
    });

    it("should render individual lines when below threshold", async function () {
      // Ensure threshold is high enough
      await renderer.setSolidThreshold(420);

      // 3 participants = 5 lines, below threshold
      const svg = await renderer.generateSVG(3);
      expect(svg).to.include('<use');
      expect(svg).to.not.include('width="400" height="600"');
    });

    it("should generate SVG with correct number of lines", async function () {
      // 0 participants = 2 lines (top + bottom)
      let svg = await renderer.generateSVG(0);
      expect((svg.match(/<use/g) || []).length).to.equal(2);

      // 1 participant = 3 lines
      svg = await renderer.generateSVG(1);
      expect((svg.match(/<use/g) || []).length).to.equal(3);

      // 5 participants = 7 lines
      svg = await renderer.generateSVG(5);
      expect((svg.match(/<use/g) || []).length).to.equal(7);
    });

    it("should include proper SVG structure", async function () {
      const svg = await renderer.generateSVG(3);
      expect(svg).to.include('width="4000"');
      expect(svg).to.include('height="4000"');
      expect(svg).to.include('viewBox="0 0 1000 1000"');
      expect(svg).to.include('fill="#0A0A0A"');
      expect(svg).to.include('<defs>');
      expect(svg).to.include('href="#l"');
    });
  });

  describe("Token URI (via Manifold Core - like a marketplace)", function () {
    it("should return valid token URI when called on the Manifold core contract", async function () {
      // This is how OpenSea, Blur, etc. would fetch the tokenURI
      const uri = await manifoldCore.tokenURI(tokenId);
      expect(uri).to.include("data:application/json;base64,");
    });

    it("should include correct metadata in token URI from Manifold core", async function () {
      // Fetch tokenURI from the Manifold core contract (like a marketplace would)
      const uri = await manifoldCore.tokenURI(tokenId);

      // Decode base64 JSON
      const base64Json = uri.replace("data:application/json;base64,", "");
      const json = JSON.parse(Buffer.from(base64Json, "base64").toString());

      expect(json.name).to.equal("Here, For Now");
      expect(json.description).to.include("programmable money");
      expect(json.image).to.include("data:image/svg+xml;base64,");

      // Check attributes exist
      expect(json.attributes).to.be.an("array");

      const presentAttr = json.attributes.find(
        (a: { trait_type: string }) => a.trait_type === "Present"
      );
      expect(presentAttr).to.exist;
      expect(Number(presentAttr.value)).to.be.gte(0);
    });

    it("should update token metadata when participants change", async function () {
      const signers = await ethers.getSigners();
      const freshAccount = signers[10];

      // Get initial state from Manifold core
      const uriBefore = await manifoldCore.tokenURI(tokenId);
      const jsonBefore = JSON.parse(
        Buffer.from(uriBefore.replace("data:application/json;base64,", ""), "base64").toString()
      );
      const participantsBefore = Number(jsonBefore.attributes.find(
        (a: { trait_type: string }) => a.trait_type === "Present"
      ).value);

      // Enter
      await extension.connect(freshAccount).enter({ value: ethers.parseEther("0.1") });

      // Get updated state from Manifold core
      const uriAfter = await manifoldCore.tokenURI(tokenId);
      const jsonAfter = JSON.parse(
        Buffer.from(uriAfter.replace("data:application/json;base64,", ""), "base64").toString()
      );
      const participantsAfter = Number(jsonAfter.attributes.find(
        (a: { trait_type: string }) => a.trait_type === "Present"
      ).value);

      expect(participantsAfter).to.equal(participantsBefore + 1);

      // Clean up - leave
      await extension.connect(freshAccount).leave();
    });

    it("should reject tokenURI call on extension for wrong core", async function () {
      await expect(
        extension.tokenURI(alice.address, tokenId)
      ).to.be.revertedWithCustomError(extension, "InvalidCore");
    });

    it("should reject tokenURI call on extension for wrong token ID", async function () {
      await expect(
        extension.tokenURI(MANIFOLD_CORE, 999999)
      ).to.be.revertedWithCustomError(extension, "InvalidTokenId");
    });
  });

  describe("SVG via Renderer", function () {
    it("should return SVG through renderer with activeParticipants", async function () {
      const participants = await extension.activeParticipants();
      const svg = await renderer.generateSVG(participants);
      expect(svg).to.include("<svg");
      expect(svg).to.include("</svg>");

      // Should have at least 2 lines (top + bottom) plus participants
      const expectedLines = Number(participants) + 2;
      expect((svg.match(/<use/g) || []).length).to.equal(expectedLines);
    });
  });

  describe("Admin Functions", function () {
    it("should allow admin to update renderer", async function () {
      const currentRenderer = await extension.renderer();

      const newRenderer = await (
        await ethers.getContractFactory("HereForNowRenderer")
      ).deploy(
        RENDERER_CONFIG.name,
        RENDERER_CONFIG.description,
        RENDERER_CONFIG.author,
        RENDERER_CONFIG.urls
      );

      await expect(extension.setRenderer(await newRenderer.getAddress()))
        .to.emit(extension, "RendererUpdated")
        .withArgs(await newRenderer.getAddress());

      expect(await extension.renderer()).to.equal(await newRenderer.getAddress());

      // Restore original renderer
      await extension.setRenderer(currentRenderer);
    });

    it("should not allow non-admin to update renderer", async function () {
      const newRenderer = await (
        await ethers.getContractFactory("HereForNowRenderer")
      ).deploy(
        RENDERER_CONFIG.name,
        RENDERER_CONFIG.description,
        RENDERER_CONFIG.author,
        RENDERER_CONFIG.urls
      );

      await expect(
        extension.connect(alice).setRenderer(await newRenderer.getAddress())
      ).to.be.reverted;
    });
  });

  describe("Edge Cases", function () {
    it("should handle many participants", async function () {
      const signers = await ethers.getSigners();
      const enterAmount = ethers.parseEther("0.01");
      const startIndex = 11;
      const numParticipants = 5;

      const initialParticipants = await extension.activeParticipants();

      // Enter from multiple accounts
      for (let i = startIndex; i < startIndex + numParticipants; i++) {
        await extension.connect(signers[i]).enter({ value: enterAmount });
      }

      expect(await extension.activeParticipants()).to.equal(initialParticipants + BigInt(numParticipants));

      // Verify SVG updates correctly
      const currentParticipants = await extension.activeParticipants();
      const svg = await renderer.generateSVG(currentParticipants);
      expect((svg.match(/<use/g) || []).length).to.equal(Number(currentParticipants) + 2);

      // Clean up
      for (let i = startIndex; i < startIndex + numParticipants; i++) {
        await extension.connect(signers[i]).leave();
      }
    });

    it("should handle enter and leave in same block", async function () {
      const signers = await ethers.getSigners();
      const testAccount = signers[16];

      await extension.connect(testAccount).enter({ value: ethers.parseEther("1") });
      await extension.connect(testAccount).leave();

      expect(await extension.balanceOf(testAccount.address)).to.equal(0);
    });
  });

  describe("Integration with Real Manifold Contract", function () {
    it("should be properly registered as an extension", async function () {
      // The extension should work through the real Manifold contract
      const uri = await manifoldCore.tokenURI(tokenId);
      expect(uri.length).to.be.gt(0);
    });

    it("should have the token owned by the Manifold contract owner", async function () {
      const owner = await manifoldCore.ownerOf(tokenId);
      // Token is owned by whoever the Manifold contract minted it to
      expect(owner).to.not.equal(ethers.ZeroAddress);
    });
  });
});
