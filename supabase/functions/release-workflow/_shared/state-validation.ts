import { isRelease } from './release-validation.ts';
import { hasExactKeys, isNative } from './state-validation-primitives.ts';
import type { ReleaseState } from './types.ts';

const PLATFORMS = ['ios', 'android'] as const;

function getNativeNumber(value: unknown): number {
  return value === null ? 0 : Number(String(value).slice('native-'.length));
}

export function getNextNative(value: unknown): string {
  return `native-${getNativeNumber(value) + 1}`;
}

function getBuildIds(release: Record<string, unknown>): string[] {
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

function hasPreviewWork(release: Record<string, unknown>): boolean {
  const preview = release.preview as Record<string, unknown> | null;
  if (!preview || preview.status !== 'required') return true;
  const platforms = preview.platforms as Record<
    string,
    {
      attempts: unknown[];
      stagingBase: unknown;
      stagingOta: unknown;
    }
  >;
  return PLATFORMS.some(
    (platform) =>
      platforms[platform].attempts.length > 0 ||
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
    lane.resetTargetNative !== getNextNative(state.currentNative)
  )
    return false;
  return releases.every((release) => {
    if (
      release.releaseType !== 'store' ||
      release.nativeFloorVersion === null ||
      !hasPreviewWork(release)
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
    !hasExactKeys(value.stagingLane, ['activeNative', 'resetTargetNative']) ||
    (value.stagingLane.activeNative !== null &&
      !isNative(value.stagingLane.activeNative)) ||
    (value.stagingLane.resetTargetNative !== null &&
      !isNative(value.stagingLane.resetTargetNative)) ||
    (value.stagingLane.resetTargetNative !== null &&
      value.stagingLane.activeNative === value.stagingLane.resetTargetNative) ||
    !Array.isArray(value.releases) ||
    !value.releases.every(isRelease)
  )
    return false;
  const releases = value.releases as Array<Record<string, unknown>>;
  const releaseIds = releases.map((release) => String(release.id));
  const buildIds = releases.flatMap(getBuildIds);
  const submissionIds = releases.flatMap(getSubmissionIds);
  return (
    hasValidGenerationRelationships(value, releases) &&
    hasValidStagingLane(value, releases) &&
    new Set(releaseIds).size === releaseIds.length &&
    new Set(buildIds).size === buildIds.length &&
    new Set(submissionIds).size === submissionIds.length
  );
}
