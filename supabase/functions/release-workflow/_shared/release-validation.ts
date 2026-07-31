import { isPreview, isRevoPushFact } from './preview-validation.ts';
import { isProductionAttempt } from './production-attempt-validation.ts';
import {
  hasExactKeys,
  isNative,
  isNonEmptyString,
  isStrictVersion,
  isTimestamp,
} from './state-validation-primitives.ts';
import { hasValidPlatformPreparations } from './platform-preparation-validation.ts';

const PLATFORMS = ['ios', 'android'] as const;
function isOta(value: unknown): boolean {
  if (!hasExactKeys(value, ['staging', 'production'])) return false;
  if (value.staging === null) return value.production === null;
  if (
    !hasExactKeys(value.staging, ['label', 'packageHash', 'status']) ||
    !isRevoPushFact({
      label: value.staging.label,
      packageHash: value.staging.packageHash,
    }) ||
    !['published', 'approved'].includes(String(value.staging.status))
  )
    return false;
  return (
    value.production === null ||
    (value.staging.status === 'approved' && isRevoPushFact(value.production))
  );
}
function isPlatformRelease(
  value: unknown,
  type: unknown,
  releaseVersion: unknown,
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
      : value.attempts.length === 0 && isOta(value.ota))
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
    : PLATFORMS.every((platform) => platforms[platform].ota.production);
}

export function isRelease(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const release = value as Record<string, unknown>;
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
  const platforms = release.platforms as Record<string, unknown>;
  if (
    !PLATFORMS.every((platform) =>
      isPlatformRelease(
        platforms[platform],
        release.releaseType,
        release.version,
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
        ...(Object.hasOwn(release, 'platformPreparations')
          ? ['platformPreparations']
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
          isPreview(release.preview) &&
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
      !hasValidPlatformPreparations(release)
    )
      return false;
  } else if (
    release.releaseType !== 'ota' ||
    !hasExactKeys(release, [
      'id',
      'version',
      'gitCommit',
      'native',
      'createdAt',
      'releaseType',
      'status',
      'platforms',
    ]) ||
    !isNonEmptyString(release.gitCommit)
  )
    return false;
  return release.status !== 'complete' || hasCompleteProduction(release);
}
