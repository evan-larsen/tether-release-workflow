import { hasExactKeys, isNative } from './state-validation-primitives.ts';

const PLATFORMS = ['ios', 'android'] as const;

function isResetProgress(value: unknown): boolean {
  return (
    hasExactKeys(value, PLATFORMS) &&
    PLATFORMS.every((platform) =>
      ['pending', 'clearing', 'cleared_and_verified'].includes(
        String((value as Record<string, unknown>)[platform]),
      ),
    )
  );
}

export function isStagingLane(value: unknown): boolean {
  const lane = value as Record<string, unknown>;
  const legacy = hasExactKeys(value, ['activeNative', 'resetTargetNative']);
  const reset = hasExactKeys(value, [
    'activeNative',
    'resetTargetNative',
    'resetProgress',
  ]);
  if (
    (!legacy && !reset) ||
    (lane.activeNative !== null && !isNative(lane.activeNative)) ||
    (lane.resetTargetNative !== null && !isNative(lane.resetTargetNative))
  )
    return false;
  return lane.resetTargetNative === null
    ? !reset
    : lane.activeNative !== null &&
        lane.activeNative !== lane.resetTargetNative &&
        (!reset || isResetProgress(lane.resetProgress));
}

export function isStagingLaneTarget(
  state: Record<string, unknown>,
  releases: Array<Record<string, unknown>>,
  native: unknown,
): boolean {
  return (
    native === state.currentNative ||
    releases.some(
      (release) =>
        release.releaseType === 'store' &&
        release.status === 'in_progress' &&
        release.nativeFloorVersion !== null &&
        release.native === native,
    )
  );
}
