import {
  isAdoptedBaseline,
  isPreBaselineWorkflowRecord,
} from './legacy-baseline-validation.ts';
import type { ReleaseState } from './types.ts';
import { equal } from './update-validation-utils.ts';

export function isLegacyBaselineAdoption(
  previous: ReleaseState,
  next: ReleaseState,
): boolean {
  if (
    previous.currentNative !== null ||
    previous.stagingLane.activeNative !== null ||
    previous.stagingLane.resetTargetNative !== null ||
    !equal(previous.stagingLane, next.stagingLane) ||
    next.releases.length !== previous.releases.length + 1
  )
    return false;
  const baseline = next.releases.at(-1);
  if (!baseline) return false;
  if (
    !isAdoptedBaseline(baseline) ||
    baseline.native !== 'native-1' ||
    next.currentNative !== baseline.native ||
    previous.releases.some(
      (release) => release.releaseType === 'adopted_baseline',
    ) ||
    !previous.releases.every(isPreBaselineWorkflowRecord)
  )
    return false;
  return previous.releases.every((release, index) =>
    equal(
      {
        ...release,
        status: 'superseded',
        supersededReason: 'pre_baseline_adoption',
      },
      next.releases[index],
    ),
  );
}
