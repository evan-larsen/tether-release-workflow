import { assertEquals, assertThrows } from '@std/assert';
import { isAuthorized } from '../_shared/auth.ts';
import { RequestError } from '../_shared/errors.ts';
import { parseReleaseWorkflowPayload } from '../_shared/request.ts';

const validRequest = {
  action: 'get_store_build_status',
  platform: 'ios',
  appVersion: '1.8.0',
  buildNumber: '43',
} as const;

Deno.test('accepts the exact iOS request contract', () => {
  assertEquals(parseReleaseWorkflowPayload(validRequest), validRequest);
});

Deno.test('accepts an Android numeric versionCode', () => {
  assertEquals(
    parseReleaseWorkflowPayload({ ...validRequest, platform: 'android' }),
    { ...validRequest, platform: 'android' },
  );
});

Deno.test(
  'rejects an unknown action, extra field, and invalid build number',
  () => {
    assertThrows(
      () => parseReleaseWorkflowPayload({ ...validRequest, action: 'other' }),
      RequestError,
    );
    assertThrows(
      () => parseReleaseWorkflowPayload({ ...validRequest, extra: true }),
      RequestError,
    );
    assertThrows(
      () =>
        parseReleaseWorkflowPayload({
          ...validRequest,
          platform: 'android',
          buildNumber: '4.3',
        }),
      RequestError,
    );
  },
);

Deno.test(
  'compares workflow tokens without accepting missing or mismatched values',
  () => {
    assertEquals(isAuthorized('expected-token', 'expected-token'), true);
    assertEquals(isAuthorized('wrong-token', 'expected-token'), false);
    assertEquals(isAuthorized(null, 'expected-token'), false);
  },
);
