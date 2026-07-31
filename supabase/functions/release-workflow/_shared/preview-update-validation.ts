import type {
  Platform,
  PreviewStagingBaseOperation,
  PreviewStagingOtaOperation,
  ReleaseState,
  StoreReleaseRecord,
} from './types.ts';
import { clone, equal } from './update-validation-utils.ts';
import {
  buildPreviewStagingBaseIntent,
  buildPreviewStagingOtaIntent,
  isVerifiedPreviewBase,
  isVerifiedPreviewOta,
} from './preview-staging-validation.ts';

const PLATFORMS: Platform[] = ['ios', 'android'];

function hasAllPreviewFacts(release: StoreReleaseRecord): boolean {
  if (!release.preview) return false;
  return PLATFORMS.every((platform) => {
    const record = release.preview!.platforms[platform];
    return (
      record.attempts.at(-1)?.status === 'succeeded' &&
      isVerifiedPreviewBase(record.stagingBase) &&
      isVerifiedPreviewOta(record.stagingOta)
    );
  });
}

function isLaneReady(state: ReleaseState, release: StoreReleaseRecord) {
  return (
    state.stagingLane.activeNative === release.native &&
    state.stagingLane.resetTargetNative === null
  );
}
function isBuildLaneAvailable(state: ReleaseState) {
  return state.stagingLane.resetTargetNative === null;
}

export function getPreviewUpdateKind(
  previous: StoreReleaseRecord,
  next: StoreReleaseRecord,
  state: ReleaseState,
): string | null {
  if (!previous.preview || !next.preview) return null;

  for (const platform of PLATFORMS) {
    const before = previous.preview.platforms[platform];
    const after = next.preview.platforms[platform];

    if (
      isBuildLaneAvailable(state) &&
      after.attempts.length === before.attempts.length + 1
    ) {
      const attempt = after.attempts.at(-1)!;
      const expected = clone(previous);
      expected.preview!.platforms[platform].attempts.push(attempt);
      expected.preview!.status = 'building';
      if (
        attempt.status === 'requested' &&
        (!before.attempts.length ||
          before.attempts.at(-1)?.status === 'failed') &&
        equal(expected, next)
      )
        return 'preview_build_requested';
    }

    const index = before.attempts.findIndex(
      (attempt, attemptIndex) =>
        attempt.status === 'requested' &&
        ['succeeded', 'failed'].includes(
          after.attempts[attemptIndex]?.status,
        ) &&
        attempt.easBuildId === after.attempts[attemptIndex]?.easBuildId,
    );
    if (isBuildLaneAvailable(state) && index >= 0) {
      const expected = clone(previous);
      expected.preview!.platforms[platform].attempts[index].status =
        after.attempts[index].status;
      if (equal(expected, next)) return 'preview_build_resolved';
    }

    if (
      isLaneReady(state, previous) &&
      before.attempts.at(-1)?.status === 'succeeded' &&
      (before.stagingBase === null || before.stagingBase.status === 'retryable')
    ) {
      const expected = clone(previous);
      expected.preview!.platforms[platform].stagingBase =
        buildPreviewStagingBaseIntent(
          previous as unknown as Record<string, unknown>,
          platform,
        ) as never;
      expected.preview!.status = 'building';
      if (equal(expected, next)) return 'preview_base_intent';
    }

    if (
      isLaneReady(state, previous) &&
      before.stagingBase?.status === 'intent' &&
      ['retryable', 'unknown'].includes(after.stagingBase?.status ?? '')
    ) {
      const expected = clone(previous);
      (
        expected.preview!.platforms[platform]
          .stagingBase as PreviewStagingBaseOperation
      ).status = after.stagingBase!
        .status as PreviewStagingBaseOperation['status'];
      if (equal(expected, next)) return 'preview_base_outcome';
    }
    if (
      isLaneReady(state, previous) &&
      ['intent', 'unknown'].includes(before.stagingBase?.status ?? '') &&
      after.stagingBase?.status === 'registered'
    ) {
      const expected = clone(previous);
      expected.preview!.platforms[platform].stagingBase = {
        ...before.stagingBase,
        status: 'registered',
        label: after.stagingBase.label,
        packageHash: after.stagingBase.packageHash,
        releaseMethod: after.stagingBase.releaseMethod,
      } as PreviewStagingBaseOperation;
      if (equal(expected, next)) return 'preview_base_registered';
    }
    if (
      isLaneReady(state, previous) &&
      isVerifiedPreviewBase(before.stagingBase) &&
      (before.stagingOta === null || before.stagingOta.status === 'retryable')
    ) {
      const expected = clone(previous);
      expected.preview!.platforms[platform].stagingOta =
        buildPreviewStagingOtaIntent(
          previous as unknown as Record<string, unknown>,
          platform,
        ) as never;
      if (equal(expected, next)) return 'preview_ota_intent';
    }
    if (
      isLaneReady(state, previous) &&
      before.stagingOta?.status === 'intent' &&
      ['retryable', 'unknown'].includes(after.stagingOta?.status ?? '')
    ) {
      const expected = clone(previous);
      (
        expected.preview!.platforms[platform]
          .stagingOta as PreviewStagingOtaOperation
      ).status = after.stagingOta!
        .status as PreviewStagingOtaOperation['status'];
      if (equal(expected, next)) return 'preview_ota_outcome';
    }
    if (
      isLaneReady(state, previous) &&
      ['intent', 'unknown'].includes(before.stagingOta?.status ?? '') &&
      after.stagingOta?.status === 'published'
    ) {
      const expected = clone(previous);
      expected.preview!.platforms[platform].stagingOta = {
        ...before.stagingOta,
        status: 'published',
        label: after.stagingOta.label,
        packageHash: after.stagingOta.packageHash,
        releaseMethod: after.stagingOta.releaseMethod,
      } as PreviewStagingOtaOperation;
      expected.preview!.status = hasAllPreviewFacts(expected)
        ? 'smoke_pending'
        : 'building';
      if (equal(expected, next)) return 'preview_ota_published';
    }
  }

  if (
    isLaneReady(state, previous) &&
    previous.preview.status === 'smoke_pending' &&
    next.preview.status === 'approved'
  ) {
    const expected = clone(previous);
    expected.preview!.status = 'approved';
    expected.preview!.smokeApprovedAt = next.preview.smokeApprovedAt;
    if (equal(expected, next)) return 'preview_approved';
  }
  return null;
}
