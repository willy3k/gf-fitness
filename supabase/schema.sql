-- =====================================================================
-- Academia: pré-agendamento + controle de mensalidades
-- Rode este arquivo inteiro no SQL Editor do Supabase (uma vez).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Equipe (quem pode acessar o painel). Cadastro público de usuários
-- NÃO dá acesso: só entra quem estiver nesta tabela.
-- ---------------------------------------------------------------------
create table if not exists staff (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  nome       text,
  papel      text not null default 'recepcao' check (papel in ('admin', 'recepcao')),
  created_at timestamptz not null default now()
);

create or replace function is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.staff where user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------
-- Leads do pré-agendamento
-- ---------------------------------------------------------------------
create table if not exists leads (
  id             uuid primary key default gen_random_uuid(),
  nome           text not null check (char_length(nome) between 2 and 120),
  whatsapp       text not null unique check (whatsapp ~ '^[0-9]{10,11}$'),
  email          text check (email is null or char_length(email) <= 160),
  dia_preferido  date,
  periodo        text check (periodo in ('manha', 'tarde', 'noite')),
  objetivo       text check (char_length(objetivo) <= 60),
  consentimento  boolean not null check (consentimento = true),
  status         text not null default 'novo'
                 check (status in ('novo', 'contatado', 'confirmado', 'compareceu')),
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Alunos
-- ---------------------------------------------------------------------
create table if not exists alunos (
  id                 uuid primary key default gen_random_uuid(),
  nome               text not null check (char_length(nome) between 2 and 120),
  cpf                char(11) not null unique check (cpf ~ '^[0-9]{11}$'),
  whatsapp           text,
  email              text,
  status             text not null default 'ativo' check (status in ('ativo', 'inativo')),
  valor_mensalidade  numeric(10,2) not null check (valor_mensalidade > 0),
  vencimento         date not null,
  tolerancia_dias    int not null default 0 check (tolerancia_dias between 0 and 15),
  mp_preapproval_id  text,
  created_at         timestamptz not null default now()
);

-- "Em dia" = cadastro ativo e vencimento (+ tolerância) não passou.
-- Fuso fixo de Recife para não virar o dia errado às 21h.
create or replace view alunos_situacao
with (security_invoker = true) as
select
  a.*,
  (
    a.status = 'ativo'
    and a.vencimento + a.tolerancia_dias >= (now() at time zone 'America/Recife')::date
  ) as em_dia
from alunos a;

-- ---------------------------------------------------------------------
-- Pagamentos e registro de acessos
-- ---------------------------------------------------------------------
create table if not exists pagamentos (
  id             uuid primary key default gen_random_uuid(),
  aluno_id       uuid not null references alunos(id) on delete cascade,
  valor          numeric(10,2) not null,
  metodo         text not null check (metodo in ('pix', 'cartao', 'dinheiro')),
  status         text not null default 'pendente'
                 check (status in ('pendente', 'aprovado', 'recusado', 'cancelado')),
  mp_payment_id  text unique,
  pago_em        timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists pagamentos_aluno_idx on pagamentos(aluno_id, created_at desc);

create table if not exists acessos (
  id          uuid primary key default gen_random_uuid(),
  aluno_id    uuid not null references alunos(id) on delete cascade,
  liberado    boolean not null,
  por         uuid default auth.uid(),
  created_at  timestamptz not null default now()
);
create index if not exists acessos_aluno_idx on acessos(aluno_id, created_at desc);

-- ---------------------------------------------------------------------
-- Funções de pagamento
-- ---------------------------------------------------------------------

-- Confirma um pagamento e renova o vencimento em 1 mês.
-- Idempotente: se o mesmo pagamento chegar duas vezes (webhook repetido),
-- só a primeira renova. Só o service_role (Edge Function) pode chamar.
create or replace function confirmar_pagamento(
  p_mp_payment_id text,
  p_aluno         uuid,
  p_valor         numeric,
  p_metodo        text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_hoje date := (now() at time zone 'America/Recife')::date;
begin
  if not exists (select 1 from alunos where id = p_aluno) then
    raise exception 'Aluno % não existe', p_aluno;
  end if;

  insert into pagamentos (aluno_id, valor, metodo, status, mp_payment_id, pago_em)
  values (p_aluno, p_valor, p_metodo, 'aprovado', p_mp_payment_id, now())
  on conflict (mp_payment_id) do update
    set status = 'aprovado',
        valor = excluded.valor,
        metodo = excluded.metodo,
        pago_em = now()
    where pagamentos.status <> 'aprovado'
  returning id into v_id;

  if v_id is null then
    return false; -- já processado antes
  end if;

  update alunos
     set status = 'ativo',
         vencimento = (greatest(vencimento, v_hoje) + interval '1 month')::date
   where id = p_aluno;

  return true;
end;
$$;

revoke all on function confirmar_pagamento(text, uuid, numeric, text) from public, anon, authenticated;
grant execute on function confirmar_pagamento(text, uuid, numeric, text) to service_role;

-- Pagamento em dinheiro/balcão, registrado pela equipe.
create or replace function registrar_pagamento_manual(p_aluno uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_valor numeric;
begin
  if not is_staff() then
    raise exception 'Não autorizado';
  end if;

  select valor_mensalidade into v_valor from alunos where id = p_aluno;
  if v_valor is null then
    raise exception 'Aluno não encontrado';
  end if;

  perform confirmar_pagamento('manual-' || gen_random_uuid()::text, p_aluno, v_valor, 'dinheiro');
end;
$$;

-- ---------------------------------------------------------------------
-- Segurança por linha (RLS)
-- ---------------------------------------------------------------------
alter table staff       enable row level security;
alter table leads       enable row level security;
alter table alunos      enable row level security;
alter table pagamentos  enable row level security;
alter table acessos     enable row level security;

-- staff: cada um enxerga só o próprio registro; gestão é feita pelo SQL Editor.
drop policy if exists staff_self on staff;
create policy staff_self on staff for select to authenticated using (user_id = auth.uid());

-- leads: qualquer visitante pode se cadastrar (só como 'novo'); só a equipe lê/edita.
drop policy if exists leads_insert_publico on leads;
create policy leads_insert_publico on leads
  for insert to anon, authenticated
  with check (consentimento = true and status = 'novo');

drop policy if exists leads_staff on leads;
create policy leads_staff on leads
  for all to authenticated using (is_staff()) with check (is_staff());

-- alunos / pagamentos / acessos: só equipe.
drop policy if exists alunos_staff on alunos;
create policy alunos_staff on alunos
  for all to authenticated using (is_staff()) with check (is_staff());

drop policy if exists pagamentos_staff_select on pagamentos;
create policy pagamentos_staff_select on pagamentos
  for select to authenticated using (is_staff());

drop policy if exists acessos_staff on acessos;
create policy acessos_staff on acessos
  for all to authenticated using (is_staff()) with check (is_staff());

-- ---------------------------------------------------------------------
-- Privilégios (necessários além das policies de RLS)
-- ---------------------------------------------------------------------
grant usage on schema public to anon, authenticated;

grant insert on table public.leads to anon, authenticated;
grant select, update, delete on table public.leads to authenticated;

grant select on table public.staff to authenticated;
grant select on table public.alunos_situacao to authenticated;
grant select, insert, update, delete on table public.alunos to authenticated;
grant select on table public.pagamentos to authenticated;
grant select, insert, update, delete on table public.acessos to authenticated;

-- ---------------------------------------------------------------------
-- Depois de criar seu usuário em Authentication > Users, cadastre-o na equipe:
--
--   insert into staff (user_id, nome, papel)
--   select id, 'Seu Nome', 'admin' from auth.users where email = 'seu@email.com';
-- ---------------------------------------------------------------------
