import { RequestError } from './errors.ts';
import type { Platform, StoreStatusRequest } from './types.ts';

const APP_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const ANDROID_BUILD_NUMBER_PATTERN = /^\d+$/;
const IOS_BUILD_NUMBER_PATTERN = /^\d+(?:\.\d+){0,2}$/;
const REQUEST_KEYS = ['action', 'platform', 'appVersion', 'buildNumber'];

function isPlatform(value: unknown): value is Platform {
  return value === 'ios' || value === 'android';
}

function hasOnlyRequestKeys(value: Record<string, unknown>): boolean {
  const keys = Object.keys(value);
  return (
    keys.length === REQUEST_KEYS.length &&
    keys.every((key) => REQUEST_KEYS.includes(key))
  );
}

export function parseStoreStatusPayload(value: unknown): StoreStatusRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new RequestError('Request body must be an object.');
  }

  const payload = value as Record<string, unknown>;
  if (
    !hasOnlyRequestKeys(payload) ||
    payload.action !== 'get_store_build_status'
  ) {
    throw new RequestError('Unsupported request action.');
  }
  if (
    !isPlatform(payload.platform) ||
    typeof payload.appVersion !== 'string' ||
    typeof payload.buildNumber !== 'string'
  ) {
    throw new RequestError('Request fields are invalid.');
  }
  if (!APP_VERSION_PATTERN.test(payload.appVersion)) {
    throw new RequestError('App version is invalid.');
  }

  const buildPattern =
    payload.platform === 'android'
      ? ANDROID_BUILD_NUMBER_PATTERN
      : IOS_BUILD_NUMBER_PATTERN;
  if (!buildPattern.test(payload.buildNumber)) {
    throw new RequestError('Build number is invalid.');
  }

  return {
    action: payload.action,
    platform: payload.platform,
    appVersion: payload.appVersion,
    buildNumber: payload.buildNumber,
  };
}

export async function parseStoreStatusRequest(
  req: Request,
): Promise<StoreStatusRequest> {
  try {
    return parseStoreStatusPayload(await req.json());
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError('Request body must be valid JSON.');
  }
}
