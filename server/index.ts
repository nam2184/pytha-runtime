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

interface LuaState {
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

let L: LuaState | null = null;

import * as fengari from 'fengari';
const { lua, lauxlib, lualib, to_luastring, to_jsstring, tojs } = fengari;

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

const clients = new Map<string, WebSocket>();

const pendingDialogCallbacks = new Map<string, (data: unknown) => void>();

function initLuaVM(): LuaState {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);

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
      const val = tojs(L, idx);
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
      broadcastLog('debug', `[Lua] ${msg}`);
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
    create_block: (length: number, width: number, height: number, origin?: [number, number, number], options?: Record<string, unknown>) => {
      const id = randomUUID();
      const handle = { _type: 'element', id, elementType: 'block', data: { length, width, height, origin, options } };
      broadcastRender('create', 'block', { handle, length, width, height, origin, options });
      return handle;
    },
    create_cylinder: (height: number, radius: number, origin?: [number, number, number], options?: Record<string, unknown>) => {
      const id = randomUUID();
      const handle = { _type: 'element', id, elementType: 'cylinder', data: { height, radius, origin, options } };
      broadcastRender('create', 'cylinder', { handle, height, radius, origin, options });
      return handle;
    },
    create_sphere: (radius: number, origin?: [number, number, number], options?: Record<string, unknown>) => {
      const id = randomUUID();
      const handle = { _type: 'element', id, elementType: 'sphere', data: { radius, origin, options } };
      broadcastRender('create', 'sphere', { handle, radius, origin, options });
      return handle;
    },
    create_polygon: (points: [number, number][]) => {
      const id = randomUUID();
      const handle = { _type: 'element', id, elementType: 'polygon', data: { points } };
      broadcastRender('create', 'polygon', { handle, points });
      return handle;
    },
    create_polyline: (closed: boolean, points: [number, number][]) => {
      const id = randomUUID();
      const handle = { _type: 'element', id, elementType: 'polyline', data: { closed, points } };
      broadcastRender('create', 'polyline', { handle, closed, points });
      return handle;
    },
    create_group: (elements: unknown[], options?: { name?: string }) => {
      const id = randomUUID();
      const handle = { _type: 'element', id, elementType: 'group', data: { elements, options } };
      broadcastRender('create', 'group', { handle, elements, options });
      return handle;
    },
    delete_element: (element: { id: string }) => {
      broadcastRender('delete', 'block', { handle: element });
    },
    copy_element: (element: { id: string }, offset: [number, number, number]) => {
      const id = randomUUID();
      const handle = { _type: 'element', id, elementType: (element as { elementType?: string }).elementType || 'block', data: { element, offset } };
      broadcastRender('create', 'block', { handle, offset });
      return handle;
    },
    move_element: (element: { id: string }, offset: [number, number, number]) => {
      broadcastRender('update', 'block', { handle: element, offset });
    },
    rotate_element: (element: { id: string }, origin: [number, number, number], axis: string, angle: number) => {
      broadcastRender('update', 'block', { handle: element, origin, axis, angle });
    },
    mirror_element: (element: { id: string }, origin: [number, number, number], axis: string) => {
      broadcastRender('update', 'block', { handle: element, origin, axis });
    },
    set_element_name: (element: { id: string }, name: string) => {
      broadcastRender('update', 'block', { handle: element, name });
    },
    set_element_pen: (element: { id: string }, penIndex: number) => {
      broadcastRender('update', 'block', { handle: element, penIndex });
    },
    set_element_material: (element: { id: string }, material: unknown) => {
      broadcastRender('update', 'block', { handle: element, material });
    },
    set_element_layer: (element: { id: string }, layer: unknown) => {
      broadcastRender('update', 'block', { handle: element, layer });
    },
    set_element_group: (element: { id: string }, group: unknown) => {
      broadcastRender('update', 'block', { handle: element, group });
    },
    set_element_history: (element: { id: string }, data: unknown, key: string) => {
    },
    get_element_history: (element: { id: string }, key: string) => {
      return undefined;
    },
    get_group_descendants: (group: { children?: unknown[] }) => {
      return group.children || [];
    },
    boole_part_union: (elements: unknown[]) => {
      return elements[0];
    },
    get_length_unit: () => 1.0,
  });

  state.setGlobal('pyui', {
    alert: (message: string) => {
      broadcastLog('info', `[PYUI] ${message}`);
    },
    wait: (milliseconds: number) => {
      return new Promise(resolve => setTimeout(resolve, milliseconds));
    },
    format_length: (value: number) => `${value.toFixed(2)} mm`,
    parse_length: (text: string) => {
      const match = text.match(/^([\d.]+)/);
      return match ? parseFloat(match[1]) : undefined;
    },
    format_number: (value: number) => String(value),
    parse_number: (text: string) => {
      const n = parseFloat(text);
      return isNaN(n) ? undefined : n;
    },
    run_modal_dialog: (initFunc: (dialog: unknown, data: unknown) => void, data: unknown) => {
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

      initFunc(dialogProxy, data);
      broadcastUICreate(dialogId, controls);
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
    console.log('Executing Lua code, length:', code.length);
    console.log('Code:', code);
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
