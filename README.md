# Tether release workflow

This repository owns the `release-workflow` Supabase Edge Function for the
Tether release process. Its first slice is deliberately small: it is a
server-to-server, read-only checker for one exact Apple or Google store build.
It does not create release state, run EAS, perform RevoPush actions, create Git
tags, or mutate either store.

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
