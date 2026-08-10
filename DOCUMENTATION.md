# Documentação do Projeto: Maple Help

Sistema de Chamados e Suporte TI simples, moderno e responsivo.

## Visão Geral

O **Maple Help** permite que professores e colaboradores da escola abram solicitações de suporte de TI de forma rápida, com upload de anexos de imagem. A equipe de administração gerencia os chamados em tempo real através de um painel Kanban (`Pendente`, `Em Andamento`, `Concluído`) e gera relatórios estatísticos com exportação em planilha Excel (`.xlsx`).

---

## Estrutura do Sistema

- **Login (`/`)**: Autenticação via Supabase Auth.
- **Menu (`/menu`)**: Central principal de navegação do usuário.
- **Abrir Chamado (`/chamado`)**: Formulário para envio de solicitações de TI com upload de imagens.
- **Meus Chamados (`/chamado/meus-chamados`)**: Acompanhamento dos chamados abertos pelo usuário logado.
- **Painel Administrativo (`/adm`)**: Fila de chamados em tempo real (Kanban), com ações de assumir e finalizar chamados com notas de solução e tempo gasto.
- **Relatórios (`/adm/relatorios`)**: Filtro por mês/ano, gráficos estatísticos e exportação completa em Excel.

---

## Configuração de Ambiente

Crie um arquivo `.env.local` na raiz do projeto com as seguintes variáveis de ambiente:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://sua-instancia.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_chave_anonima

# Admins (separados por vírgula)
ADMIN_EMAILS=admin1@escola.com.br,admin2@escola.com.br

# Rate Limit (Opcional - Upstash Redis)
UPSTASH_REDIS_REST_URL=https://seu-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=seu_token_upstash
```

---

## Como Executar o Projeto

1. Instalar as dependências:
   ```bash
   npm install
   ```

2. Executar em modo de desenvolvimento:
   ```bash
   npm run dev
   ```

3. Validar tipagem TypeScript:
   ```bash
   npx tsc --noEmit
   ```

4. Executar os testes unitários:
   ```bash
   npm run test
   ```

5. Construir o bundle de produção:
   ```bash
   npm run build
   ```
