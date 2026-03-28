-- Loomic Supabase Foundation V1
-- Target hosted project ref: ndbwtngvypwgqexcirdo
--
-- Checklist:
-- - public.profiles
-- - public.workspaces
-- - public.workspace_members
-- - public.projects
-- - public.canvases
-- - public.asset_objects
-- - first-login bootstrap helper functions + auth.users trigger
-- - workspace-membership-based RLS policies
-- - storage buckets: project-assets, user-avatars
-- - storage.objects policies scoped by workspace membership or user ownership

create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'workspace_type'
  ) then
    create type public.workspace_type as enum ('personal', 'team');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'workspace_member_role'
  ) then
    create type public.workspace_member_role as enum ('owner', 'admin', 'member');
  end if;
end
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

create or replace function private.try_parse_uuid(p_value text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_value is null or btrim(p_value) = '' then
    return null;
  end if;

  return p_value::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.workspaces (
  id uuid primary key default extensions.gen_random_uuid(),
  type public.workspace_type not null,
  name text not null check (char_length(btrim(name)) > 0),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.workspace_member_role not null default 'member',
  created_at timestamptz not null default timezone('utc', now()),
  primary key (workspace_id, user_id)
);

create table if not exists public.projects (
  id uuid primary key default extensions.gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (char_length(btrim(name)) > 0),
  slug text not null check (char_length(btrim(slug)) > 0),
  description text,
  created_by uuid references auth.users (id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint projects_workspace_slug_key unique (workspace_id, slug),
  constraint projects_id_workspace_id_key unique (id, workspace_id)
);

create table if not exists public.canvases (
  id uuid primary key default extensions.gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null check (char_length(btrim(name)) > 0),
  is_primary boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.asset_objects (
  id uuid primary key default extensions.gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  project_id uuid,
  bucket text not null check (bucket in ('project-assets', 'user-avatars')),
  object_path text not null check (char_length(btrim(object_path)) > 0),
  mime_type text,
  byte_size bigint check (byte_size is null or byte_size >= 0),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint asset_objects_bucket_object_path_key unique (bucket, object_path),
  constraint asset_objects_project_workspace_fkey
    foreign key (project_id, workspace_id)
    references public.projects (id, workspace_id)
    on delete cascade
);

create index if not exists profiles_email_idx on public.profiles (email);
create index if not exists workspaces_owner_user_id_idx on public.workspaces (owner_user_id);
create unique index if not exists workspaces_personal_owner_user_id_key
  on public.workspaces (owner_user_id)
  where type = 'personal';
create index if not exists workspace_members_user_id_idx on public.workspace_members (user_id);
create index if not exists projects_workspace_id_idx on public.projects (workspace_id);
create index if not exists projects_created_by_idx on public.projects (created_by);
create index if not exists canvases_project_id_idx on public.canvases (project_id);
create unique index if not exists canvases_one_primary_per_project_key
  on public.canvases (project_id)
  where is_primary;
create index if not exists asset_objects_workspace_id_idx on public.asset_objects (workspace_id);
create index if not exists asset_objects_project_id_idx on public.asset_objects (project_id);
create index if not exists asset_objects_created_by_idx on public.asset_objects (created_by);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

drop trigger if exists workspaces_set_updated_at on public.workspaces;
create trigger workspaces_set_updated_at
before update on public.workspaces
for each row
execute function public.set_updated_at();

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
before update on public.projects
for each row
execute function public.set_updated_at();

drop trigger if exists canvases_set_updated_at on public.canvases;
create trigger canvases_set_updated_at
before update on public.canvases
for each row
execute function public.set_updated_at();

create or replace function private.is_workspace_member(p_workspace_id uuid)
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
      from public.workspace_members wm
      where wm.workspace_id = p_workspace_id
        and wm.user_id = (select auth.uid())
    );
$$;

create or replace function private.is_workspace_owner(p_workspace_id uuid)
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
      from public.workspaces w
      where w.id = p_workspace_id
        and w.owner_user_id = (select auth.uid())
    );
$$;

create or replace function private.is_project_member(p_project_id uuid)
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
      join public.workspace_members wm
        on wm.workspace_id = p.workspace_id
      where p.id = p_project_id
        and wm.user_id = (select auth.uid())
    );
$$;

create or replace function private.asset_object_project_matches_workspace(
  p_project_id uuid,
  p_workspace_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_project_id is null
    or exists (
      select 1
      from public.projects p
      where p.id = p_project_id
        and p.workspace_id = p_workspace_id
    );
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

    insert into public.workspaces (type, name, owner_user_id)
    values ('personal', v_workspace_name, p_user_id)
    returning id into v_workspace_id;
  end if;

  insert into public.workspace_members as wm (workspace_id, user_id, role)
  values (v_workspace_id, p_user_id, 'owner')
  on conflict (workspace_id, user_id) do update
    set role = 'owner';

  return v_workspace_id;
end;
$$;

revoke all on function private.bootstrap_user_foundation(uuid, text, jsonb) from public, anon, authenticated;

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
exception
  when others then
    raise warning 'handle_new_user bootstrap failed for user %: %', new.id, sqlerrm;
    return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.projects enable row level security;
alter table public.canvases enable row level security;
alter table public.asset_objects enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using ((select auth.uid()) is not null and id = (select auth.uid()));

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check ((select auth.uid()) is not null and id = (select auth.uid()));

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using ((select auth.uid()) is not null and id = (select auth.uid()))
with check ((select auth.uid()) is not null and id = (select auth.uid()));

drop policy if exists "workspaces_select_member" on public.workspaces;
create policy "workspaces_select_member"
on public.workspaces
for select
to authenticated
using ((select private.is_workspace_member(id)));

drop policy if exists "workspaces_insert_owner" on public.workspaces;
create policy "workspaces_insert_owner"
on public.workspaces
for insert
to authenticated
with check ((select auth.uid()) is not null and owner_user_id = (select auth.uid()));

drop policy if exists "workspaces_update_owner" on public.workspaces;
create policy "workspaces_update_owner"
on public.workspaces
for update
to authenticated
using ((select auth.uid()) is not null and owner_user_id = (select auth.uid()))
with check ((select auth.uid()) is not null and owner_user_id = (select auth.uid()));

drop policy if exists "workspaces_delete_owner" on public.workspaces;
create policy "workspaces_delete_owner"
on public.workspaces
for delete
to authenticated
using ((select auth.uid()) is not null and owner_user_id = (select auth.uid()));

drop policy if exists "workspace_members_select_member" on public.workspace_members;
create policy "workspace_members_select_member"
on public.workspace_members
for select
to authenticated
using ((select private.is_workspace_member(workspace_id)));

drop policy if exists "workspace_members_insert_owner" on public.workspace_members;
create policy "workspace_members_insert_owner"
on public.workspace_members
for insert
to authenticated
with check ((select private.is_workspace_owner(workspace_id)));

drop policy if exists "workspace_members_update_owner" on public.workspace_members;
create policy "workspace_members_update_owner"
on public.workspace_members
for update
to authenticated
using ((select private.is_workspace_owner(workspace_id)))
with check ((select private.is_workspace_owner(workspace_id)));

drop policy if exists "workspace_members_delete_owner" on public.workspace_members;
create policy "workspace_members_delete_owner"
on public.workspace_members
for delete
to authenticated
using ((select private.is_workspace_owner(workspace_id)));

drop policy if exists "projects_select_member" on public.projects;
create policy "projects_select_member"
on public.projects
for select
to authenticated
using ((select private.is_workspace_member(workspace_id)));

drop policy if exists "projects_insert_member" on public.projects;
create policy "projects_insert_member"
on public.projects
for insert
to authenticated
with check (
  (select private.is_workspace_member(workspace_id))
  and (created_by is null or created_by = (select auth.uid()))
);

drop policy if exists "projects_update_member" on public.projects;
create policy "projects_update_member"
on public.projects
for update
to authenticated
using ((select private.is_workspace_member(workspace_id)))
with check ((select private.is_workspace_member(workspace_id)));

drop policy if exists "projects_delete_member" on public.projects;
create policy "projects_delete_member"
on public.projects
for delete
to authenticated
using ((select private.is_workspace_member(workspace_id)));

drop policy if exists "canvases_select_member" on public.canvases;
create policy "canvases_select_member"
on public.canvases
for select
to authenticated
using ((select private.is_project_member(project_id)));

drop policy if exists "canvases_insert_member" on public.canvases;
create policy "canvases_insert_member"
on public.canvases
for insert
to authenticated
with check (
  (select private.is_project_member(project_id))
  and (created_by is null or created_by = (select auth.uid()))
);

drop policy if exists "canvases_update_member" on public.canvases;
create policy "canvases_update_member"
on public.canvases
for update
to authenticated
using ((select private.is_project_member(project_id)))
with check ((select private.is_project_member(project_id)));

drop policy if exists "canvases_delete_member" on public.canvases;
create policy "canvases_delete_member"
on public.canvases
for delete
to authenticated
using ((select private.is_project_member(project_id)));

drop policy if exists "asset_objects_select_member" on public.asset_objects;
create policy "asset_objects_select_member"
on public.asset_objects
for select
to authenticated
using ((select private.is_workspace_member(workspace_id)));

drop policy if exists "asset_objects_insert_member" on public.asset_objects;
create policy "asset_objects_insert_member"
on public.asset_objects
for insert
to authenticated
with check (
  (select private.is_workspace_member(workspace_id))
  and (created_by is null or created_by = (select auth.uid()))
  and (select private.asset_object_project_matches_workspace(project_id, workspace_id))
);

drop policy if exists "asset_objects_update_member" on public.asset_objects;
create policy "asset_objects_update_member"
on public.asset_objects
for update
to authenticated
using ((select private.is_workspace_member(workspace_id)))
with check (
  (select private.is_workspace_member(workspace_id))
  and (select private.asset_object_project_matches_workspace(project_id, workspace_id))
);

drop policy if exists "asset_objects_delete_member" on public.asset_objects;
create policy "asset_objects_delete_member"
on public.asset_objects
for delete
to authenticated
using ((select private.is_workspace_member(workspace_id)));

revoke all on function private.try_parse_uuid(text) from public, anon, authenticated;
revoke all on function private.is_workspace_member(uuid) from public, anon, authenticated;
revoke all on function private.is_workspace_owner(uuid) from public, anon, authenticated;
revoke all on function private.is_project_member(uuid) from public, anon, authenticated;
revoke all on function private.asset_object_project_matches_workspace(uuid, uuid) from public, anon, authenticated;

grant execute on function private.try_parse_uuid(text) to authenticated;
grant execute on function private.is_workspace_member(uuid) to authenticated;
grant execute on function private.is_workspace_owner(uuid) to authenticated;
grant execute on function private.is_project_member(uuid) to authenticated;
grant execute on function private.asset_object_project_matches_workspace(uuid, uuid) to authenticated;

insert into storage.buckets (id, name, public)
values
  ('project-assets', 'project-assets', true),
  ('user-avatars', 'user-avatars', false)
on conflict (id) do update
set name = excluded.name,
    public = excluded.public;

drop policy if exists "project_assets_select_member" on storage.objects;
create policy "project_assets_select_member"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'project-assets'
  and (select private.is_workspace_member(private.try_parse_uuid((storage.foldername(name))[1])))
);

drop policy if exists "project_assets_insert_member" on storage.objects;
create policy "project_assets_insert_member"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'project-assets'
  and (select private.is_workspace_member(private.try_parse_uuid((storage.foldername(name))[1])))
);

drop policy if exists "project_assets_update_member" on storage.objects;
create policy "project_assets_update_member"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'project-assets'
  and (select private.is_workspace_member(private.try_parse_uuid((storage.foldername(name))[1])))
)
with check (
  bucket_id = 'project-assets'
  and (select private.is_workspace_member(private.try_parse_uuid((storage.foldername(name))[1])))
);

drop policy if exists "project_assets_delete_member" on storage.objects;
create policy "project_assets_delete_member"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'project-assets'
  and (select private.is_workspace_member(private.try_parse_uuid((storage.foldername(name))[1])))
);

drop policy if exists "user_avatars_select_owner" on storage.objects;
create policy "user_avatars_select_owner"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'user-avatars'
  and private.try_parse_uuid((storage.foldername(name))[1]) = (select auth.uid())
);

drop policy if exists "user_avatars_insert_owner" on storage.objects;
create policy "user_avatars_insert_owner"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'user-avatars'
  and private.try_parse_uuid((storage.foldername(name))[1]) = (select auth.uid())
);

drop policy if exists "user_avatars_update_owner" on storage.objects;
create policy "user_avatars_update_owner"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'user-avatars'
  and private.try_parse_uuid((storage.foldername(name))[1]) = (select auth.uid())
)
with check (
  bucket_id = 'user-avatars'
  and private.try_parse_uuid((storage.foldername(name))[1]) = (select auth.uid())
);

drop policy if exists "user_avatars_delete_owner" on storage.objects;
create policy "user_avatars_delete_owner"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'user-avatars'
  and private.try_parse_uuid((storage.foldername(name))[1]) = (select auth.uid())
);

do $$
declare
  v_user record;
begin
  for v_user in
    select u.id, u.email, u.raw_user_meta_data
    from auth.users u
  loop
    begin
      perform private.bootstrap_user_foundation(
        v_user.id,
        v_user.email,
        coalesce(v_user.raw_user_meta_data, '{}'::jsonb)
      );
    exception
      when others then
        raise warning 'bootstrap backfill failed for user %: %', v_user.id, sqlerrm;
    end;
  end loop;
end
$$;
