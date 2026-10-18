update public.user_roles set role = 'student'
where role = 'owner' and user_id in (select id from public.profiles where phone = '01099990001');