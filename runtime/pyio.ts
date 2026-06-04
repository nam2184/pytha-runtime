import type { ApiContext } from '@/runtime/runtime-types.js';

export function registerPyioApi({ state }: ApiContext): void {
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
}
