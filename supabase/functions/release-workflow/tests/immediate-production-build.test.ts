import { assertEquals } from '@std/assert';
import { validateReleaseStateUpdate } from '../_shared/state-update-validation.ts';
import type { ReleaseState, StoreReleaseRecord } from '../_shared/types.ts';

const time = '2026-07-30T12:00:00.000Z';
const sha = (character: string) => character.repeat(40);

function state(): ReleaseState {
  const release: StoreReleaseRecord = {
    id: 'same-generation',
    version: '1.8.1',
    preparation: {
      preparationId: 'same-preparation',
      treeHash: sha('a'),
      preparedCommit: sha('b'),
      marketingVersion: '1.8.1',
      nativeGeneration: 'native-1',
      preparedAt: time,
      status: 'prepared',
    },
    productionCommit: sha('c'),
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
  return {
    stateVersion: 2,
    currentNative: 'native-1',
    stagingLane: { activeNative: null, resetTargetNative: null },
    releases: [release],
  };
}

Deno.test('accepts an immediately succeeded exact Production build', () => {
  const previous = state();
  const next = structuredClone(previous);
  (next.releases[0] as StoreReleaseRecord).platforms.ios.attempts.push({
    easBuildId: 'ios-immediate-success',
    appVersion: '1.8.1',
    buildNumber: '85',
    profile: 'production',
    status: 'succeeded',
    sourcePreparationId: 'same-preparation',
    submissions: [],
    storeStatus: null,
    base: null,
  });
  assertEquals(validateReleaseStateUpdate(previous, next), true);
});
