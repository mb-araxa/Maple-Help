-- Verificação SQL isolada de RLS, permissões, migração histórica e trava atômica de IA.
-- NÃO executar em produção. Projetado para banco de teste isolado ou PGlite.
begin;

do $$
declare
  v_novo_id uuid := '00000000-0000-4000-8000-000000000104';
  v_trava1 jsonb;
  v_trava2 jsonb;
  v_conclusao jsonb;
  v_exec1 uuid;
begin
  -- 1. Verifica que a tabela separada existe e RLS está ativa
  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'chamado_analises_ia' and c.relrowsecurity = true
  ) then
    raise exception 'RLS não está habilitada em public.chamado_analises_ia';
  end if;

  -- 2. Verifica que anon não tem nenhum privilégio na tabela nem nas RPCs
  if has_table_privilege('anon', 'public.chamado_analises_ia', 'SELECT')
     or has_table_privilege('anon', 'public.chamado_analises_ia', 'INSERT')
     or has_table_privilege('anon', 'public.chamado_analises_ia', 'UPDATE')
     or has_table_privilege('anon', 'public.chamado_analises_ia', 'DELETE') then
    raise exception 'Role anon não pode ter privilégios na tabela public.chamado_analises_ia';
  end if;

  if has_function_privilege('anon', 'public.adquirir_trava_analise_ia(uuid, integer)', 'EXECUTE')
     or has_function_privilege('anon', 'public.concluir_analise_ia(uuid, uuid, text, text, text, integer, text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.falhar_analise_ia(uuid, uuid)', 'EXECUTE') then
    raise exception 'Role anon não pode executar RPCs operacionais de IA';
  end if;

  -- 3. Verifica que authenticated possui apenas SELECT (protegido por RLS is_admin()) na tabela
  if not has_table_privilege('authenticated', 'public.chamado_analises_ia', 'SELECT')
     or has_table_privilege('authenticated', 'public.chamado_analises_ia', 'INSERT')
     or has_table_privilege('authenticated', 'public.chamado_analises_ia', 'UPDATE')
     or has_table_privilege('authenticated', 'public.chamado_analises_ia', 'DELETE') then
    raise exception 'Role authenticated deve possuir apenas SELECT (filtrado por RLS) em public.chamado_analises_ia';
  end if;

  -- 4. Testa aquisição atômica e conclusão como service_role
  perform set_config('role', 'service_role', true);

  insert into public.chamados (id, solicitante, local, categoria, descricao, status)
  values (v_novo_id, 'Teste SQL', 'Lab', 'Rede', 'Sem acesso à internet no laboratório.', 'Pendente');

  v_trava1 := public.adquirir_trava_analise_ia(v_novo_id, 30);
  if coalesce((v_trava1->>'adquirida')::boolean, false) is not true then
    raise exception 'Falha ao adquirir trava inicial em ia_chamados.sql';
  end if;
  v_exec1 := (v_trava1->>'execucao_id')::uuid;

  v_trava2 := public.adquirir_trava_analise_ia(v_novo_id, 30);
  if coalesce((v_trava2->>'adquirida')::boolean, true) is not false
     or (v_trava2->>'motivo') <> 'em_andamento' then
    raise exception 'Segunda aquisição simultânea deveria ser recusada com motivo em_andamento';
  end if;

  v_conclusao := public.concluir_analise_ia(
    v_novo_id,
    v_exec1,
    'alta',
    'Laboratório inteiro sem conectividade para aula.',
    'Verificar switch do laboratório e link principal do rack.',
    91,
    'qwen/qwen3.8-27b'
  );

  if coalesce((v_conclusao->>'ok')::boolean, false) is not true
     or (v_conclusao->'chamado'->>'prioridade') <> 'alta'
     or (v_conclusao->'chamado'->>'prioridade_origem') <> 'ia' then
    raise exception 'Falha ao concluir análise e aplicar prioridade da IA em ia_chamados.sql';
  end if;
end;
$$;

rollback;
