# Pytha Runtime

A browser-to-runtime Lua environment that executes Lua code via Fengari (Lua VM in JavaScript) and renders 3D geometry via Three.js.

## Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                          Client (Browser)                          │
│                                                                    │
│   ┌──────────────┐     ┌──────────────┐     ┌──────────────────┐   │
│   │  Lua Editor  │────►│  WS Client   │────►│  Three.js        │   │
│   │  (textarea)  │     │              │◄────│  Renderer        │   │
│   └──────────────┘     └──────────────┘     └──────────────────┘   │
│                              ▲                                     │
│                              │    Messages                         │
│                              │  (render,                           │
│                              │   ui_create,                        │
│                              │   ui_event, etc)                    │
│                              │                                     │
└──────────────────────────────┼─────────────────────────────────────┘
                               │                    
                    WebSocket  │                     
                    (ws://...) │                     
                               │                      
                               ▼                    
┌──────────────────────────────┼─────────────────────────────────────┐
│                         Runtime (Node.js)                          │
│                              │                                     │
│   ┌──────────────────────────┴───────────────────────────────────┐ │
│   │                    Fengari Lua VM                            │ │
│   │                                                              │ │
│   │   ┌─────────────────────────────────────────────────────────┐│ │
│   │   │  JS Closures (pytha.*, pyui.*, pyio.*, pygeo.*)         ││ │
│   │   │       │                    │                    │       ││ │ 
│   │   │       ▼                    ▼                    ▼       ││ │ 
│   │   │  emitRender()         emitUICreate()      emitLog()     ││ │
│   │   └─────────────────────────────────────────────────────────┘│ │
│   └──────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────┘
```

**Message Flow:**

1. Client sends Lua code via WebSocket
2. Runtime passes code to Fengari Lua VM
3. Lua VM executes, calling JS closures (pytha.*, pyui.*, etc.)
4. JS closures send messages back to Runtime
5. Runtime broadcasts messages to Client
6. Three.js renders geometry / HTML UI shows dialogs

## Running

```bash
npm install
npm run dev:runtime # Start WebSocket runtime on port 8080
npm run dev:client   # Start Vite dev server on port 3000
```

Open `http://localhost:3000` to use the editor.

## Pytha Lua API

For full API documentation, see [Pytha Lua API Wiki](https://github.com/pytha-3d-cad/pytha-lua-api/wiki).

### Geometry Creation

```lua
local block = pytha.create_block(80, 60, 40, {0, 0, 0})
pytha.set_element_name(block, "Block A")

local cyl = pytha.create_cylinder(100, 30, {200, 0, 0})
pytha.set_element_name(cyl, "Cylinder A")

local sphere = pytha.create_sphere(40, {300, 0, 0})
pytha.set_element_name(sphere, "Sphere A")

local polygon = pytha.create_polygon({{0, 0}, {100, 0}, {100, 80}, {50, 120}, {0, 80}}, {400, 0, 0})
```

![Geometry Example](resources/images/geo.png)

### UI Creation

```lua
local function init_dialog(dialog, data)
    dialog.set_window_title("My Dialog")

    local label = dialog.create_label({10, 10}, "Enter dimensions:")

    local text_box = dialog.create_text_box({10, 40}, tostring(data.value or 100))

    local ok_btn = dialog.create_ok_button({10, 80})
    ok_btn.set_on_click_handler(function()
        local val = tonumber(text_box.get_value()) or 0
        pytha.create_block(val, val, val, {0, 0, 0})
    end)

    local cancel_btn = dialog.create_cancel_button({100, 80})
end

pytha.create_block(100, 100, 100, {0, 0, 0})
pyui.run_modal_dialog(init_dialog, {value = 150})
```

![UI Example](resources/images/ui.png)

## MCP integration (for Arachne, Cursor, Claude Desktop, …)

The Pytha runtime ships two MCP entry points so different clients can
wire it up whichever way they prefer.

| Command                | Transport                           | Use case                                  |
|------------------------|-------------------------------------|-------------------------------------------|
| `npm run mcp`          | stdio (newline-delimited JSON-RPC)  | Arachne / Cursor / Claude Desktop as a command |
| `npm run mcp:http`     | streamable_http + legacy SSE        | Anything that wants a URL endpoint        |

### `npm run mcp:http`

Starts an HTTP MCP server on `http://127.0.0.1:7007/mcp`. Env vars:

| Variable             | Default        | Meaning                                    |
|----------------------|----------------|--------------------------------------------|
| `PYTHA_HTTP_HOST`    | `127.0.0.1`    | Bind address                               |
| `PYTHA_HTTP_PORT`    | `7007`         | Bind port                                  |
| `PYTHA_HTTP_PATH`    | `/mcp`         | Base path                                  |
| `PYTHA_HTTP_TOKEN`   | unset          | If set, requires `Authorization: Bearer …` |

It speaks all three Arachne transports:

- `streamable_http` — `POST /mcp` with `mcp-session-id` round-trip.
- `polling_http` — same `POST /mcp`, plain `application/json` response.
- legacy `sse` — `GET /mcp` opens the stream and emits `event: endpoint`
  with the POST URL; follow-up `POST /mcp/messages?sessionId=…` returns
  results via the open stream.

#### Configuring it inside Arachne

In Arachne's MCP settings (`transport = streamable_http`):

```jsonc
{
  "pytha": {
    "enabled": true,
    "transport": "streamable_http",
    "url": "http://127.0.0.1:7007/mcp",
    "headers": { "Authorization": "Bearer <PYTHA_HTTP_TOKEN>" } // optional
  }
}
```

Arachne will auto-discover nine tools:

- `pytha_run_lua` — execute a single Lua chunk or in-memory file set.
- `pytha_watch_lua` — watch a set of `.lua` paths and re-run on changes.
- `pytha_run_project` — accept a base64-encoded zip + optional entry
  point, stage to a temp directory, run `main.lua` against the runtime,
  and return the feedback. Subsequent calls with the same payload
  reuse the staged directory; pass `reload: true` to wipe and
  re-extract before running.
- `pytha_run_project_paths` — same lifecycle, but the caller supplies
  a list of workspace paths (files or directories) under a
  `workspace_root`. The cache key is the SHA-256 of the sorted path
  set plus each file's content hash, so an edit invalidates the cache.
- `pytha_load_project` / `pytha_load_project_paths` — same staging
  lifecycle without execution.
- `pytha_reload_project` / `pytha_unload_project` / `pytha_clear_all_projects`
  — manage the staged directories.

#### `pytha_run_project_paths` payload shape

Use this when the agent has filesystem access to the project on the
same host as pytha-runtime. There's no zip round-trip — just paths.

```http
POST /mcp HTTP/1.1
Content-Type: application/json
Accept: application/json
mcp-session-id: <from initialize>

{"jsonrpc":"2.0","id":4,"method":"tools/call",
 "params":{"name":"pytha_run_project_paths",
          "arguments":{"workspace_root":"/abs/path/to/project",
                       "project_paths":["src/main.lua","src/lib"]}}}
```

- All `project_paths` must resolve inside `workspace_root`. Anything
  outside the root returns `Path escapes workspace root: …`.
- Files are mirrored into `<tmpdir>/pytha-mcp/<sha256>/` preserving the
  workspace-relative layout; directories are walked recursively.
- Entry point autodetection: explicit `entry` wins, then `main.lua` /
  `init.lua` / `index.lua` / `run.lua` at the staging root, then the
  basename of the first file path supplied.
- Re-running with the same payload reuses the staged dir (no re-copy).
  Editing any source file invalidates the cache because the hash mixes
  in per-file content hashes.

#### `pytha_run_project` payload shape

The base64 zip contains a Pytha Lua project (any structure; `main.lua`
at the root is the conventional entry point). The MCP server streams the
zip via `yauzl` and writes entries to:

```
<os.tmpdir()>/pytha-mcp/<sha256-hex-of-zip>/
```

The SHA-256 hex is also returned as `project_id`, so subsequent calls
can either omit it (auto-hashed from the new zip) or pass it explicitly
to address a specific staging directory.

Example invocation over `streamable_http`:

```http
POST /mcp HTTP/1.1
Content-Type: application/json
Accept: application/json
mcp-session-id: 2f349da4-…

{"jsonrpc":"2.0","id":3,"method":"tools/call",
 "params":{"name":"pytha_run_project",
          "arguments":{"project_zip_b64":"UEsDBBQAAAAI…",
                       "entry":"main.lua"}}}
```

The server returns:

```json
{
  "jsonrpc":"2.0","id":3,
  "result":{
    "content":[{
      "type":"text",
      "text":"Project staging: f74a21468c… (extracted)\n
             Entry point: main.lua\n
             \n
             Pytha runtime status: success\n
             Logs:\n[pytha] pytha-loaded-via-mcp\n
             Raw feedback:\n[…]"}],
    "isError":false}
}
```

Cleanup is automatic. `pytha_unload_project` (or the catch-all
`pytha_clear_all_projects`) wipes the staging directory; the server
also wipes everything on `SIGINT`/`SIGTERM`.

### `npm run mcp`

Same two tools, but the runtime reads newline-delimited JSON-RPC from
its stdin. Use this from MCP hosts that spawn their own child processes
(such as Arachne's stdio transport or Claude Desktop):

```jsonc
{
  "pytha": {
    "enabled": true,
    "transport": "stdio",
    "command": "node.exe",
    "args": ["--import", "tsx", "runtime/mcp.ts"],
    "cwd": "C:/path/to/pytha-runtime"
  }
}
```

