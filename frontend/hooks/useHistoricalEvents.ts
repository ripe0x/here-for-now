"use client";

import { useCallback, useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import { CONTRACTS, EXTENSION_EVENTS_ABI, EARLIEST_BLOCK } from "@/lib/contracts";
import {
  getCachedData,
  setCachedData,
  serializeBigInt,
  deserializeBigInt,
  type HistoricalEvent,
} from "@/lib/historyCache";

const BLOCK_BATCH_SIZE = 3;
const MAX_RETRIES = 2;
const RETRY_DELAY = 500;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes - skip fetch if cache is fresher

// Reference point for timestamp estimation
// Block 23915350 was mined around Dec 2024
const REFERENCE_BLOCK = 23915350n;
const REFERENCE_TIMESTAMP = 1733000000; // Approximate timestamp
const AVG_BLOCK_TIME = 12; // seconds

export interface HistoryState {
  blockNumber: bigint;
  timestamp: number;
  participantCount: number;
  txHash: string;
}

interface UseHistoricalEventsReturn {
  events: HistoricalEvent[];
  states: HistoryState[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

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

/**
 * Estimate timestamp from block number using reference point
 */
function estimateTimestamp(blockNumber: bigint): number {
  const blockDiff = Number(blockNumber - REFERENCE_BLOCK);
  return REFERENCE_TIMESTAMP + blockDiff * AVG_BLOCK_TIME;
}

/**
 * Hook for fetching historical Enter/Leave events with caching
 */
export function useHistoricalEvents(): UseHistoricalEventsReturn {
  const [events, setEvents] = useState<HistoricalEvent[]>([]);
  const [states, setStates] = useState<HistoryState[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const publicClient = usePublicClient();

  // Batch fetch block timestamps with fallback to estimation
  const fetchBlockTimestamps = useCallback(
    async (blockNumbers: bigint[]): Promise<Map<bigint, number>> => {
      const timestamps = new Map<bigint, number>();

      if (!publicClient || blockNumbers.length === 0) {
        // Use estimated timestamps as fallback
        blockNumbers.forEach((bn) => {
          timestamps.set(bn, estimateTimestamp(bn));
        });
        return timestamps;
      }

      const uniqueBlocks = [...new Set(blockNumbers.map((b) => b.toString()))];

      // Try to fetch real timestamps, fall back to estimates on failure
      try {
        for (let i = 0; i < uniqueBlocks.length; i += BLOCK_BATCH_SIZE) {
          const batch = uniqueBlocks.slice(i, i + BLOCK_BATCH_SIZE);

          // Fetch blocks with individual error handling
          const results = await Promise.allSettled(
            batch.map((blockNum) =>
              withRetry(() =>
                publicClient.getBlock({ blockNumber: BigInt(blockNum) })
              )
            )
          );

          results.forEach((result, idx) => {
            const blockNum = BigInt(batch[idx]);
            if (result.status === "fulfilled") {
              timestamps.set(blockNum, Number(result.value.timestamp));
            } else {
              // Use estimated timestamp on failure
              timestamps.set(blockNum, estimateTimestamp(blockNum));
            }
          });

          // Small delay between batches to avoid rate limiting
          if (i + BLOCK_BATCH_SIZE < uniqueBlocks.length) {
            await new Promise((r) => setTimeout(r, 100));
          }
        }
      } catch {
        // If batch fetching fails entirely, use estimates for all
        uniqueBlocks.forEach((blockNum) => {
          const bn = BigInt(blockNum);
          if (!timestamps.has(bn)) {
            timestamps.set(bn, estimateTimestamp(bn));
          }
        });
      }

      return timestamps;
    },
    [publicClient]
  );

  // Calculate historical states from events
  const calculateHistoricalStates = useCallback(
    (events: HistoricalEvent[]): HistoryState[] => {
      if (events.length === 0) return [];

      // Sort events by block number ascending
      const sortedEvents = [...events].sort(
        (a, b) => Number(deserializeBigInt(a.blockNumber) - deserializeBigInt(b.blockNumber))
      );

      const states: HistoryState[] = [];
      let participantCount = 0;

      // Add initial state (0 participants before first event)
      const firstEvent = sortedEvents[0];
      const firstBlockNum = deserializeBigInt(firstEvent.blockNumber);
      states.push({
        blockNumber: firstBlockNum - 1n,
        timestamp: firstEvent.timestamp > 0 ? firstEvent.timestamp - 1 : estimateTimestamp(firstBlockNum - 1n),
        participantCount: 0,
        txHash: "",
      });

      // Process each event chronologically
      for (const event of sortedEvents) {
        participantCount += event.type === "enter" ? 1 : -1;
        participantCount = Math.max(0, participantCount); // Ensure non-negative

        const blockNum = deserializeBigInt(event.blockNumber);
        states.push({
          blockNumber: blockNum,
          timestamp: event.timestamp > 0 ? event.timestamp : estimateTimestamp(blockNum),
          participantCount,
          txHash: event.txHash,
        });
      }

      return states;
    },
    []
  );

  // Main fetch function
  const fetchEvents = useCallback(async (forceRefresh = false) => {
    if (!publicClient) return;

    // Check cache first
    const cached = getCachedData();

    // If we have cached data, use it immediately
    if (cached && cached.events.length > 0) {
      setEvents(cached.events);
      setStates(calculateHistoricalStates(cached.events));

      // If cache is fresh enough and not forcing refresh, skip network request
      const cacheAge = Date.now() - cached.lastUpdated;
      if (!forceRefresh && cacheAge < CACHE_TTL_MS) {
        setIsLoading(false);
        return;
      }
    }

    setIsLoading(true);
    setError(null);

    try {
      const fromBlock = cached?.lastFetchedBlock
        ? deserializeBigInt(cached.lastFetchedBlock) + 1n
        : EARLIEST_BLOCK;

      // Get current block
      let currentBlock: bigint;
      try {
        currentBlock = await publicClient.getBlockNumber();
      } catch {
        // If we can't get current block but have cache, just use cache
        if (cached && cached.events.length > 0) {
          setIsLoading(false);
          return;
        }
        throw new Error("Unable to connect to blockchain");
      }

      // Skip if cache is up to date
      if (cached && deserializeBigInt(cached.lastFetchedBlock) >= currentBlock) {
        setIsLoading(false);
        return;
      }

      // Fetch new events
      const [enteredLogs, leftLogs] = await Promise.all([
        withRetry(() =>
          publicClient.getLogs({
            address: CONTRACTS.extension,
            event: EXTENSION_EVENTS_ABI[0],
            fromBlock,
            toBlock: "latest",
          })
        ),
        withRetry(() =>
          publicClient.getLogs({
            address: CONTRACTS.extension,
            event: EXTENSION_EVENTS_ABI[1],
            fromBlock,
            toBlock: "latest",
          })
        ),
      ]);

      // Collect block numbers for timestamp fetching
      const allBlockNumbers = [
        ...enteredLogs.map((l) => l.blockNumber),
        ...leftLogs.map((l) => l.blockNumber),
      ];

      // Fetch timestamps (with fallback to estimates)
      const timestamps = await fetchBlockTimestamps(allBlockNumbers);

      // Process new events
      const newEvents: HistoricalEvent[] = [
        ...enteredLogs.map((log) => ({
          type: "enter" as const,
          participant: log.args.participant!,
          amount: serializeBigInt(log.args.amount!),
          blockNumber: serializeBigInt(log.blockNumber),
          timestamp: timestamps.get(log.blockNumber) || estimateTimestamp(log.blockNumber),
          txHash: log.transactionHash!,
        })),
        ...leftLogs.map((log) => ({
          type: "leave" as const,
          participant: log.args.participant!,
          amount: serializeBigInt(log.args.amount!),
          blockNumber: serializeBigInt(log.blockNumber),
          timestamp: timestamps.get(log.blockNumber) || estimateTimestamp(log.blockNumber),
          txHash: log.transactionHash!,
        })),
      ];

      // Merge with cached events
      const allEvents = [...(cached?.events || []), ...newEvents];

      // Sort by block number ascending
      allEvents.sort(
        (a, b) => Number(deserializeBigInt(a.blockNumber) - deserializeBigInt(b.blockNumber))
      );

      // Update cache
      setCachedData({
        lastFetchedBlock: serializeBigInt(currentBlock),
        events: allEvents,
        lastUpdated: Date.now(),
      });

      setEvents(allEvents);
      setStates(calculateHistoricalStates(allEvents));
    } catch (err) {
      console.error("Failed to fetch historical events:", err);

      // Fall back to cached data if available
      const cached = getCachedData();
      if (cached && cached.events.length > 0) {
        setEvents(cached.events);
        setStates(calculateHistoricalStates(cached.events));
        // Don't show error if we have cached data to display
      } else {
        setError(err instanceof Error ? err.message : "Failed to fetch events");
      }
    } finally {
      setIsLoading(false);
    }
  }, [publicClient, fetchBlockTimestamps, calculateHistoricalStates]);

  // Fetch on mount
  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Force refresh function for manual refetch (e.g., after transaction)
  const refetch = useCallback(() => fetchEvents(true), [fetchEvents]);

  return { events, states, isLoading, error, refetch };
}
