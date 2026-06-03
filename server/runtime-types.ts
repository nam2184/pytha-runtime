import type { LogMessage, RenderMessage, UICreateMessage } from './protocol.js';

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

export interface ElementHandle {
  _type: 'element';
  id: string;
  elementType: RenderMessage['elementType'];
}

export interface ApiContext {
  L: any;
  state: LuaState;
  emitRender: NonNullable<LuaRuntimeOptions['onRender']>;
  emitLog: NonNullable<LuaRuntimeOptions['onLog']>;
  emitUICreate: NonNullable<LuaRuntimeOptions['onUICreate']>;
  emitPythaCall: NonNullable<LuaRuntimeOptions['onPythaCall']>;
  pendingDialogCallbacks: Map<string, (data: unknown) => void>;
}
