import { getPlatformPreparations } from './platform-preparation-validation.ts';
import type {
  OtaReleaseRecord,
  Platform,
  ReleaseState,
  StoreBase,
  StoreReleaseRecord,
} from './types.ts';

const PLATFORMS: Platform[] = ['ios', 'android'];

function getArtifacts(state: ReleaseState, native: string, platform: Platform) {
  const artifacts: Array<{ appVersion: string; base: StoreBase | null }> = [];
  for (const release of state.releases) {
    if (release.native !== native) continue;
    if (release.releaseType === 'adopted_baseline')
      artifacts.push(release.artifacts[platform]);
    else if (release.releaseType === 'store')
      artifacts.push(...release.platforms[platform].attempts);
  }
  return artifacts;
}

function hasExactTargetBases(
  state: ReleaseState,
  native: string,
  targetVersion: string,
): boolean {
  return PLATFORMS.every((platform) =>
    getArtifacts(state, native, platform).some(
      (artifact) =>
        artifact.appVersion === targetVersion &&
        artifact.base?.status === 'registered' &&
        artifact.base.staging !== null &&
        artifact.base.production !== null,
    ),
  );
}

function hasReadyBases(state: ReleaseState, native: string): boolean {
  return PLATFORMS.every((platform) => {
    const artifacts = getArtifacts(state, native, platform);
    return (
      artifacts.every((artifact) => !artifact.base?.registration) &&
      artifacts.some(
        (artifact) =>
          artifact.base?.status === 'registered' && artifact.base.staging,
      )
    );
  });
}

function getFloor(state: ReleaseState, native: string): string | null {
  const floors = new Set(
    state.releases.flatMap((release) =>
      release.native === native &&
      release.status !== 'superseded' &&
      'nativeFloorVersion' in release &&
      release.nativeFloorVersion !== null
        ? [release.nativeFloorVersion]
        : [],
    ),
  );
  return floors.size === 1 ? [...floors][0] : null;
}

export function isValidInitialOta(
  previous: ReleaseState,
  ota: OtaReleaseRecord,
): boolean {
  if (
    previous.currentNative === null ||
    ota.native !== previous.currentNative ||
    previous.stagingLane.activeNative !== ota.native ||
    previous.stagingLane.resetTargetNative !== null ||
    !hasReadyBases(previous, ota.native)
  )
    return false;
  const matches = previous.releases.filter(
    (release): release is StoreReleaseRecord =>
      release.releaseType === 'store' &&
      release.status !== 'superseded' &&
      release.id === ota.sourceReleaseId &&
      release.version === ota.version &&
      release.native === ota.native &&
      release.preparation.preparationId === ota.preparationId &&
      release.preparation.treeHash === ota.treeHash &&
      release.productionCommit === ota.gitCommit &&
      !getPlatformPreparations(
        release as unknown as Record<string, unknown>,
      ).some((preparation) => preparation.status === 'prepared'),
  );
  const floor = getFloor(previous, ota.native);
  return (
    matches.length === 1 &&
    floor !== null &&
    (ota.targetRange === `>=${floor}` ||
      hasExactTargetBases(previous, ota.native, ota.targetRange)) &&
    !previous.releases.some(
      (release) =>
        release.releaseType === 'ota' &&
        release.sourceReleaseId === ota.sourceReleaseId &&
        release.preparationId === ota.preparationId &&
        release.treeHash === ota.treeHash &&
        release.gitCommit === ota.gitCommit,
    )
  );
}
