// Pytha MCP over HTTP — supports the three transports Arachne speaks:
//
//   - streamable_http (MCP 2024-11-05): POST /mcp, application/json or
//     text/event-stream response, mcp-session-id header round-trip.
//
//   - polling_http: same as streamable but the client requires plain
//     application/json. We honor that automatically by inspecting the
//     Accept header.
//
//   - legacy SSE: GET /mcp opens a text/event-stream whose first event
//     is `event: endpoint` carrying a POST URL; subsequent JSON-RPC
//     requests are POSTed to that URL and responses flow back over the
//     same SSE stream.
//
// The runtime request surface is intentionally narrow: we only test
// via the protocol-level `handleHttpRpc` helper, which is what the
// `http.createServer` callbacks plug into. That keeps vitest fast and
// free of port-binding flakiness.
//
// CLI: `tsx runtime/mcp_http.ts` (or `npm run mcp:http`).
// Env:
//   PYTHA_HTTP_PORT     default 7007
//   PYTHA_HTTP_HOST     default 127.0.0.1
//   PYTHA_HTTP_PATH     default /mcp
//   PYTHA_HTTP_TOKEN    optional Bearer token; clients must send
//                       `Authorization: Bearer <token>` or get 401.

import * as http from 'node:http';
import { randomUUID } from 'node:crypto';
import { dispatchJsonRpc, type JsonRpcRequest, type JsonRpcResponse } from './mcp_core.js';

export interface HttpTransportRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
  query: Record<string, string | string[] | undefined>;
}

export interface HttpTransportResponse {
  status: number;
  headers: Record<string, string>;
  body: string | null | object | unknown[];
}

export interface HttpTransportOptions {
  requiredToken?: string;
  onSessionCreated?: (sessionId: string) => void;
}

/* -------------------------------------------------------------------------- */
/* streamable_http / polling_http                                              */
/* -------------------------------------------------------------------------- */

function ensureSessionId(supplied: string | undefined, onCreated?: (id: string) => void): string {
  if (supplied && supplied.trim().length > 0) {
    return supplied;
  }
  const id = randomUUID();
  onCreated?.(id);
  return id;
}

function prefersEventStream(accept: string | undefined): boolean {
  if (!accept) return false;
  return accept
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .some((value) => value === 'text/event-stream');
}

function wantsJson(accept: string | undefined): boolean {
  if (!accept) return true;
  const parts = accept
    .split(',')
    .map((value) => value.trim().toLowerCase());
  const hasJson = parts.some((value) => value.startsWith('application/json'));
  const hasEventStream = parts.some((value) => value === 'text/event-stream');
  // Either signal means we can serve the response. Pure text/event-stream
  // without an application/json hint is unusual but some clients send
  // it; we still respond with JSON-RPC.
  return hasJson || hasEventStream;
}

function contentTypeOf(headers: Record<string, string>): string {
  return Object.entries(headers).find(([name]) => name.toLowerCase() === 'content-type')?.[1] ?? '';
}

function headerOf(headers: Record<string, string>, name: string): string | undefined {
  return Object.entries(headers).find(([entry]) => entry.toLowerCase() === name.toLowerCase())?.[1];
}

function isJsonContentType(value: string): boolean {
  return value.toLowerCase().includes('application/json');
}

function unauthorizedResponse(): HttpTransportResponse {
  return {
    status: 401,
    headers: {
      'content-type': 'application/json',
      'www-authenticate': 'Bearer realm="pytha-runtime-mcp"',
    },
    body: {
      jsonrpc: '2.0',
      id: null,
      error: { code: -32001, message: 'Authentication required.' },
    },
  };
}

function passesAuth(request: HttpTransportRequest, requiredToken: string | undefined): boolean {
  if (!requiredToken) return true;
  const auth = headerOf(request.headers, 'authorization') ?? '';
  return auth === `Bearer ${requiredToken}`;
}

function parseAcceptForStreamable(accept: string | undefined): boolean {
  // Arachne's streamable_http client sends Accept:
  //   application/json, text/event-stream
  // but some clients and tests prefer only text/event-stream. Either
  // pattern is treated as a stream response.
  if (!accept) return false;
  const parts = accept.split(',').map((value) => value.trim().toLowerCase());
  const hasEventStream = parts.some((value) => value === 'text/event-stream');
  const hasJson = parts.some((value) => value.startsWith('application/json'));
  // Prefer stream only when the client mentioned event-stream AND the
  // response will be a single message (caller-side check).
  return hasEventStream && hasJson;
}

function acceptsStreamable(accept: string): boolean {
  return accept
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .some((value) => value === 'application/json, text/event-stream');
}

function commonHeaders(
  request: HttpTransportRequest,
  sessionId: string,
): Record<string, string> {
  const requestOrigin = headerOf(request.headers, 'origin');
  const allowOrigin = requestOrigin ?? '*';
  return {
    'access-control-allow-origin': allowOrigin,
    'access-control-allow-headers': 'content-type, accept, mcp-session-id, authorization',
    'access-control-allow-methods': 'POST, GET, OPTIONS',
    'access-control-expose-headers': 'mcp-session-id',
    'mcp-session-id': sessionId,
    vary: 'origin',
  };
}

export async function handleHttpRpc(
  request: HttpTransportRequest,
  options: HttpTransportOptions = {},
): Promise<HttpTransportResponse> {
  if (!passesAuth(request, options.requiredToken)) return unauthorizedResponse();

  if (request.method === 'OPTIONS') {
    return {
      status: 204,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'content-type, accept, mcp-session-id, authorization',
        'access-control-allow-methods': 'POST, GET, OPTIONS',
        'access-control-max-age': '600',
        'mcp-session-id': ensureSessionId(undefined, options.onSessionCreated),
      },
      body: null,
    };
  }

  if (request.method !== 'POST') {
    return {
      status: 405,
      headers: {
        'content-type': 'application/json',
        allow: 'POST',
        'mcp-session-id': ensureSessionId(undefined, options.onSessionCreated),
      },
      body: { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Method not allowed' } },
    };
  }

  const contentType = contentTypeOf(request.headers);
  if (!isJsonContentType(contentType)) {
    return {
      status: 415,
      headers: {
        'content-type': 'application/json',
        'mcp-session-id': ensureSessionId(
          headerOf(request.headers, 'mcp-session-id'),
          options.onSessionCreated,
        ),
      },
      body: { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Content-Type must be application/json' } },
    };
  }

  const accept = headerOf(request.headers, 'accept');
  if (!wantsJson(accept)) {
    return {
      status: 406,
      headers: {
        'content-type': 'application/json',
        'mcp-session-id': ensureSessionId(
          headerOf(request.headers, 'mcp-session-id'),
          options.onSessionCreated,
        ),
      },
      body: { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Accept must include application/json' } },
    };
  }

  const sessionId = ensureSessionId(
    headerOf(request.headers, 'mcp-session-id'),
    options.onSessionCreated,
  );

  // Some clients send a JSON array (batch). Normalize to an array of
  // single requests so dispatchJsonRpc can stay simple.
  const rawMessages = Array.isArray(request.body) ? request.body : [request.body];
  const parsed: JsonRpcRequest[] = [];
  for (const rawMessage of rawMessages) {
    if (!rawMessage || typeof rawMessage !== 'object') {
      return {
        status: 400,
        headers: { 'content-type': 'application/json', 'mcp-session-id': sessionId },
        body: { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Invalid JSON-RPC payload' } },
      };
    }
    parsed.push(rawMessage as JsonRpcRequest);
  }

  // Notifications only -> 202, no body.
  const hasAnyRequest = parsed.some((message) => message.id !== undefined);
  if (!hasAnyRequest) {
    await Promise.all(parsed.map((message) => dispatchJsonRpc(message)));
    return {
      status: 202,
      headers: { 'content-type': 'application/json', 'mcp-session-id': sessionId },
      body: null,
    };
  }

  const responses: JsonRpcResponse[] = [];
  for (const message of parsed) {
    const response = await dispatchJsonRpc(message);
    if (response !== null) {
      // dispatchJsonRpc may omit the id for unrecognized notifications;
      // for *requests* an id is required so just normalize.
      responses.push(response.id === null ? { ...response, id: message.id ?? null } : response);
    }
  }

  // Arachne's streamable_http client expects: JSON by default;
  // SSE envelope only if Accept mentions text/event-stream.
  const useStream = parseAcceptForStreamable(accept);

  if (useStream && responses.length === 1) {
    const body = serializeSseEvent({
      event: 'message',
      data: JSON.stringify(responses[0]),
    });
    return {
      status: 200,
      headers: {
        ...commonHeaders(request, sessionId),
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      },
      body,
    };
  }

  return {
    status: 200,
    headers: {
      ...commonHeaders(request, sessionId),
      'content-type': 'application/json',
    },
    body: responses.length === 1 ? responses[0] : responses,
  };
}

/* -------------------------------------------------------------------------- */
/* Legacy SSE                                                                  */
/* -------------------------------------------------------------------------- */

export function buildSseResponse(options: {
  origin: string;
  sessionId: string;
  endpointPath?: string;
}): { body: string; headers: Record<string, string> } {
  const rawPath = options.endpointPath ?? '/messages';
  const normalizedPath = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
  let target: string;
  try {
    const base = new URL(options.origin);
    target = new URL(normalizedPath, base).toString();
  } catch {
    target = `${options.origin.replace(/\/+$/, '')}${normalizedPath}?sessionId=${encodeURIComponent(options.sessionId)}`;
  }
  target = `${target}${target.includes('?') ? '&' : '?'}sessionId=${encodeURIComponent(options.sessionId)}`;

  const dataLine = `data: ${joinData(target)}`;
  const event = serializeSseEvent({
    event: 'endpoint',
    data: dataLine.slice('data: '.length),
  });

  return {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'access-control-allow-origin': '*',
    },
    body: event,
  };
}

function joinData(value: string): string {
  return value.replace(/\r?\n/g, '\ndata: ');
}

interface SseEventInput {
  event: string;
  data: string;
}

function serializeSseEvent(input: SseEventInput): string {
  return [
    `event: ${input.event}`,
    `data: ${joinData(input.data)}`,
    '',
    '',
  ].join('\r\n');
}

/* -------------------------------------------------------------------------- */
/* Server bootstrap                                                            */
/* -------------------------------------------------------------------------- */

export interface StartHttpMcpOptions {
  port?: number;
  host?: string;
  path?: string;
  requiredToken?: string;
}

export function startHttpMcpServer(
  options: StartHttpMcpOptions = {},
): { server: http.Server; port: number; host: string; path: string; close: () => Promise<void> } {
  const port = Number(options.port ?? process.env.PYTHA_HTTP_PORT ?? 7007);
  const host = options.host ?? process.env.PYTHA_HTTP_HOST ?? '127.0.0.1';
  const path = options.path ?? process.env.PYTHA_HTTP_PATH ?? '/mcp';
  const requiredToken = options.requiredToken ?? process.env.PYTHA_HTTP_TOKEN;

  // Single out param: how do we deliver follow-up SSE responses to the
  // legacy client that opened a GET on /mcp? Keep it simple: each
  // session owns an in-memory queue of buffered messages and the SSE
  // connection flushes them as they come in. We extend the request
  // type lazily here so we don't leak it through the public API.
  type SseClient = {
    sessionId: string;
    write: (chunk: string) => boolean;
    close: () => void;
  };
  const sseClients = new Map<string, Set<SseClient>>();

  const server = http.createServer(async (req, res) => {
    const baseHeaders = {
      'x-content-type-options': 'nosniff',
    } as const;

    try {
      const url = new URL(req.url ?? '/', `http://${host}`);

      // Legacy SSE GET on the canonical path.
      if (req.method === 'GET' && (url.pathname === path || url.pathname === `${path}/`)) {
        const clientSession = ensureSessionId(
          headerFromIncoming(req, 'mcp-session-id'),
          () => undefined,
        );
        res.writeHead(200, {
          ...baseHeaders,
          ...(buildSseResponse({
            origin: `${url.protocol}//${req.headers.host ?? host}`,
            sessionId: clientSession,
          }).headers),
        });
        const initialBody = buildSseResponse({
          origin: `${url.protocol}//${req.headers.host ?? host}`,
          sessionId: clientSession,
        }).body;
        res.write(initialBody);
        const client: SseClient = {
          sessionId: clientSession,
          write: (chunk) => res.write(chunk),
          close: () => res.end(),
        };
        let set = sseClients.get(clientSession);
        if (!set) {
          set = new Set();
          sseClients.set(clientSession, set);
        }
        set.add(client);
        req.on('close', () => {
          set!.delete(client);
        });
        return;
      }

      // Legacy SSE POST messages endpoint.
      const messagesMatch = url.pathname === `${path}/messages`;
      if (req.method === 'POST' && messagesMatch) {
        const sessionId = url.searchParams.get('sessionId') ?? '';
        if (!sessionId) {
          res.writeHead(400, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: 'missing sessionId' }));
          return;
        }
        const body = await readJsonBody(req);
        const response = await dispatchJsonRpc(body as JsonRpcRequest);
        // Echo back via any open SSE client; otherwise respond directly
        // to the POST with the JSON-RPC body. Arachne's legacy SSE
        // client expects the response on the stream, so that's the
        // preferred path.
        const clients = sseClients.get(sessionId);
        if (clients && clients.size > 0 && response !== null) {
          for (const client of clients) {
            client.write(serializeSseEvent({ event: 'message', data: JSON.stringify(response) }));
          }
          res.writeHead(202, { 'content-type': 'application/json' });
          res.end(null);
          return;
        }
        if (response === null) {
          res.writeHead(202, { 'content-type': 'application/json' });
          res.end(null);
          return;
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(response));
        return;
      }

      // Streamable HTTP requests on the canonical path.
      if (req.method !== 'POST' || (url.pathname !== path && url.pathname !== `${path}/`)) {
        res.writeHead(404, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'not found' }));
        return;
      }

      const body = await readJsonBody(req);
      const headers = normalizeIncomingHeaders(req.headers);
      const transportResponse = await handleHttpRpc(
        {
          method: req.method ?? 'POST',
          url: url.pathname,
          headers,
          body,
          query: Object.fromEntries([...url.searchParams.entries()].map(([key, value]) => [key, value])),
        },
        { requiredToken, onSessionCreated: () => undefined },
      );

      const out: Record<string, string> = { ...baseHeaders };
      for (const [name, value] of Object.entries(transportResponse.headers)) {
        out[name.toLowerCase()] = value;
      }
      const status = transportResponse.status;
      res.writeHead(status, out);

      const responseBody = transportResponse.body;
      if (responseBody === null || responseBody === undefined) {
        res.end();
        return;
      }

      if (typeof responseBody === 'string') {
        res.end(responseBody);
        return;
      }

      res.end(JSON.stringify(responseBody));
    } catch (error) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
    }
  });

  return {
    server,
    port,
    host,
    path,
    close: () =>
      new Promise<void>((resolve, reject) => {
        for (const clients of sseClients.values()) {
          for (const client of clients) client.close();
        }
        sseClients.clear();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function headerFromIncoming(req: http.IncomingMessage, name: string): string | undefined {
  const value = req.headers[name.toLowerCase()];
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value[0];
  return undefined;
}

function normalizeIncomingHeaders(headers: http.IncomingHttpHeaders): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    if (typeof value === 'string') {
      result[name] = value;
    } else if (Array.isArray(value)) {
      result[name] = value.join(', ');
    }
  }
  return result;
}

async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (raw.length === 0) return {};
  return JSON.parse(raw);
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                 */
/* -------------------------------------------------------------------------- */

const isCli = import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/')}`;

if (isCli) {
  const { server, port, host, path: route, close } = startHttpMcpServer();
  server.listen(port, host, () => {
    // eslint-disable-next-line no-console
    console.log(`[pytha-mcp] http listening on http://${host}:${port}${route}`);
    console.log(`[pytha-mcp] streamable_http    : POST ${route}`);
    console.log(`[pytha-mcp] legacy sse        : GET  ${route} + POST ${route}/messages?sessionId=...`);
    if (process.env.PYTHA_HTTP_TOKEN) {
      console.log('[pytha-mcp] auth             : Bearer token required');
    }
  });

  const shutdown = () => {
    void close().then(() => process.exit(0)).catch((error) => {
      console.error('[pytha-mcp] shutdown error:', error);
      process.exit(1);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
