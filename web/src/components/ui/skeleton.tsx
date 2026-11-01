import { cn } from "@/lib/utils";

// Skeleton is a placeholder block while a page loads.
export function Skeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("bg-surface animate-pulse", className)} />
  );
}
