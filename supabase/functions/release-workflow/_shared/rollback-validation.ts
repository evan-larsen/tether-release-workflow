import {
  hasExactKeys,
  isNative,
  isNonEmptyString,
  isTimestamp,
} from './state-validation-primitives.ts';
import { isRevoPushFact } from './preview-validation.ts';
import { isTargetRange } from './staging-ota-validation.ts';
import type { RollbackRecord } from './types.ts';
const PLATFORMS = ['ios', 'android'] as const;
export function isRollbackRecord(value: unknown): value is RollbackRecord {
  if (
    !hasExactKeys(value, [
      'id',
      'native',
      'targetRange',
      'createdAt',
      'status',
      'platforms',
    ])
  )
    return false;
  const v = value as Record<string, unknown>;
  if (
    !isNonEmptyString(v.id) ||
    !isNative(v.native) ||
    !isTargetRange(v.targetRange) ||
    !isTimestamp(v.createdAt) ||
    !['in_progress', 'complete'].includes(String(v.status)) ||
    !hasExactKeys(v.platforms, PLATFORMS)
  )
    return false;
  return (
    PLATFORMS.every((platform) => {
      const p = (v.platforms as Record<string, Record<string, unknown>>)[
        platform
      ];
      const done = p.status === 'rolled_back';
      return (
        hasExactKeys(p, [
          'status',
          'platform',
          'deployment',
          'originalLabel',
          'originalPackageHash',
          'targetRange',
          'label',
          'packageHash',
          'releaseMethod',
          'originalLabelResult',
        ]) &&
        ['intent', 'retryable', 'unknown', 'rolled_back'].includes(
          String(p.status),
        ) &&
        p.platform === platform &&
        p.deployment === `production-${v.native}` &&
        isRevoPushFact({
          label: p.originalLabel,
          packageHash: p.originalPackageHash,
        }) &&
        p.targetRange === v.targetRange &&
        (done
          ? isRevoPushFact({ label: p.label, packageHash: p.packageHash }) &&
            p.releaseMethod === 'Rollback' &&
            p.originalLabelResult === p.originalLabel
          : p.label === null &&
            p.packageHash === null &&
            p.releaseMethod === null &&
            p.originalLabelResult === null)
      );
    }) &&
    (v.status !== 'complete' ||
      PLATFORMS.every(
        (p) =>
          (v.platforms as Record<string, Record<string, unknown>>)[p].status ===
          'rolled_back',
      ))
  );
}
