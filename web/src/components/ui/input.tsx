import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

// cyberlab-mirror: borderless tonal fields. "auth" is the larger field on the
// login card, "account" the one inside account sections.
const inputVariants = cva(
  "w-full border-0 text-[oklch(0.94_0.01_275)] outline-none focus-visible:ring-2 focus-visible:ring-primary/70 aria-invalid:ring-2 aria-invalid:ring-[oklch(0.7_0.15_25/.7)]",
  {
    variants: {
      variant: {
        auth: "h-[50px] rounded-[14px] bg-field-auth px-4 text-[15px]",
        account: "h-[46px] rounded-xl bg-field px-3.5 text-[15px]",
      },
    },
    defaultVariants: { variant: "auth" },
  },
);

export type InputVariant = VariantProps<typeof inputVariants>["variant"];

export function Input({
  className,
  variant,
  ...props
}: ComponentProps<"input"> & { variant?: InputVariant }) {
  return (
    <input className={cn(inputVariants({ variant }), className)} {...props} />
  );
}
