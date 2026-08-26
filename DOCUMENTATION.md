# Documentação do Maple Help

## 1. Objetivo

O Maple Help centraliza solicitações internas de suporte de TI da Maple Bear Araxá. Colaboradores abrem e acompanham chamados; administradores organizam a fila, registram o atendimento e geram relatórios mensais.

## 2. Escopo da versão atual

### Disponível

- Autenticação com e-mail institucional.
- Cadastro, login e recuperação de senha.
- Abertura de chamados de TI.
- Upload opcional de imagens JPEG, PNG ou WEBP de até 5 MB.
- Consulta dos chamados do usuário autenticado.
- Fluxo de status `Pendente` → `Em Andamento` → `Concluído`.
- Registro de responsável, solução e tempo gasto.
- Avaliação única do chamado concluído, com nota de 1 a 5 e comentário opcional.
- Painel administrativo com atualização em tempo real.
- Relatórios mensais, gráficos e exportação completa em Excel.

### Fora do escopo atual

- Chamados de Manutenção Estrutural. O card existe apenas como indicação de funcionalidade futura.
- Notificações automáticas sobre mudanças no chamado.
- Aplicativo móvel nativo.

## 3. Perfis e permissões

### Colaborador

- Usa uma conta do domínio `@maplebeararaxa.com.br`.
- Abre chamados e acompanha os chamados associados ao seu usuário.
- Consulta a solução de chamados concluídos.
- Envia uma única avaliação por chamado concluído.

### Administrador

- É identificado pela lista `ADMIN_EMAILS` do ambiente.
- Acessa `/adm` e `/adm/relatorios`.
- Visualiza a fila administrativa.
- Assume, conclui e exclui chamados.
- Consulta indicadores e exporta relatórios.

A interface oculta o acesso administrativo de usuários comuns, o `proxy.ts` protege as rotas `/adm` e as Server Actions administrativas repetem a validação de permissão no servidor.

## 4. Fluxos principais

### Autenticação

1. O usuário acessa `/`.
2. A interface valida o domínio institucional.
3. O Supabase Auth realiza cadastro, login ou recuperação de senha.
4. Após o login, o usuário é direcionado para `/menu`.

O banco também possui validações de domínio descritas no esquema SQL. A confirmação de e-mail depende da configuração do projeto Supabase usado pelo ambiente.

### Abertura de chamado

1. O usuário acessa `/chamado` pelo menu.
2. Informa solicitante, local, categoria e descrição.
3. Se houver imagem, o navegador valida formato e tamanho e envia o arquivo ao bucket `chamados-anexos`.
4. A Server Action valida os campos com Zod e cria o registro com status `Pendente`.
5. O limite padrão é de 5 aberturas a cada 10 minutos por IP.

Categorias atuais de TI:

- Wi-fi | Cabeamento
- Computador | Notebook
- Televisão | Som
- Ajuda | Duvidas
- Outros

### Atendimento administrativo

1. Chamados novos entram em `Pendente`.
2. Ao assumir um chamado, o sistema altera o status para `Em Andamento` e registra o primeiro nome do administrador.
3. Ao finalizar, o administrador informa a solução e o tempo gasto.
4. O sistema altera o status para `Concluído` e grava a data de resolução.
5. O solicitante passa a poder avaliar o atendimento.

### Relatórios

O painel `/adm/relatorios` filtra os dados por mês e ano e apresenta:

- total de chamados concluídos no período;
- tempo médio entre criação e conclusão;
- categoria mais recorrente;
- distribuição por status dos chamados criados no mês;
- distribuição por categoria;
- tabela de concluídos com 50 registros por página.

A exportação consulta todos os chamados concluídos do período no momento do clique, em lotes de até 1.000 registros, e gera `Relatorio-Maple-Help-MM-AAAA.xlsx`. O arquivo contém uma aba de resumo e uma aba com os chamados completos; não depende da página visível na tabela.

## 5. Rotas

| Rota | Público-alvo | Função |
| --- | --- | --- |
| `/` | Todos | Login, cadastro e recuperação de senha |
| `/menu` | Usuário autenticado | Hub de navegação |
| `/chamado` | Usuário autenticado | Abertura de chamado de TI |
| `/chamado/meus-chamados` | Usuário autenticado | Acompanhamento e avaliação |
| `/adm` | Administrador | Gestão da fila de chamados |
| `/adm/relatorios` | Administrador | Indicadores e exportação mensal |

## 6. Arquitetura

### Interface

As páginas usam o App Router do Next.js. Componentes reutilizáveis ficam em `components/`, e os elementos básicos da interface ficam em `components/ui/`.

### Regras do servidor

As operações de chamados estão concentradas em `app/actions/chamados.ts`. Esse arquivo reúne validação Zod, autenticação, autorização administrativa, rate limit e acesso ao Supabase.

### Dados e serviços

- `lib/supabase.ts`: cliente Supabase usado no navegador.
- `proxy.ts`: renovação de sessão e proteção das rotas administrativas.
- Supabase Auth: usuários e sessões.
- PostgreSQL: chamados e avaliações.
- Supabase Storage: anexos.
- Supabase Realtime: atualização do painel administrativo.
- Upstash Redis: rate limit distribuído quando configurado.

## 7. Modelo de dados

### `public.chamados`

| Campo | Uso |
| --- | --- |
| `id` | Identificador UUID |
| `solicitante` | Nome informado no formulário |
| `local` | Local do atendimento |
| `categoria` | Categoria do problema |
| `descricao` | Detalhes da solicitação |
| `status` | Estado atual do chamado |
| `resolucao` | Solução registrada pelo administrador |
| `data_criacao` | Data de abertura |
| `data_resolucao` | Data de conclusão |
| `responsavel` | Administrador que assumiu o chamado |
| `tempo_gasto` | Tempo informado na conclusão |
| `anexo_url` | Caminho do arquivo no Storage |
| `user_id` | Usuário do Supabase Auth associado ao chamado |

### `public.chamado_avaliacoes`

| Campo | Uso |
| --- | --- |
| `id` | Identificador UUID |
| `chamado_id` | Chamado avaliado; valor único na tabela |
| `user_id` | Autor da avaliação |
| `nota` | Inteiro de 1 a 5 |
| `comentario` | Texto opcional de até 500 caracteres |
| `created_at` | Data de envio |

O arquivo `supabase/maple_help_schema.sql` reproduz a estrutura atualmente utilizada, incluindo tabelas, políticas, bucket, validações de domínio e publicação Realtime. A migração incremental de avaliações está em `supabase/migrations/20260811_chamado_avaliacoes.sql`.

## 8. Variáveis de ambiente

| Variável | Obrigatória | Finalidade |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Sim | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Sim | Chave pública do Supabase |
| `ADMIN_EMAILS` | Sim | Lista de administradores separada por vírgulas |
| `UPSTASH_REDIS_REST_URL` | Recomendada em produção | Endpoint REST do Redis |
| `UPSTASH_REDIS_REST_TOKEN` | Recomendada em produção | Token REST do Redis |

Sem as variáveis do Upstash, o projeto usa um contador em memória. Esse fallback serve para desenvolvimento e não é compartilhado entre instâncias de produção.

## 9. Segurança e dados

- Não registrar chaves, tokens ou senhas no repositório.
- Manter `ADMIN_EMAILS` igual nos ambientes que executam o sistema.
- Preservar a restrição ao domínio institucional no frontend e no Supabase Auth.
- Manter a validação administrativa no servidor; ocultar um botão não substitui autorização.
- Anexos são armazenados pelo caminho do usuário e lidos por URL assinada quando o valor salvo não é uma URL completa.
- O esquema SQL de migração preserva as políticas atuais do banco. As políticas de RLS devem ser revisadas como etapa de segurança da migração corporativa, sem alterar silenciosamente o comportamento durante a cópia.

## 10. Testes e validação

Antes de publicar uma alteração:

```bash
npm run lint
npx tsc --noEmit
npm run test
npm run build
```

Os testes unitários atuais cobrem autorização administrativa, validação de abertura de chamado e rejeição de UUID inválido. Eles não substituem a validação manual dos fluxos no navegador.

Checklist funcional mínimo:

1. Entrar com conta institucional comum.
2. Abrir chamado com e sem anexo.
3. Confirmar o chamado em Meus Chamados.
4. Entrar com administrador e assumir o chamado.
5. Concluir com solução e tempo gasto.
6. Enviar a avaliação pelo usuário solicitante.
7. Conferir gráficos, tabela e arquivo Excel do período.
8. Confirmar que um usuário comum não acessa `/adm`.

## 11. Implantação e migração corporativa

O código está preparado para Vercel e Supabase, mas a transferência para a infraestrutura corporativa ainda não deve ser considerada concluída.

Ordem recomendada para a migração:

1. Criar ou selecionar o projeto Supabase corporativo.
2. Aplicar `supabase/maple_help_schema.sql` sem modificar o arquivo durante a execução da cópia.
3. Migrar usuários e dados conforme a estratégia aprovada.
4. Configurar Auth, URLs de redirecionamento, Storage e Realtime.
5. Configurar todas as variáveis de ambiente no projeto Vercel corporativo.
6. Publicar uma implantação de validação.
7. Executar o checklist funcional completo.
8. Trocar o ambiente de produção somente após a aprovação.

Registrar a conclusão de cada etapa em `CONTEXTO_AGENTE.md`. Não remover a integração antiga antes de confirmar que a nova atende os fluxos essenciais e que existe caminho de retorno.
