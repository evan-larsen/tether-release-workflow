import { assertEquals } from '@std/assert';
import { createReleaseWorkflowHandler } from '../index.ts';
import type {
  ReleaseState,
  ReleaseStateRecord,
  ReleaseStateRepository,
  RuntimeDependencies,
} from '../_shared/types.ts';

const initialState: ReleaseState = {
  stateVersion: 2,
  currentNative: null,
  stagingLane: {
    activeNative: null,
    resetTargetNative: null,
  },
  releases: [],
};

function preparedCandidateState(): ReleaseState {
  const time = '2026-07-28T00:00:00.000Z';
  return {
    ...initialState,
    releases: [
      {
        id: 'candidate',
        version: '1.9.0',
        preparation: {
          preparationId: 'prep',
          treeHash: 'a'.repeat(40),
          preparedCommit: 'b'.repeat(40),
          marketingVersion: '1.9.0',
          nativeGeneration: 'native-1',
          preparedAt: time,
          status: 'prepared',
        },
        productionCommit: null,
        native: 'native-1',
        nativeFloorVersion: '1.9.0',
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

function createRepository(): ReleaseStateRepository {
  let record: ReleaseStateRecord = {
    revision: 0,
    state: initialState,
    updatedAt: '2026-07-28T00:00:00.000Z',
  };
  return {
    getState: () => Promise.resolve(record),
    compareAndSwap: (expectedRevision, state) => {
      if (record.revision !== expectedRevision) return Promise.resolve(null);
      record = {
        revision: record.revision + 1,
        state,
        updatedAt: '2026-07-28T00:00:01.000Z',
      };
      return Promise.resolve(record);
    },
  };
}

function createDependencies(): RuntimeDependencies {
  return {
    fetch: () => Promise.reject(new Error('Provider must not be called.')),
    secrets: { workflowToken: 'test-token' },
    releaseState: createRepository(),
  };
}

async function callAction(
  dependencies: RuntimeDependencies,
  payload: Record<string, unknown>,
): Promise<Response> {
  return await createReleaseWorkflowHandler(dependencies)(
    new Request('https://example.test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-release-workflow-token': 'test-token',
      },
      body: JSON.stringify(payload),
    }),
  );
}

Deno.test('gets the seeded release state', async () => {
  const response = await callAction(createDependencies(), {
    action: 'get_release_state',
  });
  assertEquals(response.status, 200);
  assertEquals(await response.json(), {
    revision: 0,
    state: initialState,
    updatedAt: '2026-07-28T00:00:00.000Z',
  });
});

Deno.test('updates state and increments the revision', async () => {
  const dependencies = createDependencies();
  const nextState = preparedCandidateState();
  const response = await callAction(dependencies, {
    action: 'update_release_state',
    expectedRevision: 0,
    state: nextState,
  });
  assertEquals(response.status, 200);
  assertEquals(await response.json(), {
    revision: 1,
    state: nextState,
    updatedAt: '2026-07-28T00:00:01.000Z',
  });
});

Deno.test('returns 409 for a stale expected revision', async () => {
  const dependencies = createDependencies();
  const nextState = preparedCandidateState();
  await callAction(dependencies, {
    action: 'update_release_state',
    expectedRevision: 0,
    state: nextState,
  });
  const response = await callAction(dependencies, {
    action: 'update_release_state',
    expectedRevision: 0,
    state: initialState,
  });
  assertEquals(response.status, 409);
  assertEquals(await response.json(), { error: { code: 'revision_conflict' } });
});

Deno.test(
  'rejects malformed release state before invoking the repository',
  async () => {
    const response = await callAction(createDependencies(), {
      action: 'update_release_state',
      expectedRevision: 0,
      state: { stateVersion: 1, currentNative: null, releases: [] },
    });
    assertEquals(response.status, 400);
  },
);

Deno.test('rejects malformed v2 without exposing supplied values', async () => {
  const response = await callAction(createDependencies(), {
    action: 'update_release_state',
    expectedRevision: 0,
    state: {
      ...initialState,
      stagingLane: {
        activeNative: 'native-2',
        resetTargetNative: 'native-2',
      },
    },
  });
  assertEquals(response.status, 400);
  assertEquals(await response.json(), {
    error: { code: 'invalid_request' },
  });
});

Deno.test(
  'rejects a structurally valid direct current-native jump',
  async () => {
    const dependencies = createDependencies();
    const response = await callAction(dependencies, {
      action: 'update_release_state',
      expectedRevision: 0,
      state: {
        ...initialState,
        currentNative: 'native-1',
      },
    });

    assertEquals(response.status, 400);
    assertEquals(await response.json(), {
      error: { code: 'invalid_request' },
    });
    const unchanged = await callAction(dependencies, {
      action: 'get_release_state',
    });
    assertEquals((await unchanged.json()).revision, 0);
  },
);
