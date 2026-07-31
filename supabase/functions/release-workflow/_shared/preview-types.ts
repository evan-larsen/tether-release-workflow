import type { Platform } from './types.ts';

export interface PreviewBuildAttempt {
  easBuildId: string;
  appVersion: string;
  buildNumber: string;
  profile: string;
  status: 'requested' | 'succeeded' | 'failed';
}
export interface PreviewStagingBaseOperation {
  status: 'intent' | 'retryable' | 'unknown' | 'registered';
  platform: Platform;
  deployment: 'staging';
  candidateId: string;
  preparationId: string;
  treeHash: string;
  preparedCommit: string;
  native: string;
  nativeFloorVersion: string;
  easBuildId: string;
  appVersion: string;
  buildNumber: string;
  label: string | null;
  packageHash: string | null;
  releaseMethod: 'Upload' | null;
}
export interface PreviewStagingOtaOperation {
  status: 'intent' | 'retryable' | 'unknown' | 'published';
  platform: Platform;
  deployment: 'staging';
  candidateId: string;
  preparationId: string;
  treeHash: string;
  preparedCommit: string;
  native: string;
  nativeFloorVersion: string;
  targetRange: string;
  baseEasBuildId: string;
  baseLabel: string;
  basePackageHash: string;
  description: string;
  label: string | null;
  packageHash: string | null;
  releaseMethod: 'Upload' | null;
}
export interface LegacyPreviewBase {
  easBuildId: string;
  label: string;
  packageHash: string;
  status?: never;
  releaseMethod?: never;
}
export interface LegacyPreviewOta {
  baseEasBuildId: string;
  label: string;
  packageHash: string;
  status?: never;
  releaseMethod?: never;
}
export interface PreviewPlatform {
  attempts: PreviewBuildAttempt[];
  stagingBase: LegacyPreviewBase | PreviewStagingBaseOperation | null;
  stagingOta: LegacyPreviewOta | PreviewStagingOtaOperation | null;
}
export interface PreviewRecord {
  status: 'required' | 'building' | 'smoke_pending' | 'approved';
  platforms: Record<Platform, PreviewPlatform>;
  smokeApprovedAt: string | null;
}
