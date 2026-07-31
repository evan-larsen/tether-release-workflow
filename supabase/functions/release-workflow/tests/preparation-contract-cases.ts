import type { ReleaseState, StoreReleaseRecord } from '../_shared/types.ts';

const time = '2026-07-30T12:00:00.000Z';
const sha = (character: string) => character.repeat(40);

function preparedRelease({
  id = 'prepared-release',
  tree = 'a',
  preparedCommit = 'b',
} = {}): StoreReleaseRecord {
  return {
    id,
    version: '1.8.1',
    preparation: {
      preparationId: `${id}-preparation`,
      treeHash: sha(tree),
      preparedCommit: sha(preparedCommit),
      marketingVersion: '1.8.1',
      nativeGeneration: 'native-1',
      preparedAt: time,
      status: 'prepared',
    },
    productionCommit: null,
    native: 'native-1',
    nativeFloorVersion: null,
    preview: null,
    createdAt: time,
    releaseType: 'store',
    status: 'in_progress',
    platforms: {
      ios: { attempts: [], ota: null },
      android: { attempts: [], ota: null },
    },
  };
}

function preparedState(): ReleaseState {
  return {
    stateVersion: 2,
    currentNative: 'native-1',
    stagingLane: { activeNative: null, resetTargetNative: null },
    releases: [preparedRelease()],
  };
}

function addPublicProgress(release: StoreReleaseRecord): void {
  release.platforms.ios.attempts.push({
    easBuildId: 'ios-production',
    appVersion: '1.8.1',
    buildNumber: '1',
    profile: 'production',
    status: 'succeeded',
    submissions: [{ id: 'submission-1', status: 'submitted' }],
    storeStatus: { status: 'live', providerState: 'LIVE', checkedAt: time },
    base: null,
  });
}

function replacementState(previous: ReleaseState): ReleaseState {
  const next = structuredClone(previous);
  next.releases[0].status = 'superseded';
  next.releases.push(
    preparedRelease({
      id: 'replacement-release',
      tree: 'd',
      preparedCommit: 'e',
    }),
  );
  return next;
}

function partialPublicState(): ReleaseState {
  const state = preparedState();
  const release = state.releases[0] as StoreReleaseRecord;
  release.productionCommit = sha('c');
  release.platforms.ios.attempts.push({
    easBuildId: 'ios-public',
    appVersion: '1.8.1',
    buildNumber: '1',
    profile: 'production',
    status: 'succeeded',
    sourcePreparationId: release.preparation.preparationId,
    submissions: [{ id: 'ios-submission', status: 'submitted' }],
    storeStatus: { status: 'live', providerState: 'LIVE', checkedAt: time },
    base: null,
  });
  return state;
}

function correctionState(
  previous: ReleaseState,
  platform: 'ios' | 'android' = 'android',
): ReleaseState {
  const next = structuredClone(previous) as ReleaseState;
  (
    next.releases[0] as unknown as Record<string, unknown>
  ).platformPreparations = [
    {
      preparationId: `${platform}-correction`,
      platform,
      treeHash: sha('d'),
      preparedCommit: sha('e'),
      preparedAt: time,
      status: 'prepared',
    },
  ];
  return next;
}

export function buildPreparationContractPair(
  id: string,
): [ReleaseState, ReleaseState] | null {
  if (id === 'duplicate-same-tree-preparation-reuse-no-write') {
    const previous = preparedState();
    return [previous, structuredClone(previous)];
  }
  if (id === 'changed-tree-preparation-replacement') {
    const previous = preparedState();
    return [previous, replacementState(previous)];
  }
  if (id === 'public-progress-preparation-replacement') {
    const previous = preparedState();
    const release = previous.releases[0] as StoreReleaseRecord;
    release.productionCommit = sha('c');
    addPublicProgress(release);
    return [previous, replacementState(previous)];
  }
  if (id === 'fabricated-preparation-record') {
    const previous = { ...preparedState(), releases: [] };
    const fabricated = preparedRelease();
    fabricated.platforms.ios.attempts.push({
      easBuildId: 'fabricated-build',
      appVersion: '1.8.1',
      buildNumber: '1',
      profile: 'production',
      status: 'requested',
      submissions: [],
      storeStatus: null,
      base: null,
    });
    return [previous, { ...previous, releases: [fabricated] }];
  }
  if (id === 'duplicate-release-id-preparation') {
    const previous = preparedState();
    return [
      previous,
      {
        ...previous,
        releases: [
          ...previous.releases,
          preparedRelease({ id: 'prepared-release', tree: 'd' }),
        ],
      },
    ];
  }
  if (id === 'preparation-current-native-movement') {
    const previous = { ...preparedState(), releases: [] };
    return [
      previous,
      {
        ...previous,
        currentNative: 'native-2',
        releases: [preparedRelease()],
      },
    ];
  }
  if (id === 'one-public-platform-correction') {
    const previous = partialPublicState();
    return [previous, correctionState(previous)];
  }
  if (id === 'forged-public-platform-correction') {
    const previous = partialPublicState();
    return [previous, correctionState(previous, 'ios')];
  }
  if (id === 'wrong-preparation-build-link') {
    const previous = correctionState(partialPublicState());
    const next = structuredClone(previous) as ReleaseState;
    (next.releases[0] as StoreReleaseRecord).platforms.android.attempts.push({
      easBuildId: 'android-wrong',
      appVersion: '1.8.1',
      buildNumber: '2',
      profile: 'production',
      status: 'requested',
      sourcePreparationId: (previous.releases[0] as StoreReleaseRecord)
        .preparation.preparationId,
      submissions: [],
      storeStatus: null,
      base: null,
    });
    return [previous, next];
  }
  return null;
}
