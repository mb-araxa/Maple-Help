// Verificação isolada em PostgreSQL/WASM (PGlite), executada com Node, fora do ambiente de produção.
// PGLITE_MODULE_PATH aponta opcionalmente para .../@electric-sql/pglite/dist/index.js.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const { PGlite } = await import(
  process.env.PGLITE_MODULE_PATH
    ? pathToFileURL(process.env.PGLITE_MODULE_PATH).href
    : '@electric-sql/pglite'
);

const db = new PGlite();
let verificacoes = 0;
const verificar = (condicao, mensagem) => {
  assert.ok(condicao, mensagem);
  verificacoes++;
};

try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create function auth.jwt() returns jsonb language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
    $$;
    create function auth.uid() returns uuid language sql stable as $$
      select (auth.jwt()->>'sub')::uuid
    $$;
    grant usage on schema auth, public to anon, authenticated, service_role;
    create schema storage;
    create table storage.buckets (
      id text primary key,
      name text,
      public boolean,
      file_size_limit bigint,
      allowed_mime_types text[]
    );
  `);

  const base = await readFile(new URL('../maple_help_schema.sql', import.meta.url), 'utf8');
  await db.exec(base.split('-- 4. Avaliação')[0] + '\ncommit;');

  // 1. Insere chamado histórico anterior à migração de SLA (sem prioridade)
  await db.exec(`
    insert into public.chamados (id, solicitante, local, categoria, descricao, status, user_id)
    values (
      '00000000-0000-4000-8000-000000000001',
      'Histórico Sem Prioridade',
      'Sala 1',
      'TI',
      'Chamado aberto antes do SLA e ainda pendente.',
      'Pendente',
      '00000000-0000-4000-8000-000000000010'
    );
  `);

  // 2. Aplica migração de SLA
  await db.exec(
    await readFile(new URL('../migrations/20261014175746_sla_email.sql', import.meta.url), 'utf8')
  );

  // 3. Insere chamados históricos pós-SLA (com prioridade manual/existente) antes da migração de IA
  await db.exec(`
    insert into public.chamados (id, solicitante, local, categoria, descricao, status, prioridade, user_id)
    values
      (
        '00000000-0000-4000-8000-000000000002',
        'Histórico Com Prioridade',
        'Sala 2',
        'Rede',
        'Chamado já classificado manualmente antes da IA.',
        'Pendente',
        'alta',
        '00000000-0000-4000-8000-000000000010'
      ),
      (
        '00000000-0000-4000-8000-000000000003',
        'Histórico Concluído',
        'Sala 3',
        'TI',
        'Chamado concluído antes da IA.',
        'Pendente',
        'media',
        '00000000-0000-4000-8000-000000000010'
      );
    update public.chamados set status = 'Concluído' where id = '00000000-0000-4000-8000-000000000003';
  `);

  const row = async (sql, params = []) => (await db.query(sql, params)).rows[0];
  const antesIa = await row(
    "select prioridade, sla_prazo_horas, sla_vence_em from public.chamados where id = '00000000-0000-4000-8000-000000000002'"
  );

  // 4. Aplica migração de IA
  await db.exec(
    await readFile(new URL('../migrations/20261111140000_ia_chamados.sql', import.meta.url), 'utf8')
  );

  // Verifica preservação de dados históricos (Requisito 3)
  const histSemPrio = await row(
    "select prioridade, prioridade_origem, sla_vence_em from public.chamados where id = '00000000-0000-4000-8000-000000000001'"
  );
  verificar(
    histSemPrio.prioridade === null && histSemPrio.prioridade_origem === 'padrao',
    'Histórico sem prioridade permanece padrao e elegível à IA'
  );

  const histComPrio = await row(
    "select prioridade, prioridade_origem, sla_prazo_horas, sla_vence_em from public.chamados where id = '00000000-0000-4000-8000-000000000002'"
  );
  verificar(
    histComPrio.prioridade === 'alta' &&
      histComPrio.prioridade_origem === 'manual' &&
      Number(histComPrio.sla_prazo_horas) === Number(antesIa.sla_prazo_horas) &&
      +new Date(histComPrio.sla_vence_em) === +new Date(antesIa.sla_vence_em),
    'Histórico com prioridade é preservado como manual sem alterar prioridade/SLA/vencimento'
  );

  const histConcluido = await row(
    "select status, prioridade from public.chamados where id = '00000000-0000-4000-8000-000000000003'"
  );
  verificar(
    histConcluido.status === 'Concluído' && histConcluido.prioridade === 'media',
    'Histórico concluído não é alterado para executar análises'
  );

  const claims = async (email, id = '00000000-0000-4000-8000-000000000010') => {
    await db.exec('reset role;');
    await db.query("select set_config('request.jwt.claims', $1, false)", [
      JSON.stringify({ email, sub: id }),
    ]);
    await db.exec('set role authenticated;');
  };

  // 5. Verifica bloqueio para anon e solicitante comum (Teste 14)
  await db.exec('reset role; set role anon;');
  await assert.rejects(db.query('select * from public.chamado_analises_ia'));
  verificacoes++;
  await assert.rejects(
    db.query(
      "select public.adquirir_trava_analise_ia('00000000-0000-4000-8000-000000000001'::uuid, 30)"
    )
  );
  verificacoes++;

  // Solicitante comum abre um chamado novo e tenta acessar tabela/RPC de análise diretamente
  await claims('professor@maplebeararaxa.com.br', '00000000-0000-4000-8000-000000000010');
  const novoChamado = await row(`
    insert into public.chamados (solicitante, local, categoria, descricao, prioridade)
    values ('Professor', 'Sala 5', 'Computador', 'Notebook não conecta no projetor.', 'critica')
    returning *
  `);
  verificar(
    novoChamado.prioridade === null && novoChamado.prioridade_origem === 'padrao',
    'Novo chamado aberto pelo solicitante inicia sem prioridade e com origem padrao'
  );

  await assert.rejects(
    db.query("select public.adquirir_trava_analise_ia($1::uuid, 30)", [novoChamado.id]),
    /Acesso negado/
  );
  verificacoes++;

  await assert.rejects(
    db.query(
      "select public.concluir_analise_ia($1::uuid, gen_random_uuid(), 'alta', 'Justificativa valida para teste', 'Sugestao valida com mais de vinte caracteres', 90, 'qwen/qwen3.8-27b')",
      [novoChamado.id]
    ),
    /Acesso negado/
  );
  verificacoes++;

  await assert.rejects(
    db.query("select public.falhar_analise_ia($1::uuid, gen_random_uuid())", [novoChamado.id]),
    /Acesso negado/
  );
  verificacoes++;

  await assert.rejects(
    db.query(
      "insert into public.chamado_analises_ia (chamado_id, ia_status) values ($1::uuid, 'concluida')",
      [novoChamado.id]
    )
  );
  verificacoes++;

  // 6. Aquisição atômica de trava e concorrência (Testes 1 e 10)
  await db.exec('reset role; set role service_role;');
  const travaVencedora = (
    await row('select public.adquirir_trava_analise_ia($1::uuid, 30) as res', [novoChamado.id])
  ).res;
  verificar(
    travaVencedora.adquirida === true && Boolean(travaVencedora.execucao_id),
    'Primeira execução adquire a trava com sucesso'
  );

  const travaConcorrente = (
    await row('select public.adquirir_trava_analise_ia($1::uuid, 30) as res', [novoChamado.id])
  ).res;
  verificar(
    travaConcorrente.adquirida === false && travaConcorrente.motivo === 'em_andamento',
    'Segunda execução simultânea não adquire a trava'
  );

  const conclusaoNovo = (
    await row(
      `select public.concluir_analise_ia(
        $1::uuid,
        $2::uuid,
        'alta',
        'Equipamento de aula indisponível para a turma.',
        'Verificar cabo HDMI, adaptador e entrada de vídeo do projetor.',
        89,
        'qwen/qwen3.8-27b'
      ) as res`,
      [novoChamado.id, travaVencedora.execucao_id]
    )
  ).res;
  verificar(
    conclusaoNovo.ok === true &&
      conclusaoNovo.prioridade_aplicada === true &&
      conclusaoNovo.chamado.prioridade === 'alta' &&
      conclusaoNovo.chamado.prioridade_origem === 'ia' &&
      Number(conclusaoNovo.chamado.sla_prazo_horas) === 72,
    'Chamado novo sem prioridade recebe classificação automática e SLA calculado pelo banco'
  );

  // 7. Solicitante comum continua sem poder ler chamado_analises_ia, mas admin consegue (Testes 14 e 15)
  await claims('professor@maplebeararaxa.com.br', '00000000-0000-4000-8000-000000000010');
  const leituraSolicitante = await db.query('select * from public.chamado_analises_ia');
  verificar(
    leituraSolicitante.rows.length === 0,
    'Solicitante comum não consegue ler registros de public.chamado_analises_ia'
  );

  await claims('isaque.santos@maplebeararaxa.com.br', '00000000-0000-4000-8000-000000000099');
  const leituraAdmin = await db.query(
    'select * from public.chamado_analises_ia where chamado_id = $1::uuid',
    [novoChamado.id]
  );
  verificar(
    leituraAdmin.rows.length === 1 &&
      leituraAdmin.rows[0].ia_prioridade_sugerida === 'alta' &&
      leituraAdmin.rows[0].ia_status === 'concluida',
    'Administrador autenticado consegue consultar a análise em public.chamado_analises_ia'
  );

  // 8. Expiração da trava e proteção contra sobrescrita por execução antiga (Testes 3 e 4)
  await db.exec('reset role; set role service_role;');
  const travaAntiga = (
    await row(
      "select public.adquirir_trava_analise_ia('00000000-0000-4000-8000-000000000001'::uuid, 30) as res"
    )
  ).res;
  verificar(travaAntiga.adquirida === true, 'Adquire trava inicial');

  // Simula expiração da trava no banco
  await db.exec(`
    update public.chamado_analises_ia
    set ia_iniciada_em = statement_timestamp() - interval '60 seconds',
        ia_trava_ate = statement_timestamp() - interval '1 second'
    where chamado_id = '00000000-0000-4000-8000-000000000001';
  `);

  const travaNova = (
    await row(
      "select public.adquirir_trava_analise_ia('00000000-0000-4000-8000-000000000001'::uuid, 30) as res"
    )
  ).res;
  verificar(
    travaNova.adquirida === true && travaNova.execucao_id !== travaAntiga.execucao_id,
    'Trava expirada permite nova tentativa com novo ia_execucao_id'
  );

  // Tentativa antiga falha tardiamente: não deve sobrescrever a trava nova
  const falhaAntiga = (
    await row(
      "select public.falhar_analise_ia('00000000-0000-4000-8000-000000000001'::uuid, $1::uuid) as res",
      [travaAntiga.execucao_id]
    )
  ).res;
  verificar(
    falhaAntiga.atualizado === false && falhaAntiga.motivo === 'execucao_substituida',
    'Execução antiga não grava falha sobre tentativa mais recente'
  );

  // Tentativa nova conclui com sucesso ('critica')
  const conclusaoNova = (
    await row(
      `select public.concluir_analise_ia(
        '00000000-0000-4000-8000-000000000001'::uuid,
        $1::uuid,
        'critica',
        'Serviço essencial parado no setor.',
        'Verificar servidor principal e conexões de rede imediatamente.',
        95,
        'qwen/qwen3.8-27b'
      ) as res`,
      [travaNova.execucao_id]
    )
  ).res;
  verificar(
    conclusaoNova.ok === true && conclusaoNova.chamado.prioridade === 'critica',
    'Tentativa nova grava resultado com sucesso'
  );

  // Tentativa antiga tenta concluir tardiamente ('baixa'): deve ser rejeitada
  const conclusaoAntiga = (
    await row(
      `select public.concluir_analise_ia(
        '00000000-0000-4000-8000-000000000001'::uuid,
        $1::uuid,
        'baixa',
        'Tentativa atrasada que não deve vencer.',
        'Procedimento atrasado que não deve substituir a análise atual.',
        50,
        'qwen/qwen3.8-27b'
      ) as res`,
      [travaAntiga.execucao_id]
    )
  ).res;
  verificar(
    conclusaoAntiga.ok === false &&
      conclusaoAntiga.motivo === 'execucao_substituida' &&
      conclusaoAntiga.chamado.prioridade === 'critica',
    'Execução antiga não sobrescreve sucesso de tentativa mais recente'
  );

  // 9. Chamado histórico já classificado recebe sugestão sem alterar prioridade ou SLA (Teste 9)
  const travaHist = (
    await row(
      "select public.adquirir_trava_analise_ia('00000000-0000-4000-8000-000000000002'::uuid, 30) as res"
    )
  ).res;
  const conclusaoHist = (
    await row(
      `select public.concluir_analise_ia(
        '00000000-0000-4000-8000-000000000002'::uuid,
        $1::uuid,
        'baixa',
        'IA sugeriu baixa, mas prioridade histórica era alta.',
        'Verificar ponto de rede da sala 2 e testar patch cord.',
        75,
        'qwen/qwen3.8-27b'
      ) as res`,
      [travaHist.execucao_id]
    )
  ).res;
  verificar(
    conclusaoHist.ok === true &&
      conclusaoHist.prioridade_aplicada === false &&
      conclusaoHist.chamado.prioridade === 'alta' &&
      conclusaoHist.chamado.prioridade_origem === 'manual' &&
      conclusaoHist.chamado.ia_prioridade_sugerida === 'baixa' &&
      Boolean(conclusaoHist.chamado.ia_sugestao_atendimento),
    'Chamado histórico classificado recebe sugestão sem reclassificar prioridade ou SLA'
  );

  // 10. Conclusão de chamado durante análise e bloqueio de chamado concluído (Teste 8)
  const travaConcluido = (
    await row(
      "select public.adquirir_trava_analise_ia('00000000-0000-4000-8000-000000000003'::uuid, 30) as res"
    )
  ).res;
  verificar(
    travaConcluido.adquirida === false && travaConcluido.motivo === 'chamado_concluido',
    'Chamado concluído não pode adquirir trava'
  );

  // 11. Executa script declarativo supabase/tests/ia_chamados.sql
  await db.exec('reset role;');
  await db.exec(await readFile(new URL('./ia_chamados.sql', import.meta.url), 'utf8'));
  verificacoes++;

  console.log(
    `${verificacoes} verificações SQL passaram (RLS, permissões de RPC, migração histórica, trava atômica, expiração e concorrência).`
  );
} finally {
  await db.close();
}

