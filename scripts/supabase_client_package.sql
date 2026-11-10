-- Pacote do cliente: os usuários herdam recursos e limites do pacote configurado no cliente
-- (o consumo continua sendo de cada usuário). Idempotente.
alter table public.clients
  add column if not exists package_id uuid references public.packages(id) on delete set null;

create index if not exists clients_package_id_idx on public.clients(package_id);
