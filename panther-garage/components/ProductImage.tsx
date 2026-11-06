"use client";

import { useEffect, useState } from "react";
import { ImageOff } from "lucide-react";

export default function ProductImage({
  src,
  alt,
  className = "",
  imageClassName = "",
  compact = false,
}: {
  src?: string | null;
  alt: string;
  className?: string;
  imageClassName?: string;
  compact?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  const showImage = Boolean(src) && !failed;

  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden bg-white/[.04] ${className}`}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src || ""}
          alt={alt}
          loading="lazy"
          className={`h-full w-full object-cover ${imageClassName}`}
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="flex flex-col items-center justify-center gap-2 px-2 text-center text-gray-500">
          <ImageOff size={compact ? 18 : 28} aria-hidden="true" />
          {!compact && (
            <span className="text-[9px] uppercase tracking-[.16em]">Image not yet available</span>
          )}
        </div>
      )}
    </div>
  );
}
