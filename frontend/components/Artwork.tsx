"use client";

interface ArtworkProps {
  imageData?: string;
  isLoading?: boolean;
  error?: string;
}

export function Artwork({ imageData, isLoading, error }: ArtworkProps) {
  if (error) {
    return (
      <div className="w-full aspect-square max-w-xs md:max-w-md lg:max-w-xl flex items-center justify-center border border-red-500/30">
        <span className="text-red-400 text-xs">{error}</span>
      </div>
    );
  }

  if (isLoading || !imageData) {
    return (
      <div className="w-full aspect-square max-w-xs md:max-w-md lg:max-w-xl flex items-center justify-center border border-white/10">
        <span className="text-white/30 text-xs">{isLoading ? "Loading artwork..." : "No artwork data"}</span>
      </div>
    );
  }

  // Render as img tag to allow right-click copy/save
  return (
    <img
      src={imageData}
      alt="Here, For Now"
      className="w-full aspect-square max-w-xs md:max-w-md lg:max-w-xl object-contain"
    />
  );
}
