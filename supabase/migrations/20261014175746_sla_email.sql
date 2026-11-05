begin;

create table public.sla_politicas (
  prioridade text primary key check (prioridade in ('baixa', 'media', 'alta', 'critica')),
  prazo_horas numeric check (prazo_horas >= 0.25 and prazo_horas <= 8760 and mod(prazo_horas, 0.25) = 0)
);
-- Prazos aprovados em 14/10/2026, em horas corridas.
insert into public.sla_politicas (prioridade, prazo_horas) values
  ('baixa', 168),   -- 1 semana
  ('media', 120),   -- 5 dias
  ('alta', 72),     -- 3 dias
  ('critica', 24);  -- 1 dia
alter table public.sla_politicas enable row level security;
revoke all on public.sla_politicas from public, anon, authenticated;
grant select, insert, update on public.sla_politicas to authenticated;
grant all on public.sla_politicas to service_role;
create policy sla_ler on public.sla_politicas for select to authenticated using (true);
create policy sla_inserir on public.sla_politicas for insert to authenticated with check (public.is_admin());
create policy sla_atualizar on public.sla_politicas for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Os chamados históricos permanecem sem prioridade/SLA até uma classificação explícita.
alter table public.chamados
  add column prioridade text check (prioridade in ('baixa', 'media', 'alta', 'critica')),
  add column sla_prazo_horas numeric,
  add column sla_vence_em timestamptz,
  add column origem text not null default 'portal' check (origem in ('portal', 'email')),
  add column email_remetente text,
  add column email_assunto text,
  add column email_message_id text unique,
  add column email_original_path text;
alter table public.chamados alter column prioridade set default 'media';
alter table public.chamados add constraint chamados_sla_completo check (
  (sla_prazo_horas is null and sla_vence_em is null)
  or (prioridade is not null and sla_prazo_horas is not null and sla_prazo_horas > 0 and sla_vence_em is not null)
);
create index chamados_sla_aberto_idx on public.chamados (sla_vence_em)
  where status <> 'Concluído' and sla_vence_em is not null;

create function public.aplicar_sla_chamado() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare v_horas numeric;
begin
  if tg_op = 'INSERT' then
    -- Sempre conta desde a abertura no Maple Help, sem confiar na data do cliente.
    new.data_criacao := statement_timestamp();
    new.prioridade := coalesce(new.prioridade, 'media');
    if current_user <> 'service_role' then
      new.origem := 'portal';
      new.email_remetente := null;
      new.email_assunto := null;
      new.email_message_id := null;
      new.email_original_path := null;
      new.status := 'Pendente';
      new.data_resolucao := null;
    end if;
  else
    new.data_criacao := old.data_criacao;
    new.origem := old.origem;
    new.email_remetente := old.email_remetente;
    new.email_assunto := old.email_assunto;
    new.email_message_id := old.email_message_id;
    new.email_original_path := old.email_original_path;
    if old.status = 'Concluído' then
      new.status := old.status;
      new.prioridade := old.prioridade;
      new.data_resolucao := old.data_resolucao;
    elsif new.status = 'Concluído' then
      new.data_resolucao := statement_timestamp();
    else
      new.data_resolucao := old.data_resolucao;
    end if;
  end if;

  if tg_op = 'INSERT' or new.prioridade is distinct from old.prioridade then
    select prazo_horas into v_horas from public.sla_politicas where prioridade = new.prioridade;
    if v_horas is null then
      raise exception 'Configure o prazo de SLA desta prioridade antes de abrir ou reclassificar o chamado.';
    end if;
    new.sla_prazo_horas := v_horas;
    -- Intervalo em horas para não pausar nem depender de dias civis/DST.
    new.sla_vence_em := new.data_criacao + v_horas * interval '1 hour';
  else
    new.sla_prazo_horas := old.sla_prazo_horas;
    new.sla_vence_em := old.sla_vence_em;
  end if;
  return new;
end;
$$;
revoke all on function public.aplicar_sla_chamado() from public, anon, authenticated;
create trigger chamados_aplicar_sla before insert or update on public.chamados
  for each row execute function public.aplicar_sla_chamado();

-- O arquivo .eml mantém cabeçalhos, corpo e anexos sem publicar conteúdo de e-mail.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chamados-emails', 'chamados-emails', false, 2500000, array['application/octet-stream']);
-- Escrita e leitura pelo backend com service_role; nenhuma política pública de Storage.

commit;
