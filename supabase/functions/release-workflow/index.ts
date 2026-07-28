import { isAuthorized } from './_shared/auth.ts';
import { toErrorResponse } from './_shared/errors.ts';
import { parseReleaseWorkflowRequest } from './_shared/request.ts';
import {
  createReleaseStateRepository,
  updateReleaseState,
} from './_shared/release-state.ts';
import { getStoreBuildStatus } from './_shared/store-status.ts';
import type { RuntimeDependencies } from './_shared/types.ts';

function getRuntimeDependencies(): RuntimeDependencies {
  const secrets = {
    googleServiceAccountJson: Deno.env.get('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON'),
    applePrivateKey: Deno.env.get('APP_STORE_CONNECT_PRIVATE_KEY'),
    appleKeyId: Deno.env.get('APP_STORE_CONNECT_KEY_ID'),
    appleIssuerId: Deno.env.get('APP_STORE_CONNECT_ISSUER_ID'),
    googlePackageName: Deno.env.get('GOOGLE_PLAY_PACKAGE_NAME'),
    iosBundleId: Deno.env.get('IOS_BUNDLE_ID'),
    workflowToken: Deno.env.get('RELEASE_WORKFLOW_TOKEN'),
    supabaseUrl: Deno.env.get('SUPABASE_URL'),
    supabaseServiceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  };
  return {
    fetch: globalThis.fetch,
    secrets,
    releaseState: createReleaseStateRepository({
      fetch: globalThis.fetch,
      supabaseUrl: secrets.supabaseUrl,
      serviceRoleKey: secrets.supabaseServiceRoleKey,
    }),
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
      const input = await parseReleaseWorkflowRequest(req);
      if (input.action === 'get_store_build_status') {
        const result = await getStoreBuildStatus(input, dependencies);
        return Response.json(result.body, { status: result.httpStatus });
      }
      if (input.action === 'get_release_state') {
        return Response.json(await dependencies.releaseState.getState());
      }
      return Response.json(
        await updateReleaseState(
          dependencies.releaseState,
          input.expectedRevision,
          input.state,
        ),
      );
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}

if (import.meta.main) Deno.serve(createReleaseWorkflowHandler());
