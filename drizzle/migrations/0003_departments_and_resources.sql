create table public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint departments_name_length check (char_length(btrim(name)) between 2 and 120)
);

grant select on public.departments to anon, authenticated;
grant insert, update on public.departments to authenticated;
grant all on public.departments to service_role;
alter table public.departments enable row level security;
create policy "active departments readable" on public.departments for select to anon, authenticated
  using (is_active or public.is_staff(auth.uid()));
create policy "staff insert departments" on public.departments for insert to authenticated
  with check (public.is_staff(auth.uid()));
create policy "staff update departments" on public.departments for update to authenticated
  using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

alter table public.profiles add column student_code text;
alter table public.profiles add column department_id uuid references public.departments(id) on delete set null;
create unique index profiles_student_code_unique on public.profiles (lower(student_code)) where student_code is not null;
create index profiles_department_level_idx on public.profiles (department_id, level);
create policy "staff update profiles" on public.profiles for update to authenticated
  using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

alter table public.subjects add column department_id uuid references public.departments(id) on delete set null;
create index subjects_department_level_idx on public.subjects (department_id, level);

alter table public.announcements
  add column target_department_ids uuid[] not null default '{}',
  add column target_levels text[] not null default '{}';
alter table public.events
  add column target_department_ids uuid[] not null default '{}',
  add column target_levels text[] not null default '{}';
alter table public.notifications
  add column target_department_ids uuid[] not null default '{}',
  add column target_levels text[] not null default '{}';

create table public.lecture_resources (
  id uuid primary key default gen_random_uuid(),
  lecture_id uuid not null references public.lectures(id) on delete cascade,
  name text not null,
  description text,
  url text not null,
  resource_type text not null default 'other' check (resource_type in ('pdf','video','external','other')),
  drive_file_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lecture_resources_name_length check (char_length(btrim(name)) between 1 and 180),
  constraint lecture_resources_url_scheme check (url ~* '^https?://')
);
create index lecture_resources_lecture_idx on public.lecture_resources (lecture_id, created_at desc);
grant select, insert, update, delete on public.lecture_resources to authenticated;
grant all on public.lecture_resources to service_role;
alter table public.lecture_resources enable row level security;

create or replace function public.can_access_subject(_user_id uuid, _subject_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_staff(_user_id) or exists (
    select 1 from public.subjects s
    join public.profiles p on p.id = _user_id
    where s.id = _subject_id
      and (s.department_id is null or s.department_id = p.department_id)
      and (s.level is null or s.level = p.level)
  )
$$;

create or replace function public.matches_content_target(_user_id uuid, _department_ids uuid[], _levels text[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = _user_id
      and (coalesce(cardinality(_department_ids), 0) = 0 or p.department_id = any(_department_ids))
      and (coalesce(cardinality(_levels), 0) = 0 or p.level = any(_levels))
  )
$$;

create or replace function public.validate_content_target()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from unnest(coalesce(new.target_department_ids, '{}'::uuid[])) d(id)
    left join public.departments dep on dep.id = d.id and dep.is_active
    where dep.id is null
  ) then
    raise exception 'كل الأقسام المستهدفة يجب أن تكون موجودة ومفعّلة';
  end if;
  return new;
end $$;
create trigger trg_validate_announcement_target before insert or update of target_department_ids on public.announcements
  for each row execute function public.validate_content_target();
create trigger trg_validate_event_target before insert or update of target_department_ids on public.events
  for each row execute function public.validate_content_target();
create trigger trg_validate_notification_target before insert or update of target_department_ids on public.notifications
  for each row execute function public.validate_content_target();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  _code text := btrim(coalesce(new.raw_user_meta_data->>'student_code', ''));
  _department uuid;
begin
  begin
    _department := nullif(new.raw_user_meta_data->>'department_id', '')::uuid;
  exception when invalid_text_representation then
    raise exception 'القسم الدراسي غير صالح';
  end;

  if char_length(_code) < 2 or char_length(_code) > 40 then
    raise exception 'كود الطالب مطلوب ويجب أن يتراوح بين حرفين و40 حرفًا';
  end if;
  if char_length(btrim(coalesce(new.raw_user_meta_data->>'full_name', ''))) < 5
    or coalesce(new.raw_user_meta_data->>'full_name', '') !~ '[[:space:]]'
    or coalesce(new.raw_user_meta_data->>'phone', '') !~ '^01[0125][0-9]{8}$' then
    raise exception 'بيانات الطالب أو رقم الهاتف غير صالحة';
  end if;
  if not exists (select 1 from public.departments where id = _department and is_active) then
    raise exception 'اختر قسمًا دراسيًا موجودًا ومفعّلًا';
  end if;

  insert into public.profiles (id, full_name, phone, student_code, department_id)
  values (
    new.id,
    btrim(coalesce(new.raw_user_meta_data->>'full_name','')),
    coalesce(new.raw_user_meta_data->>'phone',''),
    _code,
    _department
  );
  if not exists (select 1 from public.user_roles where role = 'owner') then
    insert into public.user_roles (user_id, role) values (new.id, 'owner');
  else
    insert into public.user_roles (user_id, role) values (new.id, 'student');
  end if;
  insert into public.subscriptions (user_id, status) values (new.id, 'awaiting_payment');
  return new;
end $$;

create or replace function public.protect_profile_phone()
returns trigger language plpgsql as $$
begin
  if not public.is_staff(auth.uid()) then
    new.phone := old.phone;
    new.student_code := old.student_code;
    new.department_id := old.department_id;
    new.level := old.level;
  end if;
  new.updated_at := now();
  return new;
end $$;

-- Replace broad content reads with audience-aware policies. Existing rows use empty target arrays and remain global.
drop policy "subjects read" on public.subjects;
create policy "subjects read" on public.subjects for select to authenticated
  using (public.has_access(auth.uid()) and public.can_access_subject(auth.uid(), id));
drop policy "lectures read" on public.lectures;
create policy "lectures read" on public.lectures for select to authenticated
  using (public.has_access(auth.uid()) and public.can_access_subject(auth.uid(), subject_id));
drop policy "ann read" on public.announcements;
create policy "ann read" on public.announcements for select to authenticated
  using (
    public.is_staff(auth.uid())
    or (public.has_access(auth.uid()) and public.matches_content_target(auth.uid(), target_department_ids, target_levels))
  );
drop policy "events read" on public.events;
create policy "events read" on public.events for select to authenticated
  using (
    public.is_staff(auth.uid())
    or (
      public.has_access(auth.uid())
      and public.matches_content_target(auth.uid(), target_department_ids, target_levels)
      and (subject_id is null or public.can_access_subject(auth.uid(), subject_id))
    )
  );
drop policy "notif read" on public.notifications;
create policy "notif read" on public.notifications for select to authenticated
  using (
    user_id = auth.uid()
    or (user_id is null and public.has_access(auth.uid()) and public.matches_content_target(auth.uid(), target_department_ids, target_levels))
    or public.is_staff(auth.uid())
  );
create policy "lecture resources read" on public.lecture_resources for select to authenticated
  using (
    public.has_access(auth.uid())
    and exists (
      select 1 from public.lectures l
      where l.id = lecture_id and public.can_access_subject(auth.uid(), l.subject_id)
    )
  );
create policy "lecture resources staff write" on public.lecture_resources for all to authenticated
  using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

create table public.announcement_reads (
  user_id uuid not null default auth.uid(),
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (user_id, announcement_id)
);
grant select, insert on public.announcement_reads to authenticated;
grant all on public.announcement_reads to service_role;
alter table public.announcement_reads enable row level security;
create policy "announcement reads own select" on public.announcement_reads for select to authenticated
  using (user_id = auth.uid());
create policy "announcement reads own insert" on public.announcement_reads for insert to authenticated
  with check (user_id = auth.uid());

create or replace function public.lecture_storage_subject(_path text)
returns uuid language plpgsql immutable set search_path = public, storage as $$
begin
  return (storage.foldername(_path))[1]::uuid;
exception when others then
  return null;
end $$;
drop policy "lectures read" on storage.objects;
create policy "lectures read" on storage.objects for select to authenticated
  using (
    bucket_id = 'lectures'
    and (
      public.is_staff(auth.uid())
      or (public.has_access(auth.uid()) and public.can_access_subject(auth.uid(), public.lecture_storage_subject(name)))
    )
  );
