import {
  hasExactKeys,
  isNonEmptyString,
  isTimestamp,
} from './state-validation-primitives.ts';

const PLATFORMS = ['ios', 'android'] as const;

function isCorrectionPreviewAttempt(value: unknown): boolean {
  return (
    hasExactKeys(value, [
      'easBuildId',
      'appVersion',
      'buildNumber',
      'profile',
      'status',
    ]) &&
    ['easBuildId', 'appVersion', 'buildNumber', 'profile'].every((key) =>
      isNonEmptyString((value as Record<string, unknown>)[key]),
    ) &&
    (value as Record<string, unknown>).profile === 'preview' &&
    ['requested', 'succeeded', 'failed'].includes(
      String((value as Record<string, unknown>).status),
    )
  );
}

function isCorrectionPreview(value: unknown): boolean {
  if (!hasExactKeys(value, ['attempts', 'stagingBase'])) return false;
  const preview = value as Record<string, unknown>;
  if (
    !Array.isArray(preview.attempts) ||
    !preview.attempts.every(isCorrectionPreviewAttempt)
  )
    return false;
  const attempts = preview.attempts as Array<Record<string, unknown>>;
  if (
    attempts.slice(0, -1).some((attempt) => attempt.status !== 'failed') ||
    new Set(attempts.map((attempt) => attempt.easBuildId)).size !==
      attempts.length
  )
    return false;
  if (preview.stagingBase === null) return true;
  if (
    !hasExactKeys(preview.stagingBase, [
      'status',
      'easBuildId',
      'label',
      'packageHash',
    ])
  )
    return false;
  const base = preview.stagingBase as Record<string, unknown>;
  const registered = base.status === 'registered';
  return (
    ['clear_intent', 'clearing', 'cleared', 'unknown', 'registered'].includes(
      String(base.status),
    ) &&
    attempts.at(-1)?.status === 'succeeded' &&
    base.easBuildId === attempts.at(-1)?.easBuildId &&
    (registered
      ? isNonEmptyString(base.label) && isNonEmptyString(base.packageHash)
      : base.label === null && base.packageHash === null)
  );
}

export function getPlatformPreparations(
  release: Record<string, unknown>,
): Array<Record<string, unknown>> {
  return (release.platformPreparations as Array<Record<string, unknown>>) ?? [];
}

function isPlatformPreparation(
  value: unknown,
): value is Record<string, unknown> {
  const hasPreview = Object.hasOwn(value as object, 'preview');
  return (
    hasExactKeys(value, [
      'preparationId',
      'platform',
      'treeHash',
      'preparedCommit',
      'preparedAt',
      'status',
      ...(hasPreview ? ['preview'] : []),
    ]) &&
    isNonEmptyString(value.preparationId) &&
    PLATFORMS.includes(value.platform as (typeof PLATFORMS)[number]) &&
    typeof value.treeHash === 'string' &&
    /^[0-9a-f]{40}$/i.test(value.treeHash) &&
    typeof value.preparedCommit === 'string' &&
    /^[0-9a-f]{40}$/i.test(value.preparedCommit) &&
    isTimestamp(value.preparedAt) &&
    ['prepared', 'superseded'].includes(String(value.status)) &&
    (!hasPreview ||
      isCorrectionPreview((value as Record<string, unknown>).preview))
  );
}

export function hasCompletedCorrectionPreview(
  release: Record<string, unknown>,
  platform: string,
): boolean {
  const preparation = getPlatformPreparations(release).find(
    (item) => item.platform === platform && item.status === 'prepared',
  );
  return (preparation?.preview as Record<string, unknown> | undefined)
    ?.stagingBase
    ? (
        (preparation!.preview as Record<string, unknown>).stagingBase as Record<
          string,
          unknown
        >
      ).status === 'registered'
    : false;
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
