import { describe, expect, it } from 'vitest';
import { initLuaVM } from './index.ts';
import type { RenderMessage } from './protocol.ts';

interface CapturedRender {
  action: RenderMessage['action'];
  elementType: RenderMessage['elementType'];
  data: Record<string, unknown>;
}

interface CapturedPythaCall {
  name: string;
  args: Record<string, unknown>;
}

function executeLua(code: string) {
  const renders: CapturedRender[] = [];
  const calls: CapturedPythaCall[] = [];
  const vm = initLuaVM({
    onRender: (action, elementType, data) => {
      renders.push({ action, elementType, data });
    },
    onPythaCall: (name, args) => {
      calls.push({ name, args });
    },
  });

  vm.execute(code);
  return { renders, calls };
}

function handleFrom(call: CapturedPythaCall) {
  return call.args.result as Record<string, unknown>;
}

function expectElementHandle(handle: Record<string, unknown>, elementType: string) {
  expect(handle).toMatchObject({ _type: 'element', elementType });
  expect(typeof handle.id).toBe('string');
}

function byName(calls: CapturedPythaCall[], name: string) {
  return calls.find(call => call.name === name);
}

describe('pytha Lua API stack argument decoding', () => {
  it('covers create_block, create_cylinder, and create_sphere params', () => {
    const { renders, calls } = executeLua(`
      pytha.create_block(100, 50, 25, {1, 2, 3}, {name = "Cabinet", u_axis = {1, 0, 0}})
      pytha.create_cylinder(80, 12, {4, 5, 6}, {segments = 16, top_radius = 4})
      pytha.create_sphere(9, {7, 8, 9}, {latitude_segments = 8})
    `);

    console.log('[TEST] create_block, create_cylinder, create_sphere');
    calls.forEach(call => console.log(`  ${call.name}:`, JSON.stringify(call.args, null, 2)));

    expect(calls.map(call => call.name)).toEqual([
      'create_block',
      'create_cylinder',
      'create_sphere',
    ]);
    expect(renders).toHaveLength(3);

    expect(calls[0].args).toMatchObject({
      length: 100,
      width: 50,
      height: 25,
      origin: [1, 2, 3],
      options: { name: 'Cabinet', u_axis: [1, 0, 0] },
    });
    expectElementHandle(handleFrom(calls[0]), 'block');

    expect(calls[1].args).toMatchObject({
      height: 80,
      radius: 12,
      origin: [4, 5, 6],
      options: { segments: 16, top_radius: 4 },
    });
    expectElementHandle(handleFrom(calls[1]), 'cylinder');

    expect(calls[2].args).toMatchObject({
      radius: 9,
      origin: [7, 8, 9],
      options: { latitude_segments: 8 },
    });
    expectElementHandle(handleFrom(calls[2]), 'sphere');
  });

  it('covers create_polygon and create_polyline nested table params', () => {
    const { calls } = executeLua(`
      pytha.create_polygon(
        {{0, 0}, {10, 0}, {10, 20}},
        {5, 6, 7},
        {clean_face = "dont_clean"}
      )

      pytha.create_polyline(
        "closed",
        {{0, 0, 0}, {1, 2, 3}, {4, 5, 6}},
        {1, 1, 1},
        {w_axis = {0, 0, 1}}
      )
    `);

    console.log('[TEST] create_polygon, create_polyline');
    calls.forEach(call => console.log(`  ${call.name}:`, JSON.stringify(call.args, null, 2)));

    expect(calls.map(call => call.name)).toEqual(['create_polygon', 'create_polyline']);
    expect(calls[0].args).toMatchObject({
      points: [[0, 0], [10, 0], [10, 20]],
      origin: [5, 6, 7],
      options: { clean_face: 'dont_clean' },
    });
    expectElementHandle(handleFrom(calls[0]), 'polygon');

    expect(calls[1].args).toMatchObject({
      type: 'closed',
      points: [[0, 0, 0], [1, 2, 3], [4, 5, 6]],
      origin: [1, 1, 1],
      options: { w_axis: [0, 0, 1] },
    });
    expectElementHandle(handleFrom(calls[1]), 'polyline');
  });

  it('covers create_group, copy_element, move_element, and delete_element handle tables', () => {
    const { calls } = executeLua(`
      local block = pytha.create_block(1, 2, 3)
      local cylinder = pytha.create_cylinder(4, 5)
      local group = pytha.create_group({block, cylinder}, {name = "Assembly"})
      local copies = pytha.copy_element({block, cylinder}, {9, 8, 7}, 2)

      if #copies ~= 4 then error("copy count mismatch") end

      pytha.move_element(copies, {10, 20, 30})
      pytha.delete_element({block, cylinder, group})
    `);

    console.log('[TEST] create_group, copy_element, move_element, delete_element');
    calls.forEach(call => console.log(`  ${call.name}:`, JSON.stringify(call.args, null, 2)));

    const blockHandle = handleFrom(calls[0]);
    const cylinderHandle = handleFrom(calls[1]);
    const groupCall = byName(calls, 'create_group');
    const copyCall = byName(calls, 'copy_element');
    const moveCall = byName(calls, 'move_element');
    const deleteCall = byName(calls, 'delete_element');

    expect(groupCall?.args).toMatchObject({
      elements: [blockHandle, cylinderHandle],
      options: { name: 'Assembly' },
    });
    expectElementHandle(groupCall?.args.result as Record<string, unknown>, 'group');

    expect(copyCall?.args).toMatchObject({
      elements: [blockHandle, cylinderHandle],
      offset: [9, 8, 7],
      copies: 2,
    });
    expect(copyCall?.args.result).toHaveLength(4);

    expect(moveCall?.args).toMatchObject({
      elements: copyCall?.args.result,
      offset: [10, 20, 30],
    });

    expect(deleteCall?.args).toMatchObject({
      elements: [blockHandle, cylinderHandle, groupCall?.args.result],
    });
  });

  it('covers rotate_element and mirror_element transform params', () => {
    const { calls } = executeLua(`
      local block = pytha.create_block(1, 2, 3)
      pytha.rotate_element(block, {0, 0, 0}, {0, 0, 1}, 45)
      pytha.mirror_element(block, {1, 2, 3}, {0, 1, 0})
    `);

    console.log('[TEST] rotate_element, mirror_element');
    calls.forEach(call => console.log(`  ${call.name}:`, JSON.stringify(call.args, null, 2)));

    const blockHandle = handleFrom(calls[0]);
    expect(byName(calls, 'rotate_element')?.args).toMatchObject({
      elements: [blockHandle],
      origin: [0, 0, 0],
      axis: [0, 0, 1],
      angle: 45,
    });

    expect(byName(calls, 'mirror_element')?.args).toMatchObject({
      elements: [blockHandle],
      origin: [1, 2, 3],
      axis: [0, 1, 0],
    });
  });

  it('covers element attribute and history functions', () => {
    const { calls } = executeLua(`
      local block = pytha.create_block(1, 2, 3)
      local group = pytha.create_group(block, {name = "Group A"})

      pytha.set_element_name(block, "Block A")
      pytha.set_element_pen(block, 7)
      pytha.set_element_material(block, {name = "Oak", color = {0.4, 0.2, 0.1}})
      pytha.set_element_layer(block, "Layer 1")
      pytha.set_element_group(block, group)
      pytha.set_element_history(block, {plugin = "test", revision = 2}, "history-key")

      local value = pytha.get_element_history(block, "history-key")
      if value ~= nil then error("history should be nil in stub") end
    `);

    console.log('[TEST] element attribute and history');
    calls.forEach(call => console.log(`  ${call.name}:`, JSON.stringify(call.args, null, 2)));

    const blockHandle = handleFrom(calls[0]);
    const groupHandle = handleFrom(calls[1]);

    expect(byName(calls, 'set_element_name')?.args).toMatchObject({ elements: [blockHandle], name: 'Block A' });
    expect(byName(calls, 'set_element_pen')?.args).toMatchObject({ elements: [blockHandle], pen: 7 });
    expect(byName(calls, 'set_element_material')?.args).toMatchObject({
      elements: [blockHandle],
      material: { name: 'Oak', color: [0.4, 0.2, 0.1] },
    });
    expect(byName(calls, 'set_element_layer')?.args).toMatchObject({ elements: [blockHandle], layer: 'Layer 1' });
    expect(byName(calls, 'set_element_group')?.args).toMatchObject({ elements: [blockHandle], group: groupHandle });
    expect(byName(calls, 'set_element_history')?.args).toMatchObject({
      elements: [blockHandle],
      data: { plugin: 'test', revision: 2 },
      key: 'history-key',
    });
    expect(byName(calls, 'get_element_history')?.args).toMatchObject({ element: blockHandle, key: 'history-key' });
  });

  it('covers group descendants, boolean union, and length unit functions', () => {
    const { calls } = executeLua(`
      local block = pytha.create_block(1, 2, 3)
      local cylinder = pytha.create_cylinder(4, 5)
      local group = pytha.create_group({block, cylinder})

      local descendants = pytha.get_group_descendants(group)
      if type(descendants) ~= "table" then error("descendants should be a table") end

      local union = pytha.boole_part_union({block, cylinder})
      if union ~= nil then error("union should be nil in stub") end

      local unit = pytha.get_length_unit()
      if unit ~= 1 then error("unit should be 1") end
    `);

    console.log('[TEST] group descendants, boolean union, length unit');
    calls.forEach(call => console.log(`  ${call.name}:`, JSON.stringify(call.args, null, 2)));

    const blockHandle = handleFrom(calls[0]);
    const cylinderHandle = handleFrom(calls[1]);
    const groupHandle = handleFrom(calls[2]);

    expect(byName(calls, 'get_group_descendants')?.args).toMatchObject({ group: groupHandle, result: [] });
    expect(byName(calls, 'boole_part_union')?.args).toMatchObject({
      elements: [blockHandle, cylinderHandle],
    });
    expect(byName(calls, 'get_length_unit')?.args).toMatchObject({ result: 1 });
  });
});
