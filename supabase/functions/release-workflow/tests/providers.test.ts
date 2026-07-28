import { assertEquals } from '@std/assert';
import { getAppleStoreStatus, toAppleStatus } from '../_shared/apple.ts';
import { ProviderError } from '../_shared/errors.ts';
import { getGooglePlayStatus, toGoogleStatus } from '../_shared/google.ts';
import { getStoreBuildStatus } from '../_shared/store-status.ts';
import type { RuntimeDependencies, StoreStatus } from '../_shared/types.ts';

const appleStates: Array<[string, StoreStatus]> = [
  ['READY_FOR_DISTRIBUTION', 'live'],
  ['READY_FOR_SALE', 'live'],
  ['PENDING_DEVELOPER_RELEASE', 'approved_not_live'],
  ['PENDING_APPLE_RELEASE', 'approved_not_live'],
  ['ACCEPTED', 'approved_not_live'],
  ['REJECTED', 'rejected'],
  ['INVALID_BINARY', 'rejected'],
  ['METADATA_REJECTED', 'rejected'],
  ['DEVELOPER_REJECTED', 'rejected'],
  ['IN_REVIEW', 'pending'],
];

for (const [providerState, status] of appleStates) {
  Deno.test(`maps Apple ${providerState} to ${status}`, () => {
    assertEquals(toAppleStatus(providerState), status);
  });
}

const googleStates: Array<[string, StoreStatus]> = [
  ['RELEASE_LIFECYCLE_STATE_PUBLISHED', 'live'],
  ['RELEASE_LIFECYCLE_STATE_APPROVED_NOT_PUBLISHED', 'approved_not_live'],
  ['RELEASE_LIFECYCLE_STATE_NOT_APPROVED', 'rejected'],
  ['RELEASE_LIFECYCLE_STATE_DRAFT', 'pending'],
  ['RELEASE_LIFECYCLE_STATE_NOT_SENT_FOR_REVIEW', 'pending'],
  ['RELEASE_LIFECYCLE_STATE_IN_REVIEW', 'pending'],
];

for (const [providerState, status] of googleStates) {
  Deno.test(`maps Google ${providerState} to ${status}`, () => {
    assertEquals(toGoogleStatus(providerState), status);
  });
}

const testDependencies: RuntimeDependencies = {
  fetch: () => Promise.reject(new ProviderError()),
  secrets: {
    googleServiceAccountJson: '{}',
    googlePackageName: 'com.tetherdaily.app',
    iosBundleId: 'com.tetherdaily.app',
    applePrivateKey: 'invalid',
    appleKeyId: 'key',
    appleIssuerId: 'issuer',
  },
  releaseState: {
    getState: () => Promise.reject(new Error('State must not be called.')),
    compareAndSwap: () =>
      Promise.reject(new Error('State must not be called.')),
  },
};

function toPem(bytes: ArrayBuffer): string {
  const base64 = btoa(String.fromCharCode(...new Uint8Array(bytes)));
  const lines = base64.match(/.{1,64}/g)?.join('\n') ?? '';
  return `-----BEGIN PRIVATE KEY-----\n${lines}\n-----END PRIVATE KEY-----`;
}

async function createPrivateKey(
  algorithm: EcKeyGenParams | RsaHashedKeyGenParams,
): Promise<string> {
  const pair = (await crypto.subtle.generateKey(algorithm, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  return toPem(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
}

Deno.test('normalizes provider failures without exposing details', async () => {
  const result = await getStoreBuildStatus(
    {
      action: 'get_store_build_status',
      platform: 'ios',
      appVersion: '1.8.0',
      buildNumber: '43',
    },
    testDependencies,
  );

  assertEquals(result.httpStatus, 502);
  assertEquals(result.body.status, 'unknown');
  assertEquals(result.body.providerState, null);
  assertEquals('action' in result.body, false);
});

Deno.test(
  'uses injected Apple fetch responses for an exact build',
  async () => {
    const privateKey = await createPrivateKey({
      name: 'ECDSA',
      namedCurve: 'P-256',
    });
    const calls: string[] = [];
    const fetch = (input: string | URL | Request) => {
      const url = String(input);
      calls.push(url);
      if (url.includes('/apps?'))
        return Promise.resolve(Response.json({ data: [{ id: 'app-id' }] }));
      if (url.includes('/builds?')) {
        return Promise.resolve(
          Response.json({
            data: [
              {
                id: 'build-id',
                attributes: { version: '43' },
              },
            ],
          }),
        );
      }
      return Promise.resolve(
        Response.json({
          data: { attributes: { appStoreState: 'READY_FOR_DISTRIBUTION' } },
        }),
      );
    };

    const result = await getAppleStoreStatus(
      {
        action: 'get_store_build_status',
        platform: 'ios',
        appVersion: '1.8.0',
        buildNumber: '43',
      },
      {
        bundleId: 'com.tetherdaily.app',
        privateKey,
        keyId: 'key-id',
        issuerId: 'issuer-id',
      },
      fetch,
    );

    assertEquals(result, {
      status: 'live',
      providerState: 'READY_FOR_DISTRIBUTION',
    });
    assertEquals(calls.length, 3);
    assertEquals(
      calls[1].includes('filter[preReleaseVersion.version]=1.8.0'),
      true,
    );
  },
);

Deno.test(
  'uses injected Google fetch responses and returns not_found exactly',
  async () => {
    const privateKey = await createPrivateKey({
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    });
    const fetch = (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('oauth2.googleapis.com')) {
        return Promise.resolve(Response.json({ access_token: 'fake-token' }));
      }
      return Promise.resolve(
        Response.json({
          releases: [
            {
              activeArtifacts: [{ versionCode: 42 }],
              releaseLifecycleState: 'RELEASE_LIFECYCLE_STATE_PUBLISHED',
            },
          ],
        }),
      );
    };

    const result = await getGooglePlayStatus(
      {
        action: 'get_store_build_status',
        platform: 'android',
        appVersion: '1.8.0',
        buildNumber: '43',
      },
      {
        packageName: 'com.tetherdaily.app',
        serviceAccountJson: JSON.stringify({
          client_email: 'test@example.test',
          private_key: privateKey,
        }),
      },
      fetch,
    );

    assertEquals(result, { status: 'not_found', providerState: null });
  },
);
