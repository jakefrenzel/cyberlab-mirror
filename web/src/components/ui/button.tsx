import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

// cyberlab-mirror: the redesign's pill buttons.
export const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:pointer-events-none disabled:opacity-60",
  {
    variants: {
      variant: {
        default: "bg-primary text-on-primary hover:bg-[oklch(0.84_0.08_275)]",
        tonal: "bg-selected text-on-selected hover:bg-[oklch(0.4_0.05_275)]",
        outline: "border border-outline text-fg hover:bg-container-high",
        destructive:
          "border border-destructive-border text-destructive hover:bg-[oklch(0.7_0.15_25/.12)]",
        error:
          "bg-error-button text-on-error-button hover:bg-[oklch(0.9_0.07_25)]",
        ghost: "text-[oklch(0.84_0.01_275)] hover:bg-container-high",
        link: "h-auto rounded-none px-0 font-medium text-link hover:text-link-hover",
      },
      size: {
        sm: "h-[34px] px-3.5 text-[13px]",
        md: "h-10 px-5 text-sm",
        lg: "h-[50px] px-6 text-[15px]",
      },
    },
    compoundVariants: [{ variant: "link", className: "h-auto px-0" }],
    defaultVariants: { variant: "default", size: "md" },
  },
);

export function Button({
  className,
  variant,
  size,
  ...props
}: ComponentProps<"button"> & VariantProps<typeof buttonVariants>) {
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
