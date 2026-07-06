// Vitest suite for the MCP HTTP transport — covers the wire contract
// Arachne's streamable_http / polling_http / legacy sse clients expect.
//
// These tests exercise the request handler directly (no real socket) so
// we don't need to bind ports.

import { describe, it, expect } from 'vitest';
import {
  handleHttpRpc,
  buildSseResponse,
  type HttpTransportRequest,
} from '../runtime/mcp_http.js';

function rpc(method: string, id: number, params: unknown = {}): unknown {
  return {
    jsonrpc: '2.0',
    id,
    method,
    params,
  };
}

/** Body may be JSON object or an SSE envelope; normalise to JSON. */
function parseRpcResponseBody(body: unknown): unknown {
  if (typeof body === 'string') {
    const lines = body.split('\r\n');
    const dataLine = lines.find((line) => line.startsWith('data: ')) ?? '';
    return JSON.parse(dataLine.slice('data: '.length));
  }
  return body;
}

describe('mcp_http streamable_http transport', () => {
  it('returns the initialize result with a fresh session-id', async () => {
    const sessionsSeen = new Set<string>();
    const response = await handleHttpRpc(
      {
        method: 'POST',
        url: '/mcp',
        headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
        body: rpc('initialize', 1),
        query: {},
      },
      {
        onSessionCreated: (id) => sessionsSeen.add(id),
      },
    );

    expect(response.status).toBe(200);
    // Content-Type may be application/json or text/event-stream; both
    // are valid per the streamable_http spec.
    const contentType = response.headers['content-type'];
    expect(contentType === 'application/json' || contentType === 'text/event-stream').toBe(true);
    expect(typeof response.headers['mcp-session-id']).toBe('string');
    expect(sessionsSeen.size).toBe(1);
    expect(sessionsSeen.has(response.headers['mcp-session-id'])).toBe(true);

    const parsed = parseRpcResponseBody(response.body);
    const body = parsed as { result?: { protocolVersion?: string } };
    expect(body.result?.protocolVersion).toBe('2024-11-05');
  });

  it('round-trips session id across requests when the client supplies one', async () => {
    const first = await handleHttpRpc(
      {
        method: 'POST',
        url: '/mcp',
        headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
        body: rpc('initialize', 1),
        query: {},
      },
      {},
    );
    const sessionId = first.headers['mcp-session-id'];

    const second = await handleHttpRpc(
      {
        method: 'POST',
        url: '/mcp',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          'mcp-session-id': sessionId,
        },
        body: rpc('tools/list', 2),
        query: {},
      },
      {},
    );

    expect(second.headers['mcp-session-id']).toBe(sessionId);
    const parsedSecond = parseRpcResponseBody(second.body);
    const tools = (parsedSecond as { result?: { tools?: unknown[] } }).result?.tools;
    expect(Array.isArray(tools)).toBe(true);
    expect((tools as unknown[]).length).toBe(2);
  });

  it('returns 202 on notifications with no body', async () => {
    const response = await handleHttpRpc(
      {
        method: 'POST',
        url: '/mcp',
        headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
        body: { jsonrpc: '2.0', method: 'notifications/initialized', params: {} },
        query: {},
      },
      {},
    );

    expect(response.status).toBe(202);
    expect(response.body).toBeNull();
    expect(typeof response.headers['mcp-session-id']).toBe('string');
  });

  it('returns text/event-stream envelope when the client prefers it', async () => {
    const response = await handleHttpRpc(
      {
        method: 'POST',
        url: '/mcp',
        headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
        body: rpc('initialize', 1),
        query: {},
      },
      {},
    );

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('text/event-stream');
    expect(typeof response.body).toBe('string');
    expect(response.body).toMatch(/^event: message\r\ndata: /);
    expect(response.body).toMatch(/\r\n\r\n$/);
    const lines = (response.body as string).split('\r\n');
    const dataLine = lines.find((line) => line.startsWith('data: ')) ?? '';
    const parsed = JSON.parse(dataLine.slice('data: '.length));
    expect(parsed.result.protocolVersion).toBe('2024-11-05');
  });

  it('rejects non-json content-types with 415', async () => {
    const response = await handleHttpRpc(
      {
        method: 'POST',
        url: '/mcp',
        headers: { 'content-type': 'text/plain', accept: 'application/json' },
        body: 'oops',
        query: {},
      } as unknown as HttpTransportRequest,
      {},
    );

    expect(response.status).toBe(415);
  });

  it('denies unauthenticated requests when a token is configured', async () => {
    const response = await handleHttpRpc(
      {
        method: 'POST',
        url: '/mcp',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: rpc('initialize', 1),
        query: {},
      },
      { requiredToken: 'secret' },
    );

    expect(response.status).toBe(401);
  });

  it('accepts requests with the matching bearer token', async () => {
    const response = await handleHttpRpc(
      {
        method: 'POST',
        url: '/mcp',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          authorization: 'Bearer secret',
        },
        body: rpc('initialize', 1),
        query: {},
      },
      { requiredToken: 'secret' },
    );

    expect(response.status).toBe(200);
  });
});

describe('mcp_http legacy SSE transport', () => {
  it('builds an initial SSE response with the endpoint event', () => {
    const response = buildSseResponse({
      origin: 'http://127.0.0.1:7007',
      sessionId: 'abc',
      endpointPath: '/messages',
    });

    expect(response.headers['content-type']).toBe('text/event-stream');
    expect(response.headers['cache-control']).toContain('no-cache');
    expect(response.headers.connection).toBe('keep-alive');
    expect(response.body).toContain('event: endpoint');
    expect(response.body).toContain('data: http://127.0.0.1:7007/messages?sessionId=abc');
    expect(response.body.endsWith('\r\n\r\n')).toBe(true);
  });
});
