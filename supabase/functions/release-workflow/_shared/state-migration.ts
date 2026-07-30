import type { ReleaseState } from './types.ts';

const EMPTY_V2: ReleaseState = {
  stateVersion: 2,
  currentNative: null,
  stagingLane: {
    activeNative: null,
    resetTargetNative: null,
  },
  releases: [],
};

export function isExactEmptyV1(value: unknown): boolean {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length !== 3
  )
    return false;
  const state = value as Record<string, unknown>;
  return (
    state.stateVersion === 1 &&
    state.currentNative === null &&
    Array.isArray(state.releases) &&
    state.releases.length === 0
  );
}

export function migrateEmptyV1ToV2(value: unknown): ReleaseState {
  if (!isExactEmptyV1(value)) {
    throw new Error('Unsupported v1 release state.');
  }
  const state = value as Record<string, unknown>;
  if (
    state.stateVersion !== 1 ||
    state.currentNative !== null ||
    !Array.isArray(state.releases) ||
    state.releases.length !== 0
  ) {
    throw new Error('Unsupported v1 release state.');
  }
  return structuredClone(EMPTY_V2);
}
