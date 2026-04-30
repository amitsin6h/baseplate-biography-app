-- =============================================================================
-- Migration: biography_profiles
-- Feature:   biography (feature slug: biography)
-- Table Type: User Singleton
-- Scope:      User
-- =============================================================================
-- Standalone adaptation: FK references to Baseplate shared tables (customers,
-- users) and Baseplate helper functions (current_user_id, customer_id,
-- can_access_customer, is_system_admin) are replaced with standard Supabase
-- auth.uid() so this migration runs in a standalone project without the full
-- Baseplate platform. In a full Baseplate deployment, restore the FKs and
-- helper-function calls per the original schema.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Primary table: biography_profiles
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index index_biography_profiles_customer_id
  on biography_profiles (customer_id);

create index index_biography_profiles_user_id
  on biography_profiles (user_id);

create index index_biography_profiles_customer_id_deleted_at
  on biography_profiles (customer_id, deleted_at);

-- User Singleton: one active profile per user
create unique index unique_biography_profiles_user_id_active
  on biography_profiles (user_id)
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Trigger: auto-set updated_at on every UPDATE
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Row Level Security
-- Uses auth.uid() directly (standalone — no Baseplate helper functions).
-- ---------------------------------------------------------------------------
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


-- ---------------------------------------------------------------------------
-- Primary table: biography_profiles
-- ---------------------------------------------------------------------------
create table biography_profiles (
  -- Primary key — singular table name + _id per Baseplate convention
  biography_profile_id  uuid        not null default gen_random_uuid(),

  -- Tenant ownership (User scope requires customer_id)
  customer_id           uuid        not null,

  -- User singleton enforcement — one active row per user
  user_id               uuid        not null,

  -- Generation mode
  source_type           text        not null,

  -- Mode 2 (URL) source input
  source_url            text,

  -- Mode 1 (text) source input; also stores Diffbot-normalised text for Mode 2
  source_text           text,

  -- Generated biography sections — all nullable (null until first generation)
  subject_name          text,
  personal_overview     text,
  origin_story          text,
  career_journey        text,
  current_focus         text,
  areas_of_expertise    text,
  notable_achievements  text,
  career_highlights     text,
  personal_interests    text,

  -- Provenance: UUID of the LLM job that last generated this profile
  biography_job_id      uuid,

  -- ---------------------------------------------------------------------------
  -- Standard record-keeping columns (required for Primary tables)
  -- ---------------------------------------------------------------------------
  created_at            timestamptz not null default now(),
  updated_at            timestamptz,
  created_by            uuid,
  updated_by            uuid,
  deleted_at            timestamptz,
  deleted_by            uuid,

  -- ---------------------------------------------------------------------------
  -- Constraints
  -- ---------------------------------------------------------------------------
  constraint biography_profiles_pkey
    primary key (biography_profile_id),

  constraint foreign_key_biography_profiles_customers_customer_id
    foreign key (customer_id) references customers (customer_id),

  constraint foreign_key_biography_profiles_users_user_id
    foreign key (user_id) references users (user_id),

  constraint foreign_key_biography_profiles_users_created_by
    foreign key (created_by) references users (user_id),

  constraint foreign_key_biography_profiles_users_updated_by
    foreign key (updated_by) references users (user_id),

  constraint foreign_key_biography_profiles_users_deleted_by
    foreign key (deleted_by) references users (user_id),

  constraint check_biography_profiles_source_type
    check (source_type in ('profile_url', 'pasted_text')),

  -- URL must be http(s) if provided
  constraint check_biography_profiles_source_url_format
    check (source_url is null or source_url ~* '^https?://')
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

-- Tenant lookup index
create index index_biography_profiles_customer_id
  on biography_profiles (customer_id);

-- User lookup index (used by RLS and singleton lookups)
create index index_biography_profiles_user_id
  on biography_profiles (user_id);

-- Composite index for tenant-scoped soft-delete queries
create index index_biography_profiles_customer_id_deleted_at
  on biography_profiles (customer_id, deleted_at);

-- ---------------------------------------------------------------------------
-- Partial unique index: enforce User Singleton pattern
-- Only one active (non-deleted) profile row is allowed per user.
-- ---------------------------------------------------------------------------
create unique index unique_biography_profiles_user_id_active
  on biography_profiles (user_id)
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Trigger: auto-set updated_at on every UPDATE
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Trigger: auto-set created_by / created_at and updated_by on write
-- Depends on Baseplate current_user_id() function.
-- ---------------------------------------------------------------------------
create or replace function biography_profiles_set_audit_columns()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at  = coalesce(new.created_at, now());
    new.created_by  = coalesce(new.created_by, current_user_id());
    new.updated_by  = coalesce(new.updated_by, current_user_id());
  elsif tg_op = 'UPDATE' then
    new.updated_by  = current_user_id();
  end if;
  return new;
end;
$$;

create trigger trigger_biography_profiles_audit
  before insert or update on biography_profiles
  for each row
  execute function biography_profiles_set_audit_columns();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table biography_profiles enable row level security;

-- SELECT
-- Regular users see only their own profile.
-- System roles (admin, customer success) can access any profile within
-- customers they can access.
create policy policy_select_biography_profiles
  on biography_profiles
  for select
  using (
    user_id = current_user_id()
    or can_access_customer(customer_id)
  );

-- INSERT
-- A user may only insert a row for themselves inside their own customer.
create policy policy_insert_biography_profiles
  on biography_profiles
  for insert
  with check (
    customer_id = customer_id()
    and user_id = current_user_id()
  );

-- UPDATE
-- A user may update their own profile.
-- System roles may update profiles within accessible customers.
create policy policy_update_biography_profiles
  on biography_profiles
  for update
  using (
    user_id = current_user_id()
    or can_access_customer(customer_id)
  )
  with check (
    user_id = current_user_id()
    or can_access_customer(customer_id)
  );

-- DELETE
-- Physical delete is restricted to system administrators only.
-- All routine removals use soft delete (deleted_at / deleted_by).
create policy policy_delete_biography_profiles
  on biography_profiles
  for delete
  using (
    is_system_admin()
  );
