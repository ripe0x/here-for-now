import { Address } from "viem";

// Contract addresses per network
export const CONTRACTS: Record<number, { manifoldCore: Address; extension: Address }> = {
  // Sepolia
  11155111: {
    manifoldCore: "0xA11D7EbB2404bb8CE247eaE15eF02312cC294cEc",
    extension: "0xfbFBEfA9403c226E8aa2bFE9555FaE2b3E505F10",
  },
  // Mainnet (update after deployment)
  1: {
    manifoldCore: "0x09CA1D7D0419d444AdFbb2c47FF0b2F29f29D3B2",
    extension: "0x0000000000000000000000000000000000000000",
  },
};

// Token ID minted by the extension
export const TOKEN_ID = 2n;

// Manifold Core ABI (minimal for tokenURI)
export const MANIFOLD_ABI = [
  {
    inputs: [{ name: "tokenId", type: "uint256" }],
    name: "tokenURI",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// Extension ABI
export const EXTENSION_ABI = [
  {
    inputs: [],
    name: "deposit",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [],
    name: "withdraw",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getActiveDepositors",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getTotalBalance",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;
