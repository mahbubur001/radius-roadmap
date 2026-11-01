"use client";

import Link from "next/link";
import {
  type Control,
  Controller,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";
import { Badge } from "@/components/ui/badge";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";

/**
 * On/off setting bound to React Hook Form. `locked` names the plan a gated
 * switch needs: it can still be turned off, but not on.
 */
export function SwitchField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  locked,
}: {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  description?: string;
  locked?: { plan: string; href: string } | null;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <Field orientation="horizontal">
          <FieldContent>
            <FieldLabel htmlFor={name}>
              {label}
              {locked ? (
                <Link href={locked.href}>
                  <Badge variant="secondary" className="cursor-pointer">
                    {locked.plan} plan
                  </Badge>
                </Link>
              ) : null}
            </FieldLabel>
            {description ? (
              <FieldDescription>{description}</FieldDescription>
            ) : null}
          </FieldContent>
          <Switch
            id={name}
            checked={Boolean(field.value)}
            onCheckedChange={field.onChange}
            disabled={!!locked && !field.value}
          />
        </Field>
      )}
    />
  );
}
