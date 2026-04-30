-- =============================================================================
-- Repair migration: drop partially-created biography_profiles table and
-- recreate it with standalone-compatible schema (no Baseplate FK deps).
-- =============================================================================

drop table if exists biography_profiles cascade;

create table biography_profiles (
  biography_profile_id  uuid        not null default gen_random_uuid(),
  customer_id           uuid        not null,
  user_id               uuid        not null,
  source_type           text        not null,
  source_url            text,
  source_text           text,
  subject_name          text,
  personal_overview     text,
  origin_story          text,
  career_journey        text,
  current_focus         text,
  areas_of_expertise    text,
  notable_achievements  text,
  career_highlights     text,
  personal_interests    text,
  biography_job_id      uuid,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz,
  created_by            uuid,
  updated_by            uuid,
  deleted_at            timestamptz,
  deleted_by            uuid,

  constraint biography_profiles_pkey
    primary key (biography_profile_id),

  constraint check_biography_profiles_source_type
    check (source_type in ('profile_url', 'pasted_text')),

  constraint check_biography_profiles_source_url_format
    check (source_url is null or source_url ~* '^https?://')
);

create index index_biography_profiles_customer_id
  on biography_profiles (customer_id);

create index index_biography_profiles_user_id
  on biography_profiles (user_id);

create index index_biography_profiles_customer_id_deleted_at
  on biography_profiles (customer_id, deleted_at);

create unique index unique_biography_profiles_user_id_active
  on biography_profiles (user_id)
  where deleted_at is null;

create or replace function biography_profiles_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trigger_biography_profiles_updated_at
  before update on biography_profiles
  for each row
  execute function biography_profiles_set_updated_at();

alter table biography_profiles enable row level security;

create policy policy_select_biography_profiles
  on biography_profiles
  for select
  using (user_id = auth.uid());

create policy policy_insert_biography_profiles
  on biography_profiles
  for insert
  with check (user_id = auth.uid());

create policy policy_update_biography_profiles
  on biography_profiles
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy policy_delete_biography_profiles
  on biography_profiles
  for delete
  using (user_id = auth.uid());
