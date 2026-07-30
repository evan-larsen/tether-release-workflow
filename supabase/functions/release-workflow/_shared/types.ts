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

export type BuildStatus = 'requested' | 'succeeded' | 'failed';
export type ReleaseStatus = 'in_progress' | 'superseded' | 'complete';

export interface RevoPushRecord {
  label: string;
  packageHash: string;
}

export interface PreviewBuildAttempt {
  easBuildId: string;
  appVersion: string;
  buildNumber: string;
  profile: string;
  status: BuildStatus;
}

export interface PreviewPlatform {
  attempts: PreviewBuildAttempt[];
  stagingBase: (RevoPushRecord & { easBuildId: string }) | null;
  stagingOta: (RevoPushRecord & { baseEasBuildId: string }) | null;
}

export interface PreviewRecord {
  status: 'required' | 'building' | 'smoke_pending' | 'approved';
  platforms: Record<Platform, PreviewPlatform>;
  smokeApprovedAt: string | null;
}

export interface ReleasePreparation {
  preparationId: string;
  treeHash: string;
  preparedCommit: string;
  marketingVersion: string;
  nativeGeneration: string;
  preparedAt: string;
  status: 'prepared';
}

export interface ProductionAttempt extends PreviewBuildAttempt {
  submissions: Array<{
    id: string;
    status: 'pending' | 'submitted' | 'failed' | 'unknown';
  }>;
  storeStatus: {
    status: StoreStatus;
    providerState: string | null;
    checkedAt: string;
  } | null;
  base: {
    status: 'pending' | 'eligible' | 'registered';
    staging: RevoPushRecord | null;
    production: RevoPushRecord | null;
  } | null;
}

export interface ReleasePlatform {
  attempts: ProductionAttempt[];
  ota: {
    staging: (RevoPushRecord & { status: 'published' | 'approved' }) | null;
    production: RevoPushRecord | null;
  } | null;
}

interface ReleaseRecordBase {
  id: string;
  version: string;
  native: string;
  createdAt: string;
  status: ReleaseStatus;
  platforms: Record<Platform, ReleasePlatform>;
}

export interface StoreReleaseRecord extends ReleaseRecordBase {
  preparation: ReleasePreparation;
  productionCommit: string | null;
  nativeFloorVersion: string | null;
  preview: PreviewRecord | null;
  releaseType: 'store';
}

export interface OtaReleaseRecord extends ReleaseRecordBase {
  gitCommit: string;
  releaseType: 'ota';
}

export type ReleaseRecord = StoreReleaseRecord | OtaReleaseRecord;

export interface ReleaseState {
  stateVersion: 2;
  currentNative: string | null;
  stagingLane: {
    activeNative: string | null;
    resetTargetNative: string | null;
  };
  releases: ReleaseRecord[];
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
  state: unknown;
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
