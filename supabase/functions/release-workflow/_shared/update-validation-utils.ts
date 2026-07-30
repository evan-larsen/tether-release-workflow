export function clone<T>(value: T): T {
  return structuredClone(value);
}

export function equal(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
