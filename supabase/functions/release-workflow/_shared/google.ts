import { ProviderError } from './errors.ts';
import type { FetchLike, StoreStatus } from './types.ts';
import type { StoreBuildIdentity } from './store-status-types.ts';

type StoreBuildInput = StoreBuildIdentity & { action?: string };

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_PUBLISHER_URL =
  'https://androidpublisher.googleapis.com/androidpublisher/v3';
const PUBLISHER_SCOPE = 'https://www.googleapis.com/auth/androidpublisher';

interface GoogleServiceAccount {
  client_email: string;
  private_key: string;
}

interface GoogleConfig {
  packageName: string;
  serviceAccountJson: string;
}

interface ReleaseSummary {
  activeArtifacts?: Array<{ versionCode?: number | string }>;
  releaseLifecycleState?: string;
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

async function createGoogleAssertion(
  account: GoogleServiceAccount,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = toBase64Url(
    new TextEncoder().encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })),
  );
  const payload = toBase64Url(
    new TextEncoder().encode(
      JSON.stringify({
        iss: account.client_email,
        scope: PUBLISHER_SCOPE,
        aud: GOOGLE_TOKEN_URL,
        iat: now,
        exp: now + 15 * 60,
      }),
    ),
  );
  const signingInput = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    fromPem(account.private_key),
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${toBase64Url(new Uint8Array(signature))}`;
}

function parseServiceAccount(value: string): GoogleServiceAccount {
  try {
    const account = JSON.parse(value) as Partial<GoogleServiceAccount>;
    if (
      typeof account.client_email !== 'string' ||
      typeof account.private_key !== 'string'
    ) {
      throw new Error('Invalid account.');
    }
    return {
      client_email: account.client_email,
      private_key: account.private_key,
    };
  } catch {
    throw new ProviderError();
  }
}

async function getGoogleAccessToken(
  fetcher: FetchLike,
  account: GoogleServiceAccount,
): Promise<string> {
  const assertion = await createGoogleAssertion(account);
  const response = await fetcher(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!response.ok) throw new ProviderError();
  const body = (await response.json()) as { access_token?: unknown };
  if (typeof body.access_token !== 'string') throw new ProviderError();
  return body.access_token;
}

export function toGoogleStatus(state: string): StoreStatus {
  if (state === 'RELEASE_LIFECYCLE_STATE_PUBLISHED') return 'live';
  if (state === 'RELEASE_LIFECYCLE_STATE_APPROVED_NOT_PUBLISHED')
    return 'approved_not_live';
  if (state === 'RELEASE_LIFECYCLE_STATE_NOT_APPROVED') return 'rejected';
  return 'pending';
}

export async function getGooglePlayStatus(
  input: StoreBuildInput,
  config: GoogleConfig,
  fetcher: FetchLike,
): Promise<{ status: StoreStatus; providerState: string | null }> {
  try {
    const token = await getGoogleAccessToken(
      fetcher,
      parseServiceAccount(config.serviceAccountJson),
    );
    const path = `/applications/${encodeURIComponent(config.packageName)}/tracks/production/releases`;
    const response = await fetcher(`${GOOGLE_PUBLISHER_URL}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new ProviderError();
    const body = (await response.json()) as { releases?: ReleaseSummary[] };
    const release = body.releases?.find((candidate) =>
      candidate.activeArtifacts?.some(
        (artifact) => String(artifact.versionCode) === input.buildNumber,
      ),
    );
    if (!release) return { status: 'not_found', providerState: null };
    const state = release.releaseLifecycleState;
    if (typeof state !== 'string')
      return { status: 'pending', providerState: null };
    return { status: toGoogleStatus(state), providerState: state };
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw new ProviderError();
  }
}
