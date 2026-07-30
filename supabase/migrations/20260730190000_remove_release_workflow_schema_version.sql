drop function public.update_release_workflow_state(bigint, jsonb);

alter table public.release_workflow_state
drop column schema_version;

create function public.update_release_workflow_state(
  p_expected_revision bigint,
  p_state jsonb
)
returns table (
  id text,
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
    workflow_state.revision,
    workflow_state.state,
    workflow_state.updated_at;
$$;

revoke all on function public.update_release_workflow_state(bigint, jsonb)
from public, anon, authenticated;
grant execute on function public.update_release_workflow_state(bigint, jsonb)
to service_role;
