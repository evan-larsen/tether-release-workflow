import { isRevoPushFact } from './preview-validation.ts';
import {
  hasExactKeys,
  isNonEmptyString,
  isTimestamp,
} from './state-validation-primitives.ts';

const STORE_STATUSES = [
  'live',
  'approved_not_live',
  'pending',
  'rejected',
  'not_found',
  'unknown',
];

function isBuild(value: Record<string, unknown>): boolean {
  return (
    isNonEmptyString(value.easBuildId) &&
    isNonEmptyString(value.appVersion) &&
    isNonEmptyString(value.buildNumber) &&
    isNonEmptyString(value.profile) &&
    ['requested', 'succeeded', 'failed'].includes(String(value.status))
  );
}

function isSubmission(value: unknown): boolean {
  return (
    hasExactKeys(value, ['id', 'status']) &&
    isNonEmptyString(value.id) &&
    ['pending', 'submitted', 'failed', 'unknown'].includes(String(value.status))
  );
}

function isStoreStatus(value: unknown): boolean {
  return (
    hasExactKeys(value, ['status', 'providerState', 'checkedAt']) &&
    STORE_STATUSES.includes(String(value.status)) &&
    (value.providerState === null || isNonEmptyString(value.providerState)) &&
    isTimestamp(value.checkedAt)
  );
}

function isBase(value: unknown): boolean {
  if (
    !hasExactKeys(value, ['status', 'staging', 'production']) ||
    !['pending', 'eligible', 'registered'].includes(String(value.status))
  )
    return false;
  if (value.status === 'pending')
    return value.staging === null && value.production === null;
  if (value.status === 'eligible')
    return (
      (value.staging === null || isRevoPushFact(value.staging)) &&
      value.production === null
    );
  return isRevoPushFact(value.staging) && isRevoPushFact(value.production);
}

export function isProductionAttempt(
  value: unknown,
  releaseVersion: unknown,
): boolean {
  const hasSourcePreparation =
    !!value &&
    typeof value === 'object' &&
    Object.hasOwn(value, 'sourcePreparationId');
  if (
    !hasExactKeys(
      value,
      hasSourcePreparation
        ? [
            'easBuildId',
            'appVersion',
            'buildNumber',
            'profile',
            'status',
            'submissions',
            'storeStatus',
            'base',
            'sourcePreparationId',
          ]
        : [
            'easBuildId',
            'appVersion',
            'buildNumber',
            'profile',
            'status',
            'submissions',
            'storeStatus',
            'base',
          ],
    ) ||
    !isBuild(value) ||
    value.appVersion !== releaseVersion ||
    value.profile !== 'production' ||
    !Array.isArray(value.submissions) ||
    !value.submissions.every(isSubmission) ||
    new Set(
      value.submissions.map((item) =>
        String((item as Record<string, unknown>).id),
      ),
    ).size !== value.submissions.length ||
    (hasSourcePreparation && !isNonEmptyString(value.sourcePreparationId)) ||
    (value.storeStatus !== null && !isStoreStatus(value.storeStatus)) ||
    (value.base !== null && !isBase(value.base))
  )
    return false;
  return (
    (value.storeStatus === null && value.base === null) ||
    (value.submissions.at(-1) as Record<string, unknown> | undefined)
      ?.status === 'submitted'
  );
}
