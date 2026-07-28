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

export interface ReleaseState {
  stateVersion: 1;
  currentNative: string | null;
  releases: unknown[];
  [key: string]: unknown;
}

export interface GetReleaseStateRequest {
  action: 'get_release_state';
}

export interface UpdateReleaseStateRequest {
  action: 'update_release_state';
  expectedRevision: number;
  state: ReleaseState;
}

export type ReleaseWorkflowRequest =
  StoreStatusRequest | GetReleaseStateRequest | UpdateReleaseStateRequest;

export interface ReleaseStateRecord {
  revision: number;
  state: ReleaseState;
  updatedAt: string;
}

export interface ReleaseStateRepository {
  getState(): Promise<ReleaseStateRecord>;
  compareAndSwap(
    expectedRevision: number,
    state: ReleaseState,
  ): Promise<ReleaseStateRecord | null>;
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
  supabaseUrl?: string;
  supabaseServiceRoleKey?: string;
}

export type FetchLike = typeof fetch;

export interface RuntimeDependencies {
  fetch: FetchLike;
  secrets: ReleaseWorkflowSecrets;
  releaseState: ReleaseStateRepository;
}

export interface StoreStatusResult {
  body: StoreStatusResponse;
  httpStatus: number;
}
