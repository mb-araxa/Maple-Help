begin;

-- Tabela principal de chamados.
create table public.chamados (
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

-- Avaliação única feita pelo solicitante após a conclusão do chamado.
create table public.chamado_avaliacoes (
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

-- Permissões das tabelas, iguais às existentes no projeto atual.
grant all on table public.chamados to anon, authenticated, service_role;
grant all on table public.chamado_avaliacoes to anon, authenticated, service_role;

-- Row Level Security.
alter table public.chamados enable row level security;
alter table public.chamado_avaliacoes enable row level security;

create policy "Apenas os 3 Admins podem gerenciar chamados"
  on public.chamados
  as permissive
  for all
  to public
  using (
    (auth.jwt() ->> 'email'::text) = any (
      array[
        'isaque.santos@maplebeararaxa.com.br'::text,
        'jose.reis@maplebeararaxa.com.br'::text,
        'pedro.ashidani@maplebeararaxa.com.br'::text
      ]
    )
  );

create policy "Permitir atualização para usuários logados"
  on public.chamados
  as permissive
  for update
  to authenticated
  using (true);

create policy "Permitir exclusão para usuários logados"
  on public.chamados
  as permissive
  for delete
  to authenticated
  using (true);

create policy "Permitir inserção apenas para usuários logados"
  on public.chamados
  as permissive
  for insert
  to authenticated
  with check (true);

create policy "Permitir leitura de chamados para usuários logados"
  on public.chamados
  as permissive
  for select
  to authenticated
  using (true);

create policy "Professores podem abrir chamados"
  on public.chamados
  as permissive
  for insert
  to public
  with check (auth.uid() is not null);

create policy "Solicitante le a propria avaliacao"
  on public.chamado_avaliacoes
  as permissive
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "Solicitante avalia chamado concluido proprio"
  on public.chamado_avaliacoes
  as permissive
  for insert
  to authenticated
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

-- Bucket de anexos e sua política atual.
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
);

create policy "Permitir Upload 1tdrie1_1"
  on storage.objects
  as permissive
  for insert
  to anon, authenticated
  with check (bucket_id = 'chamados-anexos'::text);

-- Validação de domínio usada no cadastro do Supabase Auth.
create or replace function public.check_email_domain()
returns trigger
language plpgsql
security definer
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
security definer
as $function$
begin
  if new.email not like '%@maplebeararaxa.com.br' then
    raise exception 'Acesso negado: Apenas e-mails corporativos @maplebeararaxa.com.br são permitidos.';
  end if;
  return new;
end;
$function$;

grant execute on function public.check_email_domain()
  to public, anon, authenticated, service_role;
grant execute on function public.validar_dominio_maple()
  to public, anon, authenticated, service_role;

create trigger ensure_allowed_domain
  before insert on auth.users
  for each row
  execute function public.check_email_domain();

create trigger travar_cadastro_dominio
  before insert on auth.users
  for each row
  execute function public.validar_dominio_maple();

-- Realtime utilizado pelo painel administrativo.
alter publication supabase_realtime add table public.chamados;

commit;
