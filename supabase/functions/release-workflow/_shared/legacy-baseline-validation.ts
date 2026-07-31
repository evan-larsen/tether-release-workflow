import {
  hasExactKeys,
  isNative,
  isNonEmptyString,
  isStrictVersion,
  isTimestamp,
} from './state-validation-primitives.ts';

const PLATFORMS = ['ios', 'android'] as const;

function isArtifact(
  value: unknown,
  version: unknown,
  source: Record<string, unknown>,
): boolean {
  const artifact = value as Record<string, unknown>;
  const storeStatus = artifact.storeStatus as Record<string, unknown>;
  const base = artifact.base as Record<string, unknown>;
  return (
    hasExactKeys(value, [
      'easBuildId',
      'appVersion',
      'buildNumber',
      'profile',
      'status',
      'sourceCommit',
      'sourceTreeHash',
      'storeStatus',
      'base',
    ]) &&
    isNonEmptyString(artifact.easBuildId) &&
    artifact.appVersion === version &&
    isNonEmptyString(artifact.buildNumber) &&
    artifact.profile === 'production' &&
    artifact.status === 'succeeded' &&
    artifact.sourceCommit === source.commit &&
    artifact.sourceTreeHash === source.treeHash &&
    hasExactKeys(storeStatus, ['status', 'providerState', 'checkedAt']) &&
    storeStatus.status === 'live' &&
    (storeStatus.providerState === null ||
      isNonEmptyString(storeStatus.providerState)) &&
    isTimestamp(storeStatus.checkedAt) &&
    hasExactKeys(base, ['status', 'staging', 'production']) &&
    base.status === 'eligible' &&
    base.staging === null &&
    base.production === null
  );
}

export function isAdoptedBaseline(value: unknown): boolean {
  const record = value as Record<string, unknown>;
  const source = record.source as Record<string, unknown>;
  const artifacts = record.artifacts as Record<string, unknown>;
  return (
    hasExactKeys(value, [
      'id',
      'version',
      'native',
      'nativeFloorVersion',
      'source',
      'createdAt',
      'releaseType',
      'status',
      'artifacts',
    ]) &&
    isNonEmptyString(record.id) &&
    isStrictVersion(record.version) &&
    isNative(record.native) &&
    record.nativeFloorVersion === record.version &&
    hasExactKeys(source, ['commit', 'treeHash']) &&
    typeof source.commit === 'string' &&
    /^[0-9a-f]{40}$/i.test(source.commit) &&
    typeof source.treeHash === 'string' &&
    /^[0-9a-f]{40}$/i.test(source.treeHash) &&
    isTimestamp(record.createdAt) &&
    record.releaseType === 'adopted_baseline' &&
    record.status === 'adopted' &&
    hasExactKeys(artifacts, PLATFORMS) &&
    PLATFORMS.every((platform) =>
      isArtifact(artifacts[platform], record.version, source),
    )
  );
}

export function isPreBaselineWorkflowRecord(value: unknown): boolean {
  const release = value as Record<string, unknown>;
  if (
    release.releaseType !== 'store' ||
    !['in_progress', 'superseded'].includes(String(release.status))
  )
    return false;
  if (release.productionCommit !== null) return false;
  const platforms = release.platforms as Record<
    string,
    { attempts: unknown[]; ota: unknown }
  >;
  const preview = release.preview as {
    status: unknown;
    platforms: Record<
      string,
      { attempts: unknown[]; stagingBase: unknown; stagingOta: unknown }
    >;
  } | null;
  return (
    PLATFORMS.every((platform) => {
      const production = platforms[platform];
      const previewPlatform = preview?.platforms[platform];
      return (
        production.attempts.length === 0 &&
        production.ota === null &&
        (!previewPlatform ||
          (previewPlatform.attempts.length === 0 &&
            previewPlatform.stagingBase === null &&
            previewPlatform.stagingOta === null))
      );
    }) &&
    (preview === null || preview.status === 'required')
  );
}
