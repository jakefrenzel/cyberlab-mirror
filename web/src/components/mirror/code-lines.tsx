"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { buttonVariants } from "@/components/ui/button";
import { TOKEN_CLASSES, lineText, type Line } from "@/lib/mirror/lines";
import { cn } from "@/lib/utils";

// FileCard is a file's card: its name, details, copy buttons, and body.
// lines is null for files whose text isn't shown (binary, too large, a
// symlink, empty); children then say why.
export function FileCard({
  name,
  meta,
  lines,
  trailingNewline,
  actions,
  children,
}: {
  name: string;
  meta: string;
  lines: Line[] | null;
  trailingNewline?: boolean;
  // More toolbar buttons, before the copy buttons
  actions?: ReactNode;
  children?: ReactNode;
}) {
  const [selected, setSelected] = useState(0);
  const [copied, setCopied] = useState<"" | "link" | "file">("");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  // The line in the URL's #L12 is selected and scrolled to
  useEffect(() => {
    const select = () => {
      const m = /^#L(\d+)$/.exec(window.location.hash);
      const n = m ? Number(m[1]) : 0;
      if (lines && n >= 1 && n <= lines.length) {
        setSelected(n);
        document.getElementById(`L${n}`)?.scrollIntoView({ block: "center" });
      } else {
        setSelected(0);
      }
    };
    select();
    window.addEventListener("hashchange", select);
    return () => window.removeEventListener("hashchange", select);
  }, [lines]);

  const flash = (what: "link" | "file") => {
    setCopied(what);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(""), 1500);
  };
  const copy = async (text: string, what: "link" | "file") => {
    try {
      await navigator.clipboard.writeText(text);
      flash(what);
    } catch {
      // No clipboard access (an insecure origin, or refused): nothing to show
    }
  };

  const select = (n: number) => {
    const next = selected === n ? 0 : n;
    setSelected(next);
    const url = new URL(window.location.href);
    url.hash = next ? `L${next}` : "";
    window.history.replaceState(window.history.state, "", url);
  };

  return (
    <div className="bg-surface overflow-hidden rounded-[20px]">
      <div className="border-divider flex flex-wrap items-center gap-x-4 gap-y-2.5 border-b py-3 pr-3 pl-5">
        <span className="font-semibold break-all">{name}</span>
        <span className="text-[13px] text-[oklch(0.7_0.01_275)]">{meta}</span>
        <div className="ml-auto flex flex-wrap gap-1.5">
          {actions}
          <button
            type="button"
            className={buttonVariants({ variant: "outline", size: "sm" })}
            onClick={() => {
              const url = new URL(window.location.href);
              url.hash = selected ? `L${selected}` : "";
              void copy(url.toString(), "link");
            }}
          >
            {copied === "link"
              ? "Link copied"
              : selected
                ? `Copy link to line ${selected}`
                : "Copy link"}
          </button>
          {lines && (
            <button
              type="button"
              className={buttonVariants({
                variant: "tonal",
                size: "sm",
                className: "px-4",
              })}
              onClick={() =>
                void copy(
                  lines.map(lineText).join("\n") +
                    (trailingNewline ? "\n" : ""),
                  "file",
                )
              }
            >
              {copied === "file" ? "Copied" : "Copy"}
            </button>
          )}
        </div>
      </div>
      {lines ? (
        <CodeLines lines={lines} selected={selected} onSelect={select} />
      ) : (
        <div className="px-5 py-7 text-[oklch(0.78_0.01_275)]">{children}</div>
      )}
    </div>
  );
}

// CodeLines shows numbered lines. Every token is a text child, which React
// escapes: a file full of markup is shown, never run.
export function CodeLines({
  lines,
  selected = 0,
  onSelect,
}: {
  lines: Line[];
  selected?: number;
  onSelect?: (n: number) => void;
}) {
  return (
    <pre className="overflow-x-auto pt-2.5 pb-3.5 font-mono text-[13px] leading-[21px] [tab-size:4]">
      <code className="block min-w-max">
        {lines.map((line, i) => {
          const n = i + 1;
          const on = n === selected;
          return (
            <div
              key={n}
              id={`L${n}`}
              className={cn(
                "grid grid-cols-[40px_minmax(0,1fr)] md:grid-cols-[64px_minmax(0,1fr)]",
                on && "bg-hl-line",
              )}
            >
              <button
                type="button"
                aria-label={`Line ${n}`}
                onClick={() => onSelect?.(n)}
                className={cn(
                  "cursor-pointer pr-4 text-right select-none hover:text-[oklch(0.9_0.02_275)]",
                  on ? "text-hl-line-number" : "text-dim",
                )}
              >
                {n}
              </button>
              <span className="text-hl-plain pr-5 whitespace-pre">
                {line.map(([text, cls], j) =>
                  cls ? (
                    <span key={j} className={TOKEN_CLASSES[cls]}>
                      {text}
                    </span>
                  ) : (
                    text
                  ),
                )}
              </span>
            </div>
          );
        })}
      </code>
    </pre>
  );
}
