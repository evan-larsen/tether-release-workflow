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

It contains one seeded `tether` row at revision `0` with the exact known empty
v1 state:

```json
{
  "stateVersion": 1,
  "currentNative": null,
  "releases": []
}
```

The seed remains v1 so the already-created empty remote row can be migrated
explicitly. The app repository provides a separately invoked command:

```sh
npm run release-state:migrate-v2 -- --dry-run
npm run release-state:migrate-v2 -- --confirm-empty-v1-to-v2
```

Only the exact state shown above is accepted by its pure migration helper.
Non-empty or unexpected v1 state fails closed. Migration is never part of a
normal release command, and no broad automatic migration exists.

The table has RLS enabled, has no `anon` or `authenticated` policies, and those
roles have no table or RPC privileges. The Edge Function reaches it only with
the Supabase server-side service-role key. A follow-up migration removes the
unused database `schema_version` column and its RPC result field, leaving JSON
`state.stateVersion` as the single schema authority. Apply migrations only
after checks pass and after confirming the linked project:

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
    "stateVersion": 2,
    "currentNative": null,
    "stagingLane": {
      "activeNative": null,
      "resetTargetNative": null
    },
    "releases": []
  },
  "updatedAt": "2026-07-28T00:00:00.000Z"
}
```

`update_release_state` validates both the complete v2 state shape and its legal
transition from the previously saved state before performing an atomic database
compare-and-swap:

```json
{
  "action": "update_release_state",
  "expectedRevision": 0,
  "state": {
    "stateVersion": 2,
    "currentNative": null,
    "stagingLane": {
      "activeNative": null,
      "resetTargetNative": null
    },
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

The previous-state check accepts only a narrow lifecycle delta (or the
documented atomic candidate supersession). It rejects direct
`currentNative` changes, fabricated completion, skipped artifact steps, and
unrelated multi-record replacements even when the proposed JSON is
structurally valid. `currentNative` can advance only on the exact final
Production-base registration that completes an approved, source-attached,
next-generation candidate.

Successful `release:prepare` registration is also a narrow transition. It may
append one empty `in_progress` store release with exact non-secret preparation
provenance and `productionCommit: null`, or atomically supersede one unfinished,
non-public record with the same marketing version/native generation and a
different tree. Exact-tree retries reuse the existing stable release ID without
a write. Preparation cannot add build/base/public facts, duplicate a release
ID, or move `currentNative`.

The v2 state can represent exact source-tree provenance, native-floor semantics,
Preview build/base/OTA/smoke facts, and durable shared-Staging reset intent. It
never stores deployment keys, credentials, tokens, URLs, or mutable key copies.
This phase provides validation and pure app-side transitions only: it does not
invoke EAS or RevoPush, reset Staging, contact a store, create a release row,
deploy this function, or enforce the Preview gate in `production:release`.

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
