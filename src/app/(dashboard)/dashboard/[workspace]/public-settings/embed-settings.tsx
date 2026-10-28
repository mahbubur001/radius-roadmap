"use client";

import { Copy, ExternalLink } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { SettingsSection } from "@/components/dashboard/settings-section";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function CopyBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      <div className="flex items-start gap-2">
        <pre className="flex-1 overflow-x-auto rounded-md border bg-muted px-3 py-2 font-mono text-xs whitespace-pre-wrap break-all">
          {value}
        </pre>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={`Copy ${label.toLowerCase()}`}
          onClick={() => {
            void navigator.clipboard.writeText(value);
            toast.success("Copied.");
          }}
        >
          <Copy />
        </Button>
      </div>
    </div>
  );
}

export function EmbedSettings({
  origin,
  account,
  workspace,
  roadmaps,
}: {
  origin: string;
  account: string;
  workspace: string;
  roadmaps: { slug: string; title: string }[];
}) {
  const [board, setBoard] = useState(roadmaps[0]?.slug ?? "");
  const isFirst = board === roadmaps[0]?.slug;
  const publicUrl = `${origin}/${account}/${workspace}/roadmap${isFirst ? "" : `?board=${board}`}`;
  const snippet = `<script src="${origin}/embed.js" data-account="${account}" data-workspace="${workspace}"${
    isFirst ? "" : ` data-board="${board}"`
  } async></script>`;
  const previewUrl = `${origin}/${account}/${workspace}/roadmap?embed=1${isFirst ? "" : `&board=${board}`}`;

  if (!roadmaps.length) {
    return (
      <SettingsSection
        title="Public roadmap"
        description="No roadmap is public yet. Turn on “Public roadmap” under Roadmap → Edit roadmap."
      >
        {null}
      </SettingsSection>
    );
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <SettingsSection
        title="Public roadmap"
        description="Share this link, or embed the roadmap on your own website."
      >
        <div className="flex flex-col gap-4">
          {roadmaps.length > 1 ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="embed-board">Roadmap</Label>
              <Select value={board} onValueChange={setBoard}>
                <SelectTrigger id="embed-board" className="w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roadmaps.map((r) => (
                    <SelectItem key={r.slug} value={r.slug}>
                      {r.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <CopyBlock label="Public link" value={publicUrl} />
          <Button variant="outline" size="sm" className="self-start" asChild>
            <a href={publicUrl} target="_blank" rel="noreferrer">
              <ExternalLink />
              Open public roadmap
            </a>
          </Button>
          <CopyBlock label="Embed code" value={snippet} />
          <p className="text-xs text-muted-foreground">
            Paste the embed code where the roadmap should appear (for WordPress,
            use a Custom HTML block). It grows to fit its content, so there is
            no inner scrollbar, and visitors can vote inside it.
          </p>
        </div>
      </SettingsSection>
      <SettingsSection
        title="Preview"
        description="How the embed looks on your site."
      >
        <iframe
          key={previewUrl}
          src={previewUrl}
          title="Embed preview"
          className="h-[600px] w-full rounded-md border"
        />
      </SettingsSection>
    </div>
  );
}
