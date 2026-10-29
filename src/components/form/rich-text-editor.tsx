"use client";

import Image from "@tiptap/extension-image";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Code,
  Heading2,
  Heading3,
  ImageIcon,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Underline,
  Video,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  requestUploadAction,
  saveUploadAction,
} from "@/app/(dashboard)/_actions/uploads";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  IMAGE_TYPES,
  type ImageType,
  MAX_IMAGE_BYTES,
} from "@/lib/schemas/upload";
import { cn } from "@/lib/utils";
import { parseVideoUrl } from "@/lib/video";
import { VideoNode } from "./video-node";

export type RichTextValue = Record<string, unknown> | null;

/**
 * Tiptap editor for card descriptions. Stores JSON; the server renders it
 * through the allow-list in src/lib/rich-text.ts. Images upload to storage
 * (purpose "card-image") and are inserted by URL.
 */
export function RichTextEditor({
  value,
  onChange,
  workspaceId,
  label,
}: {
  value: RichTextValue;
  onChange: (value: RichTextValue) => void;
  workspaceId: string;
  label: string;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    // Re-render on every change so the toolbar's active states stay current.
    shouldRerenderOnTransaction: true,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: { openOnClick: false, autolink: true },
      }),
      Image,
      VideoNode,
    ],
    content: value ?? "",
    editorProps: {
      attributes: {
        "aria-label": label,
        class:
          "rich-text min-h-32 px-3 py-2 text-sm focus-visible:outline-none",
      },
    },
    // A plain JSON copy: some node attrs (e.g. videos) aren't plain objects,
    // and server actions can't serialize those ("$T" temporary references).
    onUpdate: ({ editor }) =>
      onChange(
        editor.isEmpty
          ? null
          : (JSON.parse(JSON.stringify(editor.getJSON())) as RichTextValue),
      ),
  });

  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function uploadImage(file: File) {
    if (!editor) return;
    if (!(file.type in IMAGE_TYPES)) {
      return toast.error("Use a PNG, JPEG or WebP image.");
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return toast.error("Images must be 2 MB or smaller.");
    }
    setUploading(true);
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
      body.append("file", file);
      const res = await fetch(form.data.url, { method: "POST", body });
      if (!res.ok) throw new Error("Upload failed. Try again.");
      const saved = await saveUploadAction({
        purpose: "card-image",
        workspaceId,
        key: form.data.key,
      });
      if (!saved.ok || !saved.data.url) {
        throw new Error(saved.ok ? "Upload failed." : saved.error);
      }
      editor.chain().focus().setImage({ src: saved.data.url }).run();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  if (!editor) {
    return <div className="min-h-40 rounded-md border bg-muted/30" />;
  }

  const state = {
    bold: editor.isActive("bold"),
    italic: editor.isActive("italic"),
    underline: editor.isActive("underline"),
    code: editor.isActive("code"),
    h2: editor.isActive("heading", { level: 2 }),
    h3: editor.isActive("heading", { level: 3 }),
    bullet: editor.isActive("bulletList"),
    ordered: editor.isActive("orderedList"),
    link: editor.isActive("link"),
    href: (editor.getAttributes("link").href as string | undefined) ?? "",
  };

  const chain = () => editor.chain().focus();
  const tools = [
    {
      label: "Bold",
      icon: Bold,
      on: state.bold,
      run: () => chain().toggleBold().run(),
    },
    {
      label: "Italic",
      icon: Italic,
      on: state.italic,
      run: () => chain().toggleItalic().run(),
    },
    {
      label: "Underline",
      icon: Underline,
      on: state.underline,
      run: () => chain().toggleUnderline().run(),
    },
    {
      label: "Heading",
      icon: Heading2,
      on: state.h2,
      run: () => chain().toggleHeading({ level: 2 }).run(),
    },
    {
      label: "Subheading",
      icon: Heading3,
      on: state.h3,
      run: () => chain().toggleHeading({ level: 3 }).run(),
    },
    {
      label: "Bulleted list",
      icon: List,
      on: state.bullet,
      run: () => chain().toggleBulletList().run(),
    },
    {
      label: "Numbered list",
      icon: ListOrdered,
      on: state.ordered,
      run: () => chain().toggleOrderedList().run(),
    },
    {
      label: "Code",
      icon: Code,
      on: state.code,
      run: () => chain().toggleCode().run(),
    },
  ];

  return (
    <div className="rounded-md border focus-within:ring-2 focus-within:ring-ring/50">
      <div className="flex flex-wrap items-center gap-0.5 border-b p-1">
        {tools.map(({ label: name, icon: Icon, on, run }) => (
          <Button
            key={name}
            type="button"
            variant="ghost"
            size="icon"
            className={cn("size-7", on && "bg-accent")}
            aria-label={name}
            aria-pressed={on}
            onClick={run}
          >
            <Icon />
          </Button>
        ))}
        <LinkButton
          active={state.link}
          href={state.href}
          onSet={(href) =>
            href
              ? chain().extendMarkRange("link").setLink({ href }).run()
              : chain().extendMarkRange("link").unsetLink().run()
          }
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label="Insert image"
          disabled={uploading}
          onClick={() => fileInput.current?.click()}
        >
          <ImageIcon />
        </Button>
        <VideoButton
          onInsert={(video) =>
            chain().insertContent({ type: "video", attrs: video }).run()
          }
        />
        <input
          ref={fileInput}
          type="file"
          className="hidden"
          accept={Object.keys(IMAGE_TYPES).join(",")}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void uploadImage(file);
          }}
        />
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

function LinkButton({
  active,
  href,
  onSet,
}: {
  active: boolean;
  href: string;
  onSet: (href: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setValue(href);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn("size-7", active && "bg-accent")}
          aria-label="Link"
          aria-pressed={active}
        >
          <LinkIcon />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const v = value.trim();
            onSet(v ? (/^[a-z]+:/i.test(v) ? v : `https://${v}`) : null);
            setOpen(false);
          }}
        >
          <Input
            autoFocus
            aria-label="Link URL"
            placeholder="https://"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <Button type="submit" size="sm">
            {value.trim() ? "Save" : "Remove"}
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

/** Paste a YouTube or Vimeo link to embed the video. */
function VideoButton({
  onInsert,
}: {
  onInsert: (video: { provider: string; id: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setValue("");
        setError("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label="Insert video"
        >
          <Video />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const video = parseVideoUrl(value);
            if (!video) {
              setError("Paste a YouTube or Vimeo link.");
              return;
            }
            onInsert(video);
            setOpen(false);
          }}
        >
          <div className="flex gap-2">
            <Input
              autoFocus
              aria-label="Video link"
              placeholder="https://youtube.com/watch?v=…"
              value={value}
              aria-invalid={!!error}
              onChange={(e) => {
                setValue(e.target.value);
                setError("");
              }}
            />
            <Button type="submit" size="sm">
              Embed
            </Button>
          </div>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </form>
      </PopoverContent>
    </Popover>
  );
}
