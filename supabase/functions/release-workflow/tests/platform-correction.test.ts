import { assertEquals } from '@std/assert';
import { validateReleaseStateUpdate } from '../_shared/state-update-validation.ts';
import { isReleaseState } from '../_shared/state-validation.ts';
import type { ReleaseState, StoreReleaseRecord } from '../_shared/types.ts';

const time = '2026-07-30T12:00:00.000Z';
const sha = (character: string) => character.repeat(40);

function partialPublicState(publicPlatform: 'ios' | 'android' = 'ios') {
  const other = publicPlatform === 'ios' ? 'android' : 'ios';
  return {
    stateVersion: 2,
    currentNative: 'native-1',
    stagingLane: { activeNative: null, resetTargetNative: null },
    releases: [
      {
        id: 'release-a',
        version: '1.8.0',
        preparation: {
          preparationId: 'shared-a',
          treeHash: sha('a'),
          preparedCommit: sha('b'),
          marketingVersion: '1.8.0',
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
          [publicPlatform]: {
            attempts: [
              {
                easBuildId: `${publicPlatform}-a`,
                appVersion: '1.8.0',
                buildNumber: '1',
                profile: 'production',
                status: 'succeeded',
                sourcePreparationId: 'shared-a',
                submissions: [
                  { id: `${publicPlatform}-submission`, status: 'submitted' },
                ],
                storeStatus: {
                  status: 'live',
                  providerState: 'LIVE',
                  checkedAt: time,
                },
                base: null,
              },
            ],
            ota: null,
          },
          [other]: { attempts: [], ota: null },
        },
      },
    ],
  } as unknown as ReleaseState;
}

function correction(
  state: ReleaseState,
  platform: 'ios' | 'android' = 'android',
) {
  const next = structuredClone(state) as ReleaseState;
  (
    next.releases[0] as unknown as Record<string, unknown>
  ).platformPreparations = [
    {
      preparationId: `${platform}-correction-a`,
      platform,
      treeHash: sha('d'),
      preparedCommit: sha('e'),
      preparedAt: time,
      status: 'prepared',
    },
  ];
  return next;
}

Deno.test(
  'accepts a one-public-platform correction and preserves deployed prepared records',
  () => {
    const previous = partialPublicState();
    const next = correction(previous);
    assertEquals(isReleaseState(previous), true);
    assertEquals(isReleaseState(next), true);
    assertEquals(validateReleaseStateUpdate(previous, next), true);
  },
);

Deno.test(
  'rejects forged correction scope, public-platform writes, and wrong build source',
  () => {
    const previous = partialPublicState();
    const wrongScope = correction(previous, 'ios');
    assertEquals(validateReleaseStateUpdate(previous, wrongScope), false);

    const corrected = correction(previous);
    const wrongBuild = structuredClone(corrected) as ReleaseState;
    (
      wrongBuild.releases[0] as StoreReleaseRecord
    ).platforms.android.attempts.push({
      easBuildId: 'android-wrong',
      appVersion: '1.8.0',
      buildNumber: '2',
      profile: 'production',
      status: 'requested',
      sourcePreparationId: 'shared-a',
      submissions: [],
      storeStatus: null,
      base: null,
    });
    assertEquals(isReleaseState(wrongBuild), true);
    assertEquals(validateReleaseStateUpdate(corrected, wrongBuild), false);

    const publicWrite = structuredClone(previous) as ReleaseState;
    (
      publicWrite.releases[0] as StoreReleaseRecord
    ).platforms.ios.attempts[0].storeStatus!.checkedAt =
      '2026-07-31T12:00:00.000Z';
    assertEquals(validateReleaseStateUpdate(previous, publicWrite), false);
  },
);

Deno.test('rejects corrections with zero or two public platforms', () => {
  const nonePublic = structuredClone(partialPublicState()) as ReleaseState;
  (nonePublic.releases[0] as StoreReleaseRecord).platforms.ios.attempts = [];
  (
    nonePublic.releases[0] as unknown as Record<string, unknown>
  ).productionCommit = null;
  assertEquals(
    validateReleaseStateUpdate(nonePublic, correction(nonePublic)),
    false,
  );

  const bothPublic = structuredClone(partialPublicState()) as ReleaseState;
  (
    bothPublic.releases[0] as StoreReleaseRecord
  ).platforms.android.attempts.push({
    easBuildId: 'android-a',
    appVersion: '1.8.0',
    buildNumber: '1',
    profile: 'production',
    status: 'succeeded',
    sourcePreparationId: 'shared-a',
    submissions: [{ id: 'android-submission', status: 'submitted' }],
    storeStatus: { status: 'live', providerState: 'LIVE', checkedAt: time },
    base: null,
  });
  assertEquals(
    validateReleaseStateUpdate(bothPublic, correction(bothPublic)),
    false,
  );
});
