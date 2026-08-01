import type {
  OtaReleaseRecord,
  Platform,
  ReleaseRecord,
  ReleaseState,
  StoreReleaseRecord,
} from './types.ts';
import { clone, equal } from './update-validation-utils.ts';
import {
  getActivePreparationId,
  hasCompletedCorrectionPreview,
  hasKnownPreparation,
  hasPlatformPublicProgress,
} from './platform-preparation-validation.ts';
import {
  getAdoptedUpdateKind,
  getBaseLifecycleKind,
} from './base-update-validation.ts';
import {
  getStagingOtaDescription,
  isStagingOtaIntent,
} from './staging-ota-validation.ts';
import { buildProductionOtaIntent } from './production-ota-validation.ts';

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
  state?: ReleaseState,
): string | null {
  for (const platform of PLATFORMS) {
    const sourceRelease = previous as unknown as Record<string, unknown>;
    const publicProgress = hasPlatformPublicProgress(sourceRelease, platform);
    const before = previous.platforms[platform];
    const after = next.platforms[platform];
    if (
      !publicProgress &&
      after.attempts.length === before.attempts.length + 1
    ) {
      const attempt = after.attempts.at(-1)!;
      const expected = clone(previous);
      expected.platforms[platform].attempts.push(attempt);
      if (
        ['requested', 'succeeded', 'failed'].includes(attempt.status) &&
        attempt.sourcePreparationId ===
          getActivePreparationId(sourceRelease, platform) &&
        (attempt.sourcePreparationId ===
          (sourceRelease.preparation as Record<string, unknown>)
            .preparationId ||
          hasCompletedCorrectionPreview(sourceRelease, platform)) &&
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
        !publicProgress &&
        oldAttempt.status === 'requested' &&
        ['succeeded', 'failed'].includes(newAttempt.status)
      ) {
        const expected = clone(previous);
        expected.platforms[platform].attempts[index].status = newAttempt.status;
        if (equal(expected, next)) return 'production_build_resolved';
      }

      const oldSubmissions = oldAttempt.submissions;
      const newSubmissions = newAttempt.submissions;
      if (
        !publicProgress &&
        newSubmissions.length === oldSubmissions.length + 1
      ) {
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
        !publicProgress &&
        ['pending', 'unknown'].includes(oldSubmissions.at(-1)?.status ?? '') &&
        ['submitted', 'failed', 'unknown'].includes(
          newSubmissions.at(-1)?.status ?? '',
        )
      ) {
        const expected = clone(previous);
        expected.platforms[platform].attempts[index].submissions[
          expected.platforms[platform].attempts[index].submissions.length - 1
        ] = newSubmissions.at(-1)!;
        if (equal(expected, next)) return 'submission_resolved';
      }

      if (
        !publicProgress &&
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
      const baseLifecycle = getBaseLifecycleKind(
        oldBase as unknown as Record<string, unknown> | null,
        newBase as unknown as Record<string, unknown> | null,
        oldAttempt as unknown as Record<string, unknown>,
      );
      const expected = clone(previous);
      expected.platforms[platform].attempts[index].base = newBase;
      if (baseLifecycle) {
        if (
          baseLifecycle === 'production_base_registered' &&
          hasAllRegistered(next) &&
          (!state || next.native === state.currentNative)
        )
          expected.status = 'complete';
        if (equal(expected, next)) return baseLifecycle;
      }
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
    if (
      [null, 'retryable'].includes(before.staging?.status ?? null) &&
      after.staging?.status === 'intent' &&
      isStagingOtaIntent(
        after.staging,
        platform,
        previous as unknown as Record<string, unknown>,
      )
    ) {
      const expected = clone(previous);
      expected.platforms[platform].ota!.staging = after.staging;
      if (equal(expected, next)) return 'staging_ota_publish_intent';
    }
    if (
      before.staging?.status === 'intent' &&
      ['retryable', 'unknown'].includes(after.staging?.status ?? '')
    ) {
      const expected = clone(previous);
      expected.platforms[platform].ota!.staging!.status = after.staging!.status;
      if (equal(expected, next)) return 'staging_ota_publish_outcome';
    }
    if (
      ['intent', 'retryable', 'unknown'].includes(
        before.staging?.status ?? '',
      ) &&
      after.staging?.status === 'published' &&
      after.staging.targetRange === before.staging!.targetRange &&
      after.staging.description ===
        getStagingOtaDescription(
          previous as unknown as Record<string, unknown>,
          platform,
        )
    ) {
      const expected = clone(previous);
      expected.platforms[platform].ota!.staging = after.staging;
      if (equal(expected, next)) return 'staging_ota_published';
    }
  }
  if (
    PLATFORMS.every(
      (platform) =>
        previous.platforms[platform].ota!.staging?.status === 'published',
    ) &&
    PLATFORMS.every(
      (platform) =>
        next.platforms[platform].ota!.staging?.status === 'approved',
    )
  ) {
    const expected = clone(previous);
    for (const platform of PLATFORMS)
      expected.platforms[platform].ota!.staging!.status = 'approved';
    if (equal(expected, next)) return 'staging_ota_approved';
  }
  for (const platform of PLATFORMS) {
    const before = previous.platforms[platform].ota!.production;
    const after = next.platforms[platform].ota!.production;
    if (
      [null, 'retryable'].includes(before?.status ?? null) &&
      after?.status === 'intent'
    ) {
      const expected = clone(previous);
      expected.platforms[platform].ota!.production = buildProductionOtaIntent(
        expected,
        platform,
      );
      if (equal(expected, next)) return 'production_ota_promote_intent';
    }
    if (
      before?.status === 'intent' &&
      ['retryable', 'unknown'].includes(after?.status ?? '')
    ) {
      const expected = clone(previous);
      expected.platforms[platform].ota!.production!.status = after!.status;
      if (equal(expected, next)) return 'production_ota_promote_outcome';
    }
    if (
      ['intent', 'retryable', 'unknown'].includes(before?.status ?? '') &&
      after?.status === 'promoted'
    ) {
      const expected = clone(previous);
      expected.platforms[platform].ota!.production = after;
      if (
        PLATFORMS.every(
          (name) =>
            expected.platforms[name].ota!.production?.status === 'promoted',
        )
      )
        expected.status = 'complete';
      if (equal(expected, next)) return 'production_ota_promoted';
    }
  }
  return null;
}

export function getReleaseUpdateKind(
  previous: ReleaseRecord,
  next: ReleaseRecord,
  state?: ReleaseState,
): string | null {
  if (previous.releaseType === 'adopted_baseline')
    return getAdoptedUpdateKind(previous, next);
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
  return getProductionUpdateKind(previous, next, state);
}
