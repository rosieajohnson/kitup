"use client";

import { useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, ImageOff } from "lucide-react";

/**
 * Product image with click-through when there's more than one photo. Primary
 * (clean product shot) first, then the alternate (e.g. in use). Arrows + dots
 * appear only with 2+ images. Clicking the image calls onZoom with the one
 * currently shown. Falls back to a placeholder when there are no images.
 */
export function ProductImages({
  images,
  name,
  onZoom,
  sizes = "(max-width: 640px) 45vw, 200px",
}: {
  images: string[];
  name: string;
  onZoom?: (url: string) => void;
  sizes?: string;
}) {
  const [i, setI] = useState(0);
  const multi = images.length > 1;
  const idx = Math.min(i, Math.max(0, images.length - 1));
  const url = images[idx] ?? null;

  const go = (delta: number) =>
    setI((prev) => (prev + delta + images.length) % images.length);

  return (
    <div className="group relative mb-2 aspect-square w-full overflow-hidden rounded-lg border border-line bg-white">
      <button
        type="button"
        onClick={() => url && onZoom?.(url)}
        disabled={!url}
        aria-label={url ? `Enlarge ${name}` : undefined}
        className="block h-full w-full"
      >
        {url ? (
          <Image
            src={url}
            alt={name}
            fill
            sizes={sizes}
            className="object-contain p-2 transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="grid h-full w-full place-items-center">
            <ImageOff className="h-6 w-6 text-ink-faint" aria-hidden />
          </div>
        )}
      </button>

      {multi && (
        <>
          <button
            type="button"
            aria-label="Previous image"
            onClick={(e) => {
              e.stopPropagation();
              go(-1);
            }}
            className="absolute left-1 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full bg-black/35 text-white opacity-0 transition-opacity hover:bg-black/55 group-hover:opacity-100 focus:opacity-100"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Next image"
            onClick={(e) => {
              e.stopPropagation();
              go(1);
            }}
            className="absolute right-1 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full bg-black/35 text-white opacity-0 transition-opacity hover:bg-black/55 group-hover:opacity-100 focus:opacity-100"
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
          <div className="absolute inset-x-0 bottom-1.5 flex justify-center gap-1.5">
            {images.map((_, n) => (
              <button
                key={n}
                type="button"
                aria-label={`Image ${n + 1}`}
                aria-current={n === idx}
                onClick={(e) => {
                  e.stopPropagation();
                  setI(n);
                }}
                className={
                  n === idx
                    ? "h-1.5 w-1.5 rounded-full bg-ink"
                    : "h-1.5 w-1.5 rounded-full bg-ink/30 hover:bg-ink/50"
                }
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
