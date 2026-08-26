# Contexto operacional do Maple Help

Este arquivo registra o estado atual do projeto para futuras sessões de manutenção. Ele complementa o `README.md` e a `DOCUMENTATION.md`; não substitui a leitura do código nem do esquema SQL.

## Resumo

- Produto: sistema interno de chamados de TI da Maple Bear Araxá.
- Público: colaboradores com e-mail institucional e equipe administradora.
- Stack: Next.js 16, React 19, TypeScript, Tailwind CSS 4, Supabase e Upstash.
- Branch principal atual: `main`.
- Fase: estabilização do produto e migração da infraestrutura para contas corporativas.

## Estado da migração

### Preparado

- O esquema atual do banco foi consolidado em `supabase/maple_help_schema.sql`.
- O repositório contém as dependências e configurações usadas pelo aplicativo atual.
- A conta corporativa de destino foi acessada para preparação da mudança.

### Pendente de confirmação

- Aplicação e validação do esquema no Supabase corporativo.
- Estratégia e execução da transferência de usuários, chamados, avaliações e anexos.
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
- Avaliação de atendimentos concluídos.
- Painel administrativo em tempo real.
- Ações de assumir, concluir e excluir chamado.
- Relatórios mensais com métricas, gráficos e exportação completa em Excel.
- Rate limit com Upstash e fallback local em memória.

## Limites atuais

- Manutenção Estrutural está marcada como “Em breve” e não possui fluxo próprio.
- Não há notificação automática de atualização do chamado.
- Os testes existentes são unitários e cobrem apenas parte das Server Actions.
- A proteção de administrador depende de `ADMIN_EMAILS`; sem essa variável, ninguém é reconhecido como administrador pela aplicação.
- O filtro de anos da tela de relatórios contém atualmente 2026 e 2027.
- O esquema de migração preserva as políticas de RLS existentes. Qualquer reforço de segurança deve ser planejado e entregue separadamente para não alterar a cópia solicitada.

## Regras de negócio que devem ser preservadas

1. Somente e-mails `@maplebeararaxa.com.br` podem criar contas pela interface.
2. Administradores são definidos por correspondência exata em `ADMIN_EMAILS`.
3. Um chamado nasce como `Pendente`.
4. Ao ser assumido, passa para `Em Andamento` e recebe um responsável.
5. Ao ser finalizado, passa para `Concluído` e recebe solução, tempo gasto e data de resolução.
6. Somente o solicitante pode avaliar o próprio chamado concluído.
7. Cada chamado aceita apenas uma avaliação.
8. Imagens aceitas: JPEG, PNG e WEBP, com até 5 MB.
9. A exportação deve conter todos os concluídos do período, não apenas a página exibida.
10. O módulo ativo é TI; Manutenção Estrutural continua fora do escopo até uma decisão explícita.

## Pontos principais do código

| Área | Arquivo |
| --- | --- |
| Login e cadastro | `app/page.tsx` |
| Menu principal | `app/menu/page.tsx` |
| Abertura de chamado | `app/chamado/page.tsx` e `components/ChamadoForm.tsx` |
| Meus Chamados | `app/chamado/meus-chamados/page.tsx` |
| Server Actions | `app/actions/chamados.ts` |
| Painel administrativo | `app/adm/page.tsx` |
| Relatórios e Excel | `app/adm/relatorios/page.tsx` |
| Proteção de rotas | `proxy.ts` |
| Permissões administrativas | `lib/utils.ts` |
| Tipos do domínio | `types/database.ts` |
| Esquema para migração | `supabase/maple_help_schema.sql` |

## Variáveis esperadas

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
ADMIN_EMAILS=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

As duas variáveis do Upstash são recomendadas em produção. Sem elas, o sistema usa o fallback em memória, que não é compartilhado entre instâncias. Nunca copiar valores sensíveis para este arquivo, para commits ou para mensagens públicas.

## Ordem de trabalho recomendada nesta fase

1. Preservar o ambiente atual enquanto a migração é preparada.
2. Validar o esquema e os serviços no Supabase corporativo.
3. Configurar o projeto Vercel corporativo com as variáveis corretas.
4. Testar autenticação, abertura, anexos, administração, avaliação e relatórios.
5. Formalizar a troca de produção e o plano de retorno.
6. Somente depois retomar novas funcionalidades, como manutenção ou notificações.

## Critério para considerar a migração concluída

A migração só está concluída quando:

- o domínio de produção aponta para a implantação corporativa aprovada;
- usuários autorizados conseguem entrar;
- dados e anexos necessários estão disponíveis;
- um chamado percorre o fluxo completo;
- o painel em tempo real atualiza corretamente;
- o relatório Excel contém os dados do período;
- as permissões de usuário comum e administrador foram testadas;
- a equipe aprovou a troca e o caminho de retorno está documentado.

## Regra de atualização da documentação

Ao concluir uma mudança relevante:

- atualizar o `README.md` se ela afetar instalação, escopo ou uso;
- atualizar a `DOCUMENTATION.md` se ela afetar arquitetura, fluxo, dados ou operação;
- atualizar este arquivo se ela alterar a fase, pendências ou decisões vigentes;
- remover informações superadas em vez de acumular planos contraditórios.
