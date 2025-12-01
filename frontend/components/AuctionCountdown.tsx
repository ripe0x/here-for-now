"use client";

import { useState, useEffect } from "react";
import { usePublicClient } from "wagmi";
import { formatEther } from "viem";

const AUCTION_END = new Date("2025-12-02T18:00:00Z"); // 1pm ET = 6pm UTC
const AUCTION_URL =
  "https://superrare.com/artwork/eth/0x09CA1D7D0419d444AdFbb2c47FF0b2F29f29D3B2/2";

const SUPERRARE_BAZAAR = "0x6D7c44773C52D396F43c2D511B81aa168E9a7a42" as const;
const NFT_CONTRACT = "0x09CA1D7D0419d444AdFbb2c47FF0b2F29f29D3B2" as const;
const TOKEN_ID = 2n;

// AuctionBid event ABI from SuperRare Bazaar
const AUCTION_BID_EVENT_ABI = {
  type: "event",
  name: "AuctionBid",
  inputs: [
    { indexed: true, name: "_contractAddress", type: "address" },
    { indexed: true, name: "_bidder", type: "address" },
    { indexed: true, name: "_tokenId", type: "uint256" },
    { indexed: false, name: "_currencyAddress", type: "address" },
    { indexed: false, name: "_amount", type: "uint256" },
    { indexed: false, name: "_startedAuction", type: "bool" },
    { indexed: false, name: "_newAuctionLength", type: "uint256" },
    { indexed: false, name: "_previousBidder", type: "address" },
  ],
} as const;

export function AuctionCountdown() {
  const [timeLeft, setTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
  } | null>(null);
  const [isEnded, setIsEnded] = useState(false);
  const [currentBid, setCurrentBid] = useState<bigint | null>(null);
  const publicClient = usePublicClient();

  // Fetch current bid from events
  useEffect(() => {
    async function fetchCurrentBid() {
      if (!publicClient) return;

      try {
        const logs = await publicClient.getLogs({
          address: SUPERRARE_BAZAAR,
          event: AUCTION_BID_EVENT_ABI,
          args: {
            _contractAddress: NFT_CONTRACT,
            _tokenId: TOKEN_ID,
          },
          fromBlock: 21490000n,
          toBlock: "latest",
        });

        if (logs.length > 0) {
          const latestBid = logs[logs.length - 1];
          if (latestBid.args._amount) {
            setCurrentBid(latestBid.args._amount);
          }
        }
      } catch (error) {
        console.error("Failed to fetch bid:", error);
      }
    }

    fetchCurrentBid();
    // Poll every 30 seconds for new bids
    const interval = setInterval(fetchCurrentBid, 30000);
    return () => clearInterval(interval);
  }, [publicClient]);

  // Countdown timer
  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = new Date();
      const diff = AUCTION_END.getTime() - now.getTime();

      if (diff <= 0) {
        setIsEnded(true);
        return;
      }

      setTimeLeft({
        days: Math.floor(diff / (1000 * 60 * 60 * 24)),
        hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
        minutes: Math.floor((diff / (1000 * 60)) % 60),
        seconds: Math.floor((diff / 1000) % 60),
      });
    };

    calculateTimeLeft();
    const interval = setInterval(calculateTimeLeft, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatNum = (n: number) => n.toString().padStart(2, "0");

  if (isEnded) {
    return (
      <a
        href={AUCTION_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="flex justify-between items-center text-[12px] mb-5 py-2 px-3 border border-white/20 hover:border-white/40 transition-colors"
      >
        <span className="text-white/50">Auction</span>
        <span className="text-neutral-100">Ended</span>
      </a>
    );
  }

  if (!timeLeft) {
    return null;
  }

  return (
    <a
      href={AUCTION_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="block mb-5 py-2 px-3 border border-white/20 hover:border-white/40 transition-colors"
    >
      <p className="text-white/80 text-[12px] mt-1">
        Exhibited in{" "}
        <a
          href="https://superrare.com/curation/exhibitions/intimate-systems"
          target="_blank"
          rel="noopener noreferrer"
          className="text-neutral-100 hover:underline"
        >
          Intimate Systems
        </a>{" "}
        on{" "}
        <a
          href="https://superrare.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-neutral-100 hover:underline"
        >
          SuperRare
        </a>
      </p>
      <hr className="border-white/10 my-2" />
      <div className="flex justify-between items-center text-[12px]">
        <span className="text-white/50">Auction ends in</span>
        <span className="text-neutral-100 font-mono">
          {timeLeft.days > 0 && `${timeLeft.days}d `}
          {formatNum(timeLeft.hours)}:{formatNum(timeLeft.minutes)}:
          {formatNum(timeLeft.seconds)}
        </span>
      </div>
      {currentBid && (
        <div className="flex justify-between items-center text-[12px] mt-1">
          <span className="text-white/50">Current bid</span>
          <span className="text-neutral-100">
            {formatEther(currentBid)} ETH
          </span>
        </div>
      )}
    </a>
  );
}
