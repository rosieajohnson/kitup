"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Check, Upload, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { COVER_GALLERY } from "@/lib/cover-images";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

// Some browsers report an empty/odd MIME type (iPhone HEIC, AVIF, images with no
// clean type), so accept by extension too and derive a content-type from it.
const EXT_TYPE: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  bmp: "image/bmp",
  heic: "image/heic",
  heif: "image/heif",
};

export function CoverImagePicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (src: string | null) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isGallery = value
    ? COVER_GALLERY.some((c) => c.src === value)
    : false;
  const isCustom = Boolean(value) && !isGallery;

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    setError(null);

    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    const isImage = file.type.startsWith("image/") || ext in EXT_TYPE;
    if (!isImage) {
      setError("Please choose an image file (JPG, PNG, WEBP or HEIC).");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Image must be 5 MB or smaller.");
      return;
    }
    if (!isSupabaseConfigured()) {
      setError("Uploading needs Supabase connected.");
      return;
    }

    setUploading(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("Sign in as your school to upload.");
      setUploading(false);
      return;
    }

    // iPhone HEIC/HEIF photos can't be shown by browsers or Next's image
    // optimizer, so convert to JPEG in the browser before upload.
    let uploadBlob: Blob = file;
    let uploadExt = ext || "jpg";
    let contentType = file.type || EXT_TYPE[ext] || "application/octet-stream";
    const isHeic =
      ext === "heic" ||
      ext === "heif" ||
      contentType === "image/heic" ||
      contentType === "image/heif";
    if (isHeic) {
      try {
        const heic2any = (await import("heic2any")).default;
        const out = await heic2any({
          blob: file,
          toType: "image/jpeg",
          quality: 0.85,
        });
        uploadBlob = Array.isArray(out) ? out[0] : out;
        uploadExt = "jpg";
        contentType = "image/jpeg";
      } catch {
        setError(
          "We couldn't process that iPhone photo — please try a JPG or PNG.",
        );
        setUploading(false);
        return;
      }
    }

    const path = `${user.id}/${crypto.randomUUID()}.${uploadExt}`;
    const { error: upErr } = await supabase.storage
      .from("campaign-images")
      .upload(path, uploadBlob, { contentType, upsert: false });
    if (upErr) {
      setError(upErr.message);
      setUploading(false);
      return;
    }
    const {
      data: { publicUrl },
    } = supabase.storage.from("campaign-images").getPublicUrl(path);
    onChange(publicUrl);
    setUploading(false);
  }

  const labelCls = "mb-1.5 block text-sm font-semibold text-ink";

  return (
    <div>
      <span className={labelCls}>Cover image</span>

      {/* Gallery */}
      <div className="grid grid-cols-3 gap-3">
        {COVER_GALLERY.map((opt) => {
          const selected = value === opt.src;
          return (
            <button
              key={opt.src}
              type="button"
              onClick={() => {
                setError(null);
                onChange(opt.src);
              }}
              aria-pressed={selected}
              className={cn(
                "group relative aspect-[16/10] overflow-hidden rounded-lg border-2 bg-surface-sunk transition-colors",
                selected
                  ? "border-coral"
                  : "border-transparent hover:border-line-strong",
              )}
            >
              <Image
                src={opt.src}
                alt={opt.label}
                fill
                sizes="(max-width: 768px) 33vw, 200px"
                className="object-cover"
              />
              {selected && (
                <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-coral text-white">
                  <Check className="h-3 w-3" aria-hidden />
                </span>
              )}
              <span className="absolute inset-x-0 bottom-0 bg-ink/55 px-1.5 py-0.5 text-[11px] font-medium text-white">
                {opt.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Upload + custom preview */}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-surface px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-surface-sunk disabled:opacity-50"
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Upload className="h-4 w-4" aria-hidden />
          )}
          {uploading ? "Uploading…" : "Upload your own"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,.heic,.heif"
          className="hidden"
          onChange={onFile}
        />

        {isCustom && value && (
          <span className="inline-flex items-center gap-2">
            <span className="relative h-12 w-20 overflow-hidden rounded-md border border-line bg-surface-sunk">
              <Image
                src={value}
                alt="Your cover"
                fill
                sizes="80px"
                className="object-cover"
              />
            </span>
            <span className="text-sm text-ink-soft">Your image</span>
          </span>
        )}

        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="inline-flex items-center gap-1 text-sm font-medium text-ink-faint hover:text-coral"
          >
            <X className="h-4 w-4" aria-hidden /> Remove
          </button>
        )}
      </div>

      <p className="mt-2 text-xs text-ink-faint">
        Pick a built-in sports image, or upload your own (JPG, PNG or iPhone
        HEIC, up to 5 MB).
      </p>
      {error && (
        <p role="alert" className="mt-1 text-sm font-medium text-coral-dark">
          {error}
        </p>
      )}
    </div>
  );
}
