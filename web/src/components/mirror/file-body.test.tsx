// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FileBody } from "@/components/mirror/file-body";
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

describe("FileBody", () => {
  it("shows markup in a file as text, never as elements", () => {
    const content =
      '<script>alert(1)</script>\n<img src=x onerror="alert(2)">\n<a href="javascript:alert(3)">x</a>';
    const { container } = render(<FileBody file={{ ...base, content }} />);

    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("a")).toBeNull();
    expect(container.querySelector("pre")?.textContent).toBe(content);
  });

  it("says why it doesn't show binary and large files", () => {
    render(<FileBody file={{ ...base, binary: true }} />);
    expect(screen.getByText(/binary file/)).toBeInTheDocument();
    render(<FileBody file={{ ...base, too_large: true, size: 5 << 20 }} />);
    expect(screen.getByText(/5.0 MB, too large/)).toBeInTheDocument();
  });

  it("shows a symlink's target without following it", () => {
    const { container } = render(
      <FileBody
        file={{ ...base, type: "symlink", target: "../../etc/passwd" }}
      />,
    );
    expect(container.textContent).toContain("../../etc/passwd");
    expect(container.textContent).toContain("not followed");
    expect(container.querySelector("pre")).toBeNull();
  });
});
