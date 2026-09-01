# Maple Help

Sistema interno de help desk da **Maple Bear Araxá** para abertura, acompanhamento, comunicação em tempo real e gestão de chamados de suporte de TI.

---

## 📌 Estado Atual do Projeto

O fluxo completo de suporte de Tecnologia da Informação (TI) está implementado e validado:
- Autenticação restrita ao domínio institucional `@maplebeararaxa.com.br`.
- Abertura de chamados com categorização, local e upload opcional de imagem.
- Acompanhamento dos próprios chamados com visualização da solução registrada.
- **Chat interno por chamado**: canal de conversa individual em tempo real entre solicitante e equipe de TI, com controle de leitura, badges de mensagens não lidas e bloqueio automático de novas mensagens após a conclusão do chamado. As notificações operam estritamente dentro do aplicativo (sem envio de mensagens externas, SMS ou WhatsApp).
- Avaliação única de 1 a 5 estrelas com comentário opcional após conclusão.
- Notificações opcionais por e-mail (via Resend) ao assumir e concluir chamados, com link direto para avaliação.
- Painel administrativo em tempo real (Kanban) com atualização instantânea via Supabase Realtime.
- Relatórios mensais com métricas consolidadas, gráficos e exportação completa para planilha Excel (`.xlsx`).
- Proteção de taxa (Rate Limit) por IP para chamados e por usuário para o chat via Upstash Redis (com fallback em memória).

> **Infraestrutura Corporativa Confirmada (Setembro/2026):**
> - Projeto Supabase: `Maple Help-arx` (`pggzxierizlypanjvlyg`).
> - Esquema e políticas de RLS aplicados e testados.
> - As funções de validação de domínio institucional foram protegidas com `SECURITY INVOKER`, `search_path = ''` e permissão exclusiva para `supabase_auth_admin`.
> - O aviso restante no Security Advisor (*Leaked Password Protection Disabled*) decorre de limitação do plano Free do Supabase (recurso exclusivo de planos pagos; nenhuma contratação deve ser feita sem aprovação).
> - O módulo **Manutenção Estrutural** permanece apenas como indicador visual de expansão futura no menu.

---

## 🚀 Funcionalidades

### Para Colaboradores (Solicitantes)
- **Acesso Institucional**: Login, cadastro e recuperação de senha validados para `@maplebeararaxa.com.br`.
- **Abertura Rápida**: Formulário simplificado com categorias predefinidas, descrição e anexo de imagem (JPEG, PNG ou WEBP até 5 MB).
- **Meus Chamados**: Acompanhamento do status (`Pendente`, `Em Andamento`, `Concluído`) e solução detalhada.
- **Chat em Tempo Real**: Conversa direta com a equipe de TI no card do chamado, com badges de mensagens não lidas e envio otimizado.
- **Avaliação do Atendimento**: Formulário de nota (1 a 5) e feedback após o encerramento do chamado.

### Para a Equipe de TI (Administradores)
- **Painel Kanban em Tempo Real**: Visualização centralizada das filas de chamados *Pendentes*, *Em Andamento* e *Concluídos no Dia*.
- **Gestão de Chamados**: Ações para assumir chamado (atribuindo responsável), finalizar (com solução e tempo gasto) ou excluir.
- **Atendimento Integrado via Chat**: Aba de conversa dedicada no modal do chamado com histórico completo e identificação como "Equipe de TI".
- **Relatórios & Métricas**: Filtro por mês/ano com volume total, categorias mais recorrentes, chamados por dia útil e exportação integral para Excel com gráficos SVG embutidos.

---

## 🛠️ Tecnologias e Serviços

- **Frontend & Backend**: [Next.js 16.2.10](https://nextjs.org/) (App Router, Server Actions) com [React 19.2.4](https://react.dev/) e [TypeScript 5](https://www.typescriptlang.org/).
- **Estilização**: [Tailwind CSS 4](https://tailwindcss.com/) com design system corporativo.
- **Banco de Dados & Autenticação**: [Supabase](https://supabase.com/) (PostgreSQL 15+, Supabase Auth, Storage para anexos e Realtime).
- **Controle de Acesso**: Row Level Security (RLS) estrito no banco, autorização centralizada em `public.app_admins` e middleware `proxy.ts`.
- **Rate Limit**: [@upstash/ratelimit](https://upstash.com/) e [@upstash/redis](https://upstash.com/) com fallback automático em memória para ambiente de desenvolvimento.
- **Exportação de Dados**: [ExcelJS](https://github.com/exceljs/exceljs) e [FileSaver](https://github.com/eligrey/FileSaver.js).
- **Visualização de Dados**: [Recharts](https://recharts.org/) na web e gerador customizado de gráficos vetoriais SVG para a planilha.
- **E-mails Transacionais Opcionais**: [Resend](https://resend.com/) via chamadas HTTP seguras com chaves de idempotência (apenas para atualizações de status de chamado).
- **Testes & Qualidade**: [Vitest](https://vitest.dev/), Testing Library, ESLint 9 e TypeScript Strict Mode.

---

## 💻 Instalação e Execução Local

### Pré-requisitos
- **Node.js**: Versão `20.9.0` ou superior.
- **npm**: Gerenciador de pacotes padrão.
- Projeto no **Supabase** configurado com o esquema SQL do projeto.

### Passo a Passo

1. **Clone o repositório e acesse o diretório**:
   ```bash
   git clone https://github.com/mb-araxa/Maple-Help.git
   cd Maple-Help
   ```

2. **Instale as dependências exatas**:
   ```bash
   npm ci
   ```

3. **Configure as variáveis de ambiente**:
   Crie um arquivo `.env.local` na raiz do projeto:
   ```env
   # Obrigatórias — Supabase
   NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_chave_anonima_publicavel

   # Opcionais — Notificações de Status do Chamado via Resend
   SUPABASE_SERVICE_ROLE_KEY=sua_chave_service_role_secreta
   RESEND_API_KEY=re_sua_chave_resend
   RESEND_EMAIL_DOMAIN=seu-dominio-verificado.com.br
   RESEND_FROM_EMAIL=Maple Help <chamados@seu-dominio-verificado.com.br>
   APP_URL=http://localhost:3000

   # Recomendadas em Produção — Rate Limit Distribuído (Upstash Redis)
   UPSTASH_REDIS_REST_URL=https://seu-banco.upstash.io
   UPSTASH_REDIS_REST_TOKEN=seu_token_upstash_rest
   ```

   > ⚠️ **Atenção:** Nunca versionar arquivos `.env` nem expor a `SUPABASE_SERVICE_ROLE_KEY` no frontend ou em commits.

4. **Inicie o servidor de desenvolvimento**:
   ```bash
   npm run dev
   ```

5. **Acesse no navegador**:
   Abra [http://localhost:3000](http://localhost:3000).

---

## 📋 Comandos Disponíveis

| Comando | Finalidade |
| --- | --- |
| `npm run dev` | Inicia o servidor local de desenvolvimento (Turbopack / Next.js) |
| `npm run build` | Compila o projeto e gera a build de produção otimizada |
| `npm run start` | Executa o servidor Node.js com a build de produção |
| `npm run lint` | Executa o linter ESLint para validar boas práticas e sintaxe |
| `npm run test` | Roda a suíte de testes unitários e de componentes com Vitest |
| `npx tsc --noEmit` | Executa a checagem estática de tipos do TypeScript sem emitir arquivos |

---

## 🗄️ Estrutura do Banco de Dados

O banco de dados PostgreSQL do Supabase possui 5 tabelas principais protegidas por Row Level Security (RLS):

1. **`public.app_admins`**: Fonte única oficial de autorização administrativa (`email`, `created_at`).
2. **`public.chamados`**: Registro dos atendimentos de TI (`solicitante`, `local`, `categoria`, `descricao`, `status`, `resolucao`, `tempo_gasto`, `anexo_url`, `user_id`).
3. **`public.chamado_mensagens`**: Histórico do chat por chamado (`chamado_id`, `autor_id`, `autor_nome`, `autor_tipo`, `mensagem`, `created_at`).
4. **`public.chamado_chat_leituras`**: Controle de leitura por usuário e chamado (`chamado_id`, `user_id`, `last_read_at`).
5. **`public.chamado_avaliacoes`**: Avaliação de 1 a 5 estrelas e comentário enviada pelo solicitante após a conclusão.

> ⚠️ **Aviso sobre o arquivo SQL consolidado:**
> O arquivo [`supabase/maple_help_schema.sql`](./supabase/maple_help_schema.sql) contém a definição completa do banco para **criação de um ambiente novo do zero**. Não o execute cegamente sobre um banco já em operação para evitar conflitos de políticas ou erros em publicações Realtime (`already member of publication`). Para alterações futuras, utilize scripts de migração incrementais.

---

## 📁 Estrutura do Repositório

```text
├── app/                        # Next.js App Router (Páginas, Layouts e Server Actions)
│   ├── actions/                # Server Actions (chamados.ts, chamadoChat.ts)
│   ├── adm/                    # Painel administrativo e relatórios mensais
│   ├── chamado/                # Abertura de chamado e Meus Chamados
│   ├── menu/                   # Hub de navegação pós-login
│   ├── globals.css             # Design tokens e estilos globais
│   └── page.tsx                # Tela de Login / Cadastro / Recuperação
├── components/                 # Componentes React reutilizáveis
│   ├── chamado-chat/           # Componentes do Chat (ChamadoChat, Mensagem, Compositor, Badges)
│   ├── ui/                     # Primitivos de UI (Button, Input, SurfaceCard, etc.)
│   ├── ChamadoForm.tsx         # Formulário de abertura com upload
│   └── ChamadoModal.tsx        # Modal administrativo de atendimento
├── lib/                        # Utilitários, clientes de banco, gráficos e e-mails
├── types/                      # Definições de tipos TypeScript (database.ts)
├── supabase/                   # Esquema SQL do banco e testes automatizados de RLS
├── __tests__/                  # Testes unitários e de integração com Vitest
└── proxy.ts                    # Middleware de proteção de rotas e renovação de sessão
```

---

## 📚 Documentação Complementar

- 📖 [**DOCUMENTATION.md**](./DOCUMENTATION.md): Manual técnico e funcional exaustivo (regras de negócio, segurança, manutenção, diagnósticos, deploy e rollback).
- 🧠 [**CONTEXTO_AGENTE.md**](./CONTEXTO_AGENTE.md): Guia de contexto operacional e regras estritas para desenvolvedores e agentes de IA.
- 🗃️ [**Esquema SQL Consolidado**](./supabase/maple_help_schema.sql): Definição estrutural do banco de dados.
