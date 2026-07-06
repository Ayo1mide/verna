-- VERNA DATABASE SCHEMA
-- Run this in Supabase Dashboard → SQL Editor → New Query → Run

-- Profiles
create sequence if not exists public.verna_handle_seq start 1;

create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  username text unique,
  verna_number integer unique,
  verna_handle text unique,
  avatar_url text,
  subscription_tier text not null default 'free'
    check (subscription_tier in ('free', 'premium', 'creator')),
  subscription_status text not null default 'inactive',
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_price_id text,
  billing_provider text not null default 'none',
  flutterwave_customer_code text,
  flutterwave_plan_id bigint,
  flutterwave_subscription_id text,
  subscription_renewal_at timestamptz,
  created_at timestamptz default now()
);

alter table public.profiles
  add column if not exists verna_number integer unique,
  add column if not exists verna_handle text unique,
  add column if not exists subscription_status text not null default 'inactive',
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists stripe_price_id text,
  add column if not exists billing_provider text not null default 'none',
  add column if not exists flutterwave_customer_code text,
  add column if not exists flutterwave_plan_id bigint,
  add column if not exists flutterwave_subscription_id text,
  add column if not exists subscription_renewal_at timestamptz;

create unique index if not exists idx_profiles_stripe_customer_id on public.profiles (stripe_customer_id) where stripe_customer_id is not null;
create unique index if not exists idx_profiles_stripe_subscription_id on public.profiles (stripe_subscription_id) where stripe_subscription_id is not null;
create index if not exists idx_profiles_flutterwave_subscription_id on public.profiles (flutterwave_subscription_id);
create unique index if not exists idx_profiles_verna_number on public.profiles (verna_number) where verna_number is not null;
create unique index if not exists idx_profiles_verna_handle on public.profiles (verna_handle) where verna_handle is not null;

create table if not exists public.oauth_identities (
  id uuid default gen_random_uuid() primary key,
  provider text not null check (provider in ('google')),
  provider_subject text not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  email text,
  display_name text,
  avatar_url text,
  last_login_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(provider, provider_subject),
  unique(provider, user_id)
);

create table if not exists public.oauth_callback_exchanges (
  code uuid primary key default gen_random_uuid(),
  provider text not null default 'google' check (provider in ('google')),
  user_id uuid references auth.users(id) on delete cascade not null,
  access_token text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists public.app_refresh_tokens (
  id uuid default gen_random_uuid() primary key,
  token_hash text not null unique,
  user_id uuid references auth.users(id) on delete cascade not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  device_id text,
  user_agent text,
  ip_address text,
  created_at timestamptz default now()
);

create index if not exists idx_oauth_identities_user on public.oauth_identities (user_id);
create index if not exists idx_oauth_callback_exchanges_expires on public.oauth_callback_exchanges (expires_at, used_at);
create index if not exists idx_app_refresh_tokens_user_active on public.app_refresh_tokens (user_id, expires_at) where revoked_at is null;

create or replace function public.assign_verna_identity()
returns table(verna_number integer, verna_handle text) as $$
declare
  v_number integer;
begin
  v_number := nextval('public.verna_handle_seq')::integer;
  return query select v_number, 'verna' || v_number::text;
end;
$$ language plpgsql security definer;

create or replace function public.lock_verna_identity()
returns trigger as $$
begin
  if old.verna_number is not null then
    new.verna_number := old.verna_number;
  end if;

  if old.verna_handle is not null then
    new.verna_handle := old.verna_handle;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists profiles_lock_verna_identity on public.profiles;
create trigger profiles_lock_verna_identity
  before update on public.profiles
  for each row execute procedure public.lock_verna_identity();

with numbered_profiles as (
  select
    id,
    (nextval('public.verna_handle_seq'))::integer as assigned_number
  from public.profiles
  where verna_number is null or verna_handle is null
)
update public.profiles p
set
  verna_number = coalesce(p.verna_number, numbered_profiles.assigned_number),
  verna_handle = coalesce(p.verna_handle, 'verna' || numbered_profiles.assigned_number::text)
from numbered_profiles
where p.id = numbered_profiles.id;

select setval(
  'public.verna_handle_seq',
  greatest(coalesce((select max(verna_number) from public.profiles), 1), 1),
  coalesce((select max(verna_number) from public.profiles), 0) > 0
);

-- Journals
create table if not exists public.journals (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  title text not null,
  description text,
  mood_theme text not null default 'healing',
  entry_count integer default 0,
  dominant_mood text default 'hopeful',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create or replace function update_updated_at_column()
returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists oauth_identities_updated_at on public.oauth_identities;
create trigger oauth_identities_updated_at
  before update on public.oauth_identities
  for each row execute procedure update_updated_at_column();

drop trigger if exists journals_updated_at on public.journals;
create trigger journals_updated_at
  before update on public.journals
  for each row execute procedure update_updated_at_column();

-- Journal entries
create table if not exists public.journal_entries (
  id uuid default gen_random_uuid() primary key,
  journal_id uuid references public.journals(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  content text not null,
  mood text,
  mood_score integer,
  sentiment_score float,
  ai_insight text,
  voice_transcribed_text text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

drop trigger if exists entries_updated_at on public.journal_entries;
create trigger entries_updated_at
  before update on public.journal_entries
  for each row execute procedure update_updated_at_column();

-- Transforms (poem/story/video-script)
create table if not exists public.transforms (
  id uuid default gen_random_uuid() primary key,
  entry_id uuid references public.journal_entries(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  type text not null check (type in ('poem','story','video-script')),
  content text not null,
  is_shared boolean default false,
  feed_post_id uuid,
  created_at timestamptz default now()
);

-- Feed posts (anonymous)
create table if not exists public.feed_posts (
  id uuid default gen_random_uuid() primary key,
  transform_id uuid references public.transforms(id) on delete cascade not null,
  type text not null,
  content text not null,
  mood_theme text not null,
  is_moderated boolean default false,
  is_flagged boolean default false,
  is_visible boolean default false,
  reaction_counts jsonb default '{}'::jsonb,
  total_reactions integer default 0,
  created_at timestamptz default now()
);

-- Feed reactions (anonymous)
create table if not exists public.feed_reactions (
  id uuid default gen_random_uuid() primary key,
  feed_post_id uuid references public.feed_posts(id) on delete cascade not null,
  reaction_type text not null,
  session_hash text not null,
  created_at timestamptz default now(),
  unique(feed_post_id, reaction_type, session_hash)
);

-- Content flags
create table if not exists public.content_flags (
  id uuid default gen_random_uuid() primary key,
  feed_post_id uuid references public.feed_posts(id) on delete cascade not null,
  reason text default 'needs_support',
  reviewed boolean default false,
  created_at timestamptz default now()
);

-- Milestones
create table if not exists public.milestones (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  journal_id uuid references public.journals(id) on delete cascade,
  type text not null check (type in (
    'first_entry','ten_entries','first_poem','first_story','first_video',
    'first_share','mood_improved_20','mood_improved_50','mood_improved_100',
    'seven_day_streak','facing_fear','breakthrough'
  )),
  title text not null,
  description text not null,
  icon text,
  achieved_at timestamptz default now()
);

-- Growth tracking
create table if not exists public.growth_tracking (
  id uuid default gen_random_uuid() primary key,
  journal_id uuid references public.journals(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  week_number integer not null,
  year integer not null,
  avg_mood_score float not null,
  dominant_emotion text,
  top_trigger text,
  pattern_insight text,
  growth_delta float,
  created_at timestamptz default now(),
  unique(journal_id, week_number, year)
);

-- Rate limits
create table if not exists public.rate_limits (
  id uuid default gen_random_uuid() primary key,
  key text not null,
  window_start bigint not null,
  count integer default 0,
  updated_at timestamptz default now(),
  unique(key, window_start)
);

-- AI job queue
create table if not exists public.ai_jobs (
  id uuid default gen_random_uuid() primary key,
  type text not null check (type in ('transform','transcribe','analyze','poem_generate')),
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending','processing','completed','failed')),
  attempts smallint default 0,
  available_at timestamptz default now(),
  locked_at timestamptz,
  worker text,
  result jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Poem drafts: private workspace where raw thoughts become editable poems
create table if not exists public.poem_drafts (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  raw_text text not null,
  mood text,
  style text not null default 'verna',
  ai_title text,
  ai_poem text,
  edited_title text,
  edited_poem text,
  status text not null default 'generating'
    check (status in ('generating','ready','failed','posted')),
  generation_job_id uuid references public.ai_jobs(id) on delete set null,
  error_message text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

drop trigger if exists poem_drafts_updated_at on public.poem_drafts;
create trigger poem_drafts_updated_at
  before update on public.poem_drafts
  for each row execute procedure update_updated_at_column();

-- Public poem posts: Verna's core feed object
create table if not exists public.poem_posts (
  id uuid default gen_random_uuid() primary key,
  draft_id uuid references public.poem_drafts(id) on delete set null,
  parent_post_id uuid references public.poem_posts(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade not null,
  author_mode text not null default 'verna_id'
    check (author_mode in ('verna_id','anonymous')),
  author_handle text,
  title text,
  content text not null,
  mood text,
  moderation_status text not null default 'pending'
    check (moderation_status in ('pending','approved','rejected')),
  moderation_reason text,
  is_visible boolean default false,
  is_flagged boolean default false,
  reaction_counts jsonb default '{}'::jsonb,
  total_reactions integer default 0,
  reply_count integer default 0,
  repost_count integer default 0,
  save_count integer default 0,
  published_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.poem_posts
  add column if not exists parent_post_id uuid references public.poem_posts(id) on delete cascade,
  add column if not exists moderation_status text not null default 'pending'
    check (moderation_status in ('pending','approved','rejected')),
  add column if not exists moderation_reason text,
  add column if not exists reply_count integer default 0,
  add column if not exists repost_count integer default 0,
  add column if not exists save_count integer default 0,
  add column if not exists published_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'poem_posts_not_own_parent'
      and conrelid = 'public.poem_posts'::regclass
  ) then
    alter table public.poem_posts
      add constraint poem_posts_not_own_parent
      check (parent_post_id is null or parent_post_id <> id);
  end if;
end $$;

alter table public.poem_posts alter column is_visible set default false;

drop trigger if exists poem_posts_updated_at on public.poem_posts;
create trigger poem_posts_updated_at
  before update on public.poem_posts
  for each row execute procedure update_updated_at_column();

create table if not exists public.poem_post_reactions (
  id uuid default gen_random_uuid() primary key,
  poem_post_id uuid references public.poem_posts(id) on delete cascade not null,
  reaction_type text not null,
  session_hash text not null,
  created_at timestamptz default now(),
  unique(poem_post_id, reaction_type, session_hash)
);

create table if not exists public.poem_post_reports (
  id uuid default gen_random_uuid() primary key,
  poem_post_id uuid references public.poem_posts(id) on delete cascade not null,
  reporter_user_id uuid references public.profiles(id) on delete set null,
  session_hash text,
  reason text not null check (reason in ('self_harm','harassment','hate','sexual_content','pii','spam','other')),
  details text,
  reviewed boolean default false,
  created_at timestamptz default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'poem_post_reports_reporter_or_session'
      and conrelid = 'public.poem_post_reports'::regclass
  ) then
    alter table public.poem_post_reports
      add constraint poem_post_reports_reporter_or_session
      check (reporter_user_id is not null or session_hash is not null);
  end if;
end $$;

create table if not exists public.poem_post_saves (
  id uuid default gen_random_uuid() primary key,
  poem_post_id uuid references public.poem_posts(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  created_at timestamptz default now(),
  unique(poem_post_id, user_id)
);

create table if not exists public.poem_post_reposts (
  id uuid default gen_random_uuid() primary key,
  poem_post_id uuid references public.poem_posts(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  author_mode text not null default 'verna_id'
    check (author_mode in ('verna_id','anonymous')),
  author_handle text,
  created_at timestamptz default now(),
  unique(poem_post_id, user_id)
);

create table if not exists public.poem_profile_follows (
  id uuid default gen_random_uuid() primary key,
  follower_user_id uuid references public.profiles(id) on delete cascade not null,
  target_user_id uuid references public.profiles(id) on delete cascade not null,
  created_at timestamptz default now(),
  unique(follower_user_id, target_user_id),
  check (follower_user_id <> target_user_id)
);

drop view if exists public.public_poem_feed_items;
drop view if exists public.public_poem_posts;

create view public.public_poem_posts
with (security_invoker = false) as
select
  id,
  parent_post_id,
  case when author_mode = 'verna_id' then author_handle else null end as author_handle,
  author_mode,
  title,
  content,
  mood,
  reaction_counts,
  total_reactions,
  reply_count,
  repost_count,
  save_count,
  published_at,
  created_at
from public.poem_posts
where is_visible = true and is_flagged = false and moderation_status = 'approved';

create view public.public_poem_feed_items
with (security_invoker = false) as
select
  p.id as id,
  p.id as feed_item_id,
  'post'::text as feed_item_type,
  null::text as reposted_by_handle,
  null::text as repost_author_mode,
  null::timestamptz as reposted_at,
  p.parent_post_id,
  case when p.author_mode = 'verna_id' then p.author_handle else null end as author_handle,
  p.author_mode,
  p.title,
  p.content,
  p.mood,
  p.reaction_counts,
  p.total_reactions,
  p.reply_count,
  p.repost_count,
  p.save_count,
  p.published_at,
  p.created_at
from public.poem_posts p
where p.parent_post_id is null
  and p.is_visible = true
  and p.is_flagged = false
  and p.moderation_status = 'approved'
union all
select
  p.id as id,
  r.id as feed_item_id,
  'repost'::text as feed_item_type,
  case when r.author_mode = 'verna_id' then r.author_handle else null end as reposted_by_handle,
  r.author_mode as repost_author_mode,
  r.created_at as reposted_at,
  p.parent_post_id,
  case when p.author_mode = 'verna_id' then p.author_handle else null end as author_handle,
  p.author_mode,
  p.title,
  p.content,
  p.mood,
  p.reaction_counts,
  p.total_reactions,
  p.reply_count,
  p.repost_count,
  p.save_count,
  p.published_at,
  r.created_at as created_at
from public.poem_post_reposts r
join public.poem_posts p on p.id = r.poem_post_id
where p.is_visible = true
  and p.is_flagged = false
  and p.moderation_status = 'approved';

-- Helper functions
create or replace function add_feed_reaction(
  p_post_id uuid, p_reaction_type text, p_session_hash text
) returns jsonb as $$
declare
  v_counts jsonb;
  v_inserted integer;
begin
  insert into public.feed_reactions (feed_post_id, reaction_type, session_hash)
  values (p_post_id, p_reaction_type, p_session_hash)
  on conflict do nothing;

  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    select reaction_counts into v_counts
    from public.feed_posts
    where id = p_post_id;
    return coalesce(v_counts, '{}'::jsonb);
  end if;

  update public.feed_posts
  set
    reaction_counts = coalesce(reaction_counts, '{}'::jsonb) || jsonb_build_object(p_reaction_type, (coalesce((reaction_counts->>p_reaction_type)::int,0) + 1)),
    total_reactions = total_reactions + 1
  where id = p_post_id and is_visible = true and is_moderated = true
  returning reaction_counts into v_counts;

  return coalesce(v_counts, '{}'::jsonb);
end;
$$ language plpgsql security definer;

create or replace function add_poem_post_reaction(
  p_post_id uuid, p_reaction_type text, p_session_hash text
) returns jsonb as $$
declare
  v_counts jsonb;
  v_inserted integer;
begin
  insert into public.poem_post_reactions (poem_post_id, reaction_type, session_hash)
  select p_post_id, p_reaction_type, p_session_hash
  where exists (
    select 1 from public.poem_posts
    where id = p_post_id and is_visible = true and is_flagged = false and moderation_status = 'approved'
  )
  on conflict do nothing;

  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    select reaction_counts into v_counts
    from public.poem_posts
    where id = p_post_id;
    return coalesce(v_counts, '{}'::jsonb);
  end if;

  update public.poem_posts
  set
    reaction_counts = coalesce(reaction_counts, '{}'::jsonb) || jsonb_build_object(p_reaction_type, (coalesce((reaction_counts->>p_reaction_type)::int,0) + 1)),
    total_reactions = total_reactions + 1
  where id = p_post_id and is_visible = true and is_flagged = false and moderation_status = 'approved'
  returning reaction_counts into v_counts;

  return coalesce(v_counts, '{}'::jsonb);
end;
$$ language plpgsql security definer;

create or replace function increment_poem_post_counter(
  p_post_id uuid, p_counter text, p_delta integer
) returns integer as $$
declare
  v_value integer;
begin
  if p_counter not in ('reply_count','repost_count','save_count') then
    raise exception 'Invalid counter';
  end if;

  if p_counter = 'reply_count' then
    update public.poem_posts
    set reply_count = greatest(0, coalesce(reply_count, 0) + p_delta)
    where id = p_post_id
    returning reply_count into v_value;
  elsif p_counter = 'repost_count' then
    update public.poem_posts
    set repost_count = greatest(0, coalesce(repost_count, 0) + p_delta)
    where id = p_post_id
    returning repost_count into v_value;
  else
    update public.poem_posts
    set save_count = greatest(0, coalesce(save_count, 0) + p_delta)
    where id = p_post_id
    returning save_count into v_value;
  end if;

  return coalesce(v_value, 0);
end;
$$ language plpgsql security definer;

create or replace function award_milestone(
  p_user_id uuid, p_journal_id uuid, p_type text,
  p_title text, p_description text, p_icon text
) returns uuid as $$
declare v_milestone_id uuid;
begin
  select id into v_milestone_id from public.milestones
  where user_id = p_user_id and type = p_type limit 1;

  if v_milestone_id is null then
    insert into public.milestones (user_id, journal_id, type, title, description, icon)
    values (p_user_id, p_journal_id, p_type, p_title, p_description, p_icon)
    returning id into v_milestone_id;
  end if;

  return v_milestone_id;
end;
$$ language plpgsql security definer;

create or replace function increment_rate_limit(p_key text, p_window_start bigint, p_limit integer)
returns integer as $$
declare v_count integer;
begin
  insert into public.rate_limits (key, window_start, count)
  values (p_key, p_window_start, 1)
  on conflict (key, window_start) do update
    set count = public.rate_limits.count + 1, updated_at = now()
  returning count into v_count;
  return v_count;
end;
$$ language plpgsql security definer;

create or replace function claim_ai_job(p_worker text)
returns setof public.ai_jobs as $$
declare v_job public.ai_jobs%rowtype;
begin
  update public.ai_jobs set status = 'processing', locked_at = now(), worker = p_worker, attempts = attempts + 1
  where id = (
    select id from public.ai_jobs
    where status = 'pending' and available_at <= now()
    order by created_at asc limit 1 for update skip locked
  )
  returning * into v_job;

  if found then return next v_job; end if;
  return;
end;
$$ language plpgsql security definer;

create or replace function finish_ai_job(p_id uuid, p_status text, p_result jsonb)
returns void as $$
begin
  update public.ai_jobs set status = p_status, result = p_result, updated_at = now() where id = p_id;
end;
$$ language plpgsql security definer;

create or replace function public.flag_poem_post_after_reports()
returns trigger as $$
declare
  v_report_count integer;
begin
  select count(*) into v_report_count
  from public.poem_post_reports
  where poem_post_id = new.poem_post_id;

  if v_report_count >= 3 then
    update public.poem_posts
    set is_visible = false, is_flagged = true, moderation_reason = 'Hidden after multiple user reports'
    where id = new.poem_post_id;
  end if;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists poem_reports_auto_flag on public.poem_post_reports;
create trigger poem_reports_auto_flag
  after insert on public.poem_post_reports
  for each row execute procedure public.flag_poem_post_after_reports();

-- Monthly usage helpers and quota enforcement
create or replace function get_subscription_limits(p_tier text)
returns jsonb as $$
begin
  if p_tier = 'premium' then
    return jsonb_build_object(
      'entries_per_month', -1,
      'poems_per_month', -1,
      'scripts_per_month', -1,
      'stories_per_month', -1
    );
  end if;

  -- Default free limits
  return jsonb_build_object(
    'entries_per_month', 5,
    'poems_per_month', 2,
    'scripts_per_month', 5,
    'stories_per_month', 0
  );
end;
$$ language plpgsql immutable;

create or replace function enforce_entry_monthly_limit()
returns trigger as $$
declare
  v_tier text;
  v_month_count integer;
begin
  select subscription_tier into v_tier
  from public.profiles
  where id = new.user_id;

  if coalesce(v_tier, 'free') <> 'free' then
    return new;
  end if;

  select count(*) into v_month_count
  from public.journal_entries
  where user_id = new.user_id
    and created_at >= date_trunc('month', now())
    and created_at < (date_trunc('month', now()) + interval '1 month');

  if v_month_count >= 5 then
    raise exception 'Free plan monthly entry limit reached (5). Upgrade to Premium for unlimited entries.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$ language plpgsql security definer;

create or replace function enforce_transform_monthly_limit()
returns trigger as $$
declare
  v_tier text;
  v_poem_count integer;
  v_script_count integer;
begin
  select subscription_tier into v_tier
  from public.profiles
  where id = new.user_id;

  if coalesce(v_tier, 'free') <> 'free' then
    return new;
  end if;

  if new.type = 'story' then
    raise exception 'Stories are a Premium feature. Upgrade to create stories.'
      using errcode = 'P0001';
  end if;

  if new.type = 'poem' then
    select count(*) into v_poem_count
    from public.transforms
    where user_id = new.user_id
      and type = 'poem'
      and created_at >= date_trunc('month', now())
      and created_at < (date_trunc('month', now()) + interval '1 month');

    if v_poem_count >= 2 then
      raise exception 'Free plan monthly poem limit reached (2). Upgrade to Premium for unlimited poems.'
        using errcode = 'P0001';
    end if;
  end if;

  if new.type = 'video-script' then
    select count(*) into v_script_count
    from public.transforms
    where user_id = new.user_id
      and type = 'video-script'
      and created_at >= date_trunc('month', now())
      and created_at < (date_trunc('month', now()) + interval '1 month');

    if v_script_count >= 5 then
      raise exception 'Free plan monthly script limit reached (5). Upgrade to Premium for unlimited scripts.'
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_enforce_entry_monthly_limit on public.journal_entries;
create trigger trg_enforce_entry_monthly_limit
  before insert on public.journal_entries
  for each row execute procedure enforce_entry_monthly_limit();

drop trigger if exists trg_enforce_transform_monthly_limit on public.transforms;
create trigger trg_enforce_transform_monthly_limit
  before insert on public.transforms
  for each row execute procedure enforce_transform_monthly_limit();

-- Auto-profile on auth user creation
create or replace function public.handle_new_user()
returns trigger as $$
declare
  v_verna_number integer;
begin
  v_verna_number := nextval('public.verna_handle_seq')::integer;

  insert into public.profiles (id, username, verna_number, verna_handle, avatar_url)
  values (
    new.id,
    'verna' || v_verna_number::text,
    v_verna_number,
    'verna' || v_verna_number::text,
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

revoke execute on function public.add_feed_reaction(uuid, text, text) from anon, authenticated;
revoke execute on function public.add_poem_post_reaction(uuid, text, text) from anon, authenticated;
revoke execute on function public.increment_poem_post_counter(uuid, text, integer) from anon, authenticated;
revoke execute on function public.award_milestone(uuid, uuid, text, text, text, text) from anon, authenticated;
revoke execute on function public.increment_rate_limit(text, bigint, integer) from anon, authenticated;
revoke execute on function public.claim_ai_job(text) from anon, authenticated;
revoke execute on function public.finish_ai_job(uuid, text, jsonb) from anon, authenticated;
revoke execute on function public.enforce_entry_monthly_limit() from anon, authenticated;
revoke execute on function public.enforce_transform_monthly_limit() from anon, authenticated;
revoke execute on function public.assign_verna_identity() from anon, authenticated;
revoke execute on function public.lock_verna_identity() from anon, authenticated;
revoke execute on function public.flag_poem_post_after_reports() from anon, authenticated;

grant select on public.public_poem_posts to anon, authenticated;
grant select on public.public_poem_feed_items to anon, authenticated;

-- Enable RLS
alter table public.profiles enable row level security;
alter table public.oauth_identities enable row level security;
alter table public.oauth_callback_exchanges enable row level security;
alter table public.app_refresh_tokens enable row level security;
alter table public.journals enable row level security;
alter table public.journal_entries enable row level security;
alter table public.transforms enable row level security;
alter table public.milestones enable row level security;
alter table public.growth_tracking enable row level security;
alter table public.feed_posts enable row level security;
alter table public.feed_reactions enable row level security;
alter table public.content_flags enable row level security;
alter table public.rate_limits enable row level security;
alter table public.ai_jobs enable row level security;
alter table public.poem_drafts enable row level security;
alter table public.poem_posts enable row level security;
alter table public.poem_post_reactions enable row level security;
alter table public.poem_post_reports enable row level security;
alter table public.poem_post_saves enable row level security;
alter table public.poem_post_reposts enable row level security;
alter table public.poem_profile_follows enable row level security;

-- RLS Policies
drop policy if exists "Users view own profile" on public.profiles;
drop policy if exists "Users update own profile" on public.profiles;
drop policy if exists "Users insert own profile" on public.profiles;
drop policy if exists "No direct oauth identity access" on public.oauth_identities;
drop policy if exists "No direct oauth exchange access" on public.oauth_callback_exchanges;
drop policy if exists "No direct app refresh token access" on public.app_refresh_tokens;
drop policy if exists "Users CRUD own journals" on public.journals;
drop policy if exists "Users CRUD own entries" on public.journal_entries;
drop policy if exists "Users CRUD own transforms" on public.transforms;
drop policy if exists "Users read own milestones" on public.milestones;
drop policy if exists "Users read own growth" on public.growth_tracking;
drop policy if exists "Anyone can read visible feed" on public.feed_posts;
drop policy if exists "Anyone can react" on public.feed_reactions;
drop policy if exists "Anyone can read reactions" on public.feed_reactions;
drop policy if exists "Anyone can flag content" on public.content_flags;
drop policy if exists "Users CRUD own poem drafts" on public.poem_drafts;
drop policy if exists "Users CRUD own poem posts" on public.poem_posts;
drop policy if exists "Users read own poem drafts" on public.poem_drafts;
drop policy if exists "Users read own poem posts" on public.poem_posts;
drop policy if exists "Anyone can read visible poem posts" on public.poem_posts;
drop policy if exists "Anyone can read poem reactions" on public.poem_post_reactions;
drop policy if exists "Anyone can report poem posts" on public.poem_post_reports;
drop policy if exists "Users CRUD own poem saves" on public.poem_post_saves;
drop policy if exists "Anyone can read poem reposts" on public.poem_post_reposts;
drop policy if exists "Users CRUD own poem reposts" on public.poem_post_reposts;
drop policy if exists "Users read own follows" on public.poem_profile_follows;
drop policy if exists "Users CRUD own follows" on public.poem_profile_follows;

create policy "Users view own profile" on public.profiles for select using (auth.uid() = id);
create policy "Users update own profile" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "Users insert own profile" on public.profiles for insert with check (auth.uid() = id);
create policy "Users CRUD own journals" on public.journals for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users CRUD own entries" on public.journal_entries for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users CRUD own transforms" on public.transforms for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users read own milestones" on public.milestones for select using (auth.uid() = user_id);
create policy "Users read own growth" on public.growth_tracking for select using (auth.uid() = user_id);
create policy "Anyone can read visible feed" on public.feed_posts for select using (is_visible = true and is_moderated = true);
create policy "Anyone can read reactions" on public.feed_reactions for select using (true);
create policy "Anyone can flag content" on public.content_flags for insert with check (true);
create policy "Users read own poem drafts" on public.poem_drafts for select using (auth.uid() = user_id);
create policy "Users read own poem posts" on public.poem_posts for select using (auth.uid() = user_id);
create policy "Anyone can report poem posts" on public.poem_post_reports for insert with check (true);
create policy "Users CRUD own poem saves" on public.poem_post_saves for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users CRUD own poem reposts" on public.poem_post_reposts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users CRUD own follows" on public.poem_profile_follows for all using (auth.uid() = follower_user_id) with check (auth.uid() = follower_user_id);

-- Indexes
create index if not exists idx_journal_entries_journal_id on public.journal_entries (journal_id);
create index if not exists idx_journal_entries_created_at on public.journal_entries (created_at);
create index if not exists idx_growth_tracking_journal_week on public.growth_tracking (journal_id, week_number, year);
create index if not exists idx_feed_posts_created_at on public.feed_posts (created_at);
create index if not exists idx_feed_reactions_post on public.feed_reactions (feed_post_id);
create index if not exists idx_milestones_user on public.milestones (user_id);
create index if not exists idx_rate_limits_key_window on public.rate_limits (key, window_start);
create index if not exists idx_ai_jobs_status_available on public.ai_jobs (status, available_at, created_at);
create index if not exists idx_poem_drafts_user_status on public.poem_drafts (user_id, status, created_at);
create unique index if not exists idx_poem_posts_unique_draft on public.poem_posts (draft_id) where draft_id is not null;
create index if not exists idx_poem_posts_visible_created on public.poem_posts (is_visible, is_flagged, moderation_status, published_at desc, created_at desc);
create index if not exists idx_poem_posts_user_created on public.poem_posts (user_id, created_at);
create index if not exists idx_poem_posts_parent_created on public.poem_posts (parent_post_id, created_at);
create index if not exists idx_poem_post_reactions_post on public.poem_post_reactions (poem_post_id);
create index if not exists idx_poem_post_reports_post on public.poem_post_reports (poem_post_id, created_at);
create unique index if not exists idx_poem_post_reports_user_once on public.poem_post_reports (poem_post_id, reporter_user_id) where reporter_user_id is not null;
create unique index if not exists idx_poem_post_reports_session_once on public.poem_post_reports (poem_post_id, session_hash) where session_hash is not null;
create index if not exists idx_poem_post_saves_user on public.poem_post_saves (user_id, created_at);
create index if not exists idx_poem_post_saves_post on public.poem_post_saves (poem_post_id, created_at);
create index if not exists idx_poem_post_reposts_user on public.poem_post_reposts (user_id, created_at);
create index if not exists idx_poem_post_reposts_post on public.poem_post_reposts (poem_post_id, created_at);
create index if not exists idx_poem_profile_follows_follower on public.poem_profile_follows (follower_user_id, created_at);
create index if not exists idx_poem_profile_follows_target on public.poem_profile_follows (target_user_id, created_at);
