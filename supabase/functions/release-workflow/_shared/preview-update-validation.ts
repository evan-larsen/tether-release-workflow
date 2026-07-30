import type { Platform, ReleaseState, StoreReleaseRecord } from './types.ts';
import { clone, equal } from './update-validation-utils.ts';

const PLATFORMS: Platform[] = ['ios', 'android'];

function hasAllPreviewFacts(release: StoreReleaseRecord): boolean {
  if (!release.preview) return false;
  return PLATFORMS.every((platform) => {
    const record = release.preview!.platforms[platform];
    return (
      record.attempts.at(-1)?.status === 'succeeded' &&
      record.stagingBase !== null &&
      record.stagingOta !== null
    );
  });
}

function isLaneReady(state: ReleaseState, release: StoreReleaseRecord) {
  return (
    state.stagingLane.activeNative === release.native &&
    state.stagingLane.resetTargetNative === null
  );
}

export function getPreviewUpdateKind(
  previous: StoreReleaseRecord,
  next: StoreReleaseRecord,
  state: ReleaseState,
): string | null {
  if (!previous.preview || !next.preview || !isLaneReady(state, previous))
    return null;

  for (const platform of PLATFORMS) {
    const before = previous.preview.platforms[platform];
    const after = next.preview.platforms[platform];

    if (after.attempts.length === before.attempts.length + 1) {
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
    if (index >= 0) {
      const expected = clone(previous);
      expected.preview!.platforms[platform].attempts[index].status =
        after.attempts[index].status;
      if (equal(expected, next)) return 'preview_build_resolved';
    }

    if (before.stagingBase === null && after.stagingBase !== null) {
      const expected = clone(previous);
      expected.preview!.platforms[platform].stagingBase = after.stagingBase;
      expected.preview!.status = 'building';
      if (equal(expected, next)) return 'preview_base_saved';
    }

    if (before.stagingOta === null && after.stagingOta !== null) {
      const expected = clone(previous);
      expected.preview!.platforms[platform].stagingOta = after.stagingOta;
      expected.preview!.status = hasAllPreviewFacts(expected)
        ? 'smoke_pending'
        : 'building';
      if (equal(expected, next)) return 'preview_ota_saved';
    }
  }

  if (
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
