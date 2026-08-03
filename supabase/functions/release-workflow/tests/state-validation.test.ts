import { assertEquals } from '@std/assert';
import { validateReleaseStateUpdate } from '../_shared/state-update-validation.ts';
import { isReleaseState } from '../_shared/state-validation.ts';
import type { ReleaseState } from '../_shared/types.ts';

const emptyV2: ReleaseState = {
  stateVersion: 2,
  currentNative: null,
  stagingLane: {
    activeNative: null,
    resetTargetNative: null,
  },
  releases: [],
};

function previewRelease() {
  const platform = (name: string) => ({
    attempts: [
      {
        easBuildId: `${name}-build`,
        appVersion: '1.9.0',
        buildNumber: name === 'ios' ? '51' : '61',
        profile: 'preview',
        status: 'succeeded',
      },
    ],
    stagingBase: name.length
      ? {
          easBuildId: `${name}-build`,
          label: `${name}-base`,
          packageHash: `${name}-base-hash`,
        }
      : null,
    stagingOta: {
      baseEasBuildId: `${name}-build`,
      label: `${name}-ota`,
      packageHash: `${name}-ota-hash`,
    },
  });
  return {
    id: 'preview-release',
    version: '1.9.0',
    preparation: {
      preparationId: 'preparation-a',
      treeHash: 'a'.repeat(40),
      preparedCommit: 'b'.repeat(40),
      marketingVersion: '1.9.0',
      nativeGeneration: 'native-2',
      preparedAt: '2026-07-30T10:00:00.000Z',
      status: 'prepared',
    },
    productionCommit: null,
    native: 'native-2',
    nativeFloorVersion: '1.9.0',
    preview: {
      status: 'approved',
      platforms: {
        ios: platform('ios'),
        android: platform('android'),
      },
      smokeApprovedAt: '2026-07-30T12:00:00.000Z',
    },
    createdAt: '2026-07-30T10:00:00.000Z',
    releaseType: 'store',
    status: 'in_progress',
    platforms: {
      ios: { attempts: [], ota: null },
      android: { attempts: [], ota: null },
    },
  };
}

Deno.test('accepts exact empty and Preview-backed v2 states', () => {
  assertEquals(isReleaseState(emptyV2), true);
  assertEquals(
    isReleaseState({
      ...emptyV2,
      currentNative: 'native-1',
      stagingLane: {
        activeNative: 'native-2',
        resetTargetNative: null,
      },
      releases: [previewRelease()],
    }),
    true,
  );
});

Deno.test(
  'rejects old, extra-key, invalid-order, and duplicate-ID states',
  () => {
    assertEquals(
      isReleaseState({
        stateVersion: 1,
        currentNative: null,
        releases: [],
      }),
      false,
    );
    assertEquals(
      isReleaseState({ ...emptyV2, privateToken: 'not-allowed' }),
      false,
    );
    const release = previewRelease();
    release.preview.platforms.android.attempts[0].easBuildId = 'ios-build';
    assertEquals(
      isReleaseState({
        ...emptyV2,
        releases: [release],
      }),
      false,
    );
    const invalidOrder = previewRelease();
    invalidOrder.preview.platforms.ios.stagingBase = null;
    assertEquals(
      isReleaseState({
        ...emptyV2,
        releases: [invalidOrder],
      }),
      false,
    );
  },
);

Deno.test('rejects retired v1 release-state transitions', () => {
  assertEquals(
    validateReleaseStateUpdate(
      { stateVersion: 1, currentNative: null, releases: [] },
      emptyV2,
    ),
    false,
  );
});
