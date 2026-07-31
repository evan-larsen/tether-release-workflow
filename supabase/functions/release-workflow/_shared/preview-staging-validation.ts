import {
  hasExactKeys,
  isNonEmptyString,
} from './state-validation-primitives.ts';

const baseStatuses = ['intent', 'retryable', 'unknown', 'registered'];
const otaStatuses = ['intent', 'retryable', 'unknown', 'published'];

export function isPreviewTargetRange(value: unknown): boolean {
  return typeof value === 'string' && /^>=\d+\.\d+\.\d+$/.test(value);
}

export function getPreviewStagingOtaDescription(
  release: Record<string, unknown>,
  platform: string,
): string {
  const preparation = release.preparation as Record<string, unknown>;
  return `tether-preview-staging-ota:${release.id}:${platform}:${preparation.treeHash}`;
}

export function isLegacyPreviewBase(
  value: unknown,
  attempts: Array<Record<string, unknown>>,
): boolean {
  const item = value as Record<string, unknown>;
  return (
    hasExactKeys(value, ['easBuildId', 'label', 'packageHash']) &&
    isNonEmptyString(item.easBuildId) &&
    isNonEmptyString(item.label) &&
    isNonEmptyString(item.packageHash) &&
    attempts.at(-1)?.easBuildId === item.easBuildId &&
    attempts.at(-1)?.status === 'succeeded'
  );
}

export function isLegacyPreviewOta(value: unknown, base: unknown): boolean {
  const item = value as Record<string, unknown>;
  return (
    hasExactKeys(value, ['baseEasBuildId', 'label', 'packageHash']) &&
    isNonEmptyString(item.baseEasBuildId) &&
    isNonEmptyString(item.label) &&
    isNonEmptyString(item.packageHash) &&
    (base as Record<string, unknown> | null)?.easBuildId === item.baseEasBuildId
  );
}

export function isVerifiedPreviewBase(value: unknown): boolean {
  return (
    value !== null &&
    (!Object.hasOwn(value as object, 'status') ||
      (value as Record<string, unknown>).status === 'registered')
  );
}
export function isVerifiedPreviewOta(value: unknown): boolean {
  return (
    value !== null &&
    (!Object.hasOwn(value as object, 'status') ||
      (value as Record<string, unknown>).status === 'published')
  );
}

export function isPreviewBaseOperation(
  value: unknown,
  platform: string,
  release: Record<string, unknown>,
  attempts: Array<Record<string, unknown>>,
): boolean {
  const item = value as Record<string, unknown>;
  if (
    !hasExactKeys(value, [
      'status',
      'platform',
      'deployment',
      'candidateId',
      'preparationId',
      'treeHash',
      'preparedCommit',
      'native',
      'nativeFloorVersion',
      'easBuildId',
      'appVersion',
      'buildNumber',
      'label',
      'packageHash',
      'releaseMethod',
    ]) ||
    !baseStatuses.includes(String(item.status)) ||
    item.platform !== platform ||
    item.deployment !== 'staging' ||
    !isNonEmptyString(item.candidateId) ||
    !isNonEmptyString(item.preparationId) ||
    !/^[0-9a-f]{40}$/i.test(String(item.treeHash)) ||
    !/^[0-9a-f]{40}$/i.test(String(item.preparedCommit)) ||
    !isNonEmptyString(item.native) ||
    !isNonEmptyString(item.nativeFloorVersion) ||
    !isNonEmptyString(item.easBuildId) ||
    !isNonEmptyString(item.appVersion) ||
    !isNonEmptyString(item.buildNumber)
  )
    return false;
  const verified = item.status === 'registered';
  if (
    verified
      ? !(
          isNonEmptyString(item.label) &&
          isNonEmptyString(item.packageHash) &&
          item.releaseMethod === 'Upload'
        )
      : item.label !== null ||
        item.packageHash !== null ||
        item.releaseMethod !== null
  )
    return false;
  const preparation = release.preparation as Record<string, unknown>;
  const attempt = attempts.at(-1);
  return (
    item.candidateId === release.id &&
    item.preparationId === preparation.preparationId &&
    item.treeHash === preparation.treeHash &&
    item.preparedCommit === preparation.preparedCommit &&
    item.native === release.native &&
    item.nativeFloorVersion === release.nativeFloorVersion &&
    item.appVersion === release.version &&
    attempt?.status === 'succeeded' &&
    attempt.easBuildId === item.easBuildId &&
    attempt.appVersion === item.appVersion &&
    attempt.buildNumber === item.buildNumber
  );
}

export function isPreviewOtaOperation(
  value: unknown,
  platform: string,
  release: Record<string, unknown>,
  base: unknown,
): boolean {
  const item = value as Record<string, unknown>;
  if (
    !hasExactKeys(value, [
      'status',
      'platform',
      'deployment',
      'candidateId',
      'preparationId',
      'treeHash',
      'preparedCommit',
      'native',
      'nativeFloorVersion',
      'targetRange',
      'baseEasBuildId',
      'baseLabel',
      'basePackageHash',
      'description',
      'label',
      'packageHash',
      'releaseMethod',
    ]) ||
    !otaStatuses.includes(String(item.status)) ||
    item.platform !== platform ||
    item.deployment !== 'staging' ||
    !isNonEmptyString(item.candidateId) ||
    !isNonEmptyString(item.preparationId) ||
    !/^[0-9a-f]{40}$/i.test(String(item.treeHash)) ||
    !/^[0-9a-f]{40}$/i.test(String(item.preparedCommit)) ||
    !isNonEmptyString(item.native) ||
    !isNonEmptyString(item.nativeFloorVersion) ||
    !isPreviewTargetRange(item.targetRange) ||
    !isNonEmptyString(item.baseEasBuildId) ||
    !isNonEmptyString(item.baseLabel) ||
    !isNonEmptyString(item.basePackageHash) ||
    !isNonEmptyString(item.description)
  )
    return false;
  const verified = item.status === 'published';
  if (
    verified
      ? !(
          isNonEmptyString(item.label) &&
          isNonEmptyString(item.packageHash) &&
          item.releaseMethod === 'Upload'
        )
      : item.label !== null ||
        item.packageHash !== null ||
        item.releaseMethod !== null
  )
    return false;
  const preparation = release.preparation as Record<string, unknown>;
  const fact = base as Record<string, unknown>;
  return (
    isVerifiedPreviewBase(base) &&
    item.candidateId === release.id &&
    item.preparationId === preparation.preparationId &&
    item.treeHash === preparation.treeHash &&
    item.preparedCommit === preparation.preparedCommit &&
    item.native === release.native &&
    item.nativeFloorVersion === release.nativeFloorVersion &&
    item.targetRange === `>=${release.nativeFloorVersion}` &&
    item.baseEasBuildId === fact.easBuildId &&
    item.baseLabel === fact.label &&
    item.basePackageHash === fact.packageHash &&
    item.description === getPreviewStagingOtaDescription(release, platform)
  );
}

export function buildPreviewStagingBaseIntent(
  release: Record<string, unknown>,
  platform: string,
): Record<string, unknown> {
  const preview = release.preview as {
    platforms: Record<string, { attempts: Array<Record<string, unknown>> }>;
  };
  const attempt = preview.platforms[platform].attempts.at(-1);
  const preparation = release.preparation as Record<string, unknown>;
  return {
    status: 'intent',
    platform,
    deployment: 'staging',
    candidateId: release.id,
    preparationId: preparation.preparationId,
    treeHash: preparation.treeHash,
    preparedCommit: preparation.preparedCommit,
    native: release.native,
    nativeFloorVersion: release.nativeFloorVersion,
    easBuildId: attempt!.easBuildId,
    appVersion: attempt!.appVersion,
    buildNumber: attempt!.buildNumber,
    label: null,
    packageHash: null,
    releaseMethod: null,
  };
}

export function buildPreviewStagingOtaIntent(
  release: Record<string, unknown>,
  platform: string,
): Record<string, unknown> {
  const preview = release.preview as {
    platforms: Record<string, { stagingBase: Record<string, unknown> }>;
  };
  const base = preview.platforms[platform].stagingBase;
  const preparation = release.preparation as Record<string, unknown>;
  return {
    status: 'intent',
    platform,
    deployment: 'staging',
    candidateId: release.id,
    preparationId: preparation.preparationId,
    treeHash: preparation.treeHash,
    preparedCommit: preparation.preparedCommit,
    native: release.native,
    nativeFloorVersion: release.nativeFloorVersion,
    targetRange: `>=${release.nativeFloorVersion}`,
    baseEasBuildId: base.easBuildId,
    baseLabel: base.label,
    basePackageHash: base.packageHash,
    description: getPreviewStagingOtaDescription(release, platform),
    label: null,
    packageHash: null,
    releaseMethod: null,
  };
}
