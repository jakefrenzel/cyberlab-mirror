import "server-only";

import type { LanguageInput, ThemeRegistration } from "shiki/core";
import { createHighlighterCore, type HighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

import {
  languageOf,
  plainLines,
  splitLines,
  type Line,
  type TokenClass,
} from "@/lib/mirror/lines";

// Syntax highlighting with Shiki, on the server. Its output is used only as
// tokens (text and a class), never as HTML.

// Files bigger than this are shown without highlighting: tokenizing them
// is slow, and the tokens make the page's payload several times larger.
const MAX_HIGHLIGHT_BYTES = 256 << 10;
const MAX_HIGHLIGHT_LINES = 5000;

// Each grammar is imported by name, so the server bundle holds only these
// (not all of @shikijs/langs, 11 MB).
const GRAMMARS: Record<string, () => Promise<{ default: LanguageInput }>> = {
  astro: () => import("@shikijs/langs/astro"),
  c: () => import("@shikijs/langs/c"),
  cpp: () => import("@shikijs/langs/cpp"),
  csharp: () => import("@shikijs/langs/csharp"),
  css: () => import("@shikijs/langs/css"),
  diff: () => import("@shikijs/langs/diff"),
  docker: () => import("@shikijs/langs/docker"),
  dotenv: () => import("@shikijs/langs/dotenv"),
  go: () => import("@shikijs/langs/go"),
  graphql: () => import("@shikijs/langs/graphql"),
  hcl: () => import("@shikijs/langs/hcl"),
  hlsl: () => import("@shikijs/langs/hlsl"),
  html: () => import("@shikijs/langs/html"),
  ini: () => import("@shikijs/langs/ini"),
  java: () => import("@shikijs/langs/java"),
  javascript: () => import("@shikijs/langs/javascript"),
  json: () => import("@shikijs/langs/json"),
  jsonc: () => import("@shikijs/langs/jsonc"),
  jsx: () => import("@shikijs/langs/jsx"),
  kotlin: () => import("@shikijs/langs/kotlin"),
  lua: () => import("@shikijs/langs/lua"),
  make: () => import("@shikijs/langs/make"),
  markdown: () => import("@shikijs/langs/markdown"),
  mdx: () => import("@shikijs/langs/mdx"),
  php: () => import("@shikijs/langs/php"),
  powershell: () => import("@shikijs/langs/powershell"),
  proto: () => import("@shikijs/langs/proto"),
  python: () => import("@shikijs/langs/python"),
  ruby: () => import("@shikijs/langs/ruby"),
  rust: () => import("@shikijs/langs/rust"),
  scss: () => import("@shikijs/langs/scss"),
  shaderlab: () => import("@shikijs/langs/shaderlab"),
  shellscript: () => import("@shikijs/langs/shellscript"),
  sql: () => import("@shikijs/langs/sql"),
  svelte: () => import("@shikijs/langs/svelte"),
  swift: () => import("@shikijs/langs/swift"),
  terraform: () => import("@shikijs/langs/terraform"),
  toml: () => import("@shikijs/langs/toml"),
  tsx: () => import("@shikijs/langs/tsx"),
  typescript: () => import("@shikijs/langs/typescript"),
  vue: () => import("@shikijs/langs/vue"),
  xml: () => import("@shikijs/langs/xml"),
  yaml: () => import("@shikijs/langs/yaml"),
};

// The theme's colours are placeholders: each one stands for a class in
// lib/mirror/lines.ts (TOKEN_CLASSES), whose colour globals.css sets.
const CLASS_OF: Record<string, TokenClass> = {
  "#000001": 1, // key
  "#000002": 2, // string
  "#000003": 3, // number
  "#000004": 4, // comment
  "#000005": 5, // keyword
  "#000006": 6, // variable
  "#000007": 7, // punctuation
  "#000008": 8, // heading
};

const scopes = (foreground: string, scope: string[]) => ({
  scope,
  settings: { foreground },
});

export const THEME: ThemeRegistration = {
  name: "cyberlab-mirror",
  type: "dark",
  fg: "#000000",
  bg: "#000000",
  settings: [
    scopes("#000004", ["comment", "punctuation.definition.comment"]),
    scopes("#000002", [
      "string",
      "punctuation.definition.string",
      "constant.other.symbol",
      "markup.underline.link",
    ]),
    scopes("#000003", [
      "constant.numeric",
      "constant.language",
      "constant.character.escape",
      "constant.other.placeholder",
    ]),
    scopes("#000005", [
      "keyword",
      "storage",
      "keyword.control",
      "variable.language.this",
      "variable.language.self",
    ]),
    scopes("#000006", [
      "variable.other.normal.shell",
      "variable.other.bracket.shell",
      "variable.other.positional.shell",
      "variable.other.special.shell",
      "punctuation.definition.variable",
      "variable.other.makefile",
      "variable.parameter",
      "variable.language",
      "entity.name.function",
      "support.function",
      "markup.inline.raw",
      "markup.raw",
    ]),
    scopes("#000001", [
      "entity.name.tag",
      "support.type.property-name",
      "meta.object-literal.key",
      "meta.mapping.key",
      "entity.other.attribute-name",
      "entity.name.type",
      "entity.name.class",
      "support.type",
      "support.class",
      "entity.name.function.target.makefile",
      "keyword.other.definition.ini",
      "variable.other.key",
    ]),
    scopes("#000007", [
      "punctuation",
      "keyword.operator",
      "meta.brace",
      "punctuation.separator",
    ]),
    scopes("#000008", [
      "markup.heading",
      "entity.name.section",
      "punctuation.definition.heading",
    ]),
  ],
};

let highlighter: Promise<HighlighterCore> | undefined;

function getHighlighter(): Promise<HighlighterCore> {
  highlighter ??= createHighlighterCore({
    themes: [THEME],
    langs: [],
    engine: createJavaScriptRegexEngine({ forgiving: true }),
  });
  return highlighter;
}

// highlight returns a file's lines as tokens. Anything it can't or shouldn't
// highlight comes back as plain lines.
export async function highlight(
  path: string,
  content: string,
): Promise<Line[]> {
  const lang = languageOf(path, content);
  if (
    !lang ||
    !GRAMMARS[lang] ||
    content.length > MAX_HIGHLIGHT_BYTES ||
    splitLines(content).length > MAX_HIGHLIGHT_LINES
  ) {
    return plainLines(content);
  }
  try {
    const hl = await getHighlighter();
    if (!hl.getLoadedLanguages().includes(lang)) {
      await hl.loadLanguage((await GRAMMARS[lang]()).default);
    }
    const { tokens } = hl.codeToTokens(splitLines(content).join("\n"), {
      lang,
      theme: THEME.name!,
      // Very long lines (minified code) are left plain rather than tokenized
      tokenizeMaxLineLength: 2000,
    });
    return tokens.map((line) => {
      const out: Line = [];
      for (const t of line) {
        const cls = CLASS_OF[(t.color ?? "").toLowerCase()] ?? 0;
        const last = out[out.length - 1];
        if (last && last[1] === cls) {
          last[0] += t.content;
        } else {
          out.push([t.content, cls]);
        }
      }
      return out;
    });
  } catch (e) {
    console.error("highlighting failed", path, e);
    return plainLines(content);
  }
}
