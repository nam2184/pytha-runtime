declare module 'fengari' {
  export const lua: Lua;
  export const lauxlib: LAuxLib;
  export const lualib: LuaLib;
  export const to_luastring: (str: string) => Uint8Array;
  export const to_jsstring: (luastr: Uint8Array) => string;

  export interface lua_State {}

  export interface Lua {
    LUA_GLOBALSINDEX: number;
    LUA_OK: number;
    LUA_YIELD: number;
    LUA_ERRRUN: number;
    LUA_ERRSYNTAX: number;
    LUA_ERRMEM: number;
    LUA_ERRERR: number;

    lua_createtable(L: lua_State, narr?: number, nrec?: number): void;
    lua_settable(L: lua_State, idx: number): void;
    lua_setglobal(L: lua_State, name: Uint8Array): void;
    lua_gettable(L: lua_State, idx: number): void;
    lua_getglobal(L: lua_State, name: Uint8Array): void;
    lua_pop(L: lua_State, n: number): void;
    lua_pushstring(L: lua_State, str: Uint8Array): void;
    lua_pushnumber(L: lua_State, n: number): void;
    lua_pushinteger(L: lua_State, n: number): void;
    lua_pushnil(L: lua_State): void;
    lua_pushjsfunction(L: lua_State, fn: (L: lua_State) => number | void, n?: number): void;
    lua_pushjsclosure(L: lua_State, fn: (L: lua_State) => number | void, n: number): void;
    lua_tostring(L: lua_State, idx: number): Uint8Array | null;
    lua_tonumber(L: lua_State, idx: number): number;
    lua_tointeger(L: lua_State, idx: number): number;
    lua_toboolean(L: lua_State, idx: number): number;
    lua_isstring(L: lua_State, idx: number): number;
    lua_isnumber(L: lua_State, idx: number): number;
    lua_istable(L: lua_State, idx: number): boolean;
    lua_isnoneornil(L: lua_State, idx: number): boolean;
    lua_isfunction(L: lua_State, idx: number): boolean;
    lua_gettop(L: lua_State): number;
    lua_settop(L: lua_State, idx: number): void;
    lua_call(L: lua_State, nargs: number, nresults: number): void;
    lua_pcall(L: lua_State, nargs: number, nresults: number, msgh: number): number;
    lua_close(L: lua_State): void;
    lua_newstate(): lua_State;
  }

  export interface LAuxLib {
    luaL_newstate(): lua_State;
    luaL_openlibs(L: lua_State): void;
    luaL_dostring(L: lua_State, str: Uint8Array): number;
    luaL_tolstring(L: lua_State, idx: number): Uint8Array | null;
    luaL_requiref(L: lua_State, modname: Uint8Array, openf: (L: lua_State) => void, glb: number): void;
  }

  export interface LuaLib {
    luaL_openlibs(L: lua_State): void;
  }
}

declare module 'fengari-interop' {
  import type { lua_State } from 'fengari';

  export function tojs<T = unknown>(L: lua_State, idx: number): T;
  export function push(L: lua_State, value: unknown): void;
  export function luaopen_js(L: lua_State): void;
}

declare module 'luaparse' {
  export interface Node {
    type: string;
    [key: string]: unknown;
  }

  export interface Chunk extends Node {
    body: Statement[];
    globals?: Identifier[];
  }

  export interface Statement extends Node {}
  export interface Expression extends Node {}

  export interface Identifier extends Node {
    name: string;
  }

  export interface FunctionDeclaration extends Statement {
    identifier: Identifier;
    parameters: Identifier[];
    body: { body: Statement[] };
    isLocal: boolean;
  }

  export interface LocalStatement extends Statement {
    variables: Identifier[];
    init: Expression[];
  }

  export interface AssignmentStatement extends Statement {
    variables: Expression[];
    init: Expression[];
  }

  export interface CallExpression extends Expression {
    callee: Expression;
    arguments: Expression[];
  }

  export interface TableConstructorExpression extends Expression {
    fields: Field[];
  }

  export interface Field extends Node {
    key?: Expression;
    value: Expression;
    type: 'TableKey' | 'TableValue' | 'TableKeyString';
  }

  export interface NumericLiteral extends Expression {
    value: number;
  }

  export interface StringLiteral extends Expression {
    value: string;
  }

  export interface BooleanLiteral extends Expression {
    value: boolean;
  }

  export interface NilLiteral extends Expression {}

  export interface BinaryExpression extends Expression {
    operator: string;
    left: Expression;
    right: Expression;
  }

  export interface UnaryExpression extends Expression {
    operator: string;
    argument: Expression;
  }

  export interface IfStatement extends Statement {
    clauses: IfClause[];
  }

  export interface IfClause {
    condition: Expression;
    body: Statement[];
  }

  export interface WhileStatement extends Statement {
    condition: Expression;
    body: Statement[];
  }

  export interface ForStatement extends Statement {
    variable: Identifier;
    start: Expression;
    limit: Expression;
    step?: Expression;
    body: Statement[];
    type: 'ForNumericStatement' | 'ForGenericStatement';
    iterators?: Expression[];
  }

  export interface RepeatStatement extends Statement {
    condition: Expression;
    body: Statement[];
  }

  export interface ReturnStatement extends Statement {
    arguments: Expression[];
  }

  export interface BreakStatement extends Statement {}

  export interface MemberExpression extends Expression {
    object: Expression;
    property: Identifier;
  }

  export interface IndexExpression extends Expression {
    object: Expression;
    index: Expression;
  }

  export interface FunctionExpression extends Expression {
    parameters: Identifier[];
    body: { body: Statement[] };
  }

  export function parse(code: string, options?: {
    luaVersion?: string;
    comments?: boolean;
    locations?: boolean;
    scope?: boolean;
    onError?: (err: Error) => void;
  }): Chunk;
}