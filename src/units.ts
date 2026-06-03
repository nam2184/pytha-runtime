export const UNIT_SCALE = 0.1;

export function scaleValue(value: unknown) {
  return typeof value === 'number' ? value * UNIT_SCALE : 0;
}

export function scaleVector3(vector: [number, number, number] | undefined): [number, number, number] {
  return [
    (vector?.[0] ?? 0) * UNIT_SCALE,
    (vector?.[1] ?? 0) * UNIT_SCALE,
    (vector?.[2] ?? 0) * UNIT_SCALE,
  ];
}

export function scalePoint(point: number[]) {
  return [
    (point[0] ?? 0) * UNIT_SCALE,
    (point[1] ?? 0) * UNIT_SCALE,
    (point[2] ?? 0) * UNIT_SCALE,
  ] as [number, number, number];
}

export function scalePythaXYPoint(point: number[]) {
  return [
    (point[0] ?? 0) * UNIT_SCALE,
    (point[1] ?? 0) * UNIT_SCALE,
  ] as [number, number];
}
