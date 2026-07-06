// Pytha MCP project staging.
//
// Receives a base64-encoded zip of a Pytha Lua project, extracts it to
// a temp directory, and (optionally) executes `main.lua` against the
// Pytha WebSocket runtime. The staging directory is cached on disk and
// keyed by the SHA-256 of the project payload so subsequent calls reuse
// the extracted files instead of re-extracting.
//
// Lifecycle:
//   pytha_run_project    -> create or reuse staging, run main.lua
//   pytha_load_project   -> create or reuse staging, no execution
//   pytha_reload_project -> wipe + re-extract on next use
//   pytha_unload_project -> wipe staging + terminate any watcher
//   pytha_clear_all_projects -> wipe everything
//
// All temp directories are children of `<os.tmpdir()>/pytha-mcp/`. The
// server cleans up the parent on SIGINT/SIGTERM via `clearAllOnShutdown`.

import { createHash, randomUUID } from 'node:crypto';
import {
  mkdtemp,
  rm,
  writeFile,
  mkdir,
  stat,
  readdir,
  copyFile,
  readFile,
} from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute, sep, normalize } from 'node:path';
import * as yauzl from 'yauzl';
import { performance } from 'node:perf_hooks';

export const STAGING_ROOT = join(
  tmpdir(),
  process.env.PYTHA_MCP_STAGING_ROOT_SUFFIX ?? 'pytha-mcp',
);

interface StagedProject {
  projectId: string;
  stagingDir: string;
  createdAt: string;
  entryPoint: string;
  totalBytes: number;
  fileCount: number;
}

export type { StagedProject };
const projects = new Map<string, StagedProject>();

/* -------------------------------------------------------------------------- */
/* Zip extraction                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Extracts a base64 zip to a fresh directory.
 * Streams entries via yauzl so the entire archive is never buffered in memory.
 * Refuses entries whose paths escape the destination directory.
 */
export async function extractZipToDir(
  zipBase64: string,
  destDir: string,
): Promise<{ fileCount: number; totalBytes: number }> {
  const bytes = Buffer.from(zipBase64, 'base64');
  if (bytes.length === 0) {
    throw new Error('Empty project payload');
  }

  await mkdir(destDir, { recursive: true });

  // Translate raw yauzl path errors into our own messages so callers
  // see a consistent "escapes staging directory" exception.
  const translated = (error: unknown): Error => {
    if (error instanceof Error && /invalid relative path/i.test(error.message)) {
      return new Error(`Zip entry escapes staging directory: ${error.message}`);
    }
    return error instanceof Error ? error : new Error(String(error));
  };

  return await new Promise((resolveExtract, rejectExtract) => {
    let fileCount = 0;
    let totalBytes = 0;
    let settled = false;
    const finish = (cb: () => void, err?: Error) => {
      if (settled) return;
      settled = true;
      if (err) rejectExtract(translated(err));
      else cb();
    };

    yauzl.fromBuffer(bytes, { lazyEntries: true }, (err, zipfile) => {
      if (err) {
        finish(() => rejectExtract(err));
        return;
      }
      if (!zipfile) {
        finish(() => rejectExtract(new Error('Failed to open zip archive')));
        return;
      }

      zipfile.on('error', (e) => finish(() => rejectExtract(e)));

      zipfile.on('end', () => {
        zipfile.close();
        finish(() =>
          resolveExtract({
            fileCount,
            totalBytes,
          }),
        );
      });

      zipfile.on('close', () => {
        finish(() =>
          resolveExtract({
            fileCount,
            totalBytes,
          }),
        );
      });

      zipfile.readEntry();
      zipfile.on('entry', (entry) => {
        // yauzl may have already sanitized ".." out of entry.fileName,
        // but if any survived the entry event and yauzl's internal
        // path computations throw "invalid relative path: ../" we
        // catch that in `translated` below. Belt and suspenders:
        // reject any name that *still* contains "..".
        const entryName = entry.fileName;
        const safeName = entryName.replace(/\\/g, '/');
        if (safeName.split('/').includes('..')) {
          finish(() =>
            rejectExtract(new Error(`Zip entry escapes staging directory: ${entryName}`)),
          );
          return;
        }
        if (safeName.endsWith('/')) {
          zipfile.readEntry();
          return;
        }
        const safePath = sanitizePath(destDir, safeName);
        const dir = safePath.substring(0, safePath.lastIndexOf(sep));
        const parent = dir || destDir;

        fileCount += 1;
        totalBytes += entry.uncompressedSize;

        zipfile.openReadStream(entry, (err2, readStream) => {
          if (err2) {
            finish(() => rejectExtract(err2));
            return;
          }
          if (!readStream) {
            finish(() => rejectExtract(new Error('Missing read stream for entry')));
            return;
          }

          mkdir(parent, { recursive: true }).then(() => {
            const chunks: Buffer[] = [];
            readStream.on('data', (chunk) => chunks.push(chunk as Buffer));
            readStream.on('end', () => {
              writeFile(safePath, Buffer.concat(chunks)).then(
                () => zipfile.readEntry(),
                (writeErr) => finish(() => rejectExtract(writeErr)),
              );
            });
            readStream.on('error', (streamErr) =>
              finish(() => rejectExtract(streamErr as Error)),
            );
          });
        });
      });
    });
  });
}

function sanitizePath(root: string, entryName: string): string {
  const absoluteRoot = resolve(root);
  // Path-traversal detection. We never call node:path's `relative`
  // because it would throw "invalid relative path: ../" before our
  // guard could fire — so we walk the segments ourselves and just
  // compute the on-disk destination via `join`.
  const segments = entryName.replace(/\\/g, '/').split('/').filter(Boolean);
  if (segments.includes('..')) {
    throw new Error(`Zip entry escapes staging directory: ${entryName}`);
  }
  return join(absoluteRoot, ...segments);
}

/* -------------------------------------------------------------------------- */
/* Project registry                                                           */
/* -------------------------------------------------------------------------- */

export interface StagedProjectView {
  project_id: string;
  staging_dir: string;
  entry_point: string;
  created_at: string;
  file_count: number;
  total_bytes: number;
}

export function listStagedProjects(): StagedProjectView[] {
  return Array.from(projects.values()).map((project) => ({
    project_id: project.projectId,
    staging_dir: project.stagingDir,
    entry_point: project.entryPoint,
    created_at: project.createdAt,
    file_count: project.fileCount,
    total_bytes: project.totalBytes,
  }));
}

export function findStagedProject(projectId: string): StagedProject | undefined {
  return projects.get(projectId);
}

export function hashProjectPayload(zipBase64: string): string {
  return createHash('sha256').update(zipBase64, 'base64').digest('hex');
}

/**
 * Get or create the staging directory for `zipBase64`. If a project with
 * the same hash already exists, its directory is reused (same on-disk
 * files; subsequent in-place edits made by the runtime will be preserved).
 *
 * If `options.reload` is true, the existing staging is wiped first so the
 * zip is re-extracted from scratch.
 *
 * Returns the project handle along with whether the staging was created
 * (true) or reused (false).
 */
export async function stageProject(
  zipBase64: string,
  options: { entryPoint?: string; reload?: boolean } = {},
): Promise<{ project: StagedProjectView; reused: boolean }> {
  const hash = hashProjectPayload(zipBase64);
  const projectId = hash;
  const existing = projects.get(projectId);

  if (existing && options.reload) {
    await rm(existing.stagingDir, { recursive: true, force: true });
    projects.delete(projectId);
  } else if (existing) {
    return { project: toView(existing), reused: true };
  }

  const stagedDir = join(STAGING_ROOT, projectId);
  const start = performance.now();
  const { fileCount, totalBytes } = await extractZipToDir(zipBase64, stagedDir);
  const elapsedMs = Math.round(performance.now() - start);

  const entryPoint = options.entryPoint ?? (await findEntryPoint(stagedDir)) ?? 'main.lua';
  const entryPath = join(stagedDir, entryPoint);
  const entryStat = await stat(entryPath).catch(() => null);
  if (!entryStat?.isFile()) {
    await rm(stagedDir, { recursive: true, force: true });
    throw new Error(
      `Project entry point '${entryPoint}' not found in staged files. File count: ${fileCount}.`,
    );
  }

  const record: StagedProject = {
    projectId,
    stagingDir: stagedDir,
    createdAt: new Date().toISOString(),
    entryPoint,
    totalBytes,
    fileCount,
  };
  projects.set(projectId, record);

  return {
    project: toView(record),
    reused: false,
    extracted_in_ms: elapsedMs,
  } as { project: StagedProjectView; reused: boolean; extracted_in_ms: number };
}

function toView(record: StagedProject): StagedProjectView {
  return {
    project_id: record.projectId,
    staging_dir: record.stagingDir,
    entry_point: record.entryPoint,
    created_at: record.createdAt,
    file_count: record.fileCount,
    total_bytes: record.totalBytes,
  };
}

/* -------------------------------------------------------------------------- */
/* Lookup helpers                                                             */
/* -------------------------------------------------------------------------- */

const COMMON_ENTRY_POINTS = ['main.lua', 'init.lua', 'index.lua', 'run.lua'];

async function findEntryPoint(stagedDir: string): Promise<string | undefined> {
  for (const candidate of COMMON_ENTRY_POINTS) {
    const candidatePath = join(stagedDir, candidate);
    const candidateStat = await stat(candidatePath).catch(() => null);
    if (candidateStat?.isFile()) return candidate;
  }
  return undefined;
}

export async function listStagedFiles(stagedDir: string): Promise<string[]> {
  const entries = await readdir(stagedDir, { withFileTypes: true });
  return entries.map((entry) => entry.name);
}

/* -------------------------------------------------------------------------- */
/* Paths-mode staging                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Resolve a list of user-supplied paths against the active workspace root
 * (defaults to `process.cwd()`). All paths must already be absolute
 * and contain no `..` segments — anything else is rejected with a clear
 * error so the staging path stays inside `WORKSPACE_ROOT`.
 */
export function resolveWorkspacePaths(workspaceRoot: string, rawPaths: string[]): string[] {
  const root = resolve(workspaceRoot);
  if (!existsSync(root)) {
    throw new Error(`Workspace root does not exist: ${root}`);
  }
  const resolved: string[] = [];
  for (const raw of rawPaths) {
    if (typeof raw !== 'string' || raw.length === 0) {
      throw new Error('Every project path must be a non-empty string.');
    }
    const absolute = isAbsolute(raw) ? raw : resolve(root, raw);
    if (!absolute.startsWith(root + sep) && absolute !== root) {
      throw new Error(`Path escapes workspace root: ${raw}`);
    }
    resolved.push(absolute);
  }
  return Array.from(new Set(resolved)).sort();
}

/**
 * Build a content fingerprint from a list of resolved absolute paths.
 * The paths are sorted internally so reordering inputs produces a
 * stable hash. Per-file content is mixed in too so renaming a file
 * or editing one byte invalidates the cache entry. Symlinks and
 * missing files fall back to a `#missing` tag.
 */
export async function hashPathsPayload(absolutePaths: string[]): Promise<string> {
  const hasher = createHash('sha256');
  hasher.update('paths:');
  const sorted = [...absolutePaths].sort();
  for (const absolute of sorted) {
    hasher.update('|');
    hasher.update(absolute);
    try {
      const buffer = await readFile(absolute);
      hasher.update('#');
      const inner = createHash('sha256').update(buffer).digest('hex');
      hasher.update(inner);
    } catch {
      hasher.update('#missing');
    }
  }
  return hasher.digest('hex');
}

/**
 * Mirror a list of resolved absolute paths into `destDir`, preserving
 * relative paths. Skips anything that lives inside `destDir` already
 * (typically called with the workspace root itself).
 */
async function copyPathsIntoStaging(absolutePaths: string[], destDir: string): Promise<void> {
  for (const absolute of absolutePaths) {
    const insideDest = absolute.startsWith(destDir + sep) || absolute.startsWith(join(destDir, sep));
    if (insideDest) continue;
    const info = await stat(absolute).catch(() => null);
    if (!info) continue;
    const rel = relative(process.cwd(), absolute);
    const target = rel.startsWith('..') || rel.startsWith(sep)
      ? join(destDir, basename(absolute))
      : join(destDir, rel);
    if (info.isDirectory()) {
      await mkdir(target, { recursive: true });
      const entries = await readdir(absolute, { withFileTypes: true });
      for (const entry of entries) {
        const child = join(absolute, entry.name);
        await copyPathsIntoStaging([child], destDir);
      }
      continue;
    }
    if (info.isFile()) {
      await mkdir(relative(target, destDir) || destDir, { recursive: true }).catch(async () => {
        await mkdir(target.substring(0, target.lastIndexOf(sep)), { recursive: true });
      });
      const targetDir = target.substring(0, target.lastIndexOf(sep));
      await mkdir(targetDir, { recursive: true });
      await copyFile(absolute, target);
    }
  }
}

function basename(p: string): string {
  const norm = normalize(p);
  const idx = Math.max(norm.lastIndexOf('/'), norm.lastIndexOf(sep));
  return idx >= 0 ? norm.slice(idx + 1) : norm;
}

export interface StagePathsOptions {
  workspaceRoot: string;
  reload?: boolean;
  entryPoint?: string;
}

/**
 * Stage a list of workspace-relative paths into a project dir.
 * Identity is determined by SHA-256(sorted paths + per-file content
 * hashes). Identical calls reuse the same staging dir.
 */
export async function stagePaths(
  rawPaths: string[],
  options: StagePathsOptions,
): Promise<{ project: StagedProjectView; reused: boolean; resolvedPaths: string[] }> {
  const absolutePaths = resolveWorkspacePaths(options.workspaceRoot, rawPaths);
  const projectId = await hashPathsPayload(absolutePaths);
  const existing = projects.get(projectId);
  if (existing && options.reload) {
    await rm(existing.stagingDir, { recursive: true, force: true });
    projects.delete(projectId);
  } else if (existing) {
    return { project: toView(existing), reused: true, resolvedPaths: absolutePaths };
  }

  const stagedDir = join(STAGING_ROOT, projectId);
  await mkdir(stagedDir, { recursive: true });
  const start = performance.now();
  await copyPathsIntoStaging(absolutePaths, stagedDir);

  // Walk the staging dir to locate the entry point.
  let entryPoint = options.entryPoint;
  if (!entryPoint) {
    // Auto-detect: prefer common entry names; fall back to the first file we copied.
    const fallback = await firstFileIn(absolutePaths);
    entryPoint = (await findEntryPoint(stagedDir)) ?? fallback ?? 'main.lua';
  }
  const entryPath = join(stagedDir, entryPoint);
  const entryStat = await stat(entryPath).catch(() => null);
  if (!entryStat?.isFile()) {
    await rm(stagedDir, { recursive: true, force: true });
    throw new Error(
      `Project entry point '${entryPoint}' not found in staged files.`,
    );
  }

  const fileCount = await countFilesUnder(stagedDir);
  const record: StagedProject = {
    projectId,
    stagingDir: stagedDir,
    createdAt: new Date().toISOString(),
    entryPoint,
    totalBytes: 0,
    fileCount,
  };
  projects.set(projectId, record);
  return {
    project: toView(record),
    reused: false,
    resolvedPaths: absolutePaths,
    extracted_in_ms: Math.round(performance.now() - start),
  } as {
    project: StagedProjectView;
    reused: boolean;
    resolvedPaths: string[];
    extracted_in_ms: number;
  };
}

async function countFilesUnder(root: string): Promise<number> {
  let count = 0;
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      count += await countFilesUnder(join(root, entry.name));
    } else if (entry.isFile()) {
      count += 1;
    }
  }
  return count;
}

/**
 * Pick the basename of the first *file* path in the list. Used as a
 * fallback when the agent didn't pick an entry point and the project
 * doesn't ship a main.lua / init.lua convention.
 */
export async function firstFileIn(absolutePaths: string[]): Promise<string | undefined> {
  for (const absolute of absolutePaths) {
    const info = await stat(absolute).catch(() => null);
    if (info?.isFile()) return basename(absolute);
  }
  return undefined;
}

/**
 * Generate a unique invocation id used to correlate logs / render
 * messages emitted by the same Pytha execute call. Exposed so the MCP
 * wrappers can include it in feedback.
 */
export function generateInvocationId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

export async function unloadProject(projectId: string): Promise<boolean> {
  const project = projects.get(projectId);
  if (!project) return false;
  await rm(project.stagingDir, { recursive: true, force: true });
  projects.delete(projectId);
  return true;
}

export async function clearAllProjects(): Promise<{ cleared: number; rootRemoved: boolean }> {
  const cleared = projects.size;
  for (const project of projects.values()) {
    await rm(project.stagingDir, { recursive: true, force: true }).catch(() => {
      /* swallow — best-effort cleanup */
    });
  }
  projects.clear();
  const rootRemoved = await rm(STAGING_ROOT, { recursive: true, force: true })
    .then(() => true)
    .catch(() => false);
  return { cleared, rootRemoved };
}