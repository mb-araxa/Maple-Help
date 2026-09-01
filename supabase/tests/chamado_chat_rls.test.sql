-- Teste pgTAP rigoroso para RLS, Integridade e Identidade do Chat do Maple Help
-- Executável via `supabase test db`

begin;
select plan(25);

-- =========================================================================
-- PREPARAÇÃO DE DADOS DE TESTE (EXECUTADO COMO POSTGRES / SUPERUSER)
-- =========================================================================

-- Cria usuários falsos em auth.users se não existirem para satisfazer FKs
insert into auth.users (id, email, raw_user_meta_data)
values
  ('11111111-1111-1111-1111-111111111111', 'user1@maplebeararaxa.com.br', '{"name":"Usuário Um"}'::jsonb),
  ('22222222-2222-2222-2222-222222222222', 'user2@maplebeararaxa.com.br', '{"name":"Usuário Dois"}'::jsonb),
  ('33333333-3333-3333-3333-333333333333', 'isaque.santos@maplebeararaxa.com.br', '{"name":"Admin TI"}'::jsonb),
  ('44444444-4444-4444-4444-444444444444', 'deletavel@maplebeararaxa.com.br', '{"name":"Usuário Deletavel"}'::jsonb)
on conflict (id) do nothing;

-- Garante que o admin está na tabela app_admins
insert into public.app_admins (email)
values ('isaque.santos@maplebeararaxa.com.br')
on conflict (email) do nothing;

-- Chamado Aberto do Usuário 1
insert into public.chamados (id, solicitante, local, categoria, descricao, status, user_id)
values (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'Carlos Solicitante',
  'Sala 101',
  'Informática',
  'Problema com o projetor',
  'Em Andamento',
  '11111111-1111-1111-1111-111111111111'
) on conflict (id) do nothing;

-- Chamado Concluído do Usuário 1
insert into public.chamados (id, solicitante, local, categoria, descricao, status, resolucao, tempo_gasto, user_id)
values (
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'Carlos Solicitante',
  'Sala 102',
  'Rede',
  'Sem conexão',
  'Concluído',
  'Cabo substituído',
  '20m',
  '11111111-1111-1111-1111-111111111111'
) on conflict (id) do nothing;

-- Chamado Para Teste de Exclusão em Cascata
insert into public.chamados (id, solicitante, local, categoria, descricao, status, user_id)
values (
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'Carlos Solicitante',
  'Sala 103',
  'Geral',
  'Para deletar',
  'Pendente',
  '11111111-1111-1111-1111-111111111111'
) on conflict (id) do nothing;

-- Chamado persistente do usuário que será removido (teste de ON DELETE SET NULL)
insert into public.chamados (id, solicitante, local, categoria, descricao, status, user_id)
values (
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  'Usuário Deletavel',
  'Sala 104',
  'Geral',
  'Preservar mensagem após excluir autor',
  'Pendente',
  '44444444-4444-4444-4444-444444444444'
) on conflict (id) do nothing;

-- Mensagem prévia no chamado aberto
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-1111-1111-1111-111111111111","email":"user1@maplebeararaxa.com.br","role":"authenticated"}';

insert into public.chamado_mensagens (id, chamado_id, autor_id, autor_nome, autor_tipo, mensagem)
values (
  '99999999-9999-9999-9999-999999999999',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '11111111-1111-1111-1111-111111111111',
  'Carlos Solicitante',
  'usuario',
  'Mensagem inicial de teste'
) on conflict (id) do nothing;

-- Leitura prévia no chamado aberto
insert into public.chamado_chat_leituras (chamado_id, user_id, last_read_at)
values (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '11111111-1111-1111-1111-111111111111',
  now()
) on conflict (chamado_id, user_id) do nothing;

-- =========================================================================
-- 1. TESTES COMO ANON (USUÁRIO NÃO AUTENTICADO)
-- =========================================================================

set local role anon;
set local "request.jwt.claims" = '{"role":"anon"}';

-- Asserção 1: anon não consulta chamados
select throws_ok(
  $$ select * from public.chamados $$,
  '1. anon nao consulta chamados'
);

-- Asserção 2: anon não consulta mensagens
select throws_ok(
  $$ select * from public.chamado_mensagens $$,
  '2. anon nao consulta mensagens'
);

-- Asserção 3: anon não consulta leituras
select throws_ok(
  $$ select * from public.chamado_chat_leituras $$,
  '3. anon nao consulta leituras'
);

-- =========================================================================
-- 2. TESTES COMO USUÁRIO PROPRIETÁRIO (USER 1)
-- =========================================================================

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-1111-1111-1111-111111111111","email":"user1@maplebeararaxa.com.br","role":"authenticated"}';

-- Asserção 4: Usuário proprietário consulta o próprio chamado
select results_eq(
  $$ select id from public.chamados where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  $$ values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid) $$,
  '4. Usuario proprietario consulta o proprio chamado'
);

-- Asserção 5: Usuário proprietário consulta as mensagens do próprio chamado
select results_eq(
  $$ select id from public.chamado_mensagens where chamado_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  $$ values ('99999999-9999-9999-9999-999999999999'::uuid) $$,
  '5. Usuario proprietario consulta as mensagens do proprio chamado'
);

-- =========================================================================
-- 3. TESTES COMO OUTRO USUÁRIO (USER 2 - SEM ACESSO AO CHAMADO DO USER 1)
-- =========================================================================

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"22222222-2222-2222-2222-222222222222","email":"user2@maplebeararaxa.com.br","role":"authenticated"}';

-- Asserção 6: Outro usuário não consulta o chamado
select is_empty(
  $$ select * from public.chamados where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  '6. Outro usuario nao consulta o chamado de terceiros'
);

-- Asserção 7: Outro usuário não consulta as mensagens
select is_empty(
  $$ select * from public.chamado_mensagens where chamado_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  '7. Outro usuario nao consulta as mensagens de chamado alheio'
);

-- =========================================================================
-- 4. TESTES DE INSERÇÃO E CONTROLE DE ACESSO
-- =========================================================================

-- Asserção 8: Usuário proprietário envia mensagem em chamado aberto
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-1111-1111-1111-111111111111","email":"user1@maplebeararaxa.com.br","role":"authenticated"}';

select lives_ok(
  $$ insert into public.chamado_mensagens (chamado_id, autor_id, autor_nome, autor_tipo, mensagem)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Carlos', 'usuario', 'Nova mensagem permitida') $$,
  '8. Usuario proprietario envia mensagem em chamado aberto'
);

-- Asserção 9: Usuário não envia mensagem em chamado alheio
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"22222222-2222-2222-2222-222222222222","email":"user2@maplebeararaxa.com.br","role":"authenticated"}';

select throws_ok(
  $$ insert into public.chamado_mensagens (chamado_id, autor_id, autor_nome, autor_tipo, mensagem)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'Intruso', 'usuario', 'Mensagem invasiva') $$,
  '9. Usuario nao envia mensagem em chamado alheio'
);

-- =========================================================================
-- 5. TESTES COMO ADMINISTRADOR (TI)
-- =========================================================================

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"33333333-3333-3333-3333-333333333333","email":"isaque.santos@maplebeararaxa.com.br","role":"authenticated"}';

-- Asserção 10: Administrador consulta qualquer chamado
select results_eq(
  $$ select id from public.chamados where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  $$ values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid) $$,
  '10. Administrador consulta qualquer chamado'
);

-- Asserção 11: Administrador envia mensagem em chamado aberto
select lives_ok(
  $$ insert into public.chamado_mensagens (chamado_id, autor_id, autor_nome, autor_tipo, mensagem)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'TI Admin', 'ti', 'Resposta da TI') $$,
  '11. Administrador envia mensagem em chamado aberto'
);

-- =========================================================================
-- 6. TESTES DE BLOQUEIO APÓS CONCLUSÃO
-- =========================================================================

-- Asserção 12: Solicitante não envia após conclusão
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-1111-1111-1111-111111111111","email":"user1@maplebeararaxa.com.br","role":"authenticated"}';

select throws_ok(
  $$ insert into public.chamado_mensagens (chamado_id, autor_id, autor_nome, autor_tipo, mensagem)
     values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'Carlos', 'usuario', 'Tentativa pos conclusao') $$,
  '12. Solicitante nao envia apos conclusao'
);

-- Asserção 13: Administrador não envia após conclusão
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"33333333-3333-3333-3333-333333333333","email":"isaque.santos@maplebeararaxa.com.br","role":"authenticated"}';

select throws_ok(
  $$ insert into public.chamado_mensagens (chamado_id, autor_id, autor_nome, autor_tipo, mensagem)
     values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '33333333-3333-3333-3333-333333333333', 'TI Admin', 'ti', 'Tentativa pos conclusao TI') $$,
  '13. Administrador nao envia apos conclusao'
);

-- =========================================================================
-- 7. TESTES DE TRIGGER E SEGURANÇA DE IDENTIDADE
-- =========================================================================

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-1111-1111-1111-111111111111","email":"user1@maplebeararaxa.com.br","role":"authenticated"}';

-- Inserção tentando forjar autor_id, autor_tipo e autor_nome
insert into public.chamado_mensagens (id, chamado_id, autor_id, autor_nome, autor_tipo, mensagem)
values (
  '88888888-8888-8888-8888-888888888888',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '22222222-2222-2222-2222-222222222222', -- Falsificado
  'Nome Forjado',                           -- Falsificado
  'ti',                                    -- Falsificado
  'Testando trigger de identidade'
);

-- Asserção 14: autor_id falsificado é substituído por auth.uid()
select results_eq(
  $$ select autor_id from public.chamado_mensagens where id = '88888888-8888-8888-8888-888888888888' $$,
  $$ values ('11111111-1111-1111-1111-111111111111'::uuid) $$,
  '14. autor_id falsificado e substituido por auth.uid()'
);

-- Asserção 15: autor_tipo falsificado é substituído
select results_eq(
  $$ select autor_tipo from public.chamado_mensagens where id = '88888888-8888-8888-8888-888888888888' $$,
  $$ values ('usuario'::text) $$,
  '15. autor_tipo falsificado e substituido'
);

-- Asserção 16: autor_nome falsificado é substituído pelo nome confiável do chamado
select results_eq(
  $$ select autor_nome from public.chamado_mensagens where id = '88888888-8888-8888-8888-888888888888' $$,
  $$ values ('Carlos Solicitante'::text) $$,
  '16. autor_nome falsificado e substituido pelo nome confiavel'
);

-- =========================================================================
-- 8. TESTES DE IMUTABILIDADE E MANIPULAÇÃO DE MENSAGENS
-- =========================================================================

-- Asserção 17: Usuário não atualiza mensagens
select throws_ok(
  $$ update public.chamado_mensagens set mensagem = 'Mensagem alterada' where id = '88888888-8888-8888-8888-888888888888' $$,
  '17. Usuario nao atualiza mensagens'
);

-- Asserção 18: Usuário não exclui mensagens
select throws_ok(
  $$ delete from public.chamado_mensagens where id = '88888888-8888-8888-8888-888888888888' $$,
  '18. Usuario nao exclui mensagens'
);

-- =========================================================================
-- 9. TESTES DE LEITURAS
-- =========================================================================

-- Asserção 19: Usuário consulta e atualiza apenas a própria leitura
select results_eq(
  $$ update public.chamado_chat_leituras
     set last_read_at = last_read_at + interval '1 second'
     where chamado_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
     returning user_id $$,
  $$ values ('11111111-1111-1111-1111-111111111111'::uuid) $$,
  '19. Usuario consulta e atualiza apenas a propria leitura'
);

-- =========================================================================
-- 10. TESTES DE EXCLUSÃO E INTEGRIDADE REFERENCIAL
-- =========================================================================

-- Prepara chamado ccc com mensagem e leitura
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-1111-1111-1111-111111111111","email":"user1@maplebeararaxa.com.br","role":"authenticated"}';

insert into public.chamado_mensagens (id, chamado_id, autor_id, autor_nome, autor_tipo, mensagem)
values ('77777777-7777-7777-7777-777777777777', 'cccccccc-cccc-cccc-cccc-cccccccccccc', '11111111-1111-1111-1111-111111111111', 'Carlos', 'usuario', 'Msg temporaria')
on conflict (id) do nothing;

insert into public.chamado_chat_leituras (chamado_id, user_id, last_read_at)
values ('cccccccc-cccc-cccc-cccc-cccccccccccc', '11111111-1111-1111-1111-111111111111', now())
on conflict (chamado_id, user_id) do nothing;

-- Deleta o chamado ccc
set local role postgres;
delete from public.chamados where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

-- Asserção 20: Exclusão do chamado remove mensagens e leituras
select ok(
  not exists (select 1 from public.chamado_mensagens where chamado_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc')
  and not exists (select 1 from public.chamado_chat_leituras where chamado_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
  '20. Exclusao do chamado remove mensagens e leituras em cascata'
);

-- Asserção 21: Exclusão do autor preserva a mensagem e transforma autor_id em null
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"44444444-4444-4444-4444-444444444444","email":"deletavel@maplebeararaxa.com.br","role":"authenticated"}';

insert into public.chamado_mensagens (id, chamado_id, autor_id, autor_nome, autor_tipo, mensagem)
values ('66666666-6666-6666-6666-666666666666', 'dddddddd-dddd-dddd-dddd-dddddddddddd', '44444444-4444-4444-4444-444444444444', 'Deletavel', 'usuario', 'Mensagem que deve persistir')
on conflict (id) do nothing;

set local role postgres;
delete from auth.users where id = '44444444-4444-4444-4444-444444444444';
select ok(
  exists (
    select 1 from public.chamado_mensagens
    where id = '66666666-6666-6666-6666-666666666666'
      and autor_id is null
  ),
  '21. Exclusao do autor preserva a mensagem e define autor_id como null'
);

-- =========================================================================
-- 11. TESTES DE SEGURANÇA E GRANTS EM APP_ADMINS E TABELAS
-- =========================================================================

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-1111-1111-1111-111111111111","email":"user1@maplebeararaxa.com.br","role":"authenticated"}';

-- Asserção 22: app_admins não aceita escrita por usuário autenticado comum
select throws_ok(
  $$ insert into public.app_admins (email) values ('hacker@maplebeararaxa.com.br') $$,
  '22. app_admins nao aceita escrita por usuario autenticado comum'
);

-- Asserção 23: Políticas permissivas antigas de chamados não existem
set local role postgres;
select is_empty(
  $$ select policyname from pg_policies
     where tablename = 'chamados'
       and policyname in (
         'Permitir atualização para usuários logados',
         'Permitir exclusão para usuários logados',
         'Permitir leitura de chamados para usuários logados',
         'Permitir inserção apenas para usuários logados'
       ) $$,
  '23. Politicas permissivas antigas de chamados foram completamente removidas'
);

-- Asserção 24: Grants correspondem às operações realmente utilizadas
select ok(
  has_table_privilege('anon', 'public.chamados', 'select') is false
  and has_table_privilege('authenticated', 'public.chamados', 'select') is true
  and has_table_privilege('authenticated', 'public.chamado_mensagens', 'insert') is true
  and has_table_privilege('authenticated', 'public.chamado_mensagens', 'update') is false
  and has_table_privilege('authenticated', 'public.chamado_mensagens', 'delete') is false,
  '24. Grants de banco correspondem as operacoes realmente permitidas'
);

-- Asserção 25: RLS está ativada em todas as tabelas expostas envolvidas
select ok(
  (select rowsecurity from pg_tables where schemaname = 'public' and tablename = 'chamados') is true
  and (select rowsecurity from pg_tables where schemaname = 'public' and tablename = 'chamado_mensagens') is true
  and (select rowsecurity from pg_tables where schemaname = 'public' and tablename = 'chamado_chat_leituras') is true
  and (select rowsecurity from pg_tables where schemaname = 'public' and tablename = 'app_admins') is true,
  '25. RLS ativada em todas as tabelas envolvidas'
);

select * from finish();
rollback;
