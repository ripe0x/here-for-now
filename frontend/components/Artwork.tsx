"use client";

interface ArtworkProps {
  imageData?: string;
  isLoading?: boolean;
  error?: string;
}

export function Artwork({ imageData, isLoading, error }: ArtworkProps) {
  if (error) {
    return (
      <div className="w-full aspect-square max-w-sm md:max-w-lg lg:max-w-2xl flex items-center justify-center border border-red-500/30">
        <span className="text-red-400 text-sm">{error}</span>
      </div>
    );
  }

  if (isLoading || !imageData) {
    return (
      <div className="w-full aspect-square max-w-sm md:max-w-lg lg:max-w-2xl flex items-center justify-center border border-white/10">
        <span className="text-white/30">{isLoading ? "Loading artwork..." : "No artwork data"}</span>
      </div>
    );
  }

  // Handle base64 SVG - decode and render inline
  if (imageData.startsWith("data:image/svg+xml;base64,")) {
    try {
      const base64 = imageData.slice(26);
      const svg = atob(base64);
      return (
        <div
          className="w-full aspect-square max-w-sm md:max-w-lg lg:max-w-2xl [&>svg]:w-full [&>svg]:h-full"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      );
    } catch (e) {
      console.error("Failed to decode SVG:", e);
    }
  }

  // Handle data URI or regular URL - use img tag
  return (
    <img
      src={imageData}
      alt="Here, For Now"
      className="w-full aspect-square max-w-sm md:max-w-lg lg:max-w-2xl object-contain"
    />
  );
}
