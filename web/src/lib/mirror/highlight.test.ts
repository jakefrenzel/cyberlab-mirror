import { describe, expect, it } from "vitest";

import { highlight } from "@/lib/mirror/highlight";
import {
  TOKEN_CLASSES,
  languageName,
  languageOf,
  lineText,
  plainLines,
  splitLines,
} from "@/lib/mirror/lines";

const classesOf = (lines: Awaited<ReturnType<typeof highlight>>) =>
  new Set(lines.flat().map(([, cls]) => TOKEN_CLASSES[cls]));

describe("highlight", () => {
  it("colours YAML keys, strings, numbers, and comments", async () => {
    const yaml = "# root\nname: homelab\nreplicas: 2\nenabled: true\n";
    const lines = await highlight("apps.yaml", yaml);
    expect(lines.map(lineText)).toEqual(splitLines(yaml));
    const classes = classesOf(lines);
    for (const c of ["hl-comment", "hl-key", "hl-string", "hl-number"]) {
      expect(classes, c).toContain(c);
    }
  });

  it("colours Go keywords and strings", async () => {
    const go = 'package main\n\nfunc main() {\n\tprintln("hi")\n}\n';
    const lines = await highlight("main.go", go);
    expect(lines.map(lineText)).toEqual(splitLines(go));
    expect(classesOf(lines)).toContain("hl-keyword");
    expect(classesOf(lines)).toContain("hl-string");
  });

  it("leaves unknown and very large files plain", async () => {
    expect(await highlight("notes.unknown", "a: b\n")).toEqual(
      plainLines("a: b\n"),
    );
    const big = "x: 1\n".repeat(6000);
    expect(await highlight("big.yaml", big)).toEqual(plainLines(big));
  });

  it("keeps every character, with Windows line endings normalized", async () => {
    const text = "a: 1\r\nb: '<x>'\r\n";
    expect((await highlight("x.yml", text)).map(lineText)).toEqual([
      "a: 1",
      "b: '<x>'",
    ]);
  });
});

describe("languageOf", () => {
  it("goes by name, extension, then shebang", () => {
    expect(languageOf("Makefile")).toBe("make");
    expect(languageOf("api/Dockerfile")).toBe("docker");
    expect(languageOf("web/src/app/page.tsx")).toBe("tsx");
    expect(languageOf("infra/main.tf")).toBe("terraform");
    expect(languageOf("bin/deploy", "#!/usr/bin/env bash\n")).toBe(
      "shellscript",
    );
    expect(languageOf("bin/tool", "#!/usr/bin/python3\n")).toBe("python");
    expect(languageOf("LICENSE")).toBeUndefined();
    expect(languageName("x.ps1")).toBe("PowerShell");
    expect(languageName("LICENSE")).toBe("Text");
  });
});
