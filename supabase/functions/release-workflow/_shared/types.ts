export const PLATFORM_VALUES = ['ios', 'android'] as const;
export const STORE_STATUS_VALUES = [
  'live',
  'approved_not_live',
  'pending',
  'rejected',
  'not_found',
  'unknown',
] as const;
export type {
  PreviewBuildAttempt,
  PreviewRecord,
  PreviewStagingBaseOperation,
  PreviewStagingOtaOperation,
} from './preview-types.ts';
export type { StoreStatusRequest } from './store-status-types.ts';
import type { PreviewBuildAttempt, PreviewRecord } from './preview-types.ts';
import type { StoreStatusRequest } from './store-status-types.ts';

export type Platform = (typeof PLATFORM_VALUES)[number];
export type StoreStatus = (typeof STORE_STATUS_VALUES)[number];

export type BuildStatus = 'requested' | 'succeeded' | 'failed';
export type ReleaseStatus =
  'in_progress' | 'superseded' | 'complete' | 'adopted';

export interface RevoPushRecord {
  label: string;
  packageHash: string;
}

export interface StagingOtaIntent {
  status: 'intent' | 'retryable' | 'unknown';
  platform: Platform;
  deployment: 'staging';
  sourceReleaseId: string;
  preparationId: string;
  treeHash: string;
  gitCommit: string;
  targetRange: string;
  description: string;
}

export interface StagingOtaFact extends RevoPushRecord {
  releaseMethod: 'Upload';
  targetRange: string;
  description: string;
  status: 'published' | 'approved';
}

export interface ProductionOtaRecord {
  status: 'intent' | 'retryable' | 'unknown' | 'promoted';
  platform: Platform;
  deployment: string;
  sourceReleaseId: string;
  preparationId: string;
  treeHash: string;
  gitCommit: string;
  targetRange: string;
  stagingLabel: string;
  stagingPackageHash: string;
  label: string | null;
  packageHash: string | null;
  releaseMethod: 'Promote' | null;
  originalLabel: string | null;
}

export interface BaseRegistration {
  deployment: 'staging' | 'production';
  status: 'intent' | 'retryable' | 'unknown';
  easBuildId: string;
  appVersion: string;
  buildNumber: string;
}

export interface StoreBase {
  status: 'pending' | 'eligible' | 'registered';
  staging: RevoPushRecord | null;
  production: RevoPushRecord | null;
  registration?: BaseRegistration;
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
  sourcePreparationId?: string;
  submissions: Array<{
    id: string;
    status: 'pending' | 'submitted' | 'failed' | 'unknown';
  }>;
  storeStatus: {
    status: StoreStatus;
    providerState: string | null;
    checkedAt: string;
  } | null;
  base: StoreBase | null;
}

export interface PlatformPreparation {
  preparationId: string;
  platform: Platform;
  treeHash: string;
  preparedCommit: string;
  preparedAt: string;
  status: 'prepared' | 'superseded';
  preview?: {
    attempts: PreviewBuildAttempt[];
    stagingBase: {
      status:
        'clear_intent' | 'clearing' | 'cleared' | 'unknown' | 'registered';
      easBuildId: string;
      label: string | null;
      packageHash: string | null;
    } | null;
  };
}

export type ProductionProvisioningStatus =
  'intent' | 'retryable' | 'unknown' | 'deployment_ready' | 'eas_configured';

export interface ProductionEasVariableMetadata {
  id: string;
  name: string;
  environment: 'production';
  scope: 'project';
  visibility: 'sensitive';
  type: 'string';
  updatedAt: string;
}

export interface ProductionProvisioningPlatform {
  status: ProductionProvisioningStatus;
  app: 'Tether-iOS' | 'Tether-Android';
  deployment: string;
  easVariableName: string;
  environment: 'production';
  scope: 'project';
  visibility: 'sensitive';
  type: 'string';
  easVariable?: ProductionEasVariableMetadata;
}

export interface ProductionProvisioning {
  candidateId: string;
  preparationId: string;
  treeHash: string;
  preparedCommit: string;
  native: string;
  platforms: Record<Platform, ProductionProvisioningPlatform>;
}

export interface ReleasePlatform {
  attempts: ProductionAttempt[];
  ota: {
    staging: StagingOtaIntent | StagingOtaFact | null;
    production: ProductionOtaRecord | null;
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
  platformPreparations?: PlatformPreparation[];
  productionProvisioning?: ProductionProvisioning;
  releaseType: 'store';
}

export interface OtaReleaseRecord extends ReleaseRecordBase {
  sourceReleaseId: string;
  preparationId: string;
  treeHash: string;
  gitCommit: string;
  targetRange: string;
  releaseType: 'ota';
}

export interface AdoptedBaselineArtifact {
  easBuildId: string;
  appVersion: string;
  buildNumber: string;
  profile: 'production';
  status: 'succeeded';
  sourceCommit: string;
  sourceTreeHash: string;
  storeStatus: {
    status: StoreStatus;
    providerState: string | null;
    checkedAt: string;
  };
  base: StoreBase;
}

export interface AdoptedBaselineRecord {
  id: string;
  version: string;
  native: 'native-1';
  nativeFloorVersion: string;
  source: { commit: string; treeHash: string };
  createdAt: string;
  releaseType: 'adopted_baseline';
  status: 'adopted';
  artifacts: Record<Platform, AdoptedBaselineArtifact>;
}

export type ReleaseRecord =
  StoreReleaseRecord | OtaReleaseRecord | AdoptedBaselineRecord;

export type StagingResetStatus =
  'pending' | 'clearing' | 'cleared_and_verified';

export interface ReleaseState {
  stateVersion: 2;
  currentNative: string | null;
  stagingLane: {
    activeNative: string | null;
    resetTargetNative: string | null;
    resetProgress?: Record<Platform, StagingResetStatus>;
  };
  releases: ReleaseRecord[];
  rollbacks?: RollbackRecord[];
}
export interface RollbackRecord {
  id: string;
  native: string;
  targetRange: string;
  createdAt: string;
  status: 'in_progress' | 'complete';
  platforms: Record<
    Platform,
    {
      status: 'intent' | 'retryable' | 'unknown' | 'rolled_back';
      platform: Platform;
      deployment: string;
      originalLabel: string;
      originalPackageHash: string;
      targetRange: string;
      label: string | null;
      packageHash: string | null;
      releaseMethod: 'Rollback' | null;
      originalLabelResult: string | null;
    }
  >;
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
