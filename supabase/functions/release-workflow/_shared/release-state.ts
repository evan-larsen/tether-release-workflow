import {
  ReleaseStateError,
  RequestError,
  RevisionConflictError,
} from './errors.ts';
import { validateReleaseStateUpdate } from './state-update-validation.ts';
import type {
  ReleaseState,
  ReleaseStateRecord,
  ReleaseStateRepository,
} from './types.ts';

interface DatabaseRow {
  revision?: unknown;
  state?: unknown;
  updated_at?: unknown;
}

interface ReleaseStateClientConfig {
  fetch: typeof fetch;
  supabaseUrl?: string;
  serviceRoleKey?: string;
}

function requireConfig(value?: string): string {
  if (!value) throw new ReleaseStateError();
  return value;
}

function toRecord(row: DatabaseRow): ReleaseStateRecord {
  if (
    !Number.isSafeInteger(row.revision) ||
    !row.state ||
    typeof row.state !== 'object' ||
    Array.isArray(row.state) ||
    typeof row.updated_at !== 'string'
  ) {
    throw new ReleaseStateError();
  }

  return {
    revision: row.revision as number,
    state: row.state as ReleaseState,
    updatedAt: row.updated_at,
  };
}

export function createReleaseStateRepository(
  config: ReleaseStateClientConfig,
): ReleaseStateRepository {
  const baseUrl = requireConfig(config.supabaseUrl).replace(/\/$/, '');
  const serviceRoleKey = requireConfig(config.serviceRoleKey);
  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
  };

  return {
    async getState(): Promise<ReleaseStateRecord> {
      const response = await config.fetch(
        `${baseUrl}/rest/v1/release_workflow_state?id=eq.tether&select=revision,state,updated_at`,
        { headers },
      );
      if (!response.ok) throw new ReleaseStateError();
      const rows = (await response.json()) as DatabaseRow[];
      if (!Array.isArray(rows) || rows.length !== 1)
        throw new ReleaseStateError();
      return toRecord(rows[0]);
    },

    async compareAndSwap(
      expectedRevision: number,
      state: ReleaseState,
    ): Promise<ReleaseStateRecord | null> {
      const response = await config.fetch(
        `${baseUrl}/rest/v1/rpc/update_release_workflow_state`,
        {
          method: 'POST',
          headers: { ...headers, Prefer: 'return=representation' },
          body: JSON.stringify({
            p_expected_revision: expectedRevision,
            p_state: state,
          }),
        },
      );
      if (!response.ok) throw new ReleaseStateError();
      const rows = (await response.json()) as DatabaseRow[];
      if (!Array.isArray(rows)) throw new ReleaseStateError();
      if (rows.length === 0) return null;
      if (rows.length !== 1) throw new ReleaseStateError();
      return toRecord(rows[0]);
    },
  };
}

export async function updateReleaseState(
  repository: ReleaseStateRepository,
  expectedRevision: number,
  state: ReleaseState,
): Promise<ReleaseStateRecord> {
  const previous = await repository.getState();
  if (previous.revision !== expectedRevision) throw new RevisionConflictError();
  if (!validateReleaseStateUpdate(previous.state, state))
    throw new RequestError('Release state update is invalid.');
  const record = await repository.compareAndSwap(expectedRevision, state);
  if (!record) throw new RevisionConflictError();
  return record;
}
