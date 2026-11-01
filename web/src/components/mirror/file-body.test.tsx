// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { FileBody } from "@/components/mirror/file-body";
import { highlight } from "@/lib/mirror/highlight";
import { plainLines } from "@/lib/mirror/lines";
import type { File } from "@/lib/mirror/schemas";

const base: File = {
  path: "README.md",
  type: "file",
  size: 10,
  executable: false,
  binary: false,
  too_large: false,
  content: "",
};

// codeText is the text of every line, joined as the file was.
function codeText(container: HTMLElement): string {
  return [...container.querySelectorAll("pre [id^=L] > span")]
    .map((l) => l.textContent)
    .join("\n");
}

describe("FileBody", () => {
  const hostile =
    '<script>alert(1)</script>\n<img src=x onerror="alert(2)">\n<a href="javascript:alert(3)">x</a>\n<svg onload="alert(4)"></svg>';

  it("shows markup in a file as text, never as elements", () => {
    const { container } = render(
      <FileBody
        file={{ ...base, content: hostile }}
        lines={plainLines(hostile)}
      />,
    );
    for (const tag of ["script", "img", "a", "svg"]) {
      expect(container.querySelector(tag)).toBeNull();
    }
    expect(codeText(container)).toBe(hostile);
  });

  it("keeps markup as text after highlighting too", async () => {
    for (const path of ["index.html", "page.svelte", "README.md", "x.tsx"]) {
      const lines = await highlight(path, hostile);
      const { container, unmount } = render(
        <FileBody file={{ ...base, path, content: hostile }} lines={lines} />,
      );
      for (const tag of ["script", "img", "a", "svg"]) {
        expect(container.querySelector(tag), `${path}: <${tag}>`).toBeNull();
      }
      expect(codeText(container)).toBe(hostile);
      unmount();
    }
  });

  it("numbers lines, and selects one with a click", async () => {
    const content = "one\ntwo\nthree\n";
    const { container } = render(
      <FileBody file={{ ...base, content }} lines={plainLines(content)} />,
    );
    expect(container.querySelectorAll("pre [id^=L]")).toHaveLength(3);
    expect(screen.getByText("3 lines · 10 B · Markdown")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Line 2" }));
    expect(window.location.hash).toBe("#L2");
    expect(
      screen.getByRole("button", { name: "Copy link to line 2" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Line 2" }));
    expect(window.location.hash).toBe("");
  });

  it("says why it doesn't show binary and large files", () => {
    render(<FileBody file={{ ...base, binary: true }} lines={[]} />);
    expect(screen.getByText(/binary file/)).toBeInTheDocument();
    render(
      <FileBody
        file={{ ...base, too_large: true, size: 5 << 20 }}
        lines={[]}
      />,
    );
    expect(screen.getByText(/5.0 MB, too large/)).toBeInTheDocument();
  });

  it("shows a symlink's target without following it", () => {
    const { container } = render(
      <FileBody
        file={{ ...base, type: "symlink", target: "../../etc/passwd" }}
        lines={[]}
      />,
    );
    expect(container.textContent).toContain("../../etc/passwd");
    expect(container.textContent).toContain("not followed");
    expect(container.querySelector("pre")).toBeNull();
  });
});
