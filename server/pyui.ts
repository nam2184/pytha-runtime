import { randomUUID } from 'crypto';
import * as fengari from 'fengari';
import type { UICreateMessage } from './protocol.js';
import type { ApiContext } from './runtime-types.js';
import { luaValueToJs, pushValue } from './lua-utils.js';

const { lua, to_jsstring } = fengari;

export function registerPyuiApi(context: ApiContext): void {
  const { L, state, emitLog, emitUICreate, pendingDialogCallbacks } = context;

  state.setGlobal('pyui', {
    alert: () => {
      const msg = to_jsstring(lua.lua_tostring(L, 1));
      console.log('[Server pyui.alert]', msg);
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
        set_window_title: (_title: string) => {
        },
        create_label: (position: [number, number], text: string) => {
          const id = randomUUID();
          controls.push({ id, type: 'label', label: text, position });
          return makeControlProxy(dialogId, id, pendingDialogCallbacks);
        },
        create_text_box: (position: [number, number], val: string) => {
          const id = randomUUID();
          controls.push({ id, type: 'text_box', label: val, value: val, position });
          return makeControlProxy(dialogId, id, pendingDialogCallbacks);
        },
        create_button: (position: [number, number], label: string) => {
          const id = randomUUID();
          controls.push({ id, type: 'button', label, position });
          return makeControlProxy(dialogId, id, pendingDialogCallbacks);
        },
        create_check_box: (position: [number, number], label: string) => {
          const id = randomUUID();
          controls.push({ id, type: 'check_box', label, position });
          return makeControlProxy(dialogId, id, pendingDialogCallbacks);
        },
        create_combo_box: (position: [number, number], items: string[]) => {
          const id = randomUUID();
          controls.push({ id, type: 'combo_box', items, position });
          return makeControlProxy(dialogId, id, pendingDialogCallbacks);
        },
        create_list_box: (position: [number, number], items: string[]) => {
          const id = randomUUID();
          controls.push({ id, type: 'list_box', items, position });
          return makeControlProxy(dialogId, id, pendingDialogCallbacks);
        },
        create_ok_button: (position: [number, number]) => {
          const id = randomUUID();
          controls.push({ id, type: 'button', label: 'OK', position });
          return makeControlProxy(dialogId, id, pendingDialogCallbacks);
        },
        create_cancel_button: (position: [number, number]) => {
          const id = randomUUID();
          controls.push({ id, type: 'button', label: 'Cancel', position });
          return makeControlProxy(dialogId, id, pendingDialogCallbacks);
        },
        create_align: (_columns: unknown[]) => {
        },
        equalize_column_widths: (_columns: unknown[]) => {
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
}

function makeControlProxy(dialogId: string, controlId: string, pendingDialogCallbacks: Map<string, (data: unknown) => void>) {
  return {
    set_on_change_handler: (handler: (value: unknown) => void) => {
      pendingDialogCallbacks.set(`change:${dialogId}:${controlId}`, handler);
    },
    set_on_click_handler: (handler: () => void) => {
      pendingDialogCallbacks.set(`click:${dialogId}:${controlId}`, handler);
    },
  };
}
