# Feature: Add streamable_http / sse / polling_http transports to the Pytha MCP server

Branch: `feature/mcp-streamable-http`
Goal: so users can configure Pytha's MCP server as an HTTP endpoint
inside Arachne's MCP settings page (`transport = streamable_http | sse |
polling_http`, with `url` + `headers`) — in addition to the existing
stdio entry.

Background
- `runtime/mcp.ts` already implements MCP `2024-11-05` over newline-delimited
  JSON-RPC on stdin/stdout with two tools: `pytha_run_lua`, `pytha_watch_lua`.
- Arachne's HTTP client lives in `agents/src/mcp/mod.rs` (Rust). The
  client expected wire contract (copied from that file):

  Streamable HTTP:
    POST <url>
    Content-Type: application/json
    Accept: application/json, text/event-stream
    { jsonrpc: "2.0", id, method, params }
    -> 2xx with body (application/json or text/event-stream JSON data)
    -> 202/204 with no body
    -> response header "mcp-session-id" is preserved on the caller side
       and replayed as the same header on subsequent requests.

  Polling HTTP:
    Same as above but Accept is just application/json and the client
    expects a JSON body.

  Legacy SSE:
    GET <url>
    Accept: text/event-stream
    -> first event is "event: endpoint\r\ndata: <path>"
      resolve <path> against <url>, then POST JSON-RPC there and parse
      the JSON-RPC result out of the live SSE stream.

Arachne's McpServerConfig shape:
    { enabled, transport, command, args, env, cwd, url, headers }

## Plan

### 1. New HTTP transport module (`runtime/mcp_http.ts`)

- Export `startMcpHttpServer(options?: { port?, host?, path? })` returning
  an `http.Server` (`http.createServer`) plus a teardown function.
- Bootstraps:
    - a `Map<string /* sessionId */, McpSession>`; each session holds
      its own JSON-RPC handler bound to that session id, an EventEmitter
      for outbound notifications, and the underlying pytha WS connection
      state (if any).
    - JSON-RPC handlers (split from `mcp.ts` so both transports share
      them):
        - `initialize(params) -> { protocolVersion, capabilities, serverInfo }`
          and assigns a new `mcp-session-id` on first response.
        - `notifications/initialized` -> noop.
        - `tools/list` -> reuse the same `tools` array.
        - `tools/call(name=...)` -> delegate to the existing
          `runPythaLua` / `watchPythaLua` logic in `mcp.ts` (refactor
          those into reusable helpers in `runtime/mcp_core.ts`).
        - `ping` -> {}.

### 2. Refactor `runtime/mcp.ts`

- Keep the stdin/stdout entry point (don't break existing arachne
  stdio users that already call `npm run mcp`).
- Extract the tool definitions and per-method handlers into
  `runtime/mcp_core.ts`. Both transports import from there.

### 3. Streamable HTTP handler (`POST /mcp`, single endpoint)

- Reads:
    - `Content-Type` must be `application/json`. 415 otherwise.
    - `mcp-session-id` is optional. If absent, a new id is generated;
      must be returned in the response header.
    - `accept` must include `application/json` and/or `text/event-stream`.
      Defaults: treat as streamable if either is present.
- Behavior:
    - Body is either one JSON-RPC message OR a JSON array (batch).
      Implement both.
    - Notifications (no `id`) return 202 Accepted, no body, but still
      remember the session.
    - For requests with `id`:
        - default response: 200 OK, `content-type: application/json`,
          body = `JSON.stringify(message)`.
        - per-request override: if `accept: text/event-stream` is
          present and this is a request (not a notification), respond
          with `text/event-stream` containing a single event whose
          `data:` is the JSON-RPC response. We will always do this
          when the request includes `accept: text/event-stream` because
          Arachne's streamable_http client will accept either.
    - Forwarded headers: `McpServerConfig.headers` from arachne side
      come as arbitrary key/value; we only honor `Authorization` if
      it matches a `PYTHA_HTTP_TOKEN` env var (logged + configurable).
      This avoids accidentally trusting `host`-header injection.
- Returned on every response (whether 200, 202, 415):
    - `mcp-session-id: <assigned>` (uuid v4).
    - `Access-Control-Allow-Origin: *` so the MCP inspector / web tools
      can poke at it.

### 4. Legacy SSE handler

- GET on the same `/mcp` path:
    - respond 200 `text/event-stream`, then emit an
      `event: endpoint\r\ndata: <absolute origin + /mcp/messages?sessionId=...>\r\n\r\n`
      (we use the same host as the request).
    - keep the connection open.
- POST on `<same origin>/mcp/messages?sessionId=<id>`:
    - validate `Content-Type: application/json`, parse body, route to
      session, stream JSON-RPC responses back to that session's open
      SSE connection as `data:` events.

### 5. CLI wiring (`package.json`)

- Add a new script:
    `mcp:http` -> `tsx runtime/mcp_http.ts`
    with optional env: `PYTHA_HTTP_PORT` (default 7007), `PYTHA_HTTP_HOST`
    (default 127.0.0.1), `PYTHA_HTTP_TOKEN` (optional), `PYTHA_HTTP_PATH`
    (default `/mcp`).

### 6. Tests (`vitest`)

- `tests/mcp_http.spec.ts`
    - Initialize twice with two distinct sessions and verify the
      session-id header round-trips.
    - POST notifications return 202 with no body.
    - POST `tools/list` returns the two tools.
    - POST `tools/call` to `pytha_run_lua` returns an `isError=false`
      result and a `text`-shaped summary.
    - GET with legacy SSE opens a stream; an `event: endpoint` is
      delivered followed by an `event: message` after posting a
      request to the messages endpoint.
    - Unauthorized auth: with `PYTHA_HTTP_TOKEN=secret` and missing
      `Authorization`, the response is 401; with matching token, 200.

### 7. Documentation (`README.md`)

- Add an "Arachne HTTP/SSE integration" section showing the equivalent
  MCP settings:
  ```json
  {
    "pytha_http": {
      "enabled": true,
      "transport": "streamable_http",
      "url": "http://127.0.0.1:7007/mcp",
      "headers": { "Authorization": "Bearer secret" }
    }
  }
  ```

### 8. Open questions (will resolve while implementing)

- Do we need a separate HTTP server process model, or can we reuse the
  existing `runtime/index.ts` boots? **Decision: separate** (`mcp_http.ts`).
  Same package, different command. Keeps blast radius small and avoids
  dragging the WebSocket runtime into a scenario where it isn't needed.
- Should `mcp:http` listen on 127.0.0.1 only, or 0.0.0.0? **Default
  127.0.0.1**, opt-in via env var to bind to all interfaces. Safer for
  casual use.
