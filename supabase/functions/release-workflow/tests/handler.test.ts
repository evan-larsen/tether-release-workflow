import { assertEquals } from '@std/assert';
import { createReleaseWorkflowHandler } from '../index.ts';
import type { RuntimeDependencies } from '../_shared/types.ts';

const dependencies: RuntimeDependencies = {
  fetch: () => Promise.reject(new Error('Provider must not be called.')),
  secrets: { workflowToken: 'test-token' },
  releaseState: {
    getState: () => Promise.reject(new Error('State must not be called.')),
    compareAndSwap: () =>
      Promise.reject(new Error('State must not be called.')),
  },
};

Deno.test('rejects non-POST requests before authentication', async () => {
  const response = await createReleaseWorkflowHandler(dependencies)(
    new Request('https://example.test', { method: 'GET' }),
  );
  assertEquals(response.status, 405);
  assertEquals(response.headers.get('access-control-allow-origin'), null);
});

Deno.test('rejects missing workflow tokens', async () => {
  const response = await createReleaseWorkflowHandler(dependencies)(
    new Request('https://example.test', {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  );
  assertEquals(response.status, 401);
});

Deno.test('rejects unknown actions after authentication', async () => {
  const response = await createReleaseWorkflowHandler(dependencies)(
    new Request('https://example.test', {
      method: 'POST',
      headers: { 'x-release-workflow-token': 'test-token' },
      body: JSON.stringify({
        action: 'unknown_action',
        platform: 'ios',
        appVersion: '1.8.0',
        buildNumber: '43',
      }),
    }),
  );
  assertEquals(response.status, 400);
});
