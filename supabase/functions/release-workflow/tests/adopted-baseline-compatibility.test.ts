import { assertEquals } from '@std/assert';
import { validateReleaseStateUpdate } from '../_shared/state-update-validation.ts';
import { isReleaseState } from '../_shared/state-validation.ts';
import type {
  AdoptedBaselineRecord,
  ReleaseState,
  StoreReleaseRecord,
} from '../_shared/types.ts';

const time = '2026-07-30T12:00:00.000Z';
const sha = (character: string) => character.repeat(40);

function adoptedBaseline(): AdoptedBaselineRecord {
  const source = { commit: sha('a'), treeHash: sha('b') };
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
  return {
    id: 'adopted-baseline-native-1-1.8.0',
    version: '1.8.0',
    native: 'native-1',
    nativeFloorVersion: '1.8.0',
    source,
    createdAt: time,
    releaseType: 'adopted_baseline',
    status: 'adopted',
    artifacts: {
      ios: artifact('ios-live-build', '84'),
      android: artifact('android-live-build', '22'),
    },
  };
}

function storeRelease(
  native: string,
  version: string,
  nativeFloorVersion: string | null,
): StoreReleaseRecord {
  const preview = nativeFloorVersion
    ? {
        status: 'required' as const,
        platforms: {
          ios: { attempts: [], stagingBase: null, stagingOta: null },
          android: { attempts: [], stagingBase: null, stagingOta: null },
        },
        smokeApprovedAt: null,
      }
    : null;
  return {
    id: `${native}-${version}`,
    version,
    preparation: {
      preparationId: `${native}-${version}-preparation`,
      treeHash: sha('c'),
      preparedCommit: sha('d'),
      marketingVersion: version,
      nativeGeneration: native,
      preparedAt: time,
      status: 'prepared',
    },
    productionCommit: null,
    native,
    nativeFloorVersion,
    preview,
    createdAt: time,
    releaseType: 'store',
    status: 'in_progress',
    platforms: {
      ios: { attempts: [], ota: null },
      android: { attempts: [], ota: null },
    },
  };
}

function adoptedState(): ReleaseState {
  return {
    stateVersion: 2,
    currentNative: 'native-1',
    stagingLane: { activeNative: null, resetTargetNative: null },
    releases: [adoptedBaseline()],
  };
}

Deno.test(
  'stored adopted baseline supports normal future release transitions',
  () => {
    const previous = adoptedState();
    assertEquals(isReleaseState(previous), true);
    const sameNative = {
      ...previous,
      releases: [...previous.releases, storeRelease('native-1', '1.8.1', null)],
    };
    assertEquals(validateReleaseStateUpdate(previous, sameNative), true);
    const nativeTwo = {
      ...previous,
      releases: [
        ...previous.releases,
        storeRelease('native-2', '1.9.0', '1.9.0'),
      ],
    };
    assertEquals(validateReleaseStateUpdate(previous, nativeTwo), true);
  },
);

Deno.test('a new adopted-baseline bootstrap delta is rejected', () => {
  const previous: ReleaseState = {
    stateVersion: 2,
    currentNative: null,
    stagingLane: { activeNative: null, resetTargetNative: null },
    releases: [],
  };
  const next = { ...adoptedState() };
  assertEquals(isReleaseState(next), true);
  assertEquals(validateReleaseStateUpdate(previous, next), false);
});
