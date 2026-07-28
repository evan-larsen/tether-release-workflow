function toUtf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

export function isAuthorized(
  provided: string | null,
  expected?: string,
): boolean {
  if (!provided || !expected) return false;

  const actualBytes = toUtf8(provided);
  const expectedBytes = toUtf8(expected);
  const length = Math.max(actualBytes.length, expectedBytes.length);
  let difference = actualBytes.length ^ expectedBytes.length;

  for (let index = 0; index < length; index += 1) {
    difference |= (actualBytes[index] ?? 0) ^ (expectedBytes[index] ?? 0);
  }

  return difference === 0;
}
