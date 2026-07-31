import { isRelease } from './release-validation.ts';
import { hasExactKeys, isNative } from './state-validation-primitives.ts';
import { getPlatformPreparations } from './platform-preparation-validation.ts';
import { isAdoptedBaseline } from './legacy-baseline-validation.ts';
import {
  isStagingLane,
  isStagingLaneTarget,
} from './staging-lane-validation.ts';
import type { ReleaseState } from './types.ts';

const PLATFORMS = ['ios', 'android'] as const;

function getNativeNumber(value: unknown): number {
  return value === null ? 0 : Number(String(value).slice('native-'.length));
}

export function getNextNative(value: unknown): string {
  return `native-${getNativeNumber(value) + 1}`;
}

function getBuildIds(release: Record<string, unknown>): string[] {
  if (release.releaseType === 'adopted_baseline') {
    const artifacts = release.artifacts as Record<
      string,
      { easBuildId: string }
    >;
    return PLATFORMS.map((platform) => artifacts[platform].easBuildId);
  }
  const platforms = release.platforms as Record<
    string,
    { attempts: Array<{ easBuildId: string }> }
  >;
  const production = PLATFORMS.flatMap((platform) =>
    platforms[platform].attempts.map((attempt) => attempt.easBuildId),
  );
  if (release.releaseType !== 'store' || release.preview === null)
    return production;
  const preview = release.preview as {
    platforms: Record<string, { attempts: Array<{ easBuildId: string }> }>;
  };
  return [
    ...production,
    ...PLATFORMS.flatMap((platform) =>
      preview.platforms[platform].attempts.map((attempt) => attempt.easBuildId),
    ),
  ];
}

function getSubmissionIds(release: Record<string, unknown>): string[] {
  if (release.releaseType === 'adopted_baseline') return [];
  const platforms = release.platforms as Record<
    string,
    {
      attempts: Array<{ submissions: Array<{ id: string }> }>;
    }
  >;
  return PLATFORMS.flatMap((platform) =>
    platforms[platform].attempts.flatMap((attempt) =>
      attempt.submissions.map((submission) => submission.id),
    ),
  );
}

function getPlatforms(release: Record<string, unknown>) {
  return release.platforms as Record<
    string,
    {
      attempts: Array<{
        base: Record<string, unknown> | null;
        storeStatus: Record<string, unknown> | null;
      }>;
    }
  >;
}

function hasPreviewLaneFacts(release: Record<string, unknown>): boolean {
  const preview = release.preview as Record<string, unknown> | null;
  if (!preview) return false;
  const platforms = preview.platforms as Record<
    string,
    { stagingBase: unknown; stagingOta: unknown }
  >;
  return PLATFORMS.some(
    (platform) =>
      platforms[platform].stagingBase !== null ||
      platforms[platform].stagingOta !== null,
  );
}

function hasProductionWork(release: Record<string, unknown>): boolean {
  const platforms = getPlatforms(release);
  return PLATFORMS.some((platform) => platforms[platform].attempts.length > 0);
}

function hasPublicProgress(release: Record<string, unknown>): boolean {
  const platforms = getPlatforms(release);
  return PLATFORMS.some((platform) =>
    platforms[platform].attempts.some(
      (attempt) =>
        attempt.base !== null || attempt.storeStatus?.status === 'live',
    ),
  );
}

function hasValidGenerationRelationships(
  state: Record<string, unknown>,
  releases: Array<Record<string, unknown>>,
): boolean {
  const currentNumber = getNativeNumber(state.currentNative);
  const adopted = releases.filter(isAdoptedBaseline);
  if (adopted.length > 1) return false;
  if (adopted.length && (adopted[0].native !== 'native-1' || currentNumber < 1))
    return false;
  const introductions = releases.filter(
    (release) =>
      release.releaseType === 'store' && release.nativeFloorVersion !== null,
  );
  const activeIntroductions = introductions.filter(
    (release) => release.status !== 'superseded',
  );
  if (
    new Set(activeIntroductions.map((release) => release.native)).size !==
    activeIntroductions.length
  )
    return false;
  const unfinished = releases.filter(
    (release) =>
      release.releaseType === 'store' &&
      release.status === 'in_progress' &&
      getNativeNumber(release.native) > currentNumber,
  );
  if (unfinished.length > 1) return false;

  for (const release of releases) {
    if (release.releaseType === 'adopted_baseline') continue;
    if (release.releaseType !== 'store') continue;
    const nativeNumber = getNativeNumber(release.native);
    const introduces = release.nativeFloorVersion !== null;
    const preview = release.preview as Record<string, unknown> | null;
    if (!introduces && nativeNumber > currentNumber) return false;
    if (hasProductionWork(release) && release.productionCommit === null)
      return false;
    if (introduces) {
      if (nativeNumber > currentNumber + 1) return false;
      if (
        release.status === 'in_progress' &&
        release.native !== getNextNative(state.currentNative)
      )
        return false;
      if (release.status === 'complete' && nativeNumber > currentNumber)
        return false;
      if (release.productionCommit !== null && preview?.status !== 'approved')
        return false;
      if (hasProductionWork(release) && preview?.status !== 'approved')
        return false;
    }
    if (release.status === 'superseded' && hasPublicProgress(release))
      return false;
  }
  return true;
}

function hasValidStagingLane(
  state: Record<string, unknown>,
  releases: Array<Record<string, unknown>>,
): boolean {
  const lane = state.stagingLane as Record<string, unknown>;
  const candidateNatives = new Set(
    releases
      .filter(
        (release) =>
          release.releaseType === 'store' &&
          release.status === 'in_progress' &&
          release.nativeFloorVersion !== null,
      )
      .map((release) => release.native),
  );
  if (
    lane.activeNative !== null &&
    lane.activeNative !== state.currentNative &&
    !candidateNatives.has(lane.activeNative)
  )
    return false;
  if (
    lane.resetTargetNative !== null &&
    !isStagingLaneTarget(state, releases, lane.resetTargetNative)
  )
    return false;
  return releases.every((release) => {
    if (
      release.releaseType !== 'store' ||
      release.nativeFloorVersion === null ||
      !hasPreviewLaneFacts(release)
    )
      return true;
    return (
      lane.activeNative === release.native && lane.resetTargetNative === null
    );
  });
}

export function isReleaseState(value: unknown): value is ReleaseState {
  if (
    !hasExactKeys(value, [
      'stateVersion',
      'currentNative',
      'stagingLane',
      'releases',
    ]) ||
    value.stateVersion !== 2 ||
    (value.currentNative !== null && !isNative(value.currentNative)) ||
    !isStagingLane(value.stagingLane) ||
    !Array.isArray(value.releases) ||
    !value.releases.every(isRelease)
  )
    return false;
  const releases = value.releases as Array<Record<string, unknown>>;
  const releaseIds = releases.map((release) => String(release.id));
  const buildIds = releases.flatMap(getBuildIds);
  const submissionIds = releases.flatMap(getSubmissionIds);
  const preparationIds = releases.flatMap((release) =>
    release.releaseType === 'store'
      ? [
          String(
            (release.preparation as Record<string, unknown>).preparationId,
          ),
          ...getPlatformPreparations(release).map((item) =>
            String(item.preparationId),
          ),
        ]
      : [],
  );
  return (
    hasValidGenerationRelationships(value, releases) &&
    hasValidStagingLane(value, releases) &&
    new Set(releaseIds).size === releaseIds.length &&
    new Set(buildIds).size === buildIds.length &&
    new Set(submissionIds).size === submissionIds.length &&
    new Set(preparationIds).size === preparationIds.length
  );
}
