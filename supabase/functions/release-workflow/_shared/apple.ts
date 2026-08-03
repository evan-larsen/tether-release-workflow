import { ProviderError } from './errors.ts';
import type { FetchLike, StoreStatus } from './types.ts';
import type { StoreBuildIdentity } from './store-status-types.ts';

type StoreBuildInput = StoreBuildIdentity & { action?: string };

const APP_STORE_CONNECT_URL = 'https://api.appstoreconnect.apple.com/v1';
// Review history can be longer than one App Store Connect response. Bound the
// read to avoid making ordinary status enrichment unbounded.
const REVIEW_SUBMISSION_PAGE_LIMIT = 5;

interface AppleConfig {
  bundleId: string;
  privateKey: string;
  keyId: string;
  issuerId: string;
}

interface AppleResource {
  id: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<string, { data?: { id?: unknown } }>;
}

interface AppleCollection {
  data?: AppleResource[];
  links?: { next?: unknown };
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
  if (['READY_FOR_DISTRIBUTION', 'READY_FOR_SALE'].includes(state))
    return 'live';
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
  const url = path.startsWith('http')
    ? new URL(path)
    : new URL(`${APP_STORE_CONNECT_URL}${path}`);
  if (
    url.origin !== new URL(APP_STORE_CONNECT_URL).origin ||
    !url.pathname.startsWith('/v1/')
  ) {
    throw new ProviderError();
  }
  const response = await fetcher(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 404) return { data: [] } as T;
  if (!response.ok) throw new ProviderError();
  return (await response.json()) as T;
}

function getLatestReviewSubmittedAt(
  submissions: AppleCollection,
  appStoreVersionId: string,
  latest: string | null,
): string | null {
  return (submissions.data ?? []).reduce((current, submission) => {
    if (
      submission.relationships?.appStoreVersionForReview?.data?.id !==
      appStoreVersionId
    ) {
      return current;
    }
    const submittedDate = submission.attributes?.submittedDate;
    if (
      typeof submittedDate !== 'string' ||
      !Number.isFinite(Date.parse(submittedDate))
    ) {
      return current;
    }
    if (!current || Date.parse(submittedDate) > Date.parse(current)) {
      return submittedDate;
    }
    return current;
  }, latest);
}

async function getAppleReviewSubmittedAt(
  appId: string,
  appStoreVersionId: string,
  token: string,
  fetcher: FetchLike,
): Promise<string | null> {
  let nextPath: string | null =
    `/apps/${encodeURIComponent(appId)}/reviewSubmissions?include=appStoreVersionForReview&limit=200`;
  let reviewSubmittedAt: string | null = null;
  const visitedPaths = new Set<string>();

  for (
    let page = 0;
    page < REVIEW_SUBMISSION_PAGE_LIMIT && nextPath;
    page += 1
  ) {
    if (visitedPaths.has(nextPath)) break;
    visitedPaths.add(nextPath);
    const submissions: AppleCollection = await getAppleJson<AppleCollection>(
      fetcher,
      nextPath,
      token,
    );
    reviewSubmittedAt = getLatestReviewSubmittedAt(
      submissions,
      appStoreVersionId,
      reviewSubmittedAt,
    );
    nextPath =
      typeof submissions.links?.next === 'string'
        ? submissions.links.next
        : null;
  }

  return reviewSubmittedAt;
}

interface AppleStoreLookup {
  status: StoreStatus;
  providerState: string | null;
  token: string;
  appId: string | null;
  appStoreVersionId: string | null;
}

async function getAppleStoreLookup(
  input: StoreBuildInput,
  config: AppleConfig,
  fetcher: FetchLike,
): Promise<AppleStoreLookup> {
  try {
    const token = await createAppleToken(config);
    const apps = await getAppleJson<AppleCollection>(
      fetcher,
      `/apps?filter[bundleId]=${encodeURIComponent(config.bundleId)}`,
      token,
    );
    const appId = apps.data?.[0]?.id;
    if (!appId)
      return {
        status: 'not_found',
        providerState: null,
        token,
        appId: null,
        appStoreVersionId: null,
      };

    const builds = await getAppleJson<AppleCollection>(
      fetcher,
      `/builds?filter[app]=${encodeURIComponent(appId)}&filter[version]=${encodeURIComponent(input.buildNumber)}&filter[preReleaseVersion.version]=${encodeURIComponent(input.appVersion)}&limit=200`,
      token,
    );
    const build = builds.data?.find(
      (candidate) => candidate.attributes?.version === input.buildNumber,
    );
    if (!build)
      return {
        status: 'not_found',
        providerState: null,
        token,
        appId,
        appStoreVersionId: null,
      };

    const version = await getAppleJson<{ data?: AppleResource }>(
      fetcher,
      `/builds/${encodeURIComponent(build.id)}/appStoreVersion`,
      token,
    );
    const state =
      version.data?.attributes?.appStoreState ??
      version.data?.attributes?.appVersionState;
    if (typeof state !== 'string')
      return {
        status: 'pending',
        providerState: null,
        token,
        appId,
        appStoreVersionId: version.data?.id ?? null,
      };
    return {
      status: toAppleStatus(state),
      providerState: state,
      token,
      appId,
      appStoreVersionId: version.data?.id ?? null,
    };
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw new ProviderError();
  }
}

export async function getAppleStoreStatus(
  input: StoreBuildInput,
  config: AppleConfig,
  fetcher: FetchLike,
): Promise<{ status: StoreStatus; providerState: string | null }> {
  const lookup = await getAppleStoreLookup(input, config, fetcher);
  return {
    status: lookup.status,
    providerState: lookup.providerState,
  };
}

export async function getAppleStoreReviewFacts(
  input: StoreBuildInput,
  config: AppleConfig,
  fetcher: FetchLike,
): Promise<{
  status: StoreStatus;
  providerState: string | null;
  reviewSubmittedAt: string | null;
}> {
  const lookup = await getAppleStoreLookup(input, config, fetcher);
  if (!lookup.appId || !lookup.appStoreVersionId)
    return {
      status: lookup.status,
      providerState: lookup.providerState,
      reviewSubmittedAt: null,
    };
  try {
    const reviewSubmittedAt = await getAppleReviewSubmittedAt(
      lookup.appId,
      lookup.appStoreVersionId,
      lookup.token,
      fetcher,
    );
    return {
      status: lookup.status,
      providerState: lookup.providerState,
      reviewSubmittedAt,
    };
  } catch {
    return {
      status: lookup.status,
      providerState: lookup.providerState,
      reviewSubmittedAt: null,
    };
  }
}

export { toAppleStatus };
