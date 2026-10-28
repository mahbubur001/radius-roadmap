"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export type WorkspaceOption = { id: string; name: string };

/** Pick which workspaces a member can open. */
export function WorkspaceChecklist({
  workspaces,
  value,
  onChange,
}: {
  workspaces: WorkspaceOption[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {workspaces.map((w) => {
        const id = `ws-${w.id}`;
        return (
          <div key={w.id} className="flex items-center gap-2">
            <Checkbox
              id={id}
              checked={value.includes(w.id)}
              onCheckedChange={(checked) =>
                onChange(
                  checked ? [...value, w.id] : value.filter((v) => v !== w.id),
                )
              }
            />
            <Label htmlFor={id} className="font-normal">
              {w.name}
            </Label>
          </div>
        );
      })}
    </div>
  );
}
