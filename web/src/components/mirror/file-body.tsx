import Link from "next/link";

import { FileCard } from "@/components/mirror/code-lines";
import { buttonVariants } from "@/components/ui/button";
import { formatBytes } from "@/lib/mirror/format";
import { languageName, splitLines, type Line } from "@/lib/mirror/lines";
import type { File } from "@/lib/mirror/schemas";

// FileBody shows a file: its text as numbered, highlighted lines, or why its
// text isn't shown. lines are the file's tokens (from highlight()), and only
// ever become text children, which React escapes: a file full of markup is
// shown, never run.
export function FileBody({
  file,
  lines,
  historyHref,
}: {
  file: File;
  lines: Line[];
  historyHref?: string;
}) {
  const name = file.path.split("/").pop() ?? file.path;
  const text =
    file.type === "file" &&
    !file.binary &&
    !file.too_large &&
    file.content !== "";
  const meta = [
    text ? `${splitLines(file.content).length} lines` : null,
    formatBytes(file.size),
    file.type === "symlink"
      ? "Symbolic link"
      : file.binary
        ? "Binary"
        : languageName(file.path, file.content),
    file.executable ? "executable" : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const actions = historyHref && (
    <Link
      href={historyHref}
      className={buttonVariants({ variant: "outline", size: "sm" })}
    >
      History
    </Link>
  );

  let reason;
  if (file.type === "symlink") {
    reason = (
      <>
        Symbolic link to{" "}
        <code className="font-mono break-all">{file.target}</code> (not
        followed).
      </>
    );
  } else if (file.too_large) {
    reason = (
      <>This file is {formatBytes(file.size)}, too large to show here.</>
    );
  } else if (file.binary) {
    reason = <>This is a binary file, so it isn&apos;t shown.</>;
  } else if (file.content === "") {
    reason = <>This file is empty.</>;
  }

  return (
    <FileCard
      name={name}
      meta={meta}
      lines={text ? lines : null}
      trailingNewline={/\n$/.test(file.content)}
      actions={actions}
    >
      {reason}
    </FileCard>
  );
}
