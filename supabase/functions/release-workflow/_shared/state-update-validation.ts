import { getPreviewUpdateKind } from './preview-update-validation.ts';
import {
  getProductionUpdateKind,
  getReleaseUpdateKind,
  hasAllRegistered,
} from './production-update-validation.ts';
import { isExactEmptyV1 } from './state-migration.ts';
import { getNextNative, isReleaseState } from './state-validation.ts';
import type {
  ReleaseRecord,
  ReleaseState,
  StoreReleaseRecord,
} from './types.ts';
import { equal } from './update-validation-utils.ts';

function hasEmptyPlatforms(release: ReleaseRecord): boolean {
  return (['ios', 'android'] as const).every((platform) => {
    const record = release.platforms[platform];
    if (record.attempts.length !== 0) return false;
    return release.releaseType === 'store'
      ? record.ota === null
      : record.ota!.staging === null && record.ota!.production === null;
  });
}

function isInitialRelease(
  previous: ReleaseState,
  release: ReleaseRecord,
): boolean {
  if (release.status !== 'in_progress' || !hasEmptyPlatforms(release))
    return false;
  if (release.releaseType === 'ota')
    return (
      previous.currentNative !== null &&
      release.native === previous.currentNative
    );
  if (release.native === previous.currentNative)
    return (
      release.nativeFloorVersion === null &&
      release.preview === null &&
      release.productionCommit === null
    );
  return (
    release.native === getNextNative(previous.currentNative) &&
    release.nativeFloorVersion === release.version &&
    release.preview?.status === 'required' &&
    release.productionCommit === null
  );
}

function hasPublicProgress(release: StoreReleaseRecord): boolean {
  return (['ios', 'android'] as const).some((platform) =>
    release.platforms[platform].attempts.some(
      (attempt) =>
        attempt.base !== null || attempt.storeStatus?.status === 'live',
    ),
  );
}

function isAppendOrSupersession(
  previous: ReleaseState,
  next: ReleaseState,
): boolean {
  if (next.releases.length !== previous.releases.length + 1) return false;
  const appended = next.releases.at(-1)!;
  if (!isInitialRelease(previous, appended)) return false;
  const changed = previous.releases
    .map((release, index) =>
      equal(release, next.releases[index]) ? -1 : index,
    )
    .filter((index) => index >= 0);
  if (
    !changed.length &&
    previous.releases.some(
      (release) =>
        release.releaseType === 'store' &&
        release.status !== 'superseded' &&
        release.version === appended.version &&
        release.native === appended.native,
    )
  )
    return false;
  if (!changed.length)
    return equal({ ...next, releases: next.releases.slice(0, -1) }, previous);
  if (changed.length !== 1 || appended.releaseType !== 'store') return false;
  const index = changed[0];
  const oldRelease = previous.releases[index];
  const superseded = next.releases[index];
  if (
    oldRelease.releaseType !== 'store' ||
    superseded.releaseType !== 'store' ||
    oldRelease.status !== 'in_progress' ||
    superseded.status !== 'superseded' ||
    hasPublicProgress(oldRelease) ||
    oldRelease.version !== appended.version ||
    oldRelease.native !== appended.native ||
    oldRelease.preparation.treeHash === appended.preparation.treeHash
  )
    return false;
  return equal({ ...oldRelease, status: 'superseded' }, superseded);
}

function isStagingLaneUpdate(
  previous: ReleaseState,
  next: ReleaseState,
): boolean {
  if (
    !equal(previous.releases, next.releases) ||
    previous.currentNative !== next.currentNative
  )
    return false;
  const before = previous.stagingLane;
  const after = next.stagingLane;
  if (
    before.resetTargetNative === null &&
    after.resetTargetNative === getNextNative(previous.currentNative) &&
    before.activeNative === after.activeNative
  )
    return true;
  return (
    before.resetTargetNative !== null &&
    after.activeNative === before.resetTargetNative &&
    after.resetTargetNative === null &&
    previous.releases.some(
      (release) =>
        release.releaseType === 'store' &&
        release.status === 'in_progress' &&
        release.nativeFloorVersion !== null &&
        release.native === after.activeNative,
    )
  );
}

function getOnlyChangedRelease(
  previous: ReleaseState,
  next: ReleaseState,
): number | null {
  if (previous.releases.length !== next.releases.length) return null;
  const changed = previous.releases
    .map((release, index) =>
      equal(release, next.releases[index]) ? -1 : index,
    )
    .filter((index) => index >= 0);
  return changed.length === 1 ? changed[0] : null;
}

function isCurrentNativeCompletion(
  previous: ReleaseState,
  next: ReleaseState,
  index: number,
): boolean {
  const oldRelease = previous.releases[index];
  const newRelease = next.releases[index];
  if (oldRelease.releaseType !== 'store' || newRelease.releaseType !== 'store')
    return false;
  return (
    oldRelease.nativeFloorVersion !== null &&
    oldRelease.native === getNextNative(previous.currentNative) &&
    next.currentNative === oldRelease.native &&
    oldRelease.preview?.status === 'approved' &&
    oldRelease.productionCommit !== null &&
    newRelease.status === 'complete' &&
    hasAllRegistered(newRelease) &&
    getProductionUpdateKind(oldRelease, newRelease) ===
      'production_base_registered'
  );
}

export function validateReleaseStateUpdate(
  previous: unknown,
  next: unknown,
): next is ReleaseState {
  if (isExactEmptyV1(previous))
    return (
      isReleaseState(next) &&
      next.currentNative === null &&
      next.releases.length === 0 &&
      next.stagingLane.activeNative === null &&
      next.stagingLane.resetTargetNative === null
    );
  if (
    !isReleaseState(previous) ||
    !isReleaseState(next) ||
    equal(previous, next)
  )
    return false;
  if (isAppendOrSupersession(previous, next)) return true;
  if (isStagingLaneUpdate(previous, next)) return true;
  const index = getOnlyChangedRelease(previous, next);
  if (index === null || !equal(previous.stagingLane, next.stagingLane))
    return false;
  if (previous.currentNative !== next.currentNative)
    return isCurrentNativeCompletion(previous, next, index);

  const oldRelease = previous.releases[index];
  const newRelease = next.releases[index];
  if (
    oldRelease.releaseType === 'store' &&
    newRelease.releaseType === 'store'
  ) {
    return Boolean(
      getPreviewUpdateKind(oldRelease, newRelease, next) ||
      getReleaseUpdateKind(oldRelease, newRelease),
    );
  }
  return Boolean(getReleaseUpdateKind(oldRelease, newRelease));
}
