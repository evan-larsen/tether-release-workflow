import {
  getPlatformPreparations,
  getPublicPlatforms,
  hasRegisteredProductionBase,
} from './platform-preparation-validation.ts';
import { equal } from './update-validation-utils.ts';
import { isNonEmptyString } from './state-validation-primitives.ts';

export function getPlatformCorrectionUpdateKind(
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
): string | null {
  if (
    previous.releaseType !== 'store' ||
    next.releaseType !== 'store' ||
    previous.status !== 'in_progress' ||
    next.status !== 'in_progress' ||
    previous.version !== next.version ||
    previous.native !== next.native
  )
    return null;
  const publicPlatforms = getPublicPlatforms(previous);
  if (publicPlatforms.length !== 1) return null;
  const target = publicPlatforms[0] === 'ios' ? 'android' : 'ios';
  if (hasRegisteredProductionBase(previous, target)) return null;
  const before = getPlatformPreparations(previous);
  const after = getPlatformPreparations(next);
  if (
    !Object.hasOwn(next, 'platformPreparations') ||
    after.length !== before.length + 1
  )
    return null;
  const added = after.at(-1)!;
  if (
    added.platform !== target ||
    added.status !== 'prepared' ||
    added.treeHash ===
      (previous.preparation as Record<string, unknown>).treeHash
  )
    return null;
  const activeIndex = before.findIndex(
    (item) => item.platform === target && item.status === 'prepared',
  );
  const expected = structuredClone(previous) as Record<string, unknown> & {
    platformPreparations: Array<Record<string, unknown>>;
  };
  expected.platformPreparations = before.map((item, index) =>
    index === activeIndex ? { ...item, status: 'superseded' } : item,
  );
  expected.platformPreparations.push(added);
  if (!equal(expected, next)) return null;
  return activeIndex >= 0
    ? 'platform_correction_superseded'
    : 'platform_correction_prepared';
}

export function getCorrectionPreviewUpdateKind(
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
): string | null {
  if (
    !equal(
      { ...previous, platformPreparations: undefined },
      { ...next, platformPreparations: undefined },
    )
  )
    return null;
  const before = getPlatformPreparations(previous),
    after = getPlatformPreparations(next);
  if (before.length !== after.length) return null;
  const changed = before
    .map((item, index) => (equal(item, after[index]) ? -1 : index))
    .filter((index) => index >= 0);
  if (changed.length !== 1) return null;
  const oldItem = before[changed[0]],
    newItem = after[changed[0]];
  if (
    oldItem.status !== 'prepared' ||
    newItem.status !== 'prepared' ||
    !equal(
      { ...oldItem, preview: undefined },
      { ...newItem, preview: undefined },
    )
  )
    return null;
  const oldPreview = (oldItem.preview as
    Record<string, unknown> | undefined) ?? { attempts: [], stagingBase: null };
  const newPreview = newItem.preview as Record<string, unknown> | undefined;
  if (!newPreview) return null;
  const oldAttempts = oldPreview.attempts as Array<Record<string, unknown>>,
    newAttempts = newPreview.attempts as Array<Record<string, unknown>>;
  if (
    equal(oldPreview.stagingBase, newPreview.stagingBase) &&
    newAttempts.length === oldAttempts.length + 1 &&
    oldAttempts.every((item, index) => equal(item, newAttempts[index])) &&
    newAttempts.at(-1)?.status === 'requested'
  )
    return 'correction_preview_build_requested';
  if (
    equal(oldPreview.stagingBase, newPreview.stagingBase) &&
    oldAttempts.length === newAttempts.length &&
    oldAttempts.length > 0 &&
    oldAttempts.at(-1)?.status === 'requested' &&
    ['succeeded', 'failed'].includes(String(newAttempts.at(-1)?.status)) &&
    equal(
      { ...oldAttempts.at(-1), status: newAttempts.at(-1)?.status },
      newAttempts.at(-1),
    )
  )
    return 'correction_preview_build_resolved';
  if (
    oldPreview.stagingBase === null &&
    (newPreview.stagingBase as Record<string, unknown> | null)?.status ===
      'clear_intent' &&
    equal(oldAttempts, newAttempts)
  )
    return 'correction_staging_clear_intent';
  const oldBase = oldPreview.stagingBase as Record<string, unknown> | null,
    newBase = newPreview.stagingBase as Record<string, unknown> | null;
  if (!equal(oldAttempts, newAttempts) || !oldBase || !newBase) return null;
  if (
    oldBase.status === 'clear_intent' &&
    newBase.status === 'clearing' &&
    equal({ ...oldBase, status: 'clearing' }, newBase)
  )
    return 'correction_staging_clearing';
  if (
    oldBase.status === 'clearing' &&
    ['cleared', 'unknown'].includes(String(newBase.status)) &&
    equal({ ...oldBase, status: newBase.status }, newBase)
  )
    return 'correction_staging_clear_resolved';
  if (
    ['cleared', 'unknown'].includes(String(oldBase.status)) &&
    newBase.status === 'registered' &&
    oldBase.easBuildId === newBase.easBuildId &&
    oldBase.label === null &&
    oldBase.packageHash === null &&
    isNonEmptyString(newBase.label) &&
    isNonEmptyString(newBase.packageHash)
  )
    return 'correction_staging_base_registered';
  return null;
}
