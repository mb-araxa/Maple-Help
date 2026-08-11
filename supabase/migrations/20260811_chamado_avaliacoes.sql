-- Avaliação única do solicitante para um chamado concluído.
create table if not exists public.chamado_avaliacoes (
  id uuid primary key default gen_random_uuid(),
  chamado_id uuid not null unique references public.chamados(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  nota smallint not null check (nota between 1 and 5),
  comentario text check (comentario is null or char_length(comentario) <= 500),
  created_at timestamptz not null default now()
);

alter table public.chamado_avaliacoes enable row level security;

create policy "Solicitante le a propria avaliacao"
  on public.chamado_avaliacoes for select to authenticated
  using (user_id = auth.uid());

create policy "Solicitante avalia chamado concluido proprio"
  on public.chamado_avaliacoes for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.chamados
      where chamados.id = chamado_id
        and chamados.user_id = auth.uid()
        and chamados.status = 'Concluído'
    )
  );
