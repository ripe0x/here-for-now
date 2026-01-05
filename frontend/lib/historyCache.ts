/**
 * localStorage caching utilities for historical event data
 * Handles BigInt serialization and incremental cache updates
 */

import type { Address } from "viem";

const CACHE_KEY = "hfn_history_cache";
const CACHE_VERSION = 1;

export interface HistoricalEvent {
  type: "enter" | "leave";
  participant: Address;
  amount: string; // Stored as string for JSON serialization
  blockNumber: string; // Stored as string for JSON serialization
  timestamp: number;
  txHash: string;
}

export interface CachedEventData {
  version: number;
  lastFetchedBlock: string; // Stored as string for JSON serialization
  events: HistoricalEvent[];
  lastUpdated: number;
}

/**
 * Get cached event data from localStorage
 * @returns Cached data or null if not found/invalid
 */
export function getCachedData(): CachedEventData | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;

    const data = JSON.parse(raw) as CachedEventData;

    // Validate cache version
    if (data.version !== CACHE_VERSION) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }

    return data;
  } catch {
    // Clear corrupted cache
    try {
      localStorage.removeItem(CACHE_KEY);
    } catch {
      // Ignore
    }
    return null;
  }
}

/**
 * Save event data to localStorage cache
 * @param data The event data to cache
 */
export function setCachedData(data: Omit<CachedEventData, "version">): void {
  if (typeof window === "undefined") return;

  try {
    const cacheData: CachedEventData = {
      ...data,
      version: CACHE_VERSION,
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
  } catch (error) {
    // localStorage might be full or disabled
    console.warn("Failed to cache history data:", error);
  }
}

/**
 * Clear the history cache
 */
export function clearCache(): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    // Ignore
  }
}

/**
 * Convert BigInt to string for storage
 */
export function serializeBigInt(value: bigint): string {
  return value.toString();
}

/**
 * Convert string back to BigInt
 */
export function deserializeBigInt(value: string): bigint {
  return BigInt(value);
}
