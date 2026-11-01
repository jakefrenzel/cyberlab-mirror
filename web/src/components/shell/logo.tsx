import { cn } from "@/lib/utils";

// Logo is the mark: two nested rounded squares.
export function Logo({ large = false }: { large?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "bg-primary grid shrink-0 place-items-center",
        large ? "size-10 rounded-xl" : "size-8 rounded-[10px]",
      )}
    >
      <span
        className={cn(
          "bg-logo-mark",
          large ? "size-[15px] rounded-[5px]" : "size-3 rounded-[4px]",
        )}
      />
    </span>
  );
}

// SearchRing is the search icon: a ring in the text colour.
export function SearchRing({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("shrink-0 rounded-full border-2 border-current", className)}
    />
  );
}
