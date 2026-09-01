# Contexto Operacional do Maple Help

Este documento registra o estado consolidado do projeto e as diretrizes operacionais estritas para futuras sessões de desenvolvimento, manutenção e atuação de agentes de IA.

---

## 📌 Resumo Executivo

- **Produto**: Sistema interno de help desk para suporte de TI da Maple Bear Araxá.
- **Público**: Colaboradores com contas `@maplebeararaxa.com.br` e equipe técnica administradora.
- **Stack Tecnológica**: Next.js 16.2.10, React 19.2.4, TypeScript 5, Tailwind CSS 4, Supabase (Auth, PostgreSQL com RLS, Realtime, Storage) e Upstash Redis.
- **Repositório**: `https://github.com/mb-araxa/Maple-Help.git` (Branch principal: `main`).
- **Projeto Supabase Corporativo**: `Maple Help-arx` (Project Ref: `pggzxierizlypanjvlyg`).
- **Última Revisão**: 01 de setembro de 2026.

---

## 🏛️ Estado Confirmado da Infraestrutura Corporativa

Em 01 de setembro de 2026:
1. **Estrutura do Chat Aplicada**: A estrutura completa de tabelas (`chamado_mensagens`, `chamado_chat_leituras`), triggers e políticas de RLS do chat interno foi aplicada no Supabase corporativo.
2. **Testes de RLS Executados e Aprovados**: O chat foi submetido a testes transacionais com rollback simulando usuário comum e administrador:
   - O solicitante conseguiu enviar e ler mensagens do seu próprio chamado.
   - Um segundo usuário foi devidamente bloqueado de acessar o chamado alheio.
   - O administrador visualizou e interagiu com a conversa.
   - Nenhum dado residual foi deixado no banco de produção.
3. **Funções de Domínio Saneadas**:
   - As funções `check_email_domain` e `validar_dominio_maple` foram atualizadas para `SECURITY INVOKER` com `SET search_path = ''`.
   - Permissões de execução direta foram revogadas de `public`, `anon`, `authenticated` e `service_role`, sendo concedidas exclusivamente a `supabase_auth_admin`.
   - O *Security Advisor* do Supabase não apresenta mais advertências para essas funções.
4. **Alerta Pendente no Security Advisor**:
   - Permanece o aviso: *"Leaked Password Protection Disabled"*.
   - **Motivo**: O projeto encontra-se no plano Free do Supabase, e essa funcionalidade requer o plano Pro ou superior. Nenhuma contratação ou upgrade deve ser feito sem aprovação formal.
5. **Esquema Consolidado Único**:
   - O arquivo `supabase/maple_help_schema.sql` consolida todo o banco para criação de instâncias novas. Ele **não deve** ser executado cegamente em bancos já inicializados para não causar conflitos com tabelas que já integram a publicação `supabase_realtime`.

---

## 🚫 Regras Inegociáveis (Não Quebrar)

1. **PROIBIDO WHATSAPP**: O sistema não possui, não integra e não terá suporte a WhatsApp. O chat opera **exclusivamente com notificações internas e badges no aplicativo**. Nunca mencione, proponha ou adicione WhatsApp.
2. **ISOLAMENTO DO CHAT**: O chat não dispara e-mails. E-mails transacionais (Resend) são usados exclusivamente para avisar quando um chamado é *Assumido* ou *Concluído*.
3. **FONTE OFICIAL DE ADMINS**: A tabela `public.app_admins` no PostgreSQL é a fonte primária de autorização. A variável `ADMIN_EMAILS` é apenas um fallback de contingência caso a tabela não exista (erro `42P01`).
4. **BLOQUEIO DE MENSAGENS EM CONCLUÍDOS**: Quando um chamado é finalizado (`Concluído`), o chat é bloqueado para novas mensagens para ambas as partes (solicitante e TI), mantendo o histórico legível.
5. **DOMÍNIO INSTITUCIONAL**: Nenhuma conta fora de `@maplebeararaxa.com.br` pode ter permissão de cadastro ou login.
6. **SEGURANÇA DE CHAVES**: A `SUPABASE_SERVICE_ROLE_KEY` e a `RESEND_API_KEY` são segredos de servidor. Nunca utilize essas chaves no frontend nem exponha variáveis confidenciais.
7. **NÃO APLICAR ESQUEMA COMPLETO EM BANCO EXISTENTE**: Para bancos em execução, aplique apenas migrações pontuais.

---

## 📁 Arquivos Críticos do Projeto

| Arquivo | Responsabilidade Principal |
| --- | --- |
| `app/page.tsx` | Autenticação (Login, Cadastro e Recuperação) com validação de domínio |
| `app/menu/page.tsx` | Hub de navegação com checagem de permissão administrativa |
| `app/chamado/page.tsx` | Tela de abertura de chamados |
| `components/ChamadoForm.tsx` | Formulário de abertura, validações de anexo e upload no Storage |
| `app/chamado/meus-chamados/page.tsx` | Acompanhamento de chamados, chat do solicitante e avaliação |
| `app/adm/page.tsx` | Painel Kanban administrativo da TI com Realtime |
| `components/ChamadoModal.tsx` | Modal de detalhes do chamado, aba de chat e ações de atendimento |
| `app/adm/relatorios/page.tsx` | Dashboard mensal, gráficos e acionador da exportação Excel |
| `app/actions/chamados.ts` | Server Actions de chamados, avaliações, relatórios e permissões |
| `app/actions/chamadoChat.ts` | Server Actions do chat (mensagens, paginação, leituras e rate limit) |
| `components/chamado-chat/` | Componentes visuais da conversa, compositor e badges de não lidas |
| `lib/chamadoEmail.ts` | Notificações de e-mail seguras via Resend (apenas status de chamado) |
| `lib/reportCharts.ts` | Processamento de dados e geração de gráficos vetoriais para Excel |
| `lib/supabase.ts` | Cliente Supabase para o navegador (Auth e Realtime) |
| `proxy.ts` | Middleware Next.js de validação de sessão e proteção da rota `/adm` |
| `types/database.ts` | Definição de tipos TypeScript do banco e da aplicação |
| `supabase/maple_help_schema.sql` | Esquema consolidado para inicialização de novos bancos |
| `supabase/tests/chamado_chat_rls.test.sql` | Testes automatizados de RLS do chat com pgTAP |

---

## 📋 Variáveis de Ambiente Esperadas

```env
# Supabase (Obrigatórias)
NEXT_PUBLIC_SUPABASE_URL=https://pggzxierizlypanjvlyg.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# Notificações de Status do Chamado via Resend (Opcionais)
SUPABASE_SERVICE_ROLE_KEY=
RESEND_API_KEY=
RESEND_EMAIL_DOMAIN=
RESEND_FROM_EMAIL=
APP_URL=https://maple-help.vercel.app

# Rate Limit Distribuído (Upstash Redis - Recomendadas em Produção)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Fallback Transitório de Admins
ADMIN_EMAILS=
```

---

## 🛠️ Procedimentos de Manutenção Comuns

### Gestão de Administradores
- **Adicionar**:
  ```sql
  insert into public.app_admins (email)
  values (lower(trim('usuario@maplebeararaxa.com.br')))
  on conflict (email) do nothing;
  ```
- **Remover**:
  ```sql
  delete from public.app_admins
  where email = lower(trim('usuario@maplebeararaxa.com.br'));
  ```

---

## ✅ Checklists de Trabalho

### Antes de Realizar Qualquer Edição
- [ ] Executar `git status --short` para checar arquivos pendentes.
- [ ] Confirmar se a alteração solicitada não quebra nenhuma das regras inegociáveis.
- [ ] Verificar se as alterações afetam tipos em `types/database.ts` ou Server Actions.

### Depois de Realizar Edições
- [ ] Executar `npm run lint` e corrigir problemas estáticos.
- [ ] Executar `npx tsc --noEmit` para validação de tipos TypeScript.
- [ ] Executar `npm run test` para rodar a suíte Vitest.
- [ ] Executar `npm run build` para garantir que a compilação de produção não quebrou.
- [ ] Executar `git diff --check` para garantir que não há conflitos ou espaçamentos corrompidos.
- [ ] Manter `README.md`, `DOCUMENTATION.md` e `CONTEXTO_AGENTE.md` sincronizados.
