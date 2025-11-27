import { expect } from "chai";
import { ethers } from "hardhat";
import { HereForNowExtension, HereForNowRenderer, MockERC721CreatorCore } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("HereForNow", function () {
  let extension: HereForNowExtension;
  let renderer: HereForNowRenderer;
  let mockCore: MockERC721CreatorCore;
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let charlie: SignerWithAddress;

  beforeEach(async function () {
    [owner, alice, bob, charlie] = await ethers.getSigners();

    // Deploy mock core
    const MockCore = await ethers.getContractFactory("MockERC721CreatorCore");
    mockCore = await MockCore.deploy();

    // Deploy renderer
    const Renderer = await ethers.getContractFactory("HereForNowRenderer");
    renderer = await Renderer.deploy();

    // Deploy extension
    const Extension = await ethers.getContractFactory("HereForNowExtension");
    extension = await Extension.deploy();

    // Register extension on mock core
    await mockCore.registerExtension(await extension.getAddress(), "");

    // Set renderer on extension
    await extension.setRenderer(await renderer.getAddress());

    // Initialize extension (this mints the token)
    await extension.initialize(await mockCore.getAddress());
  });

  describe("Initialization", function () {
    it("should initialize correctly with core address", async function () {
      expect(await extension.core()).to.equal(await mockCore.getAddress());
      expect(await extension.initialized()).to.be.true;
    });

    it("should mint token ID 2 on initialization", async function () {
      // Token 1 was minted in MockCore constructor
      // Token 2 should be minted by the extension
      expect(await extension.tokenId()).to.equal(2);
    });

    it("should not allow double initialization", async function () {
      await expect(
        extension.initialize(await mockCore.getAddress())
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

  describe("Deposits", function () {
    it("should accept ETH deposits", async function () {
      const depositAmount = ethers.parseEther("1");

      await expect(extension.connect(alice).deposit({ value: depositAmount }))
        .to.emit(extension, "Deposited")
        .withArgs(alice.address, depositAmount, depositAmount);

      expect(await extension.balanceOf(alice.address)).to.equal(depositAmount);
      expect(await extension.totalBalance()).to.equal(depositAmount);
      expect(await extension.activeDepositors()).to.equal(1);
    });

    it("should track multiple deposits from same address", async function () {
      const deposit1 = ethers.parseEther("1");
      const deposit2 = ethers.parseEther("0.5");

      await extension.connect(alice).deposit({ value: deposit1 });
      await extension.connect(alice).deposit({ value: deposit2 });

      expect(await extension.balanceOf(alice.address)).to.equal(deposit1 + deposit2);
      expect(await extension.totalBalance()).to.equal(deposit1 + deposit2);
      // Should still be 1 active depositor
      expect(await extension.activeDepositors()).to.equal(1);
    });

    it("should track multiple depositors correctly", async function () {
      await extension.connect(alice).deposit({ value: ethers.parseEther("1") });
      await extension.connect(bob).deposit({ value: ethers.parseEther("2") });
      await extension.connect(charlie).deposit({ value: ethers.parseEther("0.5") });

      expect(await extension.activeDepositors()).to.equal(3);
      expect(await extension.totalBalance()).to.equal(ethers.parseEther("3.5"));
    });

    it("should reject zero deposits", async function () {
      await expect(
        extension.connect(alice).deposit({ value: 0 })
      ).to.be.revertedWithCustomError(extension, "ZeroDeposit");
    });

    it("should reject direct ETH transfers", async function () {
      await expect(
        alice.sendTransaction({
          to: await extension.getAddress(),
          value: ethers.parseEther("1"),
        })
      ).to.be.revertedWithCustomError(extension, "DirectTransferNotAllowed");
    });
  });

  describe("Withdrawals", function () {
    beforeEach(async function () {
      await extension.connect(alice).deposit({ value: ethers.parseEther("2") });
      await extension.connect(bob).deposit({ value: ethers.parseEther("1") });
    });

    it("should allow full withdrawal", async function () {
      const balanceBefore = await ethers.provider.getBalance(alice.address);

      const tx = await extension.connect(alice).withdraw();
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;

      const balanceAfter = await ethers.provider.getBalance(alice.address);

      // Alice should have received her 2 ETH back (minus gas)
      expect(balanceAfter).to.equal(balanceBefore + ethers.parseEther("2") - gasUsed);
      expect(await extension.balanceOf(alice.address)).to.equal(0);
      expect(await extension.activeDepositors()).to.equal(1); // Bob still present
      expect(await extension.totalBalance()).to.equal(ethers.parseEther("1"));
    });

    it("should emit Withdrawn event", async function () {
      await expect(extension.connect(alice).withdraw())
        .to.emit(extension, "Withdrawn")
        .withArgs(alice.address, ethers.parseEther("2"));
    });

    it("should reject withdrawal with no balance", async function () {
      await expect(
        extension.connect(charlie).withdraw()
      ).to.be.revertedWithCustomError(extension, "NoBalance");
    });

    it("should allow re-deposit after withdrawal", async function () {
      await extension.connect(alice).withdraw();
      expect(await extension.activeDepositors()).to.equal(1);

      await extension.connect(alice).deposit({ value: ethers.parseEther("0.5") });
      expect(await extension.activeDepositors()).to.equal(2);
      expect(await extension.balanceOf(alice.address)).to.equal(ethers.parseEther("0.5"));
    });
  });

  describe("View Functions", function () {
    beforeEach(async function () {
      await extension.connect(alice).deposit({ value: ethers.parseEther("1") });
      await extension.connect(bob).deposit({ value: ethers.parseEther("2") });
    });

    it("should return correct balance for address", async function () {
      expect(await extension.getBalance(alice.address)).to.equal(ethers.parseEther("1"));
      expect(await extension.getBalance(bob.address)).to.equal(ethers.parseEther("2"));
      expect(await extension.getBalance(charlie.address)).to.equal(0);
    });

    it("should return correct total balance", async function () {
      expect(await extension.getTotalBalance()).to.equal(ethers.parseEther("3"));
    });

    it("should return correct active depositor count", async function () {
      expect(await extension.getActiveDepositors()).to.equal(2);
    });

    it("should correctly report presence", async function () {
      expect(await extension.isPresent(alice.address)).to.be.true;
      expect(await extension.isPresent(bob.address)).to.be.true;
      expect(await extension.isPresent(charlie.address)).to.be.false;
    });
  });

  describe("Renderer", function () {
    it("should have correct default metadata", async function () {
      expect(await renderer.name()).to.equal("Here, For Now");
      expect(await renderer.description()).to.include("programmable money");
    });

    it("should allow owner to update metadata", async function () {
      await renderer.setMetadata("New Name", "New Description");
      expect(await renderer.name()).to.equal("New Name");
      expect(await renderer.description()).to.equal("New Description");
    });

    it("should not allow non-owner to update metadata", async function () {
      await expect(
        renderer.connect(alice).setMetadata("Hack", "Hacked")
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("should generate SVG with correct number of lines", async function () {
      // 0 depositors = 2 lines (top + bottom)
      let svg = await renderer.generateSVG(0);
      expect((svg.match(/<use/g) || []).length).to.equal(2);

      // 1 depositor = 3 lines
      svg = await renderer.generateSVG(1);
      expect((svg.match(/<use/g) || []).length).to.equal(3);

      // 5 depositors = 7 lines
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

  describe("Token URI", function () {
    it("should return valid token URI through extension", async function () {
      await extension.connect(alice).deposit({ value: ethers.parseEther("1") });

      const uri = await mockCore.tokenURI(2);
      expect(uri).to.include("data:application/json;base64,");
    });

    it("should include correct metadata in token URI", async function () {
      await extension.connect(alice).deposit({ value: ethers.parseEther("1.5") });
      await extension.connect(bob).deposit({ value: ethers.parseEther("0.5") });

      const uri = await mockCore.tokenURI(2);

      // Decode base64 JSON
      const base64Json = uri.replace("data:application/json;base64,", "");
      const json = JSON.parse(Buffer.from(base64Json, "base64").toString());

      expect(json.name).to.equal("Here, For Now");
      expect(json.description).to.include("programmable money");
      expect(json.image).to.include("data:image/svg+xml;base64,");

      // Check attributes
      const depositorAttr = json.attributes.find(
        (a: { trait_type: string }) => a.trait_type === "Present Depositors"
      );
      expect(depositorAttr.value).to.equal(2);

      const balanceAttr = json.attributes.find(
        (a: { trait_type: string }) => a.trait_type === "Total ETH Held"
      );
      expect(balanceAttr.value).to.equal("2.0000 ETH");
    });

    it("should reject tokenURI for wrong core", async function () {
      await expect(
        extension.tokenURI(alice.address, 2)
      ).to.be.revertedWithCustomError(extension, "InvalidCore");
    });

    it("should reject tokenURI for wrong token ID", async function () {
      await expect(
        extension.tokenURI(await mockCore.getAddress(), 1)
      ).to.be.revertedWithCustomError(extension, "InvalidTokenId");
    });
  });

  describe("SVG via Extension", function () {
    it("should return SVG through extension", async function () {
      await extension.connect(alice).deposit({ value: ethers.parseEther("1") });

      const svg = await extension.svg();
      expect(svg).to.include("<svg");
      expect(svg).to.include("</svg>");
      expect((svg.match(/<use/g) || []).length).to.equal(3); // 1 depositor = 3 lines
    });
  });

  describe("Admin Functions", function () {
    it("should allow admin to update renderer", async function () {
      const newRenderer = await (
        await ethers.getContractFactory("HereForNowRenderer")
      ).deploy();

      await expect(extension.setRenderer(await newRenderer.getAddress()))
        .to.emit(extension, "RendererUpdated")
        .withArgs(await newRenderer.getAddress());

      expect(await extension.renderer()).to.equal(await newRenderer.getAddress());
    });

    it("should not allow non-admin to update renderer", async function () {
      const newRenderer = await (
        await ethers.getContractFactory("HereForNowRenderer")
      ).deploy();

      await expect(
        extension.connect(alice).setRenderer(await newRenderer.getAddress())
      ).to.be.reverted;
    });
  });

  describe("Edge Cases", function () {
    it("should handle many depositors", async function () {
      const signers = await ethers.getSigners();
      const depositAmount = ethers.parseEther("0.01");

      // Deposit from 10 accounts
      for (let i = 0; i < 10; i++) {
        await extension.connect(signers[i]).deposit({ value: depositAmount });
      }

      expect(await extension.activeDepositors()).to.equal(10);

      // Generate SVG with 10 depositors
      const svg = await extension.svg();
      expect((svg.match(/<use/g) || []).length).to.equal(12); // 10 + 2 = 12 lines
    });

    it("should handle deposit and withdraw in same block", async function () {
      await extension.connect(alice).deposit({ value: ethers.parseEther("1") });
      await extension.connect(alice).withdraw();

      expect(await extension.balanceOf(alice.address)).to.equal(0);
      expect(await extension.activeDepositors()).to.equal(0);
    });
  });
});
