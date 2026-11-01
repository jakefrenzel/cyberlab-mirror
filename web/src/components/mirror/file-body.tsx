import { formatBytes } from "@/lib/mirror/format";
import type { File } from "@/lib/mirror/schemas";

// FileBody shows a file's text. The content is only ever a text child, which
// React escapes: a file full of markup is shown, never run.
export function FileBody({ file }: { file: File }) {
  if (file.type === "symlink") {
    return (
      <p className="rounded border border-neutral-200 p-4 text-sm dark:border-neutral-800">
        Symbolic link to <code className="font-mono">{file.target}</code> (not
        followed).
      </p>
    );
  }
  if (file.too_large) {
    return (
      <p className="rounded border border-neutral-200 p-4 text-sm dark:border-neutral-800">
        This file is {formatBytes(file.size)}, too large to show here.
      </p>
    );
  }
  if (file.binary) {
    return (
      <p className="rounded border border-neutral-200 p-4 text-sm dark:border-neutral-800">
        This is a binary file, so it isn&apos;t shown.
      </p>
    );
  }
  if (file.content === "") {
    return (
      <p className="rounded border border-neutral-200 p-4 text-sm dark:border-neutral-800">
        This file is empty.
      </p>
    );
  }
  return (
    <pre className="overflow-x-auto rounded border border-neutral-200 bg-neutral-50 p-4 font-mono text-xs leading-5 dark:border-neutral-800 dark:bg-neutral-900">
      <code>{file.content}</code>
    </pre>
  );
}
