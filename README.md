# Pytha Runtime

A Lua 5.3 runtime that executes Lua code via Fengari (Lua VM in JavaScript) and renders 3D geometry via Three.js.

## Architecture

```
Lua Code
    │
    ▼
Fengari Lua VM
    │ (pytha.*, pyui.*, pyio.*, pyux.*, pygeo.*)
    ▼
JavaScript / Three.js / HTML
```

## How It Works

1. **Fengari** - Pure Lua 5.3 VM compiled to WebAssembly. Executes Lua bytecode natively.

2. **Platform Hooks** - When Lua calls `pytha.create_block()` or `pyui.run_modal_dialog()`, Fengari invokes JavaScript wrappers that call Three.js or manipulate the DOM.

3. **Dialog Callbacks** - Lua closures are wrapped via `fengari-interop.tojs()`. When DOM events fire (input, click), the wrapped closure is called, resuming Lua execution with its upvalues intact.

4. **Three.js Rendering** - Geometry operations create Three.js meshes which render in the browser.

## Usage

```javascript
const runtime = new PythaRuntime({
  container: document.getElementById('canvas')
});

await runtime.executeLua(`
  local block = pytha.create_block(10, 20, 30)

  pyui.run_modal_dialog(function(dialog, data)
      local input = dialog:create_text_box({10, 10}, "100")
      input:set_on_change_handler(function(value)
          pytha.set_element_pen(block, tonumber(value))
      end)
  end, {})
`);
```


