
create policy "receipts own upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "receipts read" on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_staff(auth.uid())));
create policy "lectures read" on storage.objects for select to authenticated
  using (bucket_id = 'lectures' and public.has_access(auth.uid()));
create policy "lectures staff insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'lectures' and public.is_staff(auth.uid()));
create policy "lectures staff delete" on storage.objects for delete to authenticated
  using (bucket_id = 'lectures' and public.is_staff(auth.uid()));

-- profile self-insert not needed; students can't change their phone (identity)
create or replace function public.protect_profile_phone()
returns trigger language plpgsql as $$
begin
  if new.phone is distinct from old.phone and not public.is_staff(auth.uid()) then
    new.phone := old.phone;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger trg_profile_protect before update on public.profiles for each row execute function public.protect_profile_phone();

-- effective status (expired derived from end_at)
create or replace function public.effective_status(_s public.subscriptions)
returns public.subscription_status language sql stable as $$
  select case when _s.status = 'active' and _s.end_at is not null and _s.end_at <= now() then 'expired'::public.subscription_status else _s.status end
$$;
