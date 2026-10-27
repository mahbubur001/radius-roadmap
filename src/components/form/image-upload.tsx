"use client";

import { ImageUp, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  requestUploadAction,
  saveUploadAction,
} from "@/app/(dashboard)/_actions/uploads";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { initials } from "@/lib/initials";
import {
  IMAGE_TYPES,
  type ImageType,
  MAX_IMAGE_BYTES,
  type UploadPurpose,
} from "@/lib/schemas/upload";
import { cn } from "@/lib/utils";

/**
 * Avatar/logo picker: asks the server for a signed upload form, posts the
 * file straight to storage, then saves the key. `null` removes the image.
 */
export function ImageUpload({
  purpose,
  workspaceId,
  name,
  url: initialUrl,
  rounded = "full",
}: {
  purpose: UploadPurpose;
  workspaceId?: string;
  /** Used for the initials fallback. */
  name: string;
  url: string | null;
  rounded?: "full" | "md";
}) {
  const input = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState(initialUrl);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    if (!(file.type in IMAGE_TYPES)) {
      toast.error("Use a PNG, JPEG or WebP image.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error("Images must be 2 MB or smaller.");
      return;
    }
    setBusy(true);
    try {
      const form = await requestUploadAction({
        purpose,
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

      await save(form.data.key);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function save(key: string | null) {
    const result = await saveUploadAction({ purpose, workspaceId, key });
    if (!result.ok) throw new Error(result.error);
    setUrl(result.data.url);
    toast.success(key ? "Image updated." : "Image removed.");
  }

  const shape = rounded === "md" ? "rounded-md" : "rounded-full";

  return (
    <div className="flex items-center gap-4">
      <Avatar className={cn("size-16", shape)}>
        {url ? <AvatarImage src={url} alt="" className="object-cover" /> : null}
        <AvatarFallback className={cn("text-lg", shape)}>
          {initials(name)}
        </AvatarFallback>
      </Avatar>
      <input
        ref={input}
        type="file"
        accept={Object.keys(IMAGE_TYPES).join(",")}
        className="hidden"
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
          {busy ? "Uploading…" : url ? "Change" : "Upload"}
        </Button>
        {url ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              save(null)
                .catch((e: Error) => toast.error(e.message))
                .finally(() => setBusy(false));
            }}
          >
            <Trash2 />
            Remove
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        PNG, JPEG or WebP, up to 2 MB.
      </p>
    </div>
  );
}
