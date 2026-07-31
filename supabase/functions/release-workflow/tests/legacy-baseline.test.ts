import { assertEquals } from '@std/assert';
import { isReleaseState } from '../_shared/state-validation.ts';
import { validateReleaseStateUpdate } from '../_shared/state-update-validation.ts';

const time = '2026-07-30T12:00:00.000Z';
const sha = (character: string) => character.repeat(40);

function workflowState() {
  return {
    stateVersion: 2 as const,
    currentNative: null,
    stagingLane: { activeNative: null, resetTargetNative: null },
    releases: [
      {
        id: 'workflow-only',
        version: '1.8.0',
        preparation: {
          preparationId: 'workflow-prep',
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
        preview: {
          status: 'required',
          platforms: {
            ios: { attempts: [], stagingBase: null, stagingOta: null },
            android: { attempts: [], stagingBase: null, stagingOta: null },
          },
          smokeApprovedAt: null,
        },
        createdAt: time,
        releaseType: 'store',
        status: 'in_progress',
        platforms: {
          ios: { attempts: [], ota: null },
          android: { attempts: [], ota: null },
        },
      },
    ],
  };
}

function baseline() {
  const source = { commit: sha('c'), treeHash: sha('d') };
  const artifact = (easBuildId: string, buildNumber: string) => ({
    easBuildId,
    appVersion: '1.8.0',
    buildNumber,
    profile: 'production',
    status: 'succeeded',
    sourceCommit: source.commit,
    sourceTreeHash: source.treeHash,
    storeStatus: { status: 'live', providerState: 'LIVE', checkedAt: time },
    base: { status: 'eligible', staging: null, production: null },
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

function adoptionState() {
  const previous = workflowState();
  return {
    ...previous,
    currentNative: 'native-1',
    releases: [
      {
        ...previous.releases[0],
        status: 'superseded',
        supersededReason: 'pre_baseline_adoption',
      },
      baseline(),
    ],
  };
}

Deno.test(
  'accepts only the narrow two-platform legacy live-baseline adoption',
  () => {
    const previous = workflowState();
    const next = adoptionState();
    assertEquals(isReleaseState(previous), true);
    assertEquals(isReleaseState(next), true);
    assertEquals(validateReleaseStateUpdate(previous, next), true);
  },
);

Deno.test(
  'rejects forged legacy adoption facts and direct current-native changes',
  () => {
    const previous = workflowState();
    assertEquals(
      validateReleaseStateUpdate(previous, {
        ...previous,
        currentNative: 'native-1',
      }),
      false,
    );
    const onePlatform = adoptionState();
    delete (onePlatform.releases[1] as Record<string, unknown>).artifacts;
    assertEquals(validateReleaseStateUpdate(previous, onePlatform), false);
    const fabricatedBase = adoptionState();
    (
      (fabricatedBase.releases[1] as Record<string, unknown>)
        .artifacts as Record<string, { base: unknown }>
    ).ios.base = {
      status: 'eligible',
      staging: { label: 'v1' },
      production: null,
    };
    assertEquals(validateReleaseStateUpdate(previous, fabricatedBase), false);
    const noSupersession = structuredClone(adoptionState()) as Record<
      string,
      unknown
    >;
    (noSupersession.releases as unknown[])[0] = previous.releases[0];
    assertEquals(validateReleaseStateUpdate(previous, noSupersession), false);
  },
);

Deno.test(
  'rejects adoption when pre-baseline records have external progress',
  () => {
    const previous = structuredClone(workflowState()) as Record<
      string,
      unknown
    >;
    const release = (previous.releases as Array<Record<string, unknown>>)[0];
    const preview = release.preview as Record<string, unknown>;
    const platforms = preview.platforms as Record<
      string,
      { attempts: Array<Record<string, unknown>> }
    >;
    platforms.ios.attempts.push({
      easBuildId: 'preview-requested',
      appVersion: '1.8.0',
      buildNumber: '1',
      profile: 'preview',
      status: 'requested',
    });
    preview.status = 'building';
    const next = structuredClone(adoptionState()) as Record<string, unknown>;
    (next.releases as Array<Record<string, unknown>>)[0] = {
      ...release,
      status: 'superseded',
      supersededReason: 'pre_baseline_adoption',
    };
    assertEquals(validateReleaseStateUpdate(previous, next), false);
  },
);
