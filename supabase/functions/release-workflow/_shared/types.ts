export const PLATFORM_VALUES = ['ios', 'android'] as const;
export const STORE_STATUS_VALUES = [
  'live',
  'approved_not_live',
  'pending',
  'rejected',
  'not_found',
  'unknown',
] as const;

export type Platform = (typeof PLATFORM_VALUES)[number];
export type StoreStatus = (typeof STORE_STATUS_VALUES)[number];

export interface StoreStatusRequest {
  action: 'get_store_build_status';
  platform: Platform;
  appVersion: string;
  buildNumber: string;
}

export interface StoreStatusResponse {
  platform: Platform;
  appVersion: string;
  buildNumber: string;
  status: StoreStatus;
  providerState: string | null;
  checkedAt: string;
}

export interface ReleaseWorkflowSecrets {
  googleServiceAccountJson?: string;
  applePrivateKey?: string;
  appleKeyId?: string;
  appleIssuerId?: string;
  googlePackageName?: string;
  iosBundleId?: string;
  workflowToken?: string;
}

export type FetchLike = typeof fetch;

export interface RuntimeDependencies {
  fetch: FetchLike;
  secrets: ReleaseWorkflowSecrets;
}

export interface StoreStatusResult {
  body: StoreStatusResponse;
  httpStatus: number;
}
