import { assertEquals } from '@std/assert';
import { getReleaseUpdateKind } from '../_shared/production-update-validation.ts';
import type { OtaReleaseRecord } from '../_shared/types.ts';

const sha = 'a'.repeat(40);
const release = (): OtaReleaseRecord => ({
  id: 'ota-source',
  version: '1.8.0',
  native: 'native-1',
  createdAt: '2026-07-31T00:00:00.000Z',
  releaseType: 'ota',
  status: 'in_progress',
  sourceReleaseId: 'source',
  preparationId: 'preparation',
  treeHash: sha,
  gitCommit: 'b'.repeat(40),
  targetRange: '>=1.8.0',
  platforms: {
    ios: { attempts: [], ota: { staging: null, production: null } },
    android: { attempts: [], ota: { staging: null, production: null } },
  },
});

const intent = (description = `tether-staging-ota:ota-source:ios:${sha}`) => ({
  status: 'intent' as const,
  platform: 'ios' as const,
  deployment: 'staging' as const,
  sourceReleaseId: 'source',
  preparationId: 'preparation',
  treeHash: sha,
  gitCommit: 'b'.repeat(40),
  targetRange: '>=1.8.0',
  description,
});

Deno.test('Edge rejects forged Staging OTA intent identity', () => {
  const before = release();
  const after = structuredClone(before);
  after.platforms.ios.ota!.staging = intent('attacker-controlled');
  assertEquals(getReleaseUpdateKind(before, after), null);
});

Deno.test('Edge rejects Staging OTA fact that differs from its intent', () => {
  const before = release();
  before.platforms.ios.ota!.staging = intent();
  const after = structuredClone(before);
  after.platforms.ios.ota!.staging = {
    status: 'published',
    label: 'v7',
    packageHash: 'hash',
    releaseMethod: 'Upload',
    targetRange: '>=1.9.0',
    description: intent().description,
  };
  assertEquals(getReleaseUpdateKind(before, after), null);
});
