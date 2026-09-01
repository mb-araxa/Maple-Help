# Contexto operacional do Maple Help

Este arquivo registra o estado atual do projeto para futuras sessões de manutenção. Ele complementa o `README.md` e a `DOCUMENTATION.md`; não substitui a leitura do código nem do esquema SQL.

## Resumo

- Produto: sistema interno de chamados de TI da Maple Bear Araxá.
- Público: colaboradores com e-mail institucional e equipe administradora.
- Stack: Next.js 16, React 19, TypeScript, Tailwind CSS 4, Supabase (Auth, Database, Realtime, Storage) e Upstash Redis.
- Branch principal atual: `main`.
- Fase: estabilização do produto, chat interno por chamado implementado e migração da infraestrutura para contas corporativas.

## Estado da migração

### Preparado

- O esquema atual do banco, incluindo o chat por chamado, está consolidado em `supabase/maple_help_schema.sql`.
- A autorização de administradores está unificada no banco em `public.app_admins`.
- O repositório contém as dependências e configurações usadas pelo aplicativo atual.
- A conta corporativa de destino foi acessada para preparação da mudança.

### Pendente de confirmação

- Aplicação e validação do esquema no Supabase corporativo.
- Estratégia e execução da transferência de usuários, chamados, mensagens, avaliações e anexos.
- Configuração final do Auth, Storage e Realtime no novo projeto.
- Configuração das variáveis no projeto Vercel corporativo.
- Validação ponta a ponta da implantação corporativa.
- Desativação das integrações antigas.

Não afirmar que a migração foi concluída apenas porque as contas corporativas estão acessíveis. Não remover nem substituir a infraestrutura antiga antes da validação do novo ambiente e da definição de um caminho de retorno.

## Funcionalidades confirmadas no código

- Login, cadastro e recuperação de senha com domínio institucional.
- Menu com acesso a TI, Meus Chamados e painel administrativo condicional.
- Abertura de chamados de TI com imagem opcional.
- Acompanhamento dos chamados do usuário.
- **Chat interno individual por chamado**: comunicação em tempo real entre solicitante e TI, badges de não lidas, controle de leitura e bloqueio mútuo após conclusão (sem uso de e-mail/WhatsApp).
- Avaliação de atendimentos concluídos.
- Painel administrativo em tempo real (Kanban).
- Ações de assumir, concluir e excluir chamado.
- Relatórios mensais com métricas, gráficos e exportação completa em Excel.
- Rate limit com Upstash e fallback local em memória.

## Regras de negócio que devem ser preservadas

1. Somente e-mails `@maplebeararaxa.com.br` podem criar contas pela interface.
2. A lista de administradores tem como fonte única a tabela `public.app_admins`.
3. Um chamado nasce como `Pendente`.
4. Ao ser assumido, passa para `Em Andamento` e recebe um responsável.
5. Ao ser finalizado, passa para `Concluído` e recebe solução, tempo gasto e data de resolução.
6. Em chamados `Concluídos`, o chat bloqueia novas mensagens para ambos os lados, preservando o histórico integral.
7. Somente o solicitante pode avaliar o próprio chamado concluído.
8. Cada chamado aceita apenas uma avaliação.
9. Imagens aceitas: JPEG, PNG e WEBP, com até 5 MB.
10. A exportação deve conter todos os concluídos do período, não apenas a página exibida.
11. O módulo ativo é TI; Manutenção Estrutural continua fora do escopo até uma decisão explícita.
12. O chat funciona exclusivamente com badges e notificações in-app; não adicionar Resend nem WhatsApp.

## Pontos principais do código

| Área | Arquivo |
| --- | --- |
| Login e cadastro | `app/page.tsx` |
| Menu principal | `app/menu/page.tsx` |
| Abertura de chamado | `app/chamado/page.tsx` e `components/ChamadoForm.tsx` |
| Meus Chamados & Chat | `app/chamado/meus-chamados/page.tsx` |
| Componentes do Chat | `components/chamado-chat/` (`ChamadoChat.tsx`, `MensagemChat.tsx`, `CompositorMensagem.tsx`, `IndicadorNaoLidas.tsx`) |
| Server Actions de Chamados | `app/actions/chamados.ts` |
| Server Actions do Chat | `app/actions/chamadoChat.ts` |
| Painel administrativo | `app/adm/page.tsx` e `components/ChamadoModal.tsx` |
| Relatórios e Excel | `app/adm/relatorios/page.tsx` |
| Proteção de rotas | `proxy.ts` |
| Tipos do domínio | `types/database.ts` |
| Esquema consolidado | `supabase/maple_help_schema.sql` |

## Variáveis esperadas

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
RESEND_API_KEY=
RESEND_EMAIL_DOMAIN=
RESEND_FROM_EMAIL=
APP_URL=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

A autorização administrativa consulta diretamente a tabela `public.app_admins` no banco. As variáveis do Upstash controlam rate limit distribuído. Nunca copiar valores sensíveis para este arquivo, para commits ou para mensagens públicas.
