// Vitest suite for project staging lifecycle.
//
// Verifies: zip extraction, cache reuse on identical payload,
// re-extraction on reload, cleanup on unload, full clear.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import JSZip from 'jszip';
import {
  STAGING_ROOT,
  clearAllProjects,
  findStagedProject,
  hashProjectPayload,
  listStagedProjects,
  stageProject,
  unloadProject,
} from '../runtime/mcp_project.js';

async function buildProjectZip(entries: Record<string, string>): Promise<Buffer> {
  const zip = new JSZip();
  for (const [filename, content] of Object.entries(entries)) {
    zip.file(filename, content);
  }
  return zip.generateAsync({ type: 'nodebuffer' });
}

async function buildProjectZipBase64(entries: Record<string, string>): Promise<string> {
  const buffer = await buildProjectZip(entries);
  return buffer.toString('base64');
}

async function readMainLua(stagedDir: string): Promise<string> {
  return readFileSync(join(stagedDir, 'main.lua'), 'utf8');
}

const FAKE_ZIP_MARKER = 'PYTHA_MCP_TEST_MARKER';
const OTHER_ZIP_MARKER = 'PYTHA_MCP_TEST_OTHER';

beforeEach(async () => {
  await clearAllProjects();
});

afterEach(async () => {
  await clearAllProjects();
});

describe('mcp_project staging lifecycle', () => {
  it('extracts a base64 zip to a temp directory under os.tmpdir()', async () => {
    const zip = await buildProjectZipBase64({
      'main.lua': `print('${FAKE_ZIP_MARKER} at ' .. tostring(os.time()))`,
    });
    const { project, reused } = await stageProject(zip);

    expect(reused).toBe(false);
    expect(project.file_count).toBe(1);
    expect(project.entry_point).toBe('main.lua');
    expect(project.staging_dir.startsWith(STAGING_ROOT)).toBe(true);
    expect(existsSync(join(project.staging_dir, 'main.lua'))).toBe(true);

    const written = await readMainLua(project.staging_dir);
    expect(written).toContain(FAKE_ZIP_MARKER);
  });

  it('reuses the staging directory when the same payload is staged twice', async () => {
    const zip = await buildProjectZipBase64({
      'main.lua': `print('${FAKE_ZIP_MARKER}')`,
    });

    const first = await stageProject(zip);
    const second = await stageProject(zip);

    expect(first.reused).toBe(false);
    expect(second.reused).toBe(true);
    expect(first.project.staging_dir).toBe(second.project.staging_dir);
    expect(first.project.project_id).toBe(second.project.project_id);
  });

  it('treats different payloads as separate projects', async () => {
    const a = await stageProject(
      await buildProjectZipBase64({ 'main.lua': `print('${FAKE_ZIP_MARKER}')` }),
    );
    const b = await stageProject(
      await buildProjectZipBase64({ 'main.lua': `print('${OTHER_ZIP_MARKER}')` }),
    );

    expect(a.project.project_id).not.toBe(b.project.project_id);
    expect(listStagedProjects()).toHaveLength(2);
  });

  it('reloads only when reload:true is passed, even after on-disk mutations', async () => {
    const zip = await buildProjectZipBase64({ 'main.lua': `print('${FAKE_ZIP_MARKER}')` });

    const staged = await stageProject(zip);
    expect(staged.reused).toBe(false);

    // Mutate the on-disk file (simulates runtime-driven writes).
    await writeFile(join(staged.project.staging_dir, 'marker.txt'), 'mutated');

    const reuse = await stageProject(zip);
    expect(reuse.reused).toBe(true);
    expect(existsSync(join(reuse.project.staging_dir, 'marker.txt'))).toBe(true);

    const reload = await stageProject(zip, { reload: true });
    expect(reload.reused).toBe(false);
    expect(existsSync(join(reload.project.staging_dir, 'marker.txt'))).toBe(false);
  });

  it('unloads a single project by id and removes its staging directory', async () => {
    const staged = await stageProject(
      await buildProjectZipBase64({ 'main.lua': `print('${FAKE_ZIP_MARKER}')` }),
    );
    const removed = await unloadProject(staged.project.project_id);

    expect(removed).toBe(true);
    expect(findStagedProject(staged.project.project_id)).toBeUndefined();
    expect(existsSync(staged.project.staging_dir)).toBe(false);
  });

  it('returns false when unloading an unknown project id', async () => {
    const removed = await unloadProject('not-a-real-hash');
    expect(removed).toBe(false);
  });

  it('clearAllProjects wipes every staging and the parent dir', async () => {
    await stageProject(await buildProjectZipBase64({ 'main.lua': `print('${FAKE_ZIP_MARKER}')` }));
    await stageProject(await buildProjectZipBase64({ 'main.lua': `print('${OTHER_ZIP_MARKER}')` }));

    const summary = await clearAllProjects();
    expect(summary.cleared).toBe(2);
    expect(existsSync(STAGING_ROOT)).toBe(false);
    expect(listStagedProjects()).toHaveLength(0);
  });

  it('hashes payloads consistently across calls', async () => {
    const zip = await buildProjectZipBase64({ 'main.lua': `print('${FAKE_ZIP_MARKER}')` });
    const rawBuffer = await buildProjectZip({ 'main.lua': `print('${FAKE_ZIP_MARKER}')` });
    const expected = createHash('sha256').update(rawBuffer).digest('hex');
    expect(hashProjectPayload(zip)).toBe(expected);
  });

  it('rejects payloads that are not valid zip archives', async () => {
    await expect(stageProject('not-a-real-base64-zip')).rejects.toThrow();
  });
});
