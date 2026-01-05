"use client";

import { useMemo } from "react";
import { generateSVGDataURI } from "@/lib/svgGenerator";

interface AnimatedArtworkProps {
  participantCount: number;
}

/**
 * Renders SVG artwork for a given participant count
 * Uses client-side SVG generation for efficiency
 */
export function AnimatedArtwork({ participantCount }: AnimatedArtworkProps) {
  const svgDataUri = useMemo(
    () => generateSVGDataURI(participantCount),
    [participantCount]
  );

  return (
    <img
      src={svgDataUri}
      alt={`Here, For Now - ${participantCount} participants`}
      className="w-full aspect-square max-w-xs md:max-w-md lg:max-w-xl object-contain"
    />
  );
}
