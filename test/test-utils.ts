import type { ElementHandle, GroupHandle, PartHandle, ControlHandle, DialogHandle } from '../src/types/element';

export interface TestElement extends ElementHandle {
  name?: string;
  children?: ElementHandle[];
}

export function createMockElement(type: string = 'block'): PartHandle {
  return {
    _type: 'element',
    _partType: true,
    id: `test_elem_${Math.random().toString(36).slice(2, 9)}`,
    elementType: type,
    geometry: null,
    material: null,
  };
}

export function createMockGroup(children: ElementHandle[] = []): GroupHandle {
  return {
    _type: 'element',
    _groupType: true,
    id: `test_group_${Math.random().toString(36).slice(2, 9)}`,
    elementType: 'group',
    children,
  };
}

export function createMockDialog(controls: Map<string, ControlHandle> = new Map()): DialogHandle {
  return {
    _type: 'dialog',
    id: `test_dialog_${Math.random().toString(36).slice(2, 9)}`,
    controls,
  };
}

export function createMockControl(type: string = 'text_box', value: unknown = ''): ControlHandle {
  return {
    _type: 'control',
    id: `test_ctrl_${Math.random().toString(36).slice(2, 9)}`,
    controlType: type,
    value,
  };
}

export function createBlockCode(size: number = 100, offset: number[] = [0, 0, 0]): string {
  return `
    local block = pytha.create_block(${size}, ${size}, ${size}, {${offset.join(', ')}})\
  `;
}

export function createCylinderCode(height: number = 100, radius: number = 50, offset: number[] = [0, 0, 0]): string {
  return `
    local cyl = pytha.create_cylinder(${height}, ${radius}, {${offset.join(', ')}})\
  `;
}

export function createSpiralCode(numPoints: number = 12, radius: number = 100): string {
  return `
    local function create_spiral(num_points, radius)
      for i = 1, num_points do
        local angle = i * 30
        local x = radius * COS(angle)
        local y = radius * SIN(angle)
        local z = i * 10
        pytha.create_cylinder(10, 5, {x, y, z})
      end
    end
    create_spiral(${numPoints}, ${radius})\
  `;
}

export function createKitchenSampleCode(): string {
  return `
-- Kitchen cabinet generator (simplified)
function main()
  local data = {
    width = 600,
    height = 720,
    depth = 560,
    door_gap = 4
  }

  local cabinet = pytha.create_block(
    data.width,
    data.depth,
    data.height,
    {0, 0, 0},
    {name = "Cabinet"}
  )

  pytha.set_element_pen(cabinet, 2)
end\
  `;
}

export function createDialogSampleCode(): string {
  return `
function main()
  local data = {size = 100, name = "Block"}

  pyui.run_modal_dialog(dialog_init, data)
end

function dialog_init(dialog, data)
  dialog:set_window_title("Configure Block")

  local size_label = dialog:create_label(1, "Size (mm)")
  local size_box = dialog:create_text_box(2, tostring(data.size))

  local ok_btn = dialog:create_ok_button(1)
  local cancel_btn = dialog:create_cancel_button(2)

  size_box:set_on_change_handler(function(text)
    local parsed = tonumber(text)
    if parsed then
      data.size = parsed
    end
  end)
end\
  `;
}

export interface LuaTestCase {
  name: string;
  code: string;
  expectedErrors?: number;
  expectedLogs?: string[];
}

export const luaTestCases: LuaTestCase[] = [
  {
    name: 'Simple block creation',
    code: 'local b = pytha.create_block(100,100,100,{0,0,0})',
  },
  {
    name: 'Multiple blocks in loop',
    code: `
      for i = 1, 5 do
        pytha.create_block(20, 20, 20, {i * 25, 0, 0})
      end
    `,
  },
  {
    name: 'Cylinder with options',
    code: `
      local cyl = pytha.create_cylinder(150, 40, {0,0,0}, {segments = 24})
    `,
  },
  {
    name: 'Group creation',
    code: `
      local b1 = pytha.create_block(100,100,100,{0,0,0})
      local b2 = pytha.create_block(50,50,50,{120,0,0})
      local g = pytha.create_group({b1,b2}, {name = "Group"})
    `,
  },
  {
    name: 'Transform operations',
    code: `
      local b = pytha.create_block(100,100,100,{50,50,0})
      pytha.rotate_element(b, {50,50,0}, 'z', 45)
      pytha.move_element(b, {25, 25, 0})
    `,
  },
  {
    name: 'Math functions',
    code: `
      local rad = 45
      local s = SIN(rad)
      local c = COS(rad)
      local t = TAN(rad)
    `,
  },
  {
    name: 'Table operations',
    code: `
      local t = {a = 1, b = 2, c = 3}
      local x = t.a
      t.d = 4
      for k,v in pairs(t) do
        local y = k .. v
      end
    `,
  },
  {
    name: 'Function with closure',
    code: `
      function make_multiplier(n)
        return function(x)
          return x * n
        end
      end
      local times3 = make_multiplier(3)
      local result = times3(7)
    `,
  },
  {
    name: 'Coroutines',
    code: `
      local co = coroutine.create(function()
        coroutine.yield(1)
        coroutine.yield(2)
        return 3
      end)
      local _, v1 = coroutine.resume(co)
      local _, v2 = coroutine.resume(co)
    `,
  },
  {
    name: 'Persistence',
    code: `
      pyio.save_values("test", {count = 42, name = "test"})
      local data = pyio.load_values("test")
    `,
  },
];

export const pythaFunctionTests = [
  { name: 'create_block', code: 'pytha.create_block(100,100,100,{0,0,0})' },
  { name: 'create_cylinder', code: 'pytha.create_cylinder(100,50,{0,0,0})' },
  { name: 'create_sphere', code: 'pytha.create_sphere(50,{0,0,0})' },
  { name: 'create_polygon', code: 'pytha.create_polygon({{0,0,0},{100,0,0},{100,100,0}})' },
  { name: 'create_polyline_open', code: 'pytha.create_polyline("open",{{0,0,0},{100,0,0},{100,100,0}})' },
  { name: 'create_polyline_closed', code: 'pytha.create_polyline("closed",{{0,0,0},{100,0,0},{100,100,0},{0,100,0}})' },
  { name: 'delete_element', code: 'local b=pytha.create_block(100,100,100,{0,0,0}) pytha.delete_element(b)' },
  { name: 'copy_element', code: 'local b=pytha.create_block(100,100,100,{0,0,0}) pytha.copy_element(b,{100,0,0})' },
  { name: 'move_element', code: 'local b=pytha.create_block(100,100,100,{0,0,0}) pytha.move_element(b,{50,50,0})' },
  { name: 'rotate_element', code: 'local b=pytha.create_block(100,100,100,{50,50,50}) pytha.rotate_element(b,{50,50,50},"z",45)' },
  { name: 'set_element_name', code: 'local b=pytha.create_block(100,100,100,{0,0,0}) pytha.set_element_name(b,"Test")' },
  { name: 'set_element_pen', code: 'local b=pytha.create_block(100,100,100,{0,0,0}) pytha.set_element_pen(b,3)' },
  { name: 'create_group', code: 'local b=pytha.create_block(100,100,100,{0,0,0}) pytha.create_group({b},{name="G"})' },
  { name: 'element_history', code: 'local b=pytha.create_block(100,100,100,{0,0,0}) pytha.set_element_history(b,{x=1},"key") local d=pytha.get_element_history(b,"key")' },
  { name: 'boole_part_union', code: 'local b1=pytha.create_block(100,100,100,{0,0,0}) local b2=pytha.create_block(50,50,50,{75,0,0}) pytha.boole_part_union({b1,b2})' },
  { name: 'get_group_descendants', code: 'local b=pytha.create_block(100,100,100,{0,0,0}) local g=pytha.create_group({b}) pytha.get_group_descendants(g)' },
  { name: 'get_length_unit', code: 'pytha.get_length_unit()' },
];

export const uiFunctionTests = [
  { name: 'alert', code: 'pyui.alert("test")' },
  { name: 'wait', code: 'pyui.wait(1)' },
  { name: 'format_length', code: 'pyui.format_length(100)' },
  { name: 'parse_length', code: 'pyui.parse_length("100 mm")' },
  { name: 'format_number', code: 'pyui.format_number(3.14)' },
  { name: 'parse_number', code: 'pyui.parse_number("42.5")' },
];

export const ioFunctionTests = [
  { name: 'save_values', code: 'pyio.save_values("k",{v=1})' },
  { name: 'load_values', code: 'pyio.load_values("k")' },
  { name: 'parse_json', code: 'pyio.parse_json(\'{"a":1}\')' },
  { name: 'parse_csv', code: 'pyio.parse_csv("a,b\\n1,2")' },
  { name: 'parse_lines', code: 'pyio.parse_lines("a\\nb\\nc")' },
];

export const geoFunctionTests = [
  { name: 'clean_polygon_2d', code: 'pygeo.clean_polygon_2d({{0,0},{100,0},{100,100}})' },
];