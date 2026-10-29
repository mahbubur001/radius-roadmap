"use client";

import { ImageUp } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  requestUploadAction,
  saveUploadAction,
} from "@/app/(dashboard)/_actions/uploads";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  IMAGE_TYPES,
  type ImageType,
  MAX_IMAGE_BYTES,
} from "@/lib/schemas/upload";
import { cn } from "@/lib/utils";

/**
 * One optional image (post cover, card header), uploaded like images in
 * rich text ("card-image" purpose). `onSave` stores the key (or null).
 */
export function ImageUploadField({
  label,
  addLabel,
  className,
  workspaceId,
  url: initial,
  onSave,
}: {
  label: string;
  addLabel: string;
  /** Aspect ratio of the preview, e.g. "aspect-[16/9]". */
  className: string;
  workspaceId: string;
  url: string | null;
  onSave: (key: string | null) => Promise<boolean>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    if (!(file.type in IMAGE_TYPES)) {
      return toast.error("Use a PNG, JPEG or WebP image.");
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return toast.error("Images must be 2 MB or smaller.");
    }
    setBusy(true);
    try {
      const form = await requestUploadAction({
        purpose: "card-image",
        workspaceId,
        contentType: file.type as ImageType,
        size: file.size,
      });
      if (!form.ok) throw new Error(form.error);
      const body = new FormData();
      for (const [k, v] of Object.entries(form.data.fields)) body.append(k, v);
      body.append("file", file); // must be the last field for S3
      const res = await fetch(form.data.url, { method: "POST", body });
      if (!res.ok) throw new Error("Upload failed. Try again.");
      const saved = await saveUploadAction({
        purpose: "card-image",
        workspaceId,
        key: form.data.key,
      });
      if (!saved.ok) throw new Error(saved.error);
      if (await onSave(form.data.key)) setUrl(saved.data.url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      {url ? (
        // biome-ignore lint/performance/noImgElement: user upload, any size
        <img
          src={url}
          alt=""
          className={cn("w-full rounded-md border object-cover", className)}
        />
      ) : null}
      <input
        ref={input}
        type="file"
        hidden
        aria-label={`${label} file`}
        accept={Object.keys(IMAGE_TYPES).join(",")}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          <ImageUp />
          {busy ? "Uploading…" : url ? "Change" : addLabel}
        </Button>
        {url ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={async () => {
              if (await onSave(null)) setUrl(null);
            }}
          >
            Remove
          </Button>
        ) : null}
      </div>
    </div>
  );
}
