"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { HistoryState } from "./useHistoricalEvents";

const SPEEDS = [1, 2, 5, 10, 20, 50, 100] as const;
type Speed = (typeof SPEEDS)[number];

interface UseAnimationPlayerReturn {
  isPlaying: boolean;
  currentIndex: number;
  currentState: HistoryState | null;
  speed: Speed;
  totalStates: number;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seekTo: (index: number) => void;
  seekToStart: () => void;
  seekToEnd: () => void;
  cycleSpeed: () => void;
}

/**
 * Hook for managing animation playback state
 * @param states Array of historical states to animate through
 */
export function useAnimationPlayer(
  states: HistoryState[]
): UseAnimationPlayerReturn {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [speed, setSpeed] = useState<Speed>(2);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const currentState = states[currentIndex] || null;
  const totalStates = states.length;

  // Clear interval on unmount or when dependencies change
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  // Playback loop
  useEffect(() => {
    if (!isPlaying || states.length === 0) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      setCurrentIndex((prev) => {
        if (prev >= states.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 1000 / speed);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isPlaying, speed, states.length]);

  // Reset index when states change
  useEffect(() => {
    setCurrentIndex(0);
    setIsPlaying(false);
  }, [states.length]);

  const play = useCallback(() => {
    if (states.length === 0) return;
    // If at end, restart from beginning
    setCurrentIndex((prev) => (prev >= states.length - 1 ? 0 : prev));
    setIsPlaying(true);
  }, [states.length]);

  const pause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const toggle = useCallback(() => {
    if (isPlaying) {
      setIsPlaying(false);
    } else {
      play();
    }
  }, [isPlaying, play]);

  const seekTo = useCallback(
    (index: number) => {
      const clampedIndex = Math.max(0, Math.min(index, states.length - 1));
      setCurrentIndex(clampedIndex);
    },
    [states.length]
  );

  const seekToStart = useCallback(() => {
    setCurrentIndex(0);
  }, []);

  const seekToEnd = useCallback(() => {
    setCurrentIndex(Math.max(0, states.length - 1));
  }, [states.length]);

  const cycleSpeed = useCallback(() => {
    setSpeed((prev) => {
      const idx = SPEEDS.indexOf(prev);
      return SPEEDS[(idx + 1) % SPEEDS.length];
    });
  }, []);

  return {
    isPlaying,
    currentIndex,
    currentState,
    speed,
    totalStates,
    play,
    pause,
    toggle,
    seekTo,
    seekToStart,
    seekToEnd,
    cycleSpeed,
  };
}
