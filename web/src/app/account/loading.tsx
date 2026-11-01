// From the auth module's Next.js template (github.com/atlasopsec/auth, templates/nextjs), version 0.1.0.
// cyberlab-mirror: skeleton blocks in the account page's layout.
import { Skeleton } from "@/components/ui/skeleton";

// The boundary that lets these pages read the session at request time.
export default function Loading() {
  return (
    <main
      aria-busy
      aria-label="Loading"
      className="grid items-start gap-4 px-4 pt-2 pb-10 md:grid-cols-[220px_minmax(0,760px)] md:gap-8 md:px-6 md:pt-4"
    >
      <Skeleton className="h-10 w-40 rounded-full" />
      <div className="grid gap-4 md:pt-[52px]">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-32 rounded-3xl" />
        ))}
      </div>
    </main>
  );
}
