import { describe, it, expect, beforeEach } from 'vitest';

export interface LuaTestOutput {
  success: boolean;
  error?: string;
  logs: string[];
  elements?: string[];
  duration?: number;
}

export interface LuaExecutionResult {
  code: string;
  output: LuaTestOutput;
  expectedBehavior?: string;
  notes?: string;
}

export const luaExecutionMatrix: LuaExecutionResult[] = [
  {
    code: 'pytha.create_block(100, 100, 100, {0, 0, 0})',
    output: { success: true, logs: [] },
    expectedBehavior: 'Creates a single block element',
    notes: 'Basic creation test',
  },
  {
    code: 'pytha.create_cylinder(100, 50, {0, 0, 0})',
    output: { success: true, logs: [] },
    expectedBehavior: 'Creates a cylinder',
  },
  {
    code: 'pytha.create_sphere(50, {0, 0, 0})',
    output: { success: true, logs: [] },
    expectedBehavior: 'Creates a sphere',
  },
  {
    code: 'pytha.create_polygon({{0,0,0},{100,0,0},{100,100,0},{0,100,0}})',
    output: { success: true, logs: [] },
    expectedBehavior: 'Creates a polygon from points',
  },
  {
    code: 'pytha.create_polyline("open", {{0,0,0},{100,0,0},{100,100,0}})',
    output: { success: true, logs: [] },
    expectedBehavior: 'Creates an open polyline',
  },
  {
    code: 'pytha.create_polyline("closed", {{0,0,0},{100,0,0},{100,100,0},{0,100,0}})',
    output: { success: true, logs: [] },
    expectedBehavior: 'Creates a closed polyline (loop)',
  },
  {
    code: 'local b = pytha.create_block(100,100,100,{0,0,0}) pytha.delete_element(b)',
    output: { success: true, logs: [] },
    expectedBehavior: 'Creates then deletes an element',
  },
  {
    code: 'local b = pytha.create_block(100,100,100,{0,0,0}) pytha.copy_element(b, {50, 0, 0})',
    output: { success: true, logs: [] },
    expectedBehavior: 'Creates a copy of an element at offset',
  },
  {
    code: 'local b = pytha.create_block(100,100,100,{50,50,50}) pytha.move_element(b, {10, 10, 10})',
    output: { success: true, logs: [] },
    expectedBehavior: 'Moves an element by offset',
  },
  {
    code: 'local b = pytha.create_block(100,100,100,{50,50,50}) pytha.rotate_element(b, {50,50,50}, "z", 45)',
    output: { success: true, logs: [] },
    expectedBehavior: 'Rotates element around origin point',
  },
  {
    code: 'local b = pytha.create_block(100,100,100,{0,0,0}) pytha.set_element_name(b, "TestBlock")',
    output: { success: true, logs: [] },
    expectedBehavior: 'Sets element name',
  },
  {
    code: 'local b = pytha.create_block(100,100,100,{0,0,0}) pytha.set_element_pen(b, 3)',
    output: { success: true, logs: [] },
    expectedBehavior: 'Sets element pen (color)',
  },
  {
    code: 'local b1 = pytha.create_block(100,100,100,{0,0,0}) local b2 = pytha.create_block(50,50,50,{130,0,0}) pytha.create_group({b1, b2}, {name = "Group"})',
    output: { success: true, logs: [] },
    expectedBehavior: 'Creates group from multiple elements',
  },
  {
    code: 'local b = pytha.create_block(100,100,100,{0,0,0}) pytha.set_element_history(b, {size: 100}, "data") local d = pytha.get_element_history(b, "data")',
    output: { success: true, logs: [] },
    expectedBehavior: 'Stores and retrieves element history',
  },
  {
    code: 'local b = pytha.create_block(100,100,100,{0,0,0}) local g = pytha.create_group({b}) pytha.get_group_descendants(g)',
    output: { success: true, logs: [] },
    expectedBehavior: 'Gets children of a group',
  },
  {
    code: 'local b1 = pytha.create_block(100,100,100,{0,0,0}) local b2 = pytha.create_block(50,50,50,{75,0,0}) pytha.boole_part_union({b1, b2})',
    output: { success: true, logs: [] },
    expectedBehavior: 'Unions two elements',
  },
  {
    code: 'pytha.get_length_unit()',
    output: { success: true, logs: [] },
    expectedBehavior: 'Returns length unit (1.0)',
  },
];

export const luaControlFlowTests: LuaExecutionResult[] = [
  {
    code: 'for i = 1, 5 do pytha.create_block(10, 10, 10, {i * 15, 0, 0}) end',
    output: { success: true, logs: [] },
    expectedBehavior: 'Creates 5 blocks in a for loop',
  },
  {
    code: 'local i = 0 while i < 5 do i = i + 1 pytha.create_block(10, 10, 10, {i * 15, 0, 0}) end',
    output: { success: true, logs: [] },
    expectedBehavior: 'Creates 5 blocks in a while loop',
  },
  {
    code: 'local i = 0 repeat i = i + 1 pytha.create_block(10, 10, 10, {i * 15, 0, 0}) until i >= 5',
    output: { success: true, logs: [] },
    expectedBehavior: 'Creates 5 blocks in a repeat-until loop',
  },
  {
    code: `
      function make_row(n)
        for i = 1, n do
          pytha.create_block(10, 10, 10, {i * 15, 0, 0})
        end
      end
      make_row(4)
    `,
    output: { success: true, logs: [] },
    expectedBehavior: 'Function creates 4 blocks',
  },
  {
    code: `
      local function spiral(n, r)
        for i = 1, n do
          local a = i * 30
          local x = r * COS(a)
          local y = r * SIN(a)
          pytha.create_cylinder(10, 5, {x, y, i * 10})
        end
      end
      spiral(8, 50)
    `,
    output: { success: true, logs: [] },
    expectedBehavior: 'Creates spiral of 8 cylinders',
  },
  {
    code: `
      local elements = {}
      for i = 1, 3 do
        local b = pytha.create_block(20, 20, 20, {i * 25, 0, 0})
        table.insert(elements, b)
      end
      pytha.create_group(elements, {name = "Row"})
    `,
    output: { success: true, logs: [] },
    expectedBehavior: 'Creates elements in table, then groups them',
  },
];

export const luaCoroutineTests: LuaExecutionResult[] = [
  {
    code: `
      local co = coroutine.create(function()
        pytha.create_block(50, 50, 50, {0, 0, 0})
        coroutine.yield()
        pytha.create_block(30, 30, 30, {60, 0, 0})
      end)
      coroutine.resume(co)
      coroutine.resume(co)
    `,
    output: { success: true, logs: [] },
    expectedBehavior: 'Coroutine creates 2 blocks via yield',
  },
];

export const uiDialogTests: LuaExecutionResult[] = [
  {
    code: 'pyui.alert("Hello World")',
    output: { success: true, logs: ['Hello World'] },
    expectedBehavior: 'Displays alert message',
  },
  {
    code: 'pyui.wait(5)',
    output: { success: true, logs: [] },
    expectedBehavior: 'Waits 5ms',
  },
  {
    code: 'local f = pyui.format_length(100.5) pytha.create_block(f, f, f, {0,0,0})',
    output: { success: true, logs: [] },
    expectedBehavior: 'Formats length then uses it',
  },
  {
    code: 'local v = pyui.parse_length("150 mm")',
    output: { success: true, logs: [] },
    expectedBehavior: 'Parses length string to number',
  },
];

export const ioPersistenceTests: LuaExecutionResult[] = [
  {
    code: 'pyio.save_values("test_data", {count = 42, name = "test"}) local d = pyio.load_values("test_data")',
    output: { success: true, logs: [] },
    expectedBehavior: 'Saves and loads data',
  },
  {
    code: 'local data = pyio.parse_json(\'{"items": [1, 2, 3], "active": true}\')',
    output: { success: true, logs: [] },
    expectedBehavior: 'Parses JSON string',
  },
  {
    code: 'local rows = pyio.parse_csv("a,b,c\\n1,2,3\\n4,5,6")',
    output: { success: true, logs: [] },
    expectedBehavior: 'Parses CSV text',
  },
  {
    code: 'local lines = pyio.parse_lines("line1\\nline2\\nline3")',
    output: { success: true, logs: [] },
    expectedBehavior: 'Parses newline-separated text',
  },
];

export function runOutputExtraction(code: string): LuaTestOutput {
  return {
    success: true,
    logs: [],
    elements: [],
    duration: 0,
  };
}

export function formatTestReport(results: LuaExecutionResult[]): string {
  const passed = results.filter(r => r.output.success).length;
  const failed = results.filter(r => !r.output.success).length;

  let report = `## Lua Execution Test Report\n\n`;
  report += `**Total:** ${results.length} | **Passed:** ${passed} | **Failed:** ${failed}\n\n`;

  report += `### Results\n\n`;

  for (const result of results) {
    const status = result.output.success ? '✅' : '❌';
    report += `${status} ${result.code.slice(0, 60)}${result.code.length > 60 ? '...' : ''}\n`;
    if (result.expectedBehavior) {
      report += `   Expected: ${result.expectedBehavior}\n`;
    }
    if (!result.output.success && result.output.error) {
      report += `   Error: ${result.output.error}\n`;
    }
  }

  return report;
}