"use client";

import { useEffect, useState, useMemo } from "react";
import { formatEther, Address } from "viem";
import { usePublicClient } from "wagmi";
import { ETHERSCAN_URL } from "@/lib/contracts";
import type { HistoricalEvent } from "@/lib/historyCache";
import { deserializeBigInt } from "@/lib/historyCache";

interface TxWithENS {
  type: "enter" | "leave";
  participant: Address;
  amount: bigint;
  timestamp: number;
  txHash: string;
  ensName?: string;
}

const ENS_BATCH_SIZE = 5;

// ENS cache to avoid repeated lookups
const ensCache = new Map<Address, string | null>();

interface TxHistoryProps {
  events: HistoricalEvent[];
  isLoading: boolean;
}

export function TxHistory({ events: rawEvents, isLoading }: TxHistoryProps) {
  const [eventsWithENS, setEventsWithENS] = useState<TxWithENS[]>([]);
  const [ensResolved, setEnsResolved] = useState(false);
  const [filter, setFilter] = useState<"all" | "enter" | "leave">("all");
  const publicClient = usePublicClient();

  // Calculate counts from events
  const counts = useMemo(() => {
    const enters = rawEvents.filter((e) => e.type === "enter").length;
    const leaves = rawEvents.filter((e) => e.type === "leave").length;
    return { here: enters - leaves, enters, leaves };
  }, [rawEvents]);

  // Convert and sort events
  const sortedEvents = useMemo(() => {
    return [...rawEvents]
      .sort((a, b) => b.timestamp - a.timestamp)
      .map((e) => ({
        type: e.type,
        participant: e.participant,
        amount: deserializeBigInt(e.amount),
        timestamp: e.timestamp,
        txHash: e.txHash,
        ensName: ensCache.get(e.participant) || undefined,
      }));
  }, [rawEvents]);

  // Resolve ENS names (non-blocking, best effort)
  useEffect(() => {
    if (!publicClient || rawEvents.length === 0) {
      setEventsWithENS(sortedEvents);
      return;
    }

    async function resolveENS() {
      const uniqueAddresses = [
        ...new Set(rawEvents.map((e) => e.participant)),
      ].filter((addr) => !ensCache.has(addr));

      if (uniqueAddresses.length > 0) {
        for (let i = 0; i < uniqueAddresses.length; i += ENS_BATCH_SIZE) {
          const batch = uniqueAddresses.slice(i, i + ENS_BATCH_SIZE);
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

      // Update events with resolved ENS names
      setEventsWithENS(
        sortedEvents.map((event) => ({
          ...event,
          ensName: ensCache.get(event.participant) || undefined,
        }))
      );
      setEnsResolved(true);
    }

    // Show events immediately, then resolve ENS in background
    setEventsWithENS(sortedEvents);
    resolveENS();
  }, [publicClient, rawEvents, sortedEvents]);

  const displayEvents = ensResolved ? eventsWithENS : sortedEvents;

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
      <div className="space-y-2">
        {/* Skeleton counters */}
        <div className="flex gap-4 mb-3">
          <div className="h-4 w-14 bg-white/[0.05] animate-pulse rounded" />
          <div className="h-4 w-20 bg-white/[0.05] animate-pulse rounded" />
          <div className="h-4 w-14 bg-white/[0.05] animate-pulse rounded" />
        </div>
        {/* Skeleton rows */}
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex items-center justify-between py-1.5">
            <div className="h-4 w-24 bg-white/[0.03] animate-pulse rounded" />
            <div className="flex items-center gap-3">
              <div className="h-4 w-16 bg-white/[0.03] animate-pulse rounded" />
              <div className="h-3 w-10 bg-white/[0.03] animate-pulse rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (rawEvents.length === 0 && !isLoading) {
    return (
      <div className="text-white/30 text-[12px] text-center py-4">
        No activity yet
      </div>
    );
  }

  const filteredEvents = filter === "all"
    ? displayEvents
    : displayEvents.filter((e) => e.type === filter);

  return (
    <div className="space-y-2">
      {/* Counters / Filters */}
      <div className="flex gap-4 text-[12px] mb-3">
        <span className="text-white">{counts.here} here</span>
        <button
          onClick={() => setFilter(filter === "enter" ? "all" : "enter")}
          className={`transition-colors text-green-400 ${
            filter === "leave" ? "opacity-50" : ""
          }`}
        >
          {counts.enters} entered
        </button>
        <button
          onClick={() => setFilter(filter === "leave" ? "all" : "leave")}
          className={`transition-colors text-red-400 ${
            filter === "enter" ? "opacity-50" : ""
          }`}
        >
          {counts.leaves} left
        </button>
      </div>

      {filteredEvents.map((event, i) => (
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
