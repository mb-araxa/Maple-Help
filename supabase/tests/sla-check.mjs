// Verificação isolada em PostgreSQL/WASM, executada com Node, fora do Vitest.
// PGLITE_MODULE_PATH aponta opcionalmente para .../@electric-sql/pglite/dist/index.js.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { PGlite } = await import(process.env.PGLITE_MODULE_PATH
  ? pathToFileURL(process.env.PGLITE_MODULE_PATH).href : '@electric-sql/pglite');
const db = new PGlite();
let verificacoes = 0;
const verificar = (condicao, mensagem) => { assert.ok(condicao, mensagem); verificacoes++; };
try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
    grant usage on schema auth, public to authenticated, service_role;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  `);
  const base = await readFile(new URL('../maple_help_schema.sql', import.meta.url), 'utf8');
  await db.exec(base.split('-- 4. Avaliação')[0] + '\ncommit;');
  await db.exec(`insert into public.chamados (id, solicitante, local, categoria, descricao, status)
    values ('00000000-0000-4000-8000-000000000001', 'Histórico', 'Sala', 'TI', 'Antes do SLA', 'Concluído');`);
  await db.exec(await readFile(new URL('../migrations/20261014175746_sla_email.sql', import.meta.url), 'utf8'));
  const iniciais = (await db.query('select prioridade, prazo_horas from public.sla_politicas')).rows;
  assert.deepEqual(Object.fromEntries(iniciais.map(p => [p.prioridade, Number(p.prazo_horas)])),
    { baixa: 168, media: 120, alta: 72, critica: 24 }); verificacoes++;
  // Simula configuração incompleta para continuar verificando a proteção contra SLA ausente.
  await db.exec("update public.sla_politicas set prazo_horas = null where prioridade = 'alta';");
  const claims = async (email, id = '00000000-0000-4000-8000-000000000010') => {
    await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ email, sub: id })]);
    await db.exec('set role authenticated;');
  };
  const row = async sql => (await db.query(sql)).rows[0];
  const insert = "insert into public.chamados (solicitante, local, categoria, descricao, prioridade) values ('Pessoa', 'Sala', 'TI', 'Problema', 'alta') returning *";
  await claims('pessoa@maplebeararaxa.com.br');
  await assert.rejects(db.query(insert), /Configure o prazo de SLA/); verificacoes++;
  verificar((await db.query('update public.sla_politicas set prazo_horas = 1 returning *')).rows.length === 0, 'Usuário comum não altera política');
  await assert.rejects(db.query("insert into public.sla_politicas values ('critica', 1) on conflict (prioridade) do update set prazo_horas = excluded.prazo_horas")); verificacoes++;
  await db.exec('reset role;');
  await claims('isaque.santos@maplebeararaxa.com.br');
  await db.exec("update public.sla_politicas set prazo_horas = case prioridade when 'baixa' then 72 when 'media' then 24 when 'alta' then 4 else 1 end;");
  const antigo = await row("select * from public.chamados where solicitante = 'Histórico'");
  verificar(antigo.prioridade === null && antigo.sla_vence_em === null, 'Histórico permanece sem SLA');
  await db.exec('reset role;');
  await claims('pessoa@maplebeararaxa.com.br');
  const criado = await row(insert);
  verificar(Number(criado.sla_prazo_horas) === 4, 'Prioridade alta aplica 4h');
  verificar(new Date(criado.sla_vence_em) - new Date(criado.data_criacao) === 4 * 3_600_000, 'Prazo em horas corridas');
  const forjado = await row(`insert into public.chamados (solicitante, local, categoria, descricao, prioridade, sla_prazo_horas, sla_vence_em, data_criacao, origem, email_original_path)
    values ('Teste', 'Sala', 'TI', 'Descrição', 'media', 999, '2099-01-01', '2098-01-01', 'email', 'arquivo-alheio.eml') returning *`);
  verificar(Number(forjado.sla_prazo_horas) === 24 && new Date(forjado.data_criacao).getFullYear() !== 2098, 'Ignora prazos e datas forjados');
  verificar(forjado.origem === 'portal' && forjado.email_original_path === null, 'Usuário não forja arquivo de e-mail');
  await db.exec('reset role;');
  await claims('outro@maplebeararaxa.com.br', '00000000-0000-4000-8000-000000000011');
  verificar((await db.query('select * from public.chamados')).rows.length === 0, 'Outro usuário não lê chamados alheios');
  await db.exec('reset role;');
  await claims('isaque.santos@maplebeararaxa.com.br');
  await db.exec("update public.sla_politicas set prazo_horas = 8 where prioridade = 'alta';");
  const preservado = await row(`update public.chamados set status = 'Em Andamento', sla_prazo_horas = 99, sla_vence_em = '2099-01-01' where id = '${criado.id}' returning *`);
  verificar(Number(preservado.sla_prazo_horas) === 4 && +new Date(preservado.sla_vence_em) === +new Date(criado.sla_vence_em), 'Configuração e update comuns preservam SLA');
  const reclassificado = await row(`update public.chamados set prioridade = 'critica' where id = '${criado.id}' returning *`);
  verificar(new Date(reclassificado.sla_vence_em) - new Date(criado.data_criacao) === 3_600_000, 'Reclassificação conta desde abertura original');
  const fechado = await row(`update public.chamados set status = 'Concluído', data_resolucao = '2099-01-01' where id = '${criado.id}' returning *`);
  verificar(new Date(fechado.data_resolucao).getFullYear() !== 2099, 'Conclusão recebe horário do banco');
  const congelado = await row(`update public.chamados set prioridade = 'baixa', data_resolucao = '2099-01-01' where id = '${criado.id}' returning *`);
  verificar(congelado.prioridade === 'critica' && +new Date(congelado.data_resolucao) === +new Date(fechado.data_resolucao), 'Conclusão preserva apuração histórica');
  await db.exec('reset role; set role service_role;');
  const emailSql = "insert into public.chamados (solicitante, local, categoria, descricao, origem, prioridade, email_message_id, email_original_path) values ('E-mail', 'Sala', 'TI', 'Descrição', 'email', 'critica', 'help@gmail.com:123', '123.eml') returning *";
  verificar((await row(emailSql)).origem === 'email', 'Servidor importa com SLA');
  await assert.rejects(db.query(emailSql), /unique constraint/); verificacoes++;
  await db.exec('reset role;');
  verificar((await row("select public from storage.buckets where id = 'chamados-emails'")).public === false, 'Bucket de e-mails privado');
  console.log(`${verificacoes} verificações SQL passaram (SLA, histórico, RLS, idempotência e Storage).`);
} finally { await db.close(); }
