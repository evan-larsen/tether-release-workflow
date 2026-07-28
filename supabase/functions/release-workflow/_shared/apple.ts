import { ProviderError } from './errors.ts';
import type { FetchLike, StoreStatus, StoreStatusRequest } from './types.ts';

const APP_STORE_CONNECT_URL = 'https://api.appstoreconnect.apple.com/v1';

interface AppleConfig {
  bundleId: string;
  privateKey: string;
  keyId: string;
  issuerId: string;
}

interface AppleResource {
  id: string;
  attributes?: Record<string, unknown>;
}

interface AppleCollection {
  data?: AppleResource[];
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

function fromPem(privateKey: string): ArrayBuffer {
  const base64 = privateKey.replace(
    /-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,
    '',
  );
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
}

async function createAppleToken(config: AppleConfig): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = toBase64Url(
    new TextEncoder().encode(
      JSON.stringify({
        alg: 'ES256',
        kid: config.keyId,
        typ: 'JWT',
      }),
    ),
  );
  const payload = toBase64Url(
    new TextEncoder().encode(
      JSON.stringify({
        iss: config.issuerId,
        iat: now,
        exp: now + 15 * 60,
        aud: 'appstoreconnect-v1',
      }),
    ),
  );
  const signingInput = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    fromPem(config.privateKey),
    {
      name: 'ECDSA',
      namedCurve: 'P-256',
    },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${toBase64Url(new Uint8Array(signature))}`;
}

function toAppleStatus(state: string): StoreStatus {
  if (state === 'READY_FOR_DISTRIBUTION') return 'live';
  if (
    ['PENDING_DEVELOPER_RELEASE', 'PENDING_APPLE_RELEASE', 'ACCEPTED'].includes(
      state,
    )
  ) {
    return 'approved_not_live';
  }
  if (
    [
      'REJECTED',
      'INVALID_BINARY',
      'METADATA_REJECTED',
      'DEVELOPER_REJECTED',
    ].includes(state)
  ) {
    return 'rejected';
  }
  return 'pending';
}

async function getAppleJson<T>(
  fetcher: FetchLike,
  path: string,
  token: string,
): Promise<T> {
  const response = await fetcher(`${APP_STORE_CONNECT_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 404) return { data: [] } as T;
  if (!response.ok) throw new ProviderError();
  return (await response.json()) as T;
}

export async function getAppleStoreStatus(
  input: StoreStatusRequest,
  config: AppleConfig,
  fetcher: FetchLike,
): Promise<{ status: StoreStatus; providerState: string | null }> {
  try {
    const token = await createAppleToken(config);
    const apps = await getAppleJson<AppleCollection>(
      fetcher,
      `/apps?filter[bundleId]=${encodeURIComponent(config.bundleId)}`,
      token,
    );
    const appId = apps.data?.[0]?.id;
    if (!appId) return { status: 'not_found', providerState: null };

    const builds = await getAppleJson<AppleCollection>(
      fetcher,
      `/builds?filter[app]=${encodeURIComponent(appId)}&filter[version]=${encodeURIComponent(input.buildNumber)}&filter[preReleaseVersion.version]=${encodeURIComponent(input.appVersion)}&limit=200`,
      token,
    );
    const build = builds.data?.find(
      (candidate) => candidate.attributes?.version === input.buildNumber,
    );
    if (!build) return { status: 'not_found', providerState: null };

    const version = await getAppleJson<{ data?: AppleResource }>(
      fetcher,
      `/builds/${encodeURIComponent(build.id)}/appStoreVersion`,
      token,
    );
    const state =
      version.data?.attributes?.appStoreState ??
      version.data?.attributes?.appVersionState;
    if (typeof state !== 'string')
      return { status: 'pending', providerState: null };
    return { status: toAppleStatus(state), providerState: state };
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw new ProviderError();
  }
}

export { toAppleStatus };
