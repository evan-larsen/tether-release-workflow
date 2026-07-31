import {
  hasExactKeys,
  isNonEmptyString,
  isStrictVersion,
} from './state-validation-primitives.ts';
import { isRevoPushFact } from './preview-validation.ts';
import type { StagingOtaFact, StagingOtaIntent } from './types.ts';

export function isTargetRange(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^>=(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value) &&
    isStrictVersion(value.slice(2))
  );
}

export function getStagingOtaDescription(
  release: Record<string, unknown>,
  platform: string,
): string {
  return `tether-staging-ota:${release.id}:${platform}:${release.treeHash}`;
}

export function isStagingOtaIntent(
  value: unknown,
  platform: string,
  release: Record<string, unknown>,
): value is StagingOtaIntent {
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
      'description',
    ])
  )
    return false;
  return (
    ['intent', 'retryable', 'unknown'].includes(String(value.status)) &&
    value.platform === platform &&
    value.deployment === 'staging' &&
    isNonEmptyString(value.sourceReleaseId) &&
    isNonEmptyString(value.preparationId) &&
    typeof value.treeHash === 'string' &&
    /^[0-9a-f]{40}$/i.test(value.treeHash) &&
    typeof value.gitCommit === 'string' &&
    /^[0-9a-f]{40}$/i.test(value.gitCommit) &&
    isTargetRange(value.targetRange) &&
    isNonEmptyString(value.description) &&
    value.sourceReleaseId === release.sourceReleaseId &&
    value.preparationId === release.preparationId &&
    value.treeHash === release.treeHash &&
    value.gitCommit === release.gitCommit &&
    value.targetRange === release.targetRange &&
    value.description === getStagingOtaDescription(release, platform)
  );
}

export function isStagingOtaFact(value: unknown): value is StagingOtaFact {
  const hasMandatory = Object.hasOwn(value as object, 'mandatory');
  if (
    !hasExactKeys(value, [
      'label',
      'packageHash',
      'releaseMethod',
      'targetRange',
      'description',
      'status',
      ...(hasMandatory ? ['mandatory'] : []),
    ])
  )
    return false;
  return (
    isRevoPushFact({ label: value.label, packageHash: value.packageHash }) &&
    value.releaseMethod === 'Upload' &&
    isTargetRange(value.targetRange) &&
    isNonEmptyString(value.description) &&
    (!hasMandatory || typeof value.mandatory === 'boolean') &&
    ['published', 'approved'].includes(String(value.status))
  );
}

export function isStagingOta(
  value: unknown,
  platform: string,
  release: Record<string, unknown>,
): boolean {
  return (
    value === null ||
    isStagingOtaIntent(value, platform, release) ||
    isStagingOtaFact(value)
  );
}
