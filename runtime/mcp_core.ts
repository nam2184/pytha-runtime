// Shared MCP core for the Pytha runtime.
//
// Both transports (stdio in `runtime/mcp.ts` and HTTP/SSE in
// `runtime/mcp_http.ts`) compose against the same tool definitions,
// JSON-RPC handlers, and helpers. The goal is to keep protocol logic
// in one place so HTTP behavior matches existing stdio behavior.

import path from 'node:path';
import { stat, readFile } from 'node:fs/promises';
import { watch, type FSWatcher } from 'node:fs';
import { WebSocket } from 'ws';
import type { ServerMessage } from '@/shared/protocol.js';
import {
  clearAllProjects,
  findStagedProject,
  hashProjectPayload,
  listStagedProjects,
  stageProject,
  unloadProject,
  type StagedProject,
} from './mcp_project.js';

export const SERVER_NAME = 'pytha-runtime-mcp';
export const SERVER_VERSION = '0.1.0';
export const PROTOCOL_VERSION = '2024-11-05';
export const DEFAULT_WS_URL = process.env.PYTHA_WS_URL ?? `ws://localhost:${process.env.WS_PORT ?? 8080}`;
export const DEFAULT_TIMEOUT_MS = 15_000;
export const MAX_TIMEOUT_MS = 120_000;
export const WORKSPACE_ROOT = process.cwd();

export type JsonRpcId = string | number | null;

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: JsonRpcId;
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: JsonRpcId | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export const TOOLS: ReadonlyArray<McpToolDefinition> = [
  {
    name: 'pytha_run_lua',
    description:
      'Send Lua code or Lua file contents to the local Pytha WebSocket runtime and return execution feedback.',
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'Single Lua chunk to execute. Do not combine with files or paths.',
        },
        files: {
          type: 'array',
          description:
            'Full Lua file data to execute. main.lua is executed after all other files are loaded.',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Lua file name, for example main.lua.' },
              content: { type: 'string', description: 'Lua source code.' },
            },
            required: ['name', 'content'],
            additionalProperties: false,
          },
        },
        paths: {
          type: 'array',
          description: 'Workspace-relative Lua file paths. File basenames are sent to the runtime.',
          items: { type: 'string' },
        },
        websocketUrl: {
          type: 'string',
          description: `Override WebSocket URL. Defaults to ${DEFAULT_WS_URL}.`,
        },
        timeoutMs: {
          type: 'number',
          description: `Runtime response timeout. Defaults to ${DEFAULT_TIMEOUT_MS}.`,
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'pytha_watch_lua',
    description:
      'Watch explicit Lua file paths and resend the full file set to the Pytha runtime when a file changes.',
    inputSchema: {
      type: 'object',
      properties: {
        paths: {
          type: 'array',
          description: 'Workspace-relative Lua file paths to watch and send as a full file set.',
          items: { type: 'string' },
        },
        websocketUrl: {
          type: 'string',
          description: `Override WebSocket URL. Defaults to ${DEFAULT_WS_URL}.`,
        },
        timeoutMs: {
          type: 'number',
          description: `Per-execution runtime response timeout. Defaults to ${DEFAULT_TIMEOUT_MS}.`,
        },
        durationMs: {
          type: 'number',
          description: 'How long to watch before returning feedback. Defaults to 60000, max 300000.',
        },
        debounceMs: {
          type: 'number',
          description: 'Delay after file changes before resending. Defaults to 250.',
        },
        maxRuns: {
          type: 'number',
          description: 'Maximum executions during the watch. Defaults to 20.',
        },
      },
      required: ['paths'],
      additionalProperties: false,
    },
  },
  {
    name: 'pytha_run_project',
    description:
      'Stage a base64-encoded Pytha Lua project (zip), execute its entry point against the Pytha runtime, and return execution feedback. Re-invocations with the same payload reuse the cached staging. Pass `reload: true` to wipe and re-extract before running.',
    inputSchema: {
      type: 'object',
      required: ['project_zip_b64'],
      properties: {
        project_id: {
          type: 'string',
          description:
            'Optional project id to reuse; if omitted, computed as the SHA-256 of the project payload.',
        },
        project_zip_b64: {
          type: 'string',
          description: 'The Pytha project as a base64-encoded zip archive.',
        },
        entry: {
          type: 'string',
          description:
            'Optional entry-point path inside the staged project (default: autodetect main.lua/init.lua or fall back to "main.lua").',
        },
        reload: {
          type: 'boolean',
          description: 'If true, wipe the cached staging for this project id and re-extract before running.',
        },
        timeoutMs: {
          type: 'number',
          description: `Runtime response timeout. Defaults to ${DEFAULT_TIMEOUT_MS}.`,
        },
        websocketUrl: {
          type: 'string',
          description: `Override WebSocket URL. Defaults to ${DEFAULT_WS_URL}.`,
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'pytha_load_project',
    description:
      'Stage a base64-encoded Pytha Lua project (zip) without executing it. Useful when the agent wants to inspect the staged files before choosing a run or entry point.',
    inputSchema: {
      type: 'object',
      required: ['project_zip_b64'],
      properties: {
        project_id: {
          type: 'string',
          description: 'Optional project id to reuse.',
        },
        project_zip_b64: { type: 'string' },
        entry: { type: 'string', description: 'Optional entry-point override.' },
        reload: { type: 'boolean' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'pytha_reload_project',
    description:
      'Wipe the cached staging directory for the given project id. The next call to pytha_run_project or pytha_load_project with the same payload will re-extract from scratch.',
    inputSchema: {
      type: 'object',
      required: ['project_id'],
      properties: {
        project_id: { type: 'string' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'pytha_unload_project',
    description: 'Remove a staged project by id and any background watcher tied to it.',
    inputSchema: {
      type: 'object',
      required: ['project_id'],
      properties: { project_id: { type: 'string' } },
      additionalProperties: false,
    },
  },
  {
    name: 'pytha_clear_all_projects',
    description:
      'Wipe every cached project staging and terminate any running watcher. Use when the agent is done with the session and wants hermetic cleanup.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
] as const;

export interface LuaFilePayload {
  name: string;
  content: string;
}

export interface RunArgs {
  code?: string;
  files?: LuaFilePayload[];
  paths?: string[];
  websocketUrl?: string;
  timeoutMs?: number;
}

export interface RuntimeFeedback {
  success: boolean;
  messages: ServerMessage[];
  error?: string;
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function getArgs(params: unknown): RunArgs {
  if (!isObject(params) || !isObject(params.arguments)) return {};
  return params.arguments as RunArgs;
}

export function getToolName(params: unknown): string | undefined {
  if (!isObject(params) || typeof params.name !== 'string') return undefined;
  return params.name;
}

export function resolveWorkspacePath(filePath: string): string {
  const absolutePath = path.resolve(WORKSPACE_ROOT, filePath);
  const relativePath = path.relative(WORKSPACE_ROOT, absolutePath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(`Path escapes workspace: ${filePath}`);
  }
  return absolutePath;
}

export async function filesFromPaths(paths: string[]): Promise<LuaFilePayload[]> {
  const files: LuaFilePayload[] = [];
  const names = new Set<string>();

  for (const requestedPath of paths) {
    if (typeof requestedPath !== 'string' || requestedPath.trim() === '') {
      throw new Error('Every path must be a non-empty string.');
    }

    const absolutePath = resolveWorkspacePath(requestedPath);
    const info = await stat(absolutePath);
    if (!info.isFile()) {
      throw new Error(`Path is not a file: ${requestedPath}`);
    }

    const name = path.basename(absolutePath);
    if (names.has(name)) {
      throw new Error(`Duplicate Lua file basename: ${name}`);
    }
    names.add(name);

    files.push({
      name,
      content: await readFile(absolutePath, 'utf8'),
    });
  }

  return files;
}

export function validateFiles(files: LuaFilePayload[]): LuaFilePayload[] {
  return files.map((file, index) => {
    if (!isObject(file) || typeof file.name !== 'string' || typeof file.content !== 'string') {
      throw new Error(`files[${index}] must contain string name and content fields.`);
    }
    return { name: path.basename(file.name), content: file.content };
  });
}

export function getTimeoutMs(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return DEFAULT_TIMEOUT_MS;
  }
  return Math.min(Math.trunc(value), MAX_TIMEOUT_MS);
}

export function getBoundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.trunc(value), min), max);
}

export async function getRunPayload(args: RunArgs): Promise<{ code?: string; files?: LuaFilePayload[] }> {
  const inputs = [
    typeof args.code === 'string',
    Array.isArray(args.files),
    Array.isArray(args.paths),
  ].filter(Boolean).length;
  if (inputs !== 1) {
    throw new Error('Provide exactly one of code, files, or paths.');
  }

  if (typeof args.code === 'string') {
    return { code: args.code };
  }

  if (Array.isArray(args.files)) {
    return { files: validateFiles(args.files) };
  }

  if (Array.isArray(args.paths)) {
    return { files: await filesFromPaths(args.paths) };
  }

  throw new Error('No Lua input provided.');
}

export function runPythaLua(args: RunArgs): Promise<RuntimeFeedback> {
  return new Promise((resolve) => {
    const websocketUrl = args.websocketUrl ?? DEFAULT_WS_URL;
    const timeoutMs = getTimeoutMs(args.timeoutMs);
    const messages: ServerMessage[] = [];
    let settled = false;
    let ws: WebSocket | undefined;

    const finish = (feedback: RuntimeFeedback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      ws?.close();
      resolve(feedback);
    };

    const timer = setTimeout(() => {
      finish({
        success: false,
        messages,
        error: `Timed out after ${timeoutMs}ms waiting for Pytha runtime feedback.`,
      });
    }, timeoutMs);

    try {
      ws = new WebSocket(websocketUrl);
    } catch (error) {
      finish({ success: false, messages, error: String(error) });
      return;
    }

    ws.on('open', async () => {
      try {
        const payload = await getRunPayload(args);
        ws?.send(
          JSON.stringify({
            type: 'execute',
            id: `mcp_${Date.now()}`,
            timestamp: Date.now(),
            ...payload,
          }),
        );
      } catch (error) {
        finish({ success: false, messages, error: error instanceof Error ? error.message : String(error) });
      }
    });

    ws.on('message', (data) => {
      const raw = Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
      try {
        const message = JSON.parse(raw) as ServerMessage;
        messages.push(message);
        if (message.type === 'result') {
          finish({ success: Boolean(message.success), messages });
        } else if (message.type === 'error') {
          finish({ success: false, messages, error: message.message });
        }
      } catch (error) {
        messages.push({
          type: 'error',
          id: `mcp_parse_${Date.now()}`,
          timestamp: Date.now(),
          message: `Could not parse runtime message: ${raw}`,
        });
        finish({ success: false, messages, error: error instanceof Error ? error.message : String(error) });
      }
    });

    ws.on('error', (error) => {
      finish({
        success: false,
        messages,
        error: `Could not connect to Pytha WebSocket runtime at ${websocketUrl}: ${error.message}`,
      });
    });
  });
}

export async function watchPythaLua(args: RunArgs): Promise<RuntimeFeedback[]> {
  if (!Array.isArray(args.paths) || args.paths.length === 0) {
    throw new Error('pytha_watch_lua requires at least one path.');
  }

  const absolutePaths = args.paths.map(resolveWorkspacePath);
  for (const absolutePath of absolutePaths) {
    const info = await stat(absolutePath);
    if (!info.isFile()) throw new Error(`Path is not a file: ${absolutePath}`);
  }

  const durationMs = getBoundedNumber((args as Record<string, unknown>).durationMs, 60_000, 1_000, 300_000);
  const debounceMs = getBoundedNumber((args as Record<string, unknown>).debounceMs, 250, 50, 5_000);
  const maxRuns = getBoundedNumber((args as Record<string, unknown>).maxRuns, 20, 1, 200);
  const feedback: RuntimeFeedback[] = [];

  return new Promise((resolve) => {
    const watchers: FSWatcher[] = [];
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    let running = false;
    let pending = false;
    let finished = false;

    const cleanup = () => {
      if (finished) return;
      finished = true;
      clearTimeout(doneTimer);
      if (debounceTimer) clearTimeout(debounceTimer);
      for (const watcher of watchers) watcher.close();
      resolve(feedback);
    };

    const execute = async () => {
      if (finished) return;
      if (running) {
        pending = true;
        return;
      }

      running = true;
      feedback.push(await runPythaLua({ ...args, paths: args.paths }));
      running = false;

      if (feedback.length >= maxRuns) {
        cleanup();
        return;
      }

      if (pending) {
        pending = false;
        schedule();
      }
    };

    const schedule = () => {
      if (finished) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => void execute(), debounceMs);
    };

    const doneTimer = setTimeout(cleanup, durationMs);

    for (const absolutePath of absolutePaths) {
      watchers.push(watch(absolutePath, { persistent: true }, schedule));
    }

    void execute();
  });
}

export function summarizeFeedback(feedback: RuntimeFeedback): string {
  const logLines = feedback.messages
    .filter((message) => message.type === 'log')
    .map((message) => `[${message.level}] ${message.message}`);
  const renderCount = feedback.messages.filter((message) => message.type === 'render').length;
  const uiCount = feedback.messages.filter((message) => message.type === 'ui_create').length;
  const status = feedback.success ? 'success' : 'error';

  const summary = [
    `Pytha runtime status: ${status}`,
    feedback.error ? `Error: ${feedback.error}` : undefined,
    logLines.length > 0 ? `Logs:\n${logLines.join('\n')}` : undefined,
    renderCount > 0 ? `Render messages: ${renderCount}` : undefined,
    uiCount > 0 ? `UI dialogs: ${uiCount}` : undefined,
    `Raw feedback:\n${JSON.stringify(feedback.messages, null, 2)}`,
  ].filter(Boolean);

  return summary.join('\n\n');
}

export function summarizeWatchFeedback(runs: RuntimeFeedback[]): string {
  if (runs.length === 0) return 'Pytha watch completed without any executions.';
  return runs
    .map((feedback, index) => `Run ${index + 1}\n${summarizeFeedback(feedback)}`)
    .join('\n\n---\n\n');
}

/**
 * Dispatch a JSON-RPC request against the Pytha MCP tool surface.
 *
 * Both transports call into this; the only difference is how they
 * serialize/deserialize the wire message and what they return for an
 * unknown method.
 */
export async function dispatchJsonRpc(
  request: JsonRpcRequest,
  options: { onInitialize?: () => void } = {},
): Promise<JsonRpcResponse | null> {
  const id = request.id ?? null;
  try {
    switch (request.method) {
      case 'initialize':
        options.onInitialize?.();
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: { tools: {} },
            serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
          },
        };
      case 'tools/list':
        return { jsonrpc: '2.0', id, result: { tools: TOOLS } };
      case 'tools/call': {
        const toolName = getToolName(request.params);
        const args = getArgs(request.params);
        const PROJECT_TOOLS = new Set([
          'pytha_run_project',
          'pytha_load_project',
          'pytha_reload_project',
          'pytha_unload_project',
          'pytha_clear_all_projects',
        ]);
        if (
          toolName !== 'pytha_run_lua' &&
          toolName !== 'pytha_watch_lua' &&
          !PROJECT_TOOLS.has(toolName ?? '')
        ) {
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32602, message: `Unknown tool: ${toolName ?? 'missing'}` },
          };
        }

        if (toolName === 'pytha_clear_all_projects') {
          const summary = await clearAllProjects();
          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ cleared: summary.cleared, rootRemoved: summary.rootRemoved }),
                },
              ],
              isError: false,
            },
          };
        }

        if (toolName === 'pytha_unload_project' || toolName === 'pytha_reload_project') {
          const projectId = (args as { project_id?: string }).project_id;
          if (typeof projectId !== 'string' || projectId.length === 0) {
            return {
              jsonrpc: '2.0',
              id,
              error: { code: -32602, message: 'project_id is required' },
            };
          }
          const removed = await unloadProject(projectId);
          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ project_id: projectId, removed }),
                },
              ],
              isError: false,
            },
          };
        }

        if (toolName === 'pytha_load_project' || toolName === 'pytha_run_project') {
          const payloadArgs = args as {
            project_id?: string;
            project_zip_b64?: string;
            entry?: string;
            reload?: boolean;
            timeoutMs?: number;
            websocketUrl?: string;
          };
          if (
            typeof payloadArgs.project_zip_b64 !== 'string' ||
            payloadArgs.project_zip_b64.length === 0
          ) {
            return {
              jsonrpc: '2.0',
              id,
              error: { code: -32602, message: 'project_zip_b64 is required' },
            };
          }
          const projectId =
            payloadArgs.project_id ?? hashProjectPayload(payloadArgs.project_zip_b64);

          if (toolName === 'pytha_load_project' && payloadArgs.project_id) {
            // Explicit id reload just wipes.
            await unloadProject(projectId);
          }

          const stage = await stageProject(payloadArgs.project_zip_b64, {
            reload: payloadArgs.reload,
            entryPoint: payloadArgs.entry,
          });

          // If the caller passed an explicit project_id, alias the staged
          // entry so subsequent calls with the same id resolve correctly.
          if (payloadArgs.project_id && payloadArgs.project_id !== projectId) {
            // We don't actually store by custom id; we hash anyway.
            // No-op today; reserved for future keyed registry.
          }

          if (toolName === 'pytha_load_project') {
            return {
              jsonrpc: '2.0',
              id,
              result: {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(
                      {
                        project_id: projectId,
                        reused: stage.reused,
                        staging_dir: stage.project.staging_dir,
                        entry_point: stage.project.entry_point,
                        file_count: stage.project.file_count,
                        total_bytes: stage.project.total_bytes,
                      },
                      null,
                      2,
                    ),
                  },
                ],
                isError: false,
              },
            };
          }

          // pytha_run_project: hand the staged entry off to the runtime.
          // We pass the entry as the `code` arg because `files`/`paths`
          // don't include an internal tempdir location.
          const entryPath = `${stage.project.staging_dir}${path.sep}${stage.project.entry_point}`.replace(/[/\\]/g, path.sep);
          const luaSource = await readFile(entryPath, 'utf8');
          const feedback = await runPythaLua({
            code: luaSource,
            websocketUrl: payloadArgs.websocketUrl,
            timeoutMs: payloadArgs.timeoutMs,
          });
          const text = [
            `Project staging: ${projectId} (${stage.reused ? 'reused' : 'extracted'})`,
            `Entry point: ${stage.project.entry_point}`,
            '',
            summarizeFeedback(feedback),
          ].join('\n');
          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text }],
              isError: !feedback.success,
            },
          };
        }

        if (toolName === 'pytha_watch_lua') {
          const runs = await watchPythaLua(args);
          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: summarizeWatchFeedback(runs) }],
              isError: runs.some((feedback) => !feedback.success),
            },
          };
        }

        const feedback = await runPythaLua(args);
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: summarizeFeedback(feedback) }],
            isError: !feedback.success,
          },
        };
      }
      case 'ping':
        return { jsonrpc: '2.0', id, result: {} };
      case 'notifications/initialized':
        return null;
      default:
        if (id !== undefined) {
          return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${request.method}` } };
        }
        return null;
    }
  } catch (error) {
    return {
      jsonrpc: '2.0',
      id,
      error: { code: -32603, message: error instanceof Error ? error.message : String(error) },
    };
  }
}
