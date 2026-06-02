import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'crypto';
import {
  createMessage,
  type ClientMessage,
  type ServerMessage,
  type RenderMessage,
  type UICreateMessage,
  type LogMessage,
} from './protocol.js';

const PORT = 8080;

export interface LuaState {
  execute(code: string): void;
  push(value: unknown): void;
  pop(): unknown;
  getGlobal(name: string): void;
  setGlobal(name: string, value: unknown): void;
  toString(index: number): string;
  toNumber(index: number): number | null;
  isTable(index: number): boolean;
  isFunction(index: number): boolean;
  isString(index: number): boolean;
  isNumber(index: number): boolean;
  objLen(index: number): number;
  rawGet(index: number, key: unknown): void;
  rawSet(index: number, key: unknown, value: unknown): void;
  getField(index: number, key: string): void;
  setField(index: number, key: string): void;
  popHandler: () => void;
}

export interface LuaRuntimeOptions {
  onRender?: (action: RenderMessage['action'], elementType: RenderMessage['elementType'], data: Record<string, unknown>) => void;
  onLog?: (level: LogMessage['level'], message: string) => void;
  onUICreate?: (dialogId: string, controls: UICreateMessage['controls']) => void;
  onPythaCall?: (name: string, args: Record<string, unknown>) => void;
}

let L: LuaState | null = null;

import * as fengari from 'fengari';
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;

interface ElementHandle {
  _type: 'element';
  id: string;
  elementType: RenderMessage['elementType'];
}

function pushValue(L: any, val: unknown): void {
  if (typeof val === 'string') {
    lua.lua_pushstring(L, to_luastring(val));
  } else if (typeof val === 'number') {
    lua.lua_pushnumber(L, val);
  } else if (typeof val === 'boolean') {
    lua.lua_pushboolean(L, val ? 1 : 0);
  } else if (val === null || val === undefined) {
    lua.lua_pushnil(L);
  } else if (typeof val === 'function') {
    lua.lua_pushjsfunction(L, val);
  } else if (Array.isArray(val)) {
    lua.lua_createtable(L, val.length, 0);
    for (let i = 0; i < val.length; i++) {
      pushValue(L, val[i]);
      lua.lua_rawseti(L, -2, i + 1);
    }
  } else if (typeof val === 'object') {
    lua.lua_createtable(L, 0, Object.keys(val).length);
    for (const [key, value] of Object.entries(val)) {
      lua.lua_pushstring(L, to_luastring(String(key)));
      pushValue(L, value);
      lua.lua_settable(L, -3);
    }
  } else {
    lua.lua_pushnil(L);
  }
}

function luaValueToJs(L: any, idx: number): unknown {
  const type = lua.lua_type(L, idx);

  if (type === lua.LUA_TNIL || type === lua.LUA_TNONE) {
    return undefined;
  }

  if (type === lua.LUA_TBOOLEAN) {
    return Boolean(lua.lua_toboolean(L, idx));
  }

  if (type === lua.LUA_TNUMBER) {
    return lua.lua_tonumber(L, idx);
  }

  if (type === lua.LUA_TSTRING) {
    return lua.lua_tojsstring(L, idx);
  }

  if (type !== lua.LUA_TTABLE) {
    return undefined;
  }

  const absIdx = lua.lua_absindex(L, idx);
  const entries: Array<[unknown, unknown]> = [];

  lua.lua_pushnil(L);
  while (lua.lua_next(L, absIdx) !== 0) {
    entries.push([luaValueToJs(L, -2), luaValueToJs(L, -1)]);
    lua.lua_pop(L, 1);
  }

  const numericKeys = entries
    .map(([key]) => key)
    .filter((key): key is number => typeof key === 'number' && Number.isInteger(key) && key > 0);

  if (numericKeys.length === entries.length) {
    numericKeys.sort((a, b) => a - b);
    const isArray = numericKeys.every((key, index) => key === index + 1);
    if (isArray) {
      return entries
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([, value]) => value);
    }
  }

  const obj: Record<string, unknown> = {};
  for (const [key, value] of entries) {
    obj[String(key)] = value;
  }
  return obj;
}

function createElementHandle(elementType: RenderMessage['elementType']): ElementHandle {
  return { _type: 'element', id: randomUUID(), elementType };
}

function isElementHandle(value: unknown): value is ElementHandle {
  return Boolean(
    value &&
    typeof value === 'object' &&
    (value as ElementHandle)._type === 'element' &&
    typeof (value as ElementHandle).id === 'string'
  );
}

function getElementHandles(value: unknown): ElementHandle[] {
  if (isElementHandle(value)) {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.filter(isElementHandle);
  }

  return [];
}

const clients = new Map<string, WebSocket>();

const pendingDialogCallbacks = new Map<string, (data: unknown) => void>();

export function initLuaVM(options: LuaRuntimeOptions = {}): LuaState {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);

  const emitRender = options.onRender ?? broadcastRender;
  const emitLog = options.onLog ?? broadcastLog;
  const emitUICreate = options.onUICreate ?? broadcastUICreate;
  const emitPythaCall = options.onPythaCall ?? (() => {});

  const to_luastring_: (s: string) => any = to_luastring;
  const to_jsstring_: (s: any) => string = to_jsstring;

  const state: LuaState = {
    execute(code: string) {
      const result = lauxlib.luaL_dostring(L, to_luastring_(code));
      if (result !== lua.LUA_OK) {
        const error = to_jsstring_(lauxlib.luaL_tolstring(L, -1)!);
        lua.lua_pop(L, 1);
        throw new Error(`Lua error: ${error}`);
      }
    },
    push(value: unknown) {
      pushValue(L, value);
    },
    pop() {
      const idx = lua.lua_gettop(L);
      const val = luaValueToJs(L, idx);
      lua.lua_pop(L, 1);
      return val;
    },
    getGlobal(name: string) {
      lua.lua_getglobal(L, to_luastring_(name));
    },
    setGlobal(name: string, value: unknown) {
      pushValue(L, value);
      lua.lua_setglobal(L, to_luastring_(name));
    },
    toString(idx: number) {
      return to_jsstring_(lua.lua_tostring(L, idx)!);
    },
    toNumber(idx: number) {
      return lua.lua_isnumber(L, idx) ? lua.lua_tonumber(L, idx) : null;
    },
    isTable(idx: number) {
      return lua.lua_istable(L, idx);
    },
    isFunction(idx: number) {
      return lua.lua_isfunction(L, idx);
    },
    isString(idx: number) {
      return lua.lua_isstring(L, idx);
    },
    isNumber(idx: number) {
      return lua.lua_isnumber(L, idx);
    },
    objLen(idx: number) {
      return lua.lua_objlen(L, idx);
    },
    rawGet(idx: number, key: unknown) {
      pushValue(L, key);
      lua.lua_rawget(L, idx);
    },
    rawSet(idx: number, key: unknown, value: unknown) {
      pushValue(L, key);
      pushValue(L, value);
      lua.lua_rawset(L, idx);
    },
    getField(idx: number, key: string) {
      lua.lua_getfield(L, idx, to_luastring_(key));
    },
    setField(idx: number, key: string) {
      pushValue(L, key);
      lua.lua_setfield(L, idx, to_luastring_(key));
    },
    get popHandler() {
      return () => { lua.lua_pop(L, 1); };
    },
  };

  const printFn = (...args: unknown[]) => {
    console.log('[Lua print] called with args:', JSON.stringify(args));
    try {
      const msg = args.map(a => String(a)).join(' ');
      console.log('[Lua print] message:', msg);
      emitLog('debug', `[Lua] ${msg}`);
    } catch (e) {
      console.error('[Lua print] broadcast error:', e);
    }
  };

  lua.lua_pushjsclosure(L, printFn, 0);
  lua.lua_setglobal(L, to_luastring('print'));

  const testFn = (L: any) => {
    const nargs = lua.lua_gettop(L);
    console.log('[test] called with', nargs, 'arguments');
    return 0;
  };
  lua.lua_pushjsclosure(L, testFn, 0);
  lua.lua_setglobal(L, to_luastring('test'));

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

  state.setGlobal('pyui', {
    alert: () => {
      const msg = to_jsstring(lua.lua_tostring(L, 1));
      emitLog('info', `[PYUI] ${msg}`);
      return 1;
    },
    wait: () => {
      const ms = lua.lua_tonumber(L, 1) ?? 0;
      return new Promise(resolve => setTimeout(resolve, ms));
    },
    format_length: () => {
      const value = lua.lua_tonumber(L, 1) ?? 0;
      return `${value.toFixed(2)} mm`;
    },
    parse_length: () => {
      const text = to_jsstring(lua.lua_tostring(L, 1));
      const match = text.match(/^([\d.]+)/);
      return match ? parseFloat(match[1]) : undefined;
    },
    format_number: () => {
      const value = lua.lua_tonumber(L, 1);
      return String(value);
    },
    parse_number: () => {
      const text = to_jsstring(lua.lua_tostring(L, 1));
      const n = parseFloat(text);
      return isNaN(n) ? undefined : n;
    },
    run_modal_dialog: () => {
      const initFuncIdx = 1;
      const dataIdx = 2;

      lua.lua_pushvalue(L, initFuncIdx);
      const isFunc = lua.lua_isfunction(L, -1);
      lua.lua_pop(L, 1);

      if (!isFunc) return 0;

      const dialogId = randomUUID();
      const controls: UICreateMessage['controls'] = [];
      const dialogProxy = {
        set_window_title: (title: string) => {
        },
        create_label: (position: [number, number], text: string) => {
          const id = randomUUID();
          controls.push({ id, type: 'label', label: text, position });
          return makeControlProxy(dialogId, id);
        },
        create_text_box: (position: [number, number], val: string) => {
          const id = randomUUID();
          controls.push({ id, type: 'text_box', label: val, value: val, position });
          return makeControlProxy(dialogId, id);
        },
        create_button: (position: [number, number], label: string) => {
          const id = randomUUID();
          controls.push({ id, type: 'button', label, position });
          return makeControlProxy(dialogId, id);
        },
        create_check_box: (position: [number, number], label: string) => {
          const id = randomUUID();
          controls.push({ id, type: 'check_box', label, position });
          return makeControlProxy(dialogId, id);
        },
        create_combo_box: (position: [number, number], items: string[]) => {
          const id = randomUUID();
          controls.push({ id, type: 'combo_box', items, position });
          return makeControlProxy(dialogId, id);
        },
        create_list_box: (position: [number, number], items: string[]) => {
          const id = randomUUID();
          controls.push({ id, type: 'list_box', items, position });
          return makeControlProxy(dialogId, id);
        },
        create_ok_button: (position: [number, number]) => {
          const id = randomUUID();
          controls.push({ id, type: 'button', label: 'OK', position });
          return makeControlProxy(dialogId, id);
        },
        create_cancel_button: (position: [number, number]) => {
          const id = randomUUID();
          controls.push({ id, type: 'button', label: 'Cancel', position });
          return makeControlProxy(dialogId, id);
        },
        create_align: (columns: unknown[]) => {
        },
        equalize_column_widths: (columns: unknown []) => {
        },
      };

      lua.lua_pushvalue(L, dataIdx);
      const data = luaValueToJs(L, -1);
      lua.lua_pop(L, 1);

      lua.lua_pushvalue(L, initFuncIdx);
      pushValue(L, dialogProxy);
      pushValue(L, data);
      lua.lua_call(L, 2, 0);

      emitUICreate(dialogId, controls);
      return 0;
    },
    end_modal_cancel: () => {
    },
  });

  state.setGlobal('pyio', {
    parse_json: (text: string) => {
      try {
        return JSON.parse(text);
      } catch {
        return undefined;
      }
    },
    parse_csv: (text: string) => text.split('\n').map(line => line.split(',')),
    parse_lines: (text: string) => text.split('\n'),
  });

  state.setGlobal('pygeo', {
    clean_polygon_2d: (points: [number, number][]) => points,
  });

  const math = {
    SIN: (n: number) => Math.sin(n * Math.PI / 180),
    COS: (n: number) => Math.cos(n * Math.PI / 180),
    TAN: (n: number) => Math.tan(n * Math.PI / 180),
    ATAN: (n: number) => Math.atan(n) * 180 / Math.PI,
    ASIN: (n: number) => Math.asin(n) * 180 / Math.PI,
    ACOS: (n: number) => Math.acos(n) * 180 / Math.PI,
    SQRT: Math.sqrt,
    ABS: Math.abs,
    FLOOR: Math.floor,
    CEIL: Math.ceil,
    ROUND: Math.round,
    LOG: Math.log,
    LOG10: Math.log10,
    EXP: Math.exp,
    RAD: (n: number) => n * Math.PI / 180,
    DEG: (n: number) => n * 180 / Math.PI,
    PI: Math.PI,
    ATAN2: (y: number, x: number) => Math.atan2(y, x) * 180 / Math.PI,
    POW: Math.pow,
  };
  for (const [name, fn] of Object.entries(math)) {
    state.setGlobal(name, fn);
  }

  return state;
}

function makeControlProxy(dialogId: string, controlId: string) {
  return {
    set_on_change_handler: (handler: (value: unknown) => void) => {
      pendingDialogCallbacks.set(`change:${dialogId}:${controlId}`, handler);
    },
    set_on_click_handler: (handler: () => void) => {
      pendingDialogCallbacks.set(`click:${dialogId}:${controlId}`, handler);
    },
  };
}

function broadcastLog(level: LogMessage['level'], message: string) {
  const msg = createMessage<LogMessage>('log', { level, message });
  clients.forEach(ws => {
    try {
      if (ws.readyState === WebSocket.OPEN) {
        console.log(msg)
        ws.send(JSON.stringify(msg));
      }
    } catch (e) {
      console.error('Broadcast error:', e);
    }
  });
}

function broadcastRender(action: RenderMessage['action'], elementType: RenderMessage['elementType'], data: Record<string, unknown>) {
  const msg = createMessage<RenderMessage>('render', { action, elementType, data });
  clients.forEach(ws => {
    try {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
      }
    } catch (e) {
      console.error('Broadcast error:', e);
    }
  });
}

function broadcastUICreate(dialogId: string, controls: UICreateMessage['controls']) {
  const msg = createMessage<UICreateMessage>('ui_create', { dialogId, controls });
  clients.forEach(ws => {
    try {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
      }
    } catch (e) {
      console.error('Broadcast error:', e);
    }
  });
}

function handleExecute(clientId: string, code: string) {
  if (!L) {
    L = initLuaVM();
    broadcastLog('info', 'Lua VM initialized');
  }

  try {
    const wrappedCode = `
${code}
if main and type(main) == "function" then
  main()
end
`;
    console.log('Wrapped code:', wrappedCode);
    L.execute(wrappedCode);
    console.log('Execute completed successfully');
    const msg = createMessage<ServerMessage>('result', { success: true } as any);
    const client = clients.get(clientId);
    if (client && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(msg));
    }
  } catch (err) {
    console.log('Lua error:', err);
    const msg = createMessage<ServerMessage>('error', { message: err instanceof Error ? err.message : String(err) } as any);
    const client = clients.get(clientId);
    if (client && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(msg));
    }
  }
}

export function startServer() {
  const wss = new WebSocketServer({ port: PORT });

  wss.on('connection', (ws) => {
    const clientId = randomUUID();
    clients.set(clientId, ws);

    console.log('Client connected:', clientId);

    if (!L) {
      L = initLuaVM();
      console.log('Lua VM initialized');
    }

    ws.on('message', (data) => {
      try {
        const str = Buffer.isBuffer(data) ? data.toString() : String(data);
        console.log('Received:', str.substring(0, 100));
        const message = JSON.parse(str) as ClientMessage;

        switch (message.type) {
          case 'execute':
            handleExecute(clientId, (message as any).code);
            break;
          case 'ui_event':
            const key = `${message.eventType}:${message.dialogId}:${message.controlId}`;
            const callback = pendingDialogCallbacks.get(key);
            if (callback) {
              callback(message.value);
            }
            break;
        }
      } catch (err) {
        console.error('Message error:', err);
        const errorMsg = createMessage<ServerMessage>('error', { message: err instanceof Error ? err.message : String(err) } as any);
        ws.send(JSON.stringify(errorMsg));
      }
    });

    ws.on('close', () => {
      clients.delete(clientId);
      console.log('Client disconnected:', clientId);
    });

    ws.on('error', (err) => {
      console.error('WebSocket error:', err);
    });
  });

  console.log(`Pytha WebSocket server running on ws://localhost:${PORT}`);
  return wss;
}

if (process.env.NODE_ENV !== 'test') {
  startServer();
}
