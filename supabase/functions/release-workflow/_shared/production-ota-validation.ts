import { isRevoPushFact } from './preview-validation.ts';
import {
  isNative,
  isNonEmptyString,
  hasExactKeys,
} from './state-validation-primitives.ts';
import { isTargetRange } from './staging-ota-validation.ts';
import type {
  OtaReleaseRecord,
  Platform,
  ProductionOtaRecord,
} from './types.ts';

export function getProductionDeployment(native: string): string {
  if (!isNative(native)) throw new Error('Invalid native generation.');
  return `production-${native}`;
}

export function isProductionOta(
  value: unknown,
  platform: Platform,
  release: OtaReleaseRecord,
): value is ProductionOtaRecord {
  if (value === null) return true;
  if (
    !hasExactKeys(value, [
      'status',
      'platform',
      'deployment',
      'sourceReleaseId',
      'preparationId',
      'treeHash',
      'gitCommit',
      'targetRange',
      'stagingLabel',
      'stagingPackageHash',
      'label',
      'packageHash',
      'releaseMethod',
      'originalLabel',
    ])
  )
    return false;
  const item = value as Record<string, unknown>;
  const promoted = item.status === 'promoted';
  return (
    ['intent', 'retryable', 'unknown', 'promoted'].includes(
      String(item.status),
    ) &&
    item.platform === platform &&
    item.deployment === getProductionDeployment(release.native) &&
    isNonEmptyString(item.sourceReleaseId) &&
    isNonEmptyString(item.preparationId) &&
    typeof item.treeHash === 'string' &&
    /^[0-9a-f]{40}$/i.test(item.treeHash) &&
    typeof item.gitCommit === 'string' &&
    /^[0-9a-f]{40}$/i.test(item.gitCommit) &&
    isTargetRange(item.targetRange) &&
    isRevoPushFact({
      label: item.stagingLabel,
      packageHash: item.stagingPackageHash,
    }) &&
    item.sourceReleaseId === release.sourceReleaseId &&
    item.preparationId === release.preparationId &&
    item.treeHash === release.treeHash &&
    item.gitCommit === release.gitCommit &&
    item.targetRange === release.targetRange &&
    (promoted
      ? isRevoPushFact({ label: item.label, packageHash: item.packageHash }) &&
        item.releaseMethod === 'Promote' &&
        item.originalLabel === item.stagingLabel
      : item.label === null &&
        item.packageHash === null &&
        item.releaseMethod === null &&
        item.originalLabel === null)
  );
}

export function buildProductionOtaIntent(
  release: OtaReleaseRecord,
  platform: Platform,
): ProductionOtaRecord {
  const staging = release.platforms[platform].ota!.staging;
  if (staging?.status !== 'approved')
    throw new Error('Approved Staging OTA required.');
  return {
    status: 'intent',
    platform,
    deployment: getProductionDeployment(release.native),
    sourceReleaseId: release.sourceReleaseId,
    preparationId: release.preparationId,
    treeHash: release.treeHash,
    gitCommit: release.gitCommit,
    targetRange: release.targetRange,
    stagingLabel: staging.label,
    stagingPackageHash: staging.packageHash,
    label: null,
    packageHash: null,
    releaseMethod: null,
    originalLabel: null,
  };
}
