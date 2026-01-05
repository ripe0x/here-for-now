"use client";

import { useState, useCallback, useRef } from "react";
import { generateSVG } from "@/lib/svgGenerator";
import type { HistoryState } from "./useHistoricalEvents";

interface UseVideoRecorderReturn {
  isRecording: boolean;
  progress: number; // 0-100
  error: string | null;
  startRecording: (speed: number) => Promise<void>;
  cancelRecording: () => void;
}

// Video settings optimized for Twitter
// Twitter accepts: MP4 (H.264), WebM, MOV
// Max 1920x1200, 40fps max, 512MB max
const VIDEO_SIZE = 720; // 720x720 square - good for Twitter
const MAX_FRAME_RATE = 30; // Twitter recommends 30fps max
const BASE_FRAME_RATE = 10; // Base frames per second at 1x speed

/**
 * Get the best supported video format for Twitter compatibility
 * Prefers MP4 > WebM
 */
function getBestMimeType(): { mimeType: string; extension: string } {
  // Try MP4 first (best Twitter compatibility)
  if (MediaRecorder.isTypeSupported("video/mp4")) {
    return { mimeType: "video/mp4", extension: "mp4" };
  }
  // Try WebM with H264 codec
  if (MediaRecorder.isTypeSupported("video/webm;codecs=h264")) {
    return { mimeType: "video/webm;codecs=h264", extension: "webm" };
  }
  // Try WebM with VP9 (good quality)
  if (MediaRecorder.isTypeSupported("video/webm;codecs=vp9")) {
    return { mimeType: "video/webm;codecs=vp9", extension: "webm" };
  }
  // Fallback to basic WebM
  if (MediaRecorder.isTypeSupported("video/webm")) {
    return { mimeType: "video/webm", extension: "webm" };
  }
  throw new Error("No supported video format found");
}

/**
 * Hook for recording the animation as a video (Twitter-compatible)
 */
export function useVideoRecorder(
  states: HistoryState[]
): UseVideoRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const startRecording = useCallback(
    async (speed: number) => {
      if (states.length === 0) {
        setError("No history to record");
        return;
      }

      setIsRecording(true);
      setProgress(0);
      setError(null);
      cancelledRef.current = false;

      // Calculate frame rate based on speed (capped at 30fps for Twitter)
      const frameRate = Math.min(BASE_FRAME_RATE * speed, MAX_FRAME_RATE);
      const frameDuration = 1000 / frameRate;

      try {
        // Get best supported format
        const { mimeType, extension } = getBestMimeType();

        // Create offscreen canvas
        const canvas = document.createElement("canvas");
        canvas.width = VIDEO_SIZE;
        canvas.height = VIDEO_SIZE;
        const ctx = canvas.getContext("2d");

        if (!ctx) {
          throw new Error("Could not create canvas context");
        }

        // Create MediaRecorder with Twitter-optimized settings
        const stream = canvas.captureStream(frameRate);
        const mediaRecorder = new MediaRecorder(stream, {
          mimeType,
          videoBitsPerSecond: 4000000, // 4 Mbps - good quality, reasonable file size
        });

        const chunks: Blob[] = [];
        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            chunks.push(e.data);
          }
        };

        // Start recording
        mediaRecorder.start();

        // Render each frame
        for (let i = 0; i < states.length; i++) {
          if (cancelledRef.current) {
            mediaRecorder.stop();
            setIsRecording(false);
            return;
          }

          const state = states[i];
          const svg = generateSVG(state.participantCount);

          // Render SVG to canvas
          await renderSVGToCanvas(ctx, svg, VIDEO_SIZE);

          // Draw participant counter overlay
          drawCounter(ctx, state.participantCount, VIDEO_SIZE);

          // Update progress
          setProgress(Math.round(((i + 1) / states.length) * 100));

          // Wait for frame duration
          await new Promise((resolve) => setTimeout(resolve, frameDuration));
        }

        // Hold last frame briefly
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Stop recording and wait for data
        const videoBlob = await new Promise<Blob>((resolve) => {
          mediaRecorder.onstop = () => {
            const blob = new Blob(chunks, { type: mimeType });
            resolve(blob);
          };
          mediaRecorder.stop();
        });

        if (cancelledRef.current) {
          setIsRecording(false);
          return;
        }

        // Download the video
        downloadBlob(videoBlob, `here-for-now-${speed}x.${extension}`);

        setIsRecording(false);
        setProgress(100);
      } catch (err) {
        console.error("Recording failed:", err);
        setError(err instanceof Error ? err.message : "Recording failed");
        setIsRecording(false);
      }
    },
    [states]
  );

  const cancelRecording = useCallback(() => {
    cancelledRef.current = true;
  }, []);

  return {
    isRecording,
    progress,
    error,
    startRecording,
    cancelRecording,
  };
}

/**
 * Render SVG string to canvas
 */
async function renderSVGToCanvas(
  ctx: CanvasRenderingContext2D,
  svgString: string,
  size: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const blob = new Blob([svgString], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve();
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load SVG"));
    };

    img.src = url;
  });
}

/**
 * Draw participant counter in bottom right corner
 */
function drawCounter(
  ctx: CanvasRenderingContext2D,
  participantCount: number,
  size: number
): void {
  const text = `${participantCount} here`;
  // Scale font size relative to video size (720p base)
  const scale = size / 720;
  const padding = Math.round(12 * scale);
  const fontSize = Math.round(10 * scale);
  const bgPadding = Math.round(4 * scale);

  // Set font
  ctx.font = `${fontSize}px "IBM Plex Mono", monospace`;
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";

  // Measure text for background
  const metrics = ctx.measureText(text);
  const textWidth = metrics.width;
  const textHeight = fontSize;

  // Draw semi-transparent background
  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  ctx.fillRect(
    size - padding - textWidth - bgPadding * 2,
    size - padding - textHeight - bgPadding,
    textWidth + bgPadding * 2,
    textHeight + bgPadding
  );

  // Draw text
  ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
  ctx.fillText(text, size - padding - bgPadding, size - padding);
}

/**
 * Download a blob as a file
 */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
