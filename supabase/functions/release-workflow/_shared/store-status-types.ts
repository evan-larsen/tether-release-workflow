import type { Platform } from './types.ts';

export interface StoreStatusRequest {
  action: 'get_store_build_status';
  platform: Platform;
  appVersion: string;
  buildNumber: string;
}
