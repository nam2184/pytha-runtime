import * as fengari from 'fengari';
import type { ApiContext, ElementHandle } from '@/runtime/runtime-types.js';
import { createElementHandle, getElementHandles, luaValueToJs, pushValue } from '@/runtime/lua-utils.js';

const { lua, to_jsstring } = fengari;

export function registerPythaApi(context: ApiContext): void {
  const { L, state, emitRender, emitPythaCall } = context;

  state.setGlobal('pytha', {
    create_block: () => {
      const length = lua.lua_tonumber(L, 1) ?? 0;
      const width = lua.lua_tonumber(L, 2) ?? 0;
      const height = lua.lua_tonumber(L, 3) ?? 0;
      const origin = luaValueToJs(L, 4);
      const options = luaValueToJs(L, 5);
      const handle = createElementHandle('block');
      emitPythaCall('create_block', { length, width, height, origin, options, result: handle });
      emitRender('create', 'block', { handle, length, width, height, origin, options });
      pushValue(L, handle);
      return 1;
    },
    create_cylinder: () => {
      const height = lua.lua_tonumber(L, 1) ?? 0;
      const radius = lua.lua_tonumber(L, 2) ?? 0;
      const origin = luaValueToJs(L, 3);
      const options = luaValueToJs(L, 4);
      const handle = createElementHandle('cylinder');
      emitPythaCall('create_cylinder', { height, radius, origin, options, result: handle });
      emitRender('create', 'cylinder', { handle, height, radius, origin, options });
      pushValue(L, handle);
      return 1;
    },
    create_sphere: () => {
      const radius = lua.lua_tonumber(L, 1) ?? 0;
      const origin = luaValueToJs(L, 2);
      const options = luaValueToJs(L, 3);
      const handle = createElementHandle('sphere');
      emitPythaCall('create_sphere', { radius, origin, options, result: handle });
      emitRender('create', 'sphere', { handle, radius, origin, options });
      pushValue(L, handle);
      return 1;
    },
    create_polygon: () => {
      const points = luaValueToJs(L, 1);
      const origin = luaValueToJs(L, 2);
      const options = luaValueToJs(L, 3);
      const handle = createElementHandle('polygon');
      emitPythaCall('create_polygon', { points, origin, options, result: handle });
      emitRender('create', 'polygon', { handle, points, origin, options });
      pushValue(L, handle);
      return 1;
    },
    create_polyline: () => {
      const type = to_jsstring(lua.lua_tostring(L, 1));
      const points = luaValueToJs(L, 2);
      const origin = luaValueToJs(L, 3);
      const options = luaValueToJs(L, 4);
      const closed = type === 'closed';
      const handle = createElementHandle('polyline');
      emitPythaCall('create_polyline', { type, points, origin, options, result: handle });
      emitRender('create', 'polyline', { handle, type, closed, points, origin, options });
      pushValue(L, handle);
      return 1;
    },
    create_group: () => {
      const elements = getElementHandles(luaValueToJs(L, 1));
      const options = luaValueToJs(L, 2);
      const handle = createElementHandle('group');
      emitPythaCall('create_group', { elements, options, result: handle });
      emitRender('create', 'group', { handle, elements, options });
      pushValue(L, handle);
      return 1;
    },
    delete_element: () => {
      const elements = getElementHandles(luaValueToJs(L, 1));
      emitPythaCall('delete_element', { elements });
      for (const handle of elements) {
        emitRender('delete', handle.elementType, { handle });
      }
      return 0;
    },
    copy_element: () => {
      const sourceHandles = getElementHandles(luaValueToJs(L, 1));
      const offset = luaValueToJs(L, 2);
      const copies = lua.lua_tonumber(L, 3) ?? 1;
      const copiedHandles: ElementHandle[] = [];

      for (let copyIndex = 0; copyIndex < copies; copyIndex++) {
        for (const sourceHandle of sourceHandles) {
          const handle = createElementHandle(sourceHandle.elementType);
          copiedHandles.push(handle);
          emitRender('create', sourceHandle.elementType, { handle, sourceHandle, offset });
        }
      }

      emitPythaCall('copy_element', { elements: sourceHandles, offset, copies, result: copiedHandles });
      pushValue(L, copiedHandles);
      return 1;
    },
    move_element: () => {
      const elements = getElementHandles(luaValueToJs(L, 1));
      const offset = luaValueToJs(L, 2);
      emitPythaCall('move_element', { elements, offset });
      for (const handle of elements) {
        emitRender('update', handle.elementType, { handle, offset });
      }
      return 0;
    },
    rotate_element: () => {
      const elements = getElementHandles(luaValueToJs(L, 1));
      const origin = luaValueToJs(L, 2);
      const axis = luaValueToJs(L, 3);
      const angle = lua.lua_tonumber(L, 4) ?? 0;
      emitPythaCall('rotate_element', { elements, origin, axis, angle });
      for (const handle of elements) {
        emitRender('update', handle.elementType, { handle, origin, axis, angle });
      }
      return 0;
    },
    mirror_element: () => {
      const elements = getElementHandles(luaValueToJs(L, 1));
      const origin = luaValueToJs(L, 2);
      const axis = luaValueToJs(L, 3);
      emitPythaCall('mirror_element', { elements, origin, axis });
      for (const handle of elements) {
        emitRender('update', handle.elementType, { handle, origin, axis });
      }
      return 0;
    },
    set_element_name: () => {
      const elements = getElementHandles(luaValueToJs(L, 1));
      const name = to_jsstring(lua.lua_tostring(L, 2));
      emitPythaCall('set_element_name', { elements, name });
      for (const handle of elements) {
        emitRender('update', handle.elementType, { handle, name });
      }
      return 0;
    },
    set_element_pen: () => {
      const elements = getElementHandles(luaValueToJs(L, 1));
      const pen = lua.lua_tonumber(L, 2) ?? 0;
      emitPythaCall('set_element_pen', { elements, pen });
      for (const handle of elements) {
        emitRender('update', handle.elementType, { handle, penIndex: pen });
      }
      return 0;
    },
    set_element_material: () => {
      const elements = getElementHandles(luaValueToJs(L, 1));
      const material = luaValueToJs(L, 2);
      emitPythaCall('set_element_material', { elements, material });
      for (const handle of elements) {
        emitRender('update', handle.elementType, { handle, material });
      }
      return 0;
    },
    set_element_layer: () => {
      const elements = getElementHandles(luaValueToJs(L, 1));
      const layer = luaValueToJs(L, 2);
      emitPythaCall('set_element_layer', { elements, layer });
      for (const handle of elements) {
        emitRender('update', handle.elementType, { handle, layer });
      }
      return 0;
    },
    set_element_group: () => {
      const elements = getElementHandles(luaValueToJs(L, 1));
      const group = luaValueToJs(L, 2);
      emitPythaCall('set_element_group', { elements, group });
      for (const handle of elements) {
        emitRender('update', handle.elementType, { handle, group });
      }
      return 0;
    },
    set_element_history: () => {
      const elements = getElementHandles(luaValueToJs(L, 1));
      const data = luaValueToJs(L, 2);
      const key = to_jsstring(lua.lua_tostring(L, 3));
      emitPythaCall('set_element_history', { elements, data, key });
      return 0;
    },
    get_element_history: () => {
      const element = getElementHandles(luaValueToJs(L, 1))[0];
      const key = to_jsstring(lua.lua_tostring(L, 2));
      emitPythaCall('get_element_history', { element, key, result: undefined });
      lua.lua_pushnil(L);
      return 1;
    },
    get_group_descendants: () => {
      const group = getElementHandles(luaValueToJs(L, 1))[0];
      const result: ElementHandle[] = [];
      emitPythaCall('get_group_descendants', { group, result });
      pushValue(L, result);
      return 1;
    },
    boole_part_union: () => {
      const elements = getElementHandles(luaValueToJs(L, 1));
      emitPythaCall('boole_part_union', { elements, result: undefined });
      lua.lua_pushnil(L);
      return 1;
    },
    get_length_unit: () => {
      const result = 1.0;
      emitPythaCall('get_length_unit', { result });
      lua.lua_pushnumber(L, result);
      return 1;
    },
  });
}
