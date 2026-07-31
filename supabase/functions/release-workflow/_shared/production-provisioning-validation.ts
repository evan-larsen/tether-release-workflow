import type {
  Platform,
  ProductionEasVariableMetadata,
  ProductionProvisioning,
  StoreReleaseRecord,
} from './types.ts';
import {
  hasExactKeys,
  isNative,
  isNonEmptyString,
  isTimestamp,
} from './state-validation-primitives.ts';

const PLATFORMS: Platform[] = ['ios', 'android'];
const STATUSES = [
  'intent',
  'retryable',
  'unknown',
  'deployment_ready',
  'eas_configured',
];

function getVariableName(platform: Platform, native: string): string {
  const number = Number(native.slice('native-'.length));
  const prefix = platform === 'ios' ? 'REVOPUSH_IOS' : 'REVOPUSH_ANDROID';
  return number === 1
    ? `${prefix}_DEPLOYMENT_KEY`
    : `${prefix}_PRODUCTION_NATIVE_${number}_KEY`;
}

export function getProductionProvisioningFacts(
  platform: Platform,
  native: string,
) {
  return {
    app: platform === 'ios' ? 'Tether-iOS' : 'Tether-Android',
    deployment: `production-${native}`,
    easVariableName: getVariableName(platform, native),
    environment: 'production',
    scope: 'project',
    visibility: 'sensitive',
    type: 'string',
  } as const;
}

export function isProductionEasVariableMetadata(
  value: unknown,
  facts: ReturnType<typeof getProductionProvisioningFacts>,
): value is ProductionEasVariableMetadata {
  return (
    hasExactKeys(value, [
      'id',
      'name',
      'environment',
      'scope',
      'visibility',
      'type',
      'updatedAt',
    ]) &&
    isNonEmptyString(value.id) &&
    value.name === facts.easVariableName &&
    value.environment === facts.environment &&
    value.scope === facts.scope &&
    value.visibility === facts.visibility &&
    value.type === facts.type &&
    isTimestamp(value.updatedAt)
  );
}

function isPlatformProvisioning(
  value: unknown,
  platform: Platform,
  native: string,
): boolean {
  const hasEasVariable = Object.hasOwn(value ?? {}, 'easVariable');
  const facts = getProductionProvisioningFacts(platform, native);
  return (
    hasExactKeys(value, [
      'status',
      'app',
      'deployment',
      'easVariableName',
      'environment',
      'scope',
      'visibility',
      'type',
      ...(hasEasVariable ? ['easVariable'] : []),
    ]) &&
    STATUSES.includes(String(value.status)) &&
    value.app === facts.app &&
    value.deployment === facts.deployment &&
    value.easVariableName === facts.easVariableName &&
    value.environment === facts.environment &&
    value.scope === facts.scope &&
    value.visibility === facts.visibility &&
    value.type === facts.type &&
    (!hasEasVariable ||
      (value.status === 'eas_configured' &&
        isProductionEasVariableMetadata(value.easVariable, facts)))
  );
}

export function buildProductionProvisioning(
  release: StoreReleaseRecord,
): ProductionProvisioning {
  return {
    candidateId: release.id,
    preparationId: release.preparation.preparationId,
    treeHash: release.preparation.treeHash,
    preparedCommit: release.preparation.preparedCommit,
    native: release.native,
    platforms: Object.fromEntries(
      PLATFORMS.map((platform) => [
        platform,
        {
          status: 'intent',
          ...getProductionProvisioningFacts(platform, release.native),
        },
      ]),
    ) as ProductionProvisioning['platforms'],
  };
}

export function isProductionProvisioning(
  value: unknown,
  release: Record<string, unknown>,
): value is ProductionProvisioning {
  return (
    hasExactKeys(value, [
      'candidateId',
      'preparationId',
      'treeHash',
      'preparedCommit',
      'native',
      'platforms',
    ]) &&
    isNonEmptyString(value.candidateId) &&
    isNonEmptyString(value.preparationId) &&
    typeof value.treeHash === 'string' &&
    /^[0-9a-f]{40}$/i.test(value.treeHash) &&
    typeof value.preparedCommit === 'string' &&
    /^[0-9a-f]{40}$/i.test(value.preparedCommit) &&
    isNative(value.native) &&
    hasExactKeys(value.platforms, PLATFORMS) &&
    value.candidateId === release.id &&
    value.preparationId ===
      (release.preparation as Record<string, unknown>).preparationId &&
    value.treeHash ===
      (release.preparation as Record<string, unknown>).treeHash &&
    value.preparedCommit ===
      (release.preparation as Record<string, unknown>).preparedCommit &&
    value.native === release.native &&
    PLATFORMS.every((platform) =>
      isPlatformProvisioning(
        (value.platforms as Record<string, unknown>)[platform],
        platform,
        value.native as string,
      ),
    )
  );
}
