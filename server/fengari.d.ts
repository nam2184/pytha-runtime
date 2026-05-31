declare module 'fengari' {
  export const lua: {
    lua_gettop: (L: any) => number;
    lua_settop: (L: any, idx: number) => void;
    lua_pushstring: (L: any, s: any) => void;
    lua_pushnumber: (L: any, n: number) => void;
    lua_pushnil: (L: any) => void;
    lua_pushboolean: (L: any, b: number) => void;
    lua_getglobal: (L: any, name: any) => void;
    lua_setglobal: (L: any, name: any) => void;
    lua_getfield: (L: any, idx: number, k: any) => void;
    lua_setfield: (L: any, idx: number, k: any) => void;
    lua_createtable: (L: any, narr: number, nrec: number) => void;
    lua_settable: (L: any, idx: number) => void;
    lua_rawget: (L: any, idx: number) => void;
    lua_rawset: (L: any, idx: number) => void;
    lua_rawseti: (L: any, idx: number, n: number) => void;
    lua_objlen: (L: any, idx: number) => number;
    lua_tostring: (L: any, idx: number) => any;
    lua_tonumber: (L: any, idx: number) => number | null;
    lua_isstring: (L: any, idx: number) => boolean;
    lua_isnumber: (L: any, idx: number) => boolean;
    lua_istable: (L: any, idx: number) => boolean;
    lua_isfunction: (L: any, idx: number) => boolean;
    lua_isnoneornil: (L: any, idx: number) => boolean;
    lua_pop: (L: any, n: number) => void;
    lua_call: (L: any, nargs: number, nresults: number) => void;
    lua_pcall: (L: any, nargs: number, nresults: number, errfunc: number) => number;
    lua_close: (L: any) => void;
    lua_pushjsclosure: (L: any, fn: any, n: number) => void;
    lua_pushjsfunction: (L: any, fn: any) => void;
    LUA_OK: number;
    LUA_YIELD: number;
    LUA_ERRRUN: number;
    LUA_ERRSYNTAX: number;
    LUA_ERRMEM: number;
    LUA_ERRERR: number;
  };

  export const lauxlib: {
    luaL_newstate: () => any;
    luaL_openlibs: (L: any) => void;
    luaL_dostring: (L: any, s: any) => number;
    luaL_tolstring: (L: any, idx: number) => any;
    luaL_checknumber: (L: any, idx: number) => number;
    luaL_checkstring: (L: any, idx: number) => string;
    luaL_checkinteger: (L: any, idx: number) => number;
    luaL_optnumber: (L: any, idx: number, def: number) => number;
  };

  export const lualib: {
    luaL_openlibs: (L: any) => void;
  };

  export function to_luastring(s: string): any;
  export function to_jsstring(s: any): string;
  export function tojs(L: any, idx: number): unknown;
  export function push(L: any, val: any): void;
}