# Documentação do Maple Help

## 1. Objetivo

O Maple Help centraliza solicitações internas de suporte de TI da Maple Bear Araxá. Colaboradores abrem e acompanham chamados e conversam diretamente com a equipe de TI por meio de um chat interno; administradores organizam a fila, atendem as solicitações via chat em tempo real, registram resoluções e geram relatórios mensais.

## 2. Escopo da versão atual

### Disponível

- Autenticação com e-mail institucional do domínio `@maplebeararaxa.com.br`.
- Cadastro, login e recuperação de senha.
- Abertura de chamados de TI com upload opcional de imagens (JPEG, PNG, WEBP até 5 MB).
- Consulta e acompanhamento dos chamados do usuário autenticado em "Meus Chamados".
- **Chat interno por chamado**:
  - Conversa em tempo real individual para cada chamado entre solicitante e equipe de TI.
  - Disponível dentro do card expandido em "Meus Chamados" e na aba "Conversa" no modal do administrador.
  - Notificações visuais e badges de mensagens não lidas in-app (sem e-mails ou WhatsApp).
  - Bloqueio mútuo de novas mensagens após a conclusão do atendimento, mantendo o histórico integral para consulta.
  - Paginação segura por cursor composto `(created_at, id)` e ordenação cronológica.
- Fluxo de status `Pendente` → `Em Andamento` → `Concluído`.
- Registro de responsável, solução e tempo gasto.
- Avaliação única do chamado concluído, com nota de 1 a 5 e comentário opcional.
- Painel administrativo com Kanban e atualização em tempo real via Supabase Realtime.
- Relatórios mensais, gráficos e exportação completa em Excel (`.xlsx`).

### Fora do escopo atual

- Chamados de Manutenção Estrutural (indicador visual futuro no menu).
- Notificações externas por e-mail ou WhatsApp para o chat (o chat opera estritamente com badges e notificações in-app).
- Áudios, reações ou anexos adicionais dentro da conversa do chat.
- Aplicativo móvel nativo.

## 3. Perfis e permissões

### Fonte Única de Administradores (`public.app_admins`)

A autorização administrativa é centralizada no banco de dados na tabela `public.app_admins`. A função `public.is_admin()` (`STABLE`, `SECURITY INVOKER`, `SET search_path = public, pg_temp`) compara o e-mail autenticado e assinado do JWT contra a tabela.

### Colaborador

- Usa uma conta do domínio `@maplebeararaxa.com.br`.
- Abre chamados para si mesmo (`user_id = auth.uid()`).
- Consulta apenas os próprios chamados e mensagens associadas.
- Envia mensagens no chat de seus chamados abertos (`Pendente` ou `Em Andamento`).
- Consulta a solução e histórico de mensagens de chamados concluídos.
- Envia uma única avaliação por chamado concluído.

### Administrador

- Cadastro verificado na tabela `public.app_admins`.
- Acessa `/adm` e `/adm/relatorios`.
- Visualiza a fila administrativa completa de chamados e todas as conversas de chat.
- Assume, conclui e exclui chamados.
- Envia mensagens em qualquer chamado aberto como "Equipe de TI".
- Consulta indicadores e exporta relatórios.

O `proxy.ts` protege as rotas `/adm`, as Server Actions validam a sessão com `supabase.auth.getUser()`, e o banco de dados impõe políticas estritas de Row Level Security (RLS).

## 4. Fluxos principais

### Autenticação

1. O usuário acessa `/`.
2. A interface valida o domínio institucional.
3. O Supabase Auth realiza cadastro, login ou recuperação de senha.
4. Após o login, o usuário é direcionado para `/menu`.

### Abertura de chamado

1. O usuário acessa `/chamado` pelo menu.
2. Informa solicitante, local, categoria e descrição.
3. Se houver imagem, o arquivo é enviado ao bucket `chamados-anexos`.
4. A Server Action `abrirChamado` valida os campos com Zod e grava o registro com `user_id = auth.uid()` e status `Pendente`.
5. Rate limit: 5 chamados a cada 10 minutos por IP.

### Chat interno por chamado

1. **Acesso do Usuário**: Na página `/chamado/meus-chamados`, cada card possui o botão "Conversa com a equipe de TI" com badge de mensagens não lidas.
2. **Acesso da TI**: No `/adm`, os cards exibem badges de mensagens não lidas e o modal de detalhes possui a aba "Conversa".
3. **Envio de Mensagem**:
   - Validação Zod (1 a 2.000 caracteres pós-trim).
   - O autor é obtido da sessão segura via `auth.getUser()`.
   - Um trigger `BEFORE INSERT` no banco define/sobrescreve com segurança `autor_id`, `autor_tipo` e `autor_nome`.
   - O autor tem sua leitura (`last_read_at`) atualizada automaticamente.
4. **Atualização em Tempo Real**:
   - Eventos `INSERT` na tabela `chamado_mensagens` são entregues pelo canal Realtime.
   - Mensagens otimistas são reconciliadas pelo ID.
   - Cards fechados recebem incremento no badge de não lidas.
5. **Conclusão do Atendimento**:
   - Ao concluir o chamado, o compositor é bloqueado para ambos (solicitante e TI), exibindo aviso explicativo. O histórico completo é preservado.

### Atendimento administrativo e relatórios

1. Chamados em `Pendente` podem ser assumidos por um administrador, passando para `Em Andamento`.
2. Ao finalizar, o administrador informa a solução e o tempo gasto, alterando para `Concluído`.
3. O painel `/adm/relatorios` permite filtrar por mês/ano e exportar planilhas Excel formatadas com gráficos.

## 5. Rotas

| Rota | Público-alvo | Função |
| --- | --- | --- |
| `/` | Todos | Login, cadastro e recuperação de senha |
| `/menu` | Usuário autenticado | Hub de navegação |
| `/chamado` | Usuário autenticado | Abertura de chamado de TI |
| `/chamado/meus-chamados` | Usuário autenticado | Acompanhamento, chat e avaliação |
| `/adm` | Administrador | Gestão da fila de chamados e chat |
| `/adm/relatorios` | Administrador | Indicadores e exportação mensal |

## 6. Arquitetura

### Interface

- App Router do Next.js 16 com React 19.
- Componentes modulares em `components/` e `components/chamado-chat/`.
- Design tokens em `app/globals.css`.

### Regras do servidor (Server Actions)

- `app/actions/chamados.ts`: Operações principais de chamados, relatórios e permissões.
- `app/actions/chamadoChat.ts`: Operações de chat (`obterMensagensDoChamado`, `enviarMensagemDoChamado`, `marcarChatComoLido`, `obterContadoresNaoLidos`).

### Dados e serviços

- `lib/supabase.ts`: Cliente Supabase para o navegador (Realtime e Auth).
- `proxy.ts`: Middleware de proteção com consulta a `app_admins`.
- Supabase Auth: Usuários e sessões.
- PostgreSQL: Tabelas `chamados`, `chamado_mensagens`, `chamado_chat_leituras`, `chamado_avaliacoes`, `app_admins`.
- Supabase Storage: Bucket `chamados-anexos`.
- Supabase Realtime: Publicações para `chamados` e `chamado_mensagens`.
- Upstash Redis: Rate limiting distribuído com fallback em memória para desenvolvimento.

## 7. Modelo de dados

### `public.app_admins`
| Campo | Tipo | Uso |
| --- | --- | --- |
| `email` | text (PK) | E-mail do administrador normalizado em minúsculas |
| `created_at` | timestamptz | Data de inclusão |

### `public.chamados`
| Campo | Tipo | Uso |
| --- | --- | --- |
| `id` | uuid (PK) | Identificador do chamado |
| `solicitante` | text | Nome do solicitante |
| `local` | text | Local do atendimento |
| `categoria` | text | Categoria do problema |
| `descricao` | text | Descrição detalhada |
| `status` | text | `Pendente`, `Em Andamento` ou `Concluído` |
| `resolucao` | text | Solução registrada pela TI |
| `data_criacao` | timestamptz | Data de abertura |
| `data_resolucao` | timestamptz | Data de conclusão |
| `responsavel` | text | Nome do atendente |
| `tempo_gasto` | text | Tempo informado |
| `anexo_url` | text | Caminho da imagem |
| `user_id` | uuid (FK) | Usuário do Supabase Auth (`ON DELETE SET NULL`) |

### `public.chamado_mensagens`
| Campo | Tipo | Uso |
| --- | --- | --- |
| `id` | uuid (PK) | Identificador da mensagem |
| `chamado_id` | uuid (FK) | Referência a `chamados.id` (`ON DELETE CASCADE`) |
| `autor_id` | uuid (FK) | Referência a `auth.users(id)` (`ON DELETE SET NULL`) |
| `autor_nome` | text | Nome do autor preservado historicamente |
| `autor_tipo` | text | `usuario` ou `ti` |
| `mensagem` | text | Conteúdo de 1 a 2.000 caracteres |
| `created_at` | timestamptz | Data e horário da mensagem |

### `public.chamado_chat_leituras`
| Campo | Tipo | Uso |
| --- | --- | --- |
| `chamado_id` | uuid (PK, FK) | Referência a `chamados.id` (`ON DELETE CASCADE`) |
| `user_id` | uuid (PK, FK) | Referência a `auth.users.id` (`ON DELETE CASCADE`) |
| `last_read_at` | timestamptz | Horário da última leitura registrado pelo banco |

## 8. Testes e validação

Antes de publicar uma alteração:

```bash
npm run lint
npx tsc --noEmit
npm run test
npm run build
```

Os testes automatizados em `__tests__/` cobrem:
- Validações Zod (mensagens vazias, limite de caracteres, UUIDs).
- Autorização administrativa e isolamento de usuários comuns.
- Bloqueio de envio em chamados concluídos para solicitante e TI.
- Renderização de componentes, estados de loading, erro e vazio.
- Acessibilidade e teclado (Enter vs Shift+Enter).
