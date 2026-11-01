"use client";

// From the auth module's Next.js template (github.com/atlasopsec/auth, templates/nextjs), version 0.1.0.
// cyberlab-mirror: restyled, with a field variant and a slot beside the label.
import { useId, type ComponentProps, type ReactNode } from "react";

import { Input, type InputVariant } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type FieldProps = ComponentProps<"input"> & {
  name: string;
  label: string;
  error?: string;
  variant?: InputVariant;
  // Shown at the end of the label's row, like "Forgot your password?"
  labelEnd?: ReactNode;
};

// Field is a labelled input with its error, linked for screen readers.
export function Field({
  name,
  label,
  error,
  variant,
  labelEnd,
  className,
  ...props
}: FieldProps) {
  // Unique on the page, even with two fields of the same name.
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className={cn("grid gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={id}>{label}</Label>
        {labelEnd}
      </div>
      <Input
        id={id}
        name={name}
        variant={variant}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        {...props}
      />
      {error && (
        <p id={errorId} className="text-failed text-[13px]">
          {error}
        </p>
      )}
    </div>
  );
}

// FormMessage is an error for the whole form.
export function FormMessage({ message }: { message?: string }) {
  return (
    <p
      role="alert"
      aria-live="polite"
      className="text-failed text-sm leading-normal empty:hidden"
    >
      {message}
    </p>
  );
}

// Notice is a success message.
export function Notice({ children }: { children: ReactNode }) {
  return (
    <p
      role="status"
      className="bg-success-bg text-success rounded-[14px] px-4 py-3 leading-[1.45]"
    >
      {children}
    </p>
  );
}
