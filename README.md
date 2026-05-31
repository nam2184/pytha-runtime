# Pytha Runtime

A client-server Lua runtime that executes Lua code via Fengari (Lua VM in JavaScript) and renders 3D geometry via Three.js.

## Architecture

```
Client (Browser)                    Server (Node.js)
     │                                    │
     │◄──── WebSocket (ws://localhost:8080) ────►│
     │                                    │
     │   Lua Code ─────────────────────────┘
     │       │
     ▼       ▼
Three.js                        Fengari Lua VM
 Rendering                           │
     │                                │
     │◄──── Messages (render, ui_create, ui_event) ────►│
     │                                    │
     ▼                                    ▼
HTML UI                             Pytha API
(pytha.*, pyui.*, pyio.*, pygeo.*)
```

## Quick Start

```bash
npm install
npm run dev
```

This starts:
- **Server**: `tsx watch server/index.ts` on port 8080
- **Client**: `vite` on port 3000

Open `http://localhost:3000` to use the editor.

## Lua API

**pytha.*** - Geometry:
```lua
pytha.create_block(length, width, height, origin?, options?)
pytha.create_cylinder(height, radius, origin?, options?)
pytha.create_sphere(radius, origin?, options?)
pytha.create_polygon(points)
pytha.create_polyline(closed, points)
pytha.create_group(elements, options?)
pytha.delete_element(element)
pytha.move_element(element, offset)
pytha.set_element_name(element, name)
pytha.set_element_pen(element, penIndex)
```

**pyui.*** - UI:
```lua
pyui.alert(message)
pyui.wait(milliseconds)
pyui.format_length(value)
pyui.parse_length(text)
pyui.run_modal_dialog(function(dialog, data)
    local input = dialog:create_text_box({10, 10}, "default")
    input:set_on_change_handler(function(value)
        print("Changed to: " .. value)
    end)
end, {})
```

**pyio.*** - I/O:
```lua
pyio.parse_json(text)
pyio.parse_csv(text)
pyio.parse_lines(text)
```

**pygeo.*** - Geometry utilities:
```lua
pygeo.clean_polygon_2d(points)
```

## Example

```lua
function main()
    local size = 100

    local block = pytha.create_block(size, size, size, {0, 0, 0})
    pytha.set_element_name(block, "Test Block")
    pytha.set_element_pen(block, 2)

    local cyl = pytha.create_cylinder(150, 50, {0, 100, 0})
    pytha.set_element_pen(cyl, 3)

    pyui.alert("Created block and cylinder!")
end
```