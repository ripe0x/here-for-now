"use client";

import { useState, useCallback, useRef } from "react";
import { generateSVG } from "@/lib/svgGenerator";
import type { HistoryState } from "./useHistoricalEvents";

interface UseVideoRecorderReturn {
  isRecording: boolean;
  progress: number; // 0-100
  status: string;
  error: string | null;
  startRecording: (speed: number) => Promise<void>;
  cancelRecording: () => void;
}

// Video settings optimized for Twitter
const VIDEO_SIZE = 720; // 720x720 square
const TARGET_FPS = 30; // Output frame rate

// FFmpeg instance (lazy loaded)
let ffmpegInstance: any = null;

/**
 * Dynamically load FFmpeg
 */
async function loadFFmpeg(onProgress: (msg: string) => void): Promise<any> {
  if (ffmpegInstance?.loaded) return ffmpegInstance;

  onProgress("Loading converter...");

  // Dynamic imports for client-side only
  const { FFmpeg } = await import("@ffmpeg/ffmpeg");

  ffmpegInstance = new FFmpeg();

  // Load directly from CDN
  const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
  await ffmpegInstance.load({
    coreURL: `${baseURL}/ffmpeg-core.js`,
    wasmURL: `${baseURL}/ffmpeg-core.wasm`,
  });

  return ffmpegInstance;
}

/**
 * Get the best supported WebM format for recording
 */
function getRecordingMimeType(): string {
  if (MediaRecorder.isTypeSupported("video/webm;codecs=vp8")) {
    return "video/webm;codecs=vp8";
  }
  if (MediaRecorder.isTypeSupported("video/webm;codecs=vp9")) {
    return "video/webm;codecs=vp9";
  }
  if (MediaRecorder.isTypeSupported("video/webm")) {
    return "video/webm";
  }
  throw new Error("No supported video format found");
}

/**
 * Hook for recording animation as Twitter-compatible MP4
 */
export function useVideoRecorder(
  states: HistoryState[]
): UseVideoRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
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
      setStatus("Recording...");
      setError(null);
      cancelledRef.current = false;

      // Calculate frames based on speed
      // At speed X, we show X states per second of video
      // With 30fps output, video duration = totalStates / speed
      const totalStates = states.length;
      const videoDuration = totalStates / speed; // seconds
      const totalFrames = Math.ceil(videoDuration * TARGET_FPS);

      // Sample states to fit the frame count
      const sampledIndices: number[] = [];
      for (let frame = 0; frame < totalFrames; frame++) {
        const stateIndex = Math.min(
          Math.floor((frame / totalFrames) * totalStates),
          totalStates - 1
        );
        sampledIndices.push(stateIndex);
      }
      // Always include the last state
      if (sampledIndices[sampledIndices.length - 1] !== totalStates - 1) {
        sampledIndices.push(totalStates - 1);
      }

      const frameDuration = 1000 / TARGET_FPS;

      try {
        const mimeType = getRecordingMimeType();

        // Create canvas
        const canvas = document.createElement("canvas");
        canvas.width = VIDEO_SIZE;
        canvas.height = VIDEO_SIZE;
        const ctx = canvas.getContext("2d");

        if (!ctx) throw new Error("Could not create canvas context");

        // Create MediaRecorder
        const stream = canvas.captureStream(TARGET_FPS);
        const mediaRecorder = new MediaRecorder(stream, {
          mimeType,
          videoBitsPerSecond: 4000000,
        });

        const chunks: Blob[] = [];
        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };

        mediaRecorder.start(100);

        // Record sampled frames
        const totalFrames = sampledIndices.length;
        for (let frameIdx = 0; frameIdx < totalFrames; frameIdx++) {
          if (cancelledRef.current) {
            mediaRecorder.stop();
            setIsRecording(false);
            return;
          }

          const stateIdx = sampledIndices[frameIdx];
          const state = states[stateIdx];
          const svg = generateSVG(state.participantCount);
          await renderSVGToCanvas(ctx, svg, VIDEO_SIZE);
          drawCounter(ctx, state.participantCount, VIDEO_SIZE);

          setProgress(Math.round(((frameIdx + 1) / totalFrames) * 50));
          setStatus(`Recording ${Math.round(((frameIdx + 1) / totalFrames) * 100)}%`);

          await new Promise((resolve) => setTimeout(resolve, frameDuration));
        }

        await new Promise((resolve) => setTimeout(resolve, 300));

        // Get WebM blob
        const webmBlob = await new Promise<Blob>((resolve) => {
          mediaRecorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
          mediaRecorder.stop();
        });

        if (cancelledRef.current) {
          setIsRecording(false);
          return;
        }

        // Convert to MP4 using FFmpeg
        setStatus("Converting...");
        setProgress(50);

        const ff = await loadFFmpeg(setStatus);

        // Convert blob to Uint8Array
        const webmBuffer = await webmBlob.arrayBuffer();
        const webmData = new Uint8Array(webmBuffer);
        await ff.writeFile("input.webm", webmData);

        setProgress(60);
        setStatus("Encoding MP4...");

        // Convert WebM to MP4 (H.264 for Twitter compatibility)
        // Force constant 30fps to fix variable frame rate issues
        await ff.exec([
          "-r", "30",
          "-i", "input.webm",
          "-c:v", "libx264",
          "-preset", "ultrafast",
          "-crf", "28",
          "-pix_fmt", "yuv420p",
          "-r", "30",
          "-movflags", "+faststart",
          "-an",
          "-y",
          "output.mp4"
        ]);

        setProgress(90);
        setStatus("Finalizing...");

        const mp4Data = await ff.readFile("output.mp4");
        const mp4Blob = new Blob([mp4Data], { type: "video/mp4" });

        // Cleanup
        await ff.deleteFile("input.webm");
        await ff.deleteFile("output.mp4");

        if (cancelledRef.current) {
          setIsRecording(false);
          return;
        }

        // Download
        downloadBlob(mp4Blob, `here-for-now-${speed}x.mp4`);

        setProgress(100);
        setStatus("Done!");
        setIsRecording(false);
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
    status,
    error,
    startRecording,
    cancelRecording,
  };
}

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

function drawCounter(
  ctx: CanvasRenderingContext2D,
  participantCount: number,
  size: number
): void {
  const text = `${participantCount} here`;
  const scale = size / 720;
  const padding = Math.round(12 * scale);
  const fontSize = Math.round(10 * scale);
  const bgPadding = Math.round(4 * scale);

  ctx.font = `${fontSize}px "IBM Plex Mono", monospace`;
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";

  const metrics = ctx.measureText(text);
  const textWidth = metrics.width;
  const textHeight = fontSize;

  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  ctx.fillRect(
    size - padding - textWidth - bgPadding * 2,
    size - padding - textHeight - bgPadding,
    textWidth + bgPadding * 2,
    textHeight + bgPadding
  );

  ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
  ctx.fillText(text, size - padding - bgPadding, size - padding);
}

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
