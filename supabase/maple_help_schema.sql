begin;

-- 1. Fonte única de administradores: public.app_admins
create table if not exists public.app_admins (
  email text primary key check (email = lower(trim(email))),
  created_at timestamptz not null default now()
);

insert into public.app_admins (email) values
  ('isaque.santos@maplebeararaxa.com.br'),
  ('jose.reis@maplebeararaxa.com.br'),
  ('pedro.ashidani@maplebeararaxa.com.br')
on conflict (email) do nothing;

alter table public.app_admins enable row level security;
revoke all on table public.app_admins from public, anon, authenticated;
grant select on table public.app_admins to authenticated;
grant all on table public.app_admins to service_role;

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


-- 3. Tabela principal de chamados
create table if not exists public.chamados (
  id uuid not null default gen_random_uuid(),
  solicitante text not null,
  local text not null,
  categoria text not null,
  descricao text not null,
  status text default 'Pendente'::text,
  resolucao text,
  data_criacao timestamp with time zone not null default timezone('utc'::text, now()),
  data_resolucao timestamp with time zone,
  responsavel text,
  tempo_gasto text,
  anexo_url text,
  user_id uuid default auth.uid(),
  constraint chamados_pkey primary key (id)
);

alter table public.chamados enable row level security;
revoke all on table public.chamados from anon, authenticated;
grant select, insert, update, delete on table public.chamados to authenticated;
grant all on table public.chamados to service_role;

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


-- 4. Avaliação única feita pelo solicitante após a conclusão do chamado
create table if not exists public.chamado_avaliacoes (
  id uuid not null default gen_random_uuid(),
  chamado_id uuid not null,
  user_id uuid not null,
  nota smallint not null,
  comentario text,
  created_at timestamp with time zone not null default now(),
  constraint chamado_avaliacoes_pkey primary key (id),
  constraint chamado_avaliacoes_chamado_id_key unique (chamado_id),
  constraint chamado_avaliacoes_chamado_id_fkey
    foreign key (chamado_id) references public.chamados(id) on delete cascade,
  constraint chamado_avaliacoes_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete cascade,
  constraint chamado_avaliacoes_nota_check
    check (nota >= 1 and nota <= 5),
  constraint chamado_avaliacoes_comentario_check
    check (comentario is null or char_length(comentario) <= 500)
);

alter table public.chamado_avaliacoes enable row level security;
revoke all on table public.chamado_avaliacoes from anon;
grant select, insert on table public.chamado_avaliacoes to authenticated, service_role;

create policy "Solicitante le a propria avaliacao"
  on public.chamado_avaliacoes
  for select to authenticated
  using (user_id = auth.uid());

create policy "Solicitante avalia chamado concluido proprio"
  on public.chamado_avaliacoes
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.chamados
      where chamados.id = chamado_avaliacoes.chamado_id
        and chamados.user_id = auth.uid()
        and chamados.status = 'Concluído'::text
    )
  );


-- 5. Tabela de mensagens do chat: public.chamado_mensagens
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

revoke all on table public.chamado_mensagens from public, anon, authenticated;
grant select, insert on table public.chamado_mensagens to authenticated;
grant all on table public.chamado_mensagens to service_role;

alter table public.chamado_mensagens enable row level security;

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
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  NEW.autor_id := auth.uid();
  v_is_admin := public.is_admin();
  
  if v_is_admin then
    NEW.autor_tipo := 'ti';
    NEW.autor_nome := 'Equipe de TI';
  else
    NEW.autor_tipo := 'usuario';
    select solicitante into v_solicitante from public.chamados where id = NEW.chamado_id;
    NEW.autor_nome := coalesce(nullif(trim(v_solicitante), ''), 'Usuário');
  end if;
  
  return NEW;
end;
$$;

drop trigger if exists trg_chamado_mensagens_identidade on public.chamado_mensagens;
create trigger trg_chamado_mensagens_identidade
  before insert on public.chamado_mensagens
  for each row
  execute function public.fn_chamado_mensagens_identidade();

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


-- 6. Tabela de controle de leituras: public.chamado_chat_leituras
create table if not exists public.chamado_chat_leituras (
  chamado_id uuid not null references public.chamados(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (chamado_id, user_id)
);

create index if not exists idx_chamado_chat_leituras_user_chamado
  on public.chamado_chat_leituras (user_id, chamado_id);

revoke all on table public.chamado_chat_leituras from public, anon, authenticated;
grant select, insert, update on table public.chamado_chat_leituras to authenticated;
grant all on table public.chamado_chat_leituras to service_role;

alter table public.chamado_chat_leituras enable row level security;

create policy "chamado_chat_leituras_select" on public.chamado_chat_leituras
  for select to authenticated
  using (user_id = auth.uid());

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


-- 7. Bucket de anexos e sua política
insert into storage.buckets (
  id,
  name,
  owner,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'chamados-anexos',
  'chamados-anexos',
  null,
  true,
  null,
  null
)
on conflict (id) do nothing;

create policy "Permitir Upload 1tdrie1_1"
  on storage.objects
  as permissive
  for insert
  to authenticated
  with check (bucket_id = 'chamados-anexos'::text);


-- 8. Validação de domínio institucional no cadastro do Supabase Auth
create or replace function public.check_email_domain()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if split_part(new.email, '@', 2) != 'maplebeararaxa.com.br' then
    raise exception 'Apenas e-mails do domínio maplebeararaxa.com.br são permitidos.';
  end if;
  return new;
end;
$function$;

create or replace function public.validar_dominio_maple()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if new.email not like '%@maplebeararaxa.com.br' then
    raise exception 'Acesso negado: Apenas e-mails corporativos @maplebeararaxa.com.br são permitidos.';
  end if;
  return new;
end;
$function$;

revoke execute on function public.check_email_domain()
  from public, anon, authenticated, service_role;
revoke execute on function public.validar_dominio_maple()
  from public, anon, authenticated, service_role;
grant execute on function public.check_email_domain()
  to supabase_auth_admin;
grant execute on function public.validar_dominio_maple()
  to supabase_auth_admin;

drop trigger if exists ensure_allowed_domain on auth.users;
create trigger ensure_allowed_domain
  before insert on auth.users
  for each row
  execute function public.check_email_domain();

drop trigger if exists travar_cadastro_dominio on auth.users;
create trigger travar_cadastro_dominio
  before insert on auth.users
  for each row
  execute function public.validar_dominio_maple();


-- 9. Publicação Realtime
alter publication supabase_realtime add table public.chamados;
alter publication supabase_realtime add table public.chamado_mensagens;

commit;
