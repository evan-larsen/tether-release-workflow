import type { ReleaseState, StoreReleaseRecord } from '../_shared/types.ts';

type StagingDependencies = {
  emptyV2: (currentNative?: string | null) => ReleaseState;
  previewCandidate: () => StoreReleaseRecord;
};

type LegacyBaselineDependencies = {
  emptyPlatforms: () => StoreReleaseRecord['platforms'];
  emptyV2: (currentNative?: string | null) => ReleaseState;
  previewRecord: (approved: boolean) => StoreReleaseRecord['preview'];
  sha: (character: string) => string;
  time: string;
};

export function buildStagingLaneContractPair(
  id: string,
  { emptyV2, previewCandidate }: StagingDependencies,
): [unknown, unknown] | null {
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

export function buildApprovedState(
  previewCandidate: (options?: { approved?: boolean }) => StoreReleaseRecord,
  emptyV2: (currentNative?: string | null) => ReleaseState,
): ReleaseState {
  return {
    ...emptyV2('native-1'),
    stagingLane: { activeNative: 'native-2', resetTargetNative: null },
    releases: [previewCandidate({ approved: true })],
  };
}

export function buildCompleteCandidate(
  previewCandidate: (options?: { approved?: boolean }) => StoreReleaseRecord,
  time: string,
  sha: (character: string) => string,
): StoreReleaseRecord {
  const release = structuredClone(previewCandidate({ approved: true }));
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

export function buildLegacyBaselineContractPair(
  id: string,
  {
    emptyPlatforms,
    emptyV2,
    previewRecord,
    sha,
    time,
  }: LegacyBaselineDependencies,
): [unknown, unknown] | null {
  if (!id.startsWith('legacy-live-baseline-')) return null;
  const previous: ReleaseState = {
    ...emptyV2(),
    releases: [
      {
        id: 'pre-baseline-workflow',
        version: '1.8.0',
        preparation: {
          preparationId: 'legacy-prep',
          treeHash: sha('a'),
          preparedCommit: sha('b'),
          marketingVersion: '1.8.0',
          nativeGeneration: 'native-1',
          preparedAt: time,
          status: 'prepared',
        },
        productionCommit: null,
        native: 'native-1',
        nativeFloorVersion: '1.8.0',
        preview: previewRecord(false),
        createdAt: time,
        releaseType: 'store',
        status: 'in_progress',
        platforms: emptyPlatforms(),
      },
    ],
  };
  const source = { commit: sha('d'), treeHash: sha('e') };
  const artifact = (easBuildId: string, buildNumber: string) => ({
    easBuildId,
    appVersion: '1.8.0',
    buildNumber,
    profile: 'production' as const,
    status: 'succeeded' as const,
    sourceCommit: source.commit,
    sourceTreeHash: source.treeHash,
    storeStatus: {
      status: 'live' as const,
      providerState: 'LIVE',
      checkedAt: time,
    },
    base: { status: 'eligible' as const, staging: null, production: null },
  });
  const next = {
    ...previous,
    currentNative: 'native-1',
    releases: [
      {
        ...previous.releases[0],
        status: 'superseded',
        supersededReason: 'pre_baseline_adoption',
      },
      {
        id: 'adopted-baseline-native-1-1.8.0',
        version: '1.8.0',
        native: 'native-1',
        nativeFloorVersion: '1.8.0',
        source,
        createdAt: time,
        releaseType: 'adopted_baseline',
        status: 'adopted',
        artifacts: {
          ios: artifact('legacy-ios', '84'),
          android: artifact('legacy-android', '22'),
        },
      },
    ],
  };
  if (id === 'legacy-live-baseline-forged-base') {
    (next.releases[1] as Record<string, unknown>).artifacts = {
      ...(next.releases[1] as { artifacts: Record<string, unknown> }).artifacts,
      ios: {
        ...((next.releases[1] as { artifacts: Record<string, unknown> })
          .artifacts.ios as Record<string, unknown>),
        base: {
          status: 'eligible',
          staging: { label: 'v1' },
          production: null,
        },
      },
    };
  }
  return [previous, next];
}
