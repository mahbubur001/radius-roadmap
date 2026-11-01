"use client";

import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

/** Read-only code or link with a copy button (embed and widget snippets). */
export function CopyBlock({ label, value }: { label: string; value: string }) {
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
