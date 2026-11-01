"use client";

import { ImageUp } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  requestUploadAction,
  saveUploadAction,
} from "@/app/(dashboard)/_actions/uploads";
import {
  ProBadge,
  usePlanFeatures,
  useProWall,
} from "@/components/dashboard/plan-features";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  IMAGE_TYPES,
  type ImageType,
  MAX_IMAGE_BYTES,
} from "@/lib/schemas/upload";
import { putFile } from "@/lib/upload-client";
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
  const { uploads } = usePlanFeatures();
  const proWall = useProWall();

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
      await putFile(form.data, file);
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
      <Label>
        {label}
        <ProBadge />
      </Label>
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
          onClick={() =>
            uploads ? input.current?.click() : proWall("Image uploads")
          }
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
