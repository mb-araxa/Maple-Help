# SLA e abertura por Gmail

Implementação local de outubro/2026. Publicar o código não configura a caixa de e-mail nem aplica a migração automaticamente.

## Regras acordadas

- Prioridades: baixa, média, alta e crítica.
- A equipe define um prazo padrão de **resolução** por prioridade em `/adm/sla`.
- Contagem em horas corridas desde a abertura no Maple Help, incluindo noites, fins de semana e feriados. Não há pausa por status.
- Prazos iniciais aprovados: **baixa: 1 semana (168h); média: 5 dias (120h); alta: 3 dias (72h); crítica: 1 dia (24h)**. A migração já cadastra esses valores, que continuam editáveis pela equipe.
- Cada chamado guarda a prioridade, a quantidade de horas e o vencimento aplicados. Editar a política não muda chamados existentes.
- Reclassificar um chamado aberto aplica o prazo atual da nova prioridade **desde a abertura original**, sem reiniciar o relógio.
- Conclusões preservam o resultado histórico. Chamados antigos sem SLA ficam fora do percentual de cumprimento.
- O alerta de proximidade aparece nos últimos 20% do prazo. Indicadores de chamados abertos atualizam a cada 30 segundos.
- Relatórios e Excel exibem prioridade, horas, vencimento e resultado; o Excel contém uma aba de resumo de SLA. As métricas de concluídos consultam todas as páginas.
- Esta versão não mede um segundo prazo de primeira resposta.

## Aplicar no banco

Em banco existente, aplicar somente `supabase/migrations/20261014175746_sla_email.sql`. A migração cria `sla_politicas`, campos de SLA/e-mail, trigger de cálculo e bucket privado `chamados-emails`.

Em instalação nova, executar primeiro o esquema base `supabase/maple_help_schema.sql` e depois essa migração. A migração de avaliações antiga já está incluída no esquema base.

Planejar a aplicação da migração junto com a publicação do código e conferir os quatro prazos iniciais no painel após publicar. Se uma prioridade ficar sem prazo no banco, a criação/reclassificação nessa prioridade é recusada; a importação Gmail permanece pendente e tenta novamente.

Somente administradores em `public.app_admins` alteram políticas. O trigger calcula o prazo no banco, ignora datas/prazos fornecidos pelo navegador e preserva o histórico. O bucket de e-mails não tem política pública de leitura ou escrita.

## Integração Gmail

O arquivo `integrations/gmail/MapleHelp.gs` usa Google Apps Script na própria conta Gmail do suporte. Um gatilho verifica novas conversas da caixa de entrada a cada cinco minutos e envia o conteúdo por HTTPS para `/api/integracoes/gmail`.

Caixa de suporte confirmada: **mb.helpdesk@maplebeararaxa.com.br**. O endereço já está registrado no ambiente local; a autorização da conta e a configuração do ambiente publicado continuam pendentes.

O assunto determina a prioridade: `[BAIXA]`, `[MEDIA]`, `[ALTA]` ou `[CRITICA]`. Acentos e diferenças entre maiúsculas/minúsculas são aceitos. Sem marcador, usa média; marcadores conflitantes exigem revisão.

Regras de importação:

- Somente remetentes `@maplebeararaxa.com.br` com cadastro e e-mail confirmado no Maple Help.
- O script exige resultado DMARC aprovado e alinhado ao domínio institucional no cabeçalho `Authentication-Results` do Google. Mensagens com autenticação ausente/inconclusiva vão para revisão, inclusive possíveis mensagens internas do Workspace; validar esse comportamento com a conta real antes de ativar para todos.
- Importa somente novas conversas a partir da ativação. A primeira mensagem abre o chamado. Respostas na mesma conversa permanecem no Gmail e não são sincronizadas com o chat do Maple Help.
- Assunto, remetente, data do e-mail e texto são apresentados na descrição. Local fica “Não informado no formulário — recebido por e-mail” e categoria “E-mail / Triagem”; o sistema não inventa esses dados a partir de texto livre.
- Cabeçalhos, formatação e anexos ficam preservados no arquivo original `.eml`, disponível para download pelo solicitante e pela equipe. Não há extração de anexos para pré-visualização individual.
- Limites: original até **2,5 MB**, requisição até **3,5 MB**, texto até 200 mil caracteres, assunto até mil caracteres. Mensagens maiores ficam em revisão no Gmail, sem truncamento nem importação parcial.
- O SLA começa na criação no Maple Help. A data original do e-mail é preservada como informação, mas não serve como início do SLA; atrasos da fila não são incluídos nesse prazo.
- Não envia resposta ou confirmação automática. As notificações existentes de assumir/concluir continuam no Resend; o chat permanece sem notificações externas.

### Configuração

1. Aplicar a migração, publicar o código e conferir os quatro prazos em **Painel ADM → Configurar SLA**: baixa 168h, média 120h, alta 72h e crítica 24h.
2. Configurar no servidor, sem prefixo `NEXT_PUBLIC_` para segredos:

   ```env
   GMAIL_MAILBOX=mb.helpdesk@maplebeararaxa.com.br
   GMAIL_WEBHOOK_SECRET=segredo-aleatorio-com-pelo-menos-32-caracteres
   SUPABASE_SERVICE_ROLE_KEY=chave-secreta-do-servidor
   ```

   Use `mb.helpdesk@maplebeararaxa.com.br` também na propriedade `GMAIL_MAILBOX` do Apps Script. Gerar um segredo aleatório forte, por exemplo `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Guardá-lo somente no ambiente do servidor e nas propriedades do script.

3. Acessar [Google Apps Script](https://script.google.com/) com a conta Gmail do suporte, criar um projeto e colar `integrations/gmail/MapleHelp.gs`.
4. Em **Configurações do projeto → Propriedades do script**, cadastrar `MAPLE_HELP_URL` (URL HTTPS pública, sem barra final), `GMAIL_MAILBOX` e o mesmo `GMAIL_WEBHOOK_SECRET`.
5. Executar `ativarMapleHelp` e autorizar o acesso à conta. O script cria os marcadores e o gatilho, preservando o momento original da ativação em execuções posteriores.
6. Enviar, pelo usuário responsável pela implantação, um e-mail de teste de uma conta institucional cadastrada, com assunto `[ALTA] Teste de integração`, texto e um anexo pequeno. Executar `importarMapleHelp` ou aguardar o gatilho. Confirmar um único chamado, prioridade alta, prazo correto e download do original completo. Não marcar como validada a integração antes desse teste real.

### Operação e falhas

- `MapleHelp-Importado`: chamado criado ou protocolo já existente.
- `MapleHelp-Revisar`: mensagem fora das regras, remetente desconhecido, conteúdo muito grande ou prioridade ambígua. Corrigir a causa e remover o marcador para retentar; se precisar corrigir o assunto/conteúdo, enviar uma nova conversa.
- Falhas transitórias, credenciais incorretas ou falta de SLA deixam a mensagem na fila. Consulte **Execuções** no Apps Script; erros não registram conteúdo de mensagens ou segredos.
- O mesmo ID de mensagem retorna o protocolo já criado. A restrição única no banco protege inclusive importações simultâneas. O upload do original é determinístico e pode ser reutilizado após falha no banco.
- Não apagar manualmente arquivos `.eml` referenciados. Uma falha entre upload e criação pode deixar um arquivo órfão privado, reutilizado na tentativa seguinte. Não há rotina automática de limpeza nesta versão.
- Para desativar, remover o gatilho `importarMapleHelp` no Apps Script e revogar/rotacionar `GMAIL_WEBHOOK_SECRET` no servidor. A caixa e o histórico de chamados permanecem preservados.
- O endpoint precisa estar acessível ao Apps Script; páginas de login/proteção de deploy não são tratadas como sucesso. Os limites de execução e quotas da conta Google continuam aplicáveis.

## Validação local

`npm run test`, `npm run lint`, `npx tsc --noEmit`, `npm run build` e `git diff --check`.

O teste SQL isolado usa PGlite (PostgreSQL em WASM) e não acessa produção:

```powershell
npm install --prefix "$env:TEMP/maple-help-sla-db" --no-package-lock --no-save @electric-sql/pglite
$env:PGLITE_MODULE_PATH = "$env:TEMP/maple-help-sla-db/node_modules/@electric-sql/pglite/dist/index.js"
node supabase/tests/sla-check.mjs
```

Referências oficiais: [GmailMessage](https://developers.google.com/apps-script/reference/gmail/gmail-message), [gatilhos temporizados](https://developers.google.com/apps-script/reference/script/clock-trigger-builder), [UrlFetchApp](https://developers.google.com/apps-script/reference/url-fetch/url-fetch-app), [RLS no Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security).
