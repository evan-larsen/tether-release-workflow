import { assertEquals } from '@std/assert';
import { isValidInitialOta } from '../_shared/ota-source-validation.ts';
import type { OtaReleaseRecord, ReleaseState } from '../_shared/types.ts';

const sha = (character: string) => character.repeat(40);
const time = '2026-08-03T22:00:00.000Z';

function registeredArtifact(appVersion: string, buildNumber: string) {
  return {
    appVersion,
    buildNumber,
    base: {
      status: 'registered',
      staging: { label: 'v1', packageHash: 'staging-hash' },
      production: { label: 'v1', packageHash: 'production-hash' },
    },
  };
}

Deno.test('accepts an exact OTA target backed by registered bases', () => {
  const sourceId = 'source-release';
  const preparationId = 'preparation';
  const treeHash = sha('a');
  const gitCommit = sha('b');
  const previous = {
    stateVersion: 2,
    currentNative: 'native-1',
    stagingLane: { activeNative: 'native-1', resetTargetNative: null },
    releases: [
      {
        id: 'baseline',
        releaseType: 'adopted_baseline',
        native: 'native-1',
        nativeFloorVersion: '1.8.0',
        artifacts: {
          ios: registeredArtifact('1.8.0', '84'),
          android: registeredArtifact('1.8.0', '22'),
        },
      },
      {
        id: sourceId,
        releaseType: 'store',
        status: 'in_progress',
        version: '1.8.2',
        native: 'native-1',
        preparation: { preparationId, treeHash },
        productionCommit: gitCommit,
        platforms: { ios: { attempts: [] }, android: { attempts: [] } },
      },
    ],
  } as unknown as ReleaseState;
  const ota = {
    id: 'ota-release',
    version: '1.8.2',
    sourceReleaseId: sourceId,
    preparationId,
    treeHash,
    gitCommit,
    targetRange: '1.8.0',
    native: 'native-1',
    createdAt: time,
    releaseType: 'ota',
    status: 'in_progress',
    platforms: {},
  } as unknown as OtaReleaseRecord;

  assertEquals(isValidInitialOta(previous, ota), true);
});
