import { Address } from "viem";

// Contract addresses per network
export const CONTRACTS: Record<
  number,
  { manifoldCore: Address; extension: Address; renderer: Address }
> = {
  // Sepolia
  11155111: {
    manifoldCore: "0xA11D7EbB2404bb8CE247eaE15eF02312cC294cEc",
    extension: "0x1940D20527A3407ef948828f23b7Cc6E5D927B82",
    renderer: "0x7766662a22EC83cd47856493A9493E9C5Fa2660F",
  },
  // Mainnet (update after deployment)
  1: {
    manifoldCore: "0x09CA1D7D0419d444AdFbb2c47FF0b2F29f29D3B2",
    extension: "0x0000000000000000000000000000000000000000",
    renderer: "0x0000000000000000000000000000000000000000",
  },
};

// Etherscan base URLs per network
export const ETHERSCAN_URLS: Record<number, string> = {
  11155111: "https://sepolia.etherscan.io",
  1: "https://etherscan.io",
};

// Token ID minted by the extension (from env or default to 2)
export const TOKEN_ID = BigInt(process.env.NEXT_PUBLIC_TOKEN_ID || "2");

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
    name: "enter",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [],
    name: "leave",
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
    name: "getActiveParticipants",
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
