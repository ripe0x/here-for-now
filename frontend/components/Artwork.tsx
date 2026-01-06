"use client";

import { useState, useEffect, useCallback } from "react";
import { AnimatedArtwork } from "./AnimatedArtwork";
import { useVideoRecorder } from "@/hooks/useVideoRecorder";
import type { HistoryState } from "@/hooks/useHistoricalEvents";

interface ArtworkProps {
  imageData?: string;
  isLoading?: boolean;
  error?: string;
  states: HistoryState[];
  historyLoading: boolean;
}

const PLAYBACK_SPEED = 25;

export function Artwork({ imageData, isLoading, error, states, historyLoading }: ArtworkProps) {
  const [mode, setMode] = useState<"live" | "playing">("live");
  const [currentIndex, setCurrentIndex] = useState(0);
  const recorder = useVideoRecorder(states);

  // Auto-advance animation
  useEffect(() => {
    if (mode !== "playing" || states.length === 0) return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => {
        if (prev >= states.length - 1) {
          return 0; // Loop back to start
        }
        return prev + 1;
      });
    }, 1000 / PLAYBACK_SPEED);

    return () => clearInterval(interval);
  }, [mode, states.length]);

  const handlePlay = useCallback(() => {
    if (states.length === 0) return;
    setCurrentIndex(0);
    setMode("playing");
  }, [states.length]);

  const handleStop = useCallback(() => {
    setMode("live");
    setCurrentIndex(0);
  }, []);

  const currentState = states[currentIndex];

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center">
        <div className="w-full aspect-square max-w-xs md:max-w-md lg:max-w-xl flex items-center justify-center border border-red-500/30">
          <span className="text-red-400 text-xs">{error}</span>
        </div>
      </div>
    );
  }

  // Loading state
  if (isLoading || !imageData) {
    return (
      <div className="flex flex-col items-center w-full max-w-xs md:max-w-md lg:max-w-xl">
        <div className="w-full aspect-square bg-white/[0.02] animate-pulse" />
        <div className="h-6 mt-3" /> {/* Spacer for controls */}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center w-full max-w-xs md:max-w-md lg:max-w-xl">
      {/* Artwork - never overlaid */}
      {mode === "live" ? (
        <img
          src={imageData}
          alt="Here, For Now"
          className="w-full aspect-square object-contain"
        />
      ) : (
        currentState && (
          <AnimatedArtwork participantCount={currentState.participantCount} />
        )
      )}

      {/* Controls below artwork */}
      <div className="flex items-center justify-center gap-4 mt-3 h-6">
        {mode === "live" ? (
          // Play button
          <button
            onClick={handlePlay}
            disabled={historyLoading || states.length === 0}
            className="text-white/30 hover:text-white/60 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title={historyLoading ? "Loading history..." : "Play history"}
          >
            <PlayIcon />
          </button>
        ) : (
          // Playing controls
          <>
            <button
              onClick={handleStop}
              className="text-white/30 hover:text-white/60 transition-colors"
              title="Stop"
            >
              <StopIcon />
            </button>
            <span className="text-white/20 text-[10px] tabular-nums">
              {currentState?.participantCount ?? 0} here
            </span>
            {/* Download button */}
            <button
              onClick={() => recorder.startRecording(PLAYBACK_SPEED)}
              disabled={recorder.isRecording}
              className="text-white/20 hover:text-white/40 transition-colors disabled:opacity-30"
              title="Download MP4 for Twitter"
            >
              {recorder.isRecording ? (
                <span className="text-[10px] whitespace-nowrap">{recorder.status}</span>
              ) : (
                <DownloadIcon />
              )}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function PlayIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
      <path d="M4 2l10 6-10 6V2z" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
      <rect x="2" y="2" width="12" height="12" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 12L3 7h3V2h4v5h3L8 12z" />
      <path d="M2 14h12v1H2z" />
    </svg>
  );
}
