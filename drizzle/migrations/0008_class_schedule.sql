create table public.class_schedule (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  starts_at time not null,
  ends_at time not null,
  location text,
  instructor text,
  target_department_ids uuid[] not null default '{}',
  target_levels text[] not null default '{}',
  created_at timestamptz not null default now(),
  constraint class_schedule_time_order check (ends_at > starts_at)
);

create index class_schedule_day_time_idx on public.class_schedule(day_of_week, starts_at);
create index class_schedule_subject_idx on public.class_schedule(subject_id);

alter table public.class_schedule enable row level security;
grant select on public.class_schedule to authenticated;
grant insert, update, delete on public.class_schedule to authenticated;
grant all on public.class_schedule to service_role;

create policy "class schedule visible to targeted students and staff"
  on public.class_schedule for select to authenticated
  using (
    public.has_staff_permission(auth.uid(), 'content')
    or (
      public.has_access(auth.uid())
      and public.matches_content_target(auth.uid(), target_department_ids, target_levels)
    )
  );
create policy "content staff manage class schedule"
  on public.class_schedule for all to authenticated
  using (public.has_staff_permission(auth.uid(), 'content'))
  with check (public.has_staff_permission(auth.uid(), 'content'));
