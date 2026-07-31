import type { ReleaseState, StoreReleaseRecord } from '../_shared/types.ts';

type StagingDependencies = {
  emptyV2: (currentNative?: string | null) => ReleaseState;
  previewCandidate: () => StoreReleaseRecord;
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
