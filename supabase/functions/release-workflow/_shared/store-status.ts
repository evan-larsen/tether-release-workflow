import { getAppleStoreStatus } from './apple.ts';
import { ProviderError } from './errors.ts';
import { getGooglePlayStatus } from './google.ts';
import type {
  RuntimeDependencies,
  StoreStatusRequest,
  StoreStatusResult,
} from './types.ts';

function buildUnknownResult(input: StoreStatusRequest): StoreStatusResult {
  return {
    httpStatus: 502,
    body: {
      platform: input.platform,
      appVersion: input.appVersion,
      buildNumber: input.buildNumber,
      status: 'unknown',
      providerState: null,
      checkedAt: new Date().toISOString(),
    },
  };
}

export async function getStoreBuildStatus(
  input: StoreStatusRequest,
  dependencies: RuntimeDependencies,
): Promise<StoreStatusResult> {
  try {
    const providerResult =
      input.platform === 'ios'
        ? await getAppleStoreStatus(
            input,
            {
              bundleId: requireSecret(dependencies.secrets.iosBundleId),
              privateKey: requireSecret(dependencies.secrets.applePrivateKey),
              keyId: requireSecret(dependencies.secrets.appleKeyId),
              issuerId: requireSecret(dependencies.secrets.appleIssuerId),
            },
            dependencies.fetch,
          )
        : await getGooglePlayStatus(
            input,
            {
              packageName: requireSecret(
                dependencies.secrets.googlePackageName,
              ),
              serviceAccountJson: requireSecret(
                dependencies.secrets.googleServiceAccountJson,
              ),
            },
            dependencies.fetch,
          );
    return {
      httpStatus: 200,
      body: {
        platform: input.platform,
        appVersion: input.appVersion,
        buildNumber: input.buildNumber,
        ...providerResult,
        checkedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    if (error instanceof ProviderError) return buildUnknownResult(input);
    return buildUnknownResult(input);
  }
}

function requireSecret(value?: string): string {
  if (!value) throw new ProviderError();
  return value;
}
