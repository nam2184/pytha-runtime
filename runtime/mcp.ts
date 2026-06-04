import 'dotenv/config';
import { watch, type FSWatcher } from 'node:fs';
import { stat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { WebSocket } from 'ws';
import type { ServerMessage } from '@/shared/protocol.js';

type JsonRpcId = string | number | null;

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: JsonRpcId;
  method: string;
  params?: unknown;
}

interface LuaFilePayload {
  name: string;
  content: string;
}

interface RunArgs {
  code?: string;
  files?: LuaFilePayload[];
  paths?: string[];
  websocketUrl?: string;
  timeoutMs?: number;
}

interface RuntimeFeedback {
  success: boolean;
  messages: ServerMessage[];
  error?: string;
}

const SERVER_NAME = 'pytha-runtime-mcp';
const SERVER_VERSION = '0.1.0';
const PROTOCOL_VERSION = '2024-11-05';
const DEFAULT_WS_URL = process.env.PYTHA_WS_URL ?? `ws://localhost:${process.env.WS_PORT ?? 8080}`;
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_TIMEOUT_MS = 120_000;
const WORKSPACE_ROOT = process.cwd();

const tools = [
  {
    name: 'pytha_run_lua',
    description: 'Send Lua code or Lua file contents to the local Pytha WebSocket runtime and return execution feedback.',
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'Single Lua chunk to execute. Do not combine with files or paths.',
        },
        files: {
          type: 'array',
          description: 'Full Lua file data to execute. main.lua is executed after all other files are loaded.',
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
    description: 'Watch explicit Lua file paths and resend the full file set to the Pytha runtime when a file changes.',
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
] as const;

function send(message: unknown) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function sendResult(id: JsonRpcId | undefined, result: unknown) {
  send({ jsonrpc: '2.0', id, result });
}

function sendError(id: JsonRpcId | undefined, code: number, message: string, data?: unknown) {
  send({ jsonrpc: '2.0', id, error: { code, message, data } });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getArgs(params: unknown): RunArgs {
  if (!isObject(params) || !isObject(params.arguments)) return {};
  return params.arguments as RunArgs;
}

function getToolName(params: unknown): string | undefined {
  if (!isObject(params) || typeof params.name !== 'string') return undefined;
  return params.name;
}

function resolveWorkspacePath(filePath: string): string {
  const absolutePath = path.resolve(WORKSPACE_ROOT, filePath);
  const relativePath = path.relative(WORKSPACE_ROOT, absolutePath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(`Path escapes workspace: ${filePath}`);
  }
  return absolutePath;
}

async function filesFromPaths(paths: string[]): Promise<LuaFilePayload[]> {
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

function validateFiles(files: LuaFilePayload[]): LuaFilePayload[] {
  return files.map((file, index) => {
    if (!isObject(file) || typeof file.name !== 'string' || typeof file.content !== 'string') {
      throw new Error(`files[${index}] must contain string name and content fields.`);
    }
    return { name: path.basename(file.name), content: file.content };
  });
}

function getTimeoutMs(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return DEFAULT_TIMEOUT_MS;
  }
  return Math.min(Math.trunc(value), MAX_TIMEOUT_MS);
}

function getBoundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.trunc(value), min), max);
}

async function getRunPayload(args: RunArgs): Promise<{ code?: string; files?: LuaFilePayload[] }> {
  const inputs = [typeof args.code === 'string', Array.isArray(args.files), Array.isArray(args.paths)].filter(Boolean).length;
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

function runPythaLua(args: RunArgs): Promise<RuntimeFeedback> {
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
        ws?.send(JSON.stringify({
          type: 'execute',
          id: `mcp_${Date.now()}`,
          timestamp: Date.now(),
          ...payload,
        }));
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

async function watchPythaLua(args: RunArgs): Promise<RuntimeFeedback[]> {
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

function summarizeFeedback(feedback: RuntimeFeedback): string {
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

function summarizeWatchFeedback(runs: RuntimeFeedback[]): string {
  if (runs.length === 0) return 'Pytha watch completed without any executions.';

  return runs
    .map((feedback, index) => `Run ${index + 1}\n${summarizeFeedback(feedback)}`)
    .join('\n\n---\n\n');
}

async function handleRequest(request: JsonRpcRequest) {
  try {
    switch (request.method) {
      case 'initialize':
        sendResult(request.id, {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        });
        return;
      case 'tools/list':
        sendResult(request.id, { tools });
        return;
      case 'tools/call': {
        const toolName = getToolName(request.params);
        if (toolName !== 'pytha_run_lua' && toolName !== 'pytha_watch_lua') {
          sendError(request.id, -32602, `Unknown tool: ${toolName ?? 'missing'}`);
          return;
        }

        if (toolName === 'pytha_watch_lua') {
          const runs = await watchPythaLua(getArgs(request.params));
          sendResult(request.id, {
            content: [{ type: 'text', text: summarizeWatchFeedback(runs) }],
            isError: runs.some((feedback) => !feedback.success),
          });
          return;
        }

        const feedback = await runPythaLua(getArgs(request.params));
        sendResult(request.id, {
          content: [{ type: 'text', text: summarizeFeedback(feedback) }],
          isError: !feedback.success,
        });
        return;
      }
      case 'ping':
        sendResult(request.id, {});
        return;
      case 'notifications/initialized':
        return;
      default:
        if (request.id !== undefined) {
          sendError(request.id, -32601, `Method not found: ${request.method}`);
        }
    }
  } catch (error) {
    sendError(request.id, -32603, error instanceof Error ? error.message : String(error));
  }
}

let inputBuffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  inputBuffer += chunk;
  let newlineIndex = inputBuffer.indexOf('\n');
  while (newlineIndex !== -1) {
    const line = inputBuffer.slice(0, newlineIndex).trim();
    inputBuffer = inputBuffer.slice(newlineIndex + 1);
    newlineIndex = inputBuffer.indexOf('\n');

    if (!line) continue;

    try {
      const request = JSON.parse(line) as JsonRpcRequest;
      void handleRequest(request);
    } catch (error) {
      sendError(undefined, -32700, error instanceof Error ? error.message : String(error));
    }
  }
});

process.stdin.on('end', () => {
  process.exitCode = 0;
});
