"use client";

import { useEffect, useState } from "react";
import { formatEther, Address } from "viem";
import { usePublicClient } from "wagmi";
import { CONTRACTS, ETHERSCAN_URL } from "@/lib/contracts";

interface TxEvent {
  type: "enter" | "leave";
  participant: Address;
  amount: bigint;
  timestamp: number;
  txHash: string;
  blockNumber: bigint;
}

interface TxWithENS extends TxEvent {
  ensName?: string;
}

const EXTENSION_EVENTS_ABI = [
  {
    type: "event",
    name: "Entered",
    inputs: [
      { indexed: true, name: "participant", type: "address" },
      { indexed: false, name: "amount", type: "uint256" },
      { indexed: false, name: "newBalance", type: "uint256" },
    ],
  },
  {
    type: "event",
    name: "Left",
    inputs: [
      { indexed: true, name: "participant", type: "address" },
      { indexed: false, name: "amount", type: "uint256" },
    ],
  },
] as const;

export function TxHistory() {
  const [events, setEvents] = useState<TxWithENS[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const publicClient = usePublicClient();

  useEffect(() => {
    async function fetchEvents() {
      if (!publicClient) return;

      try {
        // Fetch Entered events
        const enteredLogs = await publicClient.getLogs({
          address: CONTRACTS.extension,
          event: EXTENSION_EVENTS_ABI[0],
          fromBlock: "earliest",
          toBlock: "latest",
        });

        // Fetch Left events
        const leftLogs = await publicClient.getLogs({
          address: CONTRACTS.extension,
          event: EXTENSION_EVENTS_ABI[1],
          fromBlock: "earliest",
          toBlock: "latest",
        });

        // Combine and process events
        const allEvents: TxEvent[] = [];

        for (const log of enteredLogs) {
          const block = await publicClient.getBlock({
            blockNumber: log.blockNumber,
          });
          allEvents.push({
            type: "enter",
            participant: log.args.participant!,
            amount: log.args.amount!,
            timestamp: Number(block.timestamp),
            txHash: log.transactionHash!,
            blockNumber: log.blockNumber,
          });
        }

        for (const log of leftLogs) {
          const block = await publicClient.getBlock({
            blockNumber: log.blockNumber,
          });
          allEvents.push({
            type: "leave",
            participant: log.args.participant!,
            amount: log.args.amount!,
            timestamp: Number(block.timestamp),
            txHash: log.transactionHash!,
            blockNumber: log.blockNumber,
          });
        }

        // Sort by timestamp descending (newest first)
        allEvents.sort((a, b) => b.timestamp - a.timestamp);

        // Resolve ENS names
        const eventsWithENS: TxWithENS[] = await Promise.all(
          allEvents.map(async (event) => {
            try {
              const ensName = await publicClient.getEnsName({
                address: event.participant,
              });
              return { ...event, ensName: ensName || undefined };
            } catch {
              return event;
            }
          })
        );

        setEvents(eventsWithENS);
      } catch (error) {
        console.error("Failed to fetch events:", error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchEvents();
  }, [publicClient]);

  const formatAddress = (address: Address) => {
    return `${address.slice(0, 6)}…${address.slice(-4)}`;
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  if (isLoading) {
    return (
      <div className="text-white/30 text-[12px] text-center py-4">
        Loading history...
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="text-white/30 text-[12px] text-center py-4">
        No activity yet
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {events.map((event, i) => (
        <a
          key={`${event.txHash}-${i}`}
          href={`${ETHERSCAN_URL}/tx/${event.txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between text-[12px] py-1.5 hover:bg-white/5 -mx-1 px-1 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="text-white/70">
              {event.ensName || formatAddress(event.participant)}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={
                event.type === "enter" ? "text-green-400" : "text-white/50"
              }
            >
              {event.type === "enter" ? "+" : "−"}
              {formatEther(event.amount)} ETH
            </span>
            <span className="text-white/30 text-[10px]">
              {formatTime(event.timestamp)}
            </span>
          </div>
        </a>
      ))}
    </div>
  );
}
