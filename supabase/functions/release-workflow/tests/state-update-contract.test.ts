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
function approvedState(): ReleaseState {
  return {
    ...emptyV2('native-1'),
    stagingLane: { activeNative: 'native-2', resetTargetNative: null },
    releases: [previewCandidate({ approved: true })],
  };
}
function completeCandidate(): StoreReleaseRecord {
  const release = previewCandidate({ approved: true });
  release.productionCommit = sha('c');
  for (const platform of ['ios', 'android'] as const) {
    release.platforms[platform].attempts.push({
      easBuildId: `${platform}-production`,
      appVersion: '1.9.0',
      buildNumber: '2',
      profile: 'production',
      status: 'succeeded',
      submissions: [{ id: `${platform}-submission`, status: 'submitted' }],
      storeStatus: { status: 'live', providerState: 'LIVE', checkedAt: time },
      base: {
        status: 'registered',
        staging: { label: 'staging', packageHash: `${platform}-staging` },
        production: {
          label: 'production',
          packageHash: `${platform}-production`,
        },
      },
    });
  }
  release.status = 'complete';
  return release;
}

function stagingLanePair(id: string): [unknown, unknown] | null {
  const candidate = previewCandidate();
  const unassigned = { ...emptyV2('native-1'), releases: [candidate] };
  const foreign: ReleaseState = {
    ...emptyV2('native-1'),
    stagingLane: { activeNative: 'native-1', resetTargetNative: null },
    releases: [candidate],
  };
  const pending: ReleaseState = {
    ...emptyV2('native-1'),
    stagingLane: {
      activeNative: 'native-1',
      resetTargetNative: 'native-2',
      resetProgress: { ios: 'pending', android: 'pending' },
    },
    releases: [candidate],
  };
  const iosCleared = structuredClone(pending);
  iosCleared.stagingLane.resetProgress!.ios = 'cleared_and_verified';
  const complete = structuredClone(pending);
  complete.stagingLane.resetProgress = {
    ios: 'cleared_and_verified',
    android: 'cleared_and_verified',
  };
  const claimed: ReleaseState = {
    ...emptyV2('native-1'),
    stagingLane: { activeNative: 'native-2', resetTargetNative: null },
    releases: [candidate],
  };
  const pairs: Record<string, [unknown, unknown]> = {
    'staging-lane-initial-claim': [unassigned, claimed],
    'staging-lane-reset-begin': [foreign, pending],
    'staging-lane-ios-clear': [pending, iosCleared],
    'staging-lane-reset-complete': [complete, claimed],
    'staging-lane-direct-swap': [foreign, claimed],
    'staging-lane-early-complete': [pending, claimed],
  };
  return pairs[id] ?? null;
}

function buildPair(id: string): [unknown, unknown] {
  const preparationPair = buildPreparationContractPair(id);
  if (preparationPair) return preparationPair;
  const stagingPair = stagingLanePair(id);
  if (stagingPair) return stagingPair;
  const established = emptyV2('native-1');
  if (id === 'illegal-current-native-jump')
    return [emptyV2(), emptyV2('native-1')];
  if (id === 'fabricated-completed-native-candidate')
    return [
      established,
      {
        ...emptyV2('native-2'),
        stagingLane: { activeNative: 'native-2', resetTargetNative: null },
        releases: [completeCandidate()],
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
    const previous = approvedState();
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
  if (id === 'invalid-staging-lane-ownership') {
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
    const previous = approvedState();
    const next = structuredClone(previous);
    next.releases[0].status = 'superseded';
    next.releases.push(
      previewCandidate({ id: 'replacement', sourceId: 'replacement' }),
    );
    return [previous, next];
  }
  if (id === 'valid-squash-production-commit') {
    const previous = approvedState();
    const next = structuredClone(previous);
    (next.releases[0] as StoreReleaseRecord).productionCommit = sha('f');
    return [previous, next];
  }
  if (id === 'exact-empty-v1-migration')
    return [{ stateVersion: 1, currentNative: null, releases: [] }, emptyV2()];
  return [{ stateVersion: 1, currentNative: null, releases: [{}] }, emptyV2()];
}

Deno.test(
  'unassigned Staging permits only a Preview build request without lane mutation',
  () => {
    const previous = { ...emptyV2('native-1'), releases: [previewCandidate()] };
    const next = structuredClone(previous);
    next.releases[0].preview!.status = 'building';
    next.releases[0].preview!.platforms.ios.attempts.push({
      easBuildId: 'ios-preview-unassigned',
      appVersion: '1.9.0',
      buildNumber: '1',
      profile: 'preview',
      status: 'requested',
    });
    assertEquals(validateReleaseStateUpdate(previous, next), true);
  },
);

for (const contractCase of corpus.cases) {
  Deno.test(`state update contract: ${contractCase.id}`, () => {
    const [previous, next] = buildPair(contractCase.id);
    assertEquals(
      validateReleaseStateUpdate(previous, next),
      contractCase.expected,
    );
  });
}
