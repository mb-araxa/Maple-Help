-- Migration: chamado_chat
-- Adiciona suporte a chat interno por chamado, fonte única de administradores (public.app_admins),
-- saneamento rigoroso de RLS em public.chamados e controle de leitura.

begin;

-- 1. Fonte única de administradores: public.app_admins
create table if not exists public.app_admins (
  email text primary key check (email = lower(trim(email))),
  created_at timestamptz not null default now()
);

-- Popula administradores autorizados com e-mails normalizados em minúsculas
insert into public.app_admins (email) values
  ('isaque.santos@maplebeararaxa.com.br'),
  ('jose.reis@maplebeararaxa.com.br'),
  ('pedro.ashidani@maplebeararaxa.com.br')
on conflict (email) do nothing;

alter table public.app_admins enable row level security;
revoke all on table public.app_admins from public, anon;
grant select on table public.app_admins to authenticated, service_role;

drop policy if exists "app_admins_select_own" on public.app_admins;
create policy "app_admins_select_own" on public.app_admins
  for select to authenticated
  using (email = lower(coalesce(auth.jwt() ->> 'email', '')));


-- 2. Função de autorização administrativa is_admin()
create or replace function public.is_admin()
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.app_admins
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;


-- 3. Saneamento e Auditoria de RLS em public.chamados
drop policy if exists "Permitir atualização para usuários logados" on public.chamados;
drop policy if exists "Permitir exclusão para usuários logados" on public.chamados;
drop policy if exists "Permitir leitura de chamados para usuários logados" on public.chamados;
drop policy if exists "Permitir inserção apenas para usuários logados" on public.chamados;
drop policy if exists "Professores podem abrir chamados" on public.chamados;
drop policy if exists "Apenas os 3 Admins podem gerenciar chamados" on public.chamados;
drop policy if exists "chamados_select" on public.chamados;
drop policy if exists "chamados_insert" on public.chamados;
drop policy if exists "chamados_update" on public.chamados;
drop policy if exists "chamados_delete" on public.chamados;

revoke all on table public.chamados from anon;
grant select, insert, update, delete on table public.chamados to authenticated, service_role;

create policy "chamados_select" on public.chamados
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy "chamados_insert" on public.chamados
  for insert to authenticated
  with check (user_id = auth.uid() or public.is_admin());

create policy "chamados_update" on public.chamados
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "chamados_delete" on public.chamados
  for delete to authenticated
  using (public.is_admin());


-- 4. Tabela de mensagens: public.chamado_mensagens
create table if not exists public.chamado_mensagens (
  id uuid primary key default gen_random_uuid(),
  chamado_id uuid not null references public.chamados(id) on delete cascade,
  autor_id uuid references auth.users(id) on delete set null,
  autor_nome text not null,
  autor_tipo text not null check (autor_tipo in ('usuario', 'ti')),
  mensagem text not null check (char_length(trim(mensagem)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists idx_chamado_mensagens_cursor 
  on public.chamado_mensagens (chamado_id, created_at asc, id asc);

revoke all on table public.chamado_mensagens from public, anon;
grant select, insert on table public.chamado_mensagens to authenticated, service_role;

alter table public.chamado_mensagens enable row level security;


-- 5. Trigger de Identidade Segura em public.chamado_mensagens
create or replace function public.fn_chamado_mensagens_identidade()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_is_admin boolean;
  v_solicitante text;
begin
  v_is_admin := public.is_admin();
  NEW.autor_id := auth.uid();
  
  if v_is_admin then
    NEW.autor_tipo := 'ti';
    NEW.autor_nome := 'Equipe de TI';
  else
    NEW.autor_tipo := 'usuario';
    select solicitante into v_solicitante from public.chamados where id = NEW.chamado_id;
    NEW.autor_nome := coalesce(nullif(trim(NEW.autor_nome), ''), v_solicitante, 'Usuário');
  end if;
  
  return NEW;
end;
$$;

drop trigger if exists trg_chamado_mensagens_identidade on public.chamado_mensagens;
create trigger trg_chamado_mensagens_identidade
  before insert on public.chamado_mensagens
  for each row
  execute function public.fn_chamado_mensagens_identidade();


-- 6. Políticas RLS em public.chamado_mensagens
drop policy if exists "chamado_mensagens_select" on public.chamado_mensagens;
create policy "chamado_mensagens_select" on public.chamado_mensagens
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.chamados c
      where c.id = chamado_mensagens.chamado_id
        and c.user_id = auth.uid()
    )
  );

drop policy if exists "chamado_mensagens_insert" on public.chamado_mensagens;
create policy "chamado_mensagens_insert" on public.chamado_mensagens
  for insert to authenticated
  with check (
    autor_id = auth.uid()
    and (
      (
        autor_tipo = 'usuario'
        and exists (
          select 1 from public.chamados c
          where c.id = chamado_mensagens.chamado_id
            and c.user_id = auth.uid()
            and c.status in ('Pendente', 'Em Andamento')
        )
      )
      or (
        autor_tipo = 'ti'
        and public.is_admin()
        and exists (
          select 1 from public.chamados c
          where c.id = chamado_mensagens.chamado_id
            and c.status in ('Pendente', 'Em Andamento')
        )
      )
    )
  );


-- 7. Tabela de controle de leituras: public.chamado_chat_leituras
create table if not exists public.chamado_chat_leituras (
  chamado_id uuid not null references public.chamados(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (chamado_id, user_id)
);

create index if not exists idx_chamado_chat_leituras_user_chamado
  on public.chamado_chat_leituras (user_id, chamado_id);

revoke all on table public.chamado_chat_leituras from public, anon;
grant select, insert, update on table public.chamado_chat_leituras to authenticated, service_role;

alter table public.chamado_chat_leituras enable row level security;

drop policy if exists "chamado_chat_leituras_select" on public.chamado_chat_leituras;
create policy "chamado_chat_leituras_select" on public.chamado_chat_leituras
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "chamado_chat_leituras_insert" on public.chamado_chat_leituras;
create policy "chamado_chat_leituras_insert" on public.chamado_chat_leituras
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and (
      public.is_admin()
      or exists (
        select 1 from public.chamados c
        where c.id = chamado_chat_leituras.chamado_id
          and c.user_id = auth.uid()
      )
    )
  );

drop policy if exists "chamado_chat_leituras_update" on public.chamado_chat_leituras;
create policy "chamado_chat_leituras_update" on public.chamado_chat_leituras
  for update to authenticated
  using (
    user_id = auth.uid()
    and (
      public.is_admin()
      or exists (
        select 1 from public.chamados c
        where c.id = chamado_chat_leituras.chamado_id
          and c.user_id = auth.uid()
      )
    )
  )
  with check (
    user_id = auth.uid()
    and (
      public.is_admin()
      or exists (
        select 1 from public.chamados c
        where c.id = chamado_chat_leituras.chamado_id
          and c.user_id = auth.uid()
      )
    )
  );


-- 8. Publicação Realtime
alter publication supabase_realtime add table public.chamado_mensagens;

commit;
