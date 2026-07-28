# Tether release workflow

This repository owns the `release-workflow` Supabase Edge Function for the
Tether release process. It provides a server-to-server store-status checker and
a small revision-protected remote release-state boundary. It does not run EAS,
perform RevoPush actions, create Git tags, or mutate either store.

## Security model

The function is configured with `verify_jwt = false` because it is not a
mobile-user endpoint. It instead requires this exact request header:

```text
x-release-workflow-token: <RELEASE_WORKFLOW_TOKEN>
```

The function checks that token with a constant-time comparison. It sends no
CORS headers, so it is not a browser/mobile-app API.

Configure these Edge Function secrets in the **tether-release-control**
Supabase project:

```text
GOOGLE_PLAY_SERVICE_ACCOUNT_JSON
APP_STORE_CONNECT_PRIVATE_KEY
APP_STORE_CONNECT_KEY_ID
APP_STORE_CONNECT_ISSUER_ID
GOOGLE_PLAY_PACKAGE_NAME
IOS_BUNDLE_ID
RELEASE_WORKFLOW_TOKEN
```

No real secrets belong in Git, `.env.example`, source files, logs, or test
fixtures. For local use, create an ignored `.env.local` containing those values.

## Release-state migration

The committed migration creates one table only:

```text
public.release_workflow_state
```

It contains one seeded `tether` row at revision `0` with this state:

```json
{
  "stateVersion": 1,
  "currentNative": null,
  "releases": []
}
```

The table has RLS enabled, has no `anon` or `authenticated` policies, and those
roles have no table or RPC privileges. The Edge Function reaches it only with
the Supabase server-side service-role key. Apply migrations only after checks
pass and after confirming the linked project:

```sh
npm run check
npm run supabase:status
supabase db push
npm run supabase:deploy
```

## Request and response

Only `POST` is accepted. It requires precisely these fields:

```json
{
  "action": "get_store_build_status",
  "platform": "ios",
  "appVersion": "1.8.0",
  "buildNumber": "43"
}
```

The response has this normalized shape:

```json
{
  "platform": "ios",
  "appVersion": "1.8.0",
  "buildNumber": "43",
  "status": "live",
  "providerState": "READY_FOR_DISTRIBUTION",
  "checkedAt": "2026-07-28T00:00:00.000Z"
}
```

Statuses are `live`, `approved_not_live`, `pending`, `rejected`, `not_found`,
or `unknown`. Provider, network, and credential failures return HTTP `502` with
the normalized `unknown` status; no provider failure details are exposed.

## Release-state actions

`get_release_state` returns the one current state row:

```json
{
  "action": "get_release_state"
}
```

```json
{
  "revision": 0,
  "state": {
    "stateVersion": 1,
    "currentNative": null,
    "releases": []
  },
  "updatedAt": "2026-07-28T00:00:00.000Z"
}
```

`update_release_state` validates the minimal state shape before performing an
atomic database compare-and-swap:

```json
{
  "action": "update_release_state",
  "expectedRevision": 0,
  "state": {
    "stateVersion": 1,
    "currentNative": null,
    "releases": []
  }
}
```

On success, the database increments `revision` and sets `updatedAt` server-side.
If another writer changed the row first, the function returns HTTP `409`:

```json
{
  "error": {
    "code": "revision_conflict"
  }
}
```

Release state is not connected to EAS, RevoPush, Git tags, release commands, or
GitHub Actions yet. The initial state intentionally does not reconstruct or
assume current real RevoPush deployment information.

## Local development

Prerequisites: Node.js, Docker Desktop, Deno, and Supabase CLI access to the
linked project.

```sh
npm install
supabase start
npm run supabase:serve
```

Call the local function with a token from your local-only `.env.local`:

```sh
curl --request POST 'http://127.0.0.1:54321/functions/v1/release-workflow' \
  --header 'x-release-workflow-token: replace-with-local-token' \
  --header 'Content-Type: application/json' \
  --data '{"action":"get_store_build_status","platform":"android","appVersion":"1.8.0","buildNumber":"43"}'
```

## Verification and deployment

```sh
npm run check
npm run supabase:status
npm run supabase:deploy
```

Confirm `supabase:status` targets **tether-release-control** before deploying.
