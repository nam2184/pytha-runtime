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
import { mkdtemp, rm, writeFile, mkdir, stat, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative, sep } from 'node:path';
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
/* Cleanup                                                                    */
/* -------------------------------------------------------------------------- */

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

/**
 * Generate a unique invocation id used to correlate logs / render
 * messages emitted by the same Pytha execute call. Exposed so the MCP
 * wrappers can include it in feedback.
 */
export function generateInvocationId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}