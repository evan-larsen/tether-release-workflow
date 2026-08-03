import { RequestError } from './errors.ts';
import { isReleaseState } from './state-validation.ts';
import type {
  GetReleaseStateRequest,
  Platform,
  ReleaseState,
  ReleaseWorkflowRequest,
  StoreReviewFactsRequest,
  StoreStatusRequest,
  UpdateReleaseStateRequest,
} from './types.ts';

const APP_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const ANDROID_BUILD_NUMBER_PATTERN = /^\d+$/;
const IOS_BUILD_NUMBER_PATTERN = /^\d+(?:\.\d+){0,2}$/;
const STORE_STATUS_KEYS = ['action', 'platform', 'appVersion', 'buildNumber'];
const GET_RELEASE_STATE_KEYS = ['action'];
const UPDATE_RELEASE_STATE_KEYS = ['action', 'expectedRevision', 'state'];

function isPlatform(value: unknown): value is Platform {
  return value === 'ios' || value === 'android';
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  expectedKeys: string[],
): boolean {
  const keys = Object.keys(value);
  return (
    keys.length === expectedKeys.length &&
    keys.every((key) => expectedKeys.includes(key))
  );
}

function requirePayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new RequestError('Request body must be an object.');
  }
  return value as Record<string, unknown>;
}

function parseStoreStatusPayload(
  payload: Record<string, unknown>,
): StoreStatusRequest {
  if (!hasOnlyKeys(payload, STORE_STATUS_KEYS))
    throw new RequestError('Store status request is invalid.');
  if (
    !isPlatform(payload.platform) ||
    typeof payload.appVersion !== 'string' ||
    typeof payload.buildNumber !== 'string'
  ) {
    throw new RequestError('Request fields are invalid.');
  }
  if (!APP_VERSION_PATTERN.test(payload.appVersion))
    throw new RequestError('App version is invalid.');
  const buildPattern =
    payload.platform === 'android'
      ? ANDROID_BUILD_NUMBER_PATTERN
      : IOS_BUILD_NUMBER_PATTERN;
  if (!buildPattern.test(payload.buildNumber))
    throw new RequestError('Build number is invalid.');
  return {
    action: 'get_store_build_status',
    platform: payload.platform,
    appVersion: payload.appVersion,
    buildNumber: payload.buildNumber,
  };
}

function parseStoreReviewFactsPayload(
  payload: Record<string, unknown>,
): StoreReviewFactsRequest {
  const parsed = parseStoreStatusPayload({
    ...payload,
    action: 'get_store_build_status',
  });
  if (payload.action !== 'get_store_build_review_facts')
    throw new RequestError('Store review facts request is invalid.');
  return { ...parsed, action: 'get_store_build_review_facts' };
}

function parseReleaseState(value: unknown): ReleaseState {
  if (!isReleaseState(value))
    throw new RequestError('Release state is invalid.');
  return value;
}

function parseGetReleaseStatePayload(
  payload: Record<string, unknown>,
): GetReleaseStateRequest {
  if (!hasOnlyKeys(payload, GET_RELEASE_STATE_KEYS))
    throw new RequestError('Get release state request is invalid.');
  return { action: 'get_release_state' };
}

function parseUpdateReleaseStatePayload(
  payload: Record<string, unknown>,
): UpdateReleaseStateRequest {
  if (
    !hasOnlyKeys(payload, UPDATE_RELEASE_STATE_KEYS) ||
    !Number.isSafeInteger(payload.expectedRevision) ||
    (payload.expectedRevision as number) < 0
  ) {
    throw new RequestError('Update release state request is invalid.');
  }
  return {
    action: 'update_release_state',
    expectedRevision: payload.expectedRevision as number,
    state: parseReleaseState(payload.state),
  };
}

export function parseReleaseWorkflowPayload(
  value: unknown,
): ReleaseWorkflowRequest {
  const payload = requirePayload(value);
  if (payload.action === 'get_store_build_status')
    return parseStoreStatusPayload(payload);
  if (payload.action === 'get_store_build_review_facts')
    return parseStoreReviewFactsPayload(payload);
  if (payload.action === 'get_release_state')
    return parseGetReleaseStatePayload(payload);
  if (payload.action === 'update_release_state')
    return parseUpdateReleaseStatePayload(payload);
  throw new RequestError('Unsupported request action.');
}

export async function parseReleaseWorkflowRequest(
  req: Request,
): Promise<ReleaseWorkflowRequest> {
  try {
    return parseReleaseWorkflowPayload(await req.json());
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError('Request body must be valid JSON.');
  }
}
