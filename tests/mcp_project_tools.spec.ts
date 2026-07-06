// Vitest suite for project-shaped tools at the dispatcher layer:
// pytha_run_project, pytha_load_project, pytha_unload_project,
// pytha_reload_project, pytha_clear_all_projects.
//
// We stub the WebSocket runtime by replacing `runPythaLua` via
// dispatching JSON-RPC through the `dispatchJsonRpc` export.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { dispatchJsonRpc } from '../runtime/mcp_core.js';
import {
  STAGING_ROOT,
  clearAllProjects,
} from '../runtime/mcp_project.js';

function rpc(id: number | null, method: string, params?: unknown): unknown {
  return { jsonrpc: '2.0', id, method, params };
}

async function zipBase64(entries: Record<string, string>): Promise<string> {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(entries)) zip.file(name, content);
  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  return buffer.toString('base64');
}

function callTool(id: number, toolName: string, args: Record<string, unknown>): Promise<unknown> {
  return dispatchJsonRpc(
    rpc(id, 'tools/call', { name: toolName, arguments: args }) as { jsonrpc: '2.0'; id: number; method: string; params: unknown },
  );
}

async function expectedText(result: unknown): Promise<string> {
  const r = result as { result: { content: Array<{ type: string; text: string }> } };
  return r.result.content[0].text;
}

beforeEach(async () => {
  await clearAllProjects();
});

afterEach(async () => {
  await clearAllProjects();
});

describe('project-shaped MCP tools', () => {
  it('exposes the new tools alongside the chunked-call ones', async () => {
    const response = await dispatchJsonRpc(
      rpc(1, 'tools/list') as { jsonrpc: '2.0'; id: number; method: string },
    );
    const tools = (response as { result: { tools: Array<{ name: string }> } }).result.tools;
    const names = tools.map((tool) => tool.name);
    expect(names).toContain('pytha_run_lua');
    expect(names).toContain('pytha_watch_lua');
    expect(names).toContain('pytha_run_project');
    expect(names).toContain('pytha_load_project');
    expect(names).toContain('pytha_unload_project');
    expect(names).toContain('pytha_reload_project');
    expect(names).toContain('pytha_clear_all_projects');
  });

  it('pytha_load_project stages a zip and returns staging metadata', async () => {
    const zip = await zipBase64({ 'main.lua': `print('hello')` });
    const result = await callTool(1, 'pytha_load_project', { project_zip_b64: zip });
    const text = await expectedText(result);
    const parsed = JSON.parse(text);
    expect(parsed.reused).toBe(false);
    expect(parsed.staging_dir.startsWith(STAGING_ROOT)).toBe(true);
    expect(parsed.entry_point).toBe('main.lua');
    expect(parsed.file_count).toBe(1);
  });

  it('pytha_load_project reuses the same staging on identical payloads', async () => {
    const zip = await zipBase64({ 'main.lua': `print('hello')` });
    const first = JSON.parse(await expectedText(await callTool(1, 'pytha_load_project', { project_zip_b64: zip })));
    const second = JSON.parse(await expectedText(await callTool(2, 'pytha_load_project', { project_zip_b64: zip })));
    expect(second.reused).toBe(true);
    expect(second.staging_dir).toBe(first.staging_dir);
  });

  it('pytha_unload_project removes the staging directory', async () => {
    const zip = await zipBase64({ 'main.lua': `print('hello')` });
    const load = JSON.parse(await expectedText(await callTool(1, 'pytha_load_project', { project_zip_b64: zip })));
    const unload = JSON.parse(await expectedText(await callTool(2, 'pytha_unload_project', { project_id: load.project_id })));
    expect(unload.removed).toBe(true);

    // Cleanup should NOT be reached on no-op unloads either.
    const noop = JSON.parse(await expectedText(await callTool(3, 'pytha_unload_project', { project_id: load.project_id })));
    expect(noop.removed).toBe(false);
  });

  it('pytha_reload_project wipes the next use via reload:true', async () => {
    const zip = await zipBase64({ 'main.lua': `print('hello')` });
    const first = JSON.parse(await expectedText(await callTool(1, 'pytha_load_project', { project_zip_b64: zip })));
    expect(first.reused).toBe(false);
    const reload = JSON.parse(
      await expectedText(
        await callTool(2, 'pytha_load_project', { project_zip_b64: zip, reload: true }),
      ),
    );
    expect(reload.reused).toBe(false);
    expect(reload.staging_dir.startsWith(STAGING_ROOT)).toBe(true);
  });

  it('pytha_clear_all_projects wipes the staging root', async () => {
    const a = await zipBase64({ 'main.lua': `print('a')` });
    const b = await zipBase64({ 'main.lua': `print('b')` });
    await callTool(1, 'pytha_load_project', { project_zip_b64: a });
    await callTool(2, 'pytha_load_project', { project_zip_b64: b });
    const summary = JSON.parse(await expectedText(await callTool(3, 'pytha_clear_all_projects', {})));
    expect(summary.cleared).toBe(2);
    expect(summary.rootRemoved).toBe(true);
  });

  it('rejects project tools that are missing required payload', async () => {
    const response = (await dispatchJsonRpc(
      rpc(1, 'tools/call', { name: 'pytha_run_project', arguments: {} }) as { jsonrpc: '2.0'; id: number; method: string; params: unknown },
    )) as { error?: { code: number; message: string } };
    expect(response.error).toBeDefined();
    expect(response.error?.message).toContain('project_zip_b64');
  });
});
