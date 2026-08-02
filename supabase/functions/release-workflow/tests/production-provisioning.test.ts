import { assertEquals } from '@std/assert';
import { buildProductionProvisioning } from '../_shared/production-provisioning-validation.ts';
import { validateReleaseStateUpdate } from '../_shared/state-update-validation.ts';
import { isReleaseState } from '../_shared/state-validation.ts';
import { canBeginProductionProvisioning } from '../_shared/production-provisioning-update-validation.ts';
import type { ReleaseState, StoreReleaseRecord } from '../_shared/types.ts';

const time = '2026-07-31T12:00:00.000Z';
const sha = (character: string) => character.repeat(40);
function previewPlatform(platform: 'ios' | 'android') {
  const easBuildId = `${platform}-preview`;
  return {
    attempts: [
      {
        easBuildId,
        appVersion: '1.9.0',
        buildNumber: '1',
        profile: 'preview' as const,
        status: 'succeeded' as const,
      },
    ],
    stagingBase: {
      easBuildId,
      label: `${platform}-base`,
      packageHash: `${platform}-base-hash`,
    },
    stagingOta: {
      baseEasBuildId: easBuildId,
      label: `${platform}-ota`,
      packageHash: `${platform}-ota-hash`,
    },
  };
}
function candidate(): StoreReleaseRecord {
  return {
    id: 'candidate',
    version: '1.9.0',
    preparation: {
      preparationId: 'candidate-preparation',
      treeHash: sha('a'),
      preparedCommit: sha('b'),
      marketingVersion: '1.9.0',
      nativeGeneration: 'native-2',
      preparedAt: time,
      status: 'prepared',
    },
    productionCommit: null,
    native: 'native-2',
    nativeFloorVersion: '1.9.0',
    preview: {
      status: 'approved',
      platforms: {
        ios: previewPlatform('ios'),
        android: previewPlatform('android'),
      },
      smokeApprovedAt: time,
    },
    createdAt: time,
    releaseType: 'store',
    status: 'in_progress',
    platforms: {
      ios: { attempts: [], ota: null },
      android: { attempts: [], ota: null },
    },
  };
}
function approvedState(): ReleaseState {
  return {
    stateVersion: 2,
    currentNative: 'native-1',
    stagingLane: { activeNative: 'native-2', resetTargetNative: null },
    releases: [candidate()],
  };
}
function getCandidate(state: ReleaseState): StoreReleaseRecord {
  return state.releases[0] as StoreReleaseRecord;
}
function begin(state: ReleaseState): ReleaseState {
  const next = structuredClone(state);
  const release = getCandidate(next);
  release.productionProvisioning = buildProductionProvisioning(release);
  return next;
}
function metadata(
  record: StoreReleaseRecord['productionProvisioning'] extends infer T
    ? T extends { platforms: Record<'ios' | 'android', infer P> }
      ? P
      : never
    : never,
) {
  return {
    id: 'eas-variable-id',
    name: record.easVariableName,
    environment: record.environment,
    scope: record.scope,
    visibility: record.visibility,
    type: record.type,
    updatedAt: time,
  } as const;
}

Deno.test(
  'accepts local verification timestamps and preserves legacy provider timestamps',
  () => {
    const ready = begin(approvedState());
    getCandidate(ready).productionProvisioning!.platforms.ios.status =
      'deployment_ready';

    const local = structuredClone(ready);
    const localRecord =
      getCandidate(local).productionProvisioning!.platforms.ios;
    localRecord.status = 'eas_configured';
    localRecord.easVariable = {
      id: 'eas-variable-id',
      name: localRecord.easVariableName,
      environment: localRecord.environment,
      scope: localRecord.scope,
      visibility: localRecord.visibility,
      type: localRecord.type,
      verifiedAt: time,
    };
    assertEquals(validateReleaseStateUpdate(ready, local), true);

    const legacy = structuredClone(ready);
    const legacyRecord =
      getCandidate(legacy).productionProvisioning!.platforms.ios;
    legacyRecord.status = 'eas_configured';
    legacyRecord.easVariable = metadata(legacyRecord);
    assertEquals(validateReleaseStateUpdate(ready, legacy), true);

    const both = structuredClone(ready);
    const bothRecord = getCandidate(both).productionProvisioning!.platforms.ios;
    bothRecord.status = 'eas_configured';
    (bothRecord as unknown as { easVariable: unknown }).easVariable = {
      ...metadata(bothRecord),
      verifiedAt: time,
    };
    assertEquals(validateReleaseStateUpdate(ready, both), false);
  },
);

Deno.test(
  'accepts both platform intent → deployment_ready → eas_configured lifecycles',
  () => {
    const initial = approvedState();
    let next = begin(initial);
    assertEquals(validateReleaseStateUpdate(initial, next), true);
    assertEquals(
      getCandidate(next).productionProvisioning!.platforms.ios.visibility,
      'sensitive',
    );
    for (const platform of ['ios', 'android'] as const) {
      const ready = structuredClone(next);
      getCandidate(ready).productionProvisioning!.platforms[platform].status =
        'deployment_ready';
      assertEquals(validateReleaseStateUpdate(next, ready), true);
      next = structuredClone(ready);
      const record =
        getCandidate(next).productionProvisioning!.platforms[platform];
      record.status = 'eas_configured';
      record.easVariable = metadata(record);
      assertEquals(validateReleaseStateUpdate(ready, next), true);
    }
    assertEquals(next.currentNative, 'native-1');
    assertEquals(getCandidate(next).status, 'in_progress');
    assertEquals(getCandidate(next).platforms.ios.attempts, []);
    assertEquals(getCandidate(next).platforms.android.attempts, []);
  },
);

Deno.test(
  'allows retryable work but rejects unknown automatic retry and skipped readiness',
  () => {
    const intent = begin(approvedState());
    const retryable = structuredClone(intent);
    getCandidate(retryable).productionProvisioning!.platforms.ios.status =
      'retryable';
    assertEquals(validateReleaseStateUpdate(intent, retryable), true);
    const retried = structuredClone(retryable);
    getCandidate(retried).productionProvisioning!.platforms.ios.status =
      'intent';
    assertEquals(validateReleaseStateUpdate(retryable, retried), true);
    const unknown = structuredClone(retried);
    getCandidate(unknown).productionProvisioning!.platforms.ios.status =
      'unknown';
    assertEquals(validateReleaseStateUpdate(retried, unknown), true);
    const forgedRetry = structuredClone(unknown);
    getCandidate(forgedRetry).productionProvisioning!.platforms.ios.status =
      'intent';
    assertEquals(validateReleaseStateUpdate(unknown, forgedRetry), false);
    const skipped = structuredClone(intent);
    const record = getCandidate(skipped).productionProvisioning!.platforms.ios;
    record.status = 'eas_configured';
    record.easVariable = metadata(record);
    assertEquals(validateReleaseStateUpdate(intent, skipped), false);
  },
);

Deno.test(
  'rejects forged identity and deterministic facts plus bundled mutations',
  () => {
    const initial = approvedState();
    const intent = begin(initial);
    for (const [key, value] of Object.entries({
      deployment: 'production-native-3',
      easVariableName: 'FORGED_KEY',
      environment: 'preview',
      scope: 'account',
      visibility: 'plaintext',
      type: 'file',
      native: 'native-3',
      treeHash: sha('f'),
      preparationId: 'forged-preparation',
    })) {
      const forged = structuredClone(intent) as unknown as Record<
        string,
        unknown
      >;
      const release = (forged.releases as Array<Record<string, unknown>>)[0];
      const provisioning = release.productionProvisioning as Record<
        string,
        unknown
      >;
      if (['native', 'treeHash', 'preparationId'].includes(key))
        provisioning[key] = value;
      else
        (provisioning.platforms as Record<string, Record<string, unknown>>).ios[
          key
        ] = value;
      assertEquals(isReleaseState(forged), false);
    }
    const bundled = begin(initial);
    getCandidate(bundled).preview!.smokeApprovedAt = '2026-08-01T00:00:00.000Z';
    assertEquals(validateReleaseStateUpdate(initial, bundled), false);
  },
);

Deno.test(
  'keeps existing v2 candidate state valid without provisioning',
  () => {
    assertEquals(isReleaseState(approvedState()), true);
  },
);

Deno.test(
  'rejects every non-unique or non-native-candidate eligibility shape',
  () => {
    const cases: Array<
      (state: ReleaseState, release: StoreReleaseRecord) => void
    > = [
      (state) => {
        state.currentNative = 'native-2';
      },
      (_state, release) => {
        (release as unknown as Record<string, unknown>).releaseType = 'ota';
      },
      (_state, release) => {
        release.nativeFloorVersion = null;
      },
      (_state, release) => {
        (release as unknown as Record<string, unknown>).releaseType =
          'adopted_baseline';
      },
      (_state, release) => {
        release.status = 'superseded';
      },
      (_state, release) => {
        release.preview!.status = 'smoke_pending';
      },
      (_state, release) => {
        release.platforms.ios.attempts.push({} as never);
      },
      (state, release) => {
        state.releases.push({
          ...structuredClone(release),
          id: 'other-candidate',
        });
      },
    ];
    for (const update of cases) {
      const state = approvedState();
      const release = getCandidate(state);
      update(state, release);
      assertEquals(canBeginProductionProvisioning(state, release), false);
    }
  },
);
