"use client";

interface HistoryPlayerProps {
  isPlaying: boolean;
  currentIndex: number;
  totalStates: number;
  speed: number;
  currentState: { timestamp: number; participantCount: number } | null;
  onToggle: () => void;
  onSeek: (index: number) => void;
  onSeekToStart: () => void;
  onSeekToEnd: () => void;
  onCycleSpeed: () => void;
  // Recording props
  isRecording: boolean;
  recordingProgress: number;
  onStartRecording: (speed: number) => void;
  onCancelRecording: () => void;
}

function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return (
    date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }) +
    " " +
    date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    })
  );
}

function PlayIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="currentColor"
      className="ml-0.5"
    >
      <path d="M4 2l10 6-10 6V2z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <rect x="3" y="2" width="4" height="12" />
      <rect x="9" y="2" width="4" height="12" />
    </svg>
  );
}

function SkipBackIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
      <rect x="2" y="3" width="2" height="10" />
      <path d="M14 3L6 8l8 5V3z" />
    </svg>
  );
}

function SkipForwardIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
      <rect x="12" y="3" width="2" height="10" />
      <path d="M2 3l8 5-8 5V3z" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 12L3 7h3V2h4v5h3L8 12z" />
      <path d="M2 14h12v1H2z" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
      <rect x="3" y="3" width="10" height="10" />
    </svg>
  );
}

/**
 * Animation player controls overlay
 */
export function HistoryPlayer({
  isPlaying,
  currentIndex,
  totalStates,
  speed,
  currentState,
  onToggle,
  onSeek,
  onSeekToStart,
  onSeekToEnd,
  onCycleSpeed,
  isRecording,
  recordingProgress,
  onStartRecording,
  onCancelRecording,
}: HistoryPlayerProps) {
  const progress =
    totalStates > 1 ? (currentIndex / (totalStates - 1)) * 100 : 0;

  return (
    <div className="absolute bottom-0 left-0 right-0 bg-black/80 border-t border-white/20 p-3 space-y-2">
      {/* Recording progress overlay */}
      {isRecording && (
        <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center gap-2 z-10">
          <div className="text-white/70 text-[12px]">
            Recording video... {recordingProgress}%
          </div>
          <div className="w-32 h-1 bg-white/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-white transition-all duration-200"
              style={{ width: `${recordingProgress}%` }}
            />
          </div>
          <button
            onClick={onCancelRecording}
            className="mt-2 px-3 py-1 text-[11px] text-white/50 hover:text-white border border-white/30 hover:border-white transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Timeline scrubber */}
      <input
        type="range"
        min={0}
        max={Math.max(0, totalStates - 1)}
        value={currentIndex}
        onChange={(e) => onSeek(Number(e.target.value))}
        disabled={isRecording}
        className="w-full h-1 bg-white/20 appearance-none cursor-pointer rounded-full
          [&::-webkit-slider-thumb]:appearance-none
          [&::-webkit-slider-thumb]:w-3
          [&::-webkit-slider-thumb]:h-3
          [&::-webkit-slider-thumb]:bg-white
          [&::-webkit-slider-thumb]:rounded-full
          [&::-webkit-slider-thumb]:cursor-pointer
          [&::-moz-range-thumb]:w-3
          [&::-moz-range-thumb]:h-3
          [&::-moz-range-thumb]:bg-white
          [&::-moz-range-thumb]:border-0
          [&::-moz-range-thumb]:rounded-full
          [&::-moz-range-thumb]:cursor-pointer
          disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          background: `linear-gradient(to right, white ${progress}%, rgba(255,255,255,0.2) ${progress}%)`,
        }}
      />

      {/* Controls row */}
      <div className="flex items-center justify-between text-[12px]">
        <div className="flex items-center gap-1">
          {/* Skip to start */}
          <button
            onClick={onSeekToStart}
            disabled={isRecording}
            className="p-1.5 hover:bg-white/10 rounded transition-colors text-white/70 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
            title="Skip to start"
          >
            <SkipBackIcon />
          </button>

          {/* Play/Pause */}
          <button
            onClick={onToggle}
            disabled={isRecording}
            className="p-1.5 hover:bg-white/10 rounded transition-colors text-white disabled:opacity-50 disabled:cursor-not-allowed"
            title={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? <PauseIcon /> : <PlayIcon />}
          </button>

          {/* Skip to end */}
          <button
            onClick={onSeekToEnd}
            disabled={isRecording}
            className="p-1.5 hover:bg-white/10 rounded transition-colors text-white/70 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
            title="Skip to end"
          >
            <SkipForwardIcon />
          </button>

          {/* Speed toggle */}
          <button
            onClick={onCycleSpeed}
            disabled={isRecording}
            className="px-2 py-1 hover:bg-white/10 rounded transition-colors text-white/70 hover:text-white ml-1 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Change speed"
          >
            {speed}x
          </button>

          {/* Download button */}
          <button
            onClick={() => onStartRecording(speed)}
            disabled={isRecording || isPlaying}
            className="p-1.5 hover:bg-white/10 rounded transition-colors text-white/70 hover:text-white ml-1 disabled:opacity-50 disabled:cursor-not-allowed"
            title={`Download as video (${speed}x speed)`}
          >
            <DownloadIcon />
          </button>
        </div>

        {/* State info */}
        <div className="text-white/50 text-center flex-1 px-2">
          {currentState && (
            <>
              <span className="text-white">{currentState.participantCount}</span>{" "}
              here
              <span className="mx-2">·</span>
              <span className="text-white/40">
                {formatDateTime(currentState.timestamp)}
              </span>
            </>
          )}
        </div>

        {/* Frame counter */}
        <div className="text-white/30 tabular-nums">
          {currentIndex + 1} / {totalStates}
        </div>
      </div>
    </div>
  );
}
