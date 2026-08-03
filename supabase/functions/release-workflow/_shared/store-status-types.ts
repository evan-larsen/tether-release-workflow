import type { Platform } from './types.ts';

export interface StoreBuildIdentity {
  platform: Platform;
  appVersion: string;
  buildNumber: string;
}

export interface StoreStatusRequest extends StoreBuildIdentity {
  action: 'get_store_build_status';
}
