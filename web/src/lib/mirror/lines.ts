// A file's lines as tokens, for <CodeLines>: each token is its text and one of
// the syntax classes in globals.css. Tokens are only ever rendered as text
// children, which React escapes, so a file full of markup can't become
// elements.

export const TOKEN_CLASSES = [
  "", // plain
  "hl-key",
  "hl-string",
  "hl-number",
  "hl-comment",
  "hl-keyword",
  "hl-variable",
  "hl-punctuation",
  "hl-heading",
] as const;

export type TokenClass = number;
export type Token = [text: string, cls: TokenClass];
export type Line = Token[];

// splitLines splits text into lines, without the final newline's empty line
// and with Windows line endings normalized.
export function splitLines(content: string): string[] {
  const text = content.replace(/\r\n?/g, "\n").replace(/\n$/, "");
  return text.split("\n");
}

// plainLines is content without highlighting.
export function plainLines(content: string): Line[] {
  return splitLines(content).map((l) => (l ? [[l, 0]] : []));
}

// lineText joins a line's tokens back into its text.
export function lineText(line: Line): string {
  return line.map((t) => t[0]).join("");
}

// Languages by file name, then by extension. The names are Shiki's.
const BY_NAME: Record<string, string> = {
  makefile: "make",
  gnumakefile: "make",
  dockerfile: "docker",
  ".env": "dotenv",
  ".gitignore": "ini",
  ".dockerignore": "ini",
  ".editorconfig": "ini",
  "go.mod": "go",
  "cargo.lock": "toml",
};

const BY_EXT: Record<string, string> = {
  go: "go",
  rs: "rust",
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "tsx",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "jsx",
  py: "python",
  sh: "shellscript",
  bash: "shellscript",
  zsh: "shellscript",
  ps1: "powershell",
  psm1: "powershell",
  hcl: "hcl",
  tf: "terraform",
  tfvars: "terraform",
  mk: "make",
  dockerfile: "docker",
  html: "html",
  htm: "html",
  css: "css",
  scss: "scss",
  json: "json",
  jsonc: "jsonc",
  json5: "jsonc",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  md: "markdown",
  markdown: "markdown",
  mdx: "mdx",
  sql: "sql",
  astro: "astro",
  svelte: "svelte",
  vue: "vue",
  swift: "swift",
  cs: "csharp",
  rb: "ruby",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  hpp: "cpp",
  java: "java",
  kt: "kotlin",
  php: "php",
  lua: "lua",
  xml: "xml",
  svg: "xml",
  ini: "ini",
  cfg: "ini",
  conf: "ini",
  diff: "diff",
  patch: "diff",
  proto: "proto",
  graphql: "graphql",
  hlsl: "hlsl",
  shader: "shaderlab",
  env: "dotenv",
};

// What each language is called in the file's toolbar.
const LANGUAGE_NAMES: Record<string, string> = {
  go: "Go",
  rust: "Rust",
  typescript: "TypeScript",
  tsx: "TSX",
  javascript: "JavaScript",
  jsx: "JSX",
  python: "Python",
  shellscript: "Shell",
  powershell: "PowerShell",
  hcl: "HCL",
  terraform: "Terraform",
  make: "Makefile",
  docker: "Dockerfile",
  html: "HTML",
  css: "CSS",
  scss: "SCSS",
  json: "JSON",
  jsonc: "JSON with comments",
  yaml: "YAML",
  toml: "TOML",
  markdown: "Markdown",
  mdx: "MDX",
  sql: "SQL",
  astro: "Astro",
  svelte: "Svelte",
  vue: "Vue",
  swift: "Swift",
  csharp: "C#",
  ruby: "Ruby",
  c: "C",
  cpp: "C++",
  java: "Java",
  kotlin: "Kotlin",
  php: "PHP",
  lua: "Lua",
  xml: "XML",
  ini: "Config",
  diff: "Diff",
  proto: "Protocol Buffers",
  graphql: "GraphQL",
  hlsl: "HLSL",
  shaderlab: "ShaderLab",
  dotenv: "Environment",
};

// languageOf picks a file's language from its name, or undefined for plain
// text. A shebang names a shell or Python script without an extension.
export function languageOf(path: string, content = ""): string | undefined {
  const name = (path.split("/").pop() ?? "").toLowerCase();
  if (BY_NAME[name]) {
    return BY_NAME[name];
  }
  if (name.startsWith("dockerfile.") || name.endsWith(".dockerfile")) {
    return "docker";
  }
  if (name.startsWith(".env.")) {
    return "dotenv";
  }
  const dot = name.lastIndexOf(".");
  if (dot > 0 && BY_EXT[name.slice(dot + 1)]) {
    return BY_EXT[name.slice(dot + 1)];
  }
  const program = interpreter(content);
  if (program && /^(ba|z|da|k)?sh$/.test(program)) {
    return "shellscript";
  }
  if (program?.startsWith("python")) {
    return "python";
  }
  return undefined;
}

// interpreter names the program a "#!" line runs: "bash" for both
// "#!/bin/bash" and "#!/usr/bin/env -S bash -e".
function interpreter(content: string): string | undefined {
  if (!content.startsWith("#!")) {
    return undefined;
  }
  const firstLine = content.split("\n", 1)[0];
  const words = firstLine.slice(2).trim().split(/\s+/);
  let program = words[0]?.split("/").pop();
  if (program === "env") {
    program = words.slice(1).find((w) => !w.startsWith("-"));
  }
  return program;
}

// languageName is what the toolbar calls a file's language.
export function languageName(path: string, content = ""): string {
  const lang = languageOf(path, content);
  return lang ? (LANGUAGE_NAMES[lang] ?? lang) : "Text";
}
