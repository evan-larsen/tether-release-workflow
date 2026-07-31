import type {
  OtaReleaseRecord,
  Platform,
  ReleaseRecord,
  StoreReleaseRecord,
} from './types.ts';
import { clone, equal } from './update-validation-utils.ts';
import {
  getActivePreparationId,
  hasKnownPreparation,
  hasPlatformPublicProgress,
} from './platform-preparation-validation.ts';

const PLATFORMS: Platform[] = ['ios', 'android'];

export function hasAllRegistered(release: StoreReleaseRecord): boolean {
  return PLATFORMS.every((platform) =>
    release.platforms[platform].attempts.some(
      (attempt) => attempt.base?.status === 'registered',
    ),
  );
}

function isRetryAllowed(
  attempt: StoreReleaseRecord['platforms']['ios']['attempts'][number],
) {
  return (
    attempt.status === 'failed' ||
    (attempt.storeStatus?.status === 'rejected' && !attempt.base?.production)
  );
}

export function getProductionUpdateKind(
  previous: StoreReleaseRecord,
  next: StoreReleaseRecord,
): string | null {
  for (const platform of PLATFORMS) {
    const sourceRelease = previous as unknown as Record<string, unknown>;
    if (hasPlatformPublicProgress(sourceRelease, platform)) continue;
    const before = previous.platforms[platform];
    const after = next.platforms[platform];
    if (after.attempts.length === before.attempts.length + 1) {
      const attempt = after.attempts.at(-1)!;
      const expected = clone(previous);
      expected.platforms[platform].attempts.push(attempt);
      if (
        ['requested', 'failed'].includes(attempt.status) &&
        attempt.sourcePreparationId ===
          getActivePreparationId(sourceRelease, platform) &&
        hasKnownPreparation(
          sourceRelease,
          platform,
          attempt.sourcePreparationId,
        ) &&
        attempt.submissions.length === 0 &&
        attempt.storeStatus === null &&
        attempt.base === null &&
        (!before.attempts.length || isRetryAllowed(before.attempts.at(-1)!)) &&
        equal(expected, next)
      )
        return 'production_build_requested';
    }

    for (let index = 0; index < before.attempts.length; index += 1) {
      const oldAttempt = before.attempts[index];
      const newAttempt = after.attempts[index];
      if (!newAttempt) continue;
      if (
        oldAttempt.status === 'requested' &&
        ['succeeded', 'failed'].includes(newAttempt.status)
      ) {
        const expected = clone(previous);
        expected.platforms[platform].attempts[index].status = newAttempt.status;
        if (equal(expected, next)) return 'production_build_resolved';
      }

      const oldSubmissions = oldAttempt.submissions;
      const newSubmissions = newAttempt.submissions;
      if (newSubmissions.length === oldSubmissions.length + 1) {
        const submission = newSubmissions.at(-1)!;
        const expected = clone(previous);
        expected.platforms[platform].attempts[index].submissions.push(
          submission,
        );
        if (
          oldAttempt.status === 'succeeded' &&
          submission.status === 'pending' &&
          (!oldSubmissions.length ||
            oldSubmissions.at(-1)?.status === 'failed') &&
          equal(expected, next)
        )
          return 'submission_started';
      }
      if (
        oldSubmissions.at(-1)?.status === 'pending' &&
        ['submitted', 'failed', 'unknown'].includes(
          newSubmissions.at(-1)?.status ?? '',
        )
      ) {
        const expected = clone(previous);
        expected.platforms[platform].attempts[index].submissions.at(
          -1,
        )!.status = newSubmissions.at(-1)!.status;
        if (equal(expected, next)) return 'submission_resolved';
      }

      if (
        newAttempt.storeStatus !== null &&
        oldSubmissions.at(-1)?.status === 'submitted' &&
        (oldAttempt.storeStatus === null ||
          Date.parse(newAttempt.storeStatus.checkedAt) >
            Date.parse(oldAttempt.storeStatus.checkedAt))
      ) {
        const expected = clone(previous);
        expected.platforms[platform].attempts[index].storeStatus =
          newAttempt.storeStatus;
        if (equal(expected, next)) return 'store_status_saved';
      }

      const oldBase = oldAttempt.base;
      const newBase = newAttempt.base;
      const expected = clone(previous);
      expected.platforms[platform].attempts[index].base = newBase;
      if (
        oldBase === null &&
        newBase?.status === 'pending' &&
        oldSubmissions.at(-1)?.status === 'submitted' &&
        equal(expected, next)
      )
        return 'base_pending';
      if (
        oldBase?.status === 'pending' &&
        newBase?.status === 'eligible' &&
        oldAttempt.storeStatus?.status === 'live' &&
        equal(expected, next)
      )
        return 'base_eligible';
      if (
        oldBase?.status === 'eligible' &&
        oldBase.staging === null &&
        newBase?.status === 'eligible' &&
        newBase.staging !== null &&
        equal(expected, next)
      )
        return 'staging_base_registered';
      if (
        oldBase?.status === 'eligible' &&
        oldBase.staging !== null &&
        newBase?.status === 'registered' &&
        newBase.production !== null
      ) {
        if (hasAllRegistered(next)) expected.status = 'complete';
        if (equal(expected, next)) return 'production_base_registered';
      }
    }
  }
  return null;
}

function getOtaUpdateKind(
  previous: OtaReleaseRecord,
  next: OtaReleaseRecord,
): string | null {
  for (const platform of PLATFORMS) {
    const before = previous.platforms[platform].ota!;
    const after = next.platforms[platform].ota!;
    if (before.staging === null && after.staging?.status === 'published') {
      const expected = clone(previous);
      expected.platforms[platform].ota!.staging = after.staging;
      if (equal(expected, next)) return 'staging_ota_published';
    }
    if (
      before.staging?.status === 'published' &&
      after.staging?.status === 'approved'
    ) {
      const expected = clone(previous);
      expected.platforms[platform].ota!.staging!.status = 'approved';
      if (equal(expected, next)) return 'staging_ota_approved';
    }
    if (
      before.staging?.status === 'approved' &&
      before.production === null &&
      after.production !== null
    ) {
      const expected = clone(previous);
      expected.platforms[platform].ota!.production = after.production;
      if (
        PLATFORMS.every(
          (name) => expected.platforms[name].ota!.production !== null,
        )
      )
        expected.status = 'complete';
      if (equal(expected, next)) return 'production_ota_saved';
    }
  }
  return null;
}

export function getReleaseUpdateKind(
  previous: ReleaseRecord,
  next: ReleaseRecord,
): string | null {
  if (
    previous.releaseType !== next.releaseType ||
    previous.id !== next.id ||
    previous.status !== 'in_progress'
  )
    return null;
  if (previous.releaseType === 'ota' && next.releaseType === 'ota')
    return getOtaUpdateKind(previous, next);
  if (previous.releaseType !== 'store' || next.releaseType !== 'store')
    return null;
  if (
    previous.productionCommit === null &&
    next.productionCommit !== null &&
    (previous.preview === null || previous.preview.status === 'approved')
  ) {
    const expected = clone(previous);
    expected.productionCommit = next.productionCommit;
    if (equal(expected, next)) return 'production_commit_attached';
  }
  return getProductionUpdateKind(previous, next);
}
