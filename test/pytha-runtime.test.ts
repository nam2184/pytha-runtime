import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { PythaRuntimeClient } from '../src/index';
import type { ElementHandle, GroupHandle } from '../src/types/element';

describe('PythaRuntime', () => {
  let container: HTMLElement;
  let client: PythaRuntimeClient;
  let createdElements: ElementHandle[] = [];
  let dialogState: { opened: boolean; data: unknown } = { opened: false, data: null };
  let logs: string[] = [];
  let errors: Error[] = [];

  beforeEach(() => {
    container = document.createElement('div');
    container.id = 'test-container';
    document.body.appendChild(container);

    logs = [];
    errors = [];
    createdElements = [];
    dialogState = { opened: false, data: null };

    client = new PythaRuntimeClient({
      container,
      onLog: (msg) => logs.push(msg),
      onError: (err) => errors.push(err),
      onDialogCreate: (data) => {
        dialogState.opened = true;
        dialogState.data = data;
      },
    });
  });

  afterEach(() => {
    client.dispose();
    document.body.removeChild(container);
  });

  describe('Basic Lua Execution', () => {
    it('executes simple Lua code', async () => {
      await client.executeLua('x = 5 + 3');
      expect(errors).toHaveLength(0);
    });

    it('handles arithmetic operations', async () => {
      await client.executeLua(`
        local a = 10
        local b = 20
        local c = a + b
      `);
      expect(errors).toHaveLength(0);
    });

    it('handles string operations', async () => {
      await client.executeLua(`
        local name = "pytha"
        local greeting = "hello " .. name
      `);
      expect(errors).toHaveLength(0);
    });

    it('handles table operations', async () => {
      await client.executeLua(`
        local t = {a = 1, b = 2, c = 3}
        local x = t.a
      `);
      expect(errors).toHaveLength(0);
    });

    it('handles control flow (if/then/else)', async () => {
      await client.executeLua(`
        local x = 10
        if x > 5 then
          local result = "big"
        else
          local result = "small"
        end
      `);
      expect(errors).toHaveLength(0);
    });

    it('handles while loops', async () => {
      await client.executeLua(`
        local i = 0
        while i < 5 do
          i = i + 1
        end
      `);
      expect(errors).toHaveLength(0);
    });

    it('handles for loops', async () => {
      await client.executeLua(`
        local sum = 0
        for i = 1, 10 do
          sum = sum + i
        end
      `);
      expect(errors).toHaveLength(0);
    });

    it('handles repeat/until loops', async () => {
      await client.executeLua(`
        local i = 0
        repeat
          i = i + 1
        until i >= 5
      `);
      expect(errors).toHaveLength(0);
    });

    it('handles function definitions', async () => {
      await client.executeLua(`
        function add(a, b)
          return a + b
        end
        local result = add(3, 4)
      `);
      expect(errors).toHaveLength(0);
    });

    it('handles closures', async () => {
      await client.executeLua(`
        function make_adder(n)
          return function(x)
            return x + n
          end
        end
        local add5 = make_adder(5)
        local result = add5(10)
      `);
      expect(errors).toHaveLength(0);
    });

    it('handles multiple return values', async () => {
      await client.executeLua(`
        function coords()
          return 1, 2, 3
        end
        local x, y, z = coords()
      `);
      expect(errors).toHaveLength(0);
    });

    it('handles variadic functions', async () => {
      await client.executeLua(`
        function sum(...)
          local s = 0
          for _, v in ipairs({...}) do
            s = s + v
          end
          return s
        end
        local result = sum(1, 2, 3, 4, 5)
      `);
      expect(errors).toHaveLength(0);
    });

    it('handles metatables', async () => {
      await client.executeLua(`
        local t = {}
        local mt = {__add = function(a, b) return a.x + b.x end}
        setmetatable(t, mt)
      `);
      expect(errors).toHaveLength(0);
    });

    it('handles coroutines', async () => {
      await client.executeLua(`
        local co = coroutine.create(function()
          local x = 0
          for i = 1, 3 do
            x = x + i
            coroutine.yield(x)
          end
          return x
        end)

        local _, v1 = coroutine.resume(co)
        local _, v2 = coroutine.resume(co)
      `);
      expect(errors).toHaveLength(0);
    });
  });

  describe('pytha.* API', () => {
    it('creates a block with pytha.create_block', async () => {
      await client.executeLua(`
        local block = pytha.create_block(100, 200, 150, {0, 0, 0})
      `);
      expect(errors).toHaveLength(0);
    });

    it('creates a block with options (u_axis, v_axis)', async () => {
      await client.executeLua(`
        local opts = {
          u_axis = {1, 0, 0},
          v_axis = {0, 1, 0},
          name = "TestBlock"
        }
        local block = pytha.create_block(100, 100, 100, {0, 0, 0}, opts)
      `);
      expect(errors).toHaveLength(0);
    });

    it('creates a cylinder with pytha.create_cylinder', async () => {
      await client.executeLua(`
        local cyl = pytha.create_cylinder(100, 50, {0, 0, 0})
      `);
      expect(errors).toHaveLength(0);
    });

    it('creates a cylinder with segments option', async () => {
      await client.executeLua(`
        local opts = {segments = 16}
        local cyl = pytha.create_cylinder(100, 50, {0, 0, 0}, opts)
      `);
      expect(errors).toHaveLength(0);
    });

    it('creates a sphere with pytha.create_sphere', async () => {
      await client.executeLua(`
        local sphere = pytha.create_sphere(50, {0, 0, 0})
      `);
      expect(errors).toHaveLength(0);
    });

    it('creates a polygon with pytha.create_polygon', async () => {
      await client.executeLua(`
        local points = {{0, 0, 0}, {100, 0, 0}, {100, 100, 0}, {0, 100, 0}}
        local poly = pytha.create_polygon(points)
      `);
      expect(errors).toHaveLength(0);
    });

    it('creates a polyline (open) with pytha.create_polyline', async () => {
      await client.executeLua(`
        local points = {{0, 0, 0}, {100, 0, 0}, {100, 100, 0}}
        local line = pytha.create_polyline("open", points)
      `);
      expect(errors).toHaveLength(0);
    });

    it('creates a polyline (closed) with pytha.create_polyline', async () => {
      await client.executeLua(`
        local points = {{0, 0, 0}, {100, 0, 0}, {100, 100, 0}, {0, 100, 0}}
        local line = pytha.create_polyline("closed", points)
      `);
      expect(errors).toHaveLength(0);
    });

    it('deletes elements with pytha.delete_element', async () => {
      await client.executeLua(`
        local block = pytha.create_block(100, 100, 100, {0, 0, 0})
        pytha.delete_element(block)
      `);
      expect(errors).toHaveLength(0);
    });

    it('copies elements with pytha.copy_element', async () => {
      await client.executeLua(`
        local block = pytha.create_block(100, 100, 100, {0, 0, 0})
        local copy = pytha.copy_element(block, {100, 0, 0})
      `);
      expect(errors).toHaveLength(0);
    });

    it('moves elements with pytha.move_element', async () => {
      await client.executeLua(`
        local block = pytha.create_block(100, 100, 100, {0, 0, 0})
        pytha.move_element(block, {50, 50, 0})
      `);
      expect(errors).toHaveLength(0);
    });

    it('rotates elements with pytha.rotate_element', async () => {
      await client.executeLua(`
        local block = pytha.create_block(100, 100, 100, {50, 50, 50})
        pytha.rotate_element(block, {50, 50, 50}, 'z', 45)
      `);
      expect(errors).toHaveLength(0);
    });

    it('rotates elements around different axes', async () => {
      await client.executeLua(`
        local block = pytha.create_block(100, 100, 100, {50, 50, 50})
        pytha.rotate_element(block, {50, 50, 50}, 'x', 90)
        pytha.rotate_element(block, {50, 50, 50}, 'y', 45)
      `);
      expect(errors).toHaveLength(0);
    });

    it('sets element name with pytha.set_element_name', async () => {
      await client.executeLua(`
        local block = pytha.create_block(100, 100, 100, {0, 0, 0})
        pytha.set_element_name(block, "MyCube")
      `);
      expect(errors).toHaveLength(0);
    });

    it('sets element pen with pytha.set_element_pen', async () => {
      await client.executeLua(`
        local block = pytha.create_block(100, 100, 100, {0, 0, 0})
        pytha.set_element_pen(block, 3)
      `);
      expect(errors).toHaveLength(0);
    });

    it('creates groups with pytha.create_group', async () => {
      await client.executeLua(`
        local block1 = pytha.create_block(100, 100, 100, {0, 0, 0})
        local block2 = pytha.create_block(50, 50, 50, {150, 0, 0})
        local group = pytha.create_group({block1, block2}, {name = "MyGroup"})
      `);
      expect(errors).toHaveLength(0);
    });

    it('stores and retrieves element history', async () => {
      await client.executeLua(`
        local block = pytha.create_block(100, 100, 100, {0, 0, 0})
        pytha.set_element_history(block, {size = 100}, "cube_data")
        local data = pytha.get_element_history(block, "cube_data")
      `);
      expect(errors).toHaveLength(0);
    });

    it('unions elements with pytha.boole_part_union', async () => {
      await client.executeLua(`
        local block1 = pytha.create_block(100, 100, 100, {0, 0, 0})
        local block2 = pytha.create_block(50, 50, 50, {75, 0, 0})
        local union = pytha.boole_part_union({block1, block2})
      `);
      expect(errors).toHaveLength(0);
    });

    it('gets group descendants', async () => {
      await client.executeLua(`
        local block1 = pytha.create_block(100, 100, 100, {0, 0, 0})
        local block2 = pytha.create_block(50, 50, 50, {150, 0, 0})
        local group = pytha.create_group({block1, block2})
        local children = pytha.get_group_descendants(group)
      `);
      expect(errors).toHaveLength(0);
    });

    it('gets length unit', async () => {
      await client.executeLua(`
        local unit = pytha.get_length_unit()
      `);
      expect(errors).toHaveLength(0);
    });
  });

  describe('pyui.* API', () => {
    it('calls pyui.alert', async () => {
      await client.executeLua(`
        pyui.alert("Hello from Pytha!")
      `);
      expect(errors).toHaveLength(0);
      expect(logs.some(l => l.includes('Hello from Pytha!'))).toBe(true);
    });

    it('calls pyui.wait (async)', async () => {
      await client.executeLua(`
        pyui.wait(10)
      `);
      expect(errors).toHaveLength(0);
    });

    it('formats lengths with pyui.format_length', async () => {
      await client.executeLua(`
        local formatted = pyui.format_length(100)
      `);
      expect(errors).toHaveLength(0);
    });

    it('parses lengths with pyui.parse_length', async () => {
      await client.executeLua(`
        local value = pyui.parse_length("100.5 mm")
      `);
      expect(errors).toHaveLength(0);
    });

    it('formats numbers with pyui.format_number', async () => {
      await client.executeLua(`
        local formatted = pyui.format_number(3.14159)
      `);
      expect(errors).toHaveLength(0);
    });

    it('parses numbers with pyui.parse_number', async () => {
      await client.executeLua(`
        local value = pyui.parse_number("42.5")
      `);
      expect(errors).toHaveLength(0);
    });
  });

  describe('pyio.* API', () => {
    it('saves and loads values', async () => {
      await client.executeLua(`
        pyio.save_values("test_key", {value = 123})
        local loaded = pyio.load_values("test_key")
      `);
      expect(errors).toHaveLength(0);
    });

    it('parses JSON', async () => {
      await client.executeLua(`
        local data = pyio.parse_json('{"name": "test", "count": 42}')
      `);
      expect(errors).toHaveLength(0);
    });

    it('parses CSV', async () => {
      await client.executeLua(`
        local rows = pyio.parse_csv("a,b,c\\n1,2,3\\n4,5,6")
      `);
      expect(errors).toHaveLength(0);
    });

    it('parses lines', async () => {
      await client.executeLua(`
        local lines = pyio.parse_lines("line1\\nline2\\nline3")
      `);
      expect(errors).toHaveLength(0);
    });
  });

  describe('pygeo.* API', () => {
    it('cleans polygon 2D', async () => {
      await client.executeLua(`
        local points = {{0, 0}, {100, 0}, {100, 100}, {0, 100}}
        local cleaned = pygeo.clean_polygon_2d(points)
      `);
      expect(errors).toHaveLength(0);
    });
  });

  describe('math extensions', () => {
    it('uses SIN function', async () => {
      await client.executeLua(`
        local s = SIN(45)
      `);
      expect(errors).toHaveLength(0);
    });

    it('uses COS function', async () => {
      await client.executeLua(`
        local c = COS(45)
      `);
      expect(errors).toHaveLength(0);
    });

    it('uses TAN function', async () => {
      await client.executeLua(`
        local t = TAN(45)
      `);
      expect(errors).toHaveLength(0);
    });

    it('uses ATAN function', async () => {
      await client.executeLua(`
        local a = ATAN(1)
      `);
      expect(errors).toHaveLength(0);
    });

    it('uses ATAN2 function', async () => {
      await client.executeLua(`
        local a = ATAN2(1, 1)
      `);
      expect(errors).toHaveLength(0);
    });

    it('uses SQRT function', async () => {
      await client.executeLua(`
        local s = SQRT(144)
      `);
      expect(errors).toHaveLength(0);
    });

    it('uses ABS function', async () => {
      await client.executeLua(`
        local a = ABS(-42)
      `);
      expect(errors).toHaveLength(0);
    });

    it('uses FLOOR function', async () => {
      await client.executeLua(`
        local f = FLOOR(3.7)
      `);
      expect(errors).toHaveLength(0);
    });

    it('uses CEIL function', async () => {
      await client.executeLua(`
        local c = CEIL(3.2)
      `);
      expect(errors).toHaveLength(0);
    });

    it('uses RAD function', async () => {
      await client.executeLua(`
        local r = RAD(180)
      `);
      expect(errors).toHaveLength(0);
    });

    it('uses DEG function', async () => {
      await client.executeLua(`
        local d = DEG(math.pi)
      `);
      expect(errors).toHaveLength(0);
    });
  });

  describe('pyloc', () => {
    it('handles pyloc string prefix', async () => {
      await client.executeLua(`
        local text = pyloc "Hello World"
      `);
      expect(errors).toHaveLength(0);
    });
  });

  describe('Lua 5.3 specific features', () => {
    it('handles integer division (//)', async () => {
      await client.executeLua(`
        local x = 10 // 3
      `);
      expect(errors).toHaveLength(0);
    });

    it('handles bitwise operators', async () => {
      await client.executeLua(`
        local x = 5 & 3
        local y = 5 | 3
        local z = 5 ~ 3
        local w = 5 << 2
        local v = 32 >> 2
      `);
      expect(errors).toHaveLength(0);
    });

    it('handles hex and binary literals', async () => {
      await client.executeLua(`
        local x = 0xFF
        local y = 0b1010
      `);
      expect(errors).toHaveLength(0);
    });

    it('handles unicode escape in strings', async () => {
      await client.executeLua(`
        local s = "hello\\u{3bb}"
      `);
      expect(errors).toHaveLength(0);
    });

    it('handles implicit and explicit table key iteration', async () => {
      await client.executeLua(`
        local t = {a = 1, b = 2}
        for k, v in pairs(t) do
          local x = k .. v
        end
      `);
      expect(errors).toHaveLength(0);
    });
  });

  describe('Integration tests', () => {
    it('creates multiple elements in a loop', async () => {
      await client.executeLua(`
        for i = 1, 5 do
          local block = pytha.create_block(20, 20, 20, {i * 30, 0, 0})
        end
      `);
      expect(errors).toHaveLength(0);
    });

    it('creates a parametric block', async () => {
      await client.executeLua(`
        local function create_param_block(size, name)
          local block = pytha.create_block(size, size, size, {0, 0, 0})
          pytha.set_element_name(block, name)
          return block
        end

        local b1 = create_param_block(100, "SmallCube")
        local b2 = create_param_block(200, "BigCube")
      `);
      expect(errors).toHaveLength(0);
    });

    it('handles nested function calls', async () => {
      await client.executeLua(`
        local function transform(elements, offset, angle)
          for _, elem in ipairs(elements) do
            pytha.move_element(elem, offset)
            pytha.rotate_element(elem, {0, 0, 0}, 'z', angle)
          end
        end

        local block = pytha.create_block(100, 100, 100, {0, 0, 0})
        transform({block}, {50, 50, 0}, 45)
      `);
      expect(errors).toHaveLength(0);
    });

    it('creates a spiral pattern', async () => {
      await client.executeLua(`
        local function spiral(num_points, radius, height)
          for i = 1, num_points do
            local angle = i * 30
            local x = radius * COS(angle)
            local y = radius * SIN(angle)
            local z = height * i
            local cyl = pytha.create_cylinder(10, 5, {x, y, z})
          end
        end

        spiral(12, 100, 10)
      `);
      expect(errors).toHaveLength(0);
    });
  });

  describe('Error handling', () => {
    it('reports Lua syntax errors', async () => {
      await expect(client.executeLua('function invalid(')).rejects.toThrow();
    });

    it('reports undefined function errors', async () => {
      await expect(client.executeLua('undefined_function()')).rejects.toThrow();
    });
  });
});