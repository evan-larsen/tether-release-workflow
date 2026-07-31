import { assertEquals } from '@std/assert';
import { validateReleaseStateUpdate } from '../_shared/state-update-validation.ts';
import { buildStagingLaneContractPair } from './state-update-contract-cases.ts';

Deno.test(
  'foreign Staging permits Preview artifact preflight before a reset',
  () => {
    const previous = buildStagingLaneContractPair('staging-lane-reset-begin', {
      emptyV2: (currentNative = null) => ({
        stateVersion: 2,
        currentNative,
        stagingLane: { activeNative: null, resetTargetNative: null },
        releases: [],
      }),
      previewCandidate: () => ({
        id: 'candidate',
        version: '1.9.0',
        preparation: {
          preparationId: 'prep',
          treeHash: 'a'.repeat(40),
          preparedCommit: 'b'.repeat(40),
          marketingVersion: '1.9.0',
          nativeGeneration: 'native-2',
          preparedAt: '2026-07-30T12:00:00.000Z',
          status: 'prepared',
        },
        productionCommit: null,
        native: 'native-2',
        nativeFloorVersion: '1.9.0',
        preview: {
          status: 'required',
          platforms: {
            ios: { attempts: [], stagingBase: null, stagingOta: null },
            android: { attempts: [], stagingBase: null, stagingOta: null },
          },
          smokeApprovedAt: null,
        },
        createdAt: '2026-07-30T12:00:00.000Z',
        releaseType: 'store',
        status: 'in_progress',
        platforms: {
          ios: { attempts: [], ota: null },
          android: { attempts: [], ota: null },
        },
      }),
    });
    const state = previous![0] as Record<string, unknown>;
    const next = structuredClone(state) as Record<string, unknown>;
    const release = (next.releases as Array<Record<string, unknown>>)[0];
    const preview = release.preview as Record<string, unknown>;
    preview.status = 'building';
    (
      (preview.platforms as Record<string, { attempts: unknown[] }>).ios
        .attempts as Array<Record<string, unknown>>
    ).push({
      easBuildId: 'ios-preview-foreign-lane',
      appVersion: '1.9.0',
      buildNumber: '1',
      profile: 'preview',
      status: 'requested',
    });
    assertEquals(validateReleaseStateUpdate(state, next), true);
  },
);
