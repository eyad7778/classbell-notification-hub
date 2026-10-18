create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;
grant select, insert, delete on public.push_subscriptions to authenticated;
grant all on public.push_subscriptions to service_role;

create policy "push subscriptions own select" on public.push_subscriptions
  for select to authenticated using (user_id = auth.uid());
create policy "push subscriptions own insert" on public.push_subscriptions
  for insert to authenticated with check (user_id = auth.uid());
create policy "push subscriptions own delete" on public.push_subscriptions
  for delete to authenticated using (user_id = auth.uid());

create index push_subscriptions_user_id_idx on public.push_subscriptions(user_id);
