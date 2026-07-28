import { assertEquals, assertThrows } from '@std/assert';
import { isAuthorized } from '../_shared/auth.ts';
import { RequestError } from '../_shared/errors.ts';
import { parseStoreStatusPayload } from '../_shared/request.ts';

const validRequest = {
  action: 'get_store_build_status',
  platform: 'ios',
  appVersion: '1.8.0',
  buildNumber: '43',
};

Deno.test('accepts the exact iOS request contract', () => {
  assertEquals(parseStoreStatusPayload(validRequest), validRequest);
});

Deno.test('accepts an Android numeric versionCode', () => {
  assertEquals(
    parseStoreStatusPayload({ ...validRequest, platform: 'android' }),
    {
      ...validRequest,
      platform: 'android',
    },
  );
});

Deno.test(
  'rejects an unknown action, extra field, and invalid build number',
  () => {
    assertThrows(
      () => parseStoreStatusPayload({ ...validRequest, action: 'other' }),
      RequestError,
    );
    assertThrows(
      () => parseStoreStatusPayload({ ...validRequest, extra: true }),
      RequestError,
    );
    assertThrows(
      () =>
        parseStoreStatusPayload({
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
