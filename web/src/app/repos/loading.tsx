import { Skeleton } from "@/components/ui/skeleton";

// The boundary that lets these pages read the session at request time.
export default function Loading() {
  return (
    <main
      aria-busy
      aria-label="Loading"
      className="grid items-start gap-4 px-4 pt-2 pb-8 md:grid-cols-[300px_minmax(0,1fr)] md:gap-6 md:px-6 md:pt-4"
    >
      <div className="grid gap-4">
        <Skeleton className="h-48 rounded-[28px] md:h-80" />
        <Skeleton className="hidden h-36 rounded-[28px] md:block" />
      </div>
      <div className="grid gap-1">
        <Skeleton className="mb-3 h-9 w-72 max-w-full rounded-full" />
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-[76px] rounded-2xl" />
        ))}
      </div>
    </main>
  );
}
