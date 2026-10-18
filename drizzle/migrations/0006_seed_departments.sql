insert into public.departments (name, description) values
('نظم المعلومات الإدارية','قسم افتراضي — يمكن تعديله من لوحة الإدارة'),
('المحاسبة','قسم افتراضي — يمكن تعديله من لوحة الإدارة')
on conflict (name) do nothing;