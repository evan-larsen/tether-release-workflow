import { assertEquals } from '@std/assert';
import contract from './fixtures/preview-staging-contract-v1.json' with { type: 'json' };
import {
  buildPreviewStagingBaseIntent,
  buildPreviewStagingOtaIntent,
} from '../_shared/preview-staging-validation.ts';
import { validateReleaseStateUpdate } from '../_shared/state-update-validation.ts';
import type {
  PreviewStagingBaseOperation,
  PreviewStagingOtaOperation,
  ReleaseState,
  StoreReleaseRecord,
} from '../_shared/types.ts';

function release(): Record<string, unknown> {
  return {
    id: 'preview-contract',
    version: '1.9.0',
    native: 'native-2',
    nativeFloorVersion: '1.9.0',
    preparation: {
      preparationId: 'preview-preparation',
      treeHash: 'a'.repeat(40),
      preparedCommit: 'b'.repeat(40),
    },
    preview: {
      platforms: {
        ios: {
          attempts: [
            {
              easBuildId: 'ios-preview-build',
              appVersion: '1.9.0',
              buildNumber: '51',
              status: 'succeeded',
            },
          ],
          stagingBase: {
            ...contract.baseIntent,
            status: 'registered',
            label: 'ios-base',
            packageHash: 'ios-base-hash',
            releaseMethod: 'Upload',
          },
        },
      },
    },
  };
}

Deno.test(
  'builds the shared Preview Staging base and OTA intent fixtures',
  () => {
    const candidate = release();
    assertEquals(
      buildPreviewStagingBaseIntent(candidate, 'ios'),
      contract.baseIntent,
    );
    assertEquals(
      buildPreviewStagingOtaIntent(candidate, 'ios'),
      contract.otaIntent,
    );
  },
);

function state(): ReleaseState {
  const platform = () => ({ attempts: [], ota: null });
  return {
    stateVersion: 2 as const,
    currentNative: 'native-1',
    stagingLane: { activeNative: 'native-2', resetTargetNative: null },
    releases: [
      {
        id: 'preview-contract',
        version: '1.9.0',
        native: 'native-2',
        nativeFloorVersion: '1.9.0',
        preparation: {
          preparationId: 'preview-preparation',
          treeHash: 'a'.repeat(40),
          preparedCommit: 'b'.repeat(40),
          marketingVersion: '1.9.0',
          nativeGeneration: 'native-2',
          preparedAt: '2026-07-31T00:00:00.000Z',
          status: 'prepared',
        },
        productionCommit: null,
        createdAt: '2026-07-31T00:00:00.000Z',
        releaseType: 'store',
        status: 'in_progress',
        preview: {
          status: 'building',
          smokeApprovedAt: null,
          platforms: {
            ios: {
              attempts: [
                {
                  easBuildId: 'ios-preview-build',
                  appVersion: '1.9.0',
                  buildNumber: '51',
                  profile: 'preview',
                  status: 'succeeded',
                },
              ],
              stagingBase: null,
              stagingOta: null,
            },
            android: { attempts: [], stagingBase: null, stagingOta: null },
          },
        },
        platforms: { ios: platform(), android: platform() },
      },
    ],
  } as unknown as ReleaseState;
}

function previewOf(value: ReleaseState) {
  const release = value.releases[0];
  if (release.releaseType !== 'store' || release.preview === null)
    throw new Error('Expected Preview store release.');
  return release as StoreReleaseRecord & {
    preview: NonNullable<StoreReleaseRecord['preview']>;
  };
}

Deno.test(
  'permits only intent-first Preview base and OTA lifecycle updates',
  () => {
    const initial = state();
    const baseIntent = structuredClone(initial);
    previewOf(baseIntent).preview.platforms.ios.stagingBase =
      contract.baseIntent as PreviewStagingBaseOperation;
    assertEquals(validateReleaseStateUpdate(initial, baseIntent), true);
    const forged = structuredClone(initial);
    previewOf(forged).preview.platforms.ios.stagingBase = {
      ...contract.baseIntent,
      status: 'registered',
      label: 'v1',
      packageHash: 'hash',
      releaseMethod: 'Upload',
    } as PreviewStagingBaseOperation;
    assertEquals(validateReleaseStateUpdate(initial, forged), false);
    const unknown = structuredClone(baseIntent);
    (
      previewOf(unknown).preview.platforms.ios
        .stagingBase as PreviewStagingBaseOperation
    ).status = 'unknown';
    assertEquals(validateReleaseStateUpdate(baseIntent, unknown), true);
    const baseRegistered = structuredClone(unknown);
    previewOf(baseRegistered).preview.platforms.ios.stagingBase = {
      ...contract.baseIntent,
      status: 'registered',
      label: 'ios-base',
      packageHash: 'ios-base-hash',
      releaseMethod: 'Upload',
    } as PreviewStagingBaseOperation;
    assertEquals(validateReleaseStateUpdate(unknown, baseRegistered), true);
    const otaIntent = structuredClone(baseRegistered);
    previewOf(otaIntent).preview.platforms.ios.stagingOta =
      contract.otaIntent as PreviewStagingOtaOperation;
    assertEquals(validateReleaseStateUpdate(baseRegistered, otaIntent), true);
    const wrongCandidate = structuredClone(otaIntent);
    (
      previewOf(wrongCandidate).preview.platforms.ios
        .stagingOta as PreviewStagingOtaOperation
    ).candidateId = 'wrong';
    assertEquals(
      validateReleaseStateUpdate(baseRegistered, wrongCandidate),
      false,
    );
  },
);
