import type { ApiContext } from '@/runtime/runtime-types.js';

export function registerPygeoApi({ state }: ApiContext): void {
  state.setGlobal('pygeo', {
    clean_polygon_2d: (points: [number, number][]) => points,
  });
}
