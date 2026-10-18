-- Student account verification and granular staff access.
alter table public.profiles
  add column registration_status text not null default 'active'
    check (registration_status in ('pending', 'active')),
  add column id_card_path text;
alter table public.profiles alter column registration_status set default 'pending';

create table public.staff_permissions (
  user_id uuid not null references public.profiles(id) on delete cascade,
  permission text not null check (permission in ('students', 'payments', 'content', 'communications')),
  created_at timestamptz not null default now(),
  primary key (user_id, permission)
);
alter table public.staff_permissions enable row level security;
grant select on public.staff_permissions to authenticated;
grant all on public.staff_permissions to service_role;

create or replace function public.has_staff_permission(_user_id uuid, _permission text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(_user_id, 'owner'::public.app_role)
    or exists (
      select 1 from public.staff_permissions
      where user_id = _user_id and permission = _permission
    )
$$;

create policy "staff permissions visible to self and staff admins"
  on public.staff_permissions for select to authenticated
  using (
    user_id = auth.uid()
    or public.has_role(auth.uid(), 'owner'::public.app_role)
  );

-- Keep current employees working with the same access they had before this migration.
insert into public.staff_permissions (user_id, permission)
select ur.user_id, permissions.permission
from public.user_roles ur
cross join unnest(array['students', 'payments', 'content', 'communications']::text[]) as permissions(permission)
where ur.role = 'staff'
on conflict do nothing;

create or replace function public.set_staff_access(
  _user_id uuid,
  _make_staff boolean,
  _permissions text[] default '{}'
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'owner'::public.app_role) then
    raise exception 'Only the owner can manage staff access';
  end if;
  if _user_id = auth.uid() or public.has_role(_user_id, 'owner'::public.app_role) then
    raise exception 'Owner access cannot be changed here';
  end if;
  if exists (
    select 1 from unnest(coalesce(_permissions, '{}'::text[])) as requested(permission)
    where requested.permission not in ('students', 'payments', 'content', 'communications')
  ) then
    raise exception 'Invalid staff permission';
  end if;
  if _make_staff and coalesce(cardinality(_permissions), 0) = 0 then
    raise exception 'Select at least one staff permission';
  end if;

  if _make_staff then
    insert into public.user_roles (user_id, role) values (_user_id, 'staff')
    on conflict (user_id, role) do nothing;
    delete from public.staff_permissions where user_id = _user_id;
    insert into public.staff_permissions (user_id, permission)
    select _user_id, requested.permission
    from unnest(_permissions) as requested(permission)
    on conflict do nothing;
  else
    delete from public.staff_permissions where user_id = _user_id;
    delete from public.user_roles where user_id = _user_id and role = 'staff';
  end if;
end
$$;
revoke all on function public.set_staff_access(uuid, boolean, text[]) from public;
grant execute on function public.set_staff_access(uuid, boolean, text[]) to authenticated;

-- Existing accounts remain active. New non-owner accounts wait for ID-card review.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  _code text := btrim(coalesce(new.raw_user_meta_data->>'student_code', ''));
  _level text := btrim(coalesce(new.raw_user_meta_data->>'level', ''));
  _department uuid;
  _is_first_owner boolean;
begin
  begin
    _department := nullif(new.raw_user_meta_data->>'department_id', '')::uuid;
  exception when invalid_text_representation then
    raise exception 'Invalid department';
  end;

  if char_length(_code) < 2 or char_length(_code) > 40 then
    raise exception 'Student ID code is required';
  end if;
  if _level not in ('الفرقة الأولى', 'الفرقة الثانية', 'الفرقة الثالثة', 'الفرقة الرابعة') then
    raise exception 'Choose a valid study year';
  end if;
  if char_length(btrim(coalesce(new.raw_user_meta_data->>'full_name', ''))) < 5
    or coalesce(new.raw_user_meta_data->>'full_name', '') !~ '[[:space:]]'
    or coalesce(new.raw_user_meta_data->>'phone', '') !~ '^01[0125][0-9]{8}$' then
    raise exception 'Invalid student name or phone';
  end if;
  if not exists (select 1 from public.departments where id = _department and is_active) then
    raise exception 'Choose an active department';
  end if;

  _is_first_owner := not exists (select 1 from public.user_roles where role = 'owner');
  insert into public.profiles (id, full_name, phone, student_code, department_id, level, registration_status)
  values (
    new.id,
    btrim(coalesce(new.raw_user_meta_data->>'full_name', '')),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    _code,
    _department,
    _level,
    case when _is_first_owner then 'active' else 'pending' end
  );
  if _is_first_owner then
    insert into public.user_roles (user_id, role) values (new.id, 'owner');
  else
    insert into public.user_roles (user_id, role) values (new.id, 'student');
  end if;
  insert into public.subscriptions (user_id, status) values (new.id, 'awaiting_payment');
  return new;
end $$;

create or replace function public.protect_profile_phone()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff(auth.uid()) then
    new.phone := old.phone;
    new.student_code := old.student_code;
    new.department_id := old.department_id;
    new.level := old.level;
    new.registration_status := old.registration_status;
    if new.id_card_path is distinct from old.id_card_path
      and (
        old.registration_status <> 'pending'
        or new.id_card_path is null
        or split_part(new.id_card_path, '/', 1) <> auth.uid()::text
      ) then
      new.id_card_path := old.id_card_path;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

create or replace function public.has_access(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_staff(_user_id) or (
    exists (
      select 1 from public.profiles p
      where p.id = _user_id and p.registration_status = 'active'
    )
    and exists (
      select 1 from public.subscriptions s
      where s.user_id = _user_id and s.status = 'active' and (s.end_at is null or s.end_at > now())
    )
    and exists (select 1 from public.telegram_links t where t.user_id = _user_id)
  )
$$;

-- Enforce staff permissions in the database as well as the app UI.
drop policy if exists "own roles readable" on public.user_roles;
create policy "own roles and student managers readable" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.has_staff_permission(auth.uid(), 'students'));

drop policy if exists "profiles self read" on public.profiles;
create policy "profiles self and permitted staff read" on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or public.has_staff_permission(auth.uid(), 'students')
    or public.has_staff_permission(auth.uid(), 'payments')
    or public.has_staff_permission(auth.uid(), 'communications')
  );
drop policy if exists "staff update profiles" on public.profiles;
create policy "student managers update profiles" on public.profiles for update to authenticated
  using (public.has_staff_permission(auth.uid(), 'students'))
  with check (public.has_staff_permission(auth.uid(), 'students'));

drop policy if exists "subs own read" on public.subscriptions;
create policy "subs own and payments staff read" on public.subscriptions for select to authenticated
  using (
    user_id = auth.uid()
    or public.has_staff_permission(auth.uid(), 'payments')
    or public.has_staff_permission(auth.uid(), 'students')
  );
drop policy if exists "sub events read" on public.subscription_events;
create policy "sub events own and payments staff read" on public.subscription_events for select to authenticated
  using (user_id = auth.uid() or public.has_staff_permission(auth.uid(), 'payments'));
drop policy if exists "pay own read" on public.payment_requests;
create policy "pay own and payments staff read" on public.payment_requests for select to authenticated
  using (user_id = auth.uid() or public.has_staff_permission(auth.uid(), 'payments'));
drop policy if exists "tg own read" on public.telegram_links;
create policy "tg own and student managers read" on public.telegram_links for select to authenticated
  using (user_id = auth.uid() or public.has_staff_permission(auth.uid(), 'students'));
drop policy if exists "deliv read" on public.telegram_deliveries;
create policy "delivery own and staff module read" on public.telegram_deliveries for select to authenticated
  using (
    user_id = auth.uid()
    or public.has_staff_permission(auth.uid(), 'communications')
    or public.has_staff_permission(auth.uid(), 'payments')
  );

drop policy if exists "active departments readable" on public.departments;
create policy "active departments readable" on public.departments for select to anon, authenticated
  using (
    is_active
    or public.has_staff_permission(auth.uid(), 'content')
    or public.has_staff_permission(auth.uid(), 'students')
  );
drop policy if exists "staff insert departments" on public.departments;
create policy "content staff insert departments" on public.departments for insert to authenticated
  with check (public.has_staff_permission(auth.uid(), 'content'));
drop policy if exists "staff update departments" on public.departments;
create policy "content staff update departments" on public.departments for update to authenticated
  using (public.has_staff_permission(auth.uid(), 'content'))
  with check (public.has_staff_permission(auth.uid(), 'content'));

drop policy if exists "subjects staff write" on public.subjects;
create policy "content staff write subjects" on public.subjects for all to authenticated
  using (public.has_staff_permission(auth.uid(), 'content'))
  with check (public.has_staff_permission(auth.uid(), 'content'));
drop policy if exists "lectures staff write" on public.lectures;
create policy "content staff write lectures" on public.lectures for all to authenticated
  using (public.has_staff_permission(auth.uid(), 'content'))
  with check (public.has_staff_permission(auth.uid(), 'content'));
drop policy if exists "lecture resources staff write" on public.lecture_resources;
create policy "content staff write lecture resources" on public.lecture_resources for all to authenticated
  using (public.has_staff_permission(auth.uid(), 'content'))
  with check (public.has_staff_permission(auth.uid(), 'content'));

drop policy if exists "ann staff write" on public.announcements;
create policy "communications staff write announcements" on public.announcements for all to authenticated
  using (public.has_staff_permission(auth.uid(), 'communications'))
  with check (public.has_staff_permission(auth.uid(), 'communications'));
drop policy if exists "ann read" on public.announcements;
create policy "ann read" on public.announcements for select to authenticated
  using (
    public.has_staff_permission(auth.uid(), 'communications')
    or (public.has_access(auth.uid()) and public.matches_content_target(auth.uid(), target_department_ids, target_levels))
  );
drop policy if exists "events staff write" on public.events;
create policy "content staff write events" on public.events for all to authenticated
  using (public.has_staff_permission(auth.uid(), 'content'))
  with check (public.has_staff_permission(auth.uid(), 'content'));
drop policy if exists "events read" on public.events;
create policy "events read" on public.events for select to authenticated
  using (
    public.has_staff_permission(auth.uid(), 'content')
    or (
      public.has_access(auth.uid())
      and public.matches_content_target(auth.uid(), target_department_ids, target_levels)
      and (subject_id is null or public.can_access_subject(auth.uid(), subject_id))
    )
  );
drop policy if exists "notif staff insert" on public.notifications;
create policy "communications staff insert notifications" on public.notifications for insert to authenticated
  with check (public.has_staff_permission(auth.uid(), 'communications'));
drop policy if exists "notif read" on public.notifications;
create policy "notif read" on public.notifications for select to authenticated
  using (
    user_id = auth.uid()
    or (user_id is null and public.has_access(auth.uid()) and public.matches_content_target(auth.uid(), target_department_ids, target_levels))
    or public.has_staff_permission(auth.uid(), 'communications')
  );

drop policy if exists "receipts read" on storage.objects;
create policy "receipts read" on storage.objects for select to authenticated
  using (
    bucket_id = 'receipts'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.has_staff_permission(auth.uid(), 'payments')
    )
  );
drop policy if exists "lectures staff insert" on storage.objects;
create policy "content staff upload lectures" on storage.objects for insert to authenticated
  with check (bucket_id = 'lectures' and public.has_staff_permission(auth.uid(), 'content'));
drop policy if exists "lectures staff delete" on storage.objects;
create policy "content staff delete lectures" on storage.objects for delete to authenticated
  using (bucket_id = 'lectures' and public.has_staff_permission(auth.uid(), 'content'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipts',
  'receipts',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'student-ids',
  'student-ids',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "students upload own pending ID card" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'student-ids'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.registration_status = 'pending'
    )
  );
create policy "student managers view ID cards" on storage.objects for select to authenticated
  using (bucket_id = 'student-ids' and public.has_staff_permission(auth.uid(), 'students'));
create policy "student managers delete ID cards" on storage.objects for delete to authenticated
  using (bucket_id = 'student-ids' and public.has_staff_permission(auth.uid(), 'students'));
