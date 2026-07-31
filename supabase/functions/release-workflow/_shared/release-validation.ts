import { isPreview } from './preview-validation.ts';
import type { OtaReleaseRecord, Platform } from './types.ts';
import { isProductionAttempt } from './production-attempt-validation.ts';
import {
  hasExactKeys,
  isNative,
  isNonEmptyString,
  isStrictVersion,
  isTimestamp,
} from './state-validation-primitives.ts';
import { hasValidPlatformPreparations } from './platform-preparation-validation.ts';
import { isAdoptedBaseline } from './legacy-baseline-validation.ts';
import {
  isStagingOta,
  isStagingOtaFact,
  isTargetRange,
} from './staging-ota-validation.ts';
import { isProductionOta } from './production-ota-validation.ts';
import { isProductionProvisioning } from './production-provisioning-validation.ts';
import { isEmergencyOta } from './emergency-ota-validation.ts';

const PLATFORMS = ['ios', 'android'] as const;
function isOta(
  value: unknown,
  platform: string,
  release: Record<string, unknown>,
): boolean {
  if (!hasExactKeys(value, ['staging', 'production'])) return false;
  if (!isStagingOta(value.staging, platform, release)) return false;
  if (!isStagingOtaFact(value.staging)) return value.production === null;
  return (
    value.production === null ||
    (value.staging.status === 'approved' &&
      isProductionOta(
        value.production,
        platform as Platform,
        release as unknown as OtaReleaseRecord,
      ))
  );
}
function isPlatformRelease(
  value: unknown,
  type: unknown,
  releaseVersion: unknown,
  platform: string,
  release: Record<string, unknown>,
): boolean {
  return (
    hasExactKeys(value, ['attempts', 'ota']) &&
    Array.isArray(value.attempts) &&
    value.attempts.every((attempt) =>
      isProductionAttempt(attempt, releaseVersion),
    ) &&
    value.attempts.slice(0, -1).every((attempt) => {
      const record = attempt as Record<string, unknown>;
      return (
        record.status === 'failed' ||
        ((record.storeStatus as Record<string, unknown> | null)?.status ===
          'rejected' &&
          !(record.base as Record<string, unknown> | null)?.production)
      );
    }) &&
    new Set(
      value.attempts.map((attempt) =>
        String((attempt as Record<string, unknown>).easBuildId),
      ),
    ).size === value.attempts.length &&
    (type === 'store'
      ? value.ota === null
      : value.attempts.length === 0 && isOta(value.ota, platform, release))
  );
}
function isPreparation(value: unknown): value is Record<string, unknown> {
  return (
    hasExactKeys(value, [
      'preparationId',
      'treeHash',
      'preparedCommit',
      'marketingVersion',
      'nativeGeneration',
      'preparedAt',
      'status',
    ]) &&
    isNonEmptyString(value.preparationId) &&
    typeof value.treeHash === 'string' &&
    /^[0-9a-f]{40}$/i.test(value.treeHash) &&
    typeof value.preparedCommit === 'string' &&
    /^[0-9a-f]{40}$/i.test(value.preparedCommit) &&
    isStrictVersion(value.marketingVersion) &&
    isNative(value.nativeGeneration) &&
    isTimestamp(value.preparedAt) &&
    value.status === 'prepared'
  );
}
function hasCompleteProduction(value: Record<string, unknown>): boolean {
  const platforms = value.platforms as Record<
    string,
    { attempts: Array<Record<string, unknown>>; ota: Record<string, unknown> }
  >;
  return value.releaseType === 'store'
    ? PLATFORMS.every((platform) =>
        platforms[platform].attempts.some(
          (attempt) =>
            (attempt.base as Record<string, unknown> | null)?.status ===
            'registered',
        ),
      )
    : PLATFORMS.every(
        (platform) =>
          (platforms[platform].ota.production as Record<string, unknown> | null)
            ?.status === 'promoted',
      );
}

export function isRelease(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const release = value as Record<string, unknown>;
  if (release.releaseType === 'adopted_baseline')
    return isAdoptedBaseline(release);
  if (
    !isNonEmptyString(release.id) ||
    !isStrictVersion(release.version) ||
    !isNative(release.native) ||
    !isTimestamp(release.createdAt) ||
    !['in_progress', 'superseded', 'complete'].includes(
      String(release.status),
    ) ||
    !hasExactKeys(release.platforms, PLATFORMS)
  )
    return false;
  const hasSupersededReason = Object.hasOwn(release, 'supersededReason');
  if (
    hasSupersededReason &&
    (release.status !== 'superseded' ||
      release.supersededReason !== 'pre_baseline_adoption')
  )
    return false;
  const platforms = release.platforms as Record<string, unknown>;
  if (
    !PLATFORMS.every((platform) =>
      isPlatformRelease(
        platforms[platform],
        release.releaseType,
        release.version,
        platform,
        release,
      ),
    )
  )
    return false;
  if (release.releaseType === 'store') {
    const preparation = release.preparation;
    const productionCommit = release.productionCommit;
    if (
      !hasExactKeys(release, [
        'id',
        'version',
        'preparation',
        'productionCommit',
        'native',
        'nativeFloorVersion',
        'preview',
        'createdAt',
        'releaseType',
        'status',
        'platforms',
        ...(hasSupersededReason ? ['supersededReason'] : []),
        ...(Object.hasOwn(release, 'platformPreparations')
          ? ['platformPreparations']
          : []),
        ...(Object.hasOwn(release, 'productionProvisioning')
          ? ['productionProvisioning']
          : []),
      ]) ||
      !isPreparation(preparation) ||
      preparation.marketingVersion !== release.version ||
      preparation.nativeGeneration !== release.native ||
      preparation.preparedAt !== release.createdAt ||
      (productionCommit !== null &&
        (typeof productionCommit !== 'string' ||
          !/^[0-9a-f]{40}$/i.test(productionCommit))) ||
      !(
        (release.nativeFloorVersion === null && release.preview === null) ||
        (release.nativeFloorVersion === release.version &&
          isPreview(release.preview, release) &&
          PLATFORMS.every((platform) =>
            (
              (release.preview as Record<string, unknown>).platforms as Record<
                string,
                { attempts: Array<{ appVersion: string }> }
              >
            )[platform].attempts.every(
              (attempt) => attempt.appVersion === release.version,
            ),
          ))
      ) ||
      !hasValidPlatformPreparations(release) ||
      (Object.hasOwn(release, 'productionProvisioning') &&
        !isProductionProvisioning(release.productionProvisioning, release))
    )
      return false;
  } else if (
    release.releaseType !== 'ota' ||
    !hasExactKeys(release, [
      'id',
      'version',
      'sourceReleaseId',
      'preparationId',
      'treeHash',
      'gitCommit',
      'targetRange',
      'native',
      'createdAt',
      'releaseType',
      'status',
      'platforms',
      ...(Object.hasOwn(release, 'emergency') ? ['emergency'] : []),
      ...(hasSupersededReason ? ['supersededReason'] : []),
    ]) ||
    !isNonEmptyString(release.sourceReleaseId) ||
    !isNonEmptyString(release.preparationId) ||
    typeof release.treeHash !== 'string' ||
    !/^[0-9a-f]{40}$/i.test(release.treeHash) ||
    typeof release.gitCommit !== 'string' ||
    !/^[0-9a-f]{40}$/i.test(release.gitCommit) ||
    !isTargetRange(release.targetRange) ||
    (Object.hasOwn(release, 'emergency') &&
      !isEmergencyOta(release.emergency, release))
  )
    return false;
  return release.status !== 'complete' || hasCompleteProduction(release);
}
