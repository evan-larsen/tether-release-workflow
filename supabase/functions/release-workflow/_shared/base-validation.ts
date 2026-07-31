import { isRevoPushFact } from './preview-validation.ts';
import {
  hasExactKeys,
  isNonEmptyString,
} from './state-validation-primitives.ts';

const DEPLOYMENTS = ['staging', 'production'];
const REGISTRATION_STATUSES = ['intent', 'retryable', 'unknown'];

export function isBase(
  value: unknown,
  artifact?: Record<string, unknown>,
): boolean {
  const base = value as Record<string, unknown>;
  const hasRegistration = Object.hasOwn(base ?? {}, 'registration');
  if (
    !hasExactKeys(value, [
      'status',
      'staging',
      'production',
      ...(hasRegistration ? ['registration'] : []),
    ]) ||
    !['pending', 'eligible', 'registered'].includes(String(base.status))
  )
    return false;
  if (hasRegistration) {
    const intent = base.registration as Record<string, unknown>;
    if (
      !hasExactKeys(intent, [
        'deployment',
        'status',
        'easBuildId',
        'appVersion',
        'buildNumber',
      ]) ||
      !DEPLOYMENTS.includes(String(intent.deployment)) ||
      !REGISTRATION_STATUSES.includes(String(intent.status)) ||
      !isNonEmptyString(intent.easBuildId) ||
      !isNonEmptyString(intent.appVersion) ||
      !isNonEmptyString(intent.buildNumber) ||
      (artifact &&
        (intent.easBuildId !== artifact.easBuildId ||
          intent.appVersion !== artifact.appVersion ||
          intent.buildNumber !== artifact.buildNumber))
    )
      return false;
  }
  if (base.status === 'pending')
    return (
      base.staging === null && base.production === null && !hasRegistration
    );
  if (base.status === 'eligible') {
    if (
      (base.staging !== null && !isRevoPushFact(base.staging)) ||
      base.production !== null
    )
      return false;
    const intent = base.registration as Record<string, unknown> | undefined;
    return (
      !intent ||
      (intent.deployment === 'staging'
        ? base.staging === null
        : base.staging !== null)
    );
  }
  return (
    !hasRegistration &&
    isRevoPushFact(base.staging) &&
    isRevoPushFact(base.production)
  );
}
