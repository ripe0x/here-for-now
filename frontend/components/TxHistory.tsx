"use client";

import { useEffect, useState, useCallback } from "react";
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

const EARLIEST_BLOCK = 23915350n;
const BLOCK_BATCH_SIZE = 5; // Reduced for RPC rate limits
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

// ENS cache to avoid repeated lookups
const ensCache = new Map<Address, string | null>();

// Simple retry helper
async function withRetry<T>(
  fn: () => Promise<T>,
  retries = MAX_RETRIES
): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise((r) => setTimeout(r, RETRY_DELAY * (i + 1)));
    }
  }
  throw new Error("Max retries exceeded");
}

interface TxHistoryProps {
  refreshTrigger?: number;
}

export function TxHistory({ refreshTrigger }: TxHistoryProps) {
  const [events, setEvents] = useState<TxWithENS[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [counts, setCounts] = useState({ enters: 0, leaves: 0 });
  const publicClient = usePublicClient();

  // Batch fetch block timestamps with retry logic
  const fetchBlockTimestamps = useCallback(
    async (blockNumbers: bigint[]): Promise<Map<bigint, number>> => {
      if (!publicClient) return new Map();

      const uniqueBlocks = [...new Set(blockNumbers.map((b) => b.toString()))];
      const timestamps = new Map<bigint, number>();

      // Fetch blocks in smaller parallel batches with retry
      for (let i = 0; i < uniqueBlocks.length; i += BLOCK_BATCH_SIZE) {
        const batch = uniqueBlocks.slice(i, i + BLOCK_BATCH_SIZE);
        const blocks = await Promise.all(
          batch.map((blockNum) =>
            withRetry(() =>
              publicClient.getBlock({ blockNumber: BigInt(blockNum) })
            )
          )
        );
        blocks.forEach((block, idx) => {
          timestamps.set(BigInt(batch[idx]), Number(block.timestamp));
        });
      }

      return timestamps;
    },
    [publicClient]
  );

  // Resolve ENS names with caching (non-blocking, best effort)
  const resolveENSNames = useCallback(
    async (events: TxEvent[]): Promise<TxWithENS[]> => {
      if (!publicClient) return events;

      const uniqueAddresses = [
        ...new Set(events.map((e) => e.participant)),
      ].filter((addr) => !ensCache.has(addr));

      // Fetch uncached ENS names in small batches (non-blocking)
      if (uniqueAddresses.length > 0) {
        for (let i = 0; i < uniqueAddresses.length; i += BLOCK_BATCH_SIZE) {
          const batch = uniqueAddresses.slice(i, i + BLOCK_BATCH_SIZE);
          await Promise.all(
            batch.map(async (address) => {
              try {
                const ensName = await publicClient.getEnsName({ address });
                ensCache.set(address, ensName);
              } catch {
                ensCache.set(address, null);
              }
            })
          );
        }
      }

      return events.map((event) => ({
        ...event,
        ensName: ensCache.get(event.participant) || undefined,
      }));
    },
    [publicClient]
  );

  // Fetch all events from blockchain
  useEffect(() => {
    async function fetchEvents() {
      if (!publicClient) return;

      setIsLoading(true);

      try {
        // Fetch Entered and Left events in parallel with retry
        const [enteredLogs, leftLogs] = await Promise.all([
          withRetry(() =>
            publicClient.getLogs({
              address: CONTRACTS.extension,
              event: EXTENSION_EVENTS_ABI[0],
              fromBlock: EARLIEST_BLOCK,
              toBlock: "latest",
            })
          ),
          withRetry(() =>
            publicClient.getLogs({
              address: CONTRACTS.extension,
              event: EXTENSION_EVENTS_ABI[1],
              fromBlock: EARLIEST_BLOCK,
              toBlock: "latest",
            })
          ),
        ]);

        // Set counts
        setCounts({ enters: enteredLogs.length, leaves: leftLogs.length });

        // Collect all block numbers for batch fetching
        const allBlockNumbers = [
          ...enteredLogs.map((l) => l.blockNumber),
          ...leftLogs.map((l) => l.blockNumber),
        ];

        // Batch fetch all block timestamps
        const timestamps = await fetchBlockTimestamps(allBlockNumbers);

        // Process events
        const allEvents: TxEvent[] = [
          ...enteredLogs.map((log) => ({
            type: "enter" as const,
            participant: log.args.participant!,
            amount: log.args.amount!,
            timestamp: timestamps.get(log.blockNumber) || 0,
            txHash: log.transactionHash!,
            blockNumber: log.blockNumber,
          })),
          ...leftLogs.map((log) => ({
            type: "leave" as const,
            participant: log.args.participant!,
            amount: log.args.amount!,
            timestamp: timestamps.get(log.blockNumber) || 0,
            txHash: log.transactionHash!,
            blockNumber: log.blockNumber,
          })),
        ];

        // Sort by timestamp descending (newest first)
        allEvents.sort((a, b) => b.timestamp - a.timestamp);

        // Resolve ENS names
        const eventsWithENS = await resolveENSNames(allEvents);
        setEvents(eventsWithENS);
      } catch (error) {
        console.error("Failed to fetch events:", error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchEvents();
  }, [publicClient, refreshTrigger, fetchBlockTimestamps, resolveENSNames]);

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
      {/* Counters */}
      <div className="flex gap-4 text-[12px] mb-3">
        <span className="text-green-400">{counts.enters} enters</span>
        <span className="text-red-400">{counts.leaves} leaves</span>
      </div>

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
                event.type === "enter" ? "text-green-400" : "text-red-400"
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
