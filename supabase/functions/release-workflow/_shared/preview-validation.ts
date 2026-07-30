import {
  hasExactKeys,
  isNonEmptyString,
  isTimestamp,
} from './state-validation-primitives.ts';

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

function isPreviewPlatform(value: unknown): boolean {
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
      (!hasExactKeys(value.stagingBase, [
        'easBuildId',
        'label',
        'packageHash',
      ]) ||
        !isNonEmptyString(value.stagingBase.easBuildId) ||
        !isNonEmptyString(value.stagingBase.label) ||
        !isNonEmptyString(value.stagingBase.packageHash) ||
        (value.attempts.at(-1) as Record<string, unknown> | undefined)
          ?.easBuildId !== value.stagingBase.easBuildId ||
        (value.attempts.at(-1) as Record<string, unknown> | undefined)
          ?.status !== 'succeeded')) ||
    (value.stagingOta !== null &&
      (!hasExactKeys(value.stagingOta, [
        'baseEasBuildId',
        'label',
        'packageHash',
      ]) ||
        !isNonEmptyString(value.stagingOta.baseEasBuildId) ||
        !isNonEmptyString(value.stagingOta.label) ||
        !isNonEmptyString(value.stagingOta.packageHash) ||
        (value.stagingBase as Record<string, unknown> | null)?.easBuildId !==
          value.stagingOta.baseEasBuildId))
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
      record.stagingBase !== null &&
      record.stagingOta !== null
    );
  });
}

export function isPreview(value: unknown): boolean {
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
  if (!PLATFORMS.every((platform) => isPreviewPlatform(platforms[platform])))
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
