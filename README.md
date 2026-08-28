# Maple Help

Sistema interno de help desk da Maple Bear Araxá para abertura, acompanhamento e gestão de chamados de TI.

## Estado atual

O fluxo principal de suporte de TI está implementado: autenticação institucional, abertura e acompanhamento de chamados, chat interno em tempo real por chamado, painel administrativo em tempo real, avaliação do atendimento e relatórios com exportação para Excel.

O projeto está em fase de **estabilização e migração da infraestrutura para as contas corporativas da Maple**. A migração de Supabase e Vercel deve ser tratada como pendente até que as variáveis de ambiente, o banco e os fluxos de produção sejam validados na nova estrutura.

O módulo de Manutenção Estrutural aparece no menu, mas continua indisponível e não faz parte do escopo funcional atual.

## Funcionalidades

- Login, cadastro e recuperação de senha com e-mail `@maplebeararaxa.com.br`.
- Abertura de chamados de TI com categoria, local, descrição e imagem opcional.
- Acompanhamento dos próprios chamados e da solução registrada pela equipe.
- **Chat interno por chamado**: conversa em tempo real e independente para cada chamado entre o solicitante e a equipe de TI, com controle de leitura, badges de mensagens não lidas e bloqueio mútuo após conclusão. Notificações ocorrem exclusivamente dentro do aplicativo (sem envio de e-mails, Resend ou WhatsApp para o chat).
- Avaliação de 1 a 5 estrelas após a conclusão do atendimento.
- Avisos por e-mail no chamado original, quando o serviço legado estiver configurado, ao aceitar ou concluir um chamado, com atalho para a avaliação.
- Painel administrativo com chamados pendentes, em andamento e concluídos no dia.
- Ações administrativas para assumir, concluir e excluir chamados.
- Atualização do painel e do chat em tempo real pelo Supabase Realtime.
- Relatórios mensais com gráfico de categorias, chamados por dia útil, paginação e exportação completa em `.xlsx` com os gráficos.
- Limite de taxa (Rate Limit) para criação de chamados e mensagens do chat via Upstash Redis (com fallback em memória).

## Tecnologias

- Next.js 16 com App Router
- React 19 e TypeScript
- Tailwind CSS 4
- Supabase Auth, PostgreSQL, Storage e Realtime
- Upstash Redis para rate limit em produção, com fallback em memória no ambiente local
- ExcelJS e FileSaver para exportação de planilhas
- Recharts para gráficos
- Vitest e Testing Library para testes unitários e de componentes

## Execução local

### Requisitos

- Node.js 20.9.0 ou superior
- npm
- Um projeto Supabase configurado com o esquema usado pelo Maple Help

### Configuração

1. Instale as dependências:

   ```bash
   npm ci
   ```

2. Crie o arquivo `.env.local` na raiz:

   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_chave_anon

   # Notificações do chamado original (opcional)
   SUPABASE_SERVICE_ROLE_KEY=sua_chave_service_role
   RESEND_API_KEY=sua_chave_resend
   RESEND_EMAIL_DOMAIN=dominio-verificado.com.br
   RESEND_FROM_EMAIL=Maple Help <outro-endereco@dominio-verificado.com.br>
   APP_URL=https://maple-help.vercel.app

   # Opcionais no ambiente local; recomendadas em produção
   UPSTASH_REDIS_REST_URL=https://seu-redis.upstash.io
   UPSTASH_REDIS_REST_TOKEN=seu_token_upstash
   ```

   *Nota de Segurança: A lista oficial de administradores é gerenciada de forma centralizada e segura no banco de dados na tabela `public.app_admins`.*

3. Inicie o projeto:

   ```bash
   npm run dev
   ```

4. Acesse [http://localhost:3000](http://localhost:3000).

Não versionar arquivos `.env` nem incluir credenciais na documentação.

## Comandos

| Comando | Finalidade |
| --- | --- |
| `npm run dev` | Inicia o ambiente de desenvolvimento |
| `npm run build` | Gera a versão de produção |
| `npm run start` | Executa a versão já construída |
| `npm run lint` | Valida padrões e problemas estáticos |
| `npm run test` | Executa os testes unitários com Vitest |
| `npx tsc --noEmit` | Valida os tipos TypeScript |

## Estrutura principal

```text
app/                    Rotas, páginas e Server Actions (chamados.ts, chamadoChat.ts)
components/             Componentes de interface, formulários e modais
components/chamado-chat/
                        Componentes do chat interno (ChamadoChat, MensagemChat, Compositor, Badges)
components/ui/          Componentes visuais reutilizáveis
lib/                    Cliente Supabase e funções compartilhadas
types/                  Tipos do domínio (database.ts)
__tests__/              Testes unitários e de componentes
supabase/migrations/    Migrações incrementais
supabase/maple_help_schema.sql
                        Reprodução do esquema atual para a migração corporativa
```

## Documentação

- [Documentação funcional e técnica](./DOCUMENTATION.md)
- [Contexto operacional para agentes e mantenedores](./CONTEXTO_AGENTE.md)
- [Esquema atual do Supabase](./supabase/maple_help_schema.sql)

Antes de alterar infraestrutura ou comportamento do sistema, confira o estado de migração registrado em `CONTEXTO_AGENTE.md` e mantenha os três documentos sincronizados.
