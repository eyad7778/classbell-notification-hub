create table public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 100),
  description text not null default '',
  price numeric(10,2) not null check (price >= 0),
  duration_days integer not null check (duration_days between 1 and 3650),
  features text[] not null default '{}',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.touch_subscription_plan_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

create trigger trg_subscription_plans_updated_at
before update on public.subscription_plans
for each row execute function public.touch_subscription_plan_updated_at();

insert into public.subscription_plans (name, description, price, duration_days, sort_order)
select
  'الباقة السنوية',
  'الباقة الحالية، تم نقل سعرها من إعدادات الاشتراك الحالية.',
  subscription_price,
  365,
  0
from public.platform_settings
where id = 1
on conflict do nothing;

alter table public.subscriptions
  add column if not exists plan_id uuid references public.subscription_plans(id) on delete set null;

alter table public.payment_requests
  add column if not exists plan_id uuid references public.subscription_plans(id) on delete set null,
  add column if not exists plan_name_snapshot text,
  add column if not exists plan_duration_days_snapshot integer;

update public.subscriptions s
set plan_id = p.id
from public.subscription_plans p
where s.plan_id is null and p.name = 'الباقة السنوية';

update public.payment_requests r
set plan_id = p.id,
    plan_name_snapshot = p.name,
    plan_duration_days_snapshot = p.duration_days
from public.subscription_plans p
where r.plan_id is null and p.name = 'الباقة السنوية';

drop policy if exists "pay own insert" on public.payment_requests;
revoke insert on public.payment_requests from authenticated;

create table public.subscription_periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_id uuid references public.subscription_plans(id) on delete set null,
  payment_request_id uuid unique references public.payment_requests(id) on delete set null,
  plan_name text not null,
  duration_days integer not null check (duration_days between 1 and 3650),
  amount numeric(10,2) not null check (amount >= 0),
  status public.subscription_status not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  created_at timestamptz not null default now()
);

insert into public.subscription_periods (
  user_id, plan_id, plan_name, duration_days, amount, status, start_at, end_at
)
select
  s.user_id,
  s.plan_id,
  coalesce(p.name, 'اشتراك سابق'),
  greatest(1, ceil(extract(epoch from (s.end_at - s.start_at)) / 86400)::integer),
  coalesce(s.amount, 0),
  s.status,
  s.start_at,
  s.end_at
from public.subscriptions s
left join public.subscription_plans p on p.id = s.plan_id
where s.start_at is not null and s.end_at is not null;

create index subscription_plans_active_order_idx
  on public.subscription_plans (is_active, sort_order, created_at);
create index subscription_periods_user_created_idx
  on public.subscription_periods (user_id, created_at desc);

alter table public.subscription_plans enable row level security;
alter table public.subscription_periods enable row level security;
grant select on public.subscription_plans to authenticated;
grant all on public.subscription_plans to service_role;
grant select on public.subscription_periods to authenticated;
grant all on public.subscription_periods to service_role;

drop policy if exists "subscription plans active read" on public.subscription_plans;
create policy "subscription plans active read" on public.subscription_plans
  for select to authenticated
  using (is_active or public.is_staff(auth.uid()));

drop policy if exists "subscription periods own and payment staff read" on public.subscription_periods;
create policy "subscription periods own and payment staff read" on public.subscription_periods
  for select to authenticated
  using (user_id = auth.uid() or public.has_staff_permission(auth.uid(), 'payments'));

create or replace function public.create_plan_payment_request(
  _user_id uuid,
  _plan_id uuid,
  _method text,
  _reference text,
  _receipt_path text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _plan public.subscription_plans%rowtype;
  _profile public.profiles%rowtype;
  _subscription public.subscriptions%rowtype;
  _payment_request_id uuid;
begin
  select * into _profile
  from public.profiles
  where id = _user_id
  for update;
  if not found or _profile.registration_status <> 'active' then
    raise exception 'Account is not active';
  end if;

  select * into _plan
  from public.subscription_plans
  where id = _plan_id and is_active;
  if not found then
    raise exception 'Subscription plan is not available';
  end if;

  if not exists (
    select 1
    from public.platform_settings s
    cross join lateral jsonb_array_elements(s.payment_methods) as methods(value)
    where s.id = 1 and methods.value->>'name' = _method
  ) then
    raise exception 'Payment method is not available';
  end if;

  select * into _subscription
  from public.subscriptions
  where user_id = _user_id;
  if _subscription.status = 'active'
    and (_subscription.end_at is null or _subscription.end_at > now()) then
    raise exception 'Subscription is already active';
  end if;

  if exists (
    select 1 from public.payment_requests
    where user_id = _user_id and status = 'pending'
  ) then
    raise exception 'A payment request is already pending';
  end if;

  insert into public.payment_requests (
    user_id, amount, method, reference, receipt_path, plan_id,
    plan_name_snapshot, plan_duration_days_snapshot
  )
  values (
    _user_id, _plan.price, _method, _reference, _receipt_path, _plan.id,
    _plan.name, _plan.duration_days
  )
  returning id into _payment_request_id;

  return _payment_request_id;
end
$$;

revoke all on function public.create_plan_payment_request(uuid, uuid, text, text, text) from public;
revoke all on function public.create_plan_payment_request(uuid, uuid, text, text, text) from authenticated;
grant execute on function public.create_plan_payment_request(uuid, uuid, text, text, text) to service_role;

alter table public.notifications
  add column if not exists dedupe_key text unique;

create or replace function public.review_subscription_payment(
  _payment_request_id uuid,
  _approve boolean,
  _reviewed_by uuid,
  _note text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _request public.payment_requests%rowtype;
  _plan public.subscription_plans%rowtype;
  _subscription public.subscriptions%rowtype;
  _now timestamptz := now();
  _start_at timestamptz;
  _end_at timestamptz;
  _plan_name text;
  _duration integer;
begin
  select * into _request
  from public.payment_requests
  where id = _payment_request_id
  for update;

  if not found then
    raise exception 'Payment request not found';
  end if;
  if _request.status <> 'pending' then
    raise exception 'Payment request has already been reviewed';
  end if;

  if _request.plan_id is not null then
    select * into _plan
    from public.subscription_plans
    where id = _request.plan_id;
  end if;
  _plan_name := coalesce(_request.plan_name_snapshot, _plan.name, 'الاشتراك السابق');
  _duration := coalesce(_request.plan_duration_days_snapshot, _plan.duration_days, 365);

  if _approve then
    select * into _subscription
    from public.subscriptions
    where user_id = _request.user_id
    for update;

    _start_at := case
      when _subscription.status = 'active'
        and _subscription.end_at is not null
        and _subscription.end_at > _now then _subscription.end_at
      else _now
    end;
    _end_at := _start_at + make_interval(days => _duration);

    update public.payment_requests
    set status = 'approved',
        reviewed_by = _reviewed_by,
        reviewed_at = _now,
        review_note = _note
    where id = _payment_request_id;

    insert into public.subscription_periods (
      user_id, plan_id, payment_request_id, plan_name, duration_days,
      amount, status, start_at, end_at
    )
    values (
      _request.user_id, _request.plan_id, _request.id, _plan_name, _duration,
      _request.amount, 'active', _start_at, _end_at
    );

    insert into public.subscriptions (
      user_id, plan_id, status, start_at, end_at, amount, payment_method,
      payment_reference, activated_by, activated_at
    )
    values (
      _request.user_id, _request.plan_id, 'active', _start_at, _end_at,
      _request.amount, _request.method, _request.reference, _reviewed_by, _now
    )
    on conflict (user_id) do update
    set plan_id = excluded.plan_id,
        status = excluded.status,
        start_at = excluded.start_at,
        end_at = excluded.end_at,
        amount = excluded.amount,
        payment_method = excluded.payment_method,
        payment_reference = excluded.payment_reference,
        activated_by = excluded.activated_by,
        activated_at = excluded.activated_at;

    update public.subscription_events
    set actor_id = _reviewed_by,
        note = _note
    where id = (
      select id
      from public.subscription_events
      where user_id = _request.user_id and actor_id is null
        and created_at >= _now
      order by created_at desc
      limit 1
    );
  else
    update public.payment_requests
    set status = 'rejected',
        reviewed_by = _reviewed_by,
        reviewed_at = _now,
        review_note = _note
    where id = _payment_request_id;

    update public.subscriptions
    set status = 'rejected'
    where user_id = _request.user_id and status = 'pending';

    update public.subscription_events
    set actor_id = _reviewed_by,
        note = _note
    where id = (
      select id
      from public.subscription_events
      where user_id = _request.user_id and actor_id is null
        and created_at >= _now
      order by created_at desc
      limit 1
    );
  end if;

  return jsonb_build_object(
    'user_id', _request.user_id,
    'plan_name', _plan_name,
    'start_at', _start_at,
    'end_at', _end_at,
    'receipt_path', _request.receipt_path,
    'approved', _approve
  );
end
$$;

revoke all on function public.review_subscription_payment(uuid, boolean, uuid, text) from public;
revoke all on function public.review_subscription_payment(uuid, boolean, uuid, text) from authenticated;
grant execute on function public.review_subscription_payment(uuid, boolean, uuid, text) to service_role;

delete from public.notifications;
delete from public.announcements;
