import {
  isNative,
  isTimestamp,
  hasExactKeys,
} from './state-validation-primitives.ts';

export function isEmergencyOta(
  value: unknown,
  release: Record<string, unknown>,
): boolean {
  if (
    !hasExactKeys(value, [
      'kind',
      'mode',
      'mandatory',
      'installStrategy',
      'jsOnlyAttestedAt',
      'sourceCommit',
      'productionCommit',
      'currentNative',
      'nativeFloorVersion',
    ])
  )
    return false;
  const item = value as Record<string, unknown>;
  const urgent = item.mode === 'urgent';
  return (
    item.kind === 'emergency_ota' &&
    (item.mode === 'normal' || urgent) &&
    item.mandatory === urgent &&
    item.installStrategy === (urgent ? 'immediate' : 'next_restart') &&
    isTimestamp(item.jsOnlyAttestedAt) &&
    typeof item.sourceCommit === 'string' &&
    /^[0-9a-f]{40}$/i.test(item.sourceCommit) &&
    (item.productionCommit === null ||
      (typeof item.productionCommit === 'string' &&
        /^[0-9a-f]{40}$/i.test(item.productionCommit))) &&
    isNative(item.currentNative) &&
    item.currentNative === release.native &&
    typeof item.nativeFloorVersion === 'string' &&
    release.targetRange === `>=${item.nativeFloorVersion}` &&
    item.sourceCommit === release.gitCommit
  );
}
