import { getPreviewUpdateKind } from './preview-update-validation.ts';
import { getReleaseUpdateKind } from './production-update-validation.ts';
import { getNextNative, isReleaseState } from './state-validation.ts';
import { isStagingLaneTarget } from './staging-lane-validation.ts';
import {
  getCorrectionPreviewUpdateKind,
  getPlatformCorrectionUpdateKind,
} from './platform-correction-update-validation.ts';
import { isValidInitialOta } from './ota-source-validation.ts';
import { isEmergencyOta } from './emergency-ota-validation.ts';
import type {
  ReleaseRecord,
  ReleaseState,
  StoreReleaseRecord,
} from './types.ts';
import { equal } from './update-validation-utils.ts';
import { getProductionProvisioningUpdateKind } from './production-provisioning-update-validation.ts';

function isRollbackUpdate(previous: ReleaseState, next: ReleaseState): boolean {
  if (
    !equal(previous.releases, next.releases) ||
    !equal(previous.stagingLane, next.stagingLane) ||
    previous.currentNative !== next.currentNative
  )
    return false;
  const before = previous.rollbacks ?? [];
  const after = next.rollbacks ?? [];
  if (after.length === before.length + 1) {
    const item = after.at(-1)!;
    return (
      item.native === previous.currentNative &&
      item.status === 'in_progress' &&
      (['ios', 'android'] as const).every(
        (p) => item.platforms[p].status === 'intent',
      )
    );
  }
  if (after.length !== before.length) return false;
  const changed = before
    .map((item, index) => (equal(item, after[index]) ? -1 : index))
    .filter((i) => i >= 0);
  if (changed.length !== 1) return false;
  const old = before[changed[0]];
  const newer = after[changed[0]];
  if (old.id !== newer.id || old.native !== previous.currentNative)
    return false;
  for (const platform of ['ios', 'android'] as const) {
    const a = old.platforms[platform],
      b = newer.platforms[platform];
    if (equal(a, b)) continue;
    if (!(
      ['intent', 'retryable', 'unknown'].includes(a.status) &&
      ['intent', 'retryable', 'unknown', 'rolled_back'].includes(b.status)
    ))
      return false;
    if (a.status === 'unknown' && b.status !== 'rolled_back') return false;
    if (
      b.status === 'rolled_back' &&
      (b.releaseMethod !== 'Rollback' ||
        b.originalLabelResult !== a.originalLabel)
    )
      return false;
    const other = platform === 'ios' ? 'android' : 'ios';
    if (!equal(old.platforms[other], newer.platforms[other])) return false;
    if (
      newer.status === 'complete' &&
      !(
        newer.platforms.ios.status === 'rolled_back' &&
        newer.platforms.android.status === 'rolled_back'
      )
    )
      return false;
    return true;
  }
  return false;
}

function hasEmptyPlatforms(release: ReleaseRecord): boolean {
  if (release.releaseType === 'adopted_baseline') return false;
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
  if (release.releaseType === 'adopted_baseline') return false;
  if (release.status !== 'in_progress' || !hasEmptyPlatforms(release))
    return false;
  if (release.releaseType === 'ota')
    return (
      previous.currentNative !== null &&
      release.native === previous.currentNative &&
      (release.emergency
        ? isEmergencyOta(
            release.emergency,
            release as unknown as Record<string, unknown>,
          ) &&
          previous.stagingLane.activeNative === release.native &&
          previous.stagingLane.resetTargetNative === null
        : isValidInitialOta(previous, release))
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
    appended.releaseType === 'store' &&
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
  const target = after.resetTargetNative ?? after.activeNative;
  const hasCandidate =
    target !== null &&
    isStagingLaneTarget(
      previous as unknown as Record<string, unknown>,
      previous.releases as unknown as Array<Record<string, unknown>>,
      target,
    );
  const pending = (progress: typeof after.resetProgress | undefined) =>
    progress?.ios === 'pending' && progress.android === 'pending';
  const oneStep = (
    progress: typeof after.resetProgress | undefined,
    prior: typeof before.resetProgress | undefined,
  ) =>
    (['ios', 'android'] as const).some(
      (platform) =>
        ((prior?.[platform] === 'pending' &&
          progress?.[platform] === 'clearing') ||
          (prior?.[platform] === 'clearing' &&
            progress?.[platform] === 'cleared_and_verified')) &&
        (['ios', 'android'] as const).every(
          (other) => other === platform || progress?.[other] === prior[other],
        ),
    );
  if (
    before.activeNative === null &&
    before.resetTargetNative === null &&
    after.activeNative === target &&
    after.resetTargetNative === null &&
    !Object.hasOwn(after, 'resetProgress') &&
    hasCandidate
  )
    return true;
  if (
    before.activeNative !== null &&
    before.resetTargetNative === null &&
    after.resetTargetNative === target &&
    before.activeNative === after.activeNative &&
    pending(after.resetProgress) &&
    hasCandidate
  )
    return true;
  if (
    before.resetTargetNative === target &&
    after.resetTargetNative === target &&
    before.activeNative === after.activeNative &&
    oneStep(after.resetProgress, before.resetProgress)
  )
    return true;
  return (
    before.resetTargetNative === target &&
    after.activeNative === target &&
    after.resetTargetNative === null &&
    before.resetProgress?.ios === 'cleared_and_verified' &&
    before.resetProgress?.android === 'cleared_and_verified' &&
    !Object.hasOwn(after, 'resetProgress') &&
    hasCandidate
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
    oldRelease.status === 'in_progress' &&
    oldRelease.preview?.status === 'approved' &&
    oldRelease.productionCommit !== null &&
    newRelease.status === 'complete' &&
    oldRelease.productionProvisioning !== undefined &&
    (['ios', 'android'] as const).every((platform) =>
      oldRelease.platforms[platform].attempts.some(
        (attempt) =>
          attempt.base?.status === 'registered' && attempt.base.production,
      ),
    ) &&
    equal({ ...oldRelease, status: 'complete' }, newRelease)
  );
}

function isEmergencySourceAttachment(
  oldRelease: ReleaseRecord,
  newRelease: ReleaseRecord,
): boolean {
  if (
    oldRelease.releaseType !== 'ota' ||
    newRelease.releaseType !== 'ota' ||
    oldRelease.emergency?.productionCommit !== null ||
    newRelease.emergency?.productionCommit === null
  )
    return false;
  const expected = structuredClone(oldRelease);
  expected.emergency!.productionCommit = newRelease.emergency!.productionCommit;
  return equal(expected, newRelease);
}

export function validateReleaseStateUpdate(
  previous: unknown,
  next: unknown,
): next is ReleaseState {
  if (
    !isReleaseState(previous) ||
    !isReleaseState(next) ||
    equal(previous, next)
  )
    return false;
  if (isAppendOrSupersession(previous, next)) return true;
  if (isStagingLaneUpdate(previous, next)) return true;
  if (isRollbackUpdate(previous, next)) return true;
  const index = getOnlyChangedRelease(previous, next);
  if (index === null || !equal(previous.stagingLane, next.stagingLane))
    return false;
  if (previous.currentNative !== next.currentNative)
    return isCurrentNativeCompletion(previous, next, index);

  const oldRelease = previous.releases[index];
  const newRelease = next.releases[index];
  if (isEmergencySourceAttachment(oldRelease, newRelease)) return true;
  if (
    oldRelease.releaseType === 'store' &&
    newRelease.releaseType === 'store'
  ) {
    return Boolean(
      getPlatformCorrectionUpdateKind(
        oldRelease as unknown as Record<string, unknown>,
        newRelease as unknown as Record<string, unknown>,
      ) ||
      getCorrectionPreviewUpdateKind(
        oldRelease as unknown as Record<string, unknown>,
        newRelease as unknown as Record<string, unknown>,
      ) ||
      getPreviewUpdateKind(oldRelease, newRelease, next) ||
      getProductionProvisioningUpdateKind(oldRelease, newRelease, next) ||
      getReleaseUpdateKind(oldRelease, newRelease, previous),
    );
  }
  return Boolean(getReleaseUpdateKind(oldRelease, newRelease, previous));
}
