-- Run once in the existing external project's SQL editor before deploying.
create table if not exists public.class_schedule_changes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.class_schedule(id) on delete cascade,
  change_date date not null,
  scope text not null default 'once' check (scope in ('once','onwards')),
  action text not null check (action in ('cancel','postpone','time','location','instructor','restore','note')),
  new_date date,
  new_starts_at time,
  new_ends_at time,
  new_location text,
  new_instructor text,
  reason text,
  target_department_ids uuid[] not null default '{}',
  target_levels text[] not null default '{}',
  dedupe_key text not null unique,
  notification_id uuid references public.notifications(id) on delete set null,
  recipients integer not null default 0,
  telegram_sent integer not null default 0,
  telegram_failed integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (action <> 'postpone' or (scope = 'once' and new_date > change_date)),
  check (action not in ('time','postpone') or (new_starts_at is not null and new_ends_at > new_starts_at))
);
grant select on public.class_schedule_changes to authenticated;
grant all on public.class_schedule_changes to service_role;
alter table public.class_schedule_changes enable row level security;
drop policy if exists "targeted schedule changes" on public.class_schedule_changes;
create policy "targeted schedule changes" on public.class_schedule_changes for select to authenticated
using (
  public.has_staff_permission(auth.uid(), 'content')
  or public.has_staff_permission(auth.uid(), 'communications')
  or (public.has_access(auth.uid()) and public.matches_content_target(auth.uid(), target_department_ids, target_levels))
);
create index if not exists schedule_changes_date_idx on public.class_schedule_changes(session_id, change_date, created_at);