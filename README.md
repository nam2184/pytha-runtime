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
