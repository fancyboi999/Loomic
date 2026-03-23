-- Loomic Supabase Foundation Hardening
-- Follow-up migration for production safety fixes without rewriting applied history.

create or replace function private.is_workspace_admin_or_owner(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select auth.uid()) is not null
    and (
      exists (
        select 1
        from public.workspaces w
        where w.id = p_workspace_id
          and w.owner_user_id = (select auth.uid())
      )
      or exists (
        select 1
        from public.workspace_members wm
        where wm.workspace_id = p_workspace_id
          and wm.user_id = (select auth.uid())
          and wm.role in ('owner', 'admin')
      )
    );
$$;

create or replace function private.is_project_admin_or_owner(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select auth.uid()) is not null
    and exists (
      select 1
      from public.projects p
      where p.id = p_project_id
        and private.is_workspace_admin_or_owner(p.workspace_id)
    );
$$;

create or replace function private.prevent_profile_email_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.email is distinct from old.email
     and current_user = 'authenticated' then
    raise exception 'profiles.email is managed by auth.users'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace function private.bootstrap_user_foundation(
  p_user_id uuid,
  p_email text,
  p_user_meta jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_display_name text;
  v_workspace_name text;
begin
  v_display_name := nullif(
    btrim(
      coalesce(
        p_user_meta ->> 'display_name',
        p_user_meta ->> 'full_name',
        p_user_meta ->> 'name',
        split_part(coalesce(p_email, ''), '@', 1)
      )
    ),
    ''
  );

  insert into public.profiles as p (id, email, display_name, avatar_url)
  values (
    p_user_id,
    p_email,
    v_display_name,
    nullif(btrim(coalesce(p_user_meta ->> 'avatar_url', '')), '')
  )
  on conflict (id) do update
    set email = coalesce(excluded.email, p.email),
        display_name = coalesce(p.display_name, excluded.display_name),
        avatar_url = coalesce(p.avatar_url, excluded.avatar_url),
        updated_at = timezone('utc', now());

  select w.id
  into v_workspace_id
  from public.workspaces w
  where w.owner_user_id = p_user_id
    and w.type = 'personal'
  order by w.created_at
  limit 1;

  if v_workspace_id is null then
    v_workspace_name := coalesce(v_display_name, 'Personal') || ' Workspace';

    begin
      insert into public.workspaces (type, name, owner_user_id)
      values ('personal', v_workspace_name, p_user_id)
      returning id into v_workspace_id;
    exception
      when unique_violation then
        select w.id
        into v_workspace_id
        from public.workspaces w
        where w.owner_user_id = p_user_id
          and w.type = 'personal'
        order by w.created_at
        limit 1;
    end;
  end if;

  if v_workspace_id is null then
    raise exception 'bootstrap_user_foundation could not resolve personal workspace for user %', p_user_id;
  end if;

  insert into public.workspace_members as wm (workspace_id, user_id, role)
  values (v_workspace_id, p_user_id, 'owner')
  on conflict (workspace_id, user_id) do update
    set role = 'owner';

  return v_workspace_id;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.bootstrap_user_foundation(
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data, '{}'::jsonb)
  );

  return new;
end;
$$;

drop trigger if exists profiles_prevent_email_change on public.profiles;
create trigger profiles_prevent_email_change
before update on public.profiles
for each row
execute function private.prevent_profile_email_change();

drop policy if exists "projects_insert_member" on public.projects;
drop policy if exists "projects_insert_admin" on public.projects;
create policy "projects_insert_admin"
on public.projects
for insert
to authenticated
with check (
  (select private.is_workspace_admin_or_owner(workspace_id))
  and (created_by is null or created_by = (select auth.uid()))
);

drop policy if exists "projects_update_member" on public.projects;
drop policy if exists "projects_update_admin" on public.projects;
create policy "projects_update_admin"
on public.projects
for update
to authenticated
using ((select private.is_workspace_admin_or_owner(workspace_id)))
with check ((select private.is_workspace_admin_or_owner(workspace_id)));

drop policy if exists "projects_delete_member" on public.projects;
drop policy if exists "projects_delete_admin" on public.projects;
create policy "projects_delete_admin"
on public.projects
for delete
to authenticated
using ((select private.is_workspace_admin_or_owner(workspace_id)));

drop policy if exists "canvases_insert_member" on public.canvases;
drop policy if exists "canvases_insert_admin" on public.canvases;
create policy "canvases_insert_admin"
on public.canvases
for insert
to authenticated
with check (
  (select private.is_project_admin_or_owner(project_id))
  and (created_by is null or created_by = (select auth.uid()))
);

drop policy if exists "canvases_update_member" on public.canvases;
drop policy if exists "canvases_update_admin" on public.canvases;
create policy "canvases_update_admin"
on public.canvases
for update
to authenticated
using ((select private.is_project_admin_or_owner(project_id)))
with check ((select private.is_project_admin_or_owner(project_id)));

drop policy if exists "canvases_delete_member" on public.canvases;
drop policy if exists "canvases_delete_admin" on public.canvases;
create policy "canvases_delete_admin"
on public.canvases
for delete
to authenticated
using ((select private.is_project_admin_or_owner(project_id)));

drop policy if exists "asset_objects_insert_member" on public.asset_objects;
drop policy if exists "asset_objects_insert_admin" on public.asset_objects;
create policy "asset_objects_insert_admin"
on public.asset_objects
for insert
to authenticated
with check (
  (select private.is_workspace_admin_or_owner(workspace_id))
  and (created_by is null or created_by = (select auth.uid()))
  and (select private.asset_object_project_matches_workspace(project_id, workspace_id))
);

drop policy if exists "asset_objects_update_member" on public.asset_objects;
drop policy if exists "asset_objects_update_admin" on public.asset_objects;
create policy "asset_objects_update_admin"
on public.asset_objects
for update
to authenticated
using ((select private.is_workspace_admin_or_owner(workspace_id)))
with check (
  (select private.is_workspace_admin_or_owner(workspace_id))
  and (select private.asset_object_project_matches_workspace(project_id, workspace_id))
);

drop policy if exists "asset_objects_delete_member" on public.asset_objects;
drop policy if exists "asset_objects_delete_admin" on public.asset_objects;
create policy "asset_objects_delete_admin"
on public.asset_objects
for delete
to authenticated
using ((select private.is_workspace_admin_or_owner(workspace_id)));

drop policy if exists "project_assets_insert_member" on storage.objects;
drop policy if exists "project_assets_insert_admin" on storage.objects;
create policy "project_assets_insert_admin"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'project-assets'
  and (
    select private.is_workspace_admin_or_owner(
      private.try_parse_uuid((storage.foldername(name))[1])
    )
  )
);

drop policy if exists "project_assets_update_member" on storage.objects;
drop policy if exists "project_assets_update_admin" on storage.objects;
create policy "project_assets_update_admin"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'project-assets'
  and (
    select private.is_workspace_admin_or_owner(
      private.try_parse_uuid((storage.foldername(name))[1])
    )
  )
)
with check (
  bucket_id = 'project-assets'
  and (
    select private.is_workspace_admin_or_owner(
      private.try_parse_uuid((storage.foldername(name))[1])
    )
  )
);

drop policy if exists "project_assets_delete_member" on storage.objects;
drop policy if exists "project_assets_delete_admin" on storage.objects;
create policy "project_assets_delete_admin"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'project-assets'
  and (
    select private.is_workspace_admin_or_owner(
      private.try_parse_uuid((storage.foldername(name))[1])
    )
  )
);

revoke all on function private.is_workspace_admin_or_owner(uuid) from public, anon, authenticated;
revoke all on function private.is_project_admin_or_owner(uuid) from public, anon, authenticated;
revoke all on function private.prevent_profile_email_change() from public, anon, authenticated;
revoke all on function private.bootstrap_user_foundation(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;

grant execute on function private.is_workspace_admin_or_owner(uuid) to authenticated;
grant execute on function private.is_project_admin_or_owner(uuid) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('project-assets', 'project-assets', false, 52428800, null),
  (
    'user-avatars',
    'user-avatars',
    false,
    5242880,
    array['image/png', 'image/jpeg', 'image/webp', 'image/gif']::text[]
  )
on conflict (id) do update
set name = excluded.name,
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
