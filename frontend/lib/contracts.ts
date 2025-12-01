import { Address } from "viem";

// Mainnet contract addresses
export const CONTRACTS = {
  manifoldCore: "0x09CA1D7D0419d444AdFbb2c47FF0b2F29f29D3B2" as Address,
  extension: "0x9c3622C8BF55A0350D9cf732211726dFCB67E1C2" as Address,
  renderer: "0x3D980391A5eDA5fDbEE03c4F4A2B59CB6b0D0A18" as Address,
};

// Etherscan base URL
export const ETHERSCAN_URL = "https://etherscan.io";

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
    name: "activeParticipants",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "totalBalance",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;
