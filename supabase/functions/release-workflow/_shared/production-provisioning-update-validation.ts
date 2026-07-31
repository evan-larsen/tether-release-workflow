import type { ReleaseState, StoreReleaseRecord } from './types.ts';
import { getNextNative } from './state-validation.ts';
import { buildProductionProvisioning } from './production-provisioning-validation.ts';
import { clone, equal } from './update-validation-utils.ts';

export function canBeginProductionProvisioning(
  state: ReleaseState,
  release: StoreReleaseRecord,
): boolean {
  const candidates = state.releases.filter(
    (item) =>
      item.releaseType === 'store' &&
      item.status === 'in_progress' &&
      item.nativeFloorVersion !== null &&
      item.native !== state.currentNative,
  );
  return (
    release.status === 'in_progress' &&
    release.nativeFloorVersion !== null &&
    release.native === getNextNative(state.currentNative) &&
    release.preview?.status === 'approved' &&
    !Object.hasOwn(release, 'productionProvisioning') &&
    candidates.length === 1 &&
    candidates[0].id === release.id &&
    (['ios', 'android'] as const).every(
      (platform) => release.platforms[platform].attempts.length === 0,
    )
  );
}

export function getProductionProvisioningUpdateKind(
  previous: StoreReleaseRecord,
  next: StoreReleaseRecord,
  state: ReleaseState,
): string | null {
  const before = previous.productionProvisioning;
  const after = next.productionProvisioning;
  if (!before && after) {
    const expected = clone(previous);
    expected.productionProvisioning = buildProductionProvisioning(previous);
    return canBeginProductionProvisioning(state, previous) &&
      equal(expected, next)
      ? 'production_provisioning_intent'
      : null;
  }
  if (!before || !after) return null;
  for (const platform of ['ios', 'android'] as const) {
    const oldRecord = before.platforms[platform];
    const newRecord = after.platforms[platform];
    const expected = clone(previous);
    if (
      oldRecord.status === 'intent' &&
      ['retryable', 'unknown', 'deployment_ready'].includes(newRecord.status)
    ) {
      expected.productionProvisioning!.platforms[platform].status =
        newRecord.status;
      if (equal(expected, next)) return 'production_provisioning_outcome';
    }
    if (oldRecord.status === 'retryable' && newRecord.status === 'intent') {
      expected.productionProvisioning!.platforms[platform].status = 'intent';
      if (equal(expected, next)) return 'production_provisioning_retry';
    }
    if (
      ['intent', 'deployment_ready'].includes(oldRecord.status) &&
      newRecord.status === 'unknown'
    ) {
      expected.productionProvisioning!.platforms[platform].status = 'unknown';
      if (equal(expected, next)) return 'production_provisioning_unknown';
    }
    if (
      oldRecord.status === 'deployment_ready' &&
      newRecord.status === 'eas_configured'
    ) {
      expected.productionProvisioning!.platforms[platform] = newRecord;
      if (equal(expected, next)) return 'production_eas_configured';
    }
    if (
      oldRecord.status === 'unknown' &&
      newRecord.status === 'eas_configured'
    ) {
      expected.productionProvisioning!.platforms[platform] = newRecord;
      if (equal(expected, next)) return 'production_eas_reconciled';
    }
  }
  return null;
}
