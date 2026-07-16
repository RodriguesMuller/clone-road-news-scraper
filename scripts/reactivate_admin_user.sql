-- Execute no Supabase SQL Editor caso seu usuario admin tenha sido inativado.
-- Este script nao altera secrets e nao cria senha; ele apenas reativa o perfil
-- vinculado ao usuario existente no Supabase Auth.

with target_user as (
  select id, email
  from auth.users
  where lower(email) = lower('matheusmullercontato@gmail.com')
  limit 1
)
insert into public.profiles (
  id,
  email,
  full_name,
  role,
  status,
  company_name
)
select
  id,
  email,
  'Matheus Muller',
  'admin',
  'active',
  'Overhaul'
from target_user
on conflict (id) do update set
  email = excluded.email,
  full_name = coalesce(public.profiles.full_name, excluded.full_name),
  role = 'admin',
  status = 'active',
  company_name = coalesce(public.profiles.company_name, excluded.company_name),
  updated_at = now();

select
  email,
  role,
  status,
  updated_at
from public.profiles
where lower(email) = lower('matheusmullercontato@gmail.com');
