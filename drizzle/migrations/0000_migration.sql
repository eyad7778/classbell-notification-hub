
create type public.app_role as enum ('owner','staff','student');
create type public.subscription_status as enum ('pending','awaiting_payment','active','expired','suspended','rejected');
create type public.payment_request_status as enum ('pending','approved','rejected');
create type public.event_kind as enum ('lecture','exam','assignment','other');

-- profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text not null default '',
  level text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

-- roles
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role public.app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;
create or replace function public.is_staff(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role in ('owner','staff'))
$$;

create policy "own roles readable" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.is_staff(auth.uid()));

create policy "profiles self read" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_staff(auth.uid()));
create policy "profiles self update" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- settings (singleton)
create table public.platform_settings (
  id int primary key default 1 check (id = 1),
  subscription_price numeric(10,2) not null default 0,
  currency text not null default 'جنيه',
  subscription_days int not null default 120,
  payment_methods jsonb not null default '[]'::jsonb,
  payment_instructions text not null default '',
  support_phone text not null default '',
  support_email text not null default '',
  support_telegram text not null default '',
  telegram_bot_username text not null default '',
  about_text text not null default '',
  designer_name text not null default '',
  designer_bio text not null default '',
  designer_contact text not null default '',
  updated_at timestamptz not null default now()
);
grant select on public.platform_settings to anon, authenticated;
grant update on public.platform_settings to authenticated;
grant all on public.platform_settings to service_role;
alter table public.platform_settings enable row level security;
create policy "settings public read" on public.platform_settings for select to anon, authenticated using (true);
create policy "settings owner update" on public.platform_settings for update to authenticated
  using (public.has_role(auth.uid(),'owner')) with check (public.has_role(auth.uid(),'owner'));

insert into public.platform_settings (subscription_price, subscription_days, payment_methods, payment_instructions, about_text, designer_name, designer_bio)
values (150, 120,
 '[{"name":"فودافون كاش","details":"أضف الرقم من لوحة الإدارة"},{"name":"إنستاباي","details":"أضف العنوان من لوحة الإدارة"}]'::jsonb,
 'حوّل قيمة الاشتراك عبر إحدى الطرق المتاحة، ثم أرسل رقم العملية وصورة الإيصال من صفحة الاشتراك. تتم المراجعة يدويًا خلال 24 ساعة.',
 'Smart Campus تطبيق خدمات طلابية مستقل يجمع الإعلانات والمحاضرات والمواعيد في مكان واحد. التطبيق غير تابع رسميًا لإدارة المعهد.',
 'مصمم التطبيق', 'يمكن تعديل هذه النبذة من إعدادات الإدارة.');

-- subscriptions
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  status public.subscription_status not null default 'awaiting_payment',
  start_at timestamptz,
  end_at timestamptz,
  amount numeric(10,2),
  payment_method text,
  payment_reference text,
  activated_by uuid,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.subscriptions to authenticated;
grant all on public.subscriptions to service_role;
alter table public.subscriptions enable row level security;
create policy "subs own read" on public.subscriptions for select to authenticated
  using (user_id = auth.uid() or public.is_staff(auth.uid()));

create table public.subscription_events (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  user_id uuid not null,
  from_status public.subscription_status,
  to_status public.subscription_status not null,
  actor_id uuid,
  note text,
  created_at timestamptz not null default now()
);
grant select on public.subscription_events to authenticated;
grant all on public.subscription_events to service_role;
alter table public.subscription_events enable row level security;
create policy "sub events read" on public.subscription_events for select to authenticated
  using (user_id = auth.uid() or public.is_staff(auth.uid()));

create or replace function public.log_subscription_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.subscription_events (subscription_id, user_id, from_status, to_status, actor_id)
    values (new.id, new.user_id, case when tg_op='UPDATE' then old.status end, new.status, auth.uid());
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger trg_sub_log_ins after insert on public.subscriptions for each row execute function public.log_subscription_change();
create trigger trg_sub_log_upd before update on public.subscriptions for each row execute function public.log_subscription_change();

-- payment requests
create table public.payment_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  amount numeric(10,2) not null,
  method text not null,
  reference text not null,
  receipt_path text,
  status public.payment_request_status not null default 'pending',
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now()
);
grant select, insert on public.payment_requests to authenticated;
grant all on public.payment_requests to service_role;
alter table public.payment_requests enable row level security;
create policy "pay own read" on public.payment_requests for select to authenticated
  using (user_id = auth.uid() or public.is_staff(auth.uid()));
create policy "pay own insert" on public.payment_requests for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending' and reviewed_by is null);

create or replace function public.on_payment_request()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.subscriptions set status = 'pending'
   where user_id = new.user_id and status in ('awaiting_payment','expired','rejected');
  return new;
end $$;
create trigger trg_payment_req after insert on public.payment_requests for each row execute function public.on_payment_request();

-- telegram
create table public.telegram_links (
  user_id uuid primary key,
  telegram_user_id bigint not null unique,
  chat_id bigint not null,
  telegram_username text,
  linked_at timestamptz not null default now(),
  blocked boolean not null default false,
  last_send_status text,
  last_send_at timestamptz
);
grant select on public.telegram_links to authenticated;
grant all on public.telegram_links to service_role;
alter table public.telegram_links enable row level security;
create policy "tg own read" on public.telegram_links for select to authenticated
  using (user_id = auth.uid() or public.is_staff(auth.uid()));

create table public.telegram_link_tokens (
  token_hash text primary key,
  user_id uuid not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
grant all on public.telegram_link_tokens to service_role;
alter table public.telegram_link_tokens enable row level security;

-- access helper
create or replace function public.has_access(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_staff(_user_id) or (
    exists (select 1 from public.subscriptions s where s.user_id=_user_id and s.status='active' and (s.end_at is null or s.end_at > now()))
    and exists (select 1 from public.telegram_links t where t.user_id=_user_id)
  )
$$;

-- content
create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text,
  description text,
  level text,
  term text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create table public.lectures (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  title text not null,
  description text,
  week int,
  file_path text,
  external_url text,
  created_at timestamptz not null default now()
);
create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  category text not null default 'عام',
  pinned boolean not null default false,
  published_at timestamptz not null default now(),
  created_by uuid
);
create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  kind public.event_kind not null default 'other',
  subject_id uuid references public.subjects(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  notes text,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.subjects, public.lectures, public.announcements, public.events to authenticated;
grant all on public.subjects, public.lectures, public.announcements, public.events to service_role;
alter table public.subjects enable row level security;
alter table public.lectures enable row level security;
alter table public.announcements enable row level security;
alter table public.events enable row level security;

create policy "subjects read" on public.subjects for select to authenticated using (public.has_access(auth.uid()));
create policy "subjects staff write" on public.subjects for all to authenticated using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
create policy "lectures read" on public.lectures for select to authenticated using (public.has_access(auth.uid()));
create policy "lectures staff write" on public.lectures for all to authenticated using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
create policy "ann read" on public.announcements for select to authenticated using (public.has_access(auth.uid()));
create policy "ann staff write" on public.announcements for all to authenticated using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
create policy "events read" on public.events for select to authenticated using (public.has_access(auth.uid()));
create policy "events staff write" on public.events for all to authenticated using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

-- notifications
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  title text not null,
  body text not null,
  link text,
  created_by uuid,
  created_at timestamptz not null default now()
);
grant select, insert on public.notifications to authenticated;
grant all on public.notifications to service_role;
alter table public.notifications enable row level security;
create policy "notif read" on public.notifications for select to authenticated
  using (user_id = auth.uid() or (user_id is null and public.has_access(auth.uid())) or public.is_staff(auth.uid()));
create policy "notif staff insert" on public.notifications for insert to authenticated with check (public.is_staff(auth.uid()));

create table public.notification_reads (
  user_id uuid not null default auth.uid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (user_id, notification_id)
);
grant select, insert on public.notification_reads to authenticated;
grant all on public.notification_reads to service_role;
alter table public.notification_reads enable row level security;
create policy "reads own" on public.notification_reads for select to authenticated using (user_id = auth.uid());
create policy "reads own insert" on public.notification_reads for insert to authenticated with check (user_id = auth.uid());

create table public.telegram_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  notification_id uuid references public.notifications(id) on delete set null,
  status text not null,
  error text,
  created_at timestamptz not null default now()
);
grant select on public.telegram_deliveries to authenticated;
grant all on public.telegram_deliveries to service_role;
alter table public.telegram_deliveries enable row level security;
create policy "deliv read" on public.telegram_deliveries for select to authenticated
  using (user_id = auth.uid() or public.is_staff(auth.uid()));

-- signup trigger
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''), coalesce(new.raw_user_meta_data->>'phone',''));
  if not exists (select 1 from public.user_roles where role = 'owner') then
    insert into public.user_roles (user_id, role) values (new.id, 'owner');
  else
    insert into public.user_roles (user_id, role) values (new.id, 'student');
  end if;
  insert into public.subscriptions (user_id, status) values (new.id, 'awaiting_payment');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- seed
with s as (
  insert into public.subjects (name, code, description, level, term, sort_order) values
  ('برمجة 1','CS101','أساسيات البرمجة والتفكير الخوارزمي','الفرقة الأولى','الترم الأول',1),
  ('مقدمة في نظم المعلومات','IS101','مفاهيم نظم المعلومات ودورها في المؤسسات','الفرقة الأولى','الترم الأول',2),
  ('مبادئ الإدارة','BA101','أساسيات الإدارة والتخطيط والتنظيم','الفرقة الأولى','الترم الأول',3)
  returning id, code
)
insert into public.lectures (subject_id, title, description, week)
select id, 'المحاضرة الأولى — مقدمة', 'ملف تجريبي يمكن استبداله من لوحة الإدارة', 1 from s;

insert into public.announcements (title, body, category, pinned) values
('مرحبًا بكم في Smart Campus','هذا إعلان تجريبي. يمكن للإدارة نشر الإعلانات وتعديلها من لوحة التحكم.','عام',true),
('موعد تسليم التكليف الأول','إعلان تجريبي عن موعد تسليم تكليف مادة برمجة 1.','تكليفات',false);

insert into public.events (title, kind, starts_at, location) values
('محاضرة برمجة 1','lecture', now() + interval '2 days','قاعة 3'),
('امتحان منتصف الترم — نظم المعلومات','exam', now() + interval '20 days','المدرج الرئيسي');
