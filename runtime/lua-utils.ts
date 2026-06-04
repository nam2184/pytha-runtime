import { randomUUID } from 'crypto';
import * as fengari from 'fengari';
import type { RenderMessage } from '@/shared/protocol.js';
import type { ElementHandle } from '@/runtime/runtime-types.js';

const { lua, to_luastring } = fengari;

export function pushValue(L: any, val: unknown): void {
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

export function luaValueToJs(L: any, idx: number): unknown {
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

export function createElementHandle(elementType: RenderMessage['elementType']): ElementHandle {
  return { _type: 'element', id: randomUUID(), elementType };
}

export function isElementHandle(value: unknown): value is ElementHandle {
  return Boolean(
    value &&
    typeof value === 'object' &&
    (value as ElementHandle)._type === 'element' &&
    typeof (value as ElementHandle).id === 'string'
  );
}

export function getElementHandles(value: unknown): ElementHandle[] {
  if (isElementHandle(value)) {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.filter(isElementHandle);
  }

  return [];
}
