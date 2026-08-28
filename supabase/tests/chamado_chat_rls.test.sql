-- Teste pgTAP para RLS e integridade do Chat do Maple Help
-- Executável com `supabase test db`

begin;
select plan(15);

-- 1. Teste de Grants para anon
select throws_ok(
  $$ select * from public.app_admins $$,
  'permission denied for table app_admins',
  'anon nao tem acesso a app_admins'
);

select throws_ok(
  $$ select * from public.chamado_mensagens $$,
  'permission denied for table chamado_mensagens',
  'anon nao tem acesso a chamado_mensagens'
);

select throws_ok(
  $$ select * from public.chamado_chat_leituras $$,
  'permission denied for table chamado_chat_leituras',
  'anon nao tem acesso a chamado_chat_leituras'
);

-- 2. Teste da funcao is_admin()
select ok(
  public.is_admin() is false,
  'is_admin() retorna false para usuario nao autenticado/anon'
);

-- 3. Estrutura e colunas da tabela chamado_mensagens
select has_table('public', 'chamado_mensagens', 'Tabela chamado_mensagens existe');
select has_table('public', 'chamado_chat_leituras', 'Tabela chamado_chat_leituras existe');
select has_table('public', 'app_admins', 'Tabela app_admins existe');

select columns_are(
  'public',
  'chamado_mensagens',
  ARRAY['id', 'chamado_id', 'autor_id', 'autor_nome', 'autor_tipo', 'mensagem', 'created_at'],
  'chamado_mensagens possui exatamente as colunas esperadas'
);

select columns_are(
  'public',
  'chamado_chat_leituras',
  ARRAY['chamado_id', 'user_id', 'last_read_at'],
  'chamado_chat_leituras possui exatamente as colunas esperadas'
);

select columns_are(
  'public',
  'app_admins',
  ARRAY['email', 'created_at'],
  'app_admins possui exatamente as colunas esperadas'
);

-- 4. Restricoes de chave estrangeira
select col_is_fk('public', 'chamado_mensagens', 'chamado_id', 'chamado_id referencia public.chamados');
select col_is_fk('public', 'chamado_chat_leituras', 'chamado_id', 'chamado_id referencia public.chamados');
select col_is_fk('public', 'chamado_chat_leituras', 'user_id', 'user_id referencia auth.users');

-- 5. RLS ativo nas tabelas
select row_security_active('public.chamados');
select row_security_active('public.chamado_mensagens');

select * from finish();
rollback;
