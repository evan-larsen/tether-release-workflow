import { assertEquals } from '@std/assert';
import { validateReleaseStateUpdate } from '../_shared/state-update-validation.ts';
import type {
  PreviewRecord,
  ReleasePreparation,
  ReleaseState,
  StoreReleaseRecord,
} from '../_shared/types.ts';
import corpus from './fixtures/state-update-contract-v1.json' with { type: 'json' };
import { buildPreparationContractPair } from './preparation-contract-cases.ts';
import {
  buildApprovedState,
  buildCompleteCandidate,
  buildStagingLaneContractPair,
} from './state-update-contract-cases.ts';
import { buildProductionProvisioning } from '../_shared/production-provisioning-validation.ts';

const time = '2026-07-30T12:00:00.000Z';
const sha = (character: string) => character.repeat(40);
const preparation = (id: string): ReleasePreparation => ({
  preparationId: `${id}-preparation`,
  treeHash: sha(id === 'replacement' ? 'd' : 'a'),
  preparedCommit: sha(id === 'replacement' ? 'e' : 'b'),
  marketingVersion: id === 'same' ? '1.8.1' : '1.9.0',
  nativeGeneration: id === 'same' ? 'native-1' : 'native-2',
  preparedAt: time,
  status: 'prepared',
});
const emptyV2 = (currentNative: string | null = null): ReleaseState => ({
  stateVersion: 2,
  currentNative,
  stagingLane: { activeNative: null, resetTargetNative: null },
  releases: [],
});
function emptyPlatforms() {
  return {
    ios: { attempts: [], ota: null },
    android: { attempts: [], ota: null },
  };
}
function sameGenerationRelease(): StoreReleaseRecord {
  return {
    id: 'same-generation',
    version: '1.8.1',
    preparation: preparation('same'),
    productionCommit: null,
    native: 'native-1',
    nativeFloorVersion: null,
    preview: null,
    createdAt: time,
    releaseType: 'store',
    status: 'in_progress',
    platforms: emptyPlatforms(),
  };
}

function previewPlatform(platform: 'ios' | 'android') {
  const easBuildId = `${platform}-preview`;
  return {
    attempts: [
      {
        easBuildId,
        appVersion: '1.9.0',
        buildNumber: '1',
        profile: 'preview',
        status: 'succeeded' as const,
      },
    ],
    stagingBase: {
      easBuildId,
      label: `${platform}-base`,
      packageHash: `${platform}-base-hash`,
    },
    stagingOta: {
      baseEasBuildId: easBuildId,
      label: `${platform}-ota`,
      packageHash: `${platform}-ota-hash`,
    },
  };
}
function previewRecord(approved: boolean): PreviewRecord {
  if (!approved) {
    const platform = () => ({
      attempts: [],
      stagingBase: null,
      stagingOta: null,
    });
    return {
      status: 'required',
      platforms: { ios: platform(), android: platform() },
      smokeApprovedAt: null,
    };
  }
  return {
    status: 'approved',
    platforms: {
      ios: previewPlatform('ios'),
      android: previewPlatform('android'),
    },
    smokeApprovedAt: time,
  };
}
function previewCandidate({
  id = 'candidate',
  approved = false,
  sourceId = 'candidate',
}: {
  id?: string;
  approved?: boolean;
  sourceId?: string;
} = {}): StoreReleaseRecord {
  return {
    id,
    version: '1.9.0',
    preparation: preparation(sourceId),
    productionCommit: null,
    native: 'native-2',
    nativeFloorVersion: '1.9.0',
    preview: previewRecord(approved),
    createdAt: time,
    releaseType: 'store',
    status: 'in_progress',
    platforms: emptyPlatforms(),
  };
}
function buildPair(id: string): [unknown, unknown] {
  const preparationPair = buildPreparationContractPair(id);
  if (preparationPair) return preparationPair;
  const dependencies = {
    emptyPlatforms,
    emptyV2,
    previewCandidate,
    previewRecord,
    sha,
    time,
  };
  const stagingPair = buildStagingLaneContractPair(id, dependencies);
  if (stagingPair) return stagingPair;
  const approvedState = () => buildApprovedState(previewCandidate, emptyV2);
  const provisioningIntent = () => {
    const next = approvedState();
    const release = next.releases[0] as StoreReleaseRecord;
    release.productionProvisioning = buildProductionProvisioning(release);
    return next;
  };
  if (id === 'production-provisioning-intent')
    return [approvedState(), provisioningIntent()];
  if (id === 'production-provisioning-ios-deployment-ready') {
    const previous = provisioningIntent();
    const next = structuredClone(previous);
    (
      next.releases[0] as StoreReleaseRecord
    ).productionProvisioning!.platforms.ios.status = 'deployment_ready';
    return [previous, next];
  }
  if (id === 'production-provisioning-ios-eas-configured') {
    const previous = provisioningIntent();
    (
      previous.releases[0] as StoreReleaseRecord
    ).productionProvisioning!.platforms.ios.status = 'deployment_ready';
    const next = structuredClone(previous);
    const record = (next.releases[0] as StoreReleaseRecord)
      .productionProvisioning!.platforms.ios;
    record.status = 'eas_configured';
    record.easVariable = {
      id: 'eas-variable-id',
      name: record.easVariableName,
      environment: record.environment,
      scope: record.scope,
      visibility: record.visibility,
      type: record.type,
      verifiedAt: time,
    };
    return [previous, next];
  }
  if (id === 'production-provisioning-forged-deployment') {
    const previous = provisioningIntent();
    const next = structuredClone(previous);
    (
      next.releases[0] as StoreReleaseRecord
    ).productionProvisioning!.platforms.ios.deployment = 'production-native-3';
    return [previous, next];
  }
  if (id === 'production-provisioning-unknown-retry') {
    const previous = provisioningIntent();
    (
      previous.releases[0] as StoreReleaseRecord
    ).productionProvisioning!.platforms.ios.status = 'unknown';
    const next = structuredClone(previous);
    (
      next.releases[0] as StoreReleaseRecord
    ).productionProvisioning!.platforms.ios.status = 'intent';
    return [previous, next];
  }
  if (id === 'production-provisioning-bundled-current-native') {
    const next = provisioningIntent();
    next.currentNative = 'native-2';
    return [approvedState(), next];
  }
  const established = emptyV2('native-1');
  if (id === 'illegal-current-native-jump')
    return [emptyV2(), emptyV2('native-1')];
  if (id === 'fabricated-completed-native-candidate')
    return [
      established,
      {
        ...emptyV2('native-2'),
        stagingLane: { activeNative: 'native-2', resetTargetNative: null },
        releases: [buildCompleteCandidate(previewCandidate, time, sha)],
      },
    ];
  if (id === 'new-native-missing-floor-preview')
    return [
      established,
      {
        ...established,
        releases: [
          { ...sameGenerationRelease(), id: 'missing', native: 'native-2' },
        ],
      },
    ];
  if (id === 'same-generation-with-floor-preview')
    return [
      established,
      {
        ...established,
        releases: [{ ...previewCandidate(), native: 'native-1' }],
      },
    ];
  if (id === 'wrong-production-profile-version') {
    const previous = { ...established, releases: [sameGenerationRelease()] };
    const next = structuredClone(previous);
    next.releases[0].platforms.ios.attempts.push({
      easBuildId: 'wrong',
      appVersion: '9.9.9',
      buildNumber: '1',
      profile: 'arbitrary',
      status: 'requested',
      submissions: [],
      storeStatus: null,
      base: null,
    });
    return [previous, next];
  }
  if (id === 'preview-base-linked-to-failed-build') {
    const release = previewCandidate();
    release.preview!.status = 'building';
    release.preview!.platforms.ios.attempts.push({
      easBuildId: 'failed-preview',
      appVersion: '1.9.0',
      buildNumber: '1',
      profile: 'preview',
      status: 'failed',
    });
    const previous = {
      ...established,
      stagingLane: { activeNative: 'native-2', resetTargetNative: null },
      releases: [release],
    };
    const next = structuredClone(previous);
    next.releases[0].preview!.platforms.ios.stagingBase = {
      easBuildId: 'failed-preview',
      label: 'base',
      packageHash: 'hash',
    };
    return [previous, next];
  }
  if (id === 'approved-preview-later-failed-attempt') {
    const previous = buildApprovedState(previewCandidate, emptyV2);
    const next = structuredClone(previous);
    (
      next.releases[0] as StoreReleaseRecord
    ).preview!.platforms.ios.attempts.push({
      easBuildId: 'later-failure',
      appVersion: '1.9.0',
      buildNumber: '2',
      profile: 'preview',
      status: 'failed',
    });
    return [previous, next];
  }
  if (id === 'foreign-staging-preflight') {
    const previous = {
      ...established,
      stagingLane: { activeNative: 'native-1', resetTargetNative: null },
      releases: [previewCandidate()],
    };
    const next = structuredClone(previous);
    next.releases[0].preview!.status = 'building';
    next.releases[0].preview!.platforms.ios.attempts.push({
      easBuildId: 'ios-preview',
      appVersion: '1.9.0',
      buildNumber: '1',
      profile: 'preview',
      status: 'requested',
    });
    return [previous, next];
  }
  if (id === 'approved-non-public-preview-supersession') {
    const previous = buildApprovedState(previewCandidate, emptyV2);
    const next = structuredClone(previous);
    next.releases[0].status = 'superseded';
    next.releases.push(
      previewCandidate({ id: 'replacement', sourceId: 'replacement' }),
    );
    return [previous, next];
  }
  if (id === 'valid-squash-production-commit') {
    const previous = buildApprovedState(previewCandidate, emptyV2);
    const next = structuredClone(previous);
    (next.releases[0] as StoreReleaseRecord).productionCommit = sha('f');
    return [previous, next];
  }
  throw new Error(`Unknown release-state update contract case: ${id}`);
}

for (const contractCase of corpus.cases) {
  Deno.test(`state update contract: ${contractCase.id}`, () => {
    const [previous, next] = buildPair(contractCase.id);
    assertEquals(
      validateReleaseStateUpdate(previous, next),
      contractCase.expected,
    );
  });
}

function nativeActivationPair(
  includeAndroidBase: boolean,
): [ReleaseState, ReleaseState] {
  const previous = buildApprovedState(previewCandidate, emptyV2);
  const release = previous.releases[0] as StoreReleaseRecord;
  release.productionCommit = sha('c');
  release.productionProvisioning = buildProductionProvisioning(release);
  for (const platform of ['ios', 'android'] as const) {
    const provision = release.productionProvisioning.platforms[platform];
    provision.status = 'eas_configured';
    provision.easVariable = {
      id: `${platform}-variable`,
      name: provision.easVariableName,
      environment: provision.environment,
      scope: provision.scope,
      visibility: provision.visibility,
      type: provision.type,
      updatedAt: time,
    };
    if (platform === 'android' && !includeAndroidBase) continue;
    release.platforms[platform].attempts.push({
      easBuildId: `${platform}-production`,
      appVersion: release.version,
      buildNumber: '2',
      profile: 'production',
      status: 'succeeded',
      sourcePreparationId: release.preparation.preparationId,
      submissions: [{ id: `${platform}-submission`, status: 'submitted' }],
      storeStatus: { status: 'live', providerState: 'LIVE', checkedAt: time },
      base: {
        status: 'registered',
        staging: null,
        production: {
          label: `${platform}-production`,
          packageHash: `${platform}-hash`,
        },
      },
    });
  }
  const next = structuredClone(previous);
  next.currentNative = 'native-2';
  (next.releases[0] as StoreReleaseRecord).status = 'complete';
  return [previous, next];
}

Deno.test(
  'native activation permits only the exact verified two-platform delta',
  () => {
    const [before, activated] = nativeActivationPair(true);
    assertEquals(validateReleaseStateUpdate(before, activated), true);
    const [incomplete, forgedActivation] = nativeActivationPair(false);
    assertEquals(
      validateReleaseStateUpdate(incomplete, forgedActivation),
      false,
    );
  },
);
