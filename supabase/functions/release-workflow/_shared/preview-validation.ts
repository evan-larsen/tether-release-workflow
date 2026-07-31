import {
  hasExactKeys,
  isNonEmptyString,
  isTimestamp,
} from './state-validation-primitives.ts';
import {
  isLegacyPreviewBase,
  isLegacyPreviewOta,
  isPreviewBaseOperation,
  isPreviewOtaOperation,
  isVerifiedPreviewBase,
  isVerifiedPreviewOta,
} from './preview-staging-validation.ts';

const PLATFORMS = ['ios', 'android'] as const;

export function isRevoPushFact(value: unknown): boolean {
  return (
    hasExactKeys(value, ['label', 'packageHash']) &&
    isNonEmptyString(value.label) &&
    isNonEmptyString(value.packageHash)
  );
}

function isPreviewAttempt(value: unknown): boolean {
  return (
    hasExactKeys(value, [
      'easBuildId',
      'appVersion',
      'buildNumber',
      'profile',
      'status',
    ]) &&
    isNonEmptyString(value.easBuildId) &&
    isNonEmptyString(value.appVersion) &&
    isNonEmptyString(value.buildNumber) &&
    value.profile === 'preview' &&
    ['requested', 'succeeded', 'failed'].includes(String(value.status))
  );
}

function isPreviewPlatform(
  value: unknown,
  platform: string,
  release: Record<string, unknown>,
): boolean {
  if (
    !hasExactKeys(value, ['attempts', 'stagingBase', 'stagingOta']) ||
    !Array.isArray(value.attempts) ||
    !value.attempts.every(isPreviewAttempt) ||
    !value.attempts
      .slice(0, -1)
      .every(
        (attempt) => (attempt as Record<string, unknown>).status === 'failed',
      ) ||
    new Set(
      value.attempts.map((attempt) =>
        String((attempt as Record<string, unknown>).easBuildId),
      ),
    ).size !== value.attempts.length ||
    (value.stagingBase !== null &&
      !isLegacyPreviewBase(
        value.stagingBase,
        value.attempts as Array<Record<string, unknown>>,
      ) &&
      !isPreviewBaseOperation(
        value.stagingBase,
        platform,
        release,
        value.attempts as Array<Record<string, unknown>>,
      )) ||
    (value.stagingOta !== null &&
      !isLegacyPreviewOta(value.stagingOta, value.stagingBase) &&
      !isPreviewOtaOperation(
        value.stagingOta,
        platform,
        release,
        value.stagingBase,
      ))
  )
    return false;
  return true;
}

function hasAllFacts(value: Record<string, unknown>): boolean {
  const platforms = value.platforms as Record<string, Record<string, unknown>>;
  return PLATFORMS.every((platform) => {
    const record = platforms[platform];
    return (
      (record.attempts as Array<Record<string, unknown>>).some(
        (attempt) => attempt.status === 'succeeded',
      ) &&
      isVerifiedPreviewBase(record.stagingBase) &&
      isVerifiedPreviewOta(record.stagingOta)
    );
  });
}

export function isPreview(
  value: unknown,
  release: Record<string, unknown>,
): boolean {
  if (
    !hasExactKeys(value, ['status', 'platforms', 'smokeApprovedAt']) ||
    !['required', 'building', 'smoke_pending', 'approved'].includes(
      String(value.status),
    ) ||
    !hasExactKeys(value.platforms, PLATFORMS) ||
    (value.smokeApprovedAt !== null && !isTimestamp(value.smokeApprovedAt))
  )
    return false;
  const platforms = value.platforms as Record<string, unknown>;
  if (
    !PLATFORMS.every((platform) =>
      isPreviewPlatform(platforms[platform], platform, release),
    )
  )
    return false;
  const allFacts = hasAllFacts(value);
  if (value.status === 'required') {
    return (
      value.smokeApprovedAt === null &&
      PLATFORMS.every((platform) => {
        const record = platforms[platform] as Record<string, unknown>;
        return (
          (record.attempts as unknown[]).length === 0 &&
          record.stagingBase === null &&
          record.stagingOta === null
        );
      })
    );
  }
  if (value.status === 'building')
    return value.smokeApprovedAt === null && !allFacts;
  if (value.status === 'smoke_pending')
    return value.smokeApprovedAt === null && allFacts;
  return value.smokeApprovedAt !== null && allFacts;
}
