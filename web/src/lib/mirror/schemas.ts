// The mirror's responses from the Go API (api/internal/server), checked with
// Zod like the auth module's. Go sends some empty lists as null; those are
// turned into [].
import { z } from "zod";

const list = <T extends z.ZodType>(item: T) =>
  z
    .array(item)
    .nullable()
    .transform((v) => v ?? []);

export const repoStateSchema = z.enum([
  "pending",
  "ok",
  "empty",
  "failed",
  "gone",
]);

export type RepoState = z.infer<typeof repoStateSchema>;

export const repoSchema = z.object({
  name: z.string(),
  full_name: z.string(),
  description: z.string(),
  default_branch: z.string(),
  private: z.boolean(),
  archived: z.boolean(),
  pushed_at: z.string().nullable(),
  state: repoStateSchema,
  on_disk: z.boolean(),
  last_attempt_at: z.string().nullable(),
  last_success_at: z.string().nullable(),
  last_error: z.string(),
  size_bytes: z.number(),
});

export type Repo = z.infer<typeof repoSchema>;

// GET /v1/repos
export const repoListSchema = z.object({
  repositories: list(repoSchema),
  syncing: z.boolean(),
  // When the last full sync finished and the next starts; null when unknown
  last_run_at: z
    .string()
    .nullish()
    .transform((v) => v ?? null),
  next_run_at: z
    .string()
    .nullish()
    .transform((v) => v ?? null),
});

export type RepoList = z.infer<typeof repoListSchema>;

const refSchema = z.object({ name: z.string(), commit: z.string() });

export type Ref = z.infer<typeof refSchema>;

export const refsSchema = z.object({
  head: z.string(),
  branches: list(refSchema),
  tags: list(refSchema),
});

export type Refs = z.infer<typeof refsSchema>;

// GET /v1/repos/{name}: refs is null until the repository has been copied.
export const repoDetailSchema = repoSchema.extend({
  refs: refsSchema.nullable(),
});

export type RepoDetail = z.infer<typeof repoDetailSchema>;

export const entrySchema = z.object({
  name: z.string(),
  path: z.string(),
  type: z.enum(["dir", "file", "symlink", "submodule"]),
  size: z.number(),
  executable: z.boolean(),
});

export type Entry = z.infer<typeof entrySchema>;

// GET /v1/repos/{name}/tree
export const treeSchema = z.object({
  commit: z.string(),
  ref: z.string(),
  path: z.string(),
  entries: list(entrySchema),
});

export type Tree = z.infer<typeof treeSchema>;

export const fileSchema = z.object({
  path: z.string(),
  type: z.enum(["file", "symlink"]),
  size: z.number(),
  executable: z.boolean(),
  binary: z.boolean(),
  too_large: z.boolean(),
  content: z.string(),
  target: z.string().optional(),
});

export type File = z.infer<typeof fileSchema>;

// GET /v1/repos/{name}/blob
export const blobSchema = z.object({
  commit: z.string(),
  ref: z.string(),
  file: fileSchema,
});

export type Blob = z.infer<typeof blobSchema>;

export const commitSchema = z.object({
  hash: z.string(),
  summary: z.string(),
  message: z.string(),
  author_name: z.string(),
  author_email: z.string(),
  authored_at: z.string(),
  committed_at: z.string(),
  parents: list(z.string()),
});

export type Commit = z.infer<typeof commitSchema>;

// GET /v1/repos/{name}/commits
export const commitPageSchema = z.object({
  commits: list(commitSchema),
  page: z.number(),
  next_page: z.number().nullable(),
});

export type CommitPage = z.infer<typeof commitPageSchema>;

// GET /v1/repos/{name}/files
export const fileListSchema = z.object({
  commit: z.string(),
  ref: z.string(),
  files: list(z.string()),
  truncated: z.boolean(),
});

// POST /v1/syncs
export const syncSchema = z.object({ queued: z.boolean() });
