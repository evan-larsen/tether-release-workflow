import {
  hasExactKeys,
  isNonEmptyString,
  isTimestamp,
} from './state-validation-primitives.ts';

const PLATFORMS = ['ios', 'android'] as const;

export function getPlatformPreparations(
  release: Record<string, unknown>,
): Array<Record<string, unknown>> {
  return (release.platformPreparations as Array<Record<string, unknown>>) ?? [];
}

function isPlatformPreparation(
  value: unknown,
): value is Record<string, unknown> {
  return (
    hasExactKeys(value, [
      'preparationId',
      'platform',
      'treeHash',
      'preparedCommit',
      'preparedAt',
      'status',
    ]) &&
    isNonEmptyString(value.preparationId) &&
    PLATFORMS.includes(value.platform as (typeof PLATFORMS)[number]) &&
    typeof value.treeHash === 'string' &&
    /^[0-9a-f]{40}$/i.test(value.treeHash) &&
    typeof value.preparedCommit === 'string' &&
    /^[0-9a-f]{40}$/i.test(value.preparedCommit) &&
    isTimestamp(value.preparedAt) &&
    ['prepared', 'superseded'].includes(String(value.status))
  );
}

export function hasValidPlatformPreparations(
  release: Record<string, unknown>,
): boolean {
  const preparations = getPlatformPreparations(release);
  if (
    !Array.isArray(preparations) ||
    !preparations.every(isPlatformPreparation)
  )
    return false;
  if (
    new Set(
      preparations.map((preparation) => String(preparation.preparationId)),
    ).size !== preparations.length
  )
    return false;
  return PLATFORMS.every((platform) => {
    const scoped = preparations.filter(
      (preparation) => preparation.platform === platform,
    );
    return (
      scoped.filter((preparation) => preparation.status === 'prepared')
        .length <= 1 &&
      scoped
        .slice(0, -1)
        .every((preparation) => preparation.status === 'superseded')
    );
  });
}

export function getActivePreparationId(
  release: Record<string, unknown>,
  platform: string,
): string {
  const scoped = getPlatformPreparations(release)
    .filter(
      (preparation) =>
        preparation.platform === platform && preparation.status === 'prepared',
    )
    .at(-1);
  return String(
    scoped?.preparationId ??
      (release.preparation as Record<string, unknown>).preparationId,
  );
}

export function hasKnownPreparation(
  release: Record<string, unknown>,
  platform: string,
  preparationId: unknown,
): boolean {
  if (!isNonEmptyString(preparationId)) return false;
  if (
    (release.preparation as Record<string, unknown>).preparationId ===
    preparationId
  )
    return true;
  return getPlatformPreparations(release).some(
    (preparation) =>
      preparation.platform === platform &&
      preparation.preparationId === preparationId,
  );
}

export function hasRegisteredProductionBase(
  release: Record<string, unknown>,
  platform: string,
): boolean {
  const platforms = release.platforms as Record<
    string,
    { attempts: Array<{ base: { status: string } | null }> }
  >;
  return platforms[platform].attempts.some(
    (attempt) => attempt.base?.status === 'registered',
  );
}

export function hasPlatformPublicProgress(
  release: Record<string, unknown>,
  platform: string,
): boolean {
  const platforms = release.platforms as Record<
    string,
    {
      attempts: Array<{
        base: { status: string } | null;
        storeStatus: { status: string } | null;
      }>;
    }
  >;
  return platforms[platform].attempts.some(
    (attempt) =>
      attempt.base?.status === 'registered' ||
      attempt.storeStatus?.status === 'live',
  );
}

export function getPublicPlatforms(release: Record<string, unknown>): string[] {
  return PLATFORMS.filter((platform) =>
    hasPlatformPublicProgress(release, platform),
  );
}
