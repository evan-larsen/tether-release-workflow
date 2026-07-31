import type { Platform, ReleaseRecord } from './types.ts';
import { clone, equal } from './update-validation-utils.ts';

const PLATFORMS: Platform[] = ['ios', 'android'];

export function getBaseLifecycleKind(
  oldBase: Record<string, unknown> | null,
  newBase: Record<string, unknown> | null,
  artifact: Record<string, unknown>,
): string | null {
  if (!oldBase || !newBase) return null;
  const registration = newBase.registration as
    Record<string, unknown> | undefined;
  if (!oldBase.registration && registration) {
    const expected = {
      ...oldBase,
      registration: {
        deployment: registration.deployment,
        status: 'intent',
        easBuildId: artifact.easBuildId,
        appVersion: artifact.appVersion,
        buildNumber: artifact.buildNumber,
      },
    };
    if (oldBase.status === 'eligible' && equal(expected, newBase))
      return 'base_registration_intent';
  }
  if (
    oldBase.registration &&
    registration &&
    ['retryable', 'unknown'].includes(String(registration.status))
  ) {
    const expected = clone(oldBase);
    (expected.registration as Record<string, unknown>).status =
      registration.status;
    if (equal(expected, newBase)) return 'base_registration_outcome';
  }
  const intent = oldBase.registration as Record<string, unknown> | undefined;
  if (!intent) return null;
  const deployment = String(intent.deployment) as 'staging' | 'production';
  const expected = {
    status: deployment === 'production' ? 'registered' : 'eligible',
    staging: oldBase.staging,
    production: oldBase.production,
    [deployment]: newBase[deployment],
  };
  if (
    newBase[deployment] &&
    equal(expected, newBase) &&
    (deployment !== 'production' || oldBase.staging === null || oldBase.staging)
  )
    return `${deployment}_base_registered`;
  return null;
}

export function getAdoptedUpdateKind(
  previous: ReleaseRecord,
  next: ReleaseRecord,
): string | null {
  if (
    previous.releaseType !== 'adopted_baseline' ||
    next.releaseType !== 'adopted_baseline'
  )
    return null;
  for (const platform of PLATFORMS) {
    const before = previous.artifacts[platform];
    const after = next.artifacts[platform];
    const expected = clone(previous);
    if (
      Date.parse(after.storeStatus.checkedAt) >
      Date.parse(before.storeStatus.checkedAt)
    ) {
      expected.artifacts[platform].storeStatus = after.storeStatus;
      if (equal(expected, next)) return 'adopted_store_status_saved';
    }
    expected.artifacts[platform].base = after.base;
    if (
      getBaseLifecycleKind(
        before.base as unknown as Record<string, unknown>,
        after.base as unknown as Record<string, unknown>,
        before as unknown as Record<string, unknown>,
      ) &&
      equal(expected, next)
    )
      return 'adopted_base_updated';
  }
  return null;
}
