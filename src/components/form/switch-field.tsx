"use client";

import {
  type Control,
  Controller,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";

/** On/off setting bound to React Hook Form. */
export function SwitchField<T extends FieldValues>({
  control,
  name,
  label,
  description,
}: {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  description?: string;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <Field orientation="horizontal">
          <FieldContent>
            <FieldLabel htmlFor={name}>{label}</FieldLabel>
            {description ? (
              <FieldDescription>{description}</FieldDescription>
            ) : null}
          </FieldContent>
          <Switch
            id={name}
            checked={Boolean(field.value)}
            onCheckedChange={field.onChange}
          />
        </Field>
      )}
    />
  );
}
