create table public.telegram_group_config (
  id smallint primary key default 1 check (id = 1),
  chat_id text not null,
  chat_title text,
  configured_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.telegram_group_config enable row level security;
grant all on public.telegram_group_config to service_role;
