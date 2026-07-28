# AGENTS.md

## Mission

This repository owns Tether's release-workflow Supabase Edge Function. Keep it
small, predictable, and safe to operate; it must not become a copy of the app
repository or a home for unrelated release tooling.

## Platform + Stack

- Supabase Edge Functions
- TypeScript running on Deno
- Supabase CLI

## Always-On Engineering Rules

1. Keep files small and focused.
   - Prefer files under 300 lines.
   - If a file grows past 300 lines, split by concern unless there is a strong
     reason not to.
   - If a file approaches 500 lines, refactor before adding substantial logic.

2. Split by concern, not by guesswork.
   - `supabase/functions/<function>/index.ts`: request composition only.
   - `supabase/functions/<function>/`: validation, auth, release-provider, and
     response helpers in focused modules.
   - Keep shared Edge Function helpers in `supabase/functions/_shared/`.

3. Type safety and explicitness.
   - Prefer explicit types for request payloads, provider responses, and
     function boundaries.
   - Avoid `any`; use narrow types, schemas, and guards.

4. Avoid unnecessary dependencies.
   - Prefer Deno and Web platform APIs before adding a package.
   - If adding a dependency, provide a short rationale in the final summary.

5. Secrets and privileged access.
   - Never commit credentials or log request authorization, environment values,
     or secret-bearing provider responses.
   - Read secrets from Supabase Edge Function environment variables.
   - Use service-role access only where necessary, and validate authorization
     before any privileged operation.

6. Release operations must be safe to retry.
   - Validate all request input before side effects.
   - Use explicit allow-lists for platforms, channels, and release actions.
   - Make external side effects idempotent when the provider supports it; return
     actionable errors when an operation cannot safely be retried.

7. HTTP behavior is deliberate.
   - Return consistent JSON success and error shapes with appropriate status
     codes.
   - Handle CORS and `OPTIONS` deliberately if browser clients are supported.
   - Do not expose internal errors or provider responses to callers.

## Structural Enforcement (Hard Rules)

1. File-size stoplights.
   - `<= 220` lines: safe zone.
   - `221-280` lines: add code only if concern boundaries stay clear.
   - `> 280` lines: warn the user.
   - `> 350` lines: strongly warn the user.

2. No mixed-concern entrypoints.
   - Entrypoints may parse a request, coordinate helpers, and produce a
     response.
   - Entrypoints must not embed provider-specific workflows, complex validation,
     or persistence logic.

3. Refactor in the same change.
   - If a touched file crosses a stoplight threshold, include the concern split
     in the same task.

4. Duplicate-logic rule.
   - If similar domain logic appears twice, extract shared helper(s) before a
     third use.

5. Naming conventions.
   - Pure helpers: `buildX`, `getX`, `isX`, `parseX`, `toX`.
   - Request handlers: `handleX`.
   - Avoid vague names such as `helpers`, `misc`, `temp`, or `data2`.

## Definition of Done

Before considering work complete, verify:

1. Changed functions pass `npm run lint` and `npm run format:check`.
2. Request input, authorization, and errors are handled deliberately.
3. No secrets, private data, or unsafe release controls were introduced.
4. New or changed files follow the size and separation rules.
5. The Supabase project link remains pointed at this repository's intended
   project.
