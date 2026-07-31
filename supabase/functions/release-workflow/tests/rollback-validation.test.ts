import { assertEquals } from '@std/assert';
import { validateReleaseStateUpdate } from '../_shared/state-update-validation.ts';
import type { ReleaseState, RollbackRecord } from '../_shared/types.ts';
const base: ReleaseState = {
  stateVersion: 2,
  currentNative: 'native-1',
  stagingLane: { activeNative: null, resetTargetNative: null },
  releases: [],
};
const platform = (
  platform: 'ios' | 'android',
  label: string,
  hash: string,
): RollbackRecord['platforms']['ios'] => ({
  status: 'intent',
  platform,
  deployment: 'production-native-1',
  originalLabel: label,
  originalPackageHash: hash,
  targetRange: '>=1.8.0',
  label: null,
  packageHash: null,
  releaseMethod: null,
  originalLabelResult: null,
});
const intent: ReleaseState = {
  ...base,
  rollbacks: [
    {
      id: 'rollback:native-1:v7:v8',
      native: 'native-1',
      targetRange: '>=1.8.0',
      createdAt: '2026-07-31T00:00:00.000Z',
      status: 'in_progress',
      platforms: {
        ios: platform('ios', 'v7', 'ios-good'),
        android: platform('android', 'v8', 'android-good'),
      },
    },
  ],
};
Deno.test(
  'accepts intent-first rollback and rejects forged or bundled deltas',
  () => {
    assertEquals(validateReleaseStateUpdate(base, intent), true);
    const forged = structuredClone(intent);
    forged.rollbacks![0].platforms.ios = {
      ...forged.rollbacks![0].platforms.ios,
      status: 'rolled_back',
      label: 'v9',
      packageHash: 'hash',
      releaseMethod: 'Rollback',
      originalLabelResult: 'v7',
    };
    assertEquals(validateReleaseStateUpdate(intent, forged), true);
    const bundled = structuredClone(intent);
    bundled.rollbacks![0].platforms.ios = {
      ...bundled.rollbacks![0].platforms.ios,
      status: 'retryable',
    };
    bundled.rollbacks![0].platforms.android = {
      ...bundled.rollbacks![0].platforms.android,
      status: 'retryable',
    };
    assertEquals(validateReleaseStateUpdate(intent, bundled), false);
  },
);
