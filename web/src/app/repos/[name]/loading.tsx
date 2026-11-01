import { Skeleton } from "@/components/ui/skeleton";

// The boundary that lets these pages read the session at request time.
export default function Loading() {
  return (
    <main
      aria-busy
      aria-label="Loading"
      className="grid gap-5 px-4 pt-1 pb-10 md:px-6 md:pt-3"
    >
      <div className="grid gap-3">
        <Skeleton className="h-8 w-80 max-w-full rounded-full" />
        <Skeleton className="h-5 w-96 max-w-full rounded-full" />
      </div>
      <Skeleton className="h-11 rounded-t-xl" />
      <div className="flex items-start gap-5">
        <Skeleton className="hidden h-96 w-[272px] shrink-0 rounded-[20px] md:block" />
        <Skeleton className="h-96 flex-1 rounded-[20px]" />
      </div>
    </main>
  );
}
