-- Migration: 20260323_000003_atomic_rpc_functions
-- Adds two public RPC functions:
--   1. public.bootstrap_viewer       — thin wrapper over private.bootstrap_user_foundation
--   2. public.create_project_with_canvas — atomic project + primary canvas creation

-- ------------------------------------------------------------
-- 1. public.bootstrap_viewer
--    Called by the admin/service client to initialise a new user.
--    Only service_role may execute this; no grant to authenticated.
-- ------------------------------------------------------------

create or replace function public.bootstrap_viewer(
  p_user_id uuid,
  p_email text,
  p_user_meta jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.bootstrap_user_foundation(p_user_id, p_email, p_user_meta);
end;
$$;

revoke all on function public.bootstrap_viewer(uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.bootstrap_viewer(uuid, text, jsonb)
  to service_role;

-- ------------------------------------------------------------
-- 2. public.create_project_with_canvas
--    Atomically inserts a project row and its primary canvas row.
--    Both INSERTs occur in the same implicit PG transaction; if
--    either fails, both roll back.
--    Requires the caller to be an admin or owner of the workspace
--    (uses private.is_workspace_admin_or_owner, matching the
--    hardened RLS policy introduced in migration 000002).
-- ------------------------------------------------------------

create or replace function public.create_project_with_canvas(
  p_workspace_id uuid,
  p_name text,
  p_slug text,
  p_description text default null,
  p_canvas_name text default 'Main Canvas'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_project_id uuid;
  v_canvas_id uuid;
  v_project record;
  v_canvas record;
begin
  v_user_id := (select auth.uid());

  if v_user_id is null then
    raise exception 'Not authenticated'
      using errcode = '42501';
  end if;

  if not private.is_workspace_admin_or_owner(p_workspace_id) then
    raise exception 'Not an admin or owner of this workspace'
      using errcode = '42501';
  end if;

  insert into public.projects (workspace_id, name, slug, description, created_by)
  values (p_workspace_id, p_name, p_slug, p_description, v_user_id)
  returning id into v_project_id;

  insert into public.canvases (project_id, name, is_primary, created_by)
  values (v_project_id, p_canvas_name, true, v_user_id)
  returning id into v_canvas_id;

  select id, name, slug, description, created_at, updated_at, workspace_id
  into v_project
  from public.projects
  where id = v_project_id;

  select id, name, is_primary
  into v_canvas
  from public.canvases
  where id = v_canvas_id;

  return jsonb_build_object(
    'project', jsonb_build_object(
      'id', v_project.id,
      'name', v_project.name,
      'slug', v_project.slug,
      'description', v_project.description,
      'created_at', v_project.created_at,
      'updated_at', v_project.updated_at,
      'workspace_id', v_project.workspace_id
    ),
    'canvas', jsonb_build_object(
      'id', v_canvas.id,
      'name', v_canvas.name,
      'is_primary', v_canvas.is_primary
    )
  );
end;
$$;

revoke all on function public.create_project_with_canvas(uuid, text, text, text, text)
  from public, anon;
grant execute on function public.create_project_with_canvas(uuid, text, text, text, text)
  to authenticated;
