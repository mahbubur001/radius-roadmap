"use client";

import type { ComponentProps } from "react";
import {
  type Control,
  Controller,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

type Props<T extends FieldValues> = {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  description?: string;
} & Omit<ComponentProps<typeof Input>, "name" | "defaultValue">;

/** Text input bound to React Hook Form, rendered with shadcn Field. */
export function TextField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  ...inputProps
}: Props<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={name}>{label}</FieldLabel>
          <Input
            {...inputProps}
            {...field}
            id={name}
            value={field.value ?? ""}
            aria-invalid={fieldState.invalid}
          />
          {description ? (
            <FieldDescription>{description}</FieldDescription>
          ) : null}
          {fieldState.invalid ? (
            <FieldError errors={[fieldState.error]} />
          ) : null}
        </Field>
      )}
    />
  );
}
