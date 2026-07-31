import {
  getPlatformPreparations,
  getPublicPlatforms,
  hasRegisteredProductionBase,
} from './platform-preparation-validation.ts';
import { equal } from './update-validation-utils.ts';

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
