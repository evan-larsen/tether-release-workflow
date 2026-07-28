import { isAuthorized } from './_shared/auth.ts';
import { toErrorResponse } from './_shared/errors.ts';
import { parseStoreStatusRequest } from './_shared/request.ts';
import { getStoreBuildStatus } from './_shared/store-status.ts';
import type { RuntimeDependencies } from './_shared/types.ts';

function getRuntimeDependencies(): RuntimeDependencies {
  return {
    fetch: globalThis.fetch,
    secrets: {
      googleServiceAccountJson: Deno.env.get(
        'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON',
      ),
      applePrivateKey: Deno.env.get('APP_STORE_CONNECT_PRIVATE_KEY'),
      appleKeyId: Deno.env.get('APP_STORE_CONNECT_KEY_ID'),
      appleIssuerId: Deno.env.get('APP_STORE_CONNECT_ISSUER_ID'),
      googlePackageName: Deno.env.get('GOOGLE_PLAY_PACKAGE_NAME'),
      iosBundleId: Deno.env.get('IOS_BUNDLE_ID'),
      workflowToken: Deno.env.get('RELEASE_WORKFLOW_TOKEN'),
    },
  };
}

export function createReleaseWorkflowHandler(
  dependencies: RuntimeDependencies = getRuntimeDependencies(),
) {
  return async function handleReleaseWorkflowRequest(
    req: Request,
  ): Promise<Response> {
    if (req.method !== 'POST') {
      return Response.json(
        { error: { code: 'method_not_allowed' } },
        {
          status: 405,
          headers: { Allow: 'POST' },
        },
      );
    }

    if (
      !isAuthorized(
        req.headers.get('x-release-workflow-token'),
        dependencies.secrets.workflowToken,
      )
    ) {
      return Response.json(
        { error: { code: 'unauthorized' } },
        { status: 401 },
      );
    }

    try {
      const input = await parseStoreStatusRequest(req);
      const result = await getStoreBuildStatus(input, dependencies);
      return Response.json(result.body, { status: result.httpStatus });
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}

if (import.meta.main) Deno.serve(createReleaseWorkflowHandler());
