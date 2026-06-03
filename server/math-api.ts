import type { LuaState } from './runtime-types.js';

export function registerMathApi(state: LuaState): void {
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
}
