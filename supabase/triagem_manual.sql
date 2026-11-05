begin;
alter table public.chamados alter column prioridade drop default;
create or replace function public.aplicar_sla_chamado() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare v_horas numeric;
begin
  if tg_op = 'INSERT' then
    -- Sempre conta desde a abertura no Maple Help, sem confiar na data do cliente.
    if current_user = 'service_role' and new.origem = 'email' then
      new.data_criacao := least(coalesce(new.data_criacao, statement_timestamp()), statement_timestamp());
    else
      new.data_criacao := statement_timestamp();
    end if;
    new.prioridade := null;
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
    if new.prioridade is null then
      new.sla_prazo_horas := null;
      new.sla_vence_em := null;
      return new;
    end if;
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

commit;
