create table public.release_workflow_state (
  id text primary key check (id = 'tether'),
  schema_version integer not null check (schema_version > 0),
  revision bigint not null default 0 check (revision >= 0),
  state jsonb not null check (jsonb_typeof(state) = 'object'),
  updated_at timestamptz not null default now()
);

alter table public.release_workflow_state enable row level security;

revoke all on table public.release_workflow_state from public, anon, authenticated;
grant select, update on table public.release_workflow_state to service_role;

insert into public.release_workflow_state (id, schema_version, revision, state)
values (
  'tether',
  1,
  0,
  '{"stateVersion":1,"currentNative":null,"releases":[]}'::jsonb
);

create function public.update_release_workflow_state(
  p_expected_revision bigint,
  p_state jsonb
)
returns table (
  id text,
  schema_version integer,
  revision bigint,
  state jsonb,
  updated_at timestamptz
)
language sql
security invoker
set search_path = public
as $$
  update public.release_workflow_state as workflow_state
  set
    state = p_state,
    revision = workflow_state.revision + 1,
    updated_at = now()
  where workflow_state.id = 'tether'
    and workflow_state.revision = p_expected_revision
  returning
    workflow_state.id,
    workflow_state.schema_version,
    workflow_state.revision,
    workflow_state.state,
    workflow_state.updated_at;
$$;

revoke all on function public.update_release_workflow_state(bigint, jsonb) from public, anon, authenticated;
grant execute on function public.update_release_workflow_state(bigint, jsonb) to service_role;
