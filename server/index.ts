import 'dotenv/config';
import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'crypto';
import {
  createMessage,
  type ClientMessage,
  type ExecuteMessage,
  type ServerMessage,
  type RenderMessage,
  type UICreateMessage,
  type LogMessage,
} from './protocol.js';
import { luaValueToJs, pushValue } from './lua-utils.js';
import { registerMathApi } from './math-api.js';
import { registerPythaApi } from './pytha.js';
import { registerPygeoApi } from './pygeo.js';
import { registerPyioApi } from './pyio.js';
import { clearDialogRefs, invokeHandler, registerPyuiApi } from './pyui.js';
import type { ApiContext, LuaRuntimeOptions, LuaState } from './runtime-types.js';

export type { LuaRuntimeOptions, LuaState } from './runtime-types.js';

const PORT = Number(process.env.WS_PORT ?? 8080);

let L: LuaState | null = null;
let rawLuaState: any | null = null;
let wss: WebSocketServer | null = null;

import * as fengari from 'fengari';
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;

const clients = new Map<string, WebSocket>();

const pendingDialogCallbacks = new Map<string, number>();
const controlRefs = new Map<string, { changeRef: number | null; clickRef: number | null; value?: unknown }>();

export function initLuaVM(options: LuaRuntimeOptions = {}): LuaState {
  const L = lauxlib.luaL_newstate();
  rawLuaState = L;
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
    const msg = args.map(a => String(a)).join(' ');
    try {
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

  const apiContext: ApiContext = {
    L,
    state,
    emitRender,
    emitLog,
    emitUICreate,
    emitPythaCall,
    pendingDialogCallbacks,
    controlRefs,
  };

  registerPythaApi(apiContext);
  registerPyuiApi(apiContext);
  registerPyioApi(apiContext);
  registerPygeoApi(apiContext);
  registerMathApi(state);

  return state;
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

function sendToClient(clientId: string, msg: ServerMessage) {
  const client = clients.get(clientId);
  if (client && client.readyState === WebSocket.OPEN) {
    client.send(JSON.stringify(msg));
  }
}

function sendClientLog(clientId: string, level: LogMessage['level'], message: string) {
  sendToClient(clientId, createMessage<LogMessage>('log', { level, message }));
}

function clearPendingDialogs() {
  if (!rawLuaState) {
    pendingDialogCallbacks.clear();
    controlRefs.clear();
    return;
  }

  clearDialogRefs(rawLuaState, pendingDialogCallbacks, controlRefs);
}

function executeLuaChunk(code: string): void {
  const wrappedCode = `
${code}
if main and type(main) == "function" then
  main()
end
`;
  L!.execute(wrappedCode);
}

function handleExecute(clientId: string, files?: Array<{ name: string; content: string }>, code?: string) {
  console.log('[Server handleExecute] called');

  sendClientLog(clientId, 'debug', '[Server] Execute received');

  if (!L) {
    console.log('[Server handleExecute] creating new Lua VM');
    L = initLuaVM();
  }

  try {
    clearPendingDialogs();

    if (files && files.length > 0) {
      const otherFiles = files.filter(f => f.name !== 'main.lua').sort((a, b) => a.name.localeCompare(b.name));
      const mainFile = files.find(f => f.name === 'main.lua');

      for (const file of otherFiles) {
        console.log('[Server] Loading file:', file.name);
        const escapedContent = JSON.stringify(file.content);
        const loadCode = `local chunk, err = load(${escapedContent}) if not chunk then error(err or "load error") end chunk()`;
        L!.execute(loadCode);
      }

      if (mainFile) {
        console.log('[Server] Executing main.lua');
        executeLuaChunk(mainFile.content);
      }
    } else if (code) {
      console.log('[Server handleExecute] executing single file code');
      executeLuaChunk(code);
    }

    console.log('[Server handleExecute] execute completed');
    const msg = createMessage<ServerMessage>('result', { success: true } as any);
    sendToClient(clientId, msg);
  } catch (err) {
    console.log('Lua error:', err);
    const msg = createMessage<ServerMessage>('error', { message: err instanceof Error ? err.message : String(err) } as any);
    sendToClient(clientId, msg);
  }
}

export function startServer() {
  closeServer();
  wss = new WebSocketServer({ port: PORT });
  (globalThis as Record<string, unknown>).__pythaWss = wss;

  wss.on('connection', (ws) => {
    const clientId = randomUUID();
    clients.set(clientId, ws);

    console.log('[Server] client connected:', clientId);
    console.log('Lua VM running, ready for code');

    if (!L) {
      L = initLuaVM();
      console.log('Lua VM initialized');
    }

    ws.on('message', (data) => {
      console.log('[Server] message received');
      try {
        const str = Buffer.isBuffer(data) ? data.toString() : String(data);
        console.log('[Server] data:', str.substring(0, 100));
        const message = JSON.parse(str) as ClientMessage;

        switch (message.type) {
          case 'execute':
            console.log('[Server] matched execute case, message.type =', message.type);
            console.log('[Server] calling handleExecute now');
            const execMsg = message as ExecuteMessage;
            handleExecute(clientId, execMsg.files, execMsg.code);
            break;
          case 'ui_event':
            if (rawLuaState) {
              invokeHandler(rawLuaState, pendingDialogCallbacks, controlRefs, message.eventType, message.dialogId, message.controlId, message.value);
            }
            break;
          case 'ui_close':
            clearPendingDialogs();
            break;
          case 'ping':
            ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
            break;
          default:
            sendClientLog(clientId, 'error', `[Server] Unsupported message type: ${(message as any).type}`);
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

  wss.on('listening', () => {
    console.log(`Pytha WebSocket server running on ws://localhost:${PORT}`);
  });

  wss.on('error', (err) => {
    console.error('[Server] WebSocket server error:', err);
  });

  return wss;
}

export function closeServer() {
  if (wss) {
    wss.close();
    wss = null;
    (globalThis as Record<string, unknown>).__pythaWss = null;
  }
}

console.log('[Server] NODE_ENV:', process.env.WS_PORT);

if (process.env.NODE_ENV !== 'test') {
  console.log('[Server] Starting server (NODE_ENV is not test)');
  startServer();
} else {
  console.log('[Server] Skipping server start (NODE_ENV is test)');
}
