import { randomUUID } from 'crypto';
import * as fengari from 'fengari';
import type { UICreateMessage } from '@/shared/protocol.js';
import type { ApiContext } from '@/runtime/runtime-types.js';
import { luaValueToJs, pushValue } from '@/runtime/lua-utils.js';

const { lua, lauxlib, to_jsstring } = fengari;

interface HandlerRef {
  changeRef: number | null;
  clickRef: number | null;
  value?: unknown;
}

export function registerPyuiApi(context: ApiContext): void {
  const { L, state, emitLog, emitUICreate, pendingDialogCallbacks, controlRefs } = context;

  state.setGlobal('pyui', {
    alert: () => {
      const msg = getString(L, 1);
      console.log('[Server pyui.alert]', msg);
      emitLog('info', `[PYUI] ${msg}`);
      return 0;
    },
    wait: () => {
      return 0;
    },
    format_length: () => {
      const value = lua.lua_tonumber(L, 1) ?? 0;
      pushValue(L, `${value.toFixed(2)} mm`);
      return 1;
    },
    parse_length: () => {
      const text = getString(L, 1);
      const match = text.match(/^([\d.]+)/);
      pushValue(L, match ? parseFloat(match[1]) : undefined);
      return 1;
    },
    format_number: () => {
      const value = lua.lua_tonumber(L, 1);
      pushValue(L, String(value));
      return 1;
    },
    parse_number: () => {
      const text = getString(L, 1);
      const n = parseFloat(text);
      pushValue(L, isNaN(n) ? undefined : n);
      return 1;
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
        set_window_title: () => {
          return 0;
        },
        create_label: () => {
          const argStart = getMethodArgStart(L, 'create_label');
          const position = getPosition(L, argStart);
          const text = getString(L, argStart + 1);
          const id = randomUUID();
          controls.push({ id, type: 'label', label: text, position });
          pushValue(L, makeControlProxy(L, dialogId, id, pendingDialogCallbacks, controlRefs));
          return 1;
        },
        create_text_box: () => {
          const argStart = getMethodArgStart(L, 'create_text_box');
          const position = getPosition(L, argStart);
          const val = getString(L, argStart + 1);
          const id = randomUUID();
          controls.push({ id, type: 'text_box', label: val, value: val, position });
          pushValue(L, makeControlProxy(L, dialogId, id, pendingDialogCallbacks, controlRefs, val));
          return 1;
        },
        create_button: () => {
          const argStart = getMethodArgStart(L, 'create_button');
          const position = getPosition(L, argStart);
          const label = getString(L, argStart + 1);
          const id = randomUUID();
          controls.push({ id, type: 'button', label, position });
          pushValue(L, makeControlProxy(L, dialogId, id, pendingDialogCallbacks, controlRefs));
          return 1;
        },
        create_check_box: () => {
          const argStart = getMethodArgStart(L, 'create_check_box');
          const position = getPosition(L, argStart);
          const label = getString(L, argStart + 1);
          const id = randomUUID();
          controls.push({ id, type: 'check_box', label, position });
          pushValue(L, makeControlProxy(L, dialogId, id, pendingDialogCallbacks, controlRefs, false));
          return 1;
        },
        create_combo_box: () => {
          const argStart = getMethodArgStart(L, 'create_combo_box');
          const position = getPosition(L, argStart);
          const items = getStringArray(L, argStart + 1);
          const id = randomUUID();
          controls.push({ id, type: 'combo_box', items, position });
          pushValue(L, makeControlProxy(L, dialogId, id, pendingDialogCallbacks, controlRefs, items[0]));
          return 1;
        },
        create_list_box: () => {
          const argStart = getMethodArgStart(L, 'create_list_box');
          const position = getPosition(L, argStart);
          const items = getStringArray(L, argStart + 1);
          const id = randomUUID();
          controls.push({ id, type: 'list_box', items, position });
          pushValue(L, makeControlProxy(L, dialogId, id, pendingDialogCallbacks, controlRefs, items[0]));
          return 1;
        },
        create_ok_button: () => {
          const argStart = getMethodArgStart(L, 'create_ok_button');
          const position = getPosition(L, argStart);
          const id = randomUUID();
          controls.push({ id, type: 'button', label: 'OK', position });
          pushValue(L, makeControlProxy(L, dialogId, id, pendingDialogCallbacks, controlRefs));
          return 1;
        },
        create_cancel_button: () => {
          const argStart = getMethodArgStart(L, 'create_cancel_button');
          const position = getPosition(L, argStart);
          const id = randomUUID();
          controls.push({ id, type: 'button', label: 'Cancel', position });
          pushValue(L, makeControlProxy(L, dialogId, id, pendingDialogCallbacks, controlRefs));
          return 1;
        },
        create_align: () => {
          return 0;
        },
        equalize_column_widths: () => {
          return 0;
        },
        delete_control: () => {
          const argStart = getMethodArgStart(L, 'delete_control');
          deleteControl(L, dialogId, getString(L, argStart), pendingDialogCallbacks, controlRefs);
          return 0;
        },
        delete_dialog: () => {
          deleteDialog(L, dialogId, controls, pendingDialogCallbacks, controlRefs);
          return 0;
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
      const dataIdx = 1;
      lua.lua_pushvalue(L, dataIdx);
      const data = luaValueToJs(L, -1);
      lua.lua_pop(L, 1);
      console.log('[Server pyui.end_modal_cancel] data:', JSON.stringify(data));
      return 0;
    },
  });
}

function getMethodArgStart(L: any, methodName: string): number {
  return tableHasField(L, 1, methodName) ? 2 : 1;
}

function tableHasField(L: any, idx: number, field: string): boolean {
  if (!lua.lua_istable(L, idx)) return false;

  const absIdx = lua.lua_absindex(L, idx);
  lua.lua_getfield(L, absIdx, fengari.to_luastring(field));
  const hasField = lua.lua_type(L, -1) !== lua.LUA_TNIL;
  lua.lua_pop(L, 1);
  return hasField;
}

function getString(L: any, idx: number, fallback = ''): string {
  const value = lua.lua_tostring(L, idx);
  return value ? to_jsstring(value) : fallback;
}

function getPosition(L: any, idx: number): [number, number] {
  const value = luaValueToJs(L, idx);
  if (!Array.isArray(value)) return [0, 0];
  return [Number(value[0] ?? 0), Number(value[1] ?? 0)];
}

function getStringArray(L: any, idx: number): string[] {
  const value = luaValueToJs(L, idx);
  if (!Array.isArray(value)) return [];
  return value.map(item => String(item));
}

function makeControlProxy(
  L: any,
  dialogId: string,
  controlId: string,
  pendingDialogCallbacks: Map<string, number>,
  controlRefs: Map<string, HandlerRef>,
  initialValue?: unknown
) {
  const key = (type: 'change' | 'click') => `${type}:${dialogId}:${controlId}`;

  const controlRef: HandlerRef = { changeRef: null, clickRef: null, value: initialValue };
  controlRefs.set(`${dialogId}:${controlId}`, controlRef);

  return {
    set_on_change_handler: () => {
      setHandler(L, 'set_on_change_handler', 'change', key('change'), controlRef, pendingDialogCallbacks);
      return 0;
    },
    set_on_click_handler: () => {
      setHandler(L, 'set_on_click_handler', 'click', key('click'), controlRef, pendingDialogCallbacks);
      return 0;
    },
    get_value: () => {
      pushValue(L, controlRef.value);
      return 1;
    },
    set_value: () => {
      const argStart = getMethodArgStart(L, 'set_value');
      controlRef.value = luaValueToJs(L, argStart);
      return 0;
    },
    delete_control: () => {
      deleteControl(L, dialogId, controlId, pendingDialogCallbacks, controlRefs);
      return 0;
    },
  };
}

function setHandler(
  L: any,
  methodName: string,
  eventType: 'change' | 'click',
  callbackKey: string,
  controlRef: HandlerRef,
  pendingDialogCallbacks: Map<string, number>
) {
  const handlerIdx = getMethodArgStart(L, methodName);
  if (!lua.lua_isfunction(L, handlerIdx)) return;

  const refKey = eventType === 'change' ? 'changeRef' : 'clickRef';
  if (controlRef[refKey] !== null) {
    lauxlib.luaL_unref(L, lua.LUA_REGISTRYINDEX, controlRef[refKey]);
  }

  lua.lua_pushvalue(L, handlerIdx);
  const ref = lauxlib.luaL_ref(L, lua.LUA_REGISTRYINDEX);
  pendingDialogCallbacks.set(callbackKey, ref);
  controlRef[refKey] = ref;
}

export function deleteControl(
  L: any,
  dialogId: string,
  controlId: string,
  pendingDialogCallbacks: Map<string, number>,
  controlRefs: Map<string, HandlerRef>
) {
  const key = `${dialogId}:${controlId}`;
  const ref = controlRefs.get(key);
  if (ref) {
    if (ref.changeRef !== null) {
      lauxlib.luaL_unref(L, lua.LUA_REGISTRYINDEX, ref.changeRef);
      pendingDialogCallbacks.delete(`change:${dialogId}:${controlId}`);
    }
    if (ref.clickRef !== null) {
      lauxlib.luaL_unref(L, lua.LUA_REGISTRYINDEX, ref.clickRef);
      pendingDialogCallbacks.delete(`click:${dialogId}:${controlId}`);
    }
    controlRefs.delete(key);
  }
}

export function deleteDialog(
  L: any,
  dialogId: string,
  controls: Array<{ id: string }>,
  pendingDialogCallbacks: Map<string, number>,
  controlRefs: Map<string, HandlerRef>
) {
  for (const control of controls) {
    deleteControl(L, dialogId, control.id, pendingDialogCallbacks, controlRefs);
  }
}

export function clearDialogRefs(
  L: any,
  pendingDialogCallbacks: Map<string, number>,
  controlRefs: Map<string, HandlerRef>
) {
  for (const ref of controlRefs.values()) {
    if (ref.changeRef !== null) {
      lauxlib.luaL_unref(L, lua.LUA_REGISTRYINDEX, ref.changeRef);
    }
    if (ref.clickRef !== null) {
      lauxlib.luaL_unref(L, lua.LUA_REGISTRYINDEX, ref.clickRef);
    }
  }
  controlRefs.clear();
  pendingDialogCallbacks.clear();
}

export function invokeHandler(
  L: any,
  pendingDialogCallbacks: Map<string, number>,
  controlRefs: Map<string, HandlerRef>,
  eventType: 'change' | 'click',
  dialogId: string,
  controlId: string,
  value: unknown
): boolean {
  const key = `${eventType}:${dialogId}:${controlId}`;
  const ref = pendingDialogCallbacks.get(key);
  const controlRef = controlRefs.get(`${dialogId}:${controlId}`);
  if (controlRef && eventType === 'change') {
    controlRef.value = value;
  }
  if (ref === undefined || ref === null) {
    return false;
  }

  lua.lua_rawgeti(L, lua.LUA_REGISTRYINDEX, ref);
  pushValue(L, value);
  const result = lua.lua_pcall(L, 1, 0, 0);
  if (result !== lua.LUA_OK) {
    console.error('[Server] Handler error:', to_jsstring(lua.lua_tostring(L, -1)));
    lua.lua_pop(L, 1);
    return false;
  }
  return true;
}
