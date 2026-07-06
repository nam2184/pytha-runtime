// Vitest suite for paths-mode MCP tools:
//
//   pytha_run_project_paths / pytha_load_project_paths
//
// Like the zip-mode suite, we drive the dispatcher through dispatchJsonRpc
// so the test stays focused on the staging + tool surface, not on the
// Pytha WebSocket runtime itself.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import {
  STAGING_ROOT,
  clearAllProjects,
  firstFileIn,
  hashPathsPayload,
  resolveWorkspacePaths,
  stagePaths,
} from '../runtime/mcp_project.js';
import { dispatchJsonRpc } from '../runtime/mcp_core.js';

function rpc(id: number, method: string, params?: unknown): unknown {
  return { jsonrpc: '2.0', id, method, params };
}

async function callTool(
  id: number,
  toolName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  return dispatchJsonRpc(
    rpc(id, 'tools/call', { name: toolName, arguments: args }) as {
      jsonrpc: '2.0';
      id: number;
      method: string;
      params: unknown;
    },
  );
}

async function expectedText(result: unknown): Promise<string> {
  const r = result as {
    result: { content: Array<{ type: string; text: string }> };
  };
  return r.result.content[0].text;
}

interface DisposableTree {
  root: string;
  cleanup: () => Promise<void>;
}

async function makeProjectTree(root: string, files: Record<string, string>): Promise<void> {
  await mkdir(root, { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    const full = join(root, rel);
    const dir = dirname(full);
    if (dir && dir !== root) {
      await mkdir(dir, { recursive: true });
    }
    await writeFile(full, content);
  }
}

const trees: DisposableTree[] = [];

async function fixture(files: Record<string, string>): Promise<string> {
  const root = join(
    process.env.TEMP ?? 'C:/Users/caona/AppData/Local/Temp',
    `pytha-mcp-test-${Date.now()}-${trees.length}-${Math.floor(Math.random() * 1e6)}`,
  );
  await makeProjectTree(root, files);
  trees.push({
    root,
    cleanup: async () => {
      await rm(root, { recursive: true, force: true });
    },
  });
  return root;
}

beforeEach(async () => {
  await clearAllProjects();
});

afterEach(async () => {
  await clearAllProjects();
  for (const tree of trees) await tree.cleanup().catch(() => undefined);
  trees.length = 0;
});

describe('paths-mode project tools', () => {
  it('exposes the paths tools alongside the zip ones', async () => {
    const response = await dispatchJsonRpc(
      rpc(1, 'tools/list') as { jsonrpc: '2.0'; id: number; method: string },
    );
    const tools = (response as { result: { tools: Array<{ name: string }> } }).result.tools;
    const names = tools.map((tool) => tool.name);
    expect(names).toContain('pytha_run_project_paths');
    expect(names).toContain('pytha_load_project_paths');
  });

  it('resolveWorkspacePaths rejects paths outside the root', async () => {
    const root = await fixture({});
    expect(() =>
      resolveWorkspacePaths(root, [join(root, '..', 'elsewhere.lua')]),
    ).toThrow(/escapes workspace root/i);
  });

  it('firstFileIn returns the basename of the first file path', async () => {
    const root = await fixture({
      'main.lua': `print('m')`,
      'smoke.lua': `print('s')`,
    });
    const basename = await firstFileIn([join(root, 'main.lua'), join(root, 'smoke.lua')]);
    expect(basename).toBe('main.lua');
  });

  it('firstFileIn skips missing and directory entries', async () => {
    const root = await fixture({ 'real.lua': `print('r')` });
    expect(await firstFileIn([join(root, 'no.lua')])).toBeUndefined();
    expect(await firstFileIn([join(root, 'real.lua'), join(root, 'no.lua')])).toBe('real.lua');
  });

  it('hashPathsPayload is stable for the same paths and content, changes otherwise', async () => {
    const root = await fixture({ 'main.lua': 'print("a")', 'lib.lua': 'return 1' });
    const before = await hashPathsPayload([
      join(root, 'main.lua'),
      join(root, 'lib.lua'),
    ]);
    // Reorder shouldn't matter because paths are sorted internally.
    const reordered = await hashPathsPayload([
      join(root, 'lib.lua'),
      join(root, 'main.lua'),
    ]);
    expect(reordered).toBe(before);

    // Change a byte -> hash changes.
    await writeFile(join(root, 'main.lua'), 'print("b")');
    const after = await hashPathsPayload([
      join(root, 'main.lua'),
      join(root, 'lib.lua'),
    ]);
    expect(after).not.toBe(before);
  });

  it('stagePaths mirrors the workspace into a temp dir under the staging root', async () => {
    const root = await fixture({
      'main.lua': `print('paths-mode')`,
      'lib/util.lua': 'return 7',
    });
    const stage = await stagePaths([join(root, 'main.lua')], {
      workspaceRoot: root,
    });
    expect(stage.reused).toBe(false);
    expect(stage.project.staging_dir.startsWith(STAGING_ROOT)).toBe(true);
    expect(stage.project.entry_point).toBe('main.lua');
    expect(stage.project.file_count).toBe(1);
    expect(stage.resolvedPaths).toEqual([join(root, 'main.lua')]);
  });

  it('stagePaths reuses the same staging dir for identical payloads', async () => {
    const root = await fixture({ 'main.lua': `print('paths-mode')` });
    const first = await stagePaths([join(root, 'main.lua')], {
      workspaceRoot: root,
    });
    const second = await stagePaths([join(root, 'main.lua')], {
      workspaceRoot: root,
    });
    expect(second.reused).toBe(true);
    expect(second.project.staging_dir).toBe(first.project.staging_dir);
    expect(second.project.project_id).toBe(first.project.project_id);
  });

  it('pytha_load_project_paths returns staging metadata without execution', async () => {
    const root = await fixture({ 'main.lua': `print('hello')` });
    const result = await callTool(1, 'pytha_load_project_paths', {
      workspace_root: root,
      project_paths: [join(root, 'main.lua')],
    });
    const text = await expectedText(result);
    const parsed = JSON.parse(text);
    expect(parsed.reused).toBe(false);
    expect(parsed.staging_dir.startsWith(STAGING_ROOT)).toBe(true);
    expect(parsed.entry_point).toBe('main.lua');
    expect(parsed.file_count).toBe(1);
    expect(parsed.resolved_paths).toEqual([join(root, 'main.lua')]);
  });

  it('pytha_load_project_paths rejects paths outside workspace_root', async () => {
    const root = await fixture({});
    const response = await callTool(1, 'pytha_load_project_paths', {
      workspace_root: root,
      project_paths: [join(root, '..', 'outside.lua')],
    });
    const r = response as { error?: { code: number; message: string } };
    expect(r.error).toBeDefined();
    expect(r.error?.message).toMatch(/escapes workspace root/i);
  });

  it('pytha_load_project_paths requires workspace_root', async () => {
    const root = await fixture({ 'main.lua': 'print("hi")' });
    const response = await callTool(1, 'pytha_load_project_paths', {
      project_paths: [join(root, 'main.lua')],
    });
    const r = response as { error?: { code: number; message: string } };
    expect(r.error).toBeDefined();
    expect(r.error?.message).toContain('workspace_root');
  });

  it('pytha_load_project_paths requires project_paths', async () => {
    const root = await fixture({});
    const response = await callTool(1, 'pytha_load_project_paths', {
      workspace_root: root,
    });
    const r = response as { error?: { code: number; message: string } };
    expect(r.error).toBeDefined();
    expect(r.error?.message).toContain('project_paths');
  });
});
